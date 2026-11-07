import { WorkflowEntrypoint } from "cloudflare:workers";
import { contabo, contaboSimulated, generateRootPassword } from "./contabo.js";
import { decryptText, encryptText, startWorkflow, storeFor } from "./utils.js";

export class ProvisionServer extends WorkflowEntrypoint {
  async run(event, step) {
    const id = event.payload.serverId, store = storeFor(this.env);
    const existing = await step.do("read server", () => store.getServer(id));
    if (existing && !/^(V\d+)-(\d+)m$/.test(existing.provider_product_id)) {
      await step.do("legacy provider", () => store.attention(id, "旧服务商服务器需人工处理，不能使用 Contabo 操作", existing.termination_requested ? "teardown" : "provision"));
      return;
    }
    let vmId = existing?.provider_instance_id && !existing.termination_requested && ["provisioning", "past_due"].includes(existing.status) ? existing.provider_instance_id : null;
    if (!vmId && existing && !existing.termination_requested && (existing.purchase_inflight || existing.status === "purchasing")) {
      await step.do("recover purchase", () => store.beginPurchase(id));
      return;
    }
    if (!vmId && existing && !existing.termination_requested && ["provisioning", "past_due"].includes(existing.status)) {
      let credential;
      try {
        credential = await step.do("root password", async () => {
          const row = await store.beginSecret(id);
          if (!row) return null;
          try {
            const encrypted = row.root_password_enc || await store.setRootPassword(id, await encryptText(this.env, generateRootPassword()));
            if (!encrypted) { await store.failSecret(id); return null; }
            const password = await decryptText(this.env, encrypted);
            let secret = row.provider_secret_id;
            if (!contaboSimulated(this.env) && !secret) {
              const { data } = await contabo(this.env, "/v1/secrets", { method: "POST", body: { name: "kelaodeyun-" + id, value: password, type: "password" } });
              secret = data?.data?.[0]?.secretId;
              if (!Number.isSafeInteger(secret) || secret <= 0) throw Error("missing secret");
            }
            const updated = await store.setSecret(id, secret || null);
            if (updated.termination_requested && updated.status === "needs_attention") await startWorkflow(this.env.TEARDOWN, id, id + "-after-secret");
            return { secretId: secret || null };
          } catch (error) {
            await store.failSecret(id);
            throw error;
          }
        });
        if (!credential) return;
      } catch (error) {
        const message = error.message === "凭据加密密钥尚未配置" ? error.message : "创建密码失败，请在 Contabo 控制台核对";
        await step.do("root password failed", () => store.attention(id, message, "provision"));
        return;
      }
      vmId = await step.do("purchase", { retries: { limit: 0, delay: "1 second", backoff: "constant" } }, async () => {
        const row = await store.beginPurchase(id);
        if (!row) return null;
        let instanceId;
        try {
          if (contaboSimulated(this.env)) instanceId = -Date.now();
          else {
            const match = row.provider_product_id.match(/^(V\d+)-(\d+)m$/);
            if (!match) throw Error("invalid product");
            const { data } = await contabo(this.env, "/v1/compute/instances", { method: "POST", body: { imageId: this.env.CONTABO_IMAGE_ID, productId: match[1], region: row.region, rootPassword: credential.secretId, period: Number(match[2]), displayName: "kelaodeyun-" + id.slice(0, 8), defaultUser: "root" } });
            instanceId = data?.data?.[0]?.instanceId;
            if (!Number.isSafeInteger(instanceId) || instanceId <= 0) throw Error("missing instance");
          }
        } catch (error) {
          const message = error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status) ? `Contabo 拒绝购买（HTTP ${error.status}），未购买成功，可修正配置后重试` : "购买结果未知，请在 Contabo 控制台核对";
          await store.attention(id, message, "provision");
          return null;
        }
        try {
          const updated = await store.finishPurchase(id, instanceId);
          if (updated.termination_requested) {
            try { await startWorkflow(this.env.TEARDOWN, id, updated.recoverTeardown ? id + "-after-purchase" : id); }
            catch { await store.attention(id, "启动服务器清理失败", "teardown"); }
            return null;
          }
          return instanceId;
        } catch {
          await store.attention(id, "购买结果未知，请在 Contabo 控制台核对", "provision");
          return null;
        }
      });
    }
    if (!vmId) return;
    if (vmId < 0) {
      await step.sleep("simulate wait", "20 seconds");
      await step.do("activate simulated", () => store.activate(id, "203.0.113.10", "simulated.kelaodeyun.invalid"));
      return;
    }
    for (let i = 0; i < 60; i++) {
      let result;
      try {
        result = await step.do("poll-" + i, async () => {
          const row = await store.getServer(id);
          if (!row || row.termination_requested || !["provisioning", "past_due"].includes(row.status)) return "stop";
          const { data } = await contabo(this.env, `/v1/compute/instances/${vmId}`);
          const instance = data?.data?.[0];
          if (["error", "product_not_available"].includes(instance?.status)) { await store.attention(id, "服务器开通失败，请在 Contabo 控制台核对", "provision"); return "stop"; }
          if (["verification_required", "pending_payment"].includes(instance?.status)) { await store.attention(id, "Contabo 账户需要验证或付款，请在 Contabo 控制台处理", "provision"); return "stop"; }
          if (instance?.status === "running" && instance.ipConfig?.v4?.ip) { await store.activate(id, instance.ipConfig.v4.ip, instance.name || instance.displayName); return "stop"; }
          return "wait";
        });
      } catch {
        await step.do("poll failed", () => store.attention(id, "无法查询服务器状态，请在 Contabo 控制台核对", "provision"));
        return;
      }
      if (result === "stop") return;
      await step.sleep("wait-" + i, "30 seconds");
    }
    await step.do("timeout", () => store.attention(id, "服务器开通超时，请在 Contabo 控制台核对", "provision"));
  }
}

export class TeardownServer extends WorkflowEntrypoint {
  async run(event, step) {
    const id = event.payload.serverId, store = storeFor(this.env);
    let row = await step.do("read server", () => store.getServer(id));
    if (!row || row.status === "terminated") return;
    if (!/^(V\d+)-(\d+)m$/.test(row.provider_product_id)) {
      await step.do("legacy provider", () => store.attention(id, "旧服务商服务器需人工处理，不能使用 Contabo 操作", "teardown"));
      return;
    }
    for (let i = 0; (row.purchase_inflight || row.secret_inflight) && i < 60; i++) {
      await step.sleep("wait purchase " + i, "30 seconds");
      row = await step.do("read purchase " + i, () => store.getServer(id));
    }
    if (row.secret_inflight) {
      await step.do("unknown secret", () => store.attention(id, "服务器清理失败：root password", "teardown"));
      return;
    }
    if (!row.purchase_inflight && (contaboSimulated(this.env) || row.provider_instance_id < 0)) {
      await step.do("terminated", () => store.terminate(id));
      return;
    }
    if (row.purchase_inflight || (row.failure_phase === "provision" && !row.provider_instance_id)) {
      await step.do("unknown purchase", () => store.attention(id, "购买结果未知，请在 Contabo 控制台核对", "teardown"));
      return;
    }
    let instance = null, gone = !row.provider_instance_id;
    const path = `/v1/compute/instances/${row.provider_instance_id}`;
    if (!gone) {
      try {
        instance = await step.do("read VM", async () => {
          try {
            const { data } = await contabo(this.env, path);
            if (!data?.data?.[0]) throw Error("missing instance");
            return data.data[0];
          } catch (error) { if (error.status === 404) return null; throw error; }
        });
        gone = !instance;
      } catch { await step.do("read VM failed", () => store.attention(id, "服务器清理失败：read VM", "teardown")); return; }
    }
    if (!gone) {
      try {
        await step.do("reinstall", () => contabo(this.env, path, { method: "PUT", body: { imageId: this.env.CONTABO_IMAGE_ID, defaultUser: "root" } }));
        let ready = false;
        for (let i = 0; i < 60; i++) {
          await step.sleep("reinstall wait " + i, "30 seconds");
          const state = await step.do("reinstall status " + i, async () => (await contabo(this.env, path)).data?.data?.[0]?.status);
          if (state === "error") throw Error("reinstall failed");
          if (["running", "stopped"].includes(state)) { ready = true; break; }
        }
        if (!ready) throw Error("reinstall timeout");
      } catch { await step.do("reinstall failed", () => store.attention(id, "服务器清理失败：reinstall", "teardown")); return; }
      if (!instance.cancelDate) {
        try { await step.do("cancel", () => contabo(this.env, path + "/cancel", { method: "POST", body: {} })); }
        catch { await step.do("cancel failed", () => store.attention(id, "服务器清理失败：cancel", "teardown")); return; }
      }
    }
    if (row.provider_secret_id) {
      try {
        await step.do("delete secret", async () => {
          try { await contabo(this.env, `/v1/secrets/${row.provider_secret_id}`, { method: "DELETE" }); }
          catch (error) { if (error.status !== 404) throw error; }
        });
      } catch { await step.do("delete secret failed", () => store.attention(id, "服务器清理失败：delete secret", "teardown")); return; }
    }
    await step.do("terminated", () => store.terminate(id));
  }
}
