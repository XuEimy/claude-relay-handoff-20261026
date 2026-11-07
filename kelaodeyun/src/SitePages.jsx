import AppShowcase from "./components/AppShowcase.jsx";
import React, { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, Menu, X, Download, FileText, ShieldCheck, Check, LogOut, Monitor, Terminal, ChevronDown, Search, AlertCircle, Mail } from "lucide-react";
import { api } from "./site-api.js";
import "./site-pages.css";

const navigation = [["/billing", "服务器套餐"], ["/guide", "使用指南"], ["/download", "下载 App"]];
export function SiteBrand() {
  return <a className="brand" href="/" aria-label="kelaodeyun 首页"><span className="brand-cloud" aria-hidden="true" /><span>kelaodeyun</span></a>;
}
export function PageShell({ config, children, account = false }) {
  const [open, setOpen] = useState(false), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const path = location.pathname;
  useEffect(() => {
    const close = e => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  const logout = async () => {
    setBusy(true); setError("");
    try { await api("/logout", {}); location.href = "/"; }
    catch (e) { setError(e.message); setBusy(false); }
  };
  return (
    <div className="portal">
      <a className="skip-link" href="#page-main">跳转到正文</a>
      <header className="portal-header">
        <SiteBrand />
        <nav aria-label="主导航">{navigation.map(([href, title]) => <a key={href} href={href} aria-current={path === href ? "page" : undefined}>{title}</a>)}</nav>
        <a className="portal-account-link" href={config.user ? "/account" : "/login"}>{config.user ? "我的账户" : "登录"}<ArrowUpRight size={16} /></a>
        <button className="portal-menu" type="button" aria-label={open ? "关闭导航" : "打开导航"} aria-expanded={open} aria-controls="portal-mobile-nav" onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
      </header>
      {open && <nav id="portal-mobile-nav" className="portal-mobile-nav" aria-label="移动端导航">{navigation.map(([href, label]) => <a href={href} key={href}>{label}<ArrowRight size={16} /></a>)}</nav>}
      {account && <div className="portal-account-nav">
        <nav aria-label="账户导航">
          {[["/account", "账户概览"], ["/billing", "服务器套餐"]].map(([href, label]) => <a key={href} href={href} aria-current={path === href ? "page" : undefined}>{label}</a>)}
          {config.user?.role === "admin" && <a href="/admin" aria-current={path === "/admin" ? "page" : undefined}>管理后台</a>}
        </nav>
        <button onClick={logout} disabled={busy}><LogOut size={16} />{busy ? "正在退出" : "退出登录"}</button>
      </div>}
      {error && <div className="portal-container"><Message kind="error">{error}</Message></div>}
      <main id="page-main" className="portal-main">{children}</main>
      <footer className="portal-footer">
        <div><SiteBrand /><p>连接云端，继续创造。</p></div>
        <nav aria-label="页脚导航"><a href="/guide">使用指南</a><a href="/support">帮助与支持</a><a href="/privacy">隐私说明</a><a href="/terms">服务说明</a></nav>
        <small>© {new Date().getFullYear()} kelaodeyun</small>
      </footer>
    </div>
  );
}
export function PageTitle({ title, description, children }) {
  useEffect(() => { document.title = `${title} · kelaodeyun`; }, [title]);
  return <div className="portal-title"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{children}</div>;
}
export function Message({ children, kind = "info" }) {
  return children ? <div className={"portal-message " + kind} role={kind === "error" ? "alert" : "status"}>{kind === "success" ? <Check size={18} /> : <AlertCircle size={18} />}<div>{children}</div></div> : null;
}
export function EmptyState({ title, children, icon: Icon = FileText, action }) {
  return <div className="portal-empty"><Icon size={25} /><h3>{title}</h3><p>{children}</p>{action}</div>;
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
  ["prepare", "准备环境", "准备可通过 SSH 登录的 Linux x86_64 服务器，并在目标用户下安装和登录 Claude CLI。请确认该用户可以访问项目目录。"],
  ["install", "安装桌面 App", "当前 macOS 安装包正在准备中。发布后，从本站下载页获取安装包；无需在网站中提交服务器密码。"],
  ["connect", "添加服务器", "安装完成后，在 App 的连接管理中添加自己的服务器。连接成功后选择“进入工作区”，确认当前服务器和项目目录。"],
  ["work", "继续工作", "在对应工作区中查看已有 Claude 会话，或使用终端继续工作。历史恢复以文本消息为主，并非完整的工具事件回放。"],
  ["files", "管理云端文件", "在文件区域浏览、预览和下载文件，也可以拖入本地文件上传。当前单文件上传上限为 32 MiB，已有同名文件不会直接覆盖。"],
  ["billing", "管理网站账户", "在网站账户中查看服务器状态，并通过订阅管理页面更改付款方式或自动续费。订阅结束后服务器数据将被清除。"],
];
export function GuidePage({ config }) {
  return <PageShell config={config}><div className="portal-container">
    <PageTitle title="使用指南" description="从准备服务器，到进入你的工作空间。" />
    <div className="portal-reading-layout">
      <aside><nav aria-label="本文目录">{guideSections.map(([id, title]) => <a href={"#" + id} key={id}>{title}</a>)}</nav><a className="portal-button" href="/download">查看下载状态 <Download size={16} /></a></aside>
      <article className="portal-prose">
        {guideSections.map(([id, title, body], index) => <section id={id} key={id}><h2>{index + 1}. {title}</h2><p>{body}</p>{id === "billing" && <a className="portal-text-link" href="/billing">前往服务器套餐 <ArrowRight size={16} /></a>}</section>)}
        <section><h2>连接不成功？</h2><p>先检查 SSH 地址、网络与登录权限，再确认服务器架构、Claude CLI 登录状态和项目目录。网站的登录状态不会替代服务器上的 CLI 登录。</p><a className="portal-text-link" href="/support">查看帮助中心 <ArrowRight size={16} /></a></section>
      </article>
    </div>
  </div></PageShell>;
}
const helpGroups = [
  ["account", "账户与登录", [
    ["无法登录怎么办？", "使用 Google 账户登录；账户被停用时请联系站点管理员。"],
    ["如何管理登录信息？", "请在 Google 账户中管理登录信息，不要向任何人发送密码。"],
    ["如何退出登录？", "登录后在账户导航中选择退出登录。"],
  ]],
  ["payment", "订阅与付款", [
    ["付款完成但服务器还没有开通？", "开通可能需要片刻，请在账户页面查看状态，勿重复付款。"],
    ["如何管理自动续费？", "在账户页面打开订阅管理，可修改付款方式或选择到期后停止续费。"],
    ["订阅结束后服务器会怎样？", "订阅结束后服务器数据将立即清除，请提前备份。"],
    ["可以退款或开票吗？", "当前没有自助退款或开票入口。请通过已公布的支持渠道联系运营方，具体处理以运营方确认信息为准。"],
    ["服务器订阅包含 Claude 订阅吗？", "服务器订阅不包含 Claude 官方订阅。"],
  ]],
  ["desktop", "桌面 App", [
    ["现在可以下载吗？", "macOS 安装包正在准备中。下载页会在发布后提供真实安装包。"],
    ["支持什么服务器？", "当前自定义远端运行程序支持 Linux x86_64。其他架构尚未完成适配验收。"],
    ["可以使用网页聊天吗？", "网站目前提供产品介绍、账户和账单服务，工作入口已转向桌面 App。"],
  ]],
];
export function SupportPage({ config }) {
  const [search, setSearch] = useState("");
  const groups = helpGroups.map(([id, title, items]) => [id, title, items.filter(([q, a]) => (q + a).includes(search.trim()))]);
  return <PageShell config={config}><div className="portal-container">
    <PageTitle title="帮助与支持" description="找到问题，也找到下一步。" />
    <label className="portal-search"><Search size={19} /><input type="search" aria-label="搜索帮助问题" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索登录、付款、服务器…" /></label>
    <div className="portal-reading-layout">
      <aside><nav aria-label="帮助分类">{helpGroups.map(([id, title]) => <a href={"#" + id} key={id}>{title}</a>)}</nav></aside>
      <div className="portal-help">
        {groups.some(g => g[2].length) ? groups.filter(g => g[2].length).map(([id, title, items]) => <section id={id} key={id}><h2>{title}</h2>{items.map(([q, a]) => <details key={q}><summary>{q}<ChevronDown size={18} /></summary><p>{a}</p></details>)}</section>) : <EmptyState title="没有找到相关问题">试试更短的关键词，或查看下方联系方式。</EmptyState>}
        <section className="portal-contact"><Mail size={24} /><h2>需要进一步帮助？</h2><p>请提供问题描述和相关订单号。不要发送密码、密钥或完整的支付凭据。</p>{config.supportEmail ? <a className="portal-text-link" href={"mailto:" + config.supportEmail}>{config.supportEmail}<ArrowUpRight size={16} /></a> : <p className="portal-hint">支持邮箱尚未公布，请联系向你提供本站的管理员。</p>}</section>
      </div>
    </div>
  </div></PageShell>;
}
export function PolicyPage({ config, terms = false }) {
  const sections = terms ? [
    ["service", "服务范围", "kelaodeyun 是独立产品。网站提供服务器订阅及账户服务；桌面 App 连接服务器及远端 Claude CLI，不代表 Anthropic 官方产品。"],
    ["billing", "服务器订阅", "服务器订阅按所选的月、年或两年周期自动扣款，价格以美元显示。付款由 Stripe 处理，可在账户页面更新付款方式、查看账单和关闭自动续费。", "关闭续费后可使用至已付款期限结束，系统同时向供应商申请取消，不能自行撤销。续费失败且已付款期限结束后停止服务并清除数据，不提供额外欠费宽限期，请提前备份。恢复服务、退款或开票事宜请联系运营方确认。"],
    ["account", "账户使用", "使用 Google 账户登录并妥善保管登录信息。管理员可基于实际运营情况管理账户和服务配置。"],
    ["availability", "版本与可用性", "macOS 安装包尚未发布。实际功能、支持的平台和使用条件以发布版本及下载页说明为准。网站不承诺尚未开放的渠道、模型或功能。"],
  ] : [
    ["data", "网站保存的信息", "网站保存 Google 账户标识、邮箱、昵称、头像、服务器订阅信息、加密的服务器 root 密码和反馈。"],
    ["payment", "支付信息", "订阅和支付由 Stripe 处理。完整银行卡信息不经过本站。"],
    ["desktop", "桌面端与服务器", "桌面 App 连接用户提供的 SSH 环境。本网站为订购的服务器生成并加密保存 root 密码，登录后可在账户页查看。"],
    ["retention", "记录与处理请求", "如需处理账户或数据问题，请联系运营方。订阅结束后服务器数据将被清除。"],
  ];
  return <PageShell config={config}><div className="portal-container">
    <PageTitle title={terms ? "服务说明" : "隐私说明"} description="了解当前服务范围与账户信息的处理方式。" />
    <Message>此页说明当前产品实现。正式运营主体、联系方式及完整政策尚需在上线前确认。</Message>
    <div className="portal-reading-layout">
      <aside><nav aria-label="说明目录">{sections.map(([id, title]) => <a href={"#" + id} key={id}>{title}</a>)}</nav></aside>
      <article className="portal-prose">{sections.map(([id, title, ...paragraphs]) => <section key={id} id={id}><h2>{title}</h2>{paragraphs.map(p => <p key={p}>{p}</p>)}</section>)}
        <section><h2>运营与联系</h2><p>{config.operator || "运营主体尚未公布。"}</p>{config.supportEmail ? <a href={"mailto:" + config.supportEmail}>{config.supportEmail}</a> : <p>支持邮箱尚未公布，请联系站点管理员。</p>}<a href="/support" className="portal-text-link">查看帮助中心 <ArrowRight size={16} /></a></section>
      </article>
    </div>
  </div></PageShell>;
}
export function NotFoundPage({ config }) {
  return <PageShell config={config}><div className="portal-container"><PageTitle title="这个页面没有找到" description="链接可能已更新，你可以回到首页或使用上方导航。" /><a className="portal-button primary" href="/">返回首页 <ArrowRight size={17} /></a></div></PageShell>;
}
export function RetiredPage() {
  useEffect(() => { location.replace("/download"); }, []);
  return <a href="/download">前往 App 下载页</a>;
}
