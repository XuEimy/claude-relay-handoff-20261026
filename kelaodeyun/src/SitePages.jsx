import AppShowcase from "./components/AppShowcase.jsx";
import React, { useEffect, useState, useRef } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowLeft,
  Menu,
  X,
  Download,
  Wallet,
  FileText,
  ShieldCheck,
  Check,
  RefreshCw,
  Copy,
  LogOut,
  Eye,
  EyeOff,
  Monitor,
  Terminal,
  ChevronDown,
  Search,
  LoaderCircle,
  AlertCircle,
  Mail,
} from "lucide-react";
import {
  api,
  money,
  yuan,
  dateTime,
  paymentName,
  statusName,
  safeNext,
} from "./site-api.js";
import "./site-pages.css";

const navigation = [
  ["/models", "模型与价格"],
  ["/billing", "充值"],
  ["/guide", "使用指南"],
  ["/download", "下载 App"],
];
export function SiteBrand() {
  return (
    <a className="brand" href="/" aria-label="kelaodeyun 首页">
      <span className="brand-cloud" aria-hidden="true" />
      <span>kelaodeyun</span>
    </a>
  );
}
export function PageShell({ config, children, account = false }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const path = location.pathname;
  useEffect(() => {
    const close = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  const logout = async () => {
    setBusy(true);
    setError("");
    try {
      await api("/logout", {});
      location.href = "/";
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  return (
    <div className="portal">
      <a className="skip-link" href="#page-main">
        跳转到正文
      </a>
      <header className="portal-header">
        <SiteBrand />
        <nav aria-label="主导航">
          {navigation.map(([href, title]) => (
            <a
              key={href}
              href={href}
              aria-current={path === href ? "page" : undefined}
            >
              {title}
            </a>
          ))}
        </nav>
        <a
          className="portal-account-link"
          href={config.user ? "/account" : "/login"}
        >
          {config.user ? "我的账户" : "登录 / 注册"}
          <ArrowUpRight size={16} />
        </a>
        <button
          className="portal-menu"
          type="button"
          aria-label={open ? "关闭导航" : "打开导航"}
          aria-expanded={open}
          aria-controls="portal-mobile-nav"
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
      </header>
      {open && (
        <nav
          id="portal-mobile-nav"
          className="portal-mobile-nav"
          aria-label="移动端导航"
        >
          {navigation.map(([href, label]) => (
            <a href={href} key={href}>
              {label}
              <ArrowRight size={16} />
            </a>
          ))}
        </nav>
      )}
      {account && (
        <div className="portal-account-nav">
          <nav aria-label="账户导航">
            {[
              ["/account", "账户概览"],
              ["/billing", "充值与账单"],
              ["/settings", "账户安全"],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                aria-current={
                  path === href || (href === "/billing" && path === "/checkout")
                    ? "page"
                    : undefined
                }
              >
                {label}
              </a>
            ))}
            {config.user?.role === "admin" && <a href="/admin">管理后台</a>}
          </nav>
          <button onClick={logout} disabled={busy}>
            <LogOut size={16} />
            {busy ? "正在退出" : "退出登录"}
          </button>
        </div>
      )}
      {error && (
        <div className="portal-container">
          <Message kind="error">{error}</Message>
        </div>
      )}
      <main id="page-main" className="portal-main">
        {children}
      </main>
      <footer className="portal-footer">
        <div>
          <SiteBrand />
          <p>连接云端，继续创造。</p>
        </div>
        <nav aria-label="页脚导航">
          <a href="/guide">使用指南</a>
          <a href="/support">帮助与支持</a>
          <a href="/privacy">隐私说明</a>
          <a href="/terms">服务说明</a>
        </nav>
        <small>© {new Date().getFullYear()} kelaodeyun</small>
      </footer>
    </div>
  );
}
function PageTitle({ title, description, children }) {
  useEffect(() => {
    document.title = `${title} · kelaodeyun`;
  }, [title]);
  return (
    <div className="portal-title">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
function Message({ children, kind = "info" }) {
  return children ? (
    <div
      className={"portal-message " + kind}
      role={kind === "error" ? "alert" : "status"}
    >
      {kind === "success" ? <Check size={18} /> : <AlertCircle size={18} />}
      <div>{children}</div>
    </div>
  ) : null;
}
function EmptyState({ title, children, href, action }) {
  return (
    <div className="portal-empty">
      <FileText size={25} />
      <h3>{title}</h3>
      <p>{children}</p>
      {href && (
        <a className="portal-text-link" href={href}>
          {action}
          <ArrowRight size={16} />
        </a>
      )}
    </div>
  );
}
function Loading() {
  return (
    <div className="portal-loading" role="status">
      <LoaderCircle className="spin" size={20} />
      正在加载…
    </div>
  );
}
function Status({ value }) {
  return <span className={"portal-status " + value}>{statusName(value)}</span>;
}
function PasswordField({ label, name, autoComplete, minLength = 1, hint }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="portal-field">
      <span>{label}</span>
      <div className="portal-password">
        <input
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={minLength}
          maxLength={200}
          required
        />
        <button
          type="button"
          aria-label={visible ? "隐藏密码" : "显示密码"}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {hint && <small>{hint}</small>}
    </label>
  );
}
function useBilling() {
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  const live = useRef(true);
  const load = async () => {
    try {
      const next = await api("/billing");
      if (live.current) {
        setData(next);
        setError("");
      }
      return next;
    } catch (e) {
      if (live.current) setError(e.message);
      return null;
    }
  };
  useEffect(() => {
    live.current = true;
    load();
    return () => {
      live.current = false;
    };
  }, []);
  return { data, error, load };
}
function LoadError({ error, retry }) {
  return (
    error && (
      <Message kind="error">
        {error}{" "}
        {error === "请先登录" ? (
          <a
            href={
              "/login?next=" +
              encodeURIComponent(location.pathname + location.search)
            }
          >
            重新登录
          </a>
        ) : (
          <button className="portal-inline" onClick={retry}>
            重新加载
          </button>
        )}
      </Message>
    )
  );
}

export function AuthScreen({
  config,
  refresh,
  register = false,
  setup = false,
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const requested = new URLSearchParams(location.search).get("next");
  const next = safeNext(
    requested ||
      (/^\/(account|billing|checkout|settings|admin)/.test(location.pathname)
        ? location.pathname + location.search
        : ""),
  );
  const title = setup ? "初始化站点" : register ? "创建账户" : "欢迎回来";
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const values = Object.fromEntries(new FormData(e.currentTarget));
    if ((register || setup) && values.password !== values.confirm) {
      setError("两次输入的密码不一致，请重新确认。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(setup ? "/setup" : register ? "/register" : "/login", values);
      await refresh();
      location.assign(next);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <PageShell config={config}>
      <section className="portal-container portal-auth">
        <div className="portal-auth-story">
          <h2>
            好想法，
            <br />
            从这里继续。
          </h2>
          <p>一个账户，管理你的余额、充值和使用记录。</p>
          <img src="/images/cards/security.jpg" alt="纸张拼贴构成的拱廊" />
          <a className="portal-text-link" href="/download">
            了解桌面 App <ArrowUpRight size={17} />
          </a>
        </div>
        <div className="portal-auth-form">
          <PageTitle
            title={title}
            description={
              setup
                ? "为站点创建第一个管理员账户。"
                : register
                  ? "填写下面的信息，开始管理你的账户。"
                  : "使用邮箱和密码登录。"
            }
          />
          {config.user ? (
            <>
              <Message>你已登录为 {config.user.name}。</Message>
              <a className="portal-button primary" href={next}>
                进入账户 <ArrowRight size={17} />
              </a>
            </>
          ) : config.setup && !setup ? (
            <>
              <Message>站点正在准备账户服务，暂时无法登录或注册。</Message>
              <a className="portal-text-link" href="/setup">
                我是站点管理员，进行初始化 <ArrowRight size={16} />
              </a>
            </>
          ) : setup && !config.setup ? (
            <Message>
              站点已经初始化。<a href="/login">前往登录</a>
            </Message>
          ) : register && !config.registration ? (
            <>
              <Message>新账户注册暂未开放。已有账户可以正常登录。</Message>
              <a className="portal-button" href="/login">
                返回登录
              </a>
            </>
          ) : (
            <form onSubmit={submit}>
              {(register || setup) && (
                <label className="portal-field">
                  <span>昵称</span>
                  <input
                    name="name"
                    autoComplete="nickname"
                    maxLength={40}
                    required
                    placeholder="如何称呼你"
                  />
                </label>
              )}
              <label className="portal-field">
                <span>邮箱</span>
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  maxLength={180}
                  required
                  placeholder="you@example.com"
                />
              </label>
              <PasswordField
                label="密码"
                name="password"
                autoComplete={
                  register || setup ? "new-password" : "current-password"
                }
                minLength={register || setup ? 10 : 1}
                hint={
                  register || setup
                    ? "至少 10 位，建议使用独立于其他网站的密码。"
                    : undefined
                }
              />
              {(register || setup) && (
                <PasswordField
                  label="确认密码"
                  name="confirm"
                  autoComplete="new-password"
                  minLength={10}
                />
              )}
              {setup && config.setupRequiresToken && (
                <PasswordField
                  label="初始化口令"
                  name="setupToken"
                  autoComplete="off"
                />
              )}
              {(register || setup) && (
                <label className="portal-consent">
                  <input type="checkbox" name="accepted" required />
                  <span>
                    我已阅读并同意
                    <a href="/terms" target="_blank" rel="noreferrer">
                      服务说明
                    </a>
                    和
                    <a href="/privacy" target="_blank" rel="noreferrer">
                      隐私说明
                    </a>
                    。
                  </span>
                </label>
              )}
              <Message kind="error">{error}</Message>
              <button className="portal-button primary wide" disabled={busy}>
                {busy ? (
                  <LoaderCircle className="spin" size={18} />
                ) : (
                  <ArrowRight size={18} />
                )}
                {busy
                  ? "正在提交…"
                  : setup
                    ? "创建管理员"
                    : register
                      ? "创建账户"
                      : "登录"}
              </button>
              {!setup && (
                <div className="portal-auth-switch">
                  {register ? (
                    <a href={"/login?next=" + encodeURIComponent(next)}>
                      已有账户？登录
                    </a>
                  ) : (
                    <>
                      {config.registration && (
                        <a href={"/register?next=" + encodeURIComponent(next)}>
                          创建新账户
                        </a>
                      )}
                      <a href="/support#account">忘记密码？</a>
                    </>
                  )}
                </div>
              )}
            </form>
          )}
        </div>
      </section>
    </PageShell>
  );
}

export function AccountPage({ config }) {
  const { data, error, load } = useBilling();
  return (
    <PageShell config={config} account>
      <div className="portal-container">
        <PageTitle
          title={`你好，${config.user.name}`}
          description="余额、账单与账户设置，都在这里。"
        >
          <a className="portal-button" href="/download">
            <Download size={17} />
            下载 App
          </a>
        </PageTitle>
        <LoadError error={error} retry={load} />
        <div className="portal-overview">
          <section className="portal-wallet">
            <Wallet size={24} />
            <h2>账户余额</h2>
            <strong>{data ? money(data.balance) : "—"}</strong>
            <p>网站账户余额，以实际账单记录为准。</p>
            <a className="portal-button primary" href="/billing">
              充值余额 <ArrowRight size={17} />
            </a>
          </section>
          <section className="portal-account-details">
            <h2>账户信息</h2>
            <dl>
              <div>
                <dt>昵称</dt>
                <dd>{config.user.name}</dd>
              </div>
              <div>
                <dt>邮箱</dt>
                <dd>{config.user.email}</dd>
              </div>
              <div>
                <dt>账户类型</dt>
                <dd>{config.user.role === "admin" ? "管理员" : "个人账户"}</dd>
              </div>
            </dl>
            <a className="portal-text-link" href="/settings">
              管理账户安全 <ArrowRight size={16} />
            </a>
          </section>
        </div>
        <section className="portal-section">
          <div className="portal-section-heading">
            <h2>最近充值</h2>
            <a href="/billing?tab=orders">
              查看全部 <ArrowUpRight size={16} />
            </a>
          </div>
          {!data && !error ? (
            <Loading />
          ) : data?.orders.length ? (
            <OrderTable orders={data.orders.slice(0, 5)} />
          ) : (
            <EmptyState
              title="还没有充值订单"
              href="/billing"
              action="了解充值方式"
            >
              充值后，可在这里查询订单和到账状态。
            </EmptyState>
          )}
        </section>
        <section className="portal-inline-guide">
          <Monitor size={27} />
          <div>
            <h2>准备好进入桌面工作空间了吗？</h2>
            <p>先了解服务器要求，再查看 App 发布状态。</p>
          </div>
          <a className="portal-text-link" href="/guide">
            阅读使用指南 <ArrowRight size={16} />
          </a>
        </section>
      </div>
    </PageShell>
  );
}
function OrderTable({ orders }) {
  return (
    <div className="portal-table-scroll" tabIndex={0} aria-label="充值订单">
      <table>
        <thead>
          <tr>
            <th>创建时间</th>
            <th>订单号</th>
            <th>方式</th>
            <th>金额</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>{dateTime(o.created)}</td>
              <td>
                <a
                  className="portal-order-id"
                  href={"/checkout?order=" + o.id}
                  title={o.id}
                >
                  {o.id.slice(0, 12)}…
                </a>
              </td>
              <td>{paymentName(o.provider)}</td>
              <td>{yuan(o.amount)}</td>
              <td>
                <Status value={o.status} />
              </td>
              <td>
                <a
                  className="portal-text-link"
                  href={"/checkout?order=" + o.id}
                >
                  {o.status === "pending" ? "查看付款" : "订单详情"}
                  <ArrowUpRight size={14} />
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function BillingPage({ config, refresh }) {
  const { data, error, load } = useBilling();
  const initialTab =
    new URLSearchParams(location.search).get("tab") ||
    (location.hash === "#usage" ? "usage" : "orders");
  const [tab, setTab] = useState(
    ["orders", "usage", "ledger"].includes(initialTab) ? initialTab : "orders",
  );
  const [amount, setAmount] = useState(5000),
    [provider, setProvider] = useState(
      config.payments.find((p) => p.enabled)?.id || "",
    );
  const [busy, setBusy] = useState(""),
    [message, setMessage] = useState(null);
  const [filter, setFilter] = useState("all");
  const order = async (e) => {
    e.preventDefault();
    if (busy || !provider) return;
    setBusy("order");
    setMessage(null);
    try {
      const payment = await api("/orders", {
        provider,
        amount,
        mobile: window.innerWidth < 600,
      });
      try {
        sessionStorage.setItem(
          `kelaodeyun.payment.${config.user.id}.${payment.id}`,
          JSON.stringify(payment),
        );
      } catch {
        /* Order can still be queried from the server. */
      }
      location.assign("/checkout?order=" + encodeURIComponent(payment.id));
    } catch (err) {
      setMessage({ kind: "error", text: err.message });
      setBusy("");
      load();
    }
  };
  const redeem = async (e) => {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget;
    setBusy("redeem");
    setMessage(null);
    try {
      await api("/redeem", { code: new FormData(form).get("code").trim() });
      form.reset();
      await load();
      await refresh();
      setMessage({ kind: "success", text: "兑换成功，余额已到账。" });
    } catch (err) {
      setMessage({ kind: "error", text: err.message });
    } finally {
      setBusy("");
    }
  };
  return (
    <PageShell config={config} account>
      <div className="portal-container">
        <PageTitle
          title="充值与账单"
          description="每一笔充值，每一次使用，都有记录。"
        >
          <span className="portal-timezone">人民币 · 北京时间</span>
        </PageTitle>
        <LoadError error={error} retry={load} />
        {message && <Message kind={message.kind}>{message.text}</Message>}
        <div className="portal-billing-layout">
          <aside className="portal-wallet">
            <Wallet size={24} />
            <h2>可用余额</h2>
            <strong>{data ? money(data.balance) : "—"}</strong>
            <p>充值进入网站账户余额，不是 App 购买或订阅。</p>
            <a className="portal-text-link" href="/models">
              查看当前模型费率 <ArrowRight size={16} />
            </a>
            <a className="portal-text-link" href="/support#payment">
              充值遇到问题？ <ArrowUpRight size={16} />
            </a>
          </aside>
          <div className="portal-recharge">
            <form onSubmit={order}>
              <h2>选择充值金额</h2>
              <fieldset className="portal-amounts">
                <legend className="portal-sr-only">充值金额</legend>
                {[1000, 5000, 10000, 20000].map((n) => (
                  <label key={n}>
                    <input
                      type="radio"
                      name="amount"
                      value={n}
                      checked={amount === n}
                      onChange={() => setAmount(n)}
                      disabled={!!busy}
                    />
                    <span>
                      ¥<strong>{n / 100}</strong>
                    </span>
                  </label>
                ))}
              </fieldset>
              <h3>支付方式</h3>
              <fieldset className="portal-providers">
                <legend className="portal-sr-only">支付方式</legend>
                {config.payments.map((p) => (
                  <label key={p.id} className={!p.enabled ? "unavailable" : ""}>
                    <input
                      type="radio"
                      name="provider"
                      value={p.id}
                      checked={provider === p.id}
                      onChange={() => setProvider(p.id)}
                      disabled={!!busy || !p.enabled}
                    />
                    <span>
                      <strong>{p.name}</strong>
                      <small>
                        {p.enabled
                          ? config.demo
                            ? "演示支付，不会真实扣款"
                            : p.id === "wechat"
                              ? "使用微信扫码付款"
                              : "跳转支付宝安全收银台"
                          : "暂未开放"}
                      </small>
                    </span>
                    {p.enabled && provider === p.id && <Check size={18} />}
                  </label>
                ))}
              </fieldset>
              {!config.payments.some((p) => p.enabled) && (
                <p className="portal-hint">
                  在线支付暂未开放。有兑换码时，仍可在下方兑换。
                </p>
              )}
              <div className="portal-payment-total">
                <span>
                  充值金额 <strong>{yuan(amount)}</strong>
                </span>
                <button
                  className="portal-button primary"
                  disabled={!!busy || !provider}
                >
                  {busy === "order" ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <ArrowRight size={17} />
                  )}
                  {busy === "order" ? "正在创建订单…" : "前往付款"}
                </button>
              </div>
              <p className="portal-hint">
                到账以支付平台确认结果为准。
                <a href="/terms#billing">查看充值说明</a>
              </p>
            </form>
            <form className="portal-redeem" onSubmit={redeem}>
              <label htmlFor="portal-code">使用兑换码</label>
              <div>
                <input
                  id="portal-code"
                  name="code"
                  required
                  maxLength={100}
                  autoComplete="off"
                  placeholder="输入兑换码"
                  disabled={!!busy}
                />
                <button className="portal-button" disabled={!!busy}>
                  {busy === "redeem" ? "正在兑换…" : "兑换"}
                </button>
              </div>
            </form>
          </div>
        </div>
        <section className="portal-section" id="usage">
          <div className="portal-ledger-heading">
            <div className="portal-tabs" role="tablist" aria-label="账单类型">
              {[
                ["orders", "充值订单"],
                ["usage", "用量明细"],
                ["ledger", "余额记录"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  id={"tab-" + id}
                  aria-controls="billing-records"
                  aria-selected={tab === id}
                  onClick={() => {
                    setTab(id);
                    history.replaceState(
                      null,
                      "",
                      "/billing?tab=" + id + "#usage",
                    );
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                      e.preventDefault();
                      const ids = ["orders", "usage", "ledger"];
                      const next =
                        ids[
                          (ids.indexOf(id) + (e.key === "ArrowRight" ? 1 : 2)) %
                            3
                        ];
                      setTab(next);
                      document.getElementById("tab-" + next)?.focus();
                    }
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <button className="portal-text-link" onClick={load}>
              <RefreshCw size={15} />
              刷新记录
            </button>
          </div>
          <div
            id="billing-records"
            role="tabpanel"
            aria-labelledby={"tab-" + tab}
          >
            {!data ? (
              error ? (
                <EmptyState title="账单尚未加载">
                  请点击上方重新加载。
                </EmptyState>
              ) : (
                <Loading />
              )
            ) : tab === "orders" ? (
              <>
                <label className="portal-filter">
                  订单状态
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="all">全部订单</option>
                    <option value="pending">待支付</option>
                    <option value="paid">已到账</option>
                    <option value="failed">创建失败</option>
                  </select>
                </label>
                {data.orders.filter(
                  (o) => filter === "all" || o.status === filter,
                ).length ? (
                  <OrderTable
                    orders={data.orders.filter(
                      (o) => filter === "all" || o.status === filter,
                    )}
                  />
                ) : (
                  <EmptyState
                    title={
                      filter === "all" ? "还没有充值订单" : "没有符合条件的订单"
                    }
                  >
                    创建充值订单后，可在这里查看付款和到账情况。
                  </EmptyState>
                )}
              </>
            ) : tab === "usage" ? (
              <RecordTable
                headers={["时间", "模型", "输入 / 输出 tokens", "费用", "状态"]}
                rows={data.usage.map((u) => [
                  dateTime(u.created),
                  u.model,
                  `${u.input_tokens} / ${u.output_tokens}`,
                  money(u.cost, 4),
                  <Status value={u.status} />,
                ])}
                title="还没有使用记录"
                description="已记录的服务调用及费用会显示在这里。"
              />
            ) : (
              <RecordTable
                headers={["时间", "类型", "金额", "说明"]}
                rows={data.ledger.map((l) => [
                  dateTime(l.created),
                  {
                    voucher: "兑换码",
                    admin: "管理员调整",
                    payment: "在线充值",
                    release: "额度退回",
                  }[l.kind] || l.kind,
                  money(l.amount),
                  l.note || "—",
                ])}
                title="余额还没有变动"
                description="充值、兑换和余额调整会记录在这里。"
              />
            )}
          </div>
          <p className="portal-hint">
            显示最近 100 条记录。金额和到账状态以服务端记录为准。
          </p>
        </section>
      </div>
    </PageShell>
  );
}
function RecordTable({ headers, rows, title, description }) {
  return rows.length ? (
    <div className="portal-table-scroll" tabIndex={0}>
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <EmptyState title={title}>{description}</EmptyState>
  );
}

export function CheckoutPage({ config, refresh }) {
  const orderId = new URLSearchParams(location.search).get("order");
  const { data, error, load } = useBilling();
  const order = data?.orders.find((o) => o.id === orderId);
  const [message, setMessage] = useState(null),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false);
  const checking = useRef(false);
  const [payment] = useState(() => {
    try {
      const p = JSON.parse(
        sessionStorage.getItem(
          `kelaodeyun.payment.${config.user.id}.${orderId}`,
        ),
      );
      return p?.id === orderId ? p : null;
    } catch {
      return null;
    }
  });
  const query = async (automatic = false) => {
    if (!orderId || checking.current) return;
    checking.current = true;
    setBusy(true);
    if (!automatic) setMessage(null);
    try {
      const result = await api("/orders/" + encodeURIComponent(orderId));
      await load();
      if (result.status === "paid") {
        await refresh();
        setMessage(null);
      } else if (!automatic)
        setMessage({
          kind: "info",
          text: "暂未收到支付成功的确认。已付款时，请稍后查询，无需重复付款。",
        });
    } catch (e) {
      setMessage({ kind: "error", text: e.message });
    } finally {
      checking.current = false;
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!order || order.status !== "pending" || config.demo) return;
    const timer = setInterval(() => {
      if (!document.hidden) query(true);
    }, 15000);
    return () => clearInterval(timer);
  }, [order?.id, order?.status, config.demo]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(orderId);
      setCopied(true);
    } catch {
      setMessage({
        kind: "info",
        text: "无法自动复制，请选中下方订单号复制。",
      });
    }
  };
  const expired =
    order && Date.now() - new Date(order.created).getTime() > 30 * 60 * 1000;
  const externalUrl =
    payment?.url && /^https:\/\//.test(payment.url) ? payment.url : null;
  return (
    <PageShell config={config} account>
      <div className="portal-container portal-checkout">
        <a className="portal-text-link" href="/billing?tab=orders">
          <ArrowLeft size={16} />
          返回充值与账单
        </a>
        <PageTitle
          title={order?.status === "paid" ? "充值已到账" : "订单付款"}
          description={
            order?.status === "paid"
              ? "这笔充值已记入你的账户余额。"
              : "请核对订单信息，再完成付款。"
          }
        />
        <LoadError error={error} retry={load} />
        {!orderId ? (
          <EmptyState
            title="请先选择充值金额"
            href="/billing"
            action="前往充值"
          >
            付款页面需要有效的充值订单。
          </EmptyState>
        ) : !data && !error ? (
          <Loading />
        ) : data && !order ? (
          <EmptyState
            title="未找到这笔订单"
            href="/billing?tab=orders"
            action="查看我的订单"
          >
            请确认当前登录账户，或从订单列表重新进入。
          </EmptyState>
        ) : (
          order && (
            <div className="portal-checkout-layout">
              <section className="portal-order-summary">
                <h2>账户余额充值</h2>
                <strong className="portal-order-amount">
                  {yuan(order.amount)}
                </strong>
                <Status value={order.status} />
                <dl>
                  <div>
                    <dt>支付方式</dt>
                    <dd>{paymentName(order.provider)}</dd>
                  </div>
                  <div>
                    <dt>创建时间</dt>
                    <dd>{dateTime(order.created)}</dd>
                  </div>
                  <div>
                    <dt>订单号</dt>
                    <dd className="portal-full-id">
                      {order.id}
                      <button aria-label="复制订单号" onClick={copy}>
                        {copied ? <Check size={16} /> : <Copy size={16} />}
                      </button>
                    </dd>
                  </div>
                </dl>
                <p className="portal-hint">
                  充值用于网站账户余额，不是 App 授权或订阅费用。
                </p>
              </section>
              <section className="portal-payment-stage">
                {order.status === "paid" ? (
                  <>
                    <div className="portal-success-mark">
                      <Check size={32} />
                    </div>
                    <h2>付款成功，余额已更新</h2>
                    <p>你可以在账单中查看这次充值记录。</p>
                    <a className="portal-button primary" href="/account">
                      查看账户余额 <ArrowRight size={17} />
                    </a>
                  </>
                ) : order.status === "failed" ? (
                  <>
                    <AlertCircle size={32} />
                    <h2>订单创建失败</h2>
                    <p>支付渠道未能创建收银台。请返回充值页重试。</p>
                    <a className="portal-button" href="/billing">
                      重新选择充值方式
                    </a>
                  </>
                ) : (
                  <>
                    <h2>
                      {config.demo
                        ? "演示付款"
                        : order.provider === "wechat"
                          ? "使用微信扫码付款"
                          : "前往支付宝付款"}
                    </h2>
                    {config.demo ? (
                      <Message>
                        此订单仅用于演示，不会扣款。点击下方按钮模拟确认。
                      </Message>
                    ) : expired ? (
                      <Message>
                        此订单的付款有效期可能已结束。已付款请先查询结果，避免重复付款。
                      </Message>
                    ) : payment?.qr ? (
                      <img
                        className="portal-qr"
                        src={payment.qr}
                        alt="当前订单的微信付款二维码"
                        width="240"
                        height="240"
                      />
                    ) : externalUrl ? (
                      <a
                        className="portal-button primary"
                        href={externalUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        打开支付宝收银台 <ArrowUpRight size={17} />
                      </a>
                    ) : (
                      <Message>
                        付款入口不在当前浏览器会话中。若已付款，可查询结果；若尚未付款，可返回充值页重新创建订单。
                      </Message>
                    )}
                    <p>到账结果以支付平台确认为准，关闭页面不会取消订单。</p>
                    <button
                      className="portal-button"
                      disabled={busy}
                      onClick={() => query()}
                    >
                      {busy ? (
                        <LoaderCircle className="spin" size={17} />
                      ) : (
                        <RefreshCw size={17} />
                      )}
                      {busy
                        ? "正在查询…"
                        : config.demo
                          ? "模拟付款成功（不扣款）"
                          : "我已付款，查询结果"}
                    </button>
                    {!config.demo && (
                      <small>页面打开时，每 15 秒查询一次支付结果。</small>
                    )}
                  </>
                )}
                {message && (
                  <Message kind={message.kind}>{message.text}</Message>
                )}
                <a className="portal-text-link" href="/support#payment">
                  付款遇到问题 <ArrowUpRight size={15} />
                </a>
              </section>
            </div>
          )
        )}
      </div>
    </PageShell>
  );
}

export function SettingsPage({ config }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    if (values.password !== values.confirm) {
      setMessage({ kind: "error", text: "两次输入的新密码不一致。" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await api("/password", {
        current: values.current,
        password: values.password,
      });
      form.reset();
      setMessage({ kind: "success", text: "密码已更新，其他登录会话已退出。" });
    } catch (e) {
      setMessage({ kind: "error", text: e.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <PageShell config={config} account>
      <div className="portal-container">
        <PageTitle title="账户安全" description="管理网站账户的登录密码。" />
        <div className="portal-settings">
          <aside>
            <ShieldCheck size={30} />
            <h2>保护你的账户</h2>
            <p>{config.user.email}</p>
            <p>修改密码后，其他浏览器中的登录会话将退出。当前会话保持登录。</p>
            <a className="portal-text-link" href="/privacy">
              了解隐私说明 <ArrowRight size={16} />
            </a>
          </aside>
          <form onSubmit={submit}>
            <h2>修改密码</h2>
            <PasswordField
              label="当前密码"
              name="current"
              autoComplete="current-password"
            />
            <PasswordField
              label="新密码"
              name="password"
              minLength={10}
              autoComplete="new-password"
              hint="至少 10 位，请勿与其他网站共用。"
            />
            <PasswordField
              label="再次输入新密码"
              name="confirm"
              minLength={10}
              autoComplete="new-password"
            />
            {message && <Message kind={message.kind}>{message.text}</Message>}
            <button className="portal-button primary" disabled={busy}>
              {busy ? "正在保存…" : "更新密码"}
              <ArrowRight size={16} />
            </button>
          </form>
        </div>
      </div>
    </PageShell>
  );
}

export function ModelsPage({ config }) {
  const [search, setSearch] = useState("");
  const models = config.models.filter((m) =>
    m.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return (
    <PageShell config={config}>
      <div className="portal-container">
        <PageTitle
          title="模型与价格"
          description="已开放的模型与当前费率，以本站实际配置为准。"
        />
        <div className="portal-model-intro">
          <div>
            <h2>按实际用量，清楚计费。</h2>
            <p>
              输入与输出分别计费。以下价格单位为人民币 / 百万
              tokens，实际费用可在账户账单中查询。
            </p>
            <a className="portal-text-link" href="/billing">
              查看余额与账单 <ArrowRight size={16} />
            </a>
          </div>
          <img src="/images/cards/sonnet.jpg" alt="纸张与海浪拼贴" />
        </div>
        <label className="portal-search">
          <Search size={18} />
          <input
            type="search"
            aria-label="搜索已开放模型"
            placeholder="搜索模型名称"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {models.length ? (
          <RecordTable
            headers={["模型", "输入 / 百万 tokens", "输出 / 百万 tokens"]}
            rows={models.map((m) => [
              m.name,
              `¥${m.input_rate}`,
              `¥${m.output_rate}`,
            ])}
          />
        ) : (
          <EmptyState
            title={search ? "没有找到匹配的模型" : "当前没有开放的模型"}
          >
            {search
              ? "换一个名称搜索，或清空关键词查看全部。"
              : "模型开放后，此处会展示名称及真实费率。"}
          </EmptyState>
        )}
        <section className="portal-section portal-prose">
          <h2>如何计算费用</h2>
          <p>
            费用 = 输入 tokens ÷ 1,000,000 × 输入费率 + 输出 tokens ÷ 1,000,000
            × 输出费率。
          </p>
          <p>
            模型目录不代表桌面 App 订阅权益。使用自有服务器上的 Claude
            CLI，需要自行准备对应的登录与服务条件。
          </p>
          <a href="/support#payment" className="portal-text-link">
            了解账单与充值 <ArrowRight size={16} />
          </a>
        </section>
      </div>
    </PageShell>
  );
}
export function DownloadPage({ config }) {
  return (
    <PageShell config={config}>
      <div className="portal-container">
        <PageTitle
          title="把云端工作空间，带到桌面。"
          description="kelaodeyun · macOS 桌面 App"
        />
        <div className="portal-download-layout">
          <img
            src="/images/cards/stability.jpg"
            alt="连接两侧山崖的古典石桥拼贴"
          />
          <div>
            <Monitor size={34} />
            <h2>为 macOS 准备</h2>
            <p>
              连接你自己的服务器，使用远端 Claude
              CLI，浏览项目文件并继续已有工作。
            </p>
            <button className="portal-button primary" disabled>
              <Download size={17} />
              macOS 版本准备中
            </button>
            <small>安装包发布后，会在这里提供下载。当前没有可下载版本。</small>
            <a className="portal-text-link" href="/guide">
              先了解使用条件 <ArrowRight size={16} />
            </a>
          </div>
        </div>
        <AppShowcase compact />
        <section className="portal-section">
          <h2>开始前，准备这两件事。</h2>
          <div className="portal-requirements-list">
            <div>
              <Terminal size={23} />
              <h3>自己的云服务器</h3>
              <p>可通过 SSH 登录的 Linux x86_64 环境，已安装 Python 3。</p>
            </div>
            <div>
              <ShieldCheck size={23} />
              <h3>可用的 Claude CLI</h3>
              <p>在目标服务器的对应用户下安装并完成登录。</p>
            </div>
          </div>
          <p className="portal-hint">
            Windows 与 Linux 桌面版本尚未完成适配验收。网站账户与桌面 App
            的账户接入以实际版本功能为准。
          </p>
        </section>
      </div>
    </PageShell>
  );
}
const guideSections = [
  [
    "prepare",
    "准备环境",
    "准备可通过 SSH 登录的 Linux x86_64 服务器，并在目标用户下安装和登录 Claude CLI。请确认该用户可以访问项目目录。",
  ],
  [
    "install",
    "安装桌面 App",
    "当前 macOS 安装包正在准备中。发布后，从本站下载页获取安装包；无需在网站中提交服务器密码。",
  ],
  [
    "connect",
    "添加服务器",
    "安装完成后，在 App 的连接管理中添加自己的服务器。连接成功后选择“进入工作区”，确认当前服务器和项目目录。",
  ],
  [
    "work",
    "继续工作",
    "在对应工作区中查看已有 Claude 会话，或使用终端继续工作。历史恢复以文本消息为主，并非完整的工具事件回放。",
  ],
  [
    "files",
    "管理云端文件",
    "在文件区域浏览、预览和下载文件，也可以拖入本地文件上传。当前单文件上传上限为 32 MiB，已有同名文件不会直接覆盖。",
  ],
  [
    "billing",
    "管理网站账户",
    "在网站账户中查看余额、充值订单及用量。网站余额充值不等于 App 授权或 Claude 官方订阅。",
  ],
];
export function GuidePage({ config }) {
  return (
    <PageShell config={config}>
      <div className="portal-container">
        <PageTitle
          title="使用指南"
          description="从准备服务器，到进入你的工作空间。"
        />
        <div className="portal-reading-layout">
          <aside>
            <nav aria-label="本文目录">
              {guideSections.map(([id, title]) => (
                <a href={"#" + id} key={id}>
                  {title}
                </a>
              ))}
            </nav>
            <a className="portal-button" href="/download">
              查看下载状态 <Download size={16} />
            </a>
          </aside>
          <article className="portal-prose">
            {guideSections.map(([id, title, body], index) => (
              <section id={id} key={id}>
                <h2>
                  {index + 1}. {title}
                </h2>
                <p>{body}</p>
                {id === "billing" && (
                  <a className="portal-text-link" href="/billing">
                    前往充值与账单 <ArrowRight size={16} />
                  </a>
                )}
              </section>
            ))}
            <section>
              <h2>连接不成功？</h2>
              <p>
                先检查 SSH 地址、网络与登录权限，再确认服务器架构、Claude CLI
                登录状态和项目目录。网站的登录状态不会替代服务器上的 CLI 登录。
              </p>
              <a className="portal-text-link" href="/support">
                查看帮助中心 <ArrowRight size={16} />
              </a>
            </section>
          </article>
        </div>
      </div>
    </PageShell>
  );
}
const helpGroups = [
  [
    "account",
    "账户与登录",
    [
      [
        "无法登录怎么办？",
        "检查邮箱和密码是否正确。多次失败后请稍后重试；账户被停用时需联系站点管理员。",
      ],
      [
        "忘记密码怎么办？",
        "当前未提供自助邮件重置。请联系站点管理员核实处理；不要向任何人发送密码。",
      ],
      [
        "如何修改密码？",
        "登录后进入“账户安全”，输入当前密码和新密码。修改后其他登录会话会退出。",
      ],
    ],
  ],
  [
    "payment",
    "充值与付款",
    [
      [
        "付款完成但余额没有变化？",
        "进入“充值与账单”找到对应订单，打开详情并查询支付结果。平台确认可能需要片刻，请勿重复付款。",
      ],
      [
        "为什么支付宝或微信无法选择？",
        "渠道尚未开通时会显示“暂未开放”。有有效兑换码时，可在充值页兑换。",
      ],
      [
        "兑换码提示无效或已使用？",
        "检查是否多复制了空格、是否输入完整。每个兑换码只能使用一次，如仍有问题请联系管理员。",
      ],
      [
        "可以退款或开票吗？",
        "当前没有自助退款或开票入口。请通过已公布的支持渠道联系运营方，具体处理以运营方确认信息为准。",
      ],
      [
        "网站余额能购买 App 吗？",
        "当前充值进入网站账户余额，不是 App 授权或订阅购买。App 暂无可下载安装包，也没有公布售价。",
      ],
    ],
  ],
  [
    "desktop",
    "桌面 App",
    [
      [
        "现在可以下载吗？",
        "macOS 安装包正在准备中。下载页会在发布后提供真实安装包。",
      ],
      [
        "支持什么服务器？",
        "当前自定义远端运行程序支持 Linux x86_64。其他架构尚未完成适配验收。",
      ],
      [
        "可以使用网页聊天吗？",
        "网站目前提供产品介绍、账户和账单服务，工作入口已转向桌面 App。",
      ],
    ],
  ],
];
export function SupportPage({ config }) {
  const [search, setSearch] = useState("");
  const groups = helpGroups.map(([id, title, items]) => [
    id,
    title,
    items.filter(([q, a]) => (q + a).includes(search.trim())),
  ]);
  return (
    <PageShell config={config}>
      <div className="portal-container">
        <PageTitle title="帮助与支持" description="找到问题，也找到下一步。" />
        <label className="portal-search">
          <Search size={19} />
          <input
            type="search"
            aria-label="搜索帮助问题"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索登录、付款、服务器…"
          />
        </label>
        <div className="portal-reading-layout">
          <aside>
            <nav aria-label="帮助分类">
              {helpGroups.map(([id, title]) => (
                <a href={"#" + id} key={id}>
                  {title}
                </a>
              ))}
            </nav>
          </aside>
          <div className="portal-help">
            {groups.some((g) => g[2].length) ? (
              groups
                .filter((g) => g[2].length)
                .map(([id, title, items]) => (
                  <section id={id} key={id}>
                    <h2>{title}</h2>
                    {items.map(([q, a]) => (
                      <details key={q}>
                        <summary>
                          {q}
                          <ChevronDown size={18} />
                        </summary>
                        <p>{a}</p>
                      </details>
                    ))}
                  </section>
                ))
            ) : (
              <EmptyState title="没有找到相关问题">
                试试更短的关键词，或查看下方联系方式。
              </EmptyState>
            )}
            <section className="portal-contact">
              <Mail size={24} />
              <h2>需要进一步帮助？</h2>
              <p>
                请提供问题描述和相关订单号。不要发送密码、密钥或完整的支付凭据。
              </p>
              {config.supportEmail ? (
                <a
                  className="portal-text-link"
                  href={"mailto:" + config.supportEmail}
                >
                  {config.supportEmail}
                  <ArrowUpRight size={16} />
                </a>
              ) : (
                <p className="portal-hint">
                  支持邮箱尚未公布，请联系向你提供本站的管理员。
                </p>
              )}
            </section>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
export function PolicyPage({ config, terms = false }) {
  const sections = terms
    ? [
        [
          "service",
          "服务范围",
          "kelaodeyun 是独立产品。网站提供产品介绍、网站账户、余额充值和账单查询；桌面 App 连接用户自有服务器及远端 Claude CLI，不代表 Anthropic 官方产品。",
        ],
        [
          "billing",
          "余额与充值",
          "充值进入网站账户余额，不等于 App 授权、Claude 官方订阅或服务器租赁。在线支付仅在渠道开通后可用。支付成功以平台确认和本站到账记录为准。",
          "账户中显示已开放模型的费率和已有用量。输入与输出按各自费率计算，金额使用人民币。当前没有自助退款或开票入口，相关事项需联系运营方确认。",
        ],
        [
          "account",
          "账户使用",
          "请提供有效的账户信息并妥善保管密码。管理员可基于实际运营情况管理账户和服务配置。修改密码后，其他登录会话将失效。",
        ],
        [
          "availability",
          "版本与可用性",
          "macOS 安装包尚未发布。实际功能、支持的平台和使用条件以发布版本及下载页说明为准。网站不承诺尚未开放的渠道、模型或功能。",
        ],
      ]
    : [
        [
          "data",
          "网站保存的信息",
          "网站账户保存邮箱、昵称及加盐哈希后的密码；服务运行中会记录充值订单、余额流水、用量和反馈。历史服务可能保留已有会话数据，本次页面更新不删除这些记录。",
        ],
        [
          "payment",
          "支付信息",
          "创建在线支付订单时，订单号和金额会发送给对应支付平台。支付密码和完整银行卡信息不经过本站。订单结果由支付渠道确认。",
        ],
        [
          "desktop",
          "桌面端与服务器",
          "桌面 App 连接用户提供的 SSH 环境。服务器凭据和远端文件的处理属于桌面端使用流程，不要求在本网站的普通账户表单中提交服务器密码或私钥。",
        ],
        [
          "retention",
          "记录与处理请求",
          "当前未开放自助账户注销、邮件找回密码或自动数据清理。账单、用量和管理记录用于查询与核对。如需处理账户或数据问题，请联系运营方。",
        ],
      ];
  return (
    <PageShell config={config}>
      <div className="portal-container">
        <PageTitle
          title={terms ? "服务说明" : "隐私说明"}
          description="了解当前服务范围与账户信息的处理方式。"
        />
        <Message>
          此页说明当前产品实现。正式运营主体、联系方式及完整政策尚需在上线前确认。
        </Message>
        <div className="portal-reading-layout">
          <aside>
            <nav aria-label="说明目录">
              {sections.map(([id, title]) => (
                <a href={"#" + id} key={id}>
                  {title}
                </a>
              ))}
            </nav>
          </aside>
          <article className="portal-prose">
            {sections.map(([id, title, ...paragraphs]) => (
              <section key={id} id={id}>
                <h2>{title}</h2>
                {paragraphs.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </section>
            ))}
            <section>
              <h2>运营与联系</h2>
              <p>{config.operator || "运营主体尚未公布。"}</p>
              {config.supportEmail ? (
                <a href={"mailto:" + config.supportEmail}>
                  {config.supportEmail}
                </a>
              ) : (
                <p>支持邮箱尚未公布，请联系站点管理员。</p>
              )}
              <a href="/support" className="portal-text-link">
                查看帮助中心 <ArrowRight size={16} />
              </a>
            </section>
          </article>
        </div>
      </div>
    </PageShell>
  );
}
export function NotFoundPage({ config }) {
  return (
    <PageShell config={config}>
      <div className="portal-container">
        <PageTitle
          title="这个页面没有找到"
          description="链接可能已更新，你可以回到首页或使用上方导航。"
        />
        <a className="portal-button primary" href="/">
          返回首页 <ArrowRight size={17} />
        </a>
      </div>
    </PageShell>
  );
}
export function RetiredPage() {
  useEffect(() => {
    location.replace("/download");
  }, []);
  return <a href="/download">前往 App 下载页</a>;
}
