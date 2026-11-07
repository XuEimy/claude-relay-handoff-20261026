import { env } from "cloudflare:workers";
import { abortAllDurableObjects, runInDurableObject, reset, introspectWorkflowInstance } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../worker/index.js";
import { ProvisionServer, TeardownServer } from "../worker/workflows.js";
import { contabo, generateRootPassword } from "../worker/contabo.js";
import { base64url, sha256, encryptText, decryptText } from "../worker/utils.js";
import productsFixture from "./fixtures/contabo-products.json";
import termsFixture from "./fixtures/contabo-terms.json";

const origin = "http://localhost:8787";
const stub = () => env.STORE.get(env.STORE.idFromName("main"));
const request = (path, options = {}) => worker.fetch(new Request(origin + path, { redirect: "manual", ...options }), env);
const post = (body = {}, session = "") => ({ method: "POST", headers: { Origin: origin, "Content-Type": "application/json", ...(session ? { Cookie: session } : {}) }, body: JSON.stringify(body) });
const token = payload => "header." + btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(payload)))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_") + ".signature";
const googlePayload = overrides => ({ iss: "https://accounts.google.com", aud: "test-client", exp: Math.floor(Date.now() / 1000) + 3600, sub: "same-subject", email: "first@example.com", email_verified: true, name: "First", ...overrides });
const getSession = response => response.headers.get("set-cookie")?.match(/kelaode_session=[a-f0-9]+/)?.[0];
async function login(payload = googlePayload(), returnPath = "/account") {
  const start = await request("/api/auth/google/start?return=" + encodeURIComponent(returnPath));
  const state = new URL(start.headers.get("location")).searchParams.get("state");
  const cookie = start.headers.get("set-cookie").split(";")[0];
  vi.stubGlobal("fetch", vi.fn(async url => {
    if (String(url) === "https://oauth2.googleapis.com/token") return Response.json({ id_token: token(payload) });
    throw Error("unexpected outbound request: " + url);
  }));
  return request(`/api/auth/google/callback?state=${state}&code=good`, { headers: { Cookie: cookie } });
}
async function signedEvent(event) {
  const body = JSON.stringify(event), timestamp = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("whsec_test"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`)));
  const signature = Array.from(bytes, x => x.toString(16).padStart(2, "0")).join("");
  return request("/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": `t=${timestamp},v1=${signature}` }, body });
}
const responseJson = (data, status = 200) => Response.json(data, { status });
const monthPrice = "V154-1m", yearPrice = "V154-12m";
const workflowStep = () => ({
  do: async (_name, ...args) => args.at(-1)(),
  sleep: vi.fn(async () => {}),
});
const instanceResponse = (status = "running", extra = {}) => responseJson({ data: [{ instanceId: 42, status, ipConfig: { v4: { ip: "192.0.2.1" } }, ...extra }] });
const subscriptionFixture = overrides => ({
  id: "sub_1", customer: "cus_1", status: "active", current_period_end: 2000000000, cancel_at_period_end: false,
  latest_invoice: { id: "in_paid", status: "paid", lines: { data: [{ parent: { type: "subscription_item_details", subscription_item_details: { proration: false } }, period: { end: 2000000000 } }] } },
  ...overrides,
});
function mockContabo(handler) {
  const fetcher = vi.fn(async (url, options = {}) => {
    const address = String(url);
    if (address.startsWith("https://api.stripe.com/v1/subscriptions/sub_1")) return responseJson(subscriptionFixture());
    if (address.startsWith("https://auth.contabo.com/")) return responseJson({ access_token: "test-access", expires_in: 3600 });
    if (!address.startsWith("https://api.contabo.com/")) throw Error("unexpected outbound request: " + address);
    return handler(new URL(address).pathname, options);
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
function mockCommerce({ product = "existing", products = productsFixture, terms = termsFixture, failPage = 0, couponConflict = false, subscription = subscriptionFixture(), provider } = {}) {
  let checkoutBody, productBody, couponBody, retrieves = 0, couponRetrieves = 0;
  const fetcher = vi.fn(async (url, options = {}) => {
    const address = String(url);
    if (address.startsWith("https://auth.contabo.com/")) return responseJson({ access_token: "test-access", expires_in: 3600 });
    if (address.startsWith("https://api.contabo.com/v1/compute/") && provider) return provider(new URL(address).pathname, options);
    if (address.startsWith("https://api.contabo.com/v1/products?")) {
      const query = new URL(address).searchParams, page = Number(query.get("page"));
      expect(query.get("size")).toBe("200");
      if (page === failPage) return responseJson({ error: "provider error" }, 500);
      const midpoint = Math.ceil(products.length / 2);
      return responseJson({ _pagination: { page, totalPages: 2 }, data: page === 1 ? products.slice(0, midpoint) : products.slice(midpoint) });
    }
    if (address.startsWith("https://contabo.com/en-us/catalog/product?")) {
      const key = new URL(address).searchParams.get("productId");
      const id = products.find(p => p.priceItem.key === key)?.priceItem.itemId;
      return terms?.[id] ? responseJson(terms[id]) : responseJson({}, 503);
    }
    if (address.startsWith("https://api.stripe.com/v1/coupons/")) {
      couponRetrieves++;
      if (couponRetrieves === 1) return responseJson({ error: { type: "invalid_request_error", code: "resource_missing" } }, 404);
      return responseJson({ id: address.split("/").at(-1) });
    }
    if (address === "https://api.stripe.com/v1/coupons" && options.method === "POST") {
      couponBody = String(options.body);
      if (couponConflict) return responseJson({ error: { type: "invalid_request_error", code: "resource_already_exists" } }, 409);
      return responseJson({ id: new URLSearchParams(couponBody).get("id") });
    }
    if (/^https:\/\/api\.stripe\.com\/v1\/products\/kld_V\d+$/.test(address)) {
      retrieves++;
      if ((product === "missing" || product === "conflict") && retrieves === 1) return responseJson({ error: { type: "invalid_request_error", code: "resource_missing", message: "No such product" } }, 404);
      return responseJson({ id: address.split("/").at(-1) });
    }
    if (address.endsWith("/v1/products") && options.method === "POST") {
      productBody = String(options.body);
      if (product === "conflict") return responseJson({ error: { type: "invalid_request_error", code: "resource_already_exists", message: "Product exists" } }, 400);
      return responseJson({ id: "kld_V154" });
    }
    if (address.endsWith("/v1/customers")) return responseJson({ id: "cus_1" });
    if (address.endsWith("/v1/checkout/sessions")) { checkoutBody = String(options.body); return responseJson({ id: "cs_1", url: "https://checkout.stripe.test" }); }
    if (address.startsWith("https://api.stripe.com/v1/subscriptions/sub_1")) {
      if (options.method === "DELETE") subscription.status = "canceled";
      if (options.method === "POST") subscription.cancel_at_period_end = new URLSearchParams(String(options.body)).get("cancel_at_period_end") === "true";
      return responseJson(subscription);
    }
    throw Error("unexpected outbound request: " + address);
  });
  vi.stubGlobal("fetch", fetcher);
  return { fetcher, checkoutBody: () => checkoutBody, productBody: () => productBody, couponBody: () => couponBody, retrieves: () => retrieves };
}
async function createdServer() {
  const response = await login();
  const session = getSession(response);
  const mocks = mockCommerce();
  const checkout = await request("/api/checkout", post({ priceId: monthPrice, dataCenterId: "SIN" }, session));
  const rows = await runInDurableObject(stub(), instance => instance.all("SELECT * FROM servers"));
  return { session, mocks, checkout, server: rows[0] };
}
async function trackProvision() {
  let starts = 0, original;
  await runInDurableObject(stub(), instance => {
    original = instance.env.PROVISION;
    instance.env.PROVISION = {
      create: (...args) => { starts++; return original.create(...args); },
      get: (...args) => original.get(...args),
    };
  });
  return {
    count: () => starts,
    restore: () => runInDurableObject(stub(), instance => { instance.env.PROVISION = original; }),
  };
}
beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal("fetch", vi.fn(async () => { throw Error("unexpected outbound request"); }));
});
afterEach(async () => { vi.unstubAllGlobals(); await reset(); });

describe("App account and SSH hosts", () => {
  const verifier = "a".repeat(43);
  const bearer = token => ({ Authorization: `Bearer ${token}` });
  const appPost = (body, token) => ({ method: "POST", headers: { "Content-Type": "application/json", ...bearer(token) }, body: JSON.stringify(body) });
  const appDelete = token => ({ method: "DELETE", headers: { "Content-Type": "application/json", ...bearer(token) }, body: "{}" });
  async function authorize(session) {
    const challenge = base64url(await sha256(verifier));
    const path = `/api/app/authorize?challenge=${challenge}&scheme=kelaodeyun-dev`;
    const response = await request(path, session ? { headers: { Cookie: session } } : {});
    return { response, path };
  }
  async function appLogin(session) {
    const { response } = await authorize(session);
    const html = await response.text();
    const code = html.match(/code=([a-f0-9]{64})/)[1];
    const result = await request("/api/app/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, verifier, device: "test" }) });
    expect(result.status).toBe(200);
    return (await result.json()).token;
  }
  it("routes non-API requests with Authorization to static assets", async () => {
    const assets = { fetch: vi.fn(async () => new Response("asset")) };
    const response = await worker.fetch(new Request(origin + "/some-page", { headers: bearer("a".repeat(64)) }), { ASSETS: assets });
    expect(await response.text()).toBe("asset");
    expect(assets.fetch).toHaveBeenCalledOnce();
  });
  it("redirects to Google with the exact authorization return and exchanges PKCE only once", async () => {
    const { response, path } = await authorize();
    expect(response.status).toBe(302);
    expect(new URL(response.headers.get("location"), origin).searchParams.get("return")).toBe(path);
    const session = getSession(await login());
    const page = await authorize(session);
    const html = await page.response.text(), code = html.match(/code=([a-f0-9]{64})/)[1];
    expect(page.response.headers.get("cache-control")).toBe("no-store");
    expect(html).toContain("kelaodeyun-dev://app/account/callback");
    expect(html).toContain("已登录，正在返回 Agent Cloud OS…");
    expect(html).toContain("返回 Agent Cloud OS");
    const tokenRequest = value => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, verifier: value, device: "test" }) });
    expect((await request("/api/app/token", tokenRequest("b".repeat(43)))).status).toBe(400);
    expect((await request("/api/app/token", tokenRequest(verifier))).status).toBe(400);
    const token = await appLogin(session);
    expect((await (await request("/api/app/me", { headers: bearer(token) })).json()).user.email).toBe("first@example.com");
    expect((await request("/api/config", { headers: { ...bearer(token), Cookie: session } })).status).toBe(403);
    expect((await request("/api/app/me", { headers: { Authorization: "Bearer BAD", Cookie: session } })).status).toBe(401);
    expect((await request("/api/app/authorize?challenge=bad&scheme=kelaodeyun", { headers: { Cookie: session } })).status).toBe(400);
  });
  it("accepts the new and legacy desktop callback schemes only", async () => {
    const session = getSession(await login());
    const challenge = base64url(await sha256(verifier));
    for (const scheme of ["agentcloudos", "agentcloudos-dev", "kelaodeyun", "kelaodeyun-dev"]) {
      const response = await request(`/api/app/authorize?challenge=${challenge}&scheme=${scheme}`, { headers: { Cookie: session } });
      expect(response.status).toBe(200);
      expect(await response.text()).toContain(`${scheme}://app/account/callback`);
    }
    expect((await request(`/api/app/authorize?challenge=${challenge}&scheme=other`, { headers: { Cookie: session } })).status).toBe(400);
  });
  it("upserts validated hosts, protects secrets and enforces ownership and revocation", async () => {
    const session = getSession(await login()), token = await appLogin(session);
    const host = { hostname: "example.com", username: "alice", authType: "password", secret: "first" };
    const saved = await (await request("/api/app/hosts", appPost(host, token))).json();
    expect(saved).toMatchObject({ label: "example.com", port: 22, source: "account" });
    const updated = await (await request("/api/app/hosts", appPost({ ...host, label: "新名称", secret: "second" }, token))).json();
    expect(updated.id).toBe(saved.id);
    expect((await (await request("/api/app/hosts", { headers: bearer(token) })).json()).hosts).toEqual([updated]);
    expect(await (await request(`/api/app/hosts/${saved.id}/secret`, { headers: bearer(token) })).json()).toEqual({ authType: "password", secret: "second" });
    expect((await request(`/api/app/hosts/${saved.id}/secret`, { headers: { Cookie: session } })).status).toBe(403);
    for (const invalid of [{ hostname: "-bad" }, { port: 0 }, { port: 1.5 }, { username: "a b" }, { label: "x".repeat(81) }, { secret: "" }, { authType: "key", secret: "-----BEGIN OPENSSH PRIVATE KEY-----\n-----END RSA PRIVATE KEY-----" }]) {
      expect((await request("/api/app/hosts", appPost({ ...host, ...invalid }, token))).status).toBe(400);
    }
    const key = "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----";
    expect((await request("/api/app/hosts", appPost({ ...host, authType: "key", secret: key }, token))).status).toBe(200);
    const otherSession = getSession(await login(googlePayload({ sub: "other-user", email: "other@example.com" }))), otherToken = await appLogin(otherSession);
    expect((await request(`/api/app/hosts/${saved.id}/secret`, { headers: bearer(otherToken) })).status).toBe(404);
    expect((await request(`/api/app/hosts/${saved.id}`, appDelete(otherToken))).status).toBe(404);
    expect((await request("/api/app/hosts", { method: "POST", headers: { Cookie: session, "Content-Type": "application/json" }, body: "{}" })).status).toBe(403);
    expect((await request("/api/account/app-sessions/revoke", post({}, session))).status).toBe(200);
    expect((await request("/api/app/me", { headers: bearer(token) })).status).toBe(401);
    expect((await request("/api/app/me", { headers: bearer(otherToken) })).status).toBe(200);
  });
  it("includes purchased servers without exposing their secrets in the list", async () => {
    const { session, server } = await createdServer();
    const encrypted = await encryptText(env, "root-password");
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='past_due',ipv4='192.0.2.1',root_password_enc=? WHERE id=?", encrypted, server.id));
    const token = await appLogin(session), id = "server-" + server.id;
    const hosts = (await (await request("/api/app/hosts", { headers: bearer(token) })).json()).hosts;
    expect(hosts).toEqual([{ id, label: server.product_name, hostname: "192.0.2.1", port: 22, username: "root", authType: "password", source: "purchased" }]);
    expect(JSON.stringify(hosts)).not.toContain("root-password");
    expect(await (await request(`/api/app/hosts/${id}/secret`, { headers: bearer(token) })).json()).toEqual({ authType: "password", secret: "root-password" });
    expect((await request(`/api/app/hosts/${id}`, appDelete(token))).status).toBe(409);
  });
  it("limits account hosts but allows an existing host to be updated", async () => {
    const session = getSession(await login()), token = await appLogin(session);
    const host = { hostname: "host0.example", username: "root", authType: "password", secret: "password" };
    for (let index = 0; index < 50; index++) {
      expect((await request("/api/app/hosts", appPost({ ...host, hostname: `host${index}.example` }, token))).status).toBe(200);
    }
    expect((await request("/api/app/hosts", appPost({ ...host, hostname: "extra.example" }, token))).status).toBe(409);
    const updated = await request("/api/app/hosts", appPost({ ...host, label: "updated" }, token));
    expect(updated.status).toBe(200);
    const id = (await updated.json()).id;
    expect((await request(`/api/app/hosts/${id}`, appDelete(token))).status).toBe(200);
    expect((await request(`/api/app/hosts/${id}`, appDelete(token))).status).toBe(404);
    expect((await request("/api/app/logout", appPost({}, token))).status).toBe(200);
    expect((await request("/api/app/me", { headers: bearer(token) })).status).toBe(401);
  });
});

describe("Google login", () => {
  it("uses state and PKCE, and rejects mismatched state", async () => {
    const start = await request("/api/auth/google/start");
    expect(start.status, await start.clone().text()).toBe(302);
    const target = new URL(start.headers.get("location"));
    expect(target.origin).toBe("https://accounts.google.com");
    expect(target.searchParams.get("code_challenge_method")).toBe("S256");
    expect(target.searchParams.get("state")).toHaveLength(64);
    const bad = await request("/api/auth/google/callback?state=" + "a".repeat(64) + "&code=x", { headers: { Cookie: start.headers.get("set-cookie").split(";")[0] } });
    expect(bad.headers.get("location")).toBe("/login?error=state");
  });
  it.each([{ aud: "wrong" }, { email_verified: false }])("rejects untrusted claims %o", async claims => {
    expect((await login(googlePayload(claims))).headers.get("location")).toBe("/login?error=identity");
  });
  it("reuses sub, updates identity, recomputes admin and rejects open redirects", async () => {
    const first = await login();
    expect(first.status).toBe(302);
    const initial = await (await request("/api/config", { headers: { Cookie: getSession(first) } })).json();
    const second = await login(googlePayload({ email: "admin@example.com", name: "更新" }), "//evil.com");
    expect(second.headers.get("location")).toBe("/account");
    const updated = await (await request("/api/config", { headers: { Cookie: getSession(second) } })).json();
    expect(updated.user).toMatchObject({ id: initial.user.id, email: "admin@example.com", name: "更新", role: "admin" });
  });
});

describe("API", () => {
  it("checks CSRF but exempts webhooks", async () => {
    expect((await request("/api/checkout", { ...post(), headers: { Origin: "https://evil.test", "Content-Type": "application/json" } })).status).toBe(403);
    expect((await request("/api/stripe/webhook", { method: "POST", body: "{}" })).status).toBe(400);
  });
  it("sets security headers on static assets and API responses", async () => {
    for (const path of ["/", "/api/config"]) {
      const response = await request(path);
      expect(response.headers.get("x-frame-options")).toBe("DENY");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    }
  });
  it("pages live products and computes region and setup fees without Stripe", async () => {
    const mocks = mockCommerce();
    const original = await runInDurableObject(stub(), instance => { const key = instance.env.STRIPE_SECRET_KEY; instance.env.STRIPE_SECRET_KEY = ""; return key; });
    try {
      const response = await request("/api/plans");
      expect(response.status).toBe(200);
      const plans = await response.json();
      expect(plans).toHaveLength(6);
      expect(plans[0]).toMatchObject({ id: "V153", name: "Cloud VPS 4", specs: { cpu: 4, ramGb: 8, diskGb: 100, bandwidthTb: null } });
      expect(plans[0].prices.map(p => p.priceId)).toEqual(["V153-1m", "V153-12m", "V153-24m"]);
      expect(plans[0].prices[0].byRegion.EU).toEqual({ amount: 990, firstRecurringAmount: 990, discountAmount: 0, setupAmount: 360, firstAmount: 1350, regionAmount: 0 });
      expect(plans[1].prices[1]).toMatchObject({ priceId: yearPrice, interval: "year", intervalCount: 1, currency: "usd", byRegion: { SIN: { amount: 25020, firstRecurringAmount: 22590, discountAmount: 2430, setupAmount: 0, firstAmount: 22590, regionAmount: 735 } } });
      expect(plans[1].prices[1]).not.toHaveProperty("amount");
      expect(plans[5].prices[2].byRegion.JPN.regionAmount).toBe(5220);
      const regions = await (await request("/api/datacenters")).json();
      expect(regions.map(r => r.id)).toEqual(["EU", "UK", "US-central", "US-east", "US-west", "SIN", "JPN", "IND", "AUS"]);
      const productCalls = mocks.fetcher.mock.calls.filter(([url]) => String(url).startsWith("https://api.contabo.com/v1/products?"));
      expect(productCalls.map(([url]) => new URL(url).searchParams.get("page"))).toEqual(["1", "2"]);
      expect(mocks.fetcher.mock.calls.some(([url]) => String(url).startsWith("https://api.stripe.com/"))).toBe(false);
      await request("/api/plans");
      expect(mocks.fetcher.mock.calls.filter(([url]) => String(url).startsWith("https://api.contabo.com/v1/products?"))).toHaveLength(2);
      const ttl = await runInDurableObject(stub(), instance => instance.plansCache.expires - Date.now());
      expect(ttl).toBeGreaterThan(3590000);
      expect(ttl).toBeLessThanOrEqual(3600000);
    } finally { await runInDurableObject(stub(), instance => { instance.env.STRIPE_SECRET_KEY = original; }); }
  });
  it("subtracts storefront term discounts rather than adding the API's misleading setupFees", async () => {
    mockCommerce();
    const plans = await (await request("/api/plans")).json();
    const expected = {
      V153: [990, 10098, 19008],
      V154: [1350, 13770, 25920],
      V155: [2520, 25704, 48384],
      V156: [4500, 45900, 86400],
      V157: [6675, 68085, 128160],
      V158: [8820, 89964, 169344],
    };
    for (const plan of plans) {
      expect(plan.prices.map(p => p.byRegion.EU.firstRecurringAmount)).toEqual(expected[plan.id]);
      for (const price of plan.prices) {
        for (const q of Object.values(price.byRegion)) {
          expect(q.firstAmount).toBe(q.amount - q.discountAmount + q.setupAmount);
          expect(q.discountAmount).toBe(price.byRegion.EU.discountAmount);
          expect(q.setupAmount).toBe(plan.id === "V153" && price.interval === "month" ? 360 : 0);
        }
      }
    }
    const v6 = plans.find(p => p.id === "V154");
    expect(v6.prices.map(p => p.byRegion.EU.amount)).toEqual([1350, 16200, 32400]);
    expect(v6.prices[1].byRegion.SIN.firstAmount - v6.prices[1].byRegion.EU.firstAmount).toBe(8820);
    expect(v6.prices[2].byRegion.SIN.firstAmount - v6.prices[2].byRegion.EU.firstAmount).toBe(17640);
  });
  it.each(["unavailable", "missing period", "missing USD discount", "negative discount", "excess discount", "wrong identity", "base mismatch"])("blocks checkout when term pricing is %s", async failure => {
    const session = getSession(await login()), terms = structuredClone(termsFixture);
    const term = terms.V154.periods.find(p => p.length === 12);
    if (failure === "unavailable") delete terms.V154;
    if (failure === "missing period") terms.V154.periods = terms.V154.periods.filter(p => p.length !== 12);
    if (failure === "missing USD discount") delete term.discount.USD;
    if (failure === "negative discount") term.discount.USD = -1;
    if (failure === "excess discount") term.discount.USD = 109;
    if (failure === "wrong identity") terms.V154.sys.id = "another-product";
    if (failure === "base mismatch") terms.V154.price.USD = 8;
    const mocks = mockCommerce({ terms });
    expect((await request("/api/checkout", post({ priceId: yearPrice, dataCenterId: "SIN" }, session))).status).toBe(503);
    expect(mocks.fetcher.mock.calls.some(([url]) => String(url).startsWith("https://api.stripe.com/"))).toBe(false);
  });
  it("shares concurrent cache misses and refreshes when the multiplier changes", async () => {
    const mocks = mockCommerce();
    const [a, b] = await runInDurableObject(stub(), async instance => Promise.all([instance.plans(), instance.plans()]));
    expect(a).toEqual(b);
    expect(mocks.fetcher.mock.calls.filter(([url]) => String(url).startsWith("https://api.contabo.com/v1/products?"))).toHaveLength(2);
    const previous = await runInDurableObject(stub(), instance => { const value = instance.env.PRICE_MULTIPLIER; instance.env.PRICE_MULTIPLIER = "2"; return value; });
    try {
      const plans = await (await request("/api/plans")).json();
      expect(plans[0].prices[0].byRegion.EU.amount).toBe(1320);
      expect(mocks.fetcher.mock.calls.filter(([url]) => String(url).startsWith("https://api.contabo.com/v1/products?"))).toHaveLength(4);
    } finally { await runInDurableObject(stub(), instance => { instance.env.PRICE_MULTIPLIER = previous; }); }
  });
  it("omits unavailable products, invalid USD prices, and unavailable regions", async () => {
    const products = structuredClone(productsFixture).filter(p => p.priceItem.itemId !== "V157");
    products.find(p => p.priceItem.itemId === "V155").priceItem.outOfStock.isOutOfStock = true;
    products.find(p => p.priceItem.itemId === "V156").priceItem.price = [{ amount: 20, currency: "EUR" }];
    products.find(p => p.priceItem.itemId === "V154").addons = products.find(p => p.priceItem.itemId === "V154").addons.filter(a => !["Asia (Singapore)", "European Union"].includes(a.priceItem.name));
    mockCommerce({ products });
    const plans = await (await request("/api/plans")).json();
    expect(plans.map(p => p.id)).toEqual(["V153", "V154", "V158"]);
    expect(plans.find(p => p.id === "V154").prices[0].byRegion.SIN).toBeUndefined();
    expect(plans.find(p => p.id === "V154").prices[0].byRegion.EU).toBeDefined();
  });
  it("fails closed when a present setup fee lacks a valid USD price", async () => {
    const terms = structuredClone(termsFixture);
    terms.V154.periods.find(f => f.length === 12).setup = { EUR: 1 };
    const mocks = mockCommerce({ terms });
    const response = await request("/api/plans");
    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe("套餐暂时无法加载");
    expect(mocks.fetcher.mock.calls.some(([url]) => String(url).startsWith("https://api.stripe.com/"))).toBe(false);
  });
  it("treats an absent setup field as free and rounds dollars before multiplying", async () => {
    const products = structuredClone(productsFixture), terms = structuredClone(termsFixture), item = products.find(p => p.priceItem.itemId === "V154");
    item.priceItem.price.find(p => p.currency === "USD").amount = 9.007;
    terms.V154.price.USD = 9.007;
    mockCommerce({ products, terms });
    const plans = await (await request("/api/plans")).json();
    expect(plans.find(p => p.id === "V154").prices[1].byRegion.SIN).toEqual({ amount: 25038, firstRecurringAmount: 22608, discountAmount: 2430, firstAmount: 22608, setupAmount: 0, regionAmount: 735 });
  });
  it("returns 503 without Stripe when catalog fetch fails and does not cache the failure", async () => {
    const session = getSession(await login()), mocks = mockCommerce({ failPage: 2 });
    const plans = await request("/api/plans");
    expect(plans.status).toBe(503);
    expect((await plans.json()).error).toBe("套餐暂时无法加载");
    const checkout = await request("/api/checkout", post({ priceId: monthPrice, dataCenterId: "SIN" }, session));
    expect(checkout.status).toBe(503);
    expect((await checkout.json()).error).toBe("套餐暂时无法加载");
    expect(mocks.fetcher.mock.calls.filter(([url]) => String(url).startsWith("https://api.contabo.com/v1/products?"))).toHaveLength(4);
    expect(mocks.fetcher.mock.calls.some(([url]) => String(url).startsWith("https://api.stripe.com/"))).toBe(false);
    mockCommerce();
    expect((await request("/api/plans")).status).toBe(200);
  });
  it.each(["", "0.9", "Infinity", "invalid"])("rejects invalid price multiplier %s", async value => {
    mockCommerce();
    const original = await runInDurableObject(stub(), instance => { const previous = instance.env.PRICE_MULTIPLIER; instance.env.PRICE_MULTIPLIER = value; return previous; });
    try { expect((await request("/api/plans")).status).toBe(503); }
    finally { await runInDurableObject(stub(), instance => { instance.env.PRICE_MULTIPLIER = original; }); }
  });
  it("ignores a supplied old key, rejects unknown prices, and starts a subscription checkout", async () => {
    const response = await login(), session = getSession(response), mocks = mockCommerce({ product: "missing" });
    expect((await request("/api/checkout", post({ priceId: "unknown", dataCenterId: "SIN" }, session))).status).toBe(400);
    for (const dataCenterId of ["invalid", 1]) expect((await request("/api/checkout", post({ priceId: yearPrice, dataCenterId }, session))).status).toBe(400);
    const checkout = await request("/api/checkout", post({ priceId: yearPrice, dataCenterId: "SIN", publicKey: "ignored value", amount: 1, firstAmount: 1 }, session));
    expect(await checkout.json()).toEqual({ url: "https://checkout.stripe.test" });
    const rows = await runInDurableObject(stub(), instance => instance.all("SELECT * FROM servers"));
    expect(rows[0]).toMatchObject({ status: "pending_payment", stripe_price_id: "dynamic", interval: "year", interval_count: 1, amount: 25020, first_amount: 22590, provider_product_id: yearPrice, region: "SIN" });
    expect(rows[0].public_key).toBe("");
    const checkoutParams = new URLSearchParams(mocks.checkoutBody());
    expect(checkoutParams.get("allowed_payment_method_types[0]")).toBe("card");
    expect(checkoutParams.has("payment_method_types[0]")).toBe(false);
    expect(checkoutParams.get("client_reference_id")).toBe(rows[0].id);
    expect(checkoutParams.get("line_items[0][price_data][unit_amount]")).toBe("25020");
    expect(checkoutParams.get("line_items[0][price_data][currency]")).toBe("usd");
    expect(checkoutParams.get("line_items[0][price_data][product]")).toBe("kld_V154");
    expect(checkoutParams.get("line_items[0][price_data][recurring][interval]")).toBe("year");
    expect(checkoutParams.get("line_items[0][price_data][recurring][interval_count]")).toBe("1");
    expect(checkoutParams.has("line_items[1][quantity]")).toBe(false);
    expect(checkoutParams.get("discounts[0][coupon]")).toBe("kld_term_V154-12m_2430");
    const coupon = new URLSearchParams(mocks.couponBody());
    expect(coupon.get("amount_off")).toBe("2430");
    expect(coupon.get("duration")).toBe("once");
    expect(coupon.get("currency")).toBe("usd");
    expect(coupon.get("applies_to[products][0]")).toBe("kld_V154");
    const productParams = new URLSearchParams(mocks.productBody());
    expect(productParams.get("id")).toBe("kld_V154");
    expect(productParams.get("name")).toBe("Cloud VPS 6");
    expect(productParams.get("metadata[contabo_product]")).toBe("V154");
  });
  it("recovers from concurrent Stripe product creation", async () => {
    const session = getSession(await login()), mocks = mockCommerce({ product: "conflict" });
    const response = await request("/api/checkout", post({ priceId: yearPrice, dataCenterId: "SIN" }, session));
    expect(response.status, await response.clone().text()).toBe(200);
    expect(mocks.retrieves()).toBe(2);
  });
  it("creates only the recurring line when setup is free", async () => {
    const session = getSession(await login()), mocks = mockCommerce();
    const response = await request("/api/checkout", post({ priceId: monthPrice, dataCenterId: "SIN" }, session));
    expect(response.status, await response.clone().text()).toBe(200);
    expect(new URLSearchParams(mocks.checkoutBody()).has("discounts[0][coupon]")).toBe(false);
    expect(new URLSearchParams(mocks.checkoutBody()).has("line_items[1][quantity]")).toBe(false);
    const row = await runInDurableObject(stub(), instance => instance.get("SELECT * FROM servers"));
    expect(row).toMatchObject({ amount: 2085, first_amount: 2085 });
  });
  it("charges the genuine VPS 4 monthly setup once without a coupon", async () => {
    const session = getSession(await login()), mocks = mockCommerce();
    expect((await request("/api/checkout", post({ priceId: "V153-1m", dataCenterId: "EU" }, session))).status).toBe(200);
    const params = new URLSearchParams(mocks.checkoutBody());
    expect(params.get("line_items[0][price_data][unit_amount]")).toBe("990");
    expect(params.get("line_items[1][price_data][unit_amount]")).toBe("360");
    expect(params.get("line_items[1][price_data][product_data][name]")).toBe("开通费");
    expect(params.has("line_items[1][price_data][recurring][interval]")).toBe(false);
    expect(params.has("discounts[0][coupon]")).toBe(false);
    const row = await runInDurableObject(stub(), instance => instance.get("SELECT * FROM servers"));
    expect(row).toMatchObject({ amount: 990, first_amount: 1350 });
  });
  it("recovers a concurrent first-term coupon creation without removing the discount", async () => {
    const session = getSession(await login()), mocks = mockCommerce({ couponConflict: true });
    expect((await request("/api/checkout", post({ priceId: yearPrice, dataCenterId: "EU" }, session))).status).toBe(200);
    const params = new URLSearchParams(mocks.checkoutBody());
    expect(params.get("discounts[0][coupon]")).toBe("kld_term_V154-12m_2430");
    expect(params.get("line_items[0][price_data][unit_amount]")).toBe("16200");
  });
  it("rejects an unavailable region before contacting Stripe", async () => {
    const session = getSession(await login()), products = structuredClone(productsFixture);
    const item = products.find(p => p.priceItem.itemId === "V154");
    item.addons = item.addons.filter(a => a.priceItem.name !== "Asia (Singapore)");
    const mocks = mockCommerce({ products });
    const response = await request("/api/checkout", post({ priceId: monthPrice, dataCenterId: "SIN" }, session));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("该套餐在所选地区不可用");
    expect(mocks.fetcher.mock.calls.some(([url]) => String(url).startsWith("https://api.stripe.com/"))).toBe(false);
  });
  it("migrates existing server rows without first_amount", async () => {
    const { server } = await createdServer(), object = stub();
    await runInDurableObject(object, instance => instance.run("ALTER TABLE servers DROP COLUMN first_amount"));
    await abortAllDurableObjects();
    const row = await stub().getServer(server.id);
    expect(row).toMatchObject({ id: server.id, amount: 2085, first_amount: null });
  });
  it("renames the legacy provider columns and drops the old limiter table", async () => {
    const { server } = await createdServer(), legacy = "host" + "inger";
    await runInDurableObject(stub(), instance => {
      for (const [from, to] of [["provider_product_id", legacy + "_item_id"], ["region", "data_center_id"], ["provider_instance_id", legacy + "_vm_id"], ["provider_secret_id", legacy + "_subscription_id"]]) instance.run(`ALTER TABLE servers RENAME COLUMN ${from} TO ${to}`);
      instance.run(`CREATE TABLE ${legacy}_requests(at INTEGER NOT NULL)`);
    });
    await abortAllDurableObjects();
    expect(await stub().getServer(server.id)).toMatchObject({ provider_product_id: monthPrice, region: "SIN", provider_instance_id: null, provider_secret_id: null });
    expect(await runInDurableObject(stub(), instance => instance.get("SELECT name FROM sqlite_master WHERE name=?", legacy + "_requests"))).toBeNull();
  });
  it("rejects an invalid image UUID before contacting Stripe", async () => {
    const session = getSession(await login()), mocks = mockCommerce();
    const original = await runInDurableObject(stub(), instance => { const previous = instance.env.CONTABO_IMAGE_ID; instance.env.CONTABO_IMAGE_ID = "invalid"; return previous; });
    try {
      const response = await request("/api/checkout", post({ priceId: monthPrice, dataCenterId: "SIN" }, session));
      expect(response.status).toBe(503);
      expect((await response.json()).error).toBe("服务器镜像尚未配置");
      expect(mocks.fetcher).not.toHaveBeenCalled();
    } finally { await runInDurableObject(stub(), instance => { instance.env.CONTABO_IMAGE_ID = original; }); }
  });
  it("stores a two-year cycle and sends its exact recurring interval to Stripe", async () => {
    const session = getSession(await login()), mocks = mockCommerce();
    const priceId = "V154-24m";
    const response = await request("/api/checkout", post({ priceId, dataCenterId: "SIN" }, session));
    expect(response.status, await response.clone().text()).toBe(200);
    const row = await runInDurableObject(stub(), instance => instance.get("SELECT * FROM servers"));
    expect(row).toMatchObject({ interval: "year", interval_count: 2, amount: 50040, first_amount: 43560, provider_product_id: priceId });
    const params = new URLSearchParams(mocks.checkoutBody());
    expect(params.get("line_items[0][price_data][recurring][interval]")).toBe("year");
    expect(params.get("line_items[0][price_data][recurring][interval_count]")).toBe("2");
    const account = (await (await request("/api/servers", { headers: { Cookie: session } })).json())[0];
    expect(account).toMatchObject({ interval: "year", interval_count: 2, amount: 50040, region: "SIN" });
  });
  it("supports feedback creation and voting", async () => {
    const session = getSession(await login());
    const created = await (await request("/api/feedback", post({ title: "建议", description: "建议内容" }, session))).json();
    expect(created.items[0].title).toBe("建议");
    const voted = await (await request(`/api/feedback/${created.items[0].id}/vote`, post({ vote: 1 }, session))).json();
    expect(voted.items[0]).toMatchObject({ up: 1, myVote: 1 });
  });
  it("returns the admin overview fields needed for the server and user tables", async () => {
    const { server } = await createdServer();
    const admin = getSession(await login(googlePayload({ email: "admin@example.com", name: "管理员", picture: "https://example.test/avatar.png" })));
    const response = await request("/api/admin/overview", { headers: { Cookie: admin } });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.servers[0]).toMatchObject({ id: server.id, interval: "month", interval_count: 1, amount: 2085, region: "SIN", provider_instance_id: null, simulated: false, failure_phase: null, created: expect.any(String), updated: expect.any(String) });
    expect(data.accounts[0]).toMatchObject({ email: "admin@example.com", name: "管理员", avatar: "https://example.test/avatar.png", created: expect.any(String) });
    expect(data.servers[0]).not.toHaveProperty("public_key");
  });
  it("tracks payment failures during provisioning and recovery", async () => {
    const { server } = await createdServer();
    const subscription = subscriptionFixture({ status: "past_due", latest_invoice: { status: "open" } });
    mockCommerce({ subscription });
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='provisioning',stripe_subscription_id='sub_1' WHERE id=?", server.id));
    expect((await signedEvent({ id: "evt_failed", type: "invoice.payment_failed", data: { object: { subscription: "sub_1" } } })).status).toBe(200);
    expect((await stub().getServer(server.id)).status).toBe("past_due");
    await stub().activate(server.id, "192.0.2.1", "host.test");
    expect((await stub().getServer(server.id)).status).toBe("past_due");
    Object.assign(subscription, subscriptionFixture({ cancel_at_period_end: true }));
    await signedEvent({ id: "evt_recovered", type: "customer.subscription.updated", data: { object: { id: "sub_1", status: "active", cancel_at_period_end: true, current_period_end: 2000000000 } } });
    expect(await stub().getServer(server.id)).toMatchObject({ status: "active", cancel_at_period_end: 1, current_period_end: 2000000000 });
  });
  it("starts provisioning once for duplicate completion events", async () => {
    const { server } = await createdServer();
    const event = { id: "evt_1", type: "checkout.session.completed", data: { object: { mode: "subscription", payment_status: "paid", customer: "cus_1", subscription: "sub_1", client_reference_id: server.id } } };
    const workflow = await introspectWorkflowInstance(env.PROVISION, server.id);
    try {
      expect((await signedEvent(event)).status).toBe(200);
      expect((await signedEvent(event)).status).toBe(200);
      const state = await runInDurableObject(stub(), instance => instance.all("SELECT id FROM stripe_events"));
      expect(state).toHaveLength(1);
    } finally { await workflow.dispose(); }
  });
  it("does not provision a subscription already canceled at checkout completion", async () => {
    const { server } = await createdServer();
    mockCommerce({ subscription: subscriptionFixture({ status: "canceled" }) });
    const workflow = await introspectWorkflowInstance(env.TEARDOWN, server.id);
    try {
      const event = { id: "evt_canceled_checkout", type: "checkout.session.completed", data: { object: { mode: "subscription", payment_status: "paid", customer: "cus_1", subscription: { id: "sub_1", status: "canceled" }, client_reference_id: server.id } } };
      expect((await signedEvent(event)).status).toBe(200);
      await workflow.waitForStatus("complete");
      expect(await stub().getServer(server.id)).toMatchObject({ status: "terminated", termination_requested: 1, provider_instance_id: null });
    } finally { await workflow.dispose(); }
  });
  it("links an unpaid checkout without provisioning, then provisions once after async payment", async () => {
    const { server } = await createdServer();
    const binding = env.PROVISION, tracker = await trackProvision();
    const object = { mode: "subscription", payment_status: "unpaid", customer: "cus_1", subscription: { id: "sub_1", status: "active" }, client_reference_id: server.id };
    let purchases = 0;
    mockContabo(async (path, options) => {
      if (path === "/v1/secrets") return responseJson({ data: [{ secretId: 7 }] });
      if (path === "/v1/compute/instances" && options.method === "POST") { purchases++; return responseJson({ data: [{ instanceId: 42 }] }); }
      if (path === "/v1/compute/instances/42") return instanceResponse();
      throw Error("unexpected outbound request");
    });
    const workflow = await introspectWorkflowInstance(binding, server.id);
    try {
      expect((await signedEvent({ id: "evt_unpaid", type: "checkout.session.completed", data: { object } })).status).toBe(200);
      expect(await stub().getServer(server.id)).toMatchObject({ status: "pending_payment", stripe_subscription_id: "sub_1" });
      expect(tracker.count()).toBe(0);
      expect(purchases).toBe(0);
      const event = { id: "evt_async", type: "checkout.session.async_payment_succeeded", data: { object } };
      expect((await signedEvent(event)).status).toBe(200);
      await workflow.waitForStatus("complete");
      expect((await signedEvent(event)).status).toBe(200);
      expect(await stub().getServer(server.id)).toMatchObject({ status: "active", ipv4: "192.0.2.1" });
      expect(tracker.count()).toBe(1);
      expect(purchases).toBe(1);
    } finally { await workflow.dispose(); await tracker.restore(); }
  });
  it("expires a pending checkout after asynchronous payment failure", async () => {
    const { server } = await createdServer();
    const tracker = await trackProvision();
    const object = { mode: "subscription", payment_status: "unpaid", customer: "cus_1", subscription: "sub_1", client_reference_id: server.id };
    try {
      await signedEvent({ id: "evt_unpaid", type: "checkout.session.completed", data: { object } });
      expect((await signedEvent({ id: "evt_async_failed", type: "checkout.session.async_payment_failed", data: { object } })).status).toBe(200);
      expect((await stub().getServer(server.id)).status).toBe("checkout_expired");
      expect(tracker.count()).toBe(0);
    } finally { await tracker.restore(); }
  });
  it("provisions a checkout that requires no payment", async () => {
    const { server } = await createdServer();
    const object = { mode: "subscription", payment_status: "no_payment_required", customer: "cus_1", subscription: { id: "sub_1", status: "active" }, client_reference_id: server.id };
    mockContabo(async (path, options) => {
      if (path === "/v1/secrets") return responseJson({ data: [{ secretId: 7 }] });
      if (path === "/v1/compute/instances" && options.method === "POST") return responseJson({ data: [{ instanceId: 42 }] });
      if (path === "/v1/compute/instances/42") return instanceResponse();
      throw Error("unexpected outbound request");
    });
    const workflow = await introspectWorkflowInstance(env.PROVISION, server.id);
    try {
      expect((await signedEvent({ id: "evt_free", type: "checkout.session.completed", data: { object } })).status).toBe(200);
      await workflow.waitForStatus("complete");
      expect((await stub().getServer(server.id)).status).toBe("active");
    } finally { await workflow.dispose(); }
  });
});

describe("subscription renewal", () => {
  async function activeServer({ paidThrough = 1990000000, vmId = -42 } = {}) {
    const created = await createdServer();
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='active',stripe_subscription_id='sub_1',paid_through=?,provider_instance_id=?,ipv4='192.0.2.1' WHERE id=?", paidThrough, vmId, created.server.id));
    return created;
  }
  it("records a paid renewal once, and ignores a late failed-payment snapshot", async () => {
    const { server } = await activeServer();
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='past_due',payment_past_due=1 WHERE id=?", server.id));
    const mocks = mockCommerce();
    const event = { id: "evt_renewal_paid", type: "invoice.paid", data: { object: { parent: { subscription_details: { subscription: "sub_1" } } } } };
    expect((await signedEvent(event)).status).toBe(200);
    expect((await signedEvent(event)).status).toBe(200);
    expect(mocks.fetcher.mock.calls.filter(([url]) => String(url).includes("/subscriptions/sub_1"))).toHaveLength(1);
    expect((await signedEvent({ ...event, id: "evt_old_failure", type: "invoice.payment_failed" })).status).toBe(200);
    expect(await stub().getServer(server.id)).toMatchObject({ status: "active", paid_through: 2000000000, payment_past_due: 0, provider_instance_id: -42 });
  });
  it("does not grant an unpaid new period from subscription.active or its current_period_end", async () => {
    const { server } = await activeServer();
    mockCommerce({ subscription: subscriptionFixture({ current_period_end: 2100000000 }) });
    await stub().syncBilling(server.id);
    expect((await stub().getServer(server.id)).paid_through).toBe(2000000000);
    mockCommerce({ subscription: subscriptionFixture({ current_period_end: 2100000000, latest_invoice: { status: "open" } }) });
    await stub().syncBilling(server.id);
    expect((await stub().getServer(server.id)).paid_through).toBe(2000000000);
  });
  it("links invoice.paid arriving before checkout, then provisions only once", async () => {
    const { server } = await createdServer();
    const subscription = subscriptionFixture({ metadata: { server_id: server.id } });
    mockCommerce({ subscription });
    await runInDurableObject(stub(), instance => { instance.env.CONTABO_MODE = "simulate"; });
    const binding = env.PROVISION, tracker = await trackProvision(), workflow = await introspectWorkflowInstance(binding, server.id);
    try {
      await workflow.modify(async m => m.disableSleeps());
      const event = { id: "evt_paid_first", type: "invoice.paid", data: { object: { parent: { subscription_details: { subscription: { id: "sub_1" } } } } } };
      expect((await signedEvent(event)).status).toBe(200);
      await workflow.waitForStatus("complete");
      expect((await signedEvent({ id: "evt_checkout_later", type: "checkout.session.completed", data: { object: { mode: "subscription", payment_status: "paid", subscription: "sub_1", customer: "cus_1", client_reference_id: server.id } } })).status).toBe(200);
      expect(tracker.count()).toBe(1);
      expect(await stub().getServer(server.id)).toMatchObject({ status: "active", paid_through: 2000000000 });
    } finally {
      await workflow.dispose(); await tracker.restore();
      await runInDurableObject(stub(), instance => { instance.env.CONTABO_MODE = "live"; });
    }
  });
  it("does not bind another customer's subscription through metadata", async () => {
    const { server } = await createdServer();
    mockCommerce({ subscription: subscriptionFixture({ customer: "cus_other", metadata: { server_id: server.id } }) });
    expect((await signedEvent({ id: "evt_wrong_owner", type: "invoice.paid", data: { object: { subscription: "sub_1" } } })).status).toBe(200);
    expect(await stub().getServer(server.id)).toMatchObject({ stripe_subscription_id: null, status: "pending_payment" });
  });
  it("sends supplier cancellation immediately but preserves the paid server until expiry", async () => {
    const { server, session } = await activeServer({ vmId: 42 });
    let cancelled = false, cancelCalls = 0;
    mockCommerce({ provider: async (path, options) => {
      if (path.endsWith("/cancel")) { cancelCalls++; cancelled = true; return responseJson({ data: [{ instanceId: 42, cancelDate: "2033-05-18" }] }); }
      expect(options.method).toBe("GET");
      return instanceResponse("running", { cancelDate: cancelled ? "2033-05-18" : "" });
    } });
    expect((await request(`/api/servers/${server.id}/cancel-renewal`, post({}, session))).status).toBe(200);
    expect(cancelCalls).toBe(1);
    expect(await stub().getServer(server.id)).toMatchObject({ status: "active", termination_requested: 0, cancel_at_period_end: 1, provider_cancel_requested: 1, provider_cancel_date: "2033-05-18" });
    await stub().syncBilling(server.id);
    expect(cancelCalls).toBe(1);
  });
  it("recovers a lost supplier cancellation response by reading before retrying", async () => {
    const { server, session } = await activeServer({ vmId: 42 });
    let cancelled = false, cancelCalls = 0;
    mockCommerce({ provider: async path => {
      if (path.endsWith("/cancel")) { cancelled = true; cancelCalls++; throw Error("connection lost after acceptance"); }
      return instanceResponse("running", { cancelDate: cancelled ? "2033-05-18" : "" });
    } });
    expect((await request(`/api/servers/${server.id}/cancel-renewal`, post({}, session))).status).toBe(500);
    expect((await stub().getServer(server.id)).billing_error).toBeTruthy();
    expect(await stub().reconcileBilling()).toEqual({ checked: 1, failed: 0 });
    expect(cancelCalls).toBe(1);
    expect(await stub().getServer(server.id)).toMatchObject({ status: "active", billing_error: null, provider_cancel_date: "2033-05-18" });
  });
  it("keeps cancellation intent when Stripe reports reactivation", async () => {
    const { server } = await activeServer();
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET provider_cancel_requested=1,cancel_at_period_end=1 WHERE id=?", server.id));
    const mocks = mockCommerce();
    await stub().syncBilling(server.id);
    expect(mocks.fetcher.mock.calls.some(([url, opts]) => String(url).includes("/subscriptions/sub_1") && opts.method === "POST" && String(opts.body).includes("cancel_at_period_end=true"))).toBe(true);
    expect((await stub().getServer(server.id)).cancel_at_period_end).toBe(1);
  });
  it("stops an unpaid renewal at the last paid deadline instead of granting Stripe's extended period", async () => {
    const { server } = await activeServer({ paidThrough: 1000000000 });
    const mocks = mockCommerce({ subscription: subscriptionFixture({ status: "past_due", latest_invoice: { status: "open" } }) });
    const workflow = await introspectWorkflowInstance(env.TEARDOWN, server.id);
    try {
      expect((await signedEvent({ id: "evt_renewal_failed", type: "invoice.payment_failed", data: { object: { subscription: "sub_1" } } })).status).toBe(200);
      await workflow.waitForStatus("complete");
      expect(await stub().getServer(server.id)).toMatchObject({ status: "terminated", paid_through: 1000000000, provider_cancel_requested: 1 });
      expect(mocks.fetcher.mock.calls.some(([url, opts]) => String(url).includes("/subscriptions/sub_1") && opts.method === "DELETE")).toBe(true);
    } finally { await workflow.dispose(); }
  });
  it("flags unknown paid deadlines without deleting a server", async () => {
    const { server } = await activeServer({ paidThrough: null });
    mockCommerce({ subscription: subscriptionFixture({ status: "past_due", latest_invoice: { status: "open" } }) });
    await stub().syncBilling(server.id);
    expect(await stub().getServer(server.id)).toMatchObject({ status: "past_due", termination_requested: 0, billing_error: "无法确定已付款期限，请核对 Stripe 发票后处理欠费订阅" });
  });
  it("does not recreate a terminated server when a late invoice is paid", async () => {
    const { server } = await activeServer({ paidThrough: 1000000000 });
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='terminated',termination_requested=1 WHERE id=?", server.id));
    mockCommerce();
    await stub().syncBilling(server.id);
    expect(await stub().getServer(server.id)).toMatchObject({ status: "terminated", paid_through: 1000000000, billing_error: "服务终止后收到新付款，请核对 Stripe 账单并处理退款" });
  });
  it("blocks live payments while provider provisioning is simulated", async () => {
    const session = getSession(await login()), mocks = mockCommerce();
    await runInDurableObject(stub(), instance => { instance.env.CONTABO_MODE = "simulate"; });
    try {
      expect((await request("/api/checkout", post({ priceId: monthPrice, dataCenterId: "SIN" }, session))).status).toBe(503);
      expect(mocks.fetcher).not.toHaveBeenCalled();
    } finally { await runInDurableObject(stub(), instance => { instance.env.CONTABO_MODE = "live"; }); }
  });
  it("restricts cancellation to the owner and rejects mismatched webhook modes", async () => {
    const { server } = await activeServer();
    const other = getSession(await login(googlePayload({ sub: "other", email: "other@example.com" })));
    expect((await request(`/api/servers/${server.id}/cancel-renewal`, post({}, other))).status).toBe(404);
    expect((await signedEvent({ id: "evt_wrong_mode", livemode: false, type: "invoice.paid", data: { object: {} } })).status).toBe(400);
  });
});

describe("Contabo authentication", () => {
  it("uses the password grant, caches the token and refreshes once after 401", async () => {
    const isolatedEnv = { ...env, CONTABO_CLIENT_ID: "cache-test-client" };
    let tokens = 0, apiCalls = 0;
    const fetcher = vi.fn(async (url, options) => {
      if (String(url).startsWith("https://auth.contabo.com/")) {
        tokens++;
        expect(options.method).toBe("POST");
        expect(options.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
        expect(Object.fromEntries(options.body)).toEqual({ client_id: "cache-test-client", client_secret: "test-secret", username: "test-user", password: "test-password", grant_type: "password" });
        return responseJson({ access_token: "token-" + tokens, expires_in: 3600 });
      }
      apiCalls++;
      expect(options.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
      expect(options.headers.Authorization).toBe(`Bearer token-${apiCalls <= 2 ? 1 : 2}`);
      if (apiCalls === 2) return responseJson({}, 401);
      return responseJson({ data: [] });
    });
    vi.stubGlobal("fetch", fetcher);
    await contabo(isolatedEnv, "/v1/secrets");
    await contabo(isolatedEnv, "/v1/secrets");
    await contabo(isolatedEnv, "/v1/secrets");
    expect(tokens).toBe(2);
    expect(apiCalls).toBe(4);
    expect(fetcher).toHaveBeenCalledTimes(6);
  });
  it("sanitizes auth and API errors and requires all credentials", async () => {
    await expect(contabo({ ...env, CONTABO_API_USER: "" }, "/v1/secrets")).rejects.toThrow("Contabo 尚未配置");
    vi.stubGlobal("fetch", vi.fn(async () => { throw Error("private transport details"); }));
    await expect(contabo({ ...env, CONTABO_CLIENT_ID: "network-auth" }, "/v1/secrets")).rejects.toThrow("Contabo 认证失败");
    vi.stubGlobal("fetch", vi.fn(async () => responseJson({ secret: "hidden" }, 403)));
    await expect(contabo({ ...env, CONTABO_CLIENT_ID: "bad-auth" }, "/v1/secrets")).rejects.toMatchObject({ message: "Contabo 认证失败", status: 403 });
    mockContabo(async () => responseJson({ secret: "hidden" }, 400));
    await expect(contabo({ ...env, CONTABO_CLIENT_ID: "bad-api" }, "/v1/secrets")).rejects.toMatchObject({ message: "Contabo 请求失败 (400)", status: 400 });
  });
});

describe("root credentials", () => {
  it("generates 200 compliant 20-character passwords", () => {
    const pattern = /^((?=.*?[A-Z]{1,})(?=.*?[a-z]{1,}))(((?=(?:[^\d]*\d){1})(?=([^^&*?_~]*[!@#$^&*?_~]){2,}))|((?=(?:[^\d]*\d){3})(?=.*?[!@#$^&*?_~]+))).{8,}$/;
    for (let i = 0; i < 200; i++) {
      const password = generateRootPassword();
      expect(password).toHaveLength(20);
      expect(password).toMatch(pattern);
    }
  });
  it("encrypts and decrypts with a random IV and rejects missing or invalid keys", async () => {
    const first = await encryptText(env, "测试 root password"), second = await encryptText(env, "测试 root password");
    expect(first).not.toBe(second);
    expect(await decryptText(env, first)).toBe("测试 root password");
    const tampered = Uint8Array.from(atob(first), c => c.charCodeAt(0));
    tampered[tampered.length - 1] ^= 1;
    await expect(decryptText(env, btoa(String.fromCharCode(...tampered)))).rejects.toThrow();
    for (const key of ["", "bad", btoa("short")]) {
      await expect(encryptText({ ...env, CREDENTIALS_KEY: key }, "secret")).rejects.toThrow("凭据加密密钥尚未配置");
      await expect(decryptText({ ...env, CREDENTIALS_KEY: key }, first)).rejects.toThrow("凭据加密密钥尚未配置");
    }
  });
  it("restricts credentials to their owner, ready statuses, and 20 requests per minute", async () => {
    const { server, session } = await createdServer();
    const path = `/api/servers/${server.id}/credentials`;
    expect((await request(path)).status).toBe(401);
    const notReady = await request(path, { headers: { Cookie: session } });
    expect(notReady.status).toBe(409);
    expect((await notReady.json()).error).toBe("服务器尚未就绪");
    const other = getSession(await login(googlePayload({ sub: "other-user", email: "other@example.com" })));
    expect((await request(path, { headers: { Cookie: other } })).status).toBe(404);
    const encrypted = await encryptText(env, "TestPassword123!@");
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='past_due',root_password_enc=?,ipv4='192.0.2.1' WHERE id=?", encrypted, server.id));
    const response = await request(path, { headers: { Cookie: session } });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ username: "root", password: "TestPassword123!@", ipv4: "192.0.2.1" });
    const account = await (await request("/api/servers", { headers: { Cookie: session } })).text();
    expect(account).not.toContain("TestPassword123!@");
    expect(account).not.toContain(encrypted);
    expect(account).not.toContain("root_password_enc");
    const admin = getSession(await login(googlePayload({ sub: "admin-user", email: "admin@example.com" })));
    const overview = await (await request("/api/admin/overview", { headers: { Cookie: admin } })).text();
    expect(overview).not.toContain("TestPassword123!@");
    expect(overview).not.toContain(encrypted);
    expect(overview).not.toContain("root_password_enc");
    for (let i = 0; i < 18; i++) expect((await request(path, { headers: { Cookie: session } })).status).toBe(200);
    expect((await request(path, { headers: { Cookie: session } })).status).toBe(429);
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='active',root_password_enc=NULL WHERE id=?", server.id));
    const freshOwner = getSession(await login(googlePayload({ sub: "other-user", email: "other@example.com" })));
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET user_id=(SELECT id FROM users WHERE google_sub='other-user') WHERE id=?", server.id));
    expect((await request(path, { headers: { Cookie: freshOwner } })).status).toBe(409);
  });
  it("adds the encrypted password column to existing databases", async () => {
    const { server } = await createdServer();
    await runInDurableObject(stub(), instance => instance.run("ALTER TABLE servers DROP COLUMN root_password_enc"));
    await abortAllDurableObjects();
    expect(await stub().getServer(server.id)).toMatchObject({ root_password_enc: null });
  });
  it("clears encrypted credentials on manual termination and refuses while secret creation is in flight", async () => {
    const { server } = await createdServer();
    const admin = getSession(await login(googlePayload({ sub: "admin-user", email: "admin@example.com" })));
    const encrypted = await encryptText(env, "TestPassword123!@");
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='needs_attention',secret_inflight=1,root_password_enc=? WHERE id=?", encrypted, server.id));
    const path = `/api/admin/servers/${server.id}/mark-terminated`;
    expect((await request(path, post({}, admin))).status).toBe(409);
    expect((await stub().getServer(server.id)).root_password_enc).toBe(encrypted);
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET secret_inflight=0 WHERE id=?", server.id));
    expect((await request(path, post({}, admin))).status).toBe(200);
    expect(await stub().getServer(server.id)).toMatchObject({ status: "terminated", root_password_enc: null });
  });
});

describe("server workflows", () => {
  it.each([
    ["simulate", "sk_live_dummy"],
    ["live", "sk_test_dummy"],
    ["live", "rk_test_dummy"],
    [undefined, "sk_live_dummy"],
    ["invalid", "sk_live_dummy"],
  ])("simulates provisioning with mode %s and key %s", async (mode, stripeKey) => {
    const { server, session } = await createdServer();
    expect((await (await request("/api/servers", { headers: { Cookie: session } })).json())[0].simulated).toBe(false);
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='provisioning' WHERE id=?", server.id));
    const fetcher = vi.fn(async () => { throw Error("unexpected Contabo request"); });
    vi.stubGlobal("fetch", fetcher);
    const step = workflowStep();
    step.sleep.mockImplementation(async (name, duration) => {
      expect([name, duration]).toEqual(["simulate wait", "20 seconds"]);
      expect(await stub().getServer(server.id)).toMatchObject({ status: "provisioning", provider_instance_id: expect.any(Number), provider_secret_id: null, ipv4: null });
      expect((await stub().getServer(server.id)).provider_instance_id).toBeLessThan(0);
    });
    await ProvisionServer.prototype.run.call({ env: { ...env, CONTABO_MODE: mode, STRIPE_SECRET_KEY: stripeKey } }, { payload: { serverId: server.id } }, step);
    expect(fetcher).not.toHaveBeenCalled();
    expect(step.sleep).toHaveBeenCalledTimes(1);
    const row = await stub().getServer(server.id);
    expect(row).toMatchObject({ status: "active", provider_secret_id: null, ipv4: "203.0.113.10", hostname: "simulated.kelaodeyun.invalid" });
    const credentialsResponse = await request(`/api/servers/${server.id}/credentials`, { headers: { Cookie: session } });
    expect(credentialsResponse.status).toBe(200);
    const credentials = await credentialsResponse.json();
    expect(credentials).toEqual({ username: "root", password: await decryptText(env, row.root_password_enc), ipv4: "203.0.113.10" });
    expect(row.root_password_enc).not.toContain(credentials.password);
    expect(Number.isSafeInteger(row.provider_instance_id)).toBe(true);
    expect(row.provider_instance_id).toBeLessThan(0);
    const accountRow = (await (await request("/api/servers", { headers: { Cookie: session } })).json())[0];
    expect(accountRow.simulated).toBe(true);
    expect(accountRow).not.toHaveProperty("provider_instance_id");
    expect(accountRow).not.toHaveProperty("public_key");
    expect(accountRow).not.toHaveProperty("root_password_enc");
    expect(JSON.stringify(accountRow)).not.toContain(credentials.password);
    const admin = getSession(await login(googlePayload({ email: "admin@example.com" })));
    const adminRow = (await (await request("/api/admin/overview", { headers: { Cookie: admin } })).json()).servers[0];
    expect(adminRow).toMatchObject({ provider_instance_id: row.provider_instance_id, simulated: true });
    expect(adminRow).not.toHaveProperty("root_password_enc");
    expect(JSON.stringify(adminRow)).not.toContain(credentials.password);
  });
  it.each(["live", "simulate"])("requires an encryption key in %s mode before any provider call", async mode => {
    const { server } = await createdServer();
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='provisioning' WHERE id=?", server.id));
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await ProvisionServer.prototype.run.call({ env: { ...env, CONTABO_MODE: mode, CREDENTIALS_KEY: "" } }, { payload: { serverId: server.id } }, workflowStep());
    expect(fetcher).not.toHaveBeenCalled();
    expect(await stub().getServer(server.id)).toMatchObject({ status: "needs_attention", failure_phase: "provision", error: "凭据加密密钥尚未配置", root_password_enc: null });
  });
  it("never polls a negative VM id even after switching to live mode", async () => {
    const { server } = await createdServer();
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='provisioning',provider_instance_id=-42 WHERE id=?", server.id));
    const fetcher = vi.fn(async () => { throw Error("unexpected Contabo request"); });
    vi.stubGlobal("fetch", fetcher);
    await ProvisionServer.prototype.run.call({ env: { ...env, CONTABO_MODE: "live", STRIPE_SECRET_KEY: "sk_live_dummy" } }, { payload: { serverId: server.id } }, workflowStep());
    expect(fetcher).not.toHaveBeenCalled();
    expect(await stub().getServer(server.id)).toMatchObject({ status: "active", ipv4: "203.0.113.10" });
  });
  it("polls a linked real VM without purchasing in simulate mode", async () => {
    const { server } = await createdServer();
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='provisioning',provider_instance_id=42,provider_secret_id=7 WHERE id=?", server.id));
    const fetcher = mockContabo(async (path, options) => {
      expect(path).toBe("/v1/compute/instances/42");
      expect(options.method).toBe("GET");
      return instanceResponse();
    });
    await ProvisionServer.prototype.run.call({ env: { ...env, CONTABO_MODE: "simulate" } }, { payload: { serverId: server.id } }, workflowStep());
    expect(fetcher.mock.calls.filter(([url]) => String(url).startsWith("https://api.contabo.com"))).toHaveLength(1);
    expect(await stub().getServer(server.id)).toMatchObject({ status: "active", provider_instance_id: 42, ipv4: "192.0.2.1" });
  });
  it("does not activate a simulated VM after termination was requested", async () => {
    const { server } = await createdServer();
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='provisioning' WHERE id=?", server.id));
    const step = workflowStep();
    step.sleep.mockImplementation(async () => {
      await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='terminating',termination_requested=1 WHERE id=?", server.id));
    });
    await ProvisionServer.prototype.run.call({ env: { ...env, CONTABO_MODE: "simulate" } }, { payload: { serverId: server.id } }, step);
    expect(await stub().getServer(server.id)).toMatchObject({ status: "terminating", ipv4: null, termination_requested: 1 });
  });
  it.each([
    ["simulate", 42, "sk_live_dummy"],
    ["simulate", -42, "sk_live_dummy"],
    ["live", -42, "sk_live_dummy"],
    ["live", 42, "sk_test_dummy"],
  ])("tears down without Contabo calls in mode %s with VM %s and key %s", async (mode, vmId, stripeKey) => {
    const { server } = await createdServer();
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='terminating',termination_requested=1,provider_instance_id=?,provider_secret_id=7,ipv4='192.0.2.1' WHERE id=?", vmId, server.id));
    const fetcher = vi.fn(async () => { throw Error("unexpected Contabo request"); });
    vi.stubGlobal("fetch", fetcher);
    await TeardownServer.prototype.run.call({ env: { ...env, CONTABO_MODE: mode, STRIPE_SECRET_KEY: stripeKey } }, { payload: { serverId: server.id } }, workflowStep());
    expect(fetcher).not.toHaveBeenCalled();
    expect(await stub().getServer(server.id)).toMatchObject({ status: "terminated", ipv4: null });
  });
  it("waits for an in-flight simulated purchase before terminating", async () => {
    const { server } = await createdServer();
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='terminating',termination_requested=1,purchase_inflight=1 WHERE id=?", server.id));
    const fetcher = vi.fn(async () => { throw Error("unexpected Contabo request"); });
    vi.stubGlobal("fetch", fetcher);
    const step = workflowStep();
    step.sleep.mockImplementation(async () => { await stub().finishPurchase(server.id, -42, null); });
    await TeardownServer.prototype.run.call({ env: { ...env, CONTABO_MODE: "simulate" } }, { payload: { serverId: server.id } }, step);
    expect(step.sleep).toHaveBeenCalledOnce();
    expect(fetcher).not.toHaveBeenCalled();
    expect(await stub().getServer(server.id)).toMatchObject({ status: "terminated", provider_instance_id: -42, purchase_inflight: 0 });
  });
  it("creates a password secret and purchases the exact instance once", async () => {
    const { server, session } = await createdServer();
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='provisioning',provider_product_id='V154-12m' WHERE id=?", server.id));
    const calls = [];
    mockContabo(async (path, options) => {
      calls.push([path, options.method, options.body && JSON.parse(options.body)]);
      if (path === "/v1/secrets") return responseJson({ data: [{ secretId: 7 }] });
      if (path === "/v1/compute/instances") return responseJson({ data: [{ instanceId: 42 }] });
      if (path === "/v1/compute/instances/42") return instanceResponse("running", { name: "example.test" });
      throw Error("unexpected outbound request");
    });
    const workflow = await introspectWorkflowInstance(env.PROVISION, server.id);
    try {
      await env.PROVISION.create({ id: server.id, params: { serverId: server.id } });
      await workflow.waitForStatus("complete");
      const row = await stub().getServer(server.id);
      expect(row).toMatchObject({ status: "active", provider_instance_id: 42, provider_secret_id: 7, ipv4: "192.0.2.1", hostname: "example.test" });
      const credentials = await (await request(`/api/servers/${server.id}/credentials`, { headers: { Cookie: session } })).json();
      expect(credentials).toEqual({ username: "root", password: await decryptText(env, row.root_password_enc), ipv4: "192.0.2.1" });
      expect(calls).toEqual([
        ["/v1/secrets", "POST", { name: "kelaodeyun-" + server.id, value: credentials.password, type: "password" }],
        ["/v1/compute/instances", "POST", { imageId: env.CONTABO_IMAGE_ID, productId: "V154", region: "SIN", rootPassword: 7, period: 12, displayName: "kelaodeyun-" + server.id.slice(0, 8), defaultUser: "root" }],
        ["/v1/compute/instances/42", "GET", undefined],
      ]);
      const second = await introspectWorkflowInstance(env.PROVISION, server.id + "-again");
      try {
        await env.PROVISION.create({ id: server.id + "-again", params: { serverId: server.id } });
        await second.waitForStatus("complete");
      } finally { await second.dispose(); }
      expect(calls.filter(([path]) => path === "/v1/compute/instances")).toHaveLength(1);
    } finally { await workflow.dispose(); }
  });
  it("reuses a saved password and secret when provisioning is retried", async () => {
    const { server } = await createdServer();
    const encrypted = await encryptText(env, "KnownPassword123!@");
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='provisioning',provider_secret_id=7,root_password_enc=? WHERE id=?", encrypted, server.id));
    const calls = [];
    mockContabo(async (path, options) => {
      calls.push(path);
      if (path === "/v1/compute/instances" && options.method === "POST") { expect(JSON.parse(options.body).rootPassword).toBe(7); return responseJson({ data: [{ instanceId: 42 }] }); }
      if (path === "/v1/compute/instances/42") return instanceResponse();
      throw Error("unexpected request");
    });
    await ProvisionServer.prototype.run.call({ env }, { payload: { serverId: server.id } }, workflowStep());
    expect(calls).toEqual(["/v1/compute/instances", "/v1/compute/instances/42"]);
    expect((await stub().getServer(server.id)).status).toBe("active");
    expect((await stub().getServer(server.id)).root_password_enc).toBe(encrypted);
  });
  it("keeps the same password and does not create a second secret after a purchase retry", async () => {
    const { server, session } = await createdServer();
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='provisioning' WHERE id=?", server.id));
    let password, secrets = 0, purchases = 0;
    mockContabo(async (path, options) => {
      if (path === "/v1/secrets") { secrets++; password = JSON.parse(options.body).value; return responseJson({ data: [{ secretId: 7 }] }); }
      if (path === "/v1/compute/instances") return ++purchases === 1 ? responseJson({}, 422) : responseJson({ data: [{ instanceId: 42 }] });
      if (path === "/v1/compute/instances/42") return instanceResponse();
      throw Error("unexpected outbound request");
    });
    await ProvisionServer.prototype.run.call({ env }, { payload: { serverId: server.id } }, workflowStep());
    const first = await stub().getServer(server.id);
    expect(first.status).toBe("needs_attention");
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='provisioning',error=NULL,failure_phase=NULL WHERE id=?", server.id));
    await ProvisionServer.prototype.run.call({ env }, { payload: { serverId: server.id } }, workflowStep());
    const second = await stub().getServer(server.id);
    expect(second.root_password_enc).toBe(first.root_password_enc);
    expect(secrets).toBe(1);
    expect(purchases).toBe(2);
    expect((await (await request(`/api/servers/${server.id}/credentials`, { headers: { Cookie: session } })).json()).password).toBe(password);
  });
  it("waits for an in-flight password secret before terminating and deletes it", async () => {
    const { server } = await createdServer();
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='provisioning' WHERE id=?", server.id));
    let release, signalWaiting, teardown;
    const gate = new Promise(resolve => { release = resolve; });
    const waiting = new Promise(resolve => { signalWaiting = resolve; });
    const teardownStep = workflowStep();
    teardownStep.sleep.mockImplementation(async () => { signalWaiting(); await gate; });
    const calls = [];
    mockContabo(async (path, options) => {
      calls.push([path, options.method]);
      if (path === "/v1/secrets" && options.method === "POST") {
        await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='terminating',termination_requested=1 WHERE id=?", server.id));
        teardown = TeardownServer.prototype.run.call({ env }, { payload: { serverId: server.id } }, teardownStep);
        await waiting;
        return responseJson({ data: [{ secretId: 7 }] });
      }
      if (path === "/v1/secrets/7" && options.method === "DELETE") return new Response(null, { status: 204 });
      throw Error("unexpected outbound request");
    });
    await ProvisionServer.prototype.run.call({ env }, { payload: { serverId: server.id } }, workflowStep());
    release();
    await teardown;
    expect(await stub().getServer(server.id)).toMatchObject({ status: "terminated", provider_secret_id: 7, secret_inflight: 0, provider_instance_id: null, root_password_enc: null });
    expect(calls).toEqual([["/v1/secrets", "POST"], ["/v1/secrets/7", "DELETE"]]);
  });
  it.each([
    ["error", "服务器开通失败，请在 Contabo 控制台核对"],
    ["product_not_available", "服务器开通失败，请在 Contabo 控制台核对"],
    ["verification_required", "Contabo 账户需要验证或付款，请在 Contabo 控制台处理"],
    ["pending_payment", "Contabo 账户需要验证或付款，请在 Contabo 控制台处理"],
  ])("marks %s provisioning status for attention", async (status, error) => {
    const { server } = await createdServer();
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='provisioning',provider_instance_id=42 WHERE id=?", server.id));
    mockContabo(async () => instanceResponse(status));
    await ProvisionServer.prototype.run.call({ env }, { payload: { serverId: server.id } }, workflowStep());
    expect(await stub().getServer(server.id)).toMatchObject({ status: "needs_attention", error });
  });
  it("does not repeat an interrupted in-flight purchase", async () => {
    const { server } = await createdServer();
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='purchasing',purchase_inflight=1 WHERE id=?", server.id));
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await ProvisionServer.prototype.run.call({ env }, { payload: { serverId: server.id } }, workflowStep());
    expect(fetcher).not.toHaveBeenCalled();
    expect(await stub().getServer(server.id)).toMatchObject({ status: "needs_attention", error: "购买结果未知，请在 Contabo 控制台核对" });
  });
  it.each(["provision", "teardown"])("never sends a legacy server ID to Contabo during %s", async phase => {
    const { server } = await createdServer();
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET provider_product_id=?,provider_instance_id=42,status=?,termination_requested=? WHERE id=?", "old-provider-plan", phase === "teardown" ? "terminating" : "provisioning", phase === "teardown" ? 1 : 0, server.id));
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const workflow = phase === "teardown" ? TeardownServer : ProvisionServer;
    await workflow.prototype.run.call({ env }, { payload: { serverId: server.id } }, workflowStep());
    expect(fetcher).not.toHaveBeenCalled();
    expect(await stub().getServer(server.id)).toMatchObject({ status: "needs_attention", failure_phase: phase, error: "旧服务商服务器需人工处理，不能使用 Contabo 操作" });
  });
  it("cancels billing before reinstalling and deleting the secret on subscription deletion", async () => {
    const { server } = await createdServer();
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='active',provider_instance_id=42,provider_secret_id=7,stripe_subscription_id='sub_1' WHERE id=?", server.id));
    const calls = []; let reads = 0, cancelled = false;
    mockContabo(async (path, options) => {
      calls.push([path, options.method, options.body && JSON.parse(options.body)]);
      if (path === "/v1/compute/instances/42" && options.method === "GET") return instanceResponse(++reads === 4 ? "installing" : "running", { cancelDate: cancelled ? "2033-05-18" : "" });
      if (path === "/v1/compute/instances/42" && options.method === "PUT") return responseJson({ data: [{ instanceId: 42 }] });
      if (path === "/v1/compute/instances/42/cancel") { cancelled = true; return responseJson({ data: [{ instanceId: 42 }] }); }
      if (path === "/v1/secrets/7") return new Response(null, { status: 204 });
      throw Error("unexpected outbound request");
    });
    const workflow = await introspectWorkflowInstance(env.TEARDOWN, server.id);
    try {
      await workflow.modify(async m => m.disableSleeps());
      expect((await signedEvent({ id: "evt_delete", type: "customer.subscription.deleted", data: { object: { id: "sub_1", status: "canceled" } } })).status).toBe(200);
      await workflow.waitForStatus("complete");
      expect((await stub().getServer(server.id)).status).toBe("terminated");
      expect(calls).toEqual([
        ["/v1/compute/instances/42", "GET", undefined],
        ["/v1/compute/instances/42/cancel", "POST", {}],
        ["/v1/compute/instances/42", "GET", undefined],
        ["/v1/compute/instances/42", "GET", undefined],
        ["/v1/compute/instances/42", "PUT", { imageId: env.CONTABO_IMAGE_ID, defaultUser: "root" }],
        ["/v1/compute/instances/42", "GET", undefined],
        ["/v1/compute/instances/42", "GET", undefined],
        ["/v1/secrets/7", "DELETE", undefined],
      ]);
    } finally { await workflow.dispose(); }
  });
  it.each(["cancelled", "missing"])("handles a %s VM during teardown", async state => {
    const { server } = await createdServer();
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='terminating',termination_requested=1,provider_instance_id=42,provider_secret_id=7 WHERE id=?", server.id));
    const calls = [];
    mockContabo(async (path, options) => {
      calls.push([path, options.method]);
      if (path === "/v1/compute/instances/42" && options.method === "GET") return state === "missing" ? responseJson({}, 404) : instanceResponse("stopped", { cancelDate: "2027-01-01" });
      if (path === "/v1/compute/instances/42" && options.method === "PUT") return responseJson({});
      if (path === "/v1/secrets/7") return responseJson({}, 404);
      throw Error("unexpected outbound request");
    });
    await TeardownServer.prototype.run.call({ env }, { payload: { serverId: server.id } }, workflowStep());
    expect((await stub().getServer(server.id)).status).toBe("terminated");
    expect(calls.some(([path, method]) => path === "/v1/compute/instances/42" && method === "PUT")).toBe(state === "cancelled");
    expect(calls.some(([path]) => path.endsWith("/cancel"))).toBe(false);
    expect(calls.at(-1)).toEqual(["/v1/secrets/7", "DELETE"]);
  });
  it("does not cancel if reinstall fails", async () => {
    const { server } = await createdServer();
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='terminating',termination_requested=1,provider_instance_id=42,provider_secret_id=7 WHERE id=?", server.id));
    let reads = 0;
    const fetcher = mockContabo(async (path, options) => {
      if (path === "/v1/compute/instances/42" && options.method === "GET") return instanceResponse(++reads === 1 ? "running" : "error");
      if (path === "/v1/compute/instances/42" && options.method === "PUT") return responseJson({});
      throw Error("unexpected outbound request");
    });
    await TeardownServer.prototype.run.call({ env }, { payload: { serverId: server.id } }, workflowStep());
    expect(await stub().getServer(server.id)).toMatchObject({ status: "needs_attention", error: "服务器清理失败：reinstall" });
    expect(fetcher.mock.calls.some(([url]) => String(url).endsWith("/cancel"))).toBe(false);
  });
  it.each([{ pastDue: 0, status: "active" }, { pastDue: 1, status: "past_due" }])("links an existing VM without buying again ($status)", async ({ pastDue, status }) => {
    const { server } = await createdServer();
    const admin = getSession(await login(googlePayload({ email: "admin@example.com" })));
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='needs_attention',failure_phase='provision',provider_secret_id=7,payment_past_due=? WHERE id=?", pastDue, server.id));
    let matching = false, invalid = false;
    const fetcher = mockContabo(async path => {
      if (path === "/v1/compute/instances/42") return invalid ? new Response("invalid JSON", { status: 200 }) : instanceResponse("running", { instanceId: matching ? 42 : 43 });
      throw Error("unexpected outbound request");
    });
    const path = `/api/admin/servers/${server.id}/link-vm`;
    expect((await request(path, post({ vmId: 0 }, admin))).status).toBe(400);
    expect((await request(path, post({ vmId: "42" }, admin))).status).toBe(400);
    invalid = true;
    expect((await request(path, post({ vmId: 42 }, admin))).status).toBe(500);
    invalid = false;
    expect((await request(path, post({ vmId: 42 }, admin))).status).toBe(502);
    expect((await request(path, { ...post({ vmId: 42 }, admin), headers: { ...post({}, admin).headers, Origin: "https://evil.test" } })).status).toBe(403);
    matching = true;
    expect((await request(path, post({ vmId: 42 }, admin))).status).toBe(200);
    await vi.waitFor(async () => expect(await stub().getServer(server.id)).toMatchObject({ status, provider_instance_id: 42, provider_secret_id: 7, ipv4: "192.0.2.1" }), { timeout: 5000, interval: 20 });
    expect(fetcher.mock.calls.some(([url, options]) => String(url).endsWith("/v1/compute/instances") && options.method === "POST")).toBe(false);
  });
  it("classifies a 422 purchase rejection as safe for operator retry", async () => {
    const { server } = await createdServer();
    const admin = getSession(await login(googlePayload({ email: "admin@example.com" })));
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='provisioning' WHERE id=?", server.id));
    mockContabo(async (path, options) => {
      if (path === "/v1/secrets") return responseJson({ data: [{ secretId: 7 }] });
      if (path === "/v1/compute/instances" && options.method === "POST") return responseJson({ detail: "sensitive provider content" }, 422);
      throw Error("unexpected outbound request");
    });
    const workflow = await introspectWorkflowInstance(env.PROVISION, server.id);
    try {
      await env.PROVISION.create({ id: server.id, params: { serverId: server.id } });
      await workflow.waitForStatus("complete");
      expect(await stub().getServer(server.id)).toMatchObject({ status: "needs_attention", provider_secret_id: 7, error: "Contabo 拒绝购买（HTTP 422），未购买成功，可修正配置后重试" });
      expect((await request(`/api/admin/servers/${server.id}/retry`, post({}, admin))).status).toBe(200);
    } finally { await workflow.dispose(); }
  });
  it.each(["http timeout", "rate limit", "server error", "invalid JSON", "missing instance"])("%s purchase remains uncertain", async failure => {
    const { server } = await createdServer();
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='provisioning' WHERE id=?", server.id));
    mockContabo(async (path, options) => {
      if (path === "/v1/secrets") return responseJson({ data: [{ secretId: 7 }] });
      if (path === "/v1/compute/instances" && options.method === "POST") {
        if (failure === "http timeout") return responseJson({}, 408);
        if (failure === "rate limit") return responseJson({}, 429);
        if (failure === "server error") return responseJson({}, 500);
        if (failure === "missing instance") return responseJson({ data: [] });
        return new Response("not JSON", { status: 200 });
      }
      throw Error("unexpected outbound request");
    });
    const workflow = await introspectWorkflowInstance(env.PROVISION, server.id);
    try {
      await env.PROVISION.create({ id: server.id, params: { serverId: server.id } });
      await workflow.waitForStatus("complete");
      expect(await stub().getServer(server.id)).toMatchObject({ status: "needs_attention", error: "购买结果未知，请在 Contabo 控制台核对" });
    } finally { await workflow.dispose(); }
  });
  it("does not claim termination when a purchase outcome is unknown", async () => {
    const { server } = await createdServer();
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='needs_attention',failure_phase='provision',stripe_subscription_id='sub_1',provider_secret_id=7 WHERE id=?", server.id));
    const workflow = await introspectWorkflowInstance(env.TEARDOWN, server.id);
    try {
      await signedEvent({ id: "evt_unknown", type: "customer.subscription.deleted", data: { object: { id: "sub_1", status: "canceled" } } });
      await workflow.waitForStatus("complete");
      expect(await stub().getServer(server.id)).toMatchObject({ status: "needs_attention", failure_phase: "teardown", termination_requested: 1 });
    } finally { await workflow.dispose(); }
  });
  it("refuses provisioning retry when a VM exists", async () => {
    const admin = getSession(await login(googlePayload({ email: "admin@example.com" })));
    const mocks = mockCommerce();
    await request("/api/checkout", post({ priceId: monthPrice, dataCenterId: "SIN" }, admin));
    const server = await runInDurableObject(stub(), instance => {
      const row = instance.get("SELECT * FROM servers");
      instance.run("UPDATE servers SET status='needs_attention',provider_instance_id=42,provider_secret_id=7 WHERE id=?", row.id);
      return row;
    });
    expect((await request(`/api/admin/servers/${server.id}/retry`, post({}, admin))).status).toBe(409);
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET provider_instance_id=NULL WHERE id=?", server.id));
    expect((await request(`/api/admin/servers/${server.id}/retry`, post({}, admin))).status).toBe(200);
  });
});
