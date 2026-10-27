import {
  randomBytes,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { promisify } from "node:util";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { openStore, id } from "./store.mjs";
import { createPayments } from "./payments.mjs";
import { createClaudeClient, claudeErrorMessage } from "./claude.mjs";
import { createCodeService } from "./code-service.mjs";
const scrypt = promisify(scryptCallback),
  hash = (s) => createHash("sha256").update(s).digest("hex"),
  now = () => new Date().toISOString();
const safeUser = (u) =>
  u && {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    balance: u.balance,
    disabled: !!u.disabled,
  };
const fail = (status, message) => {
  throw Object.assign(Error(message), { status });
};
const validString = (s, max = 100) =>
  typeof s === "string" && s.trim().length > 0 && s.length <= max;
async function passwordHash(password) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + (await scrypt(password, salt, 64)).toString("hex");
}
async function passwordCheck(password, stored) {
  const [salt, h] = stored.split(":");
  const actual = await scrypt(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(h, "hex"));
}
export function createApi(env = process.env, fetcher = fetch, options = {}) {
  const store = openStore(
    options.dbPath || env.DATABASE_PATH || resolve("data/kelaodeyun.db"),
  );
  const { get, all, run, tx, ledger } = store;
  store.db
    .exec(`CREATE TABLE IF NOT EXISTS feedback(id TEXT PRIMARY KEY,user_id TEXT,title TEXT NOT NULL,description TEXT NOT NULL,kind TEXT NOT NULL,created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS feedback_votes(feedback_id TEXT NOT NULL REFERENCES feedback(id),user_id TEXT NOT NULL REFERENCES users(id),vote INTEGER NOT NULL CHECK(vote IN(-1,1)),PRIMARY KEY(feedback_id,user_id));`);
  for (const [fid, title, description, kind] of [
    [
      "compare-models",
      "多模型并排对话",
      "同一个问题，同时看看不同模型的回答。保留上下文，找到更适合当前任务的思路。",
      "compare",
    ],
    [
      "file-history",
      "项目版本回溯",
      "每次文件修改都能回看，重要节点留一份快照，需要时恢复到之前的版本。",
      "history",
    ],
    [
      "usage-budget",
      "用量提醒与预算",
      "自定义余额提醒和每日预算，在接近上限时收到提示，使用节奏自己掌握。",
      "budget",
    ],
  ])
    run(
      "INSERT OR IGNORE INTO feedback VALUES(?,NULL,?,?,?,?)",
      fid,
      title,
      description,
      kind,
      now(),
    );
  const feedbackList = (user) =>
    all(
      `SELECT f.id,f.title,f.description,f.kind,f.created,
    (SELECT count(*) FROM feedback_votes WHERE feedback_id=f.id AND vote=1) AS up,
    (SELECT count(*) FROM feedback_votes WHERE feedback_id=f.id AND vote=-1) AS down,
    COALESCE((SELECT vote FROM feedback_votes WHERE feedback_id=f.id AND user_id=?),0) AS myVote
    FROM feedback f ORDER BY (f.user_id IS NULL) DESC,f.created DESC LIMIT 30`,
      user?.id || "",
    );
  const code = createCodeService({ store, env, runner: options.codeRunner });
  let key = env.DATA_ENCRYPTION_KEY;
  if (!key) {
    if (env.NODE_ENV === "production")
      throw Error("DATA_ENCRYPTION_KEY is required");
    if (options.dbPath === ":memory:") key = randomBytes(32).toString("hex");
    else {
      const path = resolve("data/encryption.key");
      if (existsSync(path)) key = readFileSync(path, "utf8").trim();
      else {
        key = randomBytes(32).toString("hex");
        writeFileSync(path, key, { mode: 0o600 });
      }
    }
  }
  if (!/^[a-f0-9]{64}$/i.test(key))
    throw Error("DATA_ENCRYPTION_KEY must contain 64 hex characters");
  const seal = (s) => {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv),
      body = Buffer.concat([cipher.update(s, "utf8"), cipher.final()]);
    return [
      iv.toString("hex"),
      cipher.getAuthTag().toString("hex"),
      body.toString("hex"),
    ].join(":");
  };
  const unseal = (s) => {
    const [iv, tag, body] = s.split(":");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(key, "hex"),
      Buffer.from(iv, "hex"),
    );
    decipher.setAuthTag(Buffer.from(tag, "hex"));
    return Buffer.concat([
      decipher.update(Buffer.from(body, "hex")),
      decipher.final(),
    ]).toString();
  };
  const payments = options.payments || createPayments(env, fetcher),
    rates = new Map(),
    busy = new Set();
  const audit = (actor, action, detail) =>
    run(
      "INSERT INTO audit VALUES(?,?,?,?,?)",
      id(),
      actor,
      action,
      detail,
      now(),
    );
  const rate = (key, max = 20) => {
    const recent = (rates.get(key) || []).filter((t) => Date.now() - t < 60000);
    if (recent.length >= max) fail(429, "操作较频繁，请一分钟后再试");
    recent.push(Date.now());
    rates.set(key, recent);
    if (rates.size > 10000)
      for (const [k, v] of rates)
        if (v.at(-1) < Date.now() - 60000) rates.delete(k);
  };
  const modelList = () =>
    all(
      "SELECT m.id,m.name,m.input_rate,m.output_rate,m.max_output FROM models m JOIN channels c ON m.channel_id=c.id WHERE m.enabled=1 AND c.enabled=1",
    );
  const json = (res, status, data) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
  };
  async function raw(req) {
    let size = 0,
      parts = [];
    for await (const p of req) {
      size += p.length;
      if (size > 131072) fail(413, "请求内容过大");
      parts.push(p);
    }
    return Buffer.concat(parts).toString();
  }
  const userFor = (req) => {
    const token = (req.headers.cookie || "").match(
      /(?:^|;\s*)kelaode_session=([a-f0-9]{64})(?:;|$)/,
    )?.[1];
    return token
      ? get(
          "SELECT u.* FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.hash=? AND s.expires>? AND u.disabled=0",
          hash(token),
          Date.now(),
        )
      : null;
  };
  const session = (res, user) => {
    run("DELETE FROM sessions WHERE expires<?", Date.now());
    const token = randomBytes(32).toString("hex");
    run(
      "INSERT INTO sessions VALUES(?,?,?)",
      hash(token),
      user.id,
      Date.now() + 7 * 86400000,
    );
    res.setHeader(
      "Set-Cookie",
      `kelaode_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${env.NODE_ENV === "production" ? "; Secure" : ""}`,
    );
  };
  function settlePayment(event) {
    if (!event) return;
    tx(() => {
      const order = get("SELECT * FROM orders WHERE id=?", event.id);
      if (
        !order ||
        order.provider !== event.provider ||
        order.amount !== event.amount ||
        !validString(event.transaction, 128)
      )
        fail(400, "订单校验失败");
      if (order.status === "paid") {
        if (order.transaction_id !== event.transaction)
          fail(400, "交易号不匹配");
        return;
      }
      run(
        "UPDATE orders SET status='paid',transaction_id=?,paid_at=? WHERE id=?",
        event.transaction,
        now(),
        order.id,
      );
      ledger(
        order.user_id,
        order.amount * 10000,
        "payment",
        `在线充值 ${order.id}`,
      );
    });
  }
  async function chat(req, res, user, input) {
    if (busy.has(user.id)) fail(409, "上一条回复仍在生成，请先停止");
    if (!validString(input.content, 24000))
      fail(400, "请输入消息（不超过 24000 字符）");
    const model = get(
      "SELECT m.*,c.base_url,c.api_key FROM models m JOIN channels c ON m.channel_id=c.id WHERE m.id=? AND m.enabled=1 AND c.enabled=1",
      input.model || "",
    );
    if (!model) fail(400, "此模型暂不可用");
    let conv = input.conversationId
      ? get(
          "SELECT * FROM conversations WHERE id=? AND user_id=?",
          input.conversationId,
          user.id,
        )
      : null;
    if (input.conversationId && !conv) fail(404, "会话不存在");
    const messages = conv
      ? all(
          "SELECT role,content FROM messages WHERE conversation_id=? ORDER BY rowid",
          conv.id,
        )
      : [];
    messages.push({ role: "user", content: input.content.trim() });
    if (messages.length > 100 || JSON.stringify(messages).length > 100000)
      fail(400, "会话较长，请开启新对话");
    const reserve = Math.ceil(
      (Buffer.byteLength(JSON.stringify(messages)) + 1024) * model.input_rate +
        model.max_output * model.output_rate,
    );
    const requestId = id();
    busy.add(user.id);
    try {
      tx(() => {
        if (
          get("SELECT balance FROM users WHERE id=?", user.id).balance < reserve
        )
          fail(402, "可用余额不足，请先充值");
        ledger(user.id, -reserve, "reserve", "预留本次对话额度");
        run(
          "INSERT INTO usage(id,user_id,model,reserved,status,created) VALUES(?,?,?,?,?,?)",
          requestId,
          user.id,
          model.name,
          reserve,
          "streaming",
          now(),
        );
        if (!conv) {
          conv = { id: id() };
          run(
            "INSERT INTO conversations VALUES(?,?,?,?,?)",
            conv.id,
            user.id,
            input.content.trim().slice(0, 32),
            now(),
            now(),
          );
        }
        run(
          "INSERT INTO messages VALUES(?,?,?,?,?)",
          id(),
          conv.id,
          "user",
          input.content.trim(),
          now(),
        );
      });
    } catch (e) {
      busy.delete(user.id);
      throw e;
    }
    const abort = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      abort.abort();
    }, 120000);
    res.on("close", () => abort.abort());
    let output = "",
      inputTokens = 0,
      outputTokens = 0,
      status = "failed",
      streamError = "";
    const emit = (event, data) => {
      if (!res.destroyed)
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    try {
      const client = createClaudeClient(
        model,
        unseal(model.api_key),
        env,
        fetcher,
      );
      const { data: upstream, response } = await client.messages
        .create(
          {
            model: model.upstream_id,
            messages,
            max_tokens: model.max_output,
            stream: true,
          },
          { signal: abort.signal },
        )
        .withResponse();
      if (
        !response.headers.get("content-type")?.includes("text/event-stream")
      ) {
        upstream.controller?.abort();
        await response.body?.cancel();
        throw Error("Unexpected upstream response type");
      }
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      });
      emit("meta", { conversationId: conv.id });
      let ended = false;
      for await (const data of upstream) {
        if (data.type === "error") throw Error("upstream error");
        const usage = data.message?.usage || data.usage;
        if (usage) {
          if (
            Number.isSafeInteger(usage.input_tokens) &&
            usage.input_tokens >= 0
          )
            inputTokens = usage.input_tokens;
          if (
            Number.isSafeInteger(usage.output_tokens) &&
            usage.output_tokens >= 0
          )
            outputTokens = usage.output_tokens;
        }
        if (
          data.type === "content_block_delta" &&
          data.delta?.type === "text_delta" &&
          typeof data.delta.text === "string"
        ) {
          output += data.delta.text;
          if (output.length > 200000) throw Error("output too large");
          emit("delta", { text: data.delta.text });
        }
        if (data.type === "message_stop") {
          ended = true;
          status = "complete";
          break;
        }
      }
      if (!ended) throw Error("incomplete stream");
    } catch (e) {
      status = abort.signal.aborted && !timedOut ? "stopped" : "failed";
      streamError = timedOut
        ? "模型回复超时，已保存收到的内容，请稍后再试。"
        : claudeErrorMessage(e);
    } finally {
      clearTimeout(timeout);
      abort.abort();
      const charge = Math.min(
        reserve,
        Math.ceil(
          inputTokens * model.input_rate + outputTokens * model.output_rate,
        ),
      );
      tx(() => {
        ledger(
          user.id,
          reserve - charge,
          "settlement",
          `对话结算 ${requestId}`,
        );
        run(
          "UPDATE usage SET input_tokens=?,output_tokens=?,cost=?,reserved=0,status=? WHERE id=?",
          inputTokens,
          outputTokens,
          charge,
          status,
          requestId,
        );
        if (output)
          run(
            "INSERT INTO messages VALUES(?,?,?,?,?)",
            id(),
            conv.id,
            "assistant",
            output,
            now(),
          );
        run("UPDATE conversations SET updated=? WHERE id=?", now(), conv.id);
      });
      busy.delete(user.id);
      if (!res.destroyed) {
        if (res.headersSent) {
          if (streamError) emit("error", { error: streamError });
          else emit("done", { cost: charge });
          res.end();
        } else
          json(res, 502, {
            error: streamError || "模型连接失败",
            conversationId: conv.id,
          });
      }
    }
  }
  const api = async (req, res) => {
    const path = new URL(req.url, "http://localhost").pathname;
    if (!path.startsWith("/api/")) return false;
    try {
      if (
        path.match(/^\/api\/payments\/(alipay|wechat)\/notify$/) &&
        req.method === "POST"
      ) {
        const provider = path.split("/")[3];
        try {
          const event = payments.notify(
            provider,
            await raw(req),
            new Headers(req.headers),
          );
          settlePayment(event);
          if (provider === "alipay") {
            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end("success");
          } else res.writeHead(204).end();
        } catch {
          json(res, 400, { error: "支付通知校验失败" });
        }
        return true;
      }
      if (!["GET", "HEAD"].includes(req.method)) {
        const origin = req.headers.origin,
          expected = env.PUBLIC_ORIGIN || `http://${req.headers.host}`;
        if (
          origin !== expected ||
          req.headers["sec-fetch-site"] === "cross-site"
        )
          fail(403, "请求来源不匹配");
        if (!req.headers["content-type"]?.startsWith("application/json"))
          fail(415, "请使用 JSON 请求");
      }
      const user = userFor(req),
        setup = !get("SELECT id FROM users LIMIT 1");
      if (path === "/api/config" && req.method === "GET") {
        json(res, 200, {
          brand: "kelaodeyun",
          user: safeUser(user),
          setup,
          setupRequiresToken: env.NODE_ENV === "production",
          demo: options.demo === true,
          models: modelList(),
          payments: payments.providers,
          registration: env.REGISTRATION_OPEN !== "false",
          icp: env.ICP_NUMBER || "",
          securityFiling: env.SECURITY_FILING_NUMBER || "",
          operator: env.PUBLIC_OPERATOR || "",
          supportEmail: env.SUPPORT_EMAIL || "",
        });
        return true;
      }
      let input = {};
      if (path === "/api/feedback" && req.method === "GET") {
        json(res, 200, { items: feedbackList(user) });
        return true;
      }
      if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
        try {
          input = JSON.parse((await raw(req)) || "{}");
        } catch (e) {
          if (e.status) throw e;
          fail(400, "请求格式不正确");
        }
        if (!input || typeof input !== "object" || Array.isArray(input))
          fail(400, "请求格式不正确");
      }
      const ip = req.socket.remoteAddress || "local";
      if (
        ["/api/register", "/api/login", "/api/setup"].includes(path) &&
        req.method === "POST"
      ) {
        rate("auth:" + ip, 10);
        if (
          !validString(input.email, 180) ||
          !/^\S+@\S+\.\S+$/.test(input.email) ||
          !validString(input.password, 200)
        )
          fail(400, "请填写有效邮箱和密码");
        const email = input.email.toLowerCase().trim();
        let target;
        if (path === "/api/login") {
          target = get("SELECT * FROM users WHERE email=?", email);
          if (
            !target ||
            target.disabled ||
            !(await passwordCheck(input.password, target.password))
          )
            fail(401, "邮箱或密码不正确");
        } else {
          if (input.accepted !== "on")
            fail(400, "请先阅读并同意服务说明和隐私说明");
          if (input.password.length < 10) fail(400, "密码至少需要 10 位");
          if (!validString(input.name, 40))
            fail(400, "请填写昵称（不超过 40 字）");
          if (path === "/api/setup") {
            if (!setup) fail(409, "站点已初始化");
            if (
              env.NODE_ENV === "production" &&
              (!env.SETUP_TOKEN || input.setupToken !== env.SETUP_TOKEN)
            )
              fail(403, "初始化口令不正确");
          } else {
            if (setup) fail(409, "请先初始化站点");
            if (env.REGISTRATION_OPEN === "false") fail(403, "注册暂未开放");
          }
          const encoded = await passwordHash(input.password);
          tx(() => {
            if (path === "/api/setup" && get("SELECT id FROM users LIMIT 1"))
              fail(409, "站点已初始化");
            if (get("SELECT id FROM users WHERE email=?", email))
              fail(409, "此邮箱已注册");
            const uid = id();
            run(
              "INSERT INTO users(id,email,name,password,role,created) VALUES(?,?,?,?,?,?)",
              uid,
              email,
              input.name.trim(),
              encoded,
              path === "/api/setup" ? "admin" : "user",
              now(),
            );
            target = get("SELECT * FROM users WHERE id=?", uid);
            audit(
              uid,
              "account.create",
              "Accepted preview terms/privacy 2026-10-26",
            );
          });
        }
        session(res, target);
        json(res, 200, { user: safeUser(target) });
        return true;
      }
      if (!user) fail(401, "请先登录");
      rate(user.id, 120);
      if (path === "/api/feedback" && req.method === "POST") {
        rate("feedback-create:" + user.id, 3);
        if (
          !validString(input.title, 60) ||
          !validString(input.description, 400)
        )
          fail(400, "请填写标题和建议内容（最多 60 / 400 字）");
        const fid = id();
        run(
          "INSERT INTO feedback VALUES(?,?,?,?,?,?)",
          fid,
          user.id,
          input.title.trim(),
          input.description.trim(),
          "idea",
          now(),
        );
        json(res, 201, { items: feedbackList(user) });
        return true;
      }
      const feedbackVote = path.match(
        /^\/api\/feedback\/([a-zA-Z0-9-]+)\/vote$/,
      );
      if (feedbackVote && req.method === "POST") {
        rate("feedback-vote:" + user.id, 30);
        if (![0, 1, -1].includes(input.vote)) fail(400, "投票选项无效");
        if (!get("SELECT id FROM feedback WHERE id=?", feedbackVote[1]))
          fail(404, "建议不存在");
        if (input.vote === 0)
          run(
            "DELETE FROM feedback_votes WHERE feedback_id=? AND user_id=?",
            feedbackVote[1],
            user.id,
          );
        else
          run(
            "INSERT INTO feedback_votes VALUES(?,?,?) ON CONFLICT(feedback_id,user_id) DO UPDATE SET vote=excluded.vote",
            feedbackVote[1],
            user.id,
            input.vote,
          );
        json(res, 200, { items: feedbackList(user) });
        return true;
      }
      if (
        path.startsWith("/api/code/") &&
        (await code.handle(req, res, user, path, input))
      )
        return true;
      if (path === "/api/logout" && req.method === "POST") {
        const token = (req.headers.cookie || "").match(
          /kelaode_session=([a-f0-9]{64})/,
        )?.[1];
        if (token) run("DELETE FROM sessions WHERE hash=?", hash(token));
        res.setHeader(
          "Set-Cookie",
          "kelaode_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
        );
        json(res, 200, { ok: true });
        return true;
      }
      if (path === "/api/password" && req.method === "POST") {
        rate("password:" + user.id, 5);
        if (
          typeof input.current !== "string" ||
          !validString(input.password, 200) ||
          input.password.length < 10
        )
          fail(400, "请填写原密码及至少 10 位新密码");
        if (!(await passwordCheck(input.current, user.password)))
          fail(400, "原密码不正确");
        const encoded = await passwordHash(input.password);
        tx(() => {
          run("UPDATE users SET password=? WHERE id=?", encoded, user.id);
          run("DELETE FROM sessions WHERE user_id=?", user.id);
        });
        session(res, user);
        json(res, 200, { ok: true });
        return true;
      }
      if (path === "/api/conversations" && req.method === "GET") {
        json(
          res,
          200,
          all(
            "SELECT id,title,updated FROM conversations WHERE user_id=? ORDER BY updated DESC LIMIT 200",
            user.id,
          ),
        );
        return true;
      }
      const convMatch = path.match(/^\/api\/conversations\/([\w-]+)$/);
      if (convMatch) {
        const c = get(
          "SELECT * FROM conversations WHERE id=? AND user_id=?",
          convMatch[1],
          user.id,
        );
        if (!c) fail(404, "会话不存在");
        if (req.method === "DELETE") {
          if (busy.has(user.id)) fail(409, "请先停止生成");
          run("DELETE FROM conversations WHERE id=?", c.id);
          json(res, 200, { ok: true });
        } else if (req.method === "PATCH") {
          if (!validString(input.title, 80)) fail(400, "标题不能为空");
          run(
            "UPDATE conversations SET title=? WHERE id=?",
            input.title.trim(),
            c.id,
          );
          json(res, 200, { ok: true });
        } else if (req.method === "GET")
          json(res, 200, {
            ...c,
            messages: all(
              "SELECT role,content FROM messages WHERE conversation_id=? ORDER BY rowid",
              c.id,
            ),
          });
        else fail(405, "请求方法不支持");
        return true;
      }
      if (path === "/api/chat" && req.method === "POST") {
        rate("chat:" + user.id, 20);
        await chat(req, res, user, input);
        return true;
      }
      if (path === "/api/billing" && req.method === "GET") {
        json(res, 200, {
          balance: user.balance,
          usage: all(
            "SELECT * FROM usage WHERE user_id=? ORDER BY created DESC LIMIT 100",
            user.id,
          ),
          ledger: all(
            "SELECT amount,kind,note,created FROM ledger WHERE user_id=? AND kind NOT IN ('reserve','settlement') ORDER BY created DESC LIMIT 100",
            user.id,
          ),
          orders: all(
            "SELECT id,provider,amount,status,created FROM orders WHERE user_id=? ORDER BY created DESC LIMIT 100",
            user.id,
          ),
        });
        return true;
      }
      if (path === "/api/redeem" && req.method === "POST") {
        rate("redeem:" + user.id, 5);
        if (!validString(input.code, 100)) fail(400, "请输入兑换码");
        tx(() => {
          const v = get(
            "SELECT * FROM vouchers WHERE hash=?",
            hash(input.code.trim().toUpperCase()),
          );
          if (!v || v.used_by) fail(400, "兑换码无效或已使用");
          run("UPDATE vouchers SET used_by=? WHERE hash=?", user.id, v.hash);
          ledger(user.id, v.amount, "voucher", `兑换码 ${v.label}`);
        });
        json(res, 200, { ok: true });
        return true;
      }
      if (path === "/api/orders" && req.method === "POST") {
        rate("order:" + user.id, 5);
        if (!payments.providers.find((p) => p.id === input.provider)?.enabled)
          fail(503, "此支付方式尚未开放");
        if (![1000, 5000, 10000, 20000].includes(input.amount))
          fail(400, "请选择充值金额");
        const order = {
          id: randomBytes(16).toString("hex"),
          user_id: user.id,
          provider: input.provider,
          amount: input.amount,
        };
        run(
          "INSERT INTO orders(id,user_id,provider,amount,created) VALUES(?,?,?,?,?)",
          order.id,
          user.id,
          order.provider,
          order.amount,
          now(),
        );
        try {
          const payment = await payments.create(order, !!input.mobile);
          json(res, 200, { ...order, ...payment });
        } catch {
          run(
            "UPDATE orders SET status='failed' WHERE id=? AND status='pending'",
            order.id,
          );
          fail(502, "支付下单失败，请稍后再试");
        }
        return true;
      }
      const orderMatch = path.match(/^\/api\/orders\/([\w-]+)$/);
      if (orderMatch && req.method === "GET") {
        let order = get(
          "SELECT * FROM orders WHERE id=? AND user_id=?",
          orderMatch[1],
          user.id,
        );
        if (!order) fail(404, "订单不存在");
        if (order.status === "pending") {
          rate("poll:" + user.id, 12);
          try {
            settlePayment(await payments.query(order));
          } catch {
            fail(502, "暂时无法查询支付结果，请稍后刷新");
          }
          order = get("SELECT * FROM orders WHERE id=?", order.id);
        }
        json(res, 200, { id: order.id, status: order.status });
        return true;
      }
      if (path.startsWith("/api/admin/")) {
        if (user.role !== "admin") fail(403, "需要管理员权限");
        if (path === "/api/admin/overview" && req.method === "GET") {
          json(res, 200, {
            users: all(
              "SELECT id,name,email,role,balance,disabled,created FROM users ORDER BY created DESC LIMIT 200",
            ),
            channels: all("SELECT id,name,base_url,enabled FROM channels"),
            models: all("SELECT * FROM models"),
            vouchers: all(
              "SELECT label,amount,used_by,created FROM vouchers ORDER BY created DESC LIMIT 100",
            ),
            orders: all(
              "SELECT id,user_id,provider,amount,status,created FROM orders ORDER BY created DESC LIMIT 100",
            ),
            usage: all("SELECT * FROM usage ORDER BY created DESC LIMIT 100"),
            audit: all("SELECT * FROM audit ORDER BY created DESC LIMIT 100"),
            payments: payments.providers,
          });
          return true;
        }
        const channelModels = path.match(
          /^\/api\/admin\/channels\/([\w-]+)\/models$/,
        );
        if (channelModels && req.method === "POST") {
          rate("channel-models:" + user.id, 6);
          const channel = get(
            "SELECT * FROM channels WHERE id=?",
            channelModels[1],
          );
          if (!channel) fail(404, "渠道不存在");
          try {
            const client = createClaudeClient(
              channel,
              unseal(channel.api_key),
              env,
              fetcher,
            );
            const page = await client.models.list(
              { limit: 100 },
              { timeout: 15000 },
            );
            if (!Array.isArray(page.data)) throw Error("Invalid model list");
            const models = page.data
              .slice(0, 100)
              .filter((m) => validString(m.id, 150))
              .map((m) => ({
                id: m.id,
                name: String(m.display_name || m.id).slice(0, 100),
              }));
            audit(user.id, "channel.models", channel.id);
            json(res, 200, { models, hasMore: page.has_more === true });
          } catch (e) {
            json(res, 502, {
              error: [404, 405, 501].includes(e.status)
                ? "此渠道未提供模型列表，请检查接口地址或手动填写模型 ID。"
                : claudeErrorMessage(e),
            });
          }
          return true;
        }
        if (path === "/api/admin/channels" && req.method === "POST") {
          if (!validString(input.name, 60) || !validString(input.base_url, 500))
            fail(400, "请填写渠道名称和地址");
          let url;
          try {
            url = new URL(input.base_url);
          } catch {
            fail(400, "上游地址无效");
          }
          if (
            url.protocol !== "https:" ||
            url.username ||
            url.password ||
            url.search ||
            url.hash
          )
            fail(400, "上游地址需要 HTTPS，且不能带密码或查询参数");
          const old = input.id
            ? get("SELECT * FROM channels WHERE id=?", input.id)
            : null;
          if (!old && !validString(input.api_key, 1000))
            fail(400, "请填写上游密钥");
          const cid = old?.id || id(),
            secret = validString(input.api_key, 1000)
              ? seal(input.api_key)
              : old.api_key;
          run(
            "INSERT INTO channels VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,base_url=excluded.base_url,api_key=excluded.api_key,enabled=excluded.enabled",
            cid,
            input.name.trim(),
            url.href.replace(/\/$/, ""),
            secret,
            input.enabled === false ? 0 : 1,
          );
          audit(user.id, "channel.save", input.name);
          json(res, 200, { id: cid });
          return true;
        }
        if (path === "/api/admin/models" && req.method === "POST") {
          if (
            !validString(input.name, 60) ||
            !validString(input.upstream_id, 150) ||
            !get("SELECT id FROM channels WHERE id=?", input.channel_id || "")
          )
            fail(400, "请填写模型和有效渠道");
          for (const n of [input.input_rate, input.output_rate])
            if (
              typeof n !== "number" ||
              !Number.isFinite(n) ||
              n < 0 ||
              n > 10000
            )
              fail(400, "费率需介于 0 和 10000 元 / 百万 token");
          if (
            !Number.isInteger(input.max_output) ||
            input.max_output < 128 ||
            input.max_output > 16384
          )
            fail(400, "输出上限需介于 128 和 16384");
          const mid = input.id || id();
          run(
            "INSERT INTO models VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,upstream_id=excluded.upstream_id,channel_id=excluded.channel_id,input_rate=excluded.input_rate,output_rate=excluded.output_rate,max_output=excluded.max_output,enabled=excluded.enabled",
            mid,
            input.name,
            input.upstream_id,
            input.channel_id,
            input.input_rate,
            input.output_rate,
            input.max_output,
            input.enabled === false ? 0 : 1,
          );
          audit(user.id, "model.save", input.name);
          json(res, 200, { id: mid });
          return true;
        }
        if (path === "/api/admin/credit" && req.method === "POST") {
          if (
            !get("SELECT id FROM users WHERE id=?", input.user_id || "") ||
            !Number.isSafeInteger(input.amount) ||
            input.amount < 1 ||
            input.amount > 10000000000 ||
            !validString(input.note, 100)
          )
            fail(400, "请填写有效用户、充值金额与备注");
          tx(() => {
            ledger(input.user_id, input.amount, "admin", input.note);
            audit(
              user.id,
              "credit",
              JSON.stringify({
                user: input.user_id,
                amount: input.amount,
                note: input.note,
              }),
            );
          });
          json(res, 200, { ok: true });
          return true;
        }
        if (path === "/api/admin/users" && req.method === "POST") {
          const target = get("SELECT * FROM users WHERE id=?", input.id || "");
          if (!target || target.role === "admin") fail(400, "此账号不可禁用");
          tx(() => {
            run(
              "UPDATE users SET disabled=? WHERE id=?",
              input.disabled ? 1 : 0,
              target.id,
            );
            if (input.disabled)
              run("DELETE FROM sessions WHERE user_id=?", target.id);
            audit(
              user.id,
              "user.status",
              `${target.email}: ${input.disabled ? "禁用" : "启用"}`,
            );
          });
          json(res, 200, { ok: true });
          return true;
        }
        if (path === "/api/admin/vouchers" && req.method === "POST") {
          if (
            !Number.isSafeInteger(input.amount) ||
            input.amount < 1 ||
            input.amount > 1000000000
          )
            fail(400, "兑换金额无效");
          const code = "KLD-" + randomBytes(12).toString("hex").toUpperCase();
          run(
            "INSERT INTO vouchers VALUES(?,?,?,?,?)",
            hash(code),
            code.slice(-6),
            input.amount,
            null,
            now(),
          );
          audit(
            user.id,
            "voucher.create",
            `${code.slice(-6)} / ${input.amount}`,
          );
          json(res, 200, { code });
          return true;
        }
      }
      fail(404, "接口不存在");
    } catch (e) {
      if (!res.headersSent)
        json(res, e.status || 500, {
          error: e.status ? e.message : "服务暂时不可用，请稍后再试",
        });
      else res.end();
    }
    return true;
  };
  api.store = store;
  api.close = async () => {
    await code.close();
    store.db.close();
  };
  return api;
}
