import { DurableObject } from "cloudflare:workers";
import Stripe from "stripe";
import { base64url, cookie, fail, hostinger, json, makeCookie, now, periodEnd, randomHex, redirect, safeReturn, sha256, shaHex, startWorkflow, stripeFor, validPublicKey, validText } from "./utils.js";

export class Store extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.rates = new Map();
    this.sql.exec(`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,google_sub TEXT UNIQUE NOT NULL,email TEXT NOT NULL,name TEXT,avatar TEXT,role TEXT NOT NULL,disabled INTEGER NOT NULL DEFAULT 0,stripe_customer_id TEXT UNIQUE,created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS oauth_states(state TEXT PRIMARY KEY,verifier TEXT NOT NULL,return_path TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS servers(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,stripe_price_id TEXT NOT NULL,interval TEXT NOT NULL,product_name TEXT NOT NULL,hostinger_item_id TEXT NOT NULL,data_center_id INTEGER NOT NULL,public_key TEXT NOT NULL,status TEXT NOT NULL,stripe_subscription_id TEXT UNIQUE,current_period_end INTEGER,cancel_at_period_end INTEGER NOT NULL DEFAULT 0,hostinger_vm_id INTEGER,hostinger_subscription_id TEXT,ipv4 TEXT,hostname TEXT,error TEXT,created TEXT NOT NULL,updated TEXT NOT NULL,purchase_inflight INTEGER NOT NULL DEFAULT 0,termination_requested INTEGER NOT NULL DEFAULT 0,failure_phase TEXT,payment_past_due INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS stripe_events(id TEXT PRIMARY KEY,created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS hostinger_requests(at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS feedback(id TEXT PRIMARY KEY,user_id TEXT,title TEXT NOT NULL,description TEXT NOT NULL,kind TEXT NOT NULL,created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS feedback_votes(feedback_id TEXT NOT NULL,user_id TEXT NOT NULL,vote INTEGER NOT NULL CHECK(vote IN(-1,1)),PRIMARY KEY(feedback_id,user_id));`);
    if (!this.all("PRAGMA table_info(servers)").some(column => column.name === "payment_past_due")) this.run("ALTER TABLE servers ADD COLUMN payment_past_due INTEGER NOT NULL DEFAULT 0");
  }
  all(query, ...params) { return this.sql.exec(query, ...params).toArray(); }
  get(query, ...params) { return this.all(query, ...params)[0] || null; }
  run(query, ...params) { return this.sql.exec(query, ...params); }
  rate(key, max = 120) {
    const list = (this.rates.get(key) || []).filter(t => Date.now() - t < 60000);
    if (list.length >= max) fail(429, "操作较频繁，请一分钟后再试");
    list.push(Date.now()); this.rates.set(key, list);
    if (this.rates.size > 10000) for (const [k, v] of this.rates) if (v.at(-1) < Date.now() - 60000) this.rates.delete(k);
  }
  async userFor(request) {
    const token = cookie(request, "kelaode_session");
    return /^[a-f0-9]{64}$/.test(token) ? this.get("SELECT u.* FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.hash=? AND s.expires>? AND u.disabled=0", await shaHex(token), Date.now()) : null;
  }
  async plans() {
    if (this.plansCache?.expires > Date.now()) return this.plansCache.value;
    const stripe = stripeFor(this.env), plans = [];
    for await (const product of stripe.products.list({ active: true, limit: 100 })) {
      if (product.metadata?.kelaodeyun_plan !== "true") continue;
      const prices = {};
      for await (const price of stripe.prices.list({ product: product.id, active: true, type: "recurring", limit: 100 })) {
        const interval = price.recurring?.interval;
        if (!["month", "year"].includes(interval) || price.recurring.interval_count !== 1 || price.currency !== "usd" || !price.metadata?.hostinger_item_id || !Number.isInteger(price.unit_amount)) continue;
        prices[interval] = { priceId: price.id, amount: price.unit_amount, currency: price.currency, hostingerItemId: price.metadata.hostinger_item_id };
      }
      if (Object.keys(prices).length) plans.push({ productId: product.id, name: product.name, description: product.description, specs: { cpu: product.metadata.cpu || "", ramGb: product.metadata.ram_gb || "", diskGb: product.metadata.disk_gb || "", bandwidthTb: product.metadata.bandwidth_tb || "" }, prices, order: Number(product.metadata.order) || 0 });
    }
    plans.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    this.plansCache = { value: plans, expires: Date.now() + 300000 };
    return plans;
  }
  async datacenters() {
    if (this.centersCache?.expires > Date.now()) return this.centersCache.value;
    if (this.reserveHostinger() > 0) fail(429, "请求较频繁，请稍后再试");
    const { data } = await hostinger(this.env, "/api/vps/v1/data-centers", { reserved: true });
    const value = data.map(({ id, city, location, continent }) => ({ id, city, location, continent }));
    this.centersCache = { value, expires: Date.now() + 3600000 };
    return value;
  }
  reserveHostinger() {
    return this.ctx.storage.transactionSync(() => {
      const time = Date.now();
      this.run("DELETE FROM hostinger_requests WHERE at<=?", time - 60000);
      const bucket = this.get("SELECT count(*) AS count,min(at) AS oldest FROM hostinger_requests");
      if (bucket.count >= 89) return Math.max(1, bucket.oldest + 60000 - time);
      this.run("INSERT INTO hostinger_requests VALUES(?)", time);
      return 0;
    });
  }
  feedback(user) {
    return this.all(`SELECT f.id,f.title,f.description,f.kind,f.created,
      (SELECT count(*) FROM feedback_votes WHERE feedback_id=f.id AND vote=1) AS up,
      (SELECT count(*) FROM feedback_votes WHERE feedback_id=f.id AND vote=-1) AS down,
      COALESCE((SELECT vote FROM feedback_votes WHERE feedback_id=f.id AND user_id=?),0) AS myVote
      FROM feedback f ORDER BY f.created DESC LIMIT 30`, user?.id || "");
  }
  async googleStart(request) {
    this.rate("google:" + (request.headers.get("CF-Connecting-IP") || "local"), 10);
    if (!this.env.GOOGLE_CLIENT_ID) return redirect("/login?error=configuration");
    const state = randomHex(), verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
    this.run("DELETE FROM oauth_states WHERE expires<?", Date.now());
    this.run("INSERT INTO oauth_states VALUES(?,?,?,?)", state, verifier, safeReturn(new URL(request.url).searchParams.get("return")), Date.now() + 600000);
    const params = new URLSearchParams({ client_id: this.env.GOOGLE_CLIENT_ID, redirect_uri: this.env.PUBLIC_ORIGIN + "/api/auth/google/callback", response_type: "code", scope: "openid email profile", prompt: "select_account", state, code_challenge: base64url(await sha256(verifier)), code_challenge_method: "S256" });
    return redirect("https://accounts.google.com/o/oauth2/v2/auth?" + params, [makeCookie(this.env, "kelaode_oauth", state, "/api/auth/google", 600)]);
  }
  async googleCallback(request) {
    const clear = makeCookie(this.env, "kelaode_oauth", "", "/api/auth/google", 0);
    try {
      const url = new URL(request.url), state = url.searchParams.get("state") || "", savedCookie = cookie(request, "kelaode_oauth");
      const a = new TextEncoder().encode(state), b = new TextEncoder().encode(savedCookie);
      let difference = a.length ^ b.length;
      for (let i = 0; i < Math.max(a.length, b.length); i++) difference |= (a[i] || 0) ^ (b[i] || 0);
      if (difference || !/^[a-f0-9]{64}$/.test(state)) fail(400, "state");
      const saved = this.get("SELECT * FROM oauth_states WHERE state=? AND expires>?", state, Date.now());
      if (!saved) fail(400, "state");
      this.run("DELETE FROM oauth_states WHERE state=?", state);
      const code = url.searchParams.get("code");
      if (!code) fail(400, "google");
      const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: this.env.GOOGLE_CLIENT_ID, client_secret: this.env.GOOGLE_CLIENT_SECRET, redirect_uri: this.env.PUBLIC_ORIGIN + "/api/auth/google/callback", grant_type: "authorization_code", code_verifier: saved.verifier }) });
      if (!response.ok) fail(400, "google");
      const tokens = await response.json();
      const encoded = atob(tokens.id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"));
      const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(encoded, char => char.charCodeAt(0))));
      if (!["https://accounts.google.com", "accounts.google.com"].includes(payload.iss) || payload.aud !== this.env.GOOGLE_CLIENT_ID || !Number.isFinite(payload.exp) || payload.exp <= Date.now() / 1000 || payload.email_verified !== true || !validText(payload.sub, 255) || !validText(payload.email, 320)) fail(400, "identity");
      const role = (this.env.ADMIN_EMAILS || "").split(",").map(x => x.trim().toLowerCase()).includes(payload.email.toLowerCase()) ? "admin" : "user";
      let user = this.get("SELECT * FROM users WHERE google_sub=?", payload.sub);
      if (user?.disabled) fail(403, "disabled");
      if (user) this.run("UPDATE users SET email=?,name=?,avatar=?,role=? WHERE id=?", payload.email, payload.name || "", payload.picture || "", role, user.id);
      else {
        this.run("INSERT INTO users(id,google_sub,email,name,avatar,role,created) VALUES(?,?,?,?,?,?,?)", crypto.randomUUID(), payload.sub, payload.email, payload.name || "", payload.picture || "", role, now());
        user = this.get("SELECT * FROM users WHERE google_sub=?", payload.sub);
      }
      const token = randomHex();
      this.run("DELETE FROM sessions WHERE expires<?", Date.now());
      this.run("INSERT INTO sessions VALUES(?,?,?)", await shaHex(token), user.id, Date.now() + 7 * 86400000);
      return redirect(saved.return_path, [clear, makeCookie(this.env, "kelaode_session", token, "/", 604800)]);
    } catch (error) {
      const code = ["state", "identity", "disabled", "google"].includes(error.message) ? error.message : "google";
      return redirect("/login?error=" + code, [clear]);
    }
  }
  async checkout(user, input) {
    if (!validPublicKey(input.publicKey)) fail(400, "SSH 公钥格式无效");
    if (!Number.isSafeInteger(Number(this.env.HOSTINGER_TEMPLATE_ID)) || Number(this.env.HOSTINGER_TEMPLATE_ID) <= 0 || (this.env.HOSTINGER_POST_INSTALL_SCRIPT_ID && (!Number.isSafeInteger(Number(this.env.HOSTINGER_POST_INSTALL_SCRIPT_ID)) || Number(this.env.HOSTINGER_POST_INSTALL_SCRIPT_ID) <= 0))) fail(503, "服务器模板尚未配置");
    let selection;
    for (const plan of await this.plans()) for (const [interval, price] of Object.entries(plan.prices)) if (price.priceId === input.priceId) selection = { plan, interval, price };
    if (!selection) fail(400, "套餐价格无效");
    if (!(await this.datacenters()).some(center => String(center.id) === String(input.dataCenterId))) fail(400, "数据中心无效");
    const stripe = stripeFor(this.env);
    let customer = user.stripe_customer_id;
    if (!customer) {
      const created = await stripe.customers.create({ email: user.email, name: user.name, metadata: { user_id: user.id } }, { idempotencyKey: "customer-" + user.id });
      customer = created.id;
      this.run("UPDATE users SET stripe_customer_id=? WHERE id=?", customer, user.id);
    }
    const id = crypto.randomUUID(), time = now();
    this.run("INSERT INTO servers(id,user_id,stripe_price_id,interval,product_name,hostinger_item_id,data_center_id,public_key,status,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?)", id, user.id, input.priceId, selection.interval, selection.plan.name, selection.price.hostingerItemId, Number(input.dataCenterId), input.publicKey.trim(), "pending_payment", time, time);
    const session = await stripe.checkout.sessions.create({ mode: "subscription", line_items: [{ price: input.priceId, quantity: 1 }], customer, client_reference_id: id, subscription_data: { metadata: { server_id: id, user_id: user.id } }, metadata: { server_id: id }, success_url: this.env.PUBLIC_ORIGIN + "/account?checkout=success", cancel_url: this.env.PUBLIC_ORIGIN + "/billing" });
    return { url: session.url };
  }
  async webhook(request) {
    if (!this.env.STRIPE_WEBHOOK_SECRET) fail(503, "Stripe webhook 尚未配置");
    let event;
    try { event = await stripeFor(this.env).webhooks.constructEventAsync(await request.text(), request.headers.get("stripe-signature") || "", this.env.STRIPE_WEBHOOK_SECRET, undefined, Stripe.createSubtleCryptoProvider()); }
    catch { fail(400, "签名无效"); }
    if (this.get("SELECT id FROM stripe_events WHERE id=?", event.id)) return { received: true };
    const object = event.data.object;
    if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type) && object.mode === "subscription") {
      const row = this.get("SELECT s.*,u.stripe_customer_id FROM servers s JOIN users u ON u.id=s.user_id WHERE s.id=?", object.client_reference_id);
      if (row?.stripe_customer_id && row.stripe_customer_id === (typeof object.customer === "string" ? object.customer : object.customer?.id) && object.subscription && !row.termination_requested) {
        const subId = typeof object.subscription === "string" ? object.subscription : object.subscription.id;
        if (row.stripe_subscription_id && row.stripe_subscription_id !== subId) fail(409, "订阅信息不匹配");
        if (event.type === "checkout.session.completed" && !["paid", "no_payment_required"].includes(object.payment_status)) {
          this.run("UPDATE servers SET stripe_subscription_id=?,updated=? WHERE id=?", subId, now(), row.id);
          this.run("INSERT OR IGNORE INTO stripe_events VALUES(?,?)", event.id, now());
          return { received: true };
        }
        const subscription = typeof object.subscription === "string" ? await stripeFor(this.env).subscriptions.retrieve(subId) : object.subscription;
        if (["canceled", "unpaid", "incomplete_expired"].includes(subscription.status)) {
          this.run("UPDATE servers SET stripe_subscription_id=?,termination_requested=1,status='terminating',current_period_end=?,updated=? WHERE id=? AND status!='terminated'", subId, periodEnd(subscription), now(), row.id);
          await startWorkflow(this.env.TEARDOWN, row.id);
          this.run("INSERT OR IGNORE INTO stripe_events VALUES(?,?)", event.id, now());
          return { received: true };
        }
        this.run("UPDATE servers SET stripe_subscription_id=?,status=CASE WHEN status='pending_payment' THEN 'provisioning' ELSE status END,current_period_end=?,updated=? WHERE id=?", subId, periodEnd(subscription), now(), row.id);
        if (["pending_payment", "provisioning", "past_due"].includes(row.status) && !row.hostinger_vm_id) await startWorkflow(this.env.PROVISION, row.id);
      }
    } else if (["checkout.session.expired", "checkout.session.async_payment_failed"].includes(event.type)) {
      this.run("UPDATE servers SET status='checkout_expired',updated=? WHERE id=? AND status='pending_payment'", now(), object.client_reference_id || "");
    } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const row = this.get("SELECT s.* FROM servers s JOIN users u ON u.id=s.user_id WHERE s.stripe_subscription_id=? OR (s.id=? AND s.stripe_subscription_id IS NULL AND u.stripe_customer_id=?)", object.id, object.metadata?.server_id || "", typeof object.customer === "string" ? object.customer : object.customer?.id || "");
      if (row) {
        const ending = event.type.endsWith(".deleted") || ["canceled", "unpaid", "incomplete_expired"].includes(object.status);
        if (ending && row.status !== "terminated") {
          this.run("UPDATE servers SET stripe_subscription_id=COALESCE(stripe_subscription_id,?),termination_requested=1,status='terminating',current_period_end=?,cancel_at_period_end=?,updated=? WHERE id=?", object.id, periodEnd(object), object.cancel_at_period_end ? 1 : 0, now(), row.id);
          await startWorkflow(this.env.TEARDOWN, row.id);
        } else if (!ending && !row.termination_requested) {
          this.run("UPDATE servers SET current_period_end=?,cancel_at_period_end=?,payment_past_due=CASE WHEN ?='past_due' THEN 1 WHEN ?='active' THEN 0 ELSE payment_past_due END,status=CASE WHEN ?='past_due' AND status IN ('provisioning','active','past_due') THEN 'past_due' WHEN ?='active' AND status='past_due' AND ipv4 IS NOT NULL THEN 'active' WHEN ?='active' AND status='past_due' AND ipv4 IS NULL THEN 'provisioning' ELSE status END,updated=? WHERE id=?", periodEnd(object), object.cancel_at_period_end ? 1 : 0, object.status, object.status, object.status, object.status, object.status, now(), row.id);
        }
      }
    } else if (event.type === "invoice.payment_failed") {
      const subId = typeof object.subscription === "string" ? object.subscription : object.parent?.subscription_details?.subscription;
      if (subId) this.run("UPDATE servers SET payment_past_due=1,status=CASE WHEN status IN ('provisioning','active','past_due') THEN 'past_due' ELSE status END,updated=? WHERE stripe_subscription_id=? AND termination_requested=0", now(), subId);
    }
    this.run("INSERT OR IGNORE INTO stripe_events VALUES(?,?)", event.id, now());
    return { received: true };
  }
  async fetch(request) {
    try {
      const url = new URL(request.url), path = url.pathname, method = request.method;
      if (!["GET", "HEAD"].includes(method) && path !== "/api/stripe/webhook") {
        if (request.headers.get("origin") !== this.env.PUBLIC_ORIGIN || request.headers.get("sec-fetch-site") === "cross-site") fail(403, "请求来源不匹配");
        if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "")) fail(415, "请使用 JSON 请求");
      }
      if (path === "/api/stripe/webhook" && method === "POST") return json(await this.webhook(request));
      if (path === "/api/auth/google/start" && method === "GET") return await this.googleStart(request);
      if (path === "/api/auth/google/callback" && method === "GET") return await this.googleCallback(request);
      const user = await this.userFor(request);
      if (path === "/api/config" && method === "GET") return json({ brand: "kelaodeyun", user: user && { id: user.id, email: user.email, name: user.name, avatar: user.avatar, role: user.role }, operator: this.env.PUBLIC_OPERATOR || "", supportEmail: this.env.SUPPORT_EMAIL || "" });
      if (path === "/api/plans" && method === "GET") return json((await this.plans()).map(({ order, ...plan }) => ({ ...plan, prices: Object.fromEntries(Object.entries(plan.prices).map(([k, { hostingerItemId, ...v }]) => [k, v])) })));
      if (path === "/api/datacenters" && method === "GET") return json(await this.datacenters());
      if (path === "/api/feedback" && method === "GET") return json({ items: this.feedback(user) });
      if (!user) fail(401, "请先登录");
      this.rate(user.id);
      let input = {};
      if (!["GET", "HEAD"].includes(method)) {
        try { const text = await request.text(); if (text.length > 131072) fail(413, "请求内容过大"); input = JSON.parse(text || "{}"); if (!input || typeof input !== "object" || Array.isArray(input)) fail(400, "请求格式不正确"); }
        catch (error) { if (error.status) throw error; fail(400, "请求格式不正确"); }
      }
      if (path === "/api/logout" && method === "POST") {
        this.run("DELETE FROM sessions WHERE hash=?", await shaHex(cookie(request, "kelaode_session")));
        const response = json({ ok: true }); response.headers.append("Set-Cookie", makeCookie(this.env, "kelaode_session", "", "/", 0)); return response;
      }
      if (path === "/api/checkout" && method === "POST") return json(await this.checkout(user, input));
      if (path === "/api/portal" && method === "POST") {
        if (!user.stripe_customer_id) fail(400, "尚无订阅");
        const session = await stripeFor(this.env).billingPortal.sessions.create({ customer: user.stripe_customer_id, return_url: this.env.PUBLIC_ORIGIN + "/account" });
        return json({ url: session.url });
      }
      if (path === "/api/servers" && method === "GET") return json(this.all("SELECT id,product_name,interval,status,data_center_id,current_period_end,cancel_at_period_end,ipv4,hostname,created FROM servers WHERE user_id=? ORDER BY created DESC", user.id));
      if (path === "/api/feedback" && method === "POST") {
        this.rate("feedback:" + user.id, 3);
        if (!validText(input.title, 60) || !validText(input.description, 400)) fail(400, "请填写标题和建议内容（最多 60 / 400 字）");
        this.run("INSERT INTO feedback VALUES(?,?,?,?,?,?)", crypto.randomUUID(), user.id, input.title.trim(), input.description.trim(), "idea", now());
        return json({ items: this.feedback(user) }, 201);
      }
      const vote = path.match(/^\/api\/feedback\/([a-zA-Z0-9-]+)\/vote$/);
      if (vote && method === "POST") {
        this.rate("vote:" + user.id, 30);
        if (![0, 1, -1].includes(input.vote)) fail(400, "投票选项无效");
        if (!this.get("SELECT id FROM feedback WHERE id=?", vote[1])) fail(404, "建议不存在");
        if (input.vote === 0) this.run("DELETE FROM feedback_votes WHERE feedback_id=? AND user_id=?", vote[1], user.id);
        else this.run("INSERT INTO feedback_votes VALUES(?,?,?) ON CONFLICT(feedback_id,user_id) DO UPDATE SET vote=excluded.vote", vote[1], user.id, input.vote);
        return json({ items: this.feedback(user) });
      }
      if (path.startsWith("/api/admin/")) {
        if (user.role !== "admin") fail(403, "无权访问");
        if (path === "/api/admin/overview" && method === "GET") return json({ users: this.get("SELECT count(*) AS count FROM users").count, statuses: this.all("SELECT status,count(*) AS count FROM servers GROUP BY status"), servers: this.all("SELECT s.id,s.product_name,s.interval,s.data_center_id,s.status,s.error,s.ipv4,s.current_period_end,s.hostinger_vm_id,s.failure_phase,s.created,s.updated,u.email FROM servers s JOIN users u ON u.id=s.user_id ORDER BY s.created DESC LIMIT 100"), accounts: this.all("SELECT id,email,name,avatar,role,disabled,created FROM users ORDER BY created DESC LIMIT 100"), feedback: this.feedback(user) });
        const action = path.match(/^\/api\/admin\/servers\/([a-zA-Z0-9-]+)\/(retry|mark-terminated|link-vm)$/);
        if (action && method === "POST") {
          const row = this.get("SELECT * FROM servers WHERE id=?", action[1]);
          if (!row) fail(404, "服务器不存在");
          if (action[2] === "mark-terminated") {
            if (row.purchase_inflight) fail(409, "购买结果尚未确定");
            this.run("UPDATE servers SET status='terminated',termination_requested=1,error=NULL,updated=? WHERE id=?", now(), row.id);
          } else if (action[2] === "link-vm") {
            if (row.status !== "needs_attention" || row.failure_phase !== "provision" || row.hostinger_vm_id || row.purchase_inflight || row.termination_requested) fail(409, "当前状态不能关联服务器");
            if (!Number.isSafeInteger(input.vmId) || input.vmId <= 0) fail(400, "VM ID 无效");
            if (this.reserveHostinger() > 0) fail(429, "请求较频繁，请稍后再试");
            const { data: vm } = await hostinger(this.env, `/api/vps/v1/virtual-machines/${input.vmId}`, { reserved: true });
            if (!vm || typeof vm !== "object" || String(vm.id) !== String(input.vmId)) fail(502, "Hostinger 返回的服务器信息无效");
            if (row.hostinger_subscription_id && String(vm?.subscription_id ?? "") !== row.hostinger_subscription_id) fail(409, "VM 与 Hostinger 订单不匹配");
            const linked = this.ctx.storage.transactionSync(() => {
              const current = this.getServer(row.id);
              if (!current || current.status !== "needs_attention" || current.failure_phase !== "provision" || current.hostinger_vm_id || current.purchase_inflight || current.termination_requested || current.hostinger_subscription_id !== row.hostinger_subscription_id) return false;
              this.run("UPDATE servers SET hostinger_vm_id=?,hostinger_subscription_id=?,status=CASE WHEN payment_past_due=1 THEN 'past_due' ELSE 'provisioning' END,error=NULL,failure_phase=NULL,updated=? WHERE id=?", input.vmId, vm?.subscription_id == null ? null : String(vm.subscription_id), now(), row.id);
              return true;
            });
            if (!linked) fail(409, "服务器状态已变化，请刷新后重试");
            try { await startWorkflow(this.env.PROVISION, row.id, row.id + "-link-" + randomHex(8)); }
            catch { this.attention(row.id, "启动服务器开通失败，请联系管理员", "provision"); throw Error("启动服务器开通失败"); }
          } else if (row.status !== "needs_attention") fail(409, "当前状态不能重试");
          else if (row.failure_phase === "teardown" || row.termination_requested) {
            this.run("UPDATE servers SET status='terminating',error=NULL,updated=? WHERE id=?", now(), row.id);
            await startWorkflow(this.env.TEARDOWN, row.id, row.id + "-retry-" + randomHex(8));
          } else {
            if (row.hostinger_vm_id || row.purchase_inflight) fail(409, "请先在 hPanel 核对购买结果");
            if (row.hostinger_subscription_id) fail(409, "Hostinger 已有订单，请在 hPanel 完成后用『关联 VM』");
            this.run("UPDATE servers SET status='provisioning',error=NULL,failure_phase=NULL,updated=? WHERE id=?", now(), row.id);
            await startWorkflow(this.env.PROVISION, row.id, row.id + "-retry-" + randomHex(8));
          }
          return json({ ok: true });
        }
        const account = path.match(/^\/api\/admin\/users\/([a-zA-Z0-9-]+)\/(disable|enable)$/);
        if (account && method === "POST") { this.run("UPDATE users SET disabled=? WHERE id=?", account[2] === "disable" ? 1 : 0, account[1]); return json({ ok: true }); }
        const moderation = path.match(/^\/api\/admin\/feedback\/([a-zA-Z0-9-]+)$/);
        if (moderation && method === "DELETE") {
          this.ctx.storage.transactionSync(() => { this.run("DELETE FROM feedback_votes WHERE feedback_id=?", moderation[1]); this.run("DELETE FROM feedback WHERE id=?", moderation[1]); });
          return json({ ok: true });
        }
      }
      fail(404, "接口不存在");
    } catch (error) {
      const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 500;
      return json({ error: status !== 500 || error.status === 500 ? error.message : "服务暂时不可用，请稍后重试" }, status);
    }
  }
  getServer(id) { return this.get("SELECT * FROM servers WHERE id=?", id); }
  beginPurchase(id) {
    return this.ctx.storage.transactionSync(() => {
      const row = this.getServer(id);
      if (!row || row.termination_requested || row.hostinger_vm_id || row.status === "needs_attention") return null;
      if (row.hostinger_subscription_id) {
        this.run("UPDATE servers SET status='needs_attention',error=?,failure_phase='provision',purchase_inflight=0,updated=? WHERE id=?", "Hostinger 已有订单，请在 hPanel 完成后用『关联 VM』", now(), id);
        return null;
      }
      if (row.purchase_inflight || row.status === "purchasing") {
        this.run("UPDATE servers SET status='needs_attention',error=?,failure_phase='provision',purchase_inflight=0,updated=? WHERE id=?", "购买结果未知，请在 hPanel 核对", now(), id);
        return null;
      }
      if (!["provisioning", "past_due"].includes(row.status)) return null;
      this.run("UPDATE servers SET status='purchasing',purchase_inflight=1,updated=? WHERE id=?", now(), id);
      return row;
    });
  }
  finishPurchase(id, vmId, subscriptionId) {
    return this.ctx.storage.transactionSync(() => {
      const previous = this.getServer(id);
      this.run("UPDATE servers SET hostinger_vm_id=?,hostinger_subscription_id=?,purchase_inflight=0,status=CASE WHEN termination_requested=1 THEN 'terminating' WHEN payment_past_due=1 THEN 'past_due' ELSE 'provisioning' END,updated=? WHERE id=?", vmId, subscriptionId || null, now(), id);
      return { ...this.getServer(id), recoverTeardown: previous?.status === "needs_attention" };
    });
  }
  attention(id, message, phase, subscriptionId = null) {
    this.run("UPDATE servers SET status='needs_attention',error=?,failure_phase=?,purchase_inflight=0,hostinger_subscription_id=COALESCE(?,hostinger_subscription_id),updated=? WHERE id=? AND status!='terminated'", message, phase, subscriptionId, now(), id);
  }
  activate(id, ipv4, hostname) {
    this.run("UPDATE servers SET status=CASE WHEN payment_past_due=1 THEN 'past_due' ELSE 'active' END,ipv4=?,hostname=?,error=NULL,updated=? WHERE id=? AND status IN ('provisioning','past_due') AND termination_requested=0", ipv4, hostname || "", now(), id);
  }
  terminate(id) { this.run("UPDATE servers SET status='terminated',ipv4=NULL,error=NULL,updated=? WHERE id=? AND termination_requested=1 AND purchase_inflight=0", now(), id); }
}
