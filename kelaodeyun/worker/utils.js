import Stripe from "stripe";

export const now = () => new Date().toISOString();
export const fail = (status, message) => { throw Object.assign(Error(message), { status }); };
export const json = (data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export const randomHex = (size = 32) => Array.from(crypto.getRandomValues(new Uint8Array(size)), n => n.toString(16).padStart(2, "0")).join("");
export const base64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const sha256 = async text => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
export const shaHex = async text => Array.from(await sha256(text), n => n.toString(16).padStart(2, "0")).join("");
export const safeReturn = path => typeof path === "string" && /^\/(?![\/\\])/.test(path) && !/[\x00-\x1f\x7f\\]/.test(path) ? path : "/account";
export const cookie = (req, name) => req.headers.get("cookie")?.split(/;\s*/).find(x => x.startsWith(name + "="))?.slice(name.length + 1) || "";
export const makeCookie = (env, name, value, path, age) => `${name}=${value}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(env.PUBLIC_ORIGIN).protocol === "https:" ? "; Secure" : ""}`;
export const redirect = (location, cookies = []) => {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  cookies.forEach(value => headers.append("Set-Cookie", value));
  return new Response(null, { status: 302, headers });
};
export const storeFor = env => env.STORE.get(env.STORE.idFromName("main"));
export const stripeFor = env => {
  if (!env.STRIPE_SECRET_KEY) fail(503, "Stripe 尚未配置");
  return new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2026-09-30.endive", httpClient: Stripe.createFetchHttpClient() });
};
export const periodEnd = subscription => subscription?.current_period_end ?? subscription?.items?.data?.[0]?.current_period_end ?? null;
export const paidInvoiceEnd = invoice => {
  if (invoice?.status !== "paid") return null;
  const ends = (invoice.lines?.data || []).filter(line => {
    const detail = line.parent?.subscription_item_details;
    return (line.type === "subscription" || line.parent?.type === "subscription_item_details") && !line.proration && !detail?.proration;
  }).map(line => line.period?.end).filter(end => Number.isSafeInteger(end) && end > 0);
  return ends.length ? Math.max(...ends) : null;
};
export const validText = (value, max) => typeof value === "string" && value.trim().length > 0 && value.length <= max;

async function credentialsKey(env) {
  try {
    if (typeof env.CREDENTIALS_KEY !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(env.CREDENTIALS_KEY)) throw Error();
    const raw = atob(env.CREDENTIALS_KEY);
    if (raw.length !== 32 || btoa(raw) !== env.CREDENTIALS_KEY) throw Error();
    return await crypto.subtle.importKey("raw", Uint8Array.from(raw, c => c.charCodeAt(0)), "AES-GCM", false, ["encrypt", "decrypt"]);
  } catch { throw Error("凭据加密密钥尚未配置"); }
}
export async function encryptText(env, text) {
  const key = await credentialsKey(env), iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text)));
  const bytes = new Uint8Array(iv.length + encrypted.length);
  bytes.set(iv); bytes.set(encrypted, iv.length);
  return btoa(String.fromCharCode(...bytes));
}
export async function decryptText(env, value) {
  const key = await credentialsKey(env), bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, key, bytes.slice(12));
  return new TextDecoder().decode(decrypted);
}

export async function startWorkflow(binding, id, instanceId = id) {
  try {
    await binding.create({ id: instanceId, params: { serverId: id } });
  } catch (error) {
    try { await (await binding.get(instanceId)).status(); } catch { throw error; }
  }
}
