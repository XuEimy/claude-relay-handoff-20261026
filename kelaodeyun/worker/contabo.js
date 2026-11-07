import { storeFor } from "./utils.js";

export const contaboSimulated = env => env.CONTABO_MODE !== "live" || /^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY || "");

export function generateRootPassword() {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ", lower = "abcdefghijklmnopqrstuvwxyz", digits = "0123456789", special = "!@#$^&*?_~", alnum = upper + lower + digits;
  const randomIndex = max => {
    const values = new Uint32Array(1), limit = 0x100000000 - (0x100000000 % max);
    do { crypto.getRandomValues(values); } while (values[0] >= limit);
    return values[0] % max;
  };
  const pick = chars => chars[randomIndex(chars.length)];
  const password = [pick(upper), pick(lower), ...Array.from({ length: 3 }, () => pick(digits)), ...Array.from({ length: 2 }, () => pick(special)), ...Array.from({ length: 13 }, () => pick(alnum))];
  for (let i = password.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [password[i], password[j]] = [password[j], password[i]];
  }
  return password.join("");
}

export const CATALOG = [
  { id: "V153", name: "Cloud VPS 4", cpu: 4, ramGb: 8, diskGb: 100 },
  { id: "V154", name: "Cloud VPS 6", cpu: 6, ramGb: 12, diskGb: 200 },
  { id: "V155", name: "Cloud VPS 8", cpu: 8, ramGb: 24, diskGb: 300 },
  { id: "V156", name: "Cloud VPS 12", cpu: 12, ramGb: 48, diskGb: 400 },
  { id: "V157", name: "Cloud VPS 16", cpu: 16, ramGb: 64, diskGb: 500 },
  { id: "V158", name: "Cloud VPS 18", cpu: 18, ramGb: 96, diskGb: 600 },
];
export const PERIODS = [1, 12, 24];

export const REGIONS = [
  { id: "EU", city: "Nuremberg", location: "de", continent: "Europe" },
  { id: "UK", city: "Portsmouth", location: "gb", continent: "Europe" },
  { id: "US-central", city: "St. Louis", location: "us", continent: "North America" },
  { id: "US-east", city: "New York", location: "us", continent: "North America" },
  { id: "US-west", city: "Seattle", location: "us", continent: "North America" },
  { id: "SIN", city: "Singapore", location: "sg", continent: "Asia" },
  { id: "JPN", city: "Tokyo", location: "jp", continent: "Asia" },
  { id: "IND", city: "Mumbai", location: "in", continent: "Asia" },
  { id: "AUS", city: "Sydney", location: "au", continent: "Oceania" },
];

let cachedToken;
async function accessToken(env) {
  const credentials = [env.CONTABO_CLIENT_ID, env.CONTABO_CLIENT_SECRET, env.CONTABO_API_USER, env.CONTABO_API_PASSWORD];
  if (credentials.some(value => !value)) throw Error("Contabo 尚未配置");
  if (cachedToken?.expires > Date.now() && credentials.every((value, i) => cachedToken.credentials[i] === value)) return cachedToken.value;
  let response;
  try {
    response = await fetch("https://auth.contabo.com/auth/realms/contabo/protocol/openid-connect/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: credentials[0], client_secret: credentials[1], username: credentials[2], password: credentials[3], grant_type: "password" }),
    });
  } catch { throw Error("Contabo 认证失败"); }
  if (!response.ok) throw Object.assign(Error("Contabo 认证失败"), { status: response.status });
  let data;
  try { data = await response.json(); } catch { throw Object.assign(Error("Contabo 认证失败"), { status: response.status }); }
  if (typeof data.access_token !== "string" || !data.access_token || !Number.isFinite(data.expires_in)) throw Object.assign(Error("Contabo 认证失败"), { status: response.status });
  cachedToken = { credentials, value: data.access_token, expires: Date.now() + Math.max(0, data.expires_in - 60) * 1000 };
  return cachedToken.value;
}

export async function contabo(env, path, options = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await accessToken(env);
    if (!options.reserved || attempt) {
      const reserve = options.reserve || (() => storeFor(env).reserveProvider());
      let delay;
      while ((delay = await reserve()) > 0) await new Promise(resolve => setTimeout(resolve, delay));
    }
    const response = await fetch("https://api.contabo.com" + path, {
      method: options.method || "GET",
      headers: { Authorization: `Bearer ${token}`, "x-request-id": crypto.randomUUID(), ...(options.body !== undefined && options.body !== null ? { "Content-Type": "application/json" } : {}) },
      ...(options.body !== undefined && options.body !== null ? { body: JSON.stringify(options.body) } : {}),
    });
    if (response.status === 401 && attempt === 0) {
      if (cachedToken?.value === token) cachedToken = undefined;
      continue;
    }
    if (!response.ok) throw Object.assign(Error(`Contabo 请求失败 (${response.status})`), { status: response.status });
    try { return { status: response.status, data: response.status === 204 ? null : await response.json() }; }
    catch { throw Object.assign(Error("Contabo 响应格式无效"), { status: response.status }); }
  }
}

export async function contaboProducts(env, reserve) {
  const ids = new Set(CATALOG.map(item => item.id)), products = [];
  let page = 1, totalPages;
  do {
    const { data } = await contabo(env, `/v1/products?size=200&page=${page}`, { reserve });
    totalPages = data?._pagination?.totalPages;
    if (!Array.isArray(data?.data) || !Number.isSafeInteger(totalPages) || totalPages < 1) throw Error("Contabo 产品目录格式无效");
    products.push(...data.data.filter(item => ids.has(item?.priceItem?.itemId)));
    page++;
  } while (page <= totalPages);
  // The API's setupFees conflates setup and period discounts. The storefront
  // exposes them separately, keyed by the same product key.
  for (const product of products) {
    if (product.priceItem.outOfStock?.isOutOfStock) continue;
    const key = product.priceItem.key;
    if (typeof key !== "string" || !key) throw Error("Contabo 产品标识缺失");
    const response = await fetch(`https://contabo.com/en-us/catalog/product?preview=false&productId=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error("Contabo 周期价格读取失败");
    const pricing = await response.json();
    if (pricing?.sys?.id !== key || !Array.isArray(pricing.periods)) throw Error("Contabo 周期价格格式无效");
    product.termPricing = pricing;
  }
  return products;
}
