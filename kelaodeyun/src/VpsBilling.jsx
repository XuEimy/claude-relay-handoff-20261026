import React, { useEffect, useState } from "react";
import { Check, Cpu, MemoryStick, HardDrive, Network, Lock, RefreshCw, ChevronDown } from "lucide-react";
import { PageShell, PageTitle, Message } from "./SitePages.jsx";
import { api } from "./site-api.js";
import { money, regionName, flag, cycleUnit, cycleLabel, validateKey, Skeleton, CopyButton } from "./VpsShared.jsx";

const storageKey = "kelaodeyun-checkout";
const groups = { "North America": "北美", Europe: "欧洲", Asia: "亚洲", "South America": "南美", "north america": "北美", europe: "欧洲", asia: "亚洲", "south america": "南美" };
const continentOrder = ["北美", "欧洲", "亚洲", "南美"];
const continentRank = name => { const index = continentOrder.indexOf(name); return index < 0 ? continentOrder.length : index; };
const readSelection = () => {
  try { return JSON.parse(sessionStorage.getItem(storageKey) || "{}") || {}; } catch { return {}; }
};
const cycleKey = price => price.intervalCount === 1 ? price.interval : `${price.interval}:${price.intervalCount}`;
const cycleMonths = price => price.intervalCount * (price.interval === "year" ? 12 : 1);
const priceForCycle = (plan, cycle) => plan?.prices.find(price => cycleKey(price) === cycle);
const savings = (plan, cycle) => {
  const month = priceForCycle(plan, "month"), price = priceForCycle(plan, cycle);
  return month && price ? Math.max(0, Math.round((1 - price.amount / cycleMonths(price) / month.amount) * 100)) : 0;
};

function KeyHelp() {
  const [system, setSystem] = useState("unix");
  const view = system === "unix" ? "cat ~/.ssh/id_ed25519.pub" : "type $env:USERPROFILE\\.ssh\\id_ed25519.pub";
  const create = 'ssh-keygen -t ed25519 -C "you@example.com"';
  return <details className="vps-key-help"><summary>如何获取公钥？ <ChevronDown size={16} /></summary>
    <div className="vps-key-help-body">
      <div className="vps-help-tabs" role="tablist" aria-label="操作系统" onKeyDown={e => { if (["ArrowLeft", "ArrowRight"].includes(e.key)) { e.preventDefault(); const next = system === "unix" ? "windows" : "unix"; setSystem(next); document.getElementById(`vps-tab-${next}`)?.focus(); } }}>
        <button id="vps-tab-unix" type="button" role="tab" aria-controls="vps-key-help-panel" aria-selected={system === "unix"} tabIndex={system === "unix" ? 0 : -1} onClick={() => setSystem("unix")}>macOS / Linux</button>
        <button id="vps-tab-windows" type="button" role="tab" aria-controls="vps-key-help-panel" aria-selected={system === "windows"} tabIndex={system === "windows" ? 0 : -1} onClick={() => setSystem("windows")}>Windows (PowerShell)</button>
      </div>
      <div id="vps-key-help-panel" role="tabpanel" aria-labelledby={`vps-tab-${system}`}>
        <p>查看已有公钥</p><div className="vps-code-row"><code>{view}</code><CopyButton value={view} /></div>
        <p>还没有公钥？先生成密钥，再运行上面的命令。</p><div className="vps-code-row"><code>{create}</code><CopyButton value={create} /></div>
      </div>
    </div>
  </details>;
}

function Summary({ selected, cycle, center, ready, missing, busy, mobile }) {
  const price = priceForCycle(selected, cycle), amount = price ? money(price.amount) : "—";
  return <aside className={mobile ? "vps-mobile-summary" : "vps-order"} aria-label="订单摘要">
    {!mobile && <><h2>订单摘要</h2><dl><div><dt>套餐</dt><dd>{price ? `${selected.name} · ${cycleLabel(price.interval, price.intervalCount)}` : "未选择"}</dd></div><div><dt>地区</dt><dd>{regionName(center)}</dd></div></dl></>}
    <div className="vps-summary-total"><span>今日支付</span><strong>{amount}</strong></div>
    {!mobile && <><p>{price ? `之后每${cycleUnit(price.interval, price.intervalCount)}自动续费 ${amount}，可随时在账户中关闭` : "选择套餐后查看续费金额。"}</p><p className="vps-summary-warning">订阅结束后服务器及数据会立即清除</p></>}
    <button type="submit" form="vps-checkout" className="portal-button primary" disabled={!ready || busy} aria-live="polite"><Lock size={16} />{busy ? "正在跳转…" : "前往安全支付"}</button>
    <small>{!ready ? missing : mobile ? "付款由 Stripe 安全处理" : "付款由 Stripe 安全处理"}</small>
  </aside>;
}

export function Billing({ config }) {
  const [saved] = useState(readSelection);
  const [plans, setPlans] = useState([]), [centers, setCenters] = useState([]), [cycle, setCycle] = useState(saved.cycle || "month"), [priceId, setPriceId] = useState(saved.priceId || ""), [dataCenterId, setDataCenterId] = useState(String(saved.dataCenterId || "")), [publicKey, setPublicKey] = useState(saved.publicKey || ""), [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true); setLoadError("");
    Promise.all([api("/plans"), api("/datacenters")]).then(([p, d]) => { if (alive) { setPlans(p); setCenters(d); } }).catch(e => { if (alive) setLoadError(e.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [attempt]);
  const cycles = [...new Map(plans.flatMap(plan => plan.prices).map(price => [cycleKey(price), price])).values()].sort((a, b) => cycleMonths(a) - cycleMonths(b));
  const currentCycle = cycles.some(price => cycleKey(price) === cycle) ? cycle : cycleKey(cycles[0] || { interval: "month", intervalCount: 1 });
  const selected = plans.find(p => priceForCycle(p, currentCycle)?.priceId === priceId);
  const center = centers.find(c => String(c.id) === dataCenterId);
  const key = validateKey(publicKey);
  const ready = !!selected && !!center && key.valid && !loading && !loadError;
  const missing = !selected ? "请选择套餐" : !center ? "请选择地区" : !key.valid ? "请填写有效的 SSH 公钥" : "";
  const grouped = centers.reduce((result, item) => { const name = groups[item.continent] || item.continent || "其他"; (result[name] ||= []).push(item); return result; }, {});
  const regionGroups = Object.entries(grouped).sort(([a], [b]) => continentRank(a) - continentRank(b));
  function changeCycle(next) {
    if (currentCycle === next) return;
    setCycle(next);
    setPriceId(priceForCycle(selected, next)?.priceId || "");
  }
  async function submit(event) {
    event.preventDefault();
    if (!ready || busy) return;
    if (!config.user) {
      try { sessionStorage.setItem(storageKey, JSON.stringify({ cycle: currentCycle, priceId, dataCenterId, publicKey })); } catch { setError("无法保存当前选择，请启用浏览器会话存储后重试。"); return; }
      location.assign("/login?return=%2Fbilling"); return;
    }
    setBusy(true); setError("");
    try { const { url } = await api("/checkout", { priceId, dataCenterId, publicKey }); try { sessionStorage.removeItem(storageKey); } catch {} location.assign(url); }
    catch (e) { setError(e.message); setBusy(false); }
  }
  const summaryProps = { selected, cycle: currentCycle, center, ready, missing, busy };
  return <PageShell config={config} account={!!config.user}><div className="portal-container vps-billing-page" data-ui>
    <PageTitle title="选择服务器" description="付款后自动开通，按所选周期自动续费，可随时关闭。" />
    {error && <Message kind="error">{error}</Message>}
    {loadError ? <div className="vps-load-error" role="alert"><h2>套餐暂时无法加载</h2><p>我们正在准备可售套餐，请稍后再来。</p>{config.user?.role === "admin" && <p className="vps-load-error-detail">{loadError}</p>}<button type="button" className="portal-button" onClick={() => setAttempt(n => n + 1)}><RefreshCw size={16} />重试</button></div> : <>
      <div className="vps-billing-layout">
        <form id="vps-checkout" onSubmit={submit}>
          <section className="vps-form-section">
            <div className="vps-section-heading"><span>1</span><div><h2>套餐</h2><p>选择适合你的服务器配置。</p></div></div>
            {cycles.length > 0 && <div className="vps-cycle" role="group" aria-label="付款周期">{cycles.map(option => {
              const key = cycleKey(option), maxSavings = Math.max(0, ...plans.map(plan => savings(plan, key)));
              return <button key={key} type="button" onClick={() => changeCycle(key)} aria-pressed={currentCycle === key}>{cycleLabel(option.interval, option.intervalCount)} {maxSavings > 0 && <span>最高省 {maxSavings}%</span>}</button>;
            })}</div>}
            {loading ? <div className="vps-plans" aria-label="正在加载套餐" aria-live="polite">{[1, 2, 3, 4].map(n => <Skeleton key={n} />)}</div> : plans.length ? <div className="vps-plans">
              {plans.map(plan => {
                const price = priceForCycle(plan, currentCycle), chosen = price && price.priceId === priceId;
                const specs = [[Cpu, plan.specs.cpu, "CPU 核心"], [MemoryStick, plan.specs.ramGb, "GB 内存"], [HardDrive, plan.specs.diskGb, "GB NVMe 磁盘"], [Network, plan.specs.bandwidthTb, "TB 流量"]];
                return <label className={`vps-plan ${chosen ? "selected" : ""} ${!price ? "unavailable" : ""}`} key={plan.id}>
                  <input className="vps-visually-hidden" type="radio" name="price" checked={!!chosen} disabled={!price} onChange={() => setPriceId(price.priceId)} />
                  {chosen && <span className="vps-plan-check"><Check size={14} /></span>}
                  <h3>{plan.name}</h3><div className="vps-plan-price">{price ? <><strong>{money(price.amount)}</strong><span>/{cycleUnit(price.interval, price.intervalCount)}</span></> : <span>此周期暂不提供</span>}</div>
                  {price && cycleMonths(price) > 1 && <p className="vps-plan-month">约 {money(price.amount / cycleMonths(price))}/月</p>}
                  <ul>{specs.filter(([, value]) => value !== "" && value != null).map(([Icon, value, label]) => <li key={label}><Icon size={16} />{value} {label}</li>)}</ul>
                </label>;
              })}
            </div> : <div className="vps-empty-plans">暂无可售套餐，请稍后再来</div>}
          </section>
          <section className="vps-form-section">
            <div className="vps-section-heading"><span>2</span><div><h2>地区</h2><p>选择服务器所在的数据中心。</p></div></div>
            {loading ? <div className="vps-regions" aria-label="正在加载地区" aria-live="polite">{[1, 2, 3, 4].map(n => <Skeleton key={n} className="vps-skeleton-region" />)}</div> : regionGroups.map(([continent, items]) => <fieldset className="vps-region-group" key={continent}><legend>{continent}</legend><div className="vps-regions">{items.map(c => <label key={c.id} className={`vps-region ${dataCenterId === String(c.id) ? "selected" : ""}`}><input className="vps-visually-hidden" type="radio" name="region" checked={dataCenterId === String(c.id)} onChange={() => setDataCenterId(String(c.id))} /><span aria-hidden="true">{flag(c.location)}</span><span>{c.city}<small>{c.location?.toUpperCase()}</small></span></label>)}</div></fieldset>)}
          </section>
          <section className="vps-form-section">
            <div className="vps-section-heading"><span>3</span><div><h2>SSH 公钥</h2><p>用于安全登录服务器，请勿提交私钥。</p></div></div>
            <label className="vps-key-label" htmlFor="vps-public-key">公钥内容</label>
            <textarea id="vps-public-key" className="vps-key-input" value={publicKey} onChange={e => setPublicKey(e.target.value)} rows={4} spellCheck={false} placeholder="ssh-ed25519 AAAA…" aria-invalid={!!key.error} aria-describedby="vps-key-feedback" />
            <div id="vps-key-feedback" className={`vps-key-feedback ${key.error ? "error" : "valid"}`} aria-live="polite">{key.valid ? <><Check size={16} />已识别 {key.type} 公钥{key.comment && ` · ${key.comment}`}</> : key.error}</div>
            <KeyHelp />
          </section>
        </form>
        <Summary {...summaryProps} />
      </div>
      <Summary {...summaryProps} mobile />
    </>}
  </div></PageShell>;
}
