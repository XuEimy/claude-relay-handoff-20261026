import { WorkflowEntrypoint } from "cloudflare:workers";
import { base64url, hostinger, startWorkflow, storeFor } from "./utils.js";

export class ProvisionServer extends WorkflowEntrypoint {
  async run(event, step) {
    const id = event.payload.serverId, store = storeFor(this.env);
    const existing = await step.do("read server", () => store.getServer(id));
    const vmId = existing?.hostinger_vm_id && !existing.termination_requested && ["provisioning", "past_due"].includes(existing.status) ? existing.hostinger_vm_id : await step.do("purchase", { retries: { limit: 0, delay: "1 second", backoff: "constant" } }, async () => {
      const row = await store.beginPurchase(id);
      if (!row) return null;
      const setup = { template_id: Number(this.env.HOSTINGER_TEMPLATE_ID), data_center_id: row.data_center_id, public_key: { name: "kelaodeyun-" + id, key: row.public_key }, enable_backups: false, install_monarx: false };
      if (this.env.HOSTINGER_POST_INSTALL_SCRIPT_ID) setup.post_install_script_id = Number(this.env.HOSTINGER_POST_INSTALL_SCRIPT_ID);
      let response;
      try {
        response = await hostinger(this.env, "/api/vps/v1/virtual-machines", { method: "POST", body: { item_id: row.hostinger_item_id, setup } });
      } catch (error) {
        const message = error.status >= 400 && error.status < 500 && error.status !== 408 ? `Hostinger 拒绝购买（HTTP ${error.status}），未购买成功，可修正配置后重试` : "购买结果未知，请在 hPanel 核对";
        await store.attention(id, message, "provision");
        return null;
      }
      try {
        const { status, data } = response;
        if (status === 202) { await store.attention(id, "Hostinger 付款处理中，请在 hPanel 完成开通", "provision", data.subscription_id); return null; }
        if (!data.virtual_machine?.id) { await store.attention(id, "购买结果未知，请在 hPanel 核对", "provision"); return null; }
        const updated = await store.finishPurchase(id, data.virtual_machine.id, data.virtual_machine.subscription_id || data.order?.subscription_id);
        if (updated.termination_requested) {
          try { await startWorkflow(this.env.TEARDOWN, id, updated.recoverTeardown ? id + "-after-purchase" : id); }
          catch { await store.attention(id, "启动服务器清理失败", "teardown"); }
          return null;
        }
        return data.virtual_machine.id;
      } catch {
        await store.attention(id, "购买结果未知，请在 hPanel 核对", "provision");
        return null;
      }
    });
    if (!vmId) return;
    for (let i = 0; i < 60; i++) {
      let result;
      try {
        result = await step.do("poll-" + i, async () => {
          const row = await store.getServer(id);
          if (!row || row.termination_requested || !["provisioning", "past_due"].includes(row.status)) return "stop";
          const { data } = await hostinger(this.env, `/api/vps/v1/virtual-machines/${vmId}`);
          if (data.state === "error") { await store.attention(id, "服务器开通失败，请在 hPanel 核对", "provision"); return "stop"; }
          if (data.state === "running" && data.ipv4?.[0]?.address) { await store.activate(id, data.ipv4[0].address, data.hostname); return "stop"; }
          return "wait";
        });
      } catch {
        await step.do("poll failed", () => store.attention(id, "无法查询服务器状态，请在 hPanel 核对", "provision"));
        return;
      }
      if (result === "stop") return;
      await step.sleep("wait-" + i, "30 seconds");
    }
    await step.do("timeout", () => store.attention(id, "服务器开通超时，请在 hPanel 核对", "provision"));
  }
}

export class TeardownServer extends WorkflowEntrypoint {
  async run(event, step) {
    const id = event.payload.serverId, store = storeFor(this.env);
    let row = await step.do("read server", () => store.getServer(id));
    if (!row || row.status === "terminated") return;
    for (let i = 0; row.purchase_inflight && i < 60; i++) {
      await step.sleep("wait purchase " + i, "30 seconds");
      row = await step.do("read purchase " + i, () => store.getServer(id));
    }
    if (row.purchase_inflight || (row.failure_phase === "provision" && !row.hostinger_vm_id)) {
      await step.do("unknown purchase", () => store.attention(id, "购买结果未知，请在 hPanel 核对", "teardown"));
      return;
    }
    let vmState;
    if (row.hostinger_vm_id) {
      try {
        vmState = await step.do("read VM", async () => {
          try { return (await hostinger(this.env, `/api/vps/v1/virtual-machines/${row.hostinger_vm_id}`)).data?.state; }
          catch (error) { if (error.status === 404) return "destroyed"; throw error; }
        });
      } catch { await step.do("read VM failed", () => store.attention(id, "服务器清理失败：read VM", "teardown")); return; }
    }
    const gone = ["destroyed", "destroying"].includes(vmState);
    for (const [name, method, path, body] of [
      ["stop", "POST", row.hostinger_vm_id && !gone && vmState !== "stopped" && `/api/vps/v1/virtual-machines/${row.hostinger_vm_id}/stop`, null],
      ["recreate", "POST", row.hostinger_vm_id && !gone && `/api/vps/v1/virtual-machines/${row.hostinger_vm_id}/recreate`, "wipe"],
      ["disable auto-renewal", "DELETE", row.hostinger_subscription_id && `/api/billing/v1/subscriptions/${encodeURIComponent(row.hostinger_subscription_id)}/auto-renewal/disable`, null],
    ]) {
      if (!path) continue;
      try {
        const action = await step.do(name, async () => {
          const payload = body === "wipe" ? { template_id: Number(this.env.HOSTINGER_TEMPLATE_ID), password: "Aa1" + base64url(crypto.getRandomValues(new Uint8Array(16))).slice(0, 21) } : body;
          const { data } = await hostinger(this.env, path, { method, body: payload });
          return data;
        });
        if (row.hostinger_vm_id && name !== "disable auto-renewal") {
          if (!action?.id) throw Error("missing action");
          let state = action.state;
          for (let i = 0; state !== "success" && i < 60; i++) {
            if (state === "error") throw Error("action failed");
            await step.sleep(name + " wait " + i, "30 seconds");
            const result = await step.do(name + " status " + i, () => hostinger(this.env, `/api/vps/v1/virtual-machines/${row.hostinger_vm_id}/actions/${action.id}`));
            state = result.data.state;
          }
          if (state !== "success") throw Error("action timeout");
        }
      } catch { await step.do(name + " failed", () => store.attention(id, `服务器清理失败：${name}`, "teardown")); return; }
    }
    await step.do("terminated", () => store.terminate(id));
  }
}
