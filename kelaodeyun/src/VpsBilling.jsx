import React, { useEffect, useRef, useState } from "react";
import { Check, Cpu, MemoryStick, HardDrive, Network, Lock, RefreshCw } from "lucide-react";
import { PageShell, PageTitle, Message } from "./SitePages.jsx";
import { api } from "./site-api.js";
import { money, regionName, flag, cycleUnit, cycleLabel, Skeleton } from "./VpsShared.jsx";

const storageKey = "kelaodeyun-checkout";
const groups = { "North America": "北美", Europe: "欧洲", Asia: "亚洲", Oceania: "大洋洲", "South America": "南美", "north america": "北美", europe: "欧洲", asia: "亚洲", oceania: "大洋洲", "south america": "南美" };
const continentOrder = ["北美", "欧洲", "亚洲", "大洋洲", "南美"];
const continentRank = name => { const index = continentOrder.indexOf(name); return index < 0 ? continentOrder.length : index; };
const readSelection = () => {
  try { return JSON.parse(sessionStorage.getItem(storageKey) || "{}") || {}; } catch { return {}; }
};
const cycleKey = price => price.intervalCount === 1 ? price.interval : `${price.interval}:${price.intervalCount}`;
const cycleMonths = price => price.intervalCount * (price.interval === "year" ? 12 : 1);
const priceForCycle = (plan, cycle) => plan?.prices.find(price => cycleKey(price) === cycle);
const quote = (price, regionId) => regionId ? price?.byRegion?.[regionId] : Object.values(price?.byRegion || {}).sort((a, b) => a.firstAmount - b.firstAmount)[0];
const savings = (plan, cycle, regionId) => {
  const month = quote(priceForCycle(plan, "month"), regionId), price = priceForCycle(plan, cycle), selectedQuote = quote(price, regionId);
  return month && selectedQuote ? Math.max(0, Math.round((1 - selectedQuote.firstRecurringAmount / cycleMonths(price) / month.amount) * 100)) : 0;
};

function Summary({ selected, cycle, center }) {
  const price = priceForCycle(selected, cycle), base = quote(price, ""), selectedQuote = center ? quote(price, center.id) : base;
  const amount = selectedQuote ? money(selectedQuote.amount) : "—", firstAmount = selectedQuote ? money(selectedQuote.firstAmount) : "—";
  const extra = selectedQuote && base ? selectedQuote.amount - base.amount : 0;
  return <aside className="vps-order vps-order-top" aria-label="订单摘要">
    <div className="vps-summary-total" aria-live="polite"><span>{center ? "今日支付" : "首期价格"}</span><strong>{firstAmount}{!center && selectedQuote && <em> 起</em>}</strong></div>
    <dl>
      <div><dt>首期套餐费用</dt><dd>{base ? money(base.firstRecurringAmount) : "—"}</dd></div>
      {selectedQuote?.setupAmount > 0 && <div><dt>一次性开通费</dt><dd>{money(selectedQuote.setupAmount)}</dd></div>}
      <div><dt>地区附加费{price && ` /${cycleUnit(price.interval, price.intervalCount)}`}</dt><dd>{!center ? "待选择地区" : extra > 0 ? `+${money(extra)}` : "无地区附加费"}</dd></div>
    </dl>
    {center && <p>{regionName(center)}</p>}
    {selectedQuote?.discountAmount > 0 && <p>首期套餐费用已含优惠 {money(selectedQuote.discountAmount)}</p>}
    <p>{selectedQuote ? `之后每${cycleUnit(price.interval, price.intervalCount)}续费 ${amount}${!center ? " 起，选择地区后确定总价" : "，已含地区附加费"}` : "选择地区后查看续费金额。"}</p>
  </aside>;
}

export function Billing({ config }) {
  const [saved] = useState(readSelection);
  const [plans, setPlans] = useState([]), [centers, setCenters] = useState([]), [cycle, setCycle] = useState(saved.cycle || "month"), [priceId, setPriceId] = useState(saved.priceId || ""), [dataCenterId, setDataCenterId] = useState(String(saved.dataCenterId || "")), [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0);
  const [step, setStep] = useState(saved.priceId && saved.step !== 1 ? 2 : 1), historyInitialized = useRef(false);
  useEffect(() => {
    if (!historyInitialized.current) {
      historyInitialized.current = true;
      const restore = saved.priceId && saved.step !== 1;
      history.replaceState({ ...history.state, billingStep: 1 }, "");
      if (restore) history.pushState({ ...history.state, billingStep: 2 }, "");
    }
    const onPopState = event => { setStep(event.state?.billingStep === 2 ? 2 : 1); window.scrollTo(0, 0); };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [saved]);
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
  const selectedPrice = priceForCycle(selected, currentCycle), selectedQuote = center && quote(selectedPrice, center.id);
  useEffect(() => {
    if (!loading && selected && dataCenterId && !selectedQuote) setDataCenterId("");
  }, [loading, selected, dataCenterId, selectedQuote]);
  const ready = !!selected && !!center && !!selectedQuote && !loading && !loadError;
  const missing = !center ? "请选择地区" : !selectedQuote ? "该套餐在所选地区不可用" : "";
  const grouped = centers.reduce((result, item) => { const name = groups[item.continent] || item.continent || "其他"; (result[name] ||= []).push(item); return result; }, {});
  const regionGroups = Object.entries(grouped).sort(([a], [b]) => continentRank(a) - continentRank(b));
  function changeCycle(next) {
    if (currentCycle === next) return;
    const nextPrice = priceForCycle(selected, next);
    setCycle(next);
    setPriceId(nextPrice?.priceId || "");
    if (dataCenterId && !quote(nextPrice, dataCenterId)) setDataCenterId("");
  }
  function selectPlan(price) {
    setPriceId(price.priceId);
    if (dataCenterId && !quote(price, dataCenterId)) setDataCenterId("");
  }
  function nextStep() {
    if (!selected) return;
    history.pushState({ ...history.state, billingStep: 2 }, "");
    setStep(2);
    window.scrollTo(0, 0);
  }
  function editPlan() {
    history.back();
  }
  async function submit(event) {
    event.preventDefault();
    if (!ready || busy) return;
    if (!config.user) {
      try { sessionStorage.setItem(storageKey, JSON.stringify({ cycle: currentCycle, priceId, dataCenterId, step: 2 })); } catch { setError("无法保存当前选择，请启用浏览器会话存储后重试。"); return; }
      location.assign("/login?return=%2Fbilling"); return;
    }
    setBusy(true); setError("");
    try { const { url } = await api("/checkout", { priceId, dataCenterId }); try { sessionStorage.removeItem(storageKey); } catch {} location.assign(url); }
    catch (e) { setError(e.message); setBusy(false); }
  }
  const summaryProps = { selected, cycle: currentCycle, center };
  const currentStep = step === 2 && (selected || loading) ? 2 : 1;
  return <PageShell config={config} account={!!config.user}><div className="portal-container vps-billing-page" data-ui>
    <PageTitle title={currentStep === 1 ? "选择套餐" : "选择地区并付款"} description="付款后自动开通，按所选周期自动续费，可随时关闭。" />
    {config.paymentMode === "test" && <Message>当前为测试付款，不会扣取真实费用，也不会创建真实服务器。</Message>}
    <p className="vps-wizard-progress" aria-label="购买进度"><span aria-current={currentStep === 1 ? "step" : undefined}>1 选择套餐</span> · <span aria-current={currentStep === 2 ? "step" : undefined}>2 选择地区并付款</span></p>
    {error && <Message kind="error">{error}</Message>}
    {loadError ? <div className="vps-load-error" role="alert"><h2>套餐暂时无法加载</h2><p>我们正在准备可售套餐，请稍后再来。</p>{config.user?.role === "admin" && <p className="vps-load-error-detail">{loadError}</p>}<button type="button" className="portal-button" onClick={() => setAttempt(n => n + 1)}><RefreshCw size={16} />重试</button></div> : <>
      <div className={currentStep === 2 ? "vps-checkout-layout" : "vps-plan-wizard"}>
        <form id="vps-checkout" onSubmit={submit}>
          {currentStep === 1 ? <section className="vps-form-section">
            <div className="vps-section-heading"><span>1</span><div><h2>套餐</h2><p>选择适合你的服务器配置。</p></div></div>
            {cycles.length > 0 && <div className="vps-cycle" role="group" aria-label="付款周期">{cycles.map(option => {
              const key = cycleKey(option), maxSavings = Math.max(0, ...plans.map(plan => savings(plan, key, "")));
              return <button key={key} type="button" onClick={() => changeCycle(key)} aria-pressed={currentCycle === key}>{cycleLabel(option.interval, option.intervalCount)} {maxSavings > 0 && <span>首期最高省 {maxSavings}%</span>}</button>;
            })}</div>}
            {loading ? <div className="vps-plans" aria-label="正在加载套餐" aria-live="polite">{[1, 2, 3, 4].map(n => <Skeleton key={n} />)}</div> : plans.length ? <div className="vps-plans">
              {plans.map(plan => {
                const price = priceForCycle(plan, currentCycle), planQuote = quote(price, ""), chosen = price && price.priceId === priceId;
                const specs = [[Cpu, plan.specs.cpu, "CPU 核心"], [MemoryStick, plan.specs.ramGb, "GB 内存"], [HardDrive, plan.specs.diskGb, "GB SSD 磁盘"], [Network, plan.specs.bandwidthTb, "TB 流量"]];
                return <label className={`vps-plan ${chosen ? "selected" : ""} ${!price ? "unavailable" : ""}`} key={plan.id}>
                  <input className="vps-visually-hidden" type="radio" name="price" checked={!!chosen} disabled={!price} onChange={() => selectPlan(price)} />
                  {chosen && <span className="vps-plan-check"><Check size={14} /></span>}
                  <h3>{plan.name}</h3><div className="vps-plan-price">{planQuote ? <><strong>{money(planQuote.firstRecurringAmount)}</strong><span>起/{cycleUnit(price.interval, price.intervalCount)}</span></> : <span>此周期暂不提供</span>}</div>
                  {planQuote && planQuote.setupAmount > 0 && <p className="vps-plan-month">首期另付一次性开通费 {money(planQuote.setupAmount)}</p>}
                  {planQuote && cycleMonths(price) > 1 && <p className="vps-plan-month">首期约 {money(planQuote.firstRecurringAmount / cycleMonths(price))}/月</p>}
                  {planQuote?.discountAmount > 0 && <p className="vps-plan-month">之后 {money(planQuote.amount)}/{cycleUnit(price.interval, price.intervalCount)} 起续费</p>}
                  <ul>{specs.filter(([, value]) => value !== "" && value != null).map(([Icon, value, label]) => <li key={label}><Icon size={16} />{value} {label}</li>)}</ul>
                </label>;
              })}
            </div> : <div className="vps-empty-plans">暂无可售套餐，请稍后再来</div>}
            <button type="button" className="portal-button primary vps-wizard-next" onClick={nextStep} disabled={!selected || loading}>下一步：选择地区</button>
          </section> : <section className="vps-form-section">
            <div className="vps-wizard-choice"><div><span>已选套餐</span><strong>{selected ? `${selected.name} · ${cycleLabel(selectedPrice.interval, selectedPrice.intervalCount)}` : "加载中…"}</strong></div><button type="button" className="portal-text-link" onClick={editPlan}>修改</button></div>
            <Summary {...summaryProps} />
            <div className="vps-section-heading"><span>2</span><div><h2>地区</h2><p>下方仅为地区附加费，选择后计入上方总价。</p></div></div>
            {loading ? <div className="vps-regions" aria-label="正在加载地区" aria-live="polite">{[1, 2, 3, 4].map(n => <Skeleton key={n} className="vps-skeleton-region" />)}</div> : regionGroups.map(([continent, items]) => <fieldset className="vps-region-group" key={continent}><legend>{continent}</legend><div className="vps-regions vps-regions-priced">{items.map(c => {
              const regionQuote = quote(selectedPrice, c.id);
              const extra = regionQuote ? regionQuote.amount - quote(selectedPrice, "").amount : 0;
              return <label key={c.id} className={`vps-region vps-region-priced ${dataCenterId === String(c.id) ? "selected" : ""} ${!regionQuote ? "unavailable" : ""}`}><input className="vps-visually-hidden" type="radio" name="region" checked={dataCenterId === String(c.id)} disabled={!regionQuote} onChange={() => setDataCenterId(String(c.id))} /><span aria-hidden="true">{flag(c.location)}</span><span className="vps-region-content"><span>{c.city}<small>{c.location?.toUpperCase()}</small></span>{regionQuote ? <strong>{extra > 0 ? `+${money(extra)}/${cycleUnit(selectedPrice.interval, selectedPrice.intervalCount)}` : "无地区附加费"}</strong> : <small>暂不提供</small>}</span></label>;
            })}</div></fieldset>)}
            <div className="vps-checkout-actions">
              <p>按所选周期自动扣款，可在账户页关闭续费。续费失败且已付款期限结束后，服务器及数据会清除，不提供额外欠费宽限期。开通后在账户页查看登录密码。</p>
              <button type="submit" className="portal-button primary" disabled={!ready || busy} aria-live="polite"><Lock size={16} />{busy ? "正在跳转…" : "前往安全支付"}</button>
              <small>{!ready ? missing : "付款由 Stripe 安全处理"}</small>
            </div>
          </section>}
        </form>
      </div>
    </>}
  </div></PageShell>;
}
