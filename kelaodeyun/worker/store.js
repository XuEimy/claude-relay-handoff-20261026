import { DurableObject } from "cloudflare:workers";
import Stripe from "stripe";
import { base64url, cookie, decryptText, encryptText, fail, json, makeCookie, now, paidInvoiceEnd, periodEnd, randomHex, redirect, safeReturn, sha256, shaHex, startWorkflow, stripeFor, validText } from "./utils.js";
import { CATALOG, PERIODS, REGIONS, contabo, contaboProducts, contaboSimulated } from "./contabo.js";

const locationNames = {
  EU: "European Union", UK: "United Kingdom", "US-central": "United States (Central)",
  "US-east": "United States (East)", "US-west": "United States (West)",
  SIN: "Asia (Singapore)", JPN: "Asia (Japan)", IND: "Asia (India)", AUS: "Australia (Sydney)",
};
const usdCents = prices => {
  const amount = Array.isArray(prices) ? prices.find(price => price?.currency === "USD")?.amount : undefined;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) return null;
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) ? cents : null;
};

export class Store extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.rates = new Map();
    this.billingPending = new Map();
    this.sql.exec(`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,google_sub TEXT UNIQUE NOT NULL,email TEXT NOT NULL,name TEXT,avatar TEXT,role TEXT NOT NULL,disabled INTEGER NOT NULL DEFAULT 0,stripe_customer_id TEXT UNIQUE,created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS oauth_states(state TEXT PRIMARY KEY,verifier TEXT NOT NULL,return_path TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS servers(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,stripe_price_id TEXT NOT NULL,interval TEXT NOT NULL,interval_count INTEGER NOT NULL DEFAULT 1,amount INTEGER,first_amount INTEGER,product_name TEXT NOT NULL,provider_product_id TEXT NOT NULL,region TEXT NOT NULL,public_key TEXT NOT NULL,root_password_enc TEXT,status TEXT NOT NULL,stripe_subscription_id TEXT UNIQUE,current_period_end INTEGER,cancel_at_period_end INTEGER NOT NULL DEFAULT 0,provider_instance_id INTEGER,provider_secret_id INTEGER,ipv4 TEXT,hostname TEXT,error TEXT,created TEXT NOT NULL,updated TEXT NOT NULL,purchase_inflight INTEGER NOT NULL DEFAULT 0,secret_inflight INTEGER NOT NULL DEFAULT 0,termination_requested INTEGER NOT NULL DEFAULT 0,failure_phase TEXT,payment_past_due INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS stripe_events(id TEXT PRIMARY KEY,created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS provider_requests(at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS feedback(id TEXT PRIMARY KEY,user_id TEXT,title TEXT NOT NULL,description TEXT NOT NULL,kind TEXT NOT NULL,created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS feedback_votes(feedback_id TEXT NOT NULL,user_id TEXT NOT NULL,vote INTEGER NOT NULL CHECK(vote IN(-1,1)),PRIMARY KEY(feedback_id,user_id));
      CREATE TABLE IF NOT EXISTS ssh_hosts(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,label TEXT NOT NULL,hostname TEXT NOT NULL,port INTEGER NOT NULL,username TEXT NOT NULL,auth_type TEXT NOT NULL CHECK(auth_type IN('key','password')),secret_enc TEXT NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL,UNIQUE(user_id,hostname,port,username));
      CREATE TABLE IF NOT EXISTS app_tokens(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,device TEXT NOT NULL,created TEXT NOT NULL,last_used INTEGER NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS app_codes(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,challenge TEXT NOT NULL,expires INTEGER NOT NULL);`);
    const legacy = "host" + "inger";
    if (this.all("PRAGMA table_info(servers)").some(column => column.name === legacy + "_vm_id")) {
      for (const [oldName, newName] of [[legacy + "_item_id", "provider_product_id"], ["data_center_id", "region"], [legacy + "_vm_id", "provider_instance_id"], [legacy + "_subscription_id", "provider_secret_id"]]) this.run(`ALTER TABLE servers RENAME COLUMN ${oldName} TO ${newName}`);
    }
    this.run(`DROP TABLE IF EXISTS ${legacy}_requests`);
    if (!this.all("PRAGMA table_info(servers)").some(column => column.name === "payment_past_due")) this.run("ALTER TABLE servers ADD COLUMN payment_past_due INTEGER NOT NULL DEFAULT 0");
    if (!this.all("PRAGMA table_info(servers)").some(column => column.name === "interval_count")) this.run("ALTER TABLE servers ADD COLUMN interval_count INTEGER NOT NULL DEFAULT 1");
    if (!this.all("PRAGMA table_info(servers)").some(column => column.name === "amount")) this.run("ALTER TABLE servers ADD COLUMN amount INTEGER");
    if (!this.all("PRAGMA table_info(servers)").some(column => column.name === "first_amount")) this.run("ALTER TABLE servers ADD COLUMN first_amount INTEGER");
    if (!this.all("PRAGMA table_info(servers)").some(column => column.name === "secret_inflight")) this.run("ALTER TABLE servers ADD COLUMN secret_inflight INTEGER NOT NULL DEFAULT 0");
    if (!this.all("PRAGMA table_info(servers)").some(column => column.name === "root_password_enc")) this.run("ALTER TABLE servers ADD COLUMN root_password_enc TEXT");
    for (const [name, type] of [["paid_through", "INTEGER"], ["provider_cancel_requested", "INTEGER NOT NULL DEFAULT 0"], ["provider_cancel_date", "TEXT"], ["billing_error", "TEXT"], ["billing_checked_at", "INTEGER NOT NULL DEFAULT 0"]]) {
      if (!this.all("PRAGMA table_info(servers)").some(column => column.name === name)) this.run(`ALTER TABLE servers ADD COLUMN ${name} ${type}`);
    }
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
    if (request.headers.has("authorization")) {
      const match = request.headers.get("authorization").match(/^Bearer ([a-f0-9]{64})$/);
      if (!match) fail(401, "请先登录");
      const hash = await shaHex(match[1]), time = Date.now();
      const user = this.get("SELECT u.* FROM users u JOIN app_tokens t ON u.id=t.user_id WHERE t.hash=? AND t.expires>? AND u.disabled=0", hash, time);
      if (!user) fail(401, "请先登录");
      this.run("UPDATE app_tokens SET last_used=? WHERE hash=? AND last_used<=?", time, hash, time - 3600000);
      return user;
    }
    const token = cookie(request, "kelaode_session");
    return /^[a-f0-9]{64}$/.test(token) ? this.get("SELECT u.* FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.hash=? AND s.expires>? AND u.disabled=0", await shaHex(token), Date.now()) : null;
  }
  accountHosts(user) {
    const hosts = this.all("SELECT id,label,hostname,port,username,auth_type AS authType FROM ssh_hosts WHERE user_id=? ORDER BY created", user.id).map(row => ({ ...row, source: "account" }));
    const purchased = this.all("SELECT id,product_name,ipv4 FROM servers WHERE user_id=? AND status IN ('active','past_due') AND ipv4 IS NOT NULL AND root_password_enc IS NOT NULL ORDER BY created", user.id).map(row => ({ id: "server-" + row.id, label: row.product_name, hostname: row.ipv4, port: 22, username: "root", authType: "password", source: "purchased" }));
    return [...hosts, ...purchased];
  }
  async appAuthorize(request, user) {
    const url = new URL(request.url), challenge = url.searchParams.get("challenge"), scheme = url.searchParams.get("scheme");
    if (!/^[A-Za-z0-9_-]{43}$/.test(challenge || "") || !["agentcloudos", "agentcloudos-dev", "kelaodeyun", "kelaodeyun-dev"].includes(scheme)) fail(400, "登录参数无效");
    if (!user) return redirect("/api/auth/google/start?return=" + encodeURIComponent(url.pathname + url.search));
    const code = randomHex();
    this.run("DELETE FROM app_codes WHERE expires<=?", Date.now());
    this.run("INSERT INTO app_codes VALUES(?,?,?,?)", await shaHex(code), user.id, challenge, Date.now() + 120000);
    const link = `${scheme}://app/account/callback?code=${code}`;
    const escaped = link.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return new Response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>返回 Agent Cloud OS</title><p>已登录，正在返回 Agent Cloud OS…</p><a href="${escaped}">返回 Agent Cloud OS</a><script>location.href = ${JSON.stringify(link)}</script></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
  async appToken(request, input) {
    if (typeof input.code !== "string" || !/^[a-f0-9]{64}$/.test(input.code)) fail(400, "登录码无效或已过期");
    const hash = await shaHex(input.code);
    const saved = this.get("SELECT * FROM app_codes WHERE hash=?", hash);
    this.run("DELETE FROM app_codes WHERE hash=?", hash);
    if (!saved || saved.expires <= Date.now() || typeof input.verifier !== "string" || !/^[A-Za-z0-9_-]{43,128}$/.test(input.verifier) || base64url(await sha256(input.verifier)) !== saved.challenge || !validText(input.device, 80)) fail(400, "登录码无效或已过期");
    const user = this.get("SELECT * FROM users WHERE id=? AND disabled=0", saved.user_id);
    if (!user) fail(400, "登录码无效或已过期");
    const token = randomHex(), time = Date.now();
    this.run("INSERT INTO app_tokens VALUES(?,?,?,?,?,?)", await shaHex(token), user.id, input.device.trim(), now(), time, time + 90 * 86400000);
    return { token, user: { email: user.email, name: user.name, avatar: user.avatar } };
  }
  async saveAccountHost(user, input) {
    const { hostname, username, authType, secret } = input, port = input.port ?? 22;
    const label = input.label === undefined ? hostname : input.label;
    if (typeof hostname !== "string" || !/^[A-Za-z0-9.:\[\]-]{1,253}$/.test(hostname) || hostname.startsWith("-") || !Number.isInteger(port) || port < 1 || port > 65535 || typeof username !== "string" || !/^[A-Za-z_][A-Za-z0-9_.-]{0,31}$/.test(username) || !validText(label, 80)) fail(400, "服务器信息无效");
    const keyMatch = typeof secret === "string" ? secret.match(/^-----BEGIN ([A-Z0-9 ]*PRIVATE KEY)-----\r?$/m) : null;
    const endLine = keyMatch && secret.split(/\r?\n/).includes(`-----END ${keyMatch[1]}-----`);
    if (typeof secret !== "string" || (authType === "password" ? !secret.length || secret.length > 1024 : authType === "key" ? secret.length > 16384 || !keyMatch || !endLine : true)) fail(400, "登录凭据无效");
    const encrypted = await encryptText(this.env, secret), time = now();
    const row = this.ctx.storage.transactionSync(() => {
      const existing = this.get("SELECT id FROM ssh_hosts WHERE user_id=? AND hostname=? AND port=? AND username=?", user.id, hostname, port, username);
      if (!existing && this.get("SELECT count(*) AS count FROM ssh_hosts WHERE user_id=?", user.id).count >= 50) fail(409, "账户服务器最多保存 50 台");
      const id = existing?.id || crypto.randomUUID();
      this.run("INSERT INTO ssh_hosts VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,hostname,port,username) DO UPDATE SET label=excluded.label,auth_type=excluded.auth_type,secret_enc=excluded.secret_enc,updated=excluded.updated", id, user.id, label.trim(), hostname, port, username, authType, encrypted, time, time);
      return { id, label: label.trim(), hostname, port, username, authType, source: "account" };
    });
    return row;
  }
  async plans() {
    const multiplier = Number(this.env.PRICE_MULTIPLIER);
    if (!Number.isFinite(multiplier) || multiplier < 1) fail(503, "套餐定价尚未配置");
    if (this.plansCache?.multiplier === multiplier && this.plansCache.expires > Date.now()) return this.plansCache.value;
    if (this.plansPending?.multiplier === multiplier) return this.plansPending.promise;
    const promise = (async () => {
      try {
        const products = await contaboProducts(this.env, () => this.reserveProvider());
        const plans = CATALOG.flatMap(item => {
          const product = products.find(entry => entry.priceItem.itemId === item.id);
          const monthly = usdCents(product?.priceItem?.price);
          if (!product || product.priceItem.outOfStock?.isOutOfStock || monthly === null || monthly <= 0) return [];
          const termMoney = value => usdCents([{ currency: "USD", amount: value }]);
          if (termMoney(product.termPricing?.price?.USD) !== monthly) throw Error("Contabo 价格来源不一致");
          const fees = Object.fromEntries(REGIONS.flatMap(region => {
            if (region.id === "EU") return [[region.id, 0]];
            const addon = product.addons?.find(entry => entry.type === "location" && entry.priceItem?.name === locationNames[region.id]);
            if (!addon) return [];
            const fee = Array.isArray(addon.priceItem.price) && addon.priceItem.price.length === 0 ? 0 : usdCents(addon.priceItem.price);
            return fee === null ? [] : [[region.id, fee]];
          }));
          const prices = PERIODS.map(months => {
            const term = product.termPricing.periods.find(entry => entry.length === months);
            if (!term) throw Error("Contabo 周期价格缺失");
            const setup = term.setup === undefined ? 0 : termMoney(term.setup?.USD);
            const discount = termMoney(term.discount?.USD);
            if (setup === null || discount === null || discount >= monthly * months) throw Error("invalid period price");
            const setupAmount = Math.ceil(setup * multiplier);
            const byRegion = Object.fromEntries(Object.entries(fees).map(([region, fee]) => {
              // Only the base server's first term is discounted; region fees
              // remain intact and renewal uses the undiscounted price.
              const cost = (monthly + fee) * months;
              const amount = Math.ceil(cost * multiplier), firstRecurringAmount = Math.ceil((cost - discount) * multiplier);
              const discountAmount = amount - firstRecurringAmount, firstAmount = firstRecurringAmount + setupAmount, regionAmount = Math.ceil(fee * multiplier);
              if (![amount, firstRecurringAmount, discountAmount, firstAmount, setupAmount, regionAmount].every(Number.isSafeInteger)) throw Error("invalid price");
              return [region, { amount, firstRecurringAmount, discountAmount, firstAmount, setupAmount, regionAmount }];
            }));
            return { priceId: `${item.id}-${months}m`, interval: months === 1 ? "month" : "year", intervalCount: months === 1 ? 1 : months / 12, currency: "usd", byRegion };
          });
          return [{ id: item.id, name: item.name, specs: { cpu: item.cpu, ramGb: item.ramGb, diskGb: item.diskGb, bandwidthTb: null }, prices }];
        });
        plans.sort((a, b) => a.specs.cpu - b.specs.cpu);
        this.plansCache = { multiplier, value: plans, expires: Date.now() + 3600000 };
        return plans;
      } catch { fail(503, "套餐暂时无法加载"); }
    })();
    this.plansPending = { multiplier, promise };
    try { return await promise; }
    finally { if (this.plansPending?.promise === promise) this.plansPending = null; }
  }
  async datacenters() { return REGIONS; }
  reserveProvider() {
    return this.ctx.storage.transactionSync(() => {
      const time = Date.now();
      this.run("DELETE FROM provider_requests WHERE at<=?", time - 60000);
      const bucket = this.get("SELECT count(*) AS count,min(at) AS oldest FROM provider_requests");
      if (bucket.count >= 89) return Math.max(1, bucket.oldest + 60000 - time);
      this.run("INSERT INTO provider_requests VALUES(?)", time);
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
    if (/^(sk|rk)_live_/.test(this.env.STRIPE_SECRET_KEY || "") && contaboSimulated(this.env)) fail(503, "真实服务器开通尚未启用，暂不接受正式付款");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(this.env.CONTABO_IMAGE_ID || "")) fail(503, "服务器镜像尚未配置");
    let selection;
    for (const plan of await this.plans()) for (const price of plan.prices) if (price.priceId === input.priceId) selection = { plan, price };
    if (!selection) fail(400, "套餐价格无效");
    if (typeof input.dataCenterId !== "string" || !REGIONS.some(center => center.id === input.dataCenterId)) fail(400, "数据中心无效");
    const quote = selection.price.byRegion[input.dataCenterId];
    if (!quote) fail(400, "该套餐在所选地区不可用");
    const stripe = stripeFor(this.env);
    const productId = "kld_" + selection.plan.id.replace(/[^A-Za-z0-9_]/g, "_");
    try { await stripe.products.retrieve(productId); }
    catch (error) {
      if (error.code !== "resource_missing") throw error;
      try { await stripe.products.create({ id: productId, name: selection.plan.name, metadata: { contabo_product: selection.plan.id } }); }
      catch (createError) {
        if (createError.code !== "resource_already_exists" && createError.statusCode !== 409) throw createError;
        await stripe.products.retrieve(productId);
      }
    }
    let couponId;
    if (quote.discountAmount > 0) {
      couponId = `kld_term_${selection.price.priceId}_${quote.discountAmount}`;
      try { await stripe.coupons.retrieve(couponId); }
      catch (error) {
        if (error.code !== "resource_missing") throw error;
        try { await stripe.coupons.create({ id: couponId, amount_off: quote.discountAmount, currency: "usd", duration: "once", applies_to: { products: [productId] }, name: "首期周期优惠" }); }
        catch (createError) {
          if (createError.code !== "resource_already_exists" && createError.statusCode !== 409) throw createError;
          await stripe.coupons.retrieve(couponId);
        }
      }
    }
    let customer = user.stripe_customer_id;
    if (!customer) {
      const created = await stripe.customers.create({ email: user.email, name: user.name, metadata: { user_id: user.id } }, { idempotencyKey: "customer-" + user.id });
      customer = created.id;
      this.run("UPDATE users SET stripe_customer_id=? WHERE id=?", customer, user.id);
    }
    const id = crypto.randomUUID(), time = now();
    this.run("INSERT INTO servers(id,user_id,stripe_price_id,interval,interval_count,amount,first_amount,product_name,provider_product_id,region,public_key,status,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", id, user.id, "dynamic", selection.price.interval, selection.price.intervalCount, quote.amount, quote.firstAmount, selection.plan.name, selection.price.priceId, input.dataCenterId, "", "pending_payment", time, time);
    const session = await stripe.checkout.sessions.create({ mode: "subscription", allowed_payment_method_types: ["card"], line_items: [{ price_data: { currency: "usd", unit_amount: quote.amount, product: productId, recurring: { interval: selection.price.interval, interval_count: selection.price.intervalCount } }, quantity: 1 }, ...(quote.setupAmount > 0 ? [{ price_data: { currency: "usd", unit_amount: quote.setupAmount, product_data: { name: "开通费" } }, quantity: 1 }] : [])], ...(couponId ? { discounts: [{ coupon: couponId }] } : {}), customer, client_reference_id: id, subscription_data: { metadata: { server_id: id, user_id: user.id } }, metadata: { server_id: id }, success_url: this.env.PUBLIC_ORIGIN + "/account?checkout=success", cancel_url: this.env.PUBLIC_ORIGIN + "/billing" });
    return { url: session.url };
  }
  async syncProviderCancellation(id) {
    const row = this.getServer(id);
    if (!row?.provider_cancel_requested || row.provider_cancel_date || !row.provider_instance_id || row.purchase_inflight) return;
    if (contaboSimulated(this.env) || row.provider_instance_id < 0) return;
    if (!/^(V\d+)-(\d+)m$/.test(row.provider_product_id)) throw Error("legacy provider");
    const path = `/v1/compute/instances/${row.provider_instance_id}`;
    const read = async () => {
      try {
        const instance = (await contabo(this.env, path)).data?.data?.[0];
        if (instance?.instanceId !== row.provider_instance_id) throw Error("invalid provider instance");
        return instance;
      } catch (error) { if (error.status === 404) return null; throw error; }
    };
    let instance = await read();
    if (instance && !instance.cancelDate) {
      await contabo(this.env, path + "/cancel", { method: "POST", body: {} });
      // A lost POST response is recovered by reading the instance on retry.
      instance = await read();
    }
    if (instance && !/^\d{4}-\d{2}-\d{2}$/.test(instance.cancelDate || "")) throw Error("provider cancellation not confirmed");
    this.run("UPDATE servers SET provider_cancel_date=?,updated=? WHERE id=?", instance?.cancelDate || "gone", now(), id);
  }
  async stopBilling(id) {
    const row = this.getServer(id);
    if (!row) return;
    this.run("UPDATE servers SET provider_cancel_requested=1,termination_requested=1,status=CASE WHEN status='terminated' THEN status ELSE 'terminating' END,updated=? WHERE id=?", now(), id);
    // Cancel billing independently of reinstall: a failed wipe must not renew.
    try { await this.syncProviderCancellation(id); }
    finally { if (row.status !== "terminated") await startWorkflow(this.env.TEARDOWN, id); }
  }
  async syncBilling(id) {
    if (this.billingPending.has(id)) return this.billingPending.get(id);
    const promise = this.reconcileSubscription(id);
    this.billingPending.set(id, promise);
    try { return await promise; }
    catch (error) {
      this.run("UPDATE servers SET billing_error=?,billing_checked_at=?,updated=? WHERE id=?", "订阅或供应商取消同步失败，系统将重试，请管理员核对", Date.now(), now(), id);
      throw error;
    } finally { this.billingPending.delete(id); }
  }
  async reconcileSubscription(id) {
    let row = this.getServer(id);
    if (!row?.stripe_subscription_id) return;
    const stripe = stripeFor(this.env);
    let sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id, { expand: ["latest_invoice"] });
    const customer = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    if (sub.id !== row.stripe_subscription_id || customer !== this.get("SELECT stripe_customer_id FROM users WHERE id=?", row.user_id)?.stripe_customer_id) throw Error("subscription ownership mismatch");
    // Provider cancellation is irreversible through the documented instance API.
    // Preserve the intent even if an old Stripe event or portal reactivation arrives.
    row = this.getServer(id);
    if (row.provider_cancel_requested && !sub.cancel_at_period_end && !["canceled", "unpaid", "incomplete_expired"].includes(sub.status) && !row.termination_requested) {
      sub = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true, expand: ["latest_invoice"] });
    }
    const invoice = typeof sub.latest_invoice === "object" ? sub.latest_invoice : null;
    const paidEnd = paidInvoiceEnd(invoice);
    if (invoice?.status === "paid" && paidEnd === null) throw Error("paid invoice period missing");
    const paid = paidEnd !== null && sub.status === "active";
    const end = periodEnd(sub);
    if (paid && !row.termination_requested) {
      this.run("UPDATE servers SET paid_through=MAX(COALESCE(paid_through,0),?),payment_past_due=0,status=CASE WHEN status IN ('past_due','pending_payment') THEN CASE WHEN ipv4 IS NULL THEN 'provisioning' ELSE 'active' END ELSE status END WHERE id=?", paidEnd, id);
    }
    const overdue = !paid && ["past_due", "unpaid"].includes(sub.status);
    const canceled = !!(sub.cancel_at_period_end || sub.cancel_at);
    this.run("UPDATE servers SET current_period_end=?,cancel_at_period_end=?,provider_cancel_requested=CASE WHEN ? THEN 1 ELSE provider_cancel_requested END,payment_past_due=CASE WHEN ? THEN 1 ELSE payment_past_due END,status=CASE WHEN ? AND status IN ('active','provisioning','past_due') THEN 'past_due' ELSE status END,billing_checked_at=?,billing_error=NULL,updated=? WHERE id=?",
      end, canceled ? 1 : 0, canceled ? 1 : 0, overdue ? 1 : 0, overdue ? 1 : 0, Date.now(), now(), id);
    row = this.getServer(id);
    const expired = row.paid_through && row.paid_through <= Math.floor(Date.now() / 1000);
    const terminal = ["canceled", "unpaid", "incomplete_expired"].includes(sub.status);
    if (terminal || row.termination_requested || (expired && (overdue || canceled || row.provider_cancel_requested))) {
      if (!["canceled", "incomplete_expired"].includes(sub.status)) await stripe.subscriptions.cancel(sub.id, { invoice_now: false, prorate: false });
      await this.stopBilling(id);
      if (row.termination_requested && paidEnd && paidEnd > (row.paid_through || 0)) this.run("UPDATE servers SET billing_error=? WHERE id=?", "服务终止后收到新付款，请核对 Stripe 账单并处理退款", id);
      return;
    }
    await this.syncProviderCancellation(id);
    // Do not provision from subscription.active alone: require a paid invoice.
    if (paid && paidEnd > Math.floor(Date.now() / 1000) && !row.termination_requested && row.status === "provisioning" && !row.provider_instance_id) await startWorkflow(this.env.PROVISION, id);
    if (overdue && !row.paid_through) this.run("UPDATE servers SET billing_error=? WHERE id=?", "无法确定已付款期限，请核对 Stripe 发票后处理欠费订阅", id);
  }
  async reconcileBilling() {
    const rows = this.all("SELECT id FROM servers WHERE stripe_subscription_id IS NOT NULL AND (status NOT IN ('terminated','checkout_expired') OR (provider_cancel_requested=1 AND provider_cancel_date IS NULL AND provider_instance_id>0)) ORDER BY billing_checked_at ASC LIMIT 50");
    let failed = 0;
    for (const row of rows) {
      try { await this.syncBilling(row.id); } catch { failed++; }
    }
    return { checked: rows.length, failed };
  }
  async cancelRenewal(user, id) {
    const row = this.get("SELECT * FROM servers WHERE id=? AND user_id=?", id, user.id);
    if (!row) fail(404, "服务器不存在");
    if (!row.stripe_subscription_id || ["pending_payment", "checkout_expired", "terminated", "terminating"].includes(row.status)) fail(409, "当前订阅不能取消");
    // Durable intent comes before network writes; scheduled reconciliation retries it.
    this.run("UPDATE servers SET provider_cancel_requested=1,cancel_at_period_end=1,updated=? WHERE id=?", now(), id);
    await this.syncBilling(id);
    return { ok: true };
  }
  async webhook(request) {
    if (!this.env.STRIPE_WEBHOOK_SECRET) fail(503, "Stripe webhook 尚未配置");
    let event;
    try { event = await stripeFor(this.env).webhooks.constructEventAsync(await request.text(), request.headers.get("stripe-signature") || "", this.env.STRIPE_WEBHOOK_SECRET, undefined, Stripe.createSubtleCryptoProvider()); }
    catch { fail(400, "签名无效"); }
    if (typeof event.livemode === "boolean" && event.livemode !== /^(sk|rk)_live_/.test(this.env.STRIPE_SECRET_KEY || "")) fail(400, "Stripe 模式不匹配");
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
        this.run("UPDATE servers SET stripe_subscription_id=?,updated=? WHERE id=?", subId, now(), row.id);
        await this.syncBilling(row.id);
      }
    } else if (["checkout.session.expired", "checkout.session.async_payment_failed"].includes(event.type)) {
      this.run("UPDATE servers SET status='checkout_expired',updated=? WHERE id=? AND status='pending_payment'", now(), object.client_reference_id || "");
    } else if (event.type === "customer.subscription.deleted") {
      const row = this.get("SELECT s.* FROM servers s JOIN users u ON u.id=s.user_id WHERE s.stripe_subscription_id=? OR (s.id=? AND s.stripe_subscription_id IS NULL AND u.stripe_customer_id=?)", object.id, object.metadata?.server_id || "", typeof object.customer === "string" ? object.customer : object.customer?.id || "");
      if (row) {
        this.run("UPDATE servers SET stripe_subscription_id=COALESCE(stripe_subscription_id,?) WHERE id=?", object.id, row.id);
        await this.stopBilling(row.id);
      }
    } else if (["customer.subscription.updated", "invoice.paid", "invoice.payment_failed", "invoice.payment_action_required"].includes(event.type)) {
      const reference = event.type === "customer.subscription.updated" ? object.id : object.parent?.subscription_details?.subscription || object.subscription;
      const subId = typeof reference === "string" ? reference : reference?.id;
      if (subId) {
        let row = this.get("SELECT * FROM servers WHERE stripe_subscription_id=?", subId);
        if (!row) {
          const sub = await stripeFor(this.env).subscriptions.retrieve(subId);
          const customer = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
          row = this.get("SELECT s.* FROM servers s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.stripe_subscription_id IS NULL AND u.stripe_customer_id=?", sub.metadata?.server_id || "", customer || "");
          if (row) this.run("UPDATE servers SET stripe_subscription_id=? WHERE id=?", subId, row.id);
        }
        if (row) await this.syncBilling(row.id);
      }
    }
    this.run("INSERT OR IGNORE INTO stripe_events VALUES(?,?)", event.id, now());
    return { received: true };
  }
  async fetch(request) {
    try {
      const url = new URL(request.url), path = url.pathname, method = request.method;
      const hasAuthorization = request.headers.has("authorization");
      const user = await this.userFor(request);
      if (hasAuthorization && !path.startsWith("/api/app/")) fail(403, "无权访问");
      if (!["GET", "HEAD"].includes(method) && path !== "/api/stripe/webhook") {
        if (!hasAuthorization && !(path === "/api/app/token" && method === "POST") && (request.headers.get("origin") !== this.env.PUBLIC_ORIGIN || request.headers.get("sec-fetch-site") === "cross-site")) fail(403, "请求来源不匹配");
        if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "")) fail(415, "请使用 JSON 请求");
      }
      if (path === "/api/stripe/webhook" && method === "POST") return json(await this.webhook(request));
      if (path === "/api/auth/google/start" && method === "GET") return await this.googleStart(request);
      if (path === "/api/auth/google/callback" && method === "GET") return await this.googleCallback(request);
      if (path === "/api/app/authorize" && method === "GET") return await this.appAuthorize(request, user);
      if (path === "/api/app/token" && method === "POST") {
        this.rate("app-token:" + (request.headers.get("CF-Connecting-IP") || "local"), 10);
        let input;
        try { const text = await request.text(); if (text.length > 131072) fail(413, "请求内容过大"); input = JSON.parse(text || "{}"); }
        catch (error) { if (error.status) throw error; fail(400, "登录码无效或已过期"); }
        if (!input || typeof input !== "object" || Array.isArray(input)) fail(400, "登录码无效或已过期");
        return json(await this.appToken(request, input));
      }
      if (path === "/api/config" && method === "GET") return json({ brand: "kelaodeyun", user: user && { id: user.id, email: user.email, name: user.name, avatar: user.avatar, role: user.role }, paymentMode: /^(sk|rk)_test_/.test(this.env.STRIPE_SECRET_KEY || "") ? "test" : /^(sk|rk)_live_/.test(this.env.STRIPE_SECRET_KEY || "") && !contaboSimulated(this.env) ? "live" : "unavailable", operator: this.env.PUBLIC_OPERATOR || "", supportEmail: this.env.SUPPORT_EMAIL || "" });
      if (path === "/api/plans" && method === "GET") return json(await this.plans());
      if (path === "/api/datacenters" && method === "GET") return json(await this.datacenters());
      if (path === "/api/feedback" && method === "GET") return json({ items: this.feedback(user) });
      if (!user) fail(401, "请先登录");
      this.rate(user.id);
      let input = {};
      if (!["GET", "HEAD"].includes(method)) {
        try { const text = await request.text(); if (text.length > 131072) fail(413, "请求内容过大"); input = JSON.parse(text || "{}"); if (!input || typeof input !== "object" || Array.isArray(input)) fail(400, "请求格式不正确"); }
        catch (error) { if (error.status) throw error; fail(400, "请求格式不正确"); }
      }
      if (path === "/api/app/me" && method === "GET") return json({ user: { email: user.email, name: user.name, avatar: user.avatar } });
      if (path === "/api/app/hosts" && method === "GET") return json({ hosts: this.accountHosts(user) });
      if (path === "/api/app/hosts" && method === "POST") return json(await this.saveAccountHost(user, input));
      const appHost = path.match(/^\/api\/app\/hosts\/([a-zA-Z0-9-]+)(\/secret)?$/);
      if (appHost && method === "GET" && appHost[2]) {
        if (!hasAuthorization) fail(403, "请在 App 中查看凭据");
        this.rate("app-secret:" + user.id, 30);
        const purchased = appHost[1].startsWith("server-");
        const query = purchased
          ? "SELECT root_password_enc AS secret_enc,'password' AS auth_type FROM servers WHERE id=? AND user_id=? AND status IN ('active','past_due') AND ipv4 IS NOT NULL AND root_password_enc IS NOT NULL"
          : "SELECT secret_enc,auth_type FROM ssh_hosts WHERE id=? AND user_id=?";
        const id = purchased ? appHost[1].slice(7) : appHost[1];
        const row = this.get(query, id, user.id);
        if (!row) fail(404, "服务器不存在");
        const secret = await decryptText(this.env, row.secret_enc);
        const current = this.get(query, id, user.id);
        if (!current || current.secret_enc !== row.secret_enc || current.auth_type !== row.auth_type) fail(404, "服务器不存在");
        return json({ authType: row.auth_type, secret });
      }
      if (appHost && method === "DELETE" && !appHost[2]) {
        if (appHost[1].startsWith("server-")) {
          if (!this.get("SELECT id FROM servers WHERE id=? AND user_id=?", appHost[1].slice(7), user.id)) fail(404, "服务器不存在");
          fail(409, "已购买的服务器不能从这里移除");
        }
        if (!this.get("SELECT id FROM ssh_hosts WHERE id=? AND user_id=?", appHost[1], user.id)) fail(404, "服务器不存在");
        this.run("DELETE FROM ssh_hosts WHERE id=? AND user_id=?", appHost[1], user.id);
        return json({ ok: true });
      }
      if (path === "/api/app/logout" && method === "POST") {
        if (!hasAuthorization) fail(403, "无权访问");
        this.run("DELETE FROM app_tokens WHERE hash=?", await shaHex(request.headers.get("authorization").slice(7)));
        return json({ ok: true });
      }
      if (path === "/api/account/app-sessions/revoke" && method === "POST") {
        this.run("DELETE FROM app_tokens WHERE user_id=?", user.id);
        return json({ ok: true });
      }
      if (path === "/api/logout" && method === "POST") {
        this.run("DELETE FROM sessions WHERE hash=?", await shaHex(cookie(request, "kelaode_session")));
        const response = json({ ok: true }); response.headers.append("Set-Cookie", makeCookie(this.env, "kelaode_session", "", "/", 0)); return response;
      }
      if (path === "/api/checkout" && method === "POST") return json(await this.checkout(user, input));
      if (path === "/api/portal" && method === "POST") {
        if (!user.stripe_customer_id) fail(400, "尚无订阅");
        if (!this.env.STRIPE_PORTAL_CONFIGURATION_ID) fail(503, "订阅管理尚未配置");
        const session = await stripeFor(this.env).billingPortal.sessions.create({ customer: user.stripe_customer_id, configuration: this.env.STRIPE_PORTAL_CONFIGURATION_ID, return_url: this.env.PUBLIC_ORIGIN + "/account" });
        return json({ url: session.url });
      }
      if (path === "/api/servers" && method === "GET") return json(this.all("SELECT id,product_name,interval,interval_count,amount,status,region,current_period_end,paid_through,cancel_at_period_end,provider_cancel_requested,ipv4,hostname,created,CASE WHEN provider_instance_id<0 THEN 1 ELSE 0 END AS simulated FROM servers WHERE user_id=? ORDER BY created DESC", user.id).map(row => ({ ...row, simulated: Boolean(row.simulated) })));
      const cancellation = path.match(/^\/api\/servers\/([a-zA-Z0-9-]+)\/cancel-renewal$/);
      if (cancellation && method === "POST") return json(await this.cancelRenewal(user, cancellation[1]));
      const credentials = path.match(/^\/api\/servers\/([a-zA-Z0-9-]+)\/credentials$/);
      if (credentials && method === "GET") {
        this.rate("credentials:" + user.id, 20);
        const row = this.get("SELECT status,root_password_enc,ipv4 FROM servers WHERE id=? AND user_id=?", credentials[1], user.id);
        if (!row) fail(404, "服务器不存在");
        if (!["active", "past_due"].includes(row.status) || !row.root_password_enc) fail(409, "服务器尚未就绪");
        const password = await decryptText(this.env, row.root_password_enc);
        const current = this.get("SELECT status,root_password_enc,ipv4 FROM servers WHERE id=? AND user_id=?", credentials[1], user.id);
        if (!current) fail(404, "服务器不存在");
        if (!["active", "past_due"].includes(current.status) || current.root_password_enc !== row.root_password_enc) fail(409, "服务器尚未就绪");
        return json({ username: "root", password, ipv4: current.ipv4 });
      }
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
        if (path === "/api/admin/overview" && method === "GET") return json({ users: this.get("SELECT count(*) AS count FROM users").count, statuses: this.all("SELECT status,count(*) AS count FROM servers GROUP BY status"), servers: this.all("SELECT s.id,s.product_name,s.interval,s.interval_count,s.amount,s.region,s.status,s.error,s.billing_error,s.paid_through,s.provider_cancel_requested,s.provider_cancel_date,s.ipv4,s.current_period_end,s.provider_instance_id,s.failure_phase,s.created,s.updated,u.email FROM servers s JOIN users u ON u.id=s.user_id ORDER BY s.created DESC LIMIT 100").map(row => ({ ...row, simulated: row.provider_instance_id < 0 })), accounts: this.all("SELECT id,email,name,avatar,role,disabled,created FROM users ORDER BY created DESC LIMIT 100"), feedback: this.feedback(user) });
        const action = path.match(/^\/api\/admin\/servers\/([a-zA-Z0-9-]+)\/(retry|mark-terminated|link-vm)$/);
        if (action && method === "POST") {
          const row = this.get("SELECT * FROM servers WHERE id=?", action[1]);
          if (!row) fail(404, "服务器不存在");
          if (action[2] !== "mark-terminated" && !/^(V\d+)-(\d+)m$/.test(row.provider_product_id)) fail(409, "旧服务商服务器需人工处理，不能使用 Contabo 操作");
          if (action[2] === "mark-terminated") {
            if (row.purchase_inflight || row.secret_inflight) fail(409, "购买结果尚未确定");
            this.run("UPDATE servers SET status='terminated',termination_requested=1,root_password_enc=NULL,error=NULL,updated=? WHERE id=?", now(), row.id);
          } else if (action[2] === "link-vm") {
            if (row.status !== "needs_attention" || row.failure_phase !== "provision" || row.provider_instance_id || row.purchase_inflight || row.termination_requested) fail(409, "当前状态不能关联服务器");
            if (!Number.isSafeInteger(input.vmId) || input.vmId <= 0) fail(400, "VM ID 无效");
            if (this.reserveProvider() > 0) fail(429, "请求较频繁，请稍后再试");
            const { data } = await contabo(this.env, `/v1/compute/instances/${input.vmId}`, { reserved: true });
            const vm = data?.data?.[0];
            if (!vm || vm.instanceId !== input.vmId) fail(502, "Contabo 返回的服务器信息无效");
            const linked = this.ctx.storage.transactionSync(() => {
              const current = this.getServer(row.id);
              if (!current || current.status !== "needs_attention" || current.failure_phase !== "provision" || current.provider_instance_id || current.purchase_inflight || current.termination_requested) return false;
              this.run("UPDATE servers SET provider_instance_id=?,status=CASE WHEN payment_past_due=1 THEN 'past_due' ELSE 'provisioning' END,error=NULL,failure_phase=NULL,updated=? WHERE id=?", input.vmId, now(), row.id);
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
            if (row.provider_instance_id || row.purchase_inflight) fail(409, "请先在 Contabo 控制台核对购买结果");
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
      if (!row || row.termination_requested || row.provider_instance_id || row.status === "needs_attention") return null;
      if (row.purchase_inflight || row.status === "purchasing") {
        this.run("UPDATE servers SET status='needs_attention',error=?,failure_phase='provision',purchase_inflight=0,updated=? WHERE id=?", "购买结果未知，请在 Contabo 控制台核对", now(), id);
        return null;
      }
      if (!["provisioning", "past_due"].includes(row.status)) return null;
      this.run("UPDATE servers SET status='purchasing',purchase_inflight=1,updated=? WHERE id=?", now(), id);
      return row;
    });
  }
  finishPurchase(id, vmId) {
    return this.ctx.storage.transactionSync(() => {
      const previous = this.getServer(id);
      this.run("UPDATE servers SET provider_instance_id=?,purchase_inflight=0,status=CASE WHEN termination_requested=1 THEN 'terminating' WHEN payment_past_due=1 THEN 'past_due' ELSE 'provisioning' END,updated=? WHERE id=?", vmId, now(), id);
      return { ...this.getServer(id), recoverTeardown: previous?.status === "needs_attention" };
    });
  }
  beginSecret(id) {
    return this.ctx.storage.transactionSync(() => {
      const row = this.getServer(id);
      if (!row || row.termination_requested || !["provisioning", "past_due"].includes(row.status)) return null;
      if (row.provider_secret_id) return row;
      if (row.secret_inflight) throw Error("password secret in progress");
      this.run("UPDATE servers SET secret_inflight=1,updated=? WHERE id=?", now(), id);
      return row;
    });
  }
  setRootPassword(id, encrypted) {
    return this.ctx.storage.transactionSync(() => {
      this.run("UPDATE servers SET root_password_enc=?,updated=? WHERE id=? AND root_password_enc IS NULL AND status!='terminated'", encrypted, now(), id);
      return this.getServer(id)?.root_password_enc || null;
    });
  }
  setSecret(id, secretId) {
    return this.ctx.storage.transactionSync(() => {
      this.run("UPDATE servers SET provider_secret_id=?,secret_inflight=0,updated=? WHERE id=?", secretId, now(), id);
      return this.getServer(id);
    });
  }
  failSecret(id) {
    this.run("UPDATE servers SET secret_inflight=0,status=CASE WHEN termination_requested=1 THEN 'needs_attention' ELSE status END,failure_phase=CASE WHEN termination_requested=1 THEN 'provision' ELSE failure_phase END,error=CASE WHEN termination_requested=1 THEN '创建密码结果未知，请在 Contabo 控制台核对' ELSE error END,updated=? WHERE id=?", now(), id);
  }
  attention(id, message, phase) {
    this.run("UPDATE servers SET status='needs_attention',error=?,failure_phase=?,purchase_inflight=0,secret_inflight=0,updated=? WHERE id=? AND status!='terminated'", message, phase, now(), id);
  }
  activate(id, ipv4, hostname) {
    this.run("UPDATE servers SET status=CASE WHEN payment_past_due=1 THEN 'past_due' ELSE 'active' END,ipv4=?,hostname=?,error=NULL,updated=? WHERE id=? AND status IN ('provisioning','past_due') AND termination_requested=0", ipv4, hostname || "", now(), id);
  }
  terminate(id) { this.run("UPDATE servers SET status='terminated',root_password_enc=NULL,ipv4=NULL,error=NULL,updated=? WHERE id=? AND termination_requested=1 AND purchase_inflight=0 AND secret_inflight=0", now(), id); }
}
