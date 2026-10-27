import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    items
      .map((d) => "event: " + d.type + "\ndata: " + JSON.stringify(d) + "\n\n")
      .join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );
async function harness(
  t,
  { upstream = async () => stream(events), payments, env = {} } = {},
) {
  const api = createApi(env, upstream, { dbPath: ":memory:", payments });
  const server = http.createServer(async (req, res) => {
    if (!(await api(req, res))) res.writeHead(404).end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await api.close();
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
async function configure(h, { baseURL = "https://upstream.example" } = {}) {
  const c = await h.call(
    "/admin/channels",
    {
      name: "测试渠道",
      base_url: baseURL,
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
  assert.equal(
    new Headers(captured.req.headers).get("authorization"),
    "Bearer server-only-secret",
  );
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
                "event: message_start\ndata: " +
                  JSON.stringify(events[0]) +
                  "\n\n",
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

test("official SDK: pinned channel URL, model, history, version and workspace headers", async (t) => {
  const requests = [];
  const h = await harness(t, {
    env: {
      ANTHROPIC_VERSION: "2026-10-21",
      ANTHROPIC_WORKSPACE_ID: "workspace-test",
    },
    upstream: async (url, req) => {
      requests.push({ url, req });
      return stream(events);
    },
  });
  const model = await configure(h, { baseURL: "https://upstream.example/v1/" });
  const first = await h.call(
    "/chat",
    { model, content: "第一个问题" },
    h.admin,
  );
  const conversationId = JSON.parse(
    first.data.match(/event: meta\ndata: (.+)/)[1],
  ).conversationId;
  const second = await h.call(
    "/chat",
    { model, content: "接着说", conversationId },
    h.admin,
  );
  assert.match(second.data, /event: done/);
  assert.equal(requests.length, 2);
  for (const { url, req } of requests) {
    assert.equal(url, "https://upstream.example/v1/messages");
    const headers = new Headers(req.headers);
    assert.equal(headers.get("anthropic-version"), "2026-10-21");
    assert.equal(headers.get("anthropic-workspace-id"), "workspace-test");
    assert.equal(headers.get("authorization"), "Bearer server-only-secret");
  }
  const body = JSON.parse(requests[1].req.body);
  assert.equal(body.model, "test-model");
  assert.equal(body.max_tokens, 128);
  assert.equal(body.stream, true);
  assert.deepEqual(body.messages, [
    { role: "user", content: "第一个问题" },
    { role: "assistant", content: "你好，世界。" },
    { role: "user", content: "接着说" },
  ]);
});

test("official SDK: fragmented UTF-8, CRLF, ping and unknown events keep text and usage intact", async (t) => {
  const h = await harness(t, {
    upstream: async () => {
      const wire =
        ": heartbeat\r\n\r\nevent: ping\r\ndata: {}\r\n\r\n" +
        [{ type: "future_event", payload: true }, ...events]
          .map((e) => `event: ${e.type}\r\ndata: ${JSON.stringify(e)}\r\n\r\n`)
          .join("");
      const bytes = new TextEncoder().encode(wire);
      return new Response(
        new ReadableStream({
          start(c) {
            for (let i = 0; i < bytes.length; i += 3)
              c.enqueue(bytes.slice(i, i + 3));
            c.close();
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    },
  });
  const model = await configure(h);
  const result = await h.call(
    "/chat",
    { model, content: "中文与 emoji 🌏" },
    h.admin,
  );
  assert.match(result.data, /你好，世界。/);
  assert.match(result.data, /event: done/);
  assert.doesNotMatch(result.data, /event: error/);
  const b = await h.call("/billing", undefined, h.admin);
  assert.equal(b.data.usage[0].input_tokens, 10);
  assert.equal(b.data.usage[0].output_tokens, 5);
  assert.equal(b.data.usage[0].cost, 500);
});

test("official SDK: HTTP errors are sanitized, refunded and never automatically retried", async (t) => {
  for (const code of [401, 403, 404, 429, 500, 529])
    await t.test(String(code), async (t) => {
      let attempts = 0;
      const h = await harness(t, {
        upstream: async () => {
          attempts++;
          return Response.json(
            {
              type: "error",
              error: {
                type: "api_error",
                message: "server-only-secret private diagnostic",
              },
            },
            { status: code },
          );
        },
      });
      const model = await configure(h);
      const result = await h.call("/chat", { model, content: "test" }, h.admin);
      assert.equal(result.status, 502);
      assert.equal(attempts, 1);
      assert.doesNotMatch(
        JSON.stringify(result.data),
        /server-only-secret|private diagnostic/,
      );
      if ([429, 529].includes(code)) assert.match(result.data.error, /繁忙/);
      if ([401, 403].includes(code))
        assert.match(result.data.error, /认证失败/);
      const b = await h.call("/billing", undefined, h.admin);
      assert.equal(b.data.balance, 1000000);
      assert.equal(b.data.usage[0].reserved, 0);
      assert.equal(b.data.usage[0].status, "failed");
    });
});

test("official SDK: in-stream provider error preserves partial reply and settles known usage", async (t) => {
  const h = await harness(t, {
    upstream: async () =>
      stream([
        ...events.slice(0, 2),
        {
          type: "error",
          error: {
            type: "overloaded_error",
            message: "private debug server-only-secret",
          },
        },
      ]),
  });
  const model = await configure(h);
  const result = await h.call("/chat", { model, content: "test" }, h.admin);
  assert.match(result.data, /event: error/);
  assert.match(result.data, /繁忙/);
  assert.doesNotMatch(
    result.data,
    /private debug|server-only-secret|event: done/,
  );
  const b = await h.call("/billing", undefined, h.admin);
  assert.equal(b.data.balance, 999800);
  assert.equal(b.data.usage[0].status, "failed");
  const conv = await h.call("/conversations", undefined, h.admin);
  const details = await h.call(
    "/conversations/" + conv.data[0].id,
    undefined,
    h.admin,
  );
  assert.equal(details.data.messages[1].content, "你好，世界。");
});

test("official SDK: a successful non-SSE response is not accepted as a completed chat", async (t) => {
  const h = await harness(t, {
    upstream: async () => Response.json({ content: "private diagnostic" }),
  });
  const model = await configure(h);
  const result = await h.call("/chat", { model, content: "test" }, h.admin);
  assert.equal(result.status, 502);
  assert.doesNotMatch(JSON.stringify(result.data), /private diagnostic/);
  assert.equal(
    (await h.call("/billing", undefined, h.admin)).data.balance,
    1000000,
  );
});

test("official SDK model discovery is administrator-only, uses channel credentials and never charges balance", async (t) => {
  let captured;
  const h = await harness(t, {
    upstream: async (url, req) => {
      captured = { url, req };
      return Response.json({
        data: [
          {
            id: "claude-test",
            display_name: "Claude Test",
            type: "model",
            created_at: "2026-01-01T00:00:00Z",
            private: "server-only-secret",
          },
        ],
        has_more: false,
      });
    },
  });
  await configure(h);
  const channel = h.api.store.get("SELECT id FROM channels").id;
  const endpoint = "/admin/channels/" + channel + "/models";
  assert.equal((await h.call(endpoint, {})).status, 401);
  const u = await h.call("/register", {
    name: "用户",
    email: "models@example.test",
    password: "long-password",
    accepted: "on",
  });
  assert.equal((await h.call(endpoint, {}, u.cookie)).status, 403);
  const result = await h.call(endpoint, {}, h.admin);
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.models, [
    { id: "claude-test", name: "Claude Test" },
  ]);
  assert.equal(captured.url, "https://upstream.example/v1/models?limit=100");
  assert.equal(
    new Headers(captured.req.headers).get("authorization"),
    "Bearer server-only-secret",
  );
  assert.equal(
    (await h.call("/billing", undefined, h.admin)).data.balance,
    1000000,
  );
  assert.equal(
    (await h.call("/billing", undefined, h.admin)).data.usage.length,
    0,
  );
});

test("Code HTTP integration: authenticated project access, PUT CSRF and file versions", async (t) => {
  const root = await fs.mkdtemp(
    join(await fs.realpath(tmpdir()), "code-http-"),
  );
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const h = await harness(t, {
    env: { CODE_DEMO: "1", CODE_WORKSPACE_ROOT: root },
  });
  assert.equal((await h.call("/code/projects")).status, 401);
  const created = await h.call("/code/projects", { name: "集成测试" }, h.admin);
  assert.equal(created.status, 201);
  const prefix = "/code/projects/" + created.data.project.id;
  const original = await h.call(
    prefix + "/file?path=index.html",
    undefined,
    h.admin,
  );
  const body = {
    path: "index.html",
    content: "<h1>保存成功</h1>",
    version: original.data.version,
  };
  assert.equal(
    (
      await h.call(prefix + "/file", body, h.admin, "PUT", {
        Origin: "https://evil.invalid",
      })
    ).status,
    403,
  );
  const saved = await h.call(prefix + "/file", body, h.admin, "PUT");
  assert.equal(saved.status, 200);
  assert.equal(saved.data.content, body.content);
  assert.equal(
    (await h.call(prefix + "/file", body, h.admin, "PUT")).status,
    409,
  );
  const u = await h.call("/register", {
    name: "其他用户",
    email: "other-code@example.test",
    password: "test-password-long",
    accepted: "on",
  });
  assert.equal(
    (await h.call(prefix + "/tree", undefined, u.cookie)).status,
    404,
  );
  assert.equal(
    (await h.call(prefix + "/file?path=index.html", undefined, h.admin)).data
      .content,
    body.content,
  );
  assert.equal(
    (await h.call(prefix + "/changes", undefined, h.admin)).data.files.length,
    1,
  );
});

test("feedback: public suggestions, authenticated idempotent voting and submission", async (t) => {
  const h = await harness(t);
  const initial = await h.call("/feedback");
  assert.equal(initial.status, 200);
  assert.equal(initial.data.items.length, 3);
  const item = initial.data.items[0];
  assert.equal(item.up, 0);
  assert.equal(
    (await h.call("/feedback/" + item.id + "/vote", { vote: 1 })).status,
    401,
  );
  let voted = await h.call(
    "/feedback/" + item.id + "/vote",
    { vote: 1 },
    h.admin,
  );
  assert.equal(voted.status, 200);
  assert.equal(voted.data.items.find((v) => v.id === item.id).up, 1);
  voted = await h.call("/feedback/" + item.id + "/vote", { vote: 1 }, h.admin);
  assert.equal(voted.data.items.find((v) => v.id === item.id).up, 1);
  voted = await h.call("/feedback/" + item.id + "/vote", { vote: -1 }, h.admin);
  const switched = voted.data.items.find((v) => v.id === item.id);
  assert.equal(switched.up, 0);
  assert.equal(switched.down, 1);
  assert.equal(switched.myVote, -1);
  assert.equal(
    (await h.call("/feedback")).data.items.find((v) => v.id === item.id).myVote,
    0,
  );
  assert.equal(
    (await h.call("/feedback/" + item.id + "/vote", { vote: 2 }, h.admin))
      .status,
    400,
  );
  assert.equal(
    (
      await h.call(
        "/feedback/" + item.id + "/vote",
        { vote: 1 },
        h.admin,
        "POST",
        { Origin: "https://evil.invalid" },
      )
    ).status,
    403,
  );
  voted = await h.call("/feedback/" + item.id + "/vote", { vote: 0 }, h.admin);
  assert.equal(voted.data.items.find((v) => v.id === item.id).down, 0);
  const submitted = await h.call(
    "/feedback",
    { title: "导出会话", description: "希望能下载 Markdown 格式的聊天记录。" },
    h.admin,
  );
  assert.equal(submitted.status, 201);
  assert.ok(submitted.data.items.some((v) => v.title === "导出会话"));
});
