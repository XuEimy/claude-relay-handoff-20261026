import React, { useEffect, useState } from "react";
import { PageShell, PageTitle, Message } from "./SitePages.jsx";
import { api } from "./site-api.js";
import { localDate, regionName, StatusPill, Avatar, ConfirmDialog, Skeleton } from "./VpsShared.jsx";

const filters = [
  ["all", "全部"], ["active", "运行中"], ["provisioning", "正在开通"], ["needs_attention", "需要处理"], ["past_due", "付款逾期"], ["ended", "已结束"],
];
const matches = (status, filter) => filter === "all" || (filter === "provisioning" ? ["provisioning", "purchasing", "pending_payment"].includes(status) : filter === "ended" ? ["terminated", "terminating", "checkout_expired"].includes(status) : status === filter);
export function Admin({ config }) {
  const [overview, setOverview] = useState(null), [centers, setCenters] = useState([]), [error, setError] = useState(""), [loadError, setLoadError] = useState(""), [notice, setNotice] = useState(""), [filter, setFilter] = useState("all"), [action, setAction] = useState(null), [busy, setBusy] = useState(false), [vmIds, setVmIds] = useState({});
  const load = () => { setLoadError(""); return api("/admin/overview").then(setOverview).catch(e => setLoadError(e.message)); };
  useEffect(() => { load(); api("/datacenters").then(setCenters).catch(() => {}); }, []);
  async function confirmAction() {
    setBusy(true); setError(""); setNotice("");
    try { await api(action.path, action.body || {}, action.method || "POST"); setAction(null); await load(); setNotice("操作已完成"); }
    catch (e) { setError(e.message); setAction(null); }
    finally { setBusy(false); }
  }
  const ask = (title, description, path, body, method) => setAction({ title, description, path, body, method });
  const region = id => { const center = centers.find(c => String(c.id) === String(id)); return center ? regionName(center) : id || "—"; };
  const counts = Object.fromEntries((overview?.statuses || []).map(x => [x.status, x.count]));
  const kpis = [["用户", overview?.users || 0], ["运行中", counts.active || 0], ["正在开通", (counts.provisioning || 0) + (counts.purchasing || 0)], ["需要处理", counts.needs_attention || 0], ["付款逾期", counts.past_due || 0]];
  const attention = overview?.servers.filter(s => s.status === "needs_attention") || [];
  return <PageShell config={config} account><div className="portal-container vps-admin-page" data-ui>
    <PageTitle title="管理后台" description="查看服务器状态与需要处理的事项。" />
    {error && <Message kind="error">{error}</Message>}
    {loadError && <Message kind="error">{loadError} <button type="button" className="vps-retry-inline" onClick={load}>重试</button></Message>}
    {notice && <Message kind="success">{notice}</Message>}
    {!overview ? !loadError && <Skeleton /> : <>
      <section className="vps-kpis" aria-label="概览">{kpis.map(([name, value]) => <div key={name} className={name === "需要处理" && value > 0 ? "attention" : ""}><span>{name}</span><strong>{value}</strong></div>)}</section>
      <section className="vps-admin-section"><div className="vps-list-heading"><h2>需要处理</h2><span>{attention.length} 项</span></div>
        {attention.length === 0 ? <p className="vps-admin-empty">目前没有需要处理的服务器。</p> : <div className="vps-attention-list">{attention.map(s => <article className="vps-attention-row" key={s.id}>
          <div><h3>{s.product_name} <StatusPill status={s.status} /></h3><p>{s.email} · {region(s.data_center_id)} · 更新于 {localDate(s.updated)}</p><p className="vps-admin-error">{s.error}</p></div>
          <div className="vps-admin-actions"><button type="button" onClick={() => ask("重试服务器", "重试开通前，请确认已在 hPanel 核对且没有购买到服务器；若为清理失败，请确认需要重试清理。", `/admin/servers/${s.id}/retry`)}>重试</button>
            <button type="button" onClick={() => ask("标记已终止", "此操作只会停止跟踪，不会清除或关闭 Hostinger 虚拟机。请先在 hPanel 核对。", `/admin/servers/${s.id}/mark-terminated`)}>标记已终止</button>
            {!s.hostinger_vm_id && <form onSubmit={e => { e.preventDefault(); ask("关联 VM", "请确认该 VM 属于此 Hostinger 订单。系统会验证订单并继续查询服务器状态。", `/admin/servers/${s.id}/link-vm`, { vmId: Number(vmIds[s.id]) }); }}><label><span className="vps-visually-hidden">VM ID</span><input type="number" min="1" step="1" required placeholder="VM ID" value={vmIds[s.id] || ""} onChange={e => setVmIds({ ...vmIds, [s.id]: e.target.value })} /></label><button type="submit">关联 VM</button></form>}
          </div>
        </article>)}</div>}
      </section>
      <section className="vps-admin-section"><h2>全部服务器</h2><div className="vps-filter" role="group" aria-label="服务器状态">{filters.map(([key, title]) => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{title}</button>)}</div>
        <p className="vps-table-hint">左右滑动查看完整表格</p>
        <div className="vps-table-scroll" tabIndex={0}><table className="vps-table"><thead><tr>{["用户", "套餐", "周期", "状态", "IP", "地区", "到期", "更新时间"].map(x => <th key={x}>{x}</th>)}</tr></thead><tbody>{overview.servers.filter(s => matches(s.status, filter)).map(s => <tr key={s.id}><td>{s.email}</td><td>{s.product_name}</td><td>{s.interval === "year" ? "按年" : "按月"}</td><td><StatusPill status={s.status} /></td><td>{s.ipv4 || "—"}</td><td>{region(s.data_center_id)}</td><td>{localDate(s.current_period_end)}</td><td>{localDate(s.updated)}</td></tr>)}</tbody></table></div>
      </section>
      <section className="vps-admin-section"><h2>用户</h2><p className="vps-table-hint">左右滑动查看完整表格</p><div className="vps-table-scroll" tabIndex={0}><table className="vps-table"><thead><tr>{["用户", "身份", "状态", "注册时间", "操作"].map(x => <th key={x}>{x}</th>)}</tr></thead><tbody>{overview.accounts.map(u => <tr key={u.id}><td><div className="vps-table-user"><Avatar user={u} /><span><strong>{u.name || "用户"}</strong><small>{u.email}</small></span></div></td><td>{u.role === "admin" ? "管理员" : "用户"}</td><td>{u.disabled ? "已停用" : "正常"}</td><td>{localDate(u.created)}</td><td><button onClick={() => ask(u.disabled ? "启用用户" : "停用用户", u.disabled ? "允许该用户重新登录并使用账户。" : "停用后该用户将无法使用当前会话或重新登录。", `/admin/users/${u.id}/${u.disabled ? "enable" : "disable"}`)}>{u.disabled ? "启用" : "停用"}</button></td></tr>)}</tbody></table></div></section>
      <section className="vps-admin-section"><h2>许愿箱</h2>{overview.feedback.length ? <ul className="vps-feedback">{overview.feedback.map(f => <li key={f.id}><div><strong>{f.title}</strong><p>{f.description}</p></div><button onClick={() => ask("删除建议", "删除后该建议及其投票将无法恢复。", `/admin/feedback/${f.id}`, {}, "DELETE")}>删除</button></li>)}</ul> : <p className="vps-admin-empty">暂无建议。</p>}</section>
    </>}
    <ConfirmDialog action={action} busy={busy} onClose={() => setAction(null)} onConfirm={confirmAction} />
  </div></PageShell>;
}
