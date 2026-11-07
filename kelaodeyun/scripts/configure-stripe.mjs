// Reads secrets locally; never print API responses or credentials.
import Stripe from "stripe";
import { readFile, writeFile, rename, chmod } from "node:fs/promises";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const envPath = new URL("../.dev.vars", import.meta.url);
const origin = "https://kelaodeyun.com";
const project = "kelaodeyun";
const apiVersion = "2026-09-30.endive";
const events = [
  "checkout.session.completed", "checkout.session.expired",
  "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed",
  "customer.subscription.updated", "customer.subscription.deleted",
  "invoice.paid", "invoice.payment_failed", "invoice.payment_action_required",
];
const apply = process.argv.includes("--apply"), upload = process.argv.includes("--upload");
async function main() {
  let text = await readFile(envPath, "utf8").catch(error => { if (error.code === "ENOENT") return ""; throw error; });
  const local = parseEnv(text);
  const key = local.STRIPE_SECRET_KEY;
  if (!/^(sk|rk)_(test|live)_/.test(key || "")) throw new Error("请在 .dev.vars 填写有效的 STRIPE_SECRET_KEY");
  if (upload && !apply) throw new Error("--upload 需要同时使用 --apply");
  const stripe = new Stripe(key, { apiVersion, timeout: 20000, maxNetworkRetries: 2 });
  const account = await stripe.accounts.retrieve();
  const mode = /^(sk|rk)_test_/.test(key) ? "test" : "live";
  const webhookUrl = origin + "/api/stripe/webhook";
  const hooks = await stripe.webhookEndpoints.list({ limit: 100 }).autoPagingToArray({ limit: 1000 });
  const matching = hooks.filter(h => h.url === webhookUrl);
  if (matching.length > 1) throw new Error("发现多个本站 Webhook，请先在 Stripe 核对重复端点");
  const configurations = await stripe.billingPortal.configurations.list({ limit: 100 }).autoPagingToArray({ limit: 1000 });
  const portals = configurations.filter(c => c.metadata?.project === project);
  if (portals.length > 1) throw new Error("发现多个本站 Portal 配置，请先核对");
  console.log(JSON.stringify({
    accountId: account.id, mode, chargesEnabled: account.charges_enabled,
    webhookUrl, events, existingWebhook: matching[0]?.id || null, existingPortal: portals[0]?.id || null,
    action: apply ? "apply" : "preview; use --apply to configure, --apply --upload to also upload Worker secrets",
  }, null, 2));
  if (!apply) return;
  const save = async values => {
    for (const [name, value] of Object.entries(values)) {
      const line = `${name}=${value}`;
      const pattern = new RegExp(`^${name}=.*$`, "m");
      text = pattern.test(text) ? text.replace(pattern, () => line) : text.trimEnd() + "\n" + line + "\n";
      local[name] = value;
    }
    const temp = new URL("../.dev.vars.stripe-tmp", import.meta.url);
    await writeFile(temp, text, { mode: 0o600 });
    await chmod(temp, 0o600);
    await rename(temp, envPath);
  };
  const stableKey = kind => createHash("sha256").update(`${project}:${account.id}:${mode}:${origin}:${kind}:v1`).digest("hex");
  let hook = matching[0];
  if (hook) {
    if (!local.STRIPE_WEBHOOK_SECRET) throw new Error("本站 Webhook 已存在；请从 Stripe 填入其 STRIPE_WEBHOOK_SECRET，系统不会删除重建");
    if (hook.api_version !== apiVersion) throw new Error("已有 Webhook 的 API 版本不匹配，请在 Stripe 升级为 " + apiVersion);
    hook = await stripe.webhookEndpoints.update(hook.id, { enabled_events: events, disabled: false });
  } else {
    hook = await stripe.webhookEndpoints.create({
      url: webhookUrl, api_version: apiVersion, enabled_events: events,
      description: "kelaodeyun VPS subscription events", metadata: { project },
    }, { idempotencyKey: stableKey("webhook") });
    if (!hook.secret) throw new Error("Webhook 已创建但未取得签名密钥，请在 Stripe 核对");
    await save({ STRIPE_WEBHOOK_SECRET: hook.secret });
  }
  // Cancellation lives in the site so the Contabo intent is persisted first.
  const portalSettings = {
    default_return_url: origin + "/account",
    business_profile: { headline: "管理服务器付款与账单", privacy_policy_url: origin + "/privacy", terms_of_service_url: origin + "/terms" },
    features: {
      invoice_history: { enabled: true }, payment_method_update: { enabled: true },
      customer_update: { enabled: false },
      subscription_update: { enabled: false },
      subscription_cancel: { enabled: false },
    },
    metadata: { project },
  };
  const portal = portals[0]
    ? await stripe.billingPortal.configurations.update(portals[0].id, { ...portalSettings, active: true })
    : await stripe.billingPortal.configurations.create(portalSettings, { idempotencyKey: stableKey("portal") });
  await save({ STRIPE_PORTAL_CONFIGURATION_ID: portal.id });
  const verifiedHook = await stripe.webhookEndpoints.retrieve(hook.id);
  const verifiedPortal = await stripe.billingPortal.configurations.retrieve(portal.id);
  if (verifiedHook.status !== "enabled" || !events.every(e => verifiedHook.enabled_events.includes(e)) || !verifiedPortal.active || !verifiedPortal.features.payment_method_update.enabled) throw new Error("Stripe 配置回读未通过");
  if (upload) {
    const result = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["wrangler", "secret", "bulk"], {
      cwd: new URL("..", import.meta.url),
      input: JSON.stringify({ STRIPE_SECRET_KEY: key, STRIPE_WEBHOOK_SECRET: local.STRIPE_WEBHOOK_SECRET, STRIPE_PORTAL_CONFIGURATION_ID: portal.id }),
      encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
    });
    if (result.status !== 0) throw new Error("Stripe 已配置，但 Worker 密钥上传失败；修复 Wrangler 登录后用相同命令重试");
  }
  console.log(JSON.stringify({ configured: true, accountId: account.id, mode, webhookId: hook.id, portalId: portal.id, workerSecretsUploaded: upload }));
}
main().catch(error => {
  console.error(error.type ? `Stripe 配置失败：${error.type} ${error.code || ""}` : error.message);
  process.exitCode = 1;
});
