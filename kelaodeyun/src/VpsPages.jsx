import React, { useEffect, useState } from "react";
import { PageShell } from "./SitePages.jsx";
import { api } from "./site-api.js";

const money = cents => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const labels = { pending_payment: "等待付款", provisioning: "正在开通", purchasing: "正在开通", active: "运行中", past_due: "付款逾期", terminating: "正在清理", terminated: "已终止", needs_attention: "需要处理", checkout_expired: "付款已过期" };
const localDate = seconds => seconds ? new Date(seconds * 1000).toLocaleString() : "—";

export function Login({ config }) {
  const params = new URLSearchParams(location.search), error = params.get("error");
  const next = params.get("return") || "/account";
  return <PageShell config={config}><div className="portal-container"><div className="portal-title"><h1>登录账户</h1><p>使用 Google 账户继续。</p></div>
    {error && <div className="portal-message error" role="alert">{error === "disabled" ? "账户已停用，请联系支持。" : "登录未完成，请重试。"}</div>}
    <a className="portal-button primary" href={"/api/auth/google/start?return=" + encodeURIComponent(next)}>使用 Google 登录</a>
  </div></PageShell>;
}

export function Billing({ config }) {
  const [plans, setPlans] = useState([]), [centers, setCenters] = useState([]), [cycle, setCycle] = useState("month"), [priceId, setPriceId] = useState(""), [dataCenterId, setDataCenterId] = useState(""), [publicKey, setPublicKey] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { Promise.all([api("/plans"), api("/datacenters")]).then(([p, d]) => { setPlans(p); setCenters(d); setDataCenterId(String(d[0]?.id || "")); }).catch(e => setError(e.message)); }, []);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError("");
    try { const { url } = await api("/checkout", { priceId, dataCenterId, publicKey }); location.assign(url); } catch (e) { setError(e.message); setBusy(false); }
  }
  return <PageShell config={config} account><div className="portal-container">
    <div className="portal-title"><h1>选择服务器</h1><p>按月或按年订阅，付款后自动开通。</p></div>
    {error && <div role="alert" className="portal-message error">{error}</div>}
    <div className="vps-cycle" role="group" aria-label="付款周期"><button onClick={() => { setCycle("month"); setPriceId(""); }} aria-pressed={cycle === "month"}>按月</button><button onClick={() => { setCycle("year"); setPriceId(""); }} aria-pressed={cycle === "year"}>按年</button></div>
    <form onSubmit={submit}>
      <div className="portal-grid">
        {plans.map(plan => {
          const price = plan.prices[cycle], monthly = plan.prices.month, yearly = plan.prices.year;
          const savings = monthly && yearly && monthly.amount > 0 ? Math.round((1 - yearly.amount / (monthly.amount * 12)) * 100) : 0;
          return <label className="portal-card" key={plan.productId}><input type="radio" name="price" checked={priceId === price?.priceId} disabled={!price} onChange={() => setPriceId(price.priceId)} /> <strong>{plan.name}</strong><p>{plan.description}</p><p>{[plan.specs.cpu && `${plan.specs.cpu} CPU`, plan.specs.ramGb && `${plan.specs.ramGb} GB 内存`, plan.specs.diskGb && `${plan.specs.diskGb} GB 磁盘`, plan.specs.bandwidthTb && `${plan.specs.bandwidthTb} TB 流量`].filter(Boolean).join(" · ")}</p><p>{price ? `${money(price.amount)} / ${cycle === "month" ? "月" : "年"}` : "此周期暂不可用"} {cycle === "year" && savings > 0 && `· 节省 ${savings}%`}</p></label>;
        })}
      </div>
      {!plans.length && !error && <p>暂无可用套餐。</p>}
      <label className="portal-field"><span>数据中心</span><select value={dataCenterId} onChange={e => setDataCenterId(e.target.value)} required>{centers.map(c => <option key={c.id} value={c.id}>{[c.city, c.location, c.continent].filter(Boolean).join(" · ")}</option>)}</select></label>
      <label className="portal-field"><span>SSH 公钥</span><textarea value={publicKey} onChange={e => setPublicKey(e.target.value)} required maxLength={8192} rows={4} /></label>
      <p>在终端运行 <code>cat ~/.ssh/id_ed25519.pub</code>，复制公钥内容；不要提交私钥。</p>
      <p>订阅结束后服务器数据会立即清除，请提前备份。</p>
      <button className="portal-button primary" disabled={busy || !priceId || !dataCenterId}>{busy ? "正在跳转…" : "继续付款"}</button>
    </form>
  </div></PageShell>;
}

export function Account({ config }) {
  const [servers, setServers] = useState([]), [error, setError] = useState(""), [busy, setBusy] = useState(false), [centers, setCenters] = useState([]);
  useEffect(() => { api("/datacenters").then(setCenters).catch(() => {}); }, []);
  useEffect(() => {
    let alive = true, timer;
    const load = async () => { try { const data = await api("/servers"); if (!alive) return; setServers(data); if (data.some(s => ["provisioning", "purchasing"].includes(s.status) || (s.status === "pending_payment" && new URLSearchParams(location.search).get("checkout") === "success") || (s.status === "past_due" && !s.ipv4))) timer = setTimeout(load, 10000); } catch (e) { if (alive) setError(e.message); } };
    load(); return () => { alive = false; clearTimeout(timer); };
  }, []);
  async function portal() { setBusy(true); try { const result = await api("/portal", {}); location.assign(result.url); } catch (e) { setError(e.message); setBusy(false); } }
  return <PageShell config={config} account><div className="portal-container">
    <div className="portal-title"><h1>我的账户</h1><p>{config.user.name} · {config.user.email}</p>{config.user.avatar && <img src={config.user.avatar} width="48" height="48" alt="" referrerPolicy="no-referrer" />}</div>
    {new URLSearchParams(location.search).get("checkout") === "success" && <div className="portal-message success">付款完成后，服务器将自动开通。</div>}
    {error && <div role="alert" className="portal-message error">{error}</div>}
    <button className="portal-button" disabled={busy} onClick={portal}>管理订阅 / 自动续费</button>
    <section className="portal-section"><h2>我的服务器</h2>{servers.length === 0 && <p>尚无服务器。<a href="/billing">选择套餐</a></p>}
      {servers.map(s => <article className="portal-card" key={s.id}><h3>{s.product_name}</h3><p>{s.interval === "year" ? "按年" : "按月"} · {labels[s.status] || s.status}</p><p>地区：{centers.find(c => c.id === s.data_center_id)?.city || s.data_center_id}</p><p>{s.cancel_at_period_end ? "到期后不再续费" : "下次续费"}：{localDate(s.current_period_end)}</p>
        {s.status === "needs_attention" && <p>开通遇到问题，我们会尽快处理</p>}
        {s.ipv4 && ["active", "past_due"].includes(s.status) && <p>{s.ipv4} · <code>ssh root@{s.ipv4}</code> <button onClick={() => navigator.clipboard.writeText(`ssh root@${s.ipv4}`)}>复制</button></p>}
      </article>)}
    </section>
  </div></PageShell>;
}

export function Admin({ config }) {
  const [overview, setOverview] = useState(null), [error, setError] = useState("");
  const load = () => api("/admin/overview").then(setOverview).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);
  async function action(path, method = "POST") {
    if (!confirm(path.endsWith("/retry") ? "重试开通前，请确认已在 hPanel 核对且没有购买到服务器；若为清理失败，请确认需要重试清理。继续？" : "请确认操作，再继续。")) return;
    try { await api(path, {}, method); load(); } catch (e) { setError(e.message); }
  }
  async function linkVm(event, id) {
    event.preventDefault();
    const vmId = Number(new FormData(event.currentTarget).get("vmId"));
    try { await api(`/admin/servers/${id}/link-vm`, { vmId }); setError(""); load(); } catch (e) { setError(e.message); }
  }
  return <PageShell config={config} account><div className="portal-container"><div className="portal-title"><h1>管理后台</h1></div>
    {error && <div role="alert" className="portal-message error">{error}</div>}
    {overview && <><p>用户 {overview.users} · {overview.statuses.map(x => `${labels[x.status] || x.status} ${x.count}`).join(" · ")}</p>
      <section className="portal-section"><h2>最近服务器</h2>{overview.servers.map(s => <article className="portal-card" key={s.id}><h3>{s.product_name} · {s.email}</h3><p>{labels[s.status] || s.status} · {s.ipv4 || "—"} · 到期 {localDate(s.current_period_end)}</p><p>{s.error}</p>{s.status === "needs_attention" && <><button onClick={() => action(`/admin/servers/${s.id}/retry`)}>重试</button> <button onClick={() => action(`/admin/servers/${s.id}/mark-terminated`)}>标记已终止</button>{!s.hostinger_vm_id && <form onSubmit={e => linkVm(e, s.id)}><label>VM ID <input name="vmId" type="number" min="1" step="1" required /></label> <button type="submit">关联 VM</button></form>}</>}</article>)}</section>
      <section className="portal-section"><h2>用户</h2>{overview.accounts.map(u => <p key={u.id}>{u.name} · {u.email} · {u.role} <button onClick={() => action(`/admin/users/${u.id}/${u.disabled ? "enable" : "disable"}`)}>{u.disabled ? "启用" : "停用"}</button></p>)}</section>
      <section className="portal-section"><h2>许愿箱</h2>{overview.feedback.map(f => <p key={f.id}>{f.title} <button onClick={() => action(`/admin/feedback/${f.id}`, "DELETE")}>删除</button></p>)}</section></>}
  </div></PageShell>;
}
