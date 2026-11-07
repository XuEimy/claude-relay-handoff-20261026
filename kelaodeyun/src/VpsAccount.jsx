import React, { useEffect, useState } from "react";
import { ArrowRight, Check, Plus } from "lucide-react";
import { PageShell, PageTitle, Message, EmptyState } from "./SitePages.jsx";
import { api } from "./site-api.js";
import { localDate, regionName, cycleLabel, StatusPill, CopyButton, Avatar, Skeleton, ConfirmDialog } from "./VpsShared.jsx";

const EmptyCloud = () => <span className="brand-cloud vps-empty-mark" aria-hidden="true" />;

function Progress({ status }) {
  const current = status === "pending_payment" ? 0 : status === "active" ? 3 : 1;
  return <div className="vps-progress-wrap"><ol className="vps-progress">{["付款确认", "创建服务器", "系统启动"].map((label, i) => <li key={label} aria-current={i === current ? "step" : undefined} className={i < current ? "done" : i === current ? "current" : ""}><span>{i < current ? <Check size={14} /> : i + 1}</span>{label}</li>)}</ol>{current < 3 && <p>通常需要 3–10 分钟</p>}</div>;
}
function ServerCard({ server: s, center, checkoutSuccess, supportEmail, portal, portalBusy, cancelRenewal }) {
  const [credentials, setCredentials] = useState(null), [showPassword, setShowPassword] = useState(false), [credentialsError, setCredentialsError] = useState(""), [credentialsBusy, setCredentialsBusy] = useState(false);
  const pending = s.status === "pending_payment" && !checkoutSuccess;
  const provisioning = ["provisioning", "purchasing"].includes(s.status) || (s.status === "pending_payment" && checkoutSuccess);
  const connected = ["active", "past_due"].includes(s.status);
  useEffect(() => { if (!connected) { setCredentials(null); setShowPassword(false); } }, [connected]);
  async function loadCredentials() {
    setCredentialsBusy(true); setCredentialsError("");
    try { setCredentials(await api(`/servers/${s.id}/credentials`)); }
    catch (e) { setCredentialsError(e.message); }
    finally { setCredentialsBusy(false); }
  }
  return <article className="vps-server-card">
    <div className="vps-server-heading"><h3>{s.product_name}</h3><StatusPill status={s.status} simulated={s.simulated} /></div>
    {(provisioning || s.status === "active") && <Progress status={s.status} />}
    {connected && <div className="vps-connection">
      <div><span>用户名</span><div className="vps-address"><strong>root</strong></div></div>
      <div><span>服务器 IP</span><div className="vps-address"><strong>{s.ipv4 || "—"}</strong>{s.ipv4 && <CopyButton value={s.ipv4} />}</div></div>
      <div><span>登录密码</span><div className="vps-address">{credentials ? <><input className="vps-password" type={showPassword ? "text" : "password"} value={credentials.password} readOnly aria-label="root 登录密码" /><button type="button" className="vps-copy" onClick={() => setShowPassword(value => !value)}>{showPassword ? "隐藏" : "显示"}</button><CopyButton value={credentials.password} label="复制密码" sensitive /></> : <button type="button" className="vps-copy" onClick={loadCredentials} disabled={credentialsBusy}>{credentialsBusy ? "加载中…" : "查看密码"}</button>}</div></div>
      {credentialsError && <Message kind="error">{credentialsError}</Message>}
      {s.ipv4 && <div className="vps-command"><code>ssh root@{s.ipv4}</code><CopyButton value={`ssh root@${s.ipv4}`} /></div>}
      {s.simulated ? <p className="vps-simulated-note">测试订单，未创建真实服务器</p> : s.ipv4 && <a className="portal-text-link" href="/download">在 kelaodeyun App 中连接 <ArrowRight size={16} /></a>}
    </div>}
    {s.status === "past_due" && <div className="vps-inline-notice warning"><p>续费尚未支付成功，请更新付款方式。已付款期限结束后，系统将停止服务并清除数据，不提供额外欠费宽限期。</p><button type="button" onClick={portal} disabled={portalBusy}>管理订阅与付款 <ArrowRight size={15} /></button></div>}
    {s.status === "needs_attention" && <div className="vps-inline-notice danger"><p>开通遇到问题，我们已收到通知并会尽快处理。</p>{supportEmail && <a href={"mailto:" + supportEmail}>联系支持 <ArrowRight size={15} /></a>}</div>}
    {(pending || s.status === "checkout_expired") && <div className="vps-inline-notice"><p>付款未完成</p><a href="/billing">重新选择套餐 <ArrowRight size={15} /></a></div>}
    {!pending && s.status !== "checkout_expired" && <dl className="vps-server-details">
      <div><dt>地区</dt><dd>{center ? regionName(center) : s.region || "—"}</dd></div>
      <div><dt>计费周期</dt><dd>{cycleLabel(s.interval, s.interval_count)}</dd></div>
      {!["terminated", "terminating"].includes(s.status) && <div><dt>{s.cancel_at_period_end || s.provider_cancel_requested ? "到期后停止" : "下次续费"}</dt><dd className={s.cancel_at_period_end ? "warning" : ""}>{localDate(s.paid_through || s.current_period_end)}</dd></div>}
      <div><dt>开通时间</dt><dd>{localDate(s.created)}</dd></div>
    </dl>}
    {s.provider_cancel_requested && !["terminated", "terminating"].includes(s.status) ? <p className="vps-inline-notice">已申请关闭自动续费，服务器可使用至已付款期限结束。请提前备份数据；如需恢复，请联系支持。</p> : !s.cancel_at_period_end && ["active", "past_due", "provisioning", "purchasing"].includes(s.status) && <button type="button" className="portal-text-link" disabled={portalBusy} onClick={() => cancelRenewal(s)}>关闭自动续费</button>}
  </article>;
}
export function Account({ config }) {
  const [servers, setServers] = useState(null), [centers, setCenters] = useState([]), [error, setError] = useState(""), [loadError, setLoadError] = useState(""), [attempt, setAttempt] = useState(0), [busy, setBusy] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [accountHosts, setAccountHosts] = useState([]), [revokeBusy, setRevokeBusy] = useState(false), [revokeDone, setRevokeDone] = useState(false);
  const checkoutSuccess = new URLSearchParams(location.search).get("checkout") === "success";
  useEffect(() => { api("/datacenters").then(setCenters).catch(() => {}); }, []);
  useEffect(() => { api("/app/hosts").then(data => setAccountHosts(data.hosts.filter(host => host.source === "account"))).catch(e => setError(e.message)); }, []);
  async function revokeAppSessions() {
    setRevokeBusy(true); setError(""); setRevokeDone(false);
    try { await api("/account/app-sessions/revoke", {}); setRevokeDone(true); }
    catch (e) { setError(e.message); }
    finally { setRevokeBusy(false); }
  }
  useEffect(() => {
    let alive = true, timer;
    setLoadError("");
    async function load() {
      try {
        const data = await api("/servers");
        if (!alive) return;
        setServers(data); setLoadError("");
        if (data.some(s => ["pending_payment", "provisioning", "purchasing"].includes(s.status) || (s.status === "past_due" && !s.ipv4))) timer = setTimeout(load, 10000);
      } catch (e) { if (alive) setLoadError(e.message); }
    }
    load(); return () => { alive = false; clearTimeout(timer); };
  }, [attempt]);
  async function portal() {
    setBusy(true); setError("");
    try { const result = await api("/portal", {}); location.assign(result.url); }
    catch (e) { setError(e.message); setBusy(false); }
  }
  async function cancelRenewal() {
    setBusy(true); setError("");
    try { await api(`/servers/${cancelTarget.id}/cancel-renewal`, {}); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); setCancelTarget(null); setAttempt(n => n + 1); }
  }
  const ended = (servers || []).filter(s => ["terminated", "checkout_expired"].includes(s.status) || (s.status === "pending_payment" && !checkoutSuccess));
  const current = (servers || []).filter(s => !ended.includes(s)).sort((a, b) => Number(b.status === "active") - Number(a.status === "active"));
  const hasPortal = (servers || []).some(s => !["pending_payment", "checkout_expired"].includes(s.status));
  const card = s => <ServerCard key={s.id} server={s} center={centers.find(c => String(c.id) === String(s.region))} checkoutSuccess={checkoutSuccess} supportEmail={config.supportEmail} portal={portal} portalBusy={busy} cancelRenewal={setCancelTarget} />;
  return <PageShell config={config} account><div className="portal-container vps-account-page" data-ui>
    <PageTitle title="我的账户" description="在这里查看你的服务器与订阅。" />
    <section className="vps-profile"><div className="vps-profile-person"><Avatar user={config.user} /><div><h2>{config.user.name || "我的账户"} {config.user.role === "admin" && <span className="vps-admin-badge">管理员</span>}</h2><p>{config.user.email}</p></div></div><div className="vps-profile-actions"><a className="portal-button primary" href="/billing"><Plus size={16} />购买新服务器</a>{hasPortal && <button type="button" className="portal-button" onClick={portal} disabled={busy}>管理订阅与付款</button>}</div></section>
    {checkoutSuccess && <Message>已返回网站，正在核对付款与开通状态，请以下方服务器状态为准。</Message>}
    {error && <Message kind="error">{error}</Message>}
    <section className="vps-account-servers"><div className="vps-list-heading"><h2>账户绑定的 SSH 服务器</h2></div>{accountHosts.length ? <ul>{accountHosts.map(host => <li key={host.id}>{host.label} · {host.username}@{host.hostname}:{host.port}</li>)}</ul> : <p>暂无账户绑定的 SSH 服务器</p>}<button type="button" className="portal-button" onClick={revokeAppSessions} disabled={revokeBusy}>退出所有 App 登录</button>{revokeDone && <Message>已退出所有 App 登录。</Message>}</section>
    {loadError && <Message kind="error">{loadError} <button type="button" className="vps-retry-inline" onClick={() => setAttempt(n => n + 1)}>重试</button></Message>}
    <section className="vps-account-servers" aria-live="polite"><div className="vps-list-heading"><h2>我的服务器</h2>{servers && servers.length > 0 && <span>{servers.length} 台</span>}</div>
      {!servers ? !loadError && <Skeleton /> : servers.length === 0 ? <EmptyState icon={EmptyCloud} title="还没有服务器" action={<a className="portal-button primary" href="/billing">选择服务器 <ArrowRight size={16} /></a>}>选择一个套餐，付款后几分钟内自动开通。</EmptyState> : <>
        <div className="vps-server-list">{current.map(card)}</div>
        {ended.length > 0 && <details className="vps-ended"><summary>已结束的服务器（{ended.length}）</summary><div className="vps-server-list">{ended.map(card)}</div></details>}
      </>}
    </section>
    <ConfirmDialog action={cancelTarget && { title: "关闭自动续费", description: `服务器可使用至 ${localDate(cancelTarget.paid_through || cancelTarget.current_period_end)}，之后会清除数据。系统将同时向供应商申请到期取消，无法自行撤销，请提前备份。`, confirm: "确认关闭自动续费" }} busy={busy} onClose={() => setCancelTarget(null)} onConfirm={cancelRenewal} />
  </div></PageShell>;
}
