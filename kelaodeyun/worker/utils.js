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
export const hostingerSimulated = env => env.HOSTINGER_MODE !== "live" || /^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY || "");
export const stripeFor = env => {
  if (!env.STRIPE_SECRET_KEY) fail(503, "Stripe 尚未配置");
  return new Stripe(env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
};
export const periodEnd = subscription => subscription?.current_period_end ?? subscription?.items?.data?.[0]?.current_period_end ?? null;
export const validText = (value, max) => typeof value === "string" && value.trim().length > 0 && value.length <= max;

export function validPublicKey(value) {
  if (typeof value !== "string" || new TextEncoder().encode(value).length > 8192 || /[\r\n]/.test(value)) return false;
  const parts = value.trim().match(/^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(?:256|384|521))[ \t]+([A-Za-z0-9+/]+={0,2})(?:[ \t]+[^\r\n]*)?$/);
  if (!parts || parts[2].length % 4 === 1) return false;
  try {
    const blob = atob(parts[2]);
    if (btoa(blob).replace(/=+$/, "") !== parts[2].replace(/=+$/, "") || blob.length < 5) return false;
    const n = blob.charCodeAt(0) * 0x1000000 + (blob.charCodeAt(1) << 16) + (blob.charCodeAt(2) << 8) + blob.charCodeAt(3);
    return n > 0 && n <= blob.length - 4 && blob.slice(4, 4 + n) === parts[1];
  } catch { return false; }
}

export async function hostinger(env, path, options = {}) {
  if (!env.HOSTINGER_API_TOKEN) throw Error("Hostinger 尚未配置");
  if (!options.reserved) {
    const store = storeFor(env);
    let delay;
    while ((delay = await store.reserveHostinger()) > 0) await new Promise(resolve => setTimeout(resolve, delay));
  }
  const response = await fetch("https://developers.hostinger.com" + path, {
    method: options.method || "GET",
    headers: { Authorization: `Bearer ${env.HOSTINGER_API_TOKEN}`, ...(options.body ? { "Content-Type": "application/json" } : {}) },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  if (!response.ok) throw Object.assign(Error(`Hostinger 请求失败 (${response.status})`), { status: response.status });
  try { return { status: response.status, data: response.status === 204 ? null : await response.json() }; }
  catch { throw Object.assign(Error("Hostinger 响应格式无效"), { status: response.status }); }
}

export async function startWorkflow(binding, id, instanceId = id) {
  try {
    await binding.create({ id: instanceId, params: { serverId: id } });
  } catch (error) {
    try { await (await binding.get(instanceId)).status(); } catch { throw error; }
  }
}
