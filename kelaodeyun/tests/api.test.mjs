import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  generateKeyPairSync,
  sign,
  createCipheriv,
  randomBytes,
} from "node:crypto";
import { createApi } from "../lib/api.mjs";
import { createPayments } from "../lib/payments.mjs";
const events = [
  {
    type: "message_start",
    message: { usage: { input_tokens: 10, output_tokens: 0 } },
  },
  {
    type: "content_block_delta",
    delta: { type: "text_delta", text: "你好，世界。" },
  },
  { type: "message_delta", usage: { output_tokens: 5 } },
  { type: "message_stop" },
];
const stream = (items) =>
  new Response(
    items.map((d) => "data: " + JSON.stringify(d) + "\n\n").join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );
async function harness(
  t,
  { upstream = async () => stream(events), payments } = {},
) {
  const api = createApi({}, upstream, { dbPath: ":memory:", payments });
  const server = http.createServer(async (req, res) => {
    if (!(await api(req, res))) res.writeHead(404).end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    api.close();
  });
  const call = async (path, body, cookie, method = "POST", extra = {}) => {
    const res = await fetch(base + "/api" + path, {
      method: body === undefined ? "GET" : method,
      headers: {
        Origin: base,
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...extra,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const raw = await res.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
    return {
      status: res.status,
      data,
      cookie: res.headers.get("set-cookie")?.split(";")[0],
    };
  };
  const admin = await call("/setup", {
    name: "管理员",
    email: "admin@example.test",
    password: "Admin-test-password",
    accepted: "on",
  });
  assert.equal(admin.status, 200);
  return { api, call, base, admin: admin.cookie, adminId: admin.data.user.id };
}
async function configure(h) {
  const c = await h.call(
    "/admin/channels",
    {
      name: "测试渠道",
      base_url: "https://upstream.example",
      api_key: "server-only-secret",
      enabled: true,
    },
    h.admin,
  );
  assert.equal(c.status, 200);
  const m = await h.call(
    "/admin/models",
    {
      name: "测试模型",
      channel_id: c.data.id,
      upstream_id: "test-model",
      input_rate: 20,
      output_rate: 60,
      max_output: 128,
    },
    h.admin,
  );
  assert.equal(m.status, 200);
  await h.call(
    "/admin/credit",
    { user_id: h.adminId, amount: 1000000, note: "测试充值" },
    h.admin,
  );
  return m.data.id;
}
test("accounts: auth, CSRF, role isolation, password invalidation", async (t) => {
  const h = await harness(t);
  assert.equal((await h.call("/admin/overview")).status, 401);
  assert.equal(
    (
      await h.call(
        "/register",
        {
          name: "用户",
          email: "user@example.test",
          password: "long-password",
          accepted: "on",
        },
        null,
        "POST",
        { Origin: "https://foreign.test" },
      )
    ).status,
    403,
  );
  const u = await h.call("/register", {
    name: "用户",
    email: "user@example.test",
    password: "long-password",
    accepted: "on",
  });
  assert.equal(u.status, 200);
  assert.equal(
    (await h.call("/admin/overview", undefined, u.cookie)).status,
    403,
  );
  assert.equal(
    (
      await h.call("/setup", {
        name: "越权",
        email: "evil@example.test",
        password: "long-password",
        accepted: "on",
      })
    ).status,
    409,
  );
  const config = await h.call("/config", undefined, u.cookie);
  assert.equal(config.data.user.password, undefined);
  const changed = await h.call(
    "/password",
    { current: "long-password", password: "changed-password" },
    u.cookie,
  );
  assert.equal(changed.status, 200);
  assert.equal((await h.call("/billing", undefined, u.cookie)).status, 401);
  assert.equal(
    (await h.call("/billing", undefined, changed.cookie)).status,
    200,
  );
});
test("chat: streams, persists ownership, settles exact usage and hides keys", async (t) => {
  let captured;
  const h = await harness(t, {
    upstream: async (url, req) => {
      captured = { url, req };
      return stream(events);
    },
  });
  const model = await configure(h);
  const result = await h.call("/chat", { model, content: "你好" }, h.admin);
  assert.equal(result.status, 200);
  assert.match(result.data, /你好，世界/);
  assert.match(result.data, /event: done/);
  assert.equal(captured.url, "https://upstream.example/v1/messages");
  assert.equal(captured.req.headers.Authorization, "Bearer server-only-secret");
  const billing = await h.call("/billing", undefined, h.admin);
  assert.equal(billing.data.usage[0].cost, 500);
  assert.equal(billing.data.balance, 999500);
  const list = await h.call("/conversations", undefined, h.admin);
  const conv = await h.call(
    "/conversations/" + list.data[0].id,
    undefined,
    h.admin,
  );
  assert.equal(conv.data.messages.length, 2);
  const u = await h.call("/register", {
    name: "另一位",
    email: "other@example.test",
    password: "long-password",
    accepted: "on",
  });
  assert.equal(
    (await h.call("/conversations/" + list.data[0].id, undefined, u.cookie))
      .status,
    404,
  );
  assert.equal(
    (await h.call("/conversations/" + list.data[0].id, {}, u.cookie, "DELETE"))
      .status,
    404,
  );
  const admin = await h.call("/admin/overview", undefined, h.admin);
  assert.ok(!JSON.stringify(admin.data).includes("server-only-secret"));
  assert.ok(
    !h.api.store
      .get("SELECT api_key FROM channels")
      .api_key.includes("server-only-secret"),
  );
});
test("model allowlist, insufficient funds, failures and truncated streams", async (t) => {
  const h = await harness(t, {
    upstream: async () => stream(events.slice(0, 2)),
  });
  const model = await configure(h);
  assert.equal(
    (await h.call("/chat", { model: "invented", content: "test" }, h.admin))
      .status,
    400,
  );
  const u = await h.call("/register", {
    name: "无余额",
    email: "empty@example.test",
    password: "long-password",
    accepted: "on",
  });
  assert.equal(
    (await h.call("/chat", { model, content: "test" }, u.cookie)).status,
    402,
  );
  const r = await h.call("/chat", { model, content: "test" }, h.admin);
  assert.match(r.data, /event: error/);
  const b = await h.call("/billing", undefined, h.admin);
  assert.equal(b.data.usage[0].status, "failed");
  assert.equal(b.data.usage[0].reserved, 0);
  assert.equal(b.data.balance, 999800);
});
test("upstream HTTP failure releases all reserved balance", async (t) => {
  const h = await harness(t, {
    upstream: async () => new Response("secret-debug", { status: 500 }),
  });
  const model = await configure(h);
  const r = await h.call("/chat", { model, content: "test" }, h.admin);
  assert.equal(r.status, 502);
  assert.ok(!JSON.stringify(r.data).includes("secret-debug"));
  assert.equal(
    (await h.call("/billing", undefined, h.admin)).data.balance,
    1000000,
  );
});
test("vouchers redeem once and admins cannot be disabled", async (t) => {
  const h = await harness(t);
  const v = await h.call("/admin/vouchers", { amount: 1000000 }, h.admin);
  const [a, b] = await Promise.all([
    h.call("/redeem", { code: v.data.code }, h.admin),
    h.call("/redeem", { code: v.data.code }, h.admin),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 400]);
  assert.equal(
    (await h.call("/billing", undefined, h.admin)).data.balance,
    1000000,
  );
  assert.equal(
    (await h.call("/admin/users", { id: h.adminId, disabled: true }, h.admin))
      .status,
    400,
  );
  assert.equal(
    (
      await h.call(
        "/admin/credit",
        { user_id: h.adminId, amount: -100, note: "invalid" },
        h.admin,
      )
    ).status,
    400,
  );
});
test("payment settlement is amount-checked, provider-checked and idempotent", async (t) => {
  let event;
  const payment = {
    providers: [{ id: "alipay", name: "支付宝", enabled: true }],
    create: async () => ({ url: "https://example.test/pay" }),
    query: async () => event,
    notify: () => event,
  };
  const h = await harness(t, { payments: payment });
  const o = await h.call(
    "/orders",
    { provider: "alipay", amount: 1000 },
    h.admin,
  );
  assert.equal(o.status, 200);
  event = {
    id: o.data.id,
    provider: "alipay",
    amount: 100,
    transaction: "trade-1",
  };
  assert.equal(
    (await h.call("/orders/" + o.data.id, undefined, h.admin)).status,
    502,
  );
  assert.equal((await h.call("/billing", undefined, h.admin)).data.balance, 0);
  event.amount = 1000;
  assert.equal(
    (await h.call("/orders/" + o.data.id, undefined, h.admin)).data.status,
    "paid",
  );
  for (let i = 0; i < 2; i++) {
    const r = await fetch(h.base + "/api/payments/alipay/notify", {
      method: "POST",
      body: "signed-body",
    });
    assert.equal(await r.text(), "success");
  }
  assert.equal(
    (await h.call("/billing", undefined, h.admin)).data.balance,
    10000000,
  );
});
test("unconfigured payment providers stay unavailable", async (t) => {
  const h = await harness(t);
  assert.equal(
    (await h.call("/orders", { provider: "wechat", amount: 1000 }, h.admin))
      .status,
    503,
  );
});
const keys = () =>
  generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
test("Alipay real RSA2 notification signature and merchant checks", () => {
  const k = keys();
  const p = createPayments({
    PUBLIC_ORIGIN: "https://site.test",
    ALIPAY_APP_ID: "app",
    ALIPAY_SELLER_ID: "seller",
    ALIPAY_PRIVATE_KEY: k.privateKey,
    ALIPAY_PUBLIC_KEY: k.publicKey,
  });
  const d = {
    app_id: "app",
    seller_id: "seller",
    trade_status: "TRADE_SUCCESS",
    out_trade_no: "order",
    total_amount: "10.00",
    trade_no: "trade",
  };
  const canonical = Object.keys(d)
    .sort()
    .map((k) => `${k}=${d[k]}`)
    .join("&");
  d.sign = sign("RSA-SHA256", Buffer.from(canonical), k.privateKey).toString(
    "base64",
  );
  d.sign_type = "RSA2";
  assert.equal(
    p.notify("alipay", new URLSearchParams(d).toString(), new Headers()).amount,
    1000,
  );
  d.total_amount = "100.00";
  assert.throws(() =>
    p.notify("alipay", new URLSearchParams(d).toString(), new Headers()),
  );
});
test("WeChat verifies pinned public key and decrypts AES-GCM notification", () => {
  const k = keys(),
    secret = "12345678901234567890123456789012";
  const p = createPayments({
    PUBLIC_ORIGIN: "https://site.test",
    WECHAT_APP_ID: "app",
    WECHAT_MCH_ID: "merchant",
    WECHAT_SERIAL_NO: "merchant-cert",
    WECHAT_PRIVATE_KEY: k.privateKey,
    WECHAT_PUBLIC_KEY: k.publicKey,
    WECHAT_PUBLIC_KEY_ID: "PUB_KEY_ID_test",
    WECHAT_API_V3_KEY: secret,
  });
  const data = {
    appid: "app",
    mchid: "merchant",
    trade_state: "SUCCESS",
    out_trade_no: "order",
    transaction_id: "trade",
    amount: { total: 1000, currency: "CNY" },
  };
  const nonce = "abcdefghijkl",
    aad = "transaction",
    cipher = createCipheriv("aes-256-gcm", Buffer.from(secret), nonce);
  cipher.setAAD(Buffer.from(aad));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(data)),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const raw = JSON.stringify({
    event_type: "TRANSACTION.SUCCESS",
    resource: {
      algorithm: "AEAD_AES_256_GCM",
      ciphertext: encrypted.toString("base64"),
      nonce,
      associated_data: aad,
    },
  });
  const ts = String(Math.floor(Date.now() / 1000)),
    n = "test-nonce";
  const signature = sign(
    "RSA-SHA256",
    Buffer.from(`${ts}\n${n}\n${raw}\n`),
    k.privateKey,
  ).toString("base64");
  const headers = new Headers({
    "wechatpay-timestamp": ts,
    "wechatpay-nonce": n,
    "wechatpay-serial": "PUB_KEY_ID_test",
    "wechatpay-signature": signature,
  });
  assert.equal(p.notify("wechat", raw, headers).amount, 1000);
  assert.throws(() => p.notify("wechat", raw + " ", headers));
  headers.set("wechatpay-serial", "attacker");
  assert.throws(() => p.notify("wechat", raw, headers));
});
test("simultaneous requests are refused and client stop releases reserved credits", async (t) => {
  let stopped = false;
  const h = await harness(t, {
    upstream: async (url, { signal }) =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(
              new TextEncoder().encode(
                "data: " + JSON.stringify(events[0]) + "\n\n",
              ),
            );
            signal.addEventListener(
              "abort",
              () => {
                stopped = true;
                c.error(new Error("aborted"));
              },
              { once: true },
            );
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      ),
  });
  const model = await configure(h);
  const r = await fetch(h.base + "/api/chat", {
    method: "POST",
    headers: {
      Origin: h.base,
      Cookie: h.admin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, content: "first" }),
  });
  const reader = r.body.getReader();
  await reader.read();
  assert.equal(
    (await h.call("/chat", { model, content: "second" }, h.admin)).status,
    409,
  );
  await reader.cancel();
  for (let i = 0; i < 30 && !stopped; i++)
    await new Promise((r) => setTimeout(r, 10));
  assert.equal(stopped, true);
  const b = await h.call("/billing", undefined, h.admin);
  assert.equal(b.data.usage[0].reserved, 0);
  assert.equal(b.data.usage[0].status, "stopped");
  assert.equal(b.data.balance, 999800);
});
test("consent is required, stored sessions are revoked when disabling a user", async (t) => {
  const h = await harness(t);
  assert.equal(
    (
      await h.call("/register", {
        name: "未同意",
        email: "no@example.test",
        password: "long-password",
      })
    ).status,
    400,
  );
  const u = await h.call("/register", {
    name: "停用测试",
    email: "disable@example.test",
    password: "long-password",
    accepted: "on",
  });
  assert.equal(u.status, 200);
  await h.call("/admin/users", { id: u.data.user.id, disabled: true }, h.admin);
  assert.equal((await h.call("/billing", undefined, u.cookie)).status, 401);
});
