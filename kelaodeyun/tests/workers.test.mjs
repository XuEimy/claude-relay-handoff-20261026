import { env } from "cloudflare:workers";
import { abortAllDurableObjects, runInDurableObject, reset, introspectWorkflowInstance } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../worker/index.js";
import { ProvisionServer, TeardownServer } from "../worker/workflows.js";

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
const sshKey = type => {
  const bytes = new TextEncoder().encode(type);
  return type + " " + btoa(String.fromCharCode(0, 0, 0, bytes.length, ...bytes, 1, 2, 3));
};
const hostResponse = (data, status = 200) => Response.json(data, { status });
const monthPrice = "hostingercom-vps-kvm2-usd-1m", yearPrice = "hostingercom-vps-kvm2-usd-1y";
const catalog = [
  { id: "hostingercom-vps-kvm2", name: "KVM 2", category: "VPS", metadata: { cpus: "2", memory: "8192", disk_space: "102400", bandwidth: "8192000", network: "300" }, prices: [
    { id: monthPrice, currency: "USD", price: 2449, first_period_price: 1399, period: 1, period_unit: "month" },
    { id: yearPrice, currency: "USD", price: 20388, first_period_price: 9999, period: 1, period_unit: "year" },
    { id: "hostingercom-vps-kvm2-usd-2y", currency: "USD", price: 35976, period: 2, period_unit: "year" },
    { id: "wrong-currency", currency: "EUR", price: 2000, period: 1, period_unit: "month" },
    { id: "bad-price", currency: "USD", price: 0, period: 1, period_unit: "month" },
    { id: "too-long", currency: "USD", price: 2000, period: 4, period_unit: "year" },
  ] },
  { id: "hostingercom-vps-kvmminecraft2", name: "Game Panel", category: "VPS", metadata: { cpus: "2" }, prices: [{ id: "game", currency: "USD", price: 1000, period: 1, period_unit: "month" }] },
];
const workflowStep = () => ({
  do: async (_name, ...args) => args.at(-1)(),
  sleep: vi.fn(async () => {}),
});
function mockCommerce({ product = "existing", coupon = "existing", catalogData = catalog } = {}) {
  let checkoutBody, productBody, couponBody, retrieves = 0, couponRetrieves = 0;
  const fetcher = vi.fn(async (url, options = {}) => {
    const address = String(url);
    if (address.endsWith("/api/billing/v1/catalog?category=VPS")) return hostResponse(catalogData);
    if (address.endsWith("/v1/products/kld_hostingercom_vps_kvm2")) {
      retrieves++;
      if ((product === "missing" || product === "conflict") && retrieves === 1) return hostResponse({ error: { type: "invalid_request_error", code: "resource_missing", message: "No such product" } }, 404);
      return hostResponse({ id: "kld_hostingercom_vps_kvm2" });
    }
    if (address.endsWith("/v1/products") && options.method === "POST") {
      productBody = String(options.body);
      if (product === "conflict") return hostResponse({ error: { type: "invalid_request_error", code: "resource_already_exists", message: "Product exists" } }, 400);
      return hostResponse({ id: "kld_hostingercom_vps_kvm2" });
    }
    const couponMatch = address.match(/\/v1\/coupons\/([^/?]+)$/);
    if (couponMatch) {
      couponRetrieves++;
      if (coupon === "error") return hostResponse({ error: { type: "api_error", message: "Stripe unavailable" } }, 500);
      if ((coupon === "missing" || coupon === "conflict") && couponRetrieves === 1) return hostResponse({ error: { type: "invalid_request_error", code: "resource_missing", message: "No such coupon" } }, 404);
      return hostResponse({ id: decodeURIComponent(couponMatch[1]) });
    }
    if (address.endsWith("/v1/coupons") && options.method === "POST") {
      couponBody = String(options.body);
      if (coupon === "conflict") return hostResponse({ error: { type: "invalid_request_error", code: "resource_already_exists", message: "Coupon exists" } }, 400);
      return hostResponse({ id: new URLSearchParams(couponBody).get("id") });
    }
    if (address.includes("/api/vps/v1/data-centers")) return hostResponse([{ id: 1, city: "London", location: "gb", continent: "Europe" }]);
    if (address.endsWith("/v1/customers")) return hostResponse({ id: "cus_1" });
    if (address.endsWith("/v1/checkout/sessions")) { checkoutBody = String(options.body); return hostResponse({ id: "cs_1", url: "https://checkout.stripe.test" }); }
    if (address.endsWith("/v1/subscriptions/sub_1")) return hostResponse({ id: "sub_1", current_period_end: 2000000000 });
    throw Error("unexpected outbound request: " + address);
  });
  vi.stubGlobal("fetch", fetcher);
  return { fetcher, checkoutBody: () => checkoutBody, productBody: () => productBody, retrieves: () => retrieves, couponBody: () => couponBody, couponRetrieves: () => couponRetrieves };
}
async function createdServer() {
  const response = await login();
  const session = getSession(response);
  const mocks = mockCommerce();
  const checkout = await request("/api/checkout", post({ priceId: monthPrice, dataCenterId: 1, publicKey: sshKey("ssh-ed25519") }, session));
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
beforeEach(() => vi.restoreAllMocks());
afterEach(async () => { vi.unstubAllGlobals(); await reset(); });

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
  it("serves cached Hostinger catalog prices without requiring Stripe", async () => {
    const mocks = mockCommerce();
    const original = await runInDurableObject(stub(), instance => { const key = instance.env.STRIPE_SECRET_KEY; instance.env.STRIPE_SECRET_KEY = ""; return key; });
    try {
      const response = await request("/api/plans");
      expect(response.status).toBe(200);
      const plans = await response.json();
      expect(plans).toHaveLength(1);
      expect(plans[0]).toEqual({
        id: "hostingercom-vps-kvm2", name: "KVM 2", specs: { cpu: 2, ramGb: 8, diskGb: 100, bandwidthTb: 8 },
        prices: [
          { priceId: monthPrice, interval: "month", intervalCount: 1, firstAmount: 2099, amount: 3674, currency: "usd" },
          { priceId: yearPrice, interval: "year", intervalCount: 1, firstAmount: 14999, amount: 30582, currency: "usd" },
          { priceId: "hostingercom-vps-kvm2-usd-2y", interval: "year", intervalCount: 2, firstAmount: 53964, amount: 53964, currency: "usd" },
        ],
      });
      await request("/api/plans");
      expect(mocks.fetcher.mock.calls.filter(([url]) => String(url).includes("/api/billing/v1/catalog"))).toHaveLength(1);
      const ttl = await runInDurableObject(stub(), instance => instance.plansCache.expires - Date.now());
      expect(ttl).toBeGreaterThan(590000);
      expect(ttl).toBeLessThanOrEqual(600000);
      await runInDurableObject(stub(), instance => { instance.plansCache.expires = 0; });
      await request("/api/plans");
      expect(mocks.fetcher.mock.calls.filter(([url]) => String(url).includes("/api/billing/v1/catalog"))).toHaveLength(2);
      expect(mocks.fetcher.mock.calls.some(([url]) => String(url).startsWith("https://api.stripe.com"))).toBe(false);
    } finally { await runInDurableObject(stub(), instance => { instance.env.STRIPE_SECRET_KEY = original; }); }
  });
  it.each(["", "0.9", "Infinity", "invalid"])("rejects invalid price multiplier %s", async value => {
    mockCommerce();
    const original = await runInDurableObject(stub(), instance => { const previous = instance.env.PRICE_MULTIPLIER; instance.env.PRICE_MULTIPLIER = value; return previous; });
    try { expect((await request("/api/plans")).status).toBe(503); }
    finally { await runInDurableObject(stub(), instance => { instance.env.PRICE_MULTIPLIER = original; }); }
  });
  it("rejects bad SSH keys and unknown prices, and starts a subscription checkout", async () => {
    const response = await login(), session = getSession(response), mocks = mockCommerce({ product: "missing" });
    for (const key of ["ssh-dss AAAA", "ssh-rsa !!!!", "ssh-rsa " + sshKey("ssh-ed25519").split(" ")[1]]) {
      expect((await request("/api/checkout", post({ priceId: yearPrice, dataCenterId: 1, publicKey: key }, session))).status).toBe(400);
    }
    expect((await request("/api/checkout", post({ priceId: "unknown", dataCenterId: 1, publicKey: sshKey("ssh-ed25519") }, session))).status).toBe(400);
    const checkout = await request("/api/checkout", post({ priceId: yearPrice, dataCenterId: 1, publicKey: sshKey("ssh-ed25519"), amount: 1, firstAmount: 1 }, session));
    expect(await checkout.json()).toEqual({ url: "https://checkout.stripe.test" });
    const rows = await runInDurableObject(stub(), instance => instance.all("SELECT * FROM servers"));
    expect(rows[0]).toMatchObject({ status: "pending_payment", stripe_price_id: "dynamic", interval: "year", interval_count: 1, amount: 30582, first_amount: 14999, hostinger_item_id: yearPrice });
    const checkoutParams = new URLSearchParams(mocks.checkoutBody());
    expect(checkoutParams.get("client_reference_id")).toBe(rows[0].id);
    expect(checkoutParams.get("line_items[0][price_data][unit_amount]")).toBe("30582");
    expect(checkoutParams.get("line_items[0][price_data][currency]")).toBe("usd");
    expect(checkoutParams.get("line_items[0][price_data][product]")).toBe("kld_hostingercom_vps_kvm2");
    expect(checkoutParams.get("line_items[0][price_data][recurring][interval]")).toBe("year");
    expect(checkoutParams.get("line_items[0][price_data][recurring][interval_count]")).toBe("1");
    const productParams = new URLSearchParams(mocks.productBody());
    expect(productParams.get("id")).toBe("kld_hostingercom_vps_kvm2");
    expect(productParams.get("name")).toBe("KVM 2");
    expect(productParams.get("metadata[hostinger_item]")).toBe("hostingercom-vps-kvm2");
  });
  it("recovers from concurrent Stripe product creation", async () => {
    const session = getSession(await login()), mocks = mockCommerce({ product: "conflict" });
    const response = await request("/api/checkout", post({ priceId: yearPrice, dataCenterId: 1, publicKey: sshKey("ssh-ed25519") }, session));
    expect(response.status, await response.clone().text()).toBe(200);
    expect(mocks.retrieves()).toBe(2);
  });
  it("creates a one-time coupon for the first period while recurring at the regular price", async () => {
    const session = getSession(await login()), mocks = mockCommerce({ coupon: "missing" });
    const response = await request("/api/checkout", post({ priceId: monthPrice, dataCenterId: 1, publicKey: sshKey("ssh-ed25519"), amount: 1, firstAmount: 1 }, session));
    expect(response.status, await response.clone().text()).toBe(200);
    const couponId = "kld_first_hostingercom_vps_kvm2_usd_1m_2099_3674";
    const checkoutParams = new URLSearchParams(mocks.checkoutBody());
    expect(checkoutParams.get("line_items[0][price_data][unit_amount]")).toBe("3674");
    expect(checkoutParams.get("discounts[0][coupon]")).toBe(couponId);
    const couponParams = new URLSearchParams(mocks.couponBody());
    expect(Object.fromEntries(couponParams)).toMatchObject({ id: couponId, amount_off: "1575", currency: "usd", duration: "once", name: "首期优惠" });
    const row = await runInDurableObject(stub(), instance => instance.get("SELECT * FROM servers"));
    expect(row).toMatchObject({ amount: 3674, first_amount: 2099, hostinger_item_id: monthPrice });
  });
  it("reuses an existing coupon without creating a new one", async () => {
    const session = getSession(await login()), mocks = mockCommerce();
    const response = await request("/api/checkout", post({ priceId: monthPrice, dataCenterId: 1, publicKey: sshKey("ssh-ed25519") }, session));
    expect(response.status, await response.clone().text()).toBe(200);
    expect(mocks.couponRetrieves()).toBe(1);
    expect(mocks.couponBody()).toBeUndefined();
    expect(new URLSearchParams(mocks.checkoutBody()).get("discounts[0][coupon]")).toBe("kld_first_hostingercom_vps_kvm2_usd_1m_2099_3674");
  });
  it("recovers from concurrent coupon creation", async () => {
    const session = getSession(await login()), mocks = mockCommerce({ coupon: "conflict" });
    const response = await request("/api/checkout", post({ priceId: monthPrice, dataCenterId: 1, publicKey: sshKey("ssh-ed25519") }, session));
    expect(response.status, await response.clone().text()).toBe(200);
    expect(mocks.couponRetrieves()).toBe(2);
    expect(new URLSearchParams(mocks.checkoutBody()).get("discounts[0][coupon]")).toBe("kld_first_hostingercom_vps_kvm2_usd_1m_2099_3674");
  });
  it("does not create a coupon when retrieval fails for another reason", async () => {
    const session = getSession(await login()), mocks = mockCommerce({ coupon: "error" });
    const response = await request("/api/checkout", post({ priceId: monthPrice, dataCenterId: 1, publicKey: sshKey("ssh-ed25519") }, session));
    expect(response.status).toBe(500);
    expect(mocks.couponBody()).toBeUndefined();
    expect(mocks.checkoutBody()).toBeUndefined();
  });
  it.each([
    ["missing", undefined], ["zero", 0], ["negative", -1], ["fractional", 1399.5],
    ["string", "1399"], ["equal", 2449], ["higher", 3000],
  ])("uses the regular price and no coupon when the first-period price is %s", async (_name, first) => {
    const session = getSession(await login());
    const catalogData = [{ ...catalog[0], prices: [{ ...catalog[0].prices[0], first_period_price: first }] }];
    const mocks = mockCommerce({ catalogData });
    const plans = await (await request("/api/plans")).json();
    expect(plans[0].prices[0]).toMatchObject({ firstAmount: 3674, amount: 3674 });
    const response = await request("/api/checkout", post({ priceId: monthPrice, dataCenterId: 1, publicKey: sshKey("ssh-ed25519") }, session));
    expect(response.status, await response.clone().text()).toBe(200);
    expect(new URLSearchParams(mocks.checkoutBody()).has("discounts[0][coupon]")).toBe(false);
    expect(mocks.couponRetrieves()).toBe(0);
    const row = await runInDurableObject(stub(), instance => instance.get("SELECT * FROM servers"));
    expect(row).toMatchObject({ amount: 3674, first_amount: 3674 });
  });
  it("migrates existing server rows without first_amount", async () => {
    const { server } = await createdServer(), object = stub();
    await runInDurableObject(object, instance => instance.run("ALTER TABLE servers DROP COLUMN first_amount"));
    await abortAllDurableObjects();
    const row = await stub().getServer(server.id);
    expect(row).toMatchObject({ id: server.id, amount: 3674, first_amount: null });
  });
  it("stores a two-year cycle and sends its exact recurring interval to Stripe", async () => {
    const session = getSession(await login()), mocks = mockCommerce();
    const priceId = "hostingercom-vps-kvm2-usd-2y";
    const response = await request("/api/checkout", post({ priceId, dataCenterId: 1, publicKey: sshKey("ssh-ed25519") }, session));
    expect(response.status, await response.clone().text()).toBe(200);
    const row = await runInDurableObject(stub(), instance => instance.get("SELECT * FROM servers"));
    expect(row).toMatchObject({ interval: "year", interval_count: 2, amount: 53964, first_amount: 53964, hostinger_item_id: priceId });
    const params = new URLSearchParams(mocks.checkoutBody());
    expect(params.get("line_items[0][price_data][recurring][interval]")).toBe("year");
    expect(params.get("line_items[0][price_data][recurring][interval_count]")).toBe("2");
    const account = (await (await request("/api/servers", { headers: { Cookie: session } })).json())[0];
    expect(account).toMatchObject({ interval: "year", interval_count: 2, amount: 53964 });
  });
  it("applies the two-year first-period promotion while retaining the regular recurring amount", async () => {
    const session = getSession(await login());
    const catalogData = [{ ...catalog[0], prices: catalog[0].prices.map(price => price.id.endsWith("-2y") ? { ...price, first_period_price: 21096 } : price) }];
    const mocks = mockCommerce({ catalogData, coupon: "missing" });
    const response = await request("/api/checkout", post({ priceId: "hostingercom-vps-kvm2-usd-2y", dataCenterId: 1, publicKey: sshKey("ssh-ed25519") }, session));
    expect(response.status, await response.clone().text()).toBe(200);
    const checkout = new URLSearchParams(mocks.checkoutBody());
    expect(checkout.get("line_items[0][price_data][unit_amount]")).toBe("53964");
    expect(checkout.get("line_items[0][price_data][recurring][interval_count]")).toBe("2");
    expect(checkout.get("discounts[0][coupon]")).toBe("kld_first_hostingercom_vps_kvm2_usd_2y_31644_53964");
    expect(new URLSearchParams(mocks.couponBody()).get("amount_off")).toBe("22320");
    const row = await runInDurableObject(stub(), instance => instance.get("SELECT * FROM servers"));
    expect(row).toMatchObject({ amount: 53964, first_amount: 31644, interval: "year", interval_count: 2 });
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
    expect(data.servers[0]).toMatchObject({ id: server.id, interval: "month", interval_count: 1, amount: 3674, data_center_id: 1, hostinger_vm_id: null, simulated: false, failure_phase: null, created: expect.any(String), updated: expect.any(String) });
    expect(data.accounts[0]).toMatchObject({ email: "admin@example.com", name: "管理员", avatar: "https://example.test/avatar.png", created: expect.any(String) });
    expect(data.servers[0]).not.toHaveProperty("public_key");
  });
  it("tracks payment failures during provisioning and recovery", async () => {
    const { server } = await createdServer();
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='provisioning',stripe_subscription_id='sub_1' WHERE id=?", server.id));
    expect((await signedEvent({ id: "evt_failed", type: "invoice.payment_failed", data: { object: { subscription: "sub_1" } } })).status).toBe(200);
    expect((await stub().getServer(server.id)).status).toBe("past_due");
    await stub().activate(server.id, "192.0.2.1", "host.test");
    expect((await stub().getServer(server.id)).status).toBe("past_due");
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
    const workflow = await introspectWorkflowInstance(env.TEARDOWN, server.id);
    try {
      const event = { id: "evt_canceled_checkout", type: "checkout.session.completed", data: { object: { mode: "subscription", payment_status: "paid", customer: "cus_1", subscription: { id: "sub_1", status: "canceled" }, client_reference_id: server.id } } };
      expect((await signedEvent(event)).status).toBe(200);
      await workflow.waitForStatus("complete");
      expect(await stub().getServer(server.id)).toMatchObject({ status: "terminated", termination_requested: 1, hostinger_vm_id: null });
    } finally { await workflow.dispose(); }
  });
  it("links an unpaid checkout without provisioning, then provisions once after async payment", async () => {
    const { server } = await createdServer();
    const binding = env.PROVISION, tracker = await trackProvision();
    const object = { mode: "subscription", payment_status: "unpaid", customer: "cus_1", subscription: { id: "sub_1", status: "active" }, client_reference_id: server.id };
    let purchases = 0;
    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
      const address = String(url);
      if (address.endsWith("/virtual-machines") && options.method === "POST") { purchases++; return hostResponse({ virtual_machine: { id: 42, subscription_id: "hs_1" } }); }
      if (address.endsWith("/virtual-machines/42")) return hostResponse({ state: "running", ipv4: [{ address: "192.0.2.1" }] });
      throw Error("unexpected outbound request");
    }));
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
    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
      if (String(url).endsWith("/virtual-machines") && options.method === "POST") return hostResponse({ virtual_machine: { id: 42 } });
      if (String(url).endsWith("/virtual-machines/42")) return hostResponse({ state: "running", ipv4: [{ address: "192.0.2.1" }] });
      throw Error("unexpected outbound request");
    }));
    const workflow = await introspectWorkflowInstance(env.PROVISION, server.id);
    try {
      expect((await signedEvent({ id: "evt_free", type: "checkout.session.completed", data: { object } })).status).toBe(200);
      await workflow.waitForStatus("complete");
      expect((await stub().getServer(server.id)).status).toBe("active");
    } finally { await workflow.dispose(); }
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
    const { server, session, mocks } = await createdServer();
    expect(mocks.fetcher.mock.calls.some(([url]) => String(url).endsWith("/api/vps/v1/data-centers"))).toBe(true);
    expect((await (await request("/api/servers", { headers: { Cookie: session } })).json())[0].simulated).toBe(false);
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='provisioning' WHERE id=?", server.id));
    const fetcher = vi.fn(async () => { throw Error("unexpected Hostinger request"); });
    vi.stubGlobal("fetch", fetcher);
    const step = workflowStep();
    step.sleep.mockImplementation(async (name, duration) => {
      expect([name, duration]).toEqual(["simulate wait", "20 seconds"]);
      expect(await stub().getServer(server.id)).toMatchObject({ status: "provisioning", hostinger_vm_id: expect.any(Number), hostinger_subscription_id: null, ipv4: null });
      expect((await stub().getServer(server.id)).hostinger_vm_id).toBeLessThan(0);
    });
    await ProvisionServer.prototype.run.call({ env: { ...env, HOSTINGER_MODE: mode, STRIPE_SECRET_KEY: stripeKey } }, { payload: { serverId: server.id } }, step);
    expect(fetcher).not.toHaveBeenCalled();
    expect(step.sleep).toHaveBeenCalledTimes(1);
    const row = await stub().getServer(server.id);
    expect(row).toMatchObject({ status: "active", hostinger_subscription_id: null, ipv4: "203.0.113.10", hostname: "simulated.kelaodeyun.invalid" });
    expect(Number.isSafeInteger(row.hostinger_vm_id)).toBe(true);
    expect(row.hostinger_vm_id).toBeLessThan(0);
    const accountRow = (await (await request("/api/servers", { headers: { Cookie: session } })).json())[0];
    expect(accountRow.simulated).toBe(true);
    expect(accountRow).not.toHaveProperty("hostinger_vm_id");
    expect(accountRow).not.toHaveProperty("public_key");
    const admin = getSession(await login(googlePayload({ email: "admin@example.com" })));
    const adminRow = (await (await request("/api/admin/overview", { headers: { Cookie: admin } })).json()).servers[0];
    expect(adminRow).toMatchObject({ hostinger_vm_id: row.hostinger_vm_id, simulated: true });
  });
  it("never polls a negative VM id even after switching to live mode", async () => {
    const { server } = await createdServer();
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='provisioning',hostinger_vm_id=-42 WHERE id=?", server.id));
    const fetcher = vi.fn(async () => { throw Error("unexpected Hostinger request"); });
    vi.stubGlobal("fetch", fetcher);
    await ProvisionServer.prototype.run.call({ env: { ...env, HOSTINGER_MODE: "live", STRIPE_SECRET_KEY: "sk_live_dummy" } }, { payload: { serverId: server.id } }, workflowStep());
    expect(fetcher).not.toHaveBeenCalled();
    expect(await stub().getServer(server.id)).toMatchObject({ status: "active", ipv4: "203.0.113.10" });
  });
  it("polls a linked real VM without purchasing in simulate mode", async () => {
    const { server } = await createdServer();
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='provisioning',hostinger_vm_id=42,hostinger_subscription_id='hs_1' WHERE id=?", server.id));
    const fetcher = vi.fn(async (url, options = {}) => {
      expect(String(url).endsWith("/virtual-machines/42")).toBe(true);
      expect(options.method).toBe("GET");
      return hostResponse({ state: "running", ipv4: [{ address: "192.0.2.1" }] });
    });
    vi.stubGlobal("fetch", fetcher);
    await ProvisionServer.prototype.run.call({ env: { ...env, HOSTINGER_MODE: "simulate" } }, { payload: { serverId: server.id } }, workflowStep());
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await stub().getServer(server.id)).toMatchObject({ status: "active", hostinger_vm_id: 42, ipv4: "192.0.2.1" });
  });
  it("does not activate a simulated VM after termination was requested", async () => {
    const { server } = await createdServer();
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='provisioning' WHERE id=?", server.id));
    const step = workflowStep();
    step.sleep.mockImplementation(async () => {
      await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='terminating',termination_requested=1 WHERE id=?", server.id));
    });
    await ProvisionServer.prototype.run.call({ env: { ...env, HOSTINGER_MODE: "simulate" } }, { payload: { serverId: server.id } }, step);
    expect(await stub().getServer(server.id)).toMatchObject({ status: "terminating", ipv4: null, termination_requested: 1 });
  });
  it.each([
    ["simulate", 42, "sk_live_dummy"],
    ["simulate", -42, "sk_live_dummy"],
    ["live", -42, "sk_live_dummy"],
    ["live", 42, "sk_test_dummy"],
  ])("tears down without Hostinger calls in mode %s with VM %s and key %s", async (mode, vmId, stripeKey) => {
    const { server } = await createdServer();
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='terminating',termination_requested=1,hostinger_vm_id=?,hostinger_subscription_id='hs_1',ipv4='192.0.2.1' WHERE id=?", vmId, server.id));
    const fetcher = vi.fn(async () => { throw Error("unexpected Hostinger request"); });
    vi.stubGlobal("fetch", fetcher);
    await TeardownServer.prototype.run.call({ env: { ...env, HOSTINGER_MODE: mode, STRIPE_SECRET_KEY: stripeKey } }, { payload: { serverId: server.id } }, workflowStep());
    expect(fetcher).not.toHaveBeenCalled();
    expect(await stub().getServer(server.id)).toMatchObject({ status: "terminated", ipv4: null });
  });
  it("waits for an in-flight simulated purchase before terminating", async () => {
    const { server } = await createdServer();
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='terminating',termination_requested=1,purchase_inflight=1 WHERE id=?", server.id));
    const fetcher = vi.fn(async () => { throw Error("unexpected Hostinger request"); });
    vi.stubGlobal("fetch", fetcher);
    const step = workflowStep();
    step.sleep.mockImplementation(async () => { await stub().finishPurchase(server.id, -42, null); });
    await TeardownServer.prototype.run.call({ env: { ...env, HOSTINGER_MODE: "simulate" } }, { payload: { serverId: server.id } }, step);
    expect(step.sleep).toHaveBeenCalledOnce();
    expect(fetcher).not.toHaveBeenCalled();
    expect(await stub().getServer(server.id)).toMatchObject({ status: "terminated", hostinger_vm_id: -42, purchase_inflight: 0 });
  });
  it.each([
    ["success", 200, { virtual_machine: { id: 42, subscription_id: "hs_1" } }, "active"],
    ["payment pending", 202, { id: 55, subscription_id: "hs_1", status: "payment_initiated" }, "needs_attention"],
    ["network failure", 0, null, "needs_attention"],
  ])("%s: never repeats a purchase and saves the outcome", async (_name, status, result, expected) => {
    const { server } = await createdServer();
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='provisioning' WHERE id=?", server.id));
    let purchases = 0;
    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
      const address = String(url);
      if (address.endsWith("/virtual-machines") && options.method === "POST") {
        purchases++;
        if (!status) throw Error("network");
        return hostResponse(result, status);
      }
      if (address.endsWith("/virtual-machines/42")) return hostResponse({ state: "running", ipv4: [{ address: "192.0.2.1" }], hostname: "example.test" });
      throw Error("unexpected outbound request");
    }));
    const workflow = await introspectWorkflowInstance(env.PROVISION, server.id);
    try {
      await workflow.modify(async m => m.disableSleeps());
      await env.PROVISION.create({ id: server.id, params: { serverId: server.id } });
      await workflow.waitForStatus("complete");
      const row = await stub().getServer(server.id);
      expect(row.status).toBe(expected);
      if (status === 200) expect(row).toMatchObject({ hostinger_vm_id: 42, ipv4: "192.0.2.1" });
      const second = await introspectWorkflowInstance(env.PROVISION, server.id + "-again");
      try {
        await env.PROVISION.create({ id: server.id + "-again", params: { serverId: server.id } });
        await second.waitForStatus("complete");
      } finally { await second.dispose(); }
      expect(purchases).toBe(1);
    } finally { await workflow.dispose(); }
  });
  it("wipes the VM and disables provider auto-renewal on subscription deletion", async () => {
    const { server } = await createdServer();
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='active',hostinger_vm_id=42,hostinger_subscription_id='hs_1',stripe_subscription_id='sub_1' WHERE id=?", server.id));
    const calls = [];
    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
      const address = String(url);
      calls.push({ address, options });
      if (address.endsWith("/virtual-machines/42")) return hostResponse({ state: "running" });
      if (address.endsWith("/stop") || address.endsWith("/recreate")) return hostResponse({ id: 9, state: "created" });
      if (address.endsWith("/actions/9")) return hostResponse({ id: 9, state: "success" });
      if (address.endsWith("/auto-renewal/disable")) return new Response(null, { status: 204 });
      throw Error("unexpected outbound request");
    }));
    const workflow = await introspectWorkflowInstance(env.TEARDOWN, server.id);
    try {
      await workflow.modify(async m => m.disableSleeps());
      expect((await signedEvent({ id: "evt_delete", type: "customer.subscription.deleted", data: { object: { id: "sub_1", status: "canceled" } } })).status).toBe(200);
      await workflow.waitForStatus("complete");
      expect((await stub().getServer(server.id)).status).toBe("terminated");
      const wipe = calls.find(c => c.address.endsWith("/recreate"));
      const password = JSON.parse(wipe.options.body).password;
      expect(password).toMatch(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{24}$/);
      expect(calls.some(c => c.address.endsWith("/stop"))).toBe(true);
      expect(calls.some(c => c.address.endsWith("/auto-renewal/disable") && c.options.method === "DELETE")).toBe(true);
      expect(calls.filter(c => c.address.endsWith("/actions/9"))).toHaveLength(2);
    } finally { await workflow.dispose(); }
  });
  it.each(["stopped", "destroyed", "destroying", "missing"])("handles a %s VM during teardown", async state => {
    const { server } = await createdServer();
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='active',hostinger_vm_id=42,hostinger_subscription_id='hs_1',stripe_subscription_id='sub_1' WHERE id=?", server.id));
    const calls = [];
    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
      const address = String(url);
      calls.push({ address, options });
      if (address.endsWith("/virtual-machines/42")) return state === "missing" ? hostResponse({}, 404) : hostResponse({ state });
      if (address.endsWith("/recreate")) return hostResponse({ id: 9, state: "success" });
      if (address.endsWith("/auto-renewal/disable")) return new Response(null, { status: 204 });
      throw Error("unexpected outbound request");
    }));
    const workflow = await introspectWorkflowInstance(env.TEARDOWN, server.id);
    try {
      expect((await signedEvent({ id: "evt_delete", type: "customer.subscription.deleted", data: { object: { id: "sub_1", status: "canceled" } } })).status).toBe(200);
      await workflow.waitForStatus("complete");
      expect((await stub().getServer(server.id)).status).toBe("terminated");
      expect(calls.some(c => c.address.endsWith("/stop"))).toBe(false);
      expect(calls.some(c => c.address.endsWith("/recreate"))).toBe(state === "stopped");
      expect(calls.some(c => c.address.endsWith("/auto-renewal/disable"))).toBe(true);
    } finally { await workflow.dispose(); }
  });
  it.each([{ pastDue: 0, status: "active" }, { pastDue: 1, status: "past_due" }])("links a 202 order without buying again and polls the existing VM ($status)", async ({ pastDue, status }) => {
    const { server } = await createdServer();
    const admin = getSession(await login(googlePayload({ email: "admin@example.com" })));
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='provisioning',payment_past_due=? WHERE id=?", pastDue, server.id));
    let purchases = 0, matching = false, invalid = false;
    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
      const address = String(url);
      if (address.endsWith("/virtual-machines") && options.method === "POST") { purchases++; return hostResponse({ subscription_id: "hs_1", status: "payment_initiated" }, 202); }
      if (address.endsWith("/virtual-machines/42")) return invalid ? new Response("invalid JSON", { status: 200 }) : hostResponse({ id: 42, subscription_id: matching ? "hs_1" : "other", state: "running", ipv4: [{ address: "192.0.2.1" }] });
      throw Error("unexpected outbound request");
    }));
    const workflow = await introspectWorkflowInstance(env.PROVISION, server.id);
    try {
      await env.PROVISION.create({ id: server.id, params: { serverId: server.id } });
      await workflow.waitForStatus("complete");
      expect(await stub().getServer(server.id)).toMatchObject({ status: "needs_attention", hostinger_subscription_id: "hs_1" });
      const retry = await request(`/api/admin/servers/${server.id}/retry`, post({}, admin));
      expect(retry.status).toBe(409);
      expect((await retry.json()).error).toBe("Hostinger 已有订单，请在 hPanel 完成后用『关联 VM』");
      const path = `/api/admin/servers/${server.id}/link-vm`;
      expect((await request(path, post({ vmId: 0 }, admin))).status).toBe(400);
      expect((await request(path, post({ vmId: "42" }, admin))).status).toBe(400);
      invalid = true;
      expect((await request(path, post({ vmId: 42 }, admin))).status).toBe(500);
      invalid = false;
      expect((await request(path, post({ vmId: 42 }, admin))).status).toBe(409);
      expect((await request(path, { ...post({ vmId: 42 }, admin), headers: { ...post({}, admin).headers, Origin: "https://evil.test" } })).status).toBe(403);
      matching = true;
      expect((await request(path, post({ vmId: 42 }, admin))).status).toBe(200);
      await vi.waitFor(async () => expect(await stub().getServer(server.id)).toMatchObject({ status, hostinger_vm_id: 42, hostinger_subscription_id: "hs_1", ipv4: "192.0.2.1" }), { timeout: 5000, interval: 20 });
      expect(purchases).toBe(1);
    } finally { await workflow.dispose(); }
  });
  it("classifies a 422 purchase rejection as safe for operator retry", async () => {
    const { server } = await createdServer();
    const admin = getSession(await login(googlePayload({ email: "admin@example.com" })));
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='provisioning' WHERE id=?", server.id));
    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
      if (String(url).endsWith("/virtual-machines") && options.method === "POST") return hostResponse({ detail: "sensitive provider content" }, 422);
      throw Error("unexpected outbound request");
    }));
    const workflow = await introspectWorkflowInstance(env.PROVISION, server.id);
    try {
      await env.PROVISION.create({ id: server.id, params: { serverId: server.id } });
      await workflow.waitForStatus("complete");
      expect(await stub().getServer(server.id)).toMatchObject({ status: "needs_attention", hostinger_subscription_id: null, error: "Hostinger 拒绝购买（HTTP 422），未购买成功，可修正配置后重试" });
      expect((await request(`/api/admin/servers/${server.id}/retry`, post({}, admin))).status).toBe(200);
    } finally { await workflow.dispose(); }
  });
  it.each(["http timeout", "server error", "invalid JSON"])("%s purchase remains uncertain", async failure => {
    const { server } = await createdServer();
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='provisioning' WHERE id=?", server.id));
    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
      if (String(url).endsWith("/virtual-machines") && options.method === "POST") {
        if (failure === "http timeout") return hostResponse({}, 408);
        if (failure === "server error") return hostResponse({}, 500);
        return new Response("not JSON", { status: 200 });
      }
      throw Error("unexpected outbound request");
    }));
    const workflow = await introspectWorkflowInstance(env.PROVISION, server.id);
    try {
      await env.PROVISION.create({ id: server.id, params: { serverId: server.id } });
      await workflow.waitForStatus("complete");
      expect(await stub().getServer(server.id)).toMatchObject({ status: "needs_attention", error: "购买结果未知，请在 hPanel 核对" });
    } finally { await workflow.dispose(); }
  });
  it("does not claim termination when a purchase outcome is unknown", async () => {
    const { server } = await createdServer();
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET status='needs_attention',failure_phase='provision',stripe_subscription_id='sub_1',hostinger_subscription_id='hs_1' WHERE id=?", server.id));
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
    await request("/api/checkout", post({ priceId: monthPrice, dataCenterId: 1, publicKey: sshKey("ssh-ed25519") }, admin));
    const server = await runInDurableObject(stub(), instance => {
      const row = instance.get("SELECT * FROM servers");
      instance.run("UPDATE servers SET status='needs_attention',hostinger_vm_id=42 WHERE id=?", row.id);
      return row;
    });
    expect((await request(`/api/admin/servers/${server.id}/retry`, post({}, admin))).status).toBe(409);
    await runInDurableObject(stub(), instance => instance.run("UPDATE servers SET hostinger_vm_id=NULL WHERE id=?", server.id));
    expect((await request(`/api/admin/servers/${server.id}/retry`, post({}, admin))).status).toBe(200);
  });
});
