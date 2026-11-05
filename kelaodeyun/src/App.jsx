import AppShowcase from "./components/AppShowcase.jsx";
import { Login, Billing, Account, Admin as VpsAdmin } from "./VpsPages.jsx";
import { DownloadPage, GuidePage, SupportPage, PolicyPage, NotFoundPage, RetiredPage } from "./SitePages.jsx";
import { api } from "./site-api.js";
export { api } from "./site-api.js";
import CardSwap, { Card } from "./components/react-bits/CardSwap.jsx";
import { CLAUDE_MODELS } from "./model-catalogue.js";
import DigitalGlobe from "./components/DigitalGlobe.jsx";
import React, { useState, useEffect, useRef } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Menu,
  X,
  Search,
  MessageSquare,
  Wallet,
  ChevronDown,
  Check,
  LoaderCircle,
  Pause,
  Play,
  RefreshCw,
  FileText,
  ThumbsUp,
  ThumbsDown,
  ChevronRight,
  Terminal,
} from "lucide-react";
function IconButton({ label, children, ...props }) {
  return (
    <button className="icon-button" aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}
function Notice({ children }) {
  return children ? (
    <div className="notice" role="status">
      {children}
    </div>
  ) : null;
}
function Brand({ compact = false }) {
  return (
    <a
      className={"brand " + (compact ? "compact" : "")}
      href="/"
      aria-label="kelaodeyun 首页"
    >
      <span className="brand-cloud" aria-hidden="true" />
      {!compact && <span>kelaodeyun</span>}
    </a>
  );
}
function Art({ kind = 0 }) {
  return (
    <svg viewBox="0 0 160 180" aria-hidden="true" className={"art art-" + kind}>
      <rect width="160" height="180" className="art-bg" />
      {kind % 4 === 0 ? (
        <>
          <g fill="none" stroke="currentColor" strokeWidth="1.2">
            {Array.from({ length: 7 }, (_, i) => (
              <ellipse
                key={i}
                cx="80"
                cy="88"
                rx="47"
                ry="29"
                transform={`rotate(${i * 26} 80 88)`}
              />
            ))}
          </g>
          <circle cx="80" cy="88" r="6" fill="currentColor" />
        </>
      ) : kind % 4 === 1 ? (
        <>
          <g stroke="currentColor" strokeWidth=".7" opacity=".55">
            {Array.from({ length: 9 }, (_, i) => (
              <React.Fragment key={i}>
                <path d={`M${i * 20} 0V180`} />
                <path d={`M0 ${i * 20}H160`} />
              </React.Fragment>
            ))}
          </g>
          <path
            d="M0 137Q36 20 75 90T160 43V180H0"
            fill="currentColor"
            opacity=".85"
          />
          <circle cx="104" cy="47" r="15" fill="#d5da98" />
        </>
      ) : kind % 4 === 2 ? (
        <>
          <g fill="none" stroke="currentColor" strokeWidth="1.4">
            {Array.from({ length: 8 }, (_, i) => (
              <path
                key={i}
                d={`M-20 ${155 - i * 3}Q${40 + i * 9} ${-35 + i * 14} 180 ${140 + i * 6}`}
              />
            ))}
          </g>
          <rect x="18" y="132" width="42" height="8" fill="currentColor" />
          <text
            x="18"
            y="156"
            fontSize="8"
            fill="currentColor"
            fontFamily="monospace"
          >
            THINK / CREATE
          </text>
        </>
      ) : (
        <>
          <g fill="currentColor">
            {Array.from({ length: 25 }, (_, i) => {
              const x = i % 5,
                y = Math.floor(i / 5);
              return (x + y) % 3 !== 0 ? (
                <rect
                  key={i}
                  x={25 + x * 23}
                  y={30 + y * 23}
                  width="12"
                  height="12"
                  transform={`rotate(${(x + y) % 2 ? 45 : 0} ${31 + x * 23} ${36 + y * 23})`}
                />
              ) : null;
            })}
          </g>
          <circle cx="80" cy="88" r="7" fill="#ca6952" />
        </>
      )}
    </svg>
  );
}
function Home({ config }) {
  const [menu, setMenu] = useState(false),
    [opening, setOpening] = useState(true),
    [paused, setPaused] = useState(false);
  useEffect(() => {
    const openingTimer = setTimeout(() => setOpening(false), 2100);
    const esc = (e) => e.key === "Escape" && setMenu(false);
    window.addEventListener("keydown", esc);
    document.title = "kelaodeyun · 云端工作空间";
    return () => {
      clearTimeout(openingTimer);
      window.removeEventListener("keydown", esc);
    };
  }, []);
  return (
    <div className="site relay-home">
      <a className="skip-link" href="#main">
        跳转到正文
      </a>
      <header className="site-header">
        <nav className="header-left">
          <a href="/billing">服务器套餐</a>
          <a href="/guide">使用指南</a>
          <a href="/download">下载 App</a>
        </nav>
        <Brand />
        <div className="header-right">
          <a className="pill" href={config.user ? "/account" : "/login"}>
            {config.user ? "我的账户" : "登录"}
          </a>
          <IconButton
            label={menu ? "关闭菜单" : "打开菜单"}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X size={18} /> : <Menu size={18} />}
          </IconButton>
        </div>
      </header>
      {menu && (
        <nav className="mobile-menu">
          {[
            ["/billing", "服务器套餐"],
            ["/guide", "使用指南"],
            ["/download", "下载 App"],
            ["#questions", "常见问题"],
            ["/billing", "我的账户"],
          ].map(([href, label]) => (
            <a key={href} href={href} onClick={() => setMenu(false)}>
              {label}
              <ArrowUpRight />
            </a>
          ))}
        </nav>
      )}
      <main id="main">
        <section
          className="gateway-hero"
          aria-label="云上克劳德"
          data-motion={paused ? "paused" : "playing"}
          data-opening={opening ? "true" : "false"}
        >
          <div className="gateway-globe" aria-hidden="true">
            <DigitalGlobe paused={paused} />
          </div>
          <div className="gateway-intro">
            <h1>云上克劳德</h1>
            <p>连接你的服务器，在桌面使用 Claude Code。</p>
            <div className="gateway-actions">
              <a className="button dark" href="/billing">
                选择服务器 <ArrowRight size={17} />
              </a>
              <a className="button" href="/download">
                下载 App
              </a>
            </div>
            <ul className="gateway-facts">
              <li>
                <MessageSquare size={17} />
                远程工作空间
              </li>
              <li>
                <RefreshCw size={17} />
                继续已有会话
              </li>
              <li>
                <Wallet size={17} />
                云端文件
              </li>
            </ul>
          </div>
          <div className="gateway-features">
            <article className="gateway-feature">
              <h2>
                <MessageSquare size={17} />
                一个账户，管理服务器
              </h2>
              <div className="gateway-account">
                <MessageSquare size={21} />
                <span>云上克劳德</span>
              </div>
              <div className="gateway-route">
                <span>你的问题</span>
                <ArrowRight size={15} />
                <span>Claude</span>
                <ArrowRight size={15} />
                <span>你的答案</span>
              </div>
              <a href={config.user ? "/account" : "/login"}>
                管理我的账户 <ArrowRight size={13} />
              </a>
            </article>
            <article className="gateway-feature">
              <h2>
                <RefreshCw size={17} />
                云端服务器
              </h2>
              <p className="gateway-model-name">选择适合你的服务器套餐</p>
              <a href="/download">
                下载桌面 App <ArrowRight size={13} />
              </a>
            </article>
            <article className="gateway-feature">
              <h2>
                <Wallet size={17} />
                订阅清晰，灵活续费
              </h2>
              <p className="gateway-model-name">月付或年付，自动续费</p>
              <a href="/billing">
                查看套餐 <ArrowRight size={13} />
              </a>
            </article>
          </div>
          <IconButton
            label={paused ? "播放背景动画" : "暂停背景动画"}
            onClick={() => setPaused(!paused)}
            className="gateway-motion"
          >
            {paused ? <Play size={14} /> : <Pause size={14} />}
          </IconButton>
        </section>
        <AppShowcase />
        <TrustSection />
        <ModelCarousel config={{ ...config, models: [] }} />
        <RelayArchitecture />
        <CreativeWork />
        <UserFeedback config={config} />
        <HomeQuestions config={config} />
      </main>
      <RelayFooter config={config} />
    </div>
  );
}
function UserFeedback({ config }) {
  const [items, setItems] = useState([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [form, setForm] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    let live = true;
    api("/feedback")
      .then((data) => {
        if (live) setItems(data.items);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  async function vote(item, value) {
    if (!config.user) {
      setError("登录后即可投票或提交建议");
      return;
    }
    setBusy(item.id);
    setError("");
    try {
      const data = await api("/feedback/" + item.id + "/vote", {
        vote: item.myVote === value ? 0 : value,
      });
      setItems(data.items);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }
  async function submit(event) {
    event.preventDefault();
    setBusy("submit");
    setError("");
    try {
      const data = await api(
        "/feedback",
        Object.fromEntries(new FormData(event.currentTarget)),
      );
      setItems(data.items);
      setForm(false);
      setMessage("建议已提交");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }
  return (
    <section
      id="feedback"
      className="user-feedback feedback-board content-width"
      aria-labelledby="user-feedback-title"
    >
      <header>
        <div>
          <h2 id="user-feedback-title">功能许愿箱</h2>
        </div>
        <button
          className="feedback-add"
          onClick={() => {
            if (!config.user) {
              setError("登录后即可投票或提交建议");
              return;
            }
            setForm(!form);
            setMessage("");
          }}
          aria-expanded={form}
        >
          <Plus size={15} />
          提个建议
        </button>
      </header>
      {(error || message) && (
        <div className="feedback-status" role="status">
          {error || message}
          {!config.user && (
            <a href="/login">
              登录 <ArrowUpRight size={13} />
            </a>
          )}
        </div>
      )}
      {form && (
        <form className="feedback-form" onSubmit={submit}>
          <label>
            功能名称
            <input
              name="title"
              maxLength={60}
              required
              placeholder="你想要的功能"
              autoFocus
            />
          </label>
          <label>
            具体建议
            <textarea
              name="description"
              maxLength={400}
              required
              rows={3}
              placeholder="希望解决什么问题？"
            />
          </label>
          <div>
            <button type="button" onClick={() => setForm(false)}>
              取消
            </button>
            <button className="feedback-submit" disabled={busy === "submit"}>
              {busy === "submit" ? "提交中…" : "提交建议"}
            </button>
          </div>
        </form>
      )}
      <div className="wish-grid">
        {items.map((item) => (
          <article className="wish-card" key={item.id}>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
            <div
              className={"wish-preview wish-" + item.kind}
              aria-hidden="true"
            >
              {item.kind === "compare" ? (
                <>
                  <div className="wish-chat">
                    <span>Haiku</span>
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className="wish-chat">
                    <span>Sonnet</span>
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className="wish-chat">
                    <span>Opus</span>
                    <i />
                    <i />
                    <i />
                  </div>
                </>
              ) : item.kind === "history" ? (
                <div className="wish-history">
                  <div>
                    <FileText size={15} />
                    <span>index.html</span>
                    <span className="wish-added">+12 −4</span>
                  </div>
                  <div>
                    <span className="wish-history-dot" />
                    调整页面布局<small>当前版本</small>
                  </div>
                  <div>
                    <span className="wish-history-dot" />
                    创建首页
                    <small>
                      恢复此版本 <ArrowRight size={10} />
                    </small>
                  </div>
                </div>
              ) : item.kind === "budget" ? (
                <div className="wish-budget">
                  <div>
                    <span>每日预算</span>
                    <strong>示例</strong>
                  </div>
                  <div className="wish-budget-bar">
                    <span />
                  </div>
                  <div>
                    <span>接近预算时提醒</span>
                    <span className="wish-switch" />
                  </div>
                  <div>
                    <span>服务状态提醒</span>
                    <span className="wish-switch" />
                  </div>
                </div>
              ) : (
                <div className="wish-idea">
                  <MessageSquare size={25} />
                  <span>你的想法，下一步的方向。</span>
                </div>
              )}
            </div>
            <div
              className="wish-votes"
              role="group"
              aria-label={"投票：" + item.title}
            >
              <button
                aria-label={"赞成：" + item.title}
                aria-pressed={item.myVote === 1}
                disabled={busy === item.id}
                onClick={() => vote(item, 1)}
              >
                <ThumbsUp size={17} />
                <span>{item.up}</span>
              </button>
              <button
                aria-label={"反对：" + item.title}
                aria-pressed={item.myVote === -1}
                disabled={busy === item.id}
                onClick={() => vote(item, -1)}
              >
                <ThumbsDown size={17} />
                <span>{item.down}</span>
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
function ModelCarousel({ config }) {
  const [playing, setPlaying] = useState(true);
  const track = useRef(null);
  const items = CLAUDE_MODELS;
  const artwork = {
    "claude-opus-5-5": "opus",
    "claude-sonnet-5-5": "sonnet",
    "claude-haiku-5-5": "haiku",
    "claude-opus-4-5-20251101": "opus-4-5",
    "claude-sonnet-4-5-20250929": "sonnet-4-5",
    "claude-haiku-4-5-20251001": "haiku-4-5",
  };
  const description = {
    fable: "长程任务与深度推理",
    opus: "复杂任务与代码工作",
    sonnet: "写作、分析与日常编码",
    haiku: "轻量、高频、快速响应",
    mythos: "受限的安全研究型号",
  };
  const move = (direction, manual = true) => {
    const el = track.current;
    if (!el) return;
    if (manual) setPlaying(false);
    const distance =
      (el.firstElementChild?.getBoundingClientRect().width || 236) + 16;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    el.scrollBy({
      left: direction * distance,
      behavior: reduced ? "auto" : "smooth",
    });
  };
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    if (
      !playing ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    let visible = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
      },
      { threshold: 0.35 },
    );
    observer.observe(el);
    let frame;
    let previous = 0;
    let position = el.scrollLeft;
    const tick = (time) => {
      const elapsed = previous ? Math.min(time - previous, 50) : 0;
      previous = time;
      if (visible && !document.hidden && !el.matches(":hover") &&
          !el.contains(document.activeElement)) {
        position = Math.max(position, el.scrollLeft);
        position = Math.min(el.scrollWidth - el.clientWidth, position + elapsed * 0.022);
        el.scrollLeft = position;
      } else {
        position = el.scrollLeft;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [playing]);
  return (
    <section
      id="models"
      className="model-carousel content-width"
      aria-labelledby="model-carousel-title"
    >
      <header>
        <h2 id="model-carousel-title">Claude 模型</h2>
      </header>
      <div
        className="model-scroll-track"
        ref={track}
        tabIndex={0}
        role="region"
        aria-label="Claude 在线模型，横向滚动查看，空格暂停轮播"
        onPointerDown={() => setPlaying(false)}
        onWheel={() => setPlaying(false)}
        onKeyDown={(e) => {
          if (e.key === " ") {
            e.preventDefault();
            setPlaying((old) => !old);
          }
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            e.preventDefault();
            move(e.key === "ArrowRight" ? 1 : -1);
          }
        }}
      >
        {items.map((model) => {
          const configured = config.models.find(
            (m) =>
              m.name.replace(/\s/g, "").toLowerCase() ===
              model.name.replace(/\s/g, "").toLowerCase(),
          );
          return (
            <article className="model-mini-card" key={model.id}>
              <img
                src={"/images/cards/" + (artwork[model.id] || model.id.replace("claude-", "")) + ".jpg"}
                alt=""
                loading="lazy"
                width="300"
                height="110"
              />
              <div>
                {model.note && (
                  <span className={"model-availability " + model.group}>
                    {model.note}
                  </span>
                )}
                <h3>{model.name}</h3>
                <p>{description[model.family]}</p>
                <a
                  href={
                    configured
                      ? model.url
                      : model.url
                  }
                  {...(!configured
                    ? { target: "_blank", rel: "noreferrer" }
                    : {})}
                >
                  官方资料
                  <ArrowUpRight size={13} />
                </a>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
function RelayArchitecture() {
  return (
    <section id="how-it-works" className="code-sequence" aria-labelledby="architecture-title">
      <div className="code-swap-section content-width">
      <h2 id="architecture-title">从一个想法，<br />到下一个作品。</h2>
      <div className="code-swap-preview">
        <CardSwap autoplay delay={4200} draggable intro={false}
          width={440} height={280} cardDistance={22} verticalDistance={24}
          depth={38} visibleCards={5} skewAmount={3} speed={0.85}
          bounce={0.12} parallax={0.7} hoverSpread={0.05} dim={0.12}
          cardRadius={15} theme="light">
          <Card className="code-demo-card">
            <div className="code-demo-head"><MessageSquare size={16} />任务</div>
            <div className="code-demo-conversation">
              <p className="code-demo-user">把首页做得更简洁一点。</p>
              <div className="code-demo-answer"><MessageSquare size={16} /><p>我先看看页面结构，再精简布局和文案。</p></div>
              <div className="code-demo-composer">继续这个想法 <ArrowUp size={15} /></div>
            </div>
          </Card>
          <Card className="code-demo-card">
            <div className="code-demo-head"><Search size={16} />读懂项目</div>
            <div className="code-demo-tree">
              <div><FileText size={15} /><code>src/App.jsx</code><span>首页结构</span></div>
              <div><FileText size={15} /><code>src/styles.css</code><span>页面样式</span></div>
              <div><FileText size={15} /><code>package.json</code><span>项目依赖</span></div>
            </div>
            <div className="code-demo-result"><Check size={17} /><span>沿用项目原有的设计。</span></div>
          </Card>
          <Card className="code-demo-card">
            <div className="code-demo-head"><Terminal size={16} />执行</div>
            <div className="code-demo-tools">
              <div><Check size={14} /><span>读取页面</span><code>src/App.jsx</code></div>
              <div><Check size={14} /><span>整理样式</span><code>src/styles.css</code></div>
              <div><Check size={14} /><span>生成修改</span><code>2 files</code></div>
            </div>
            <div className="code-demo-result"><FileText size={17} /><span>去掉重复说明，保留必要入口。</span></div>
          </Card>
          <Card className="code-demo-card">
            <div className="code-demo-head"><FileText size={16} />修改确认 <code>App.jsx</code></div>
            <div className="code-demo-diff"><div><span>−</span>&lt;h1&gt;让每一次创造更简单&lt;/h1&gt;</div><div><span>+</span>&lt;h1&gt;少操作，多创造。&lt;/h1&gt;</div><div><span>−</span>&lt;p&gt;从这里开启无限可能&lt;/p&gt;</div></div>
            <div className="code-demo-actions" aria-hidden="true"><span>拒绝</span><span>允许修改 <Check size={13} /></span></div>
          </Card>
          <Card className="code-demo-card">
            <div className="code-demo-head"><Check size={16} />完成</div>
            <div className="code-demo-finished">
              <span className="code-demo-finished-mark" aria-hidden="true">✳</span>
              <h3>少操作，多创造。</h3>
              <span className="code-demo-finished-link">开始使用 <ArrowUpRight size={13} /></span>
            </div>
          </Card>
        </CardSwap>
      </div>
      </div>
    </section>
  );
}

function CreativeWork() {
  const [mode, setMode] = useState("写作");
  return (
    <section className="creative-sequence" aria-labelledby="creative-work-title">
      <div className="creative-work content-width">
      <div className="creative-work-intro">
        <h2 id="creative-work-title">让想法，<br />有个着落。</h2>
        <div className="creative-work-modes" aria-label="切换作品示例">
          {["写作", "编程", "文件"].map(name => <button key={name} aria-pressed={mode === name} onClick={() => setMode(name)}>{name}<ArrowUpRight size={19} /></button>)}
        </div>
      </div>
      <div className="creative-work-output" key={mode} aria-label={mode + "作品示例"}>
        {mode === "写作" ? <div className="creative-letter">
          <span className="creative-handmark" aria-hidden="true">Dear,</span>
          <h3>好想法，<br />值得被好好表达。</h3>
          <p>把零散的念头整理成段落，把冗长的句子写得清楚。</p>
          <p>一封邮件、一篇文章，<br />或者，那个迟迟没有写下的开头。</p>
          <div className="creative-signature" aria-hidden="true">从第一句话开始。<span>✳</span></div>
        </div> : mode === "编程" ? <div className="creative-code">
          <h3>从一个念头，<br />到可以运行。</h3>
          <pre><code><span>export default</span> function Idea() {'{'}<br />{'  '}return (<br />{'    '}&lt;main&gt;<br />{'      '}&lt;h1&gt;Hello, idea.&lt;/h1&gt;<br />{'    '}&lt;/main&gt;<br />{'  '});<br />{'}'}</code></pre>
          <div className="creative-code-line"><Check size={16} />读懂项目。完成修改。由你确认。</div>
        </div> : <div className="creative-document">
          <h3>让复杂的资料，<br />变得有条理。</h3>
          <div className="creative-document-heading">项目笔记</div>
          {[['01', '提取重点', '从长文中，找到真正重要的部分。'], ['02', '理清结构', '把信息放回合适的位置。'], ['03', '继续完善', '围绕同一份内容，反复打磨。']].map(([n,title,text]) => <div className="creative-document-line" key={n}><span>{n}</span><div><h4>{title}</h4><p>{text}</p></div></div>)}
        </div>}
      </div>
      </div>
    </section>
  );
}

function TrustSection() {
  return (
    <section className="trust-section trust-editorial content-width" aria-labelledby="trust-title">
      <h2 id="trust-title" className="trust-title">服务保障</h2>
      <div className="trust-editorial-grid">
        <article className="trust-story">
          <img className="trust-art" src="/images/cards/stability.jpg" alt="" loading="lazy" width="768" height="512" />
          <div className="trust-copy">
            <h3>稳定</h3>
            <div className="trust-facts"><p>服务器状态随时可查。</p><p>订阅付款后自动开通。</p></div>
            <a href="/account">我的服务器 <ArrowUpRight size={16} /></a>
          </div>
        </article>
        <article className="trust-story">
          <img className="trust-art" src="/images/cards/security.jpg" alt="" loading="lazy" width="768" height="512" />
          <div className="trust-copy">
            <h3>安全</h3>
            <div className="trust-facts"><p>账户使用 Google 登录。</p><p>SSH 公钥用于开通服务器。</p></div>
            <a href="/privacy">隐私说明 <ArrowUpRight size={16} /></a>
          </div>
        </article>
      </div>
      <div className="trust-access">
        <div id="how" className="trust-guide">
          <h3>使用指南</h3>
          <nav aria-label="开始使用的步骤"><a href="/login">登录 <ArrowUpRight size={14} /></a><span aria-hidden="true">→</span><a href="/billing">选择服务器 <ArrowUpRight size={14} /></a><span aria-hidden="true">→</span><a href="/download">下载 App <ArrowUpRight size={14} /></a></nav>
        </div>
        <div id="recharge" className="trust-billing">
          <h3>订阅与账单</h3>
          <p>按月或按年订阅，在账户中管理续费。</p>
          <a href="/billing">查看套餐 <ArrowUpRight size={14} /></a>
        </div>
      </div>
    </section>
  );
}
function HomeQuestions({ config }) {
  return (
    <section className="home-questions content-width">
      <section id="questions" className="relay-faq">
        <h2>常见问题</h2>
        <div className="relay-faq-items">
          {[
            [
              "这是一个什么服务？",
              "kelaodeyun 是独立的桌面 App，连接你自己的服务器并使用远端 Claude CLI。网站提供产品信息、账户与账单服务。",
            ],
            [
              "和 Claude、Anthropic 是什么关系？",
              "本站是独立服务，不是 Anthropic 或其他模型服务商的官方网站。",
            ],
            [
              "如何开通服务器？",
              "选择套餐、地区并提供 SSH 公钥，完成订阅付款后自动开通。",
            ],
            [
              "费用如何计算？",
              "服务器按月或按年自动续费，以套餐页面的美元价格为准。",
            ],
            [
              "对话会保存吗？",
              "桌面 App 可读取目标服务器上的 Claude 历史并恢复文本消息；历史记录属于对应的远程环境，不是本网站中的聊天列表。",
            ],
            [
              "支持开发者 API 调用吗？",
              "网站不再提供网页聊天入口；面向开发者的公共 API Key 与调用入口尚未开放。",
            ],
          ].map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <Plus size={18} />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
      <section id="download" className="relay-bottom-cta" aria-label="下载 App">
        <h2>少操作，多创造。</h2>
        <p>在桌面连接你的云端工作空间。</p>
        <div>
          <a className="button dark" href="/download">查看 App 下载 <ArrowRight size={17} /></a>
        </div>
        {config.supportEmail && (
          <a className="relay-contact" href={"mailto:" + config.supportEmail}>
            联系与反馈 <ArrowUpRight size={13} />
          </a>
        )}
      </section>
    </section>
  );
}
function RelayFooter({ config }) {
  const groups = [
    [
      "关于本站",
      [
        ["服务介绍", "#main"],
        ["常见问题", "/support"],
      ],
    ],
    [
      "服务器套餐",
      [
        ["查看套餐", "/billing"],
        ["费用如何计算", "/billing"],
      ],
    ],
    [
      "桌面 App",
      [["下载 App", "/download"]],
    ],
    [
      "订阅与账单",
      [
        ["选择套餐", "/billing"],
        ["管理订阅", "/account"],
      ],
    ],
    [
      "使用指南",
      [
        ["开始使用", "/guide"],
        ["订阅方式", "/billing"],
      ],
    ],
    [
      "账户管理",
      [
        ["登录账户", "/login"],
        ["我的服务器", "/account"],
      ],
    ],
    [
      "帮助与支持",
      [
        ["常见问题", "/support"],
        ...(config.supportEmail
          ? [["联系我们", "mailto:" + config.supportEmail]]
          : []),
      ],
    ],
    ["隐私与安全", [["隐私说明", "/privacy"]]],
    ["条款与政策", [["服务说明", "/terms"]]],
  ];
  return (
    <footer className="anthropic-footer" aria-label="网站底部">
      <div className="anthropic-footer-grid">
        <div className="anthropic-footer-brand">
          <a
            className="anthropic-footer-wordmark"
            href="/"
            aria-label="kelaodeyun 首页"
          >
            <span className="brand-cloud" aria-hidden="true" />
            kelaodeyun
          </a>
          <div className="anthropic-footer-meta">
            <p>© 2026 {config.operator || "kelaodeyun"}</p>
            <div className="anthropic-footer-shortcuts">
              <a href="/download" aria-label="下载 App" title="下载 App">
                <MessageSquare size={18} />
              </a>
              <a href="/billing" aria-label="服务器套餐" title="服务器套餐">
                <Wallet size={18} />
              </a>
              <a href="#questions" aria-label="常见问题" title="常见问题">
                <Search size={18} />
              </a>
            </div>
          </div>
        </div>
        <nav className="anthropic-footer-navigation" aria-label="底部导航">
          {groups.map(([title, links]) => (
            <details key={title}>
              <summary>
                {title}
                <ChevronDown size={14} />
              </summary>
              <div>
                {links.map(([label, href]) => (
                  <a href={href} key={label}>
                    {label}
                    <ArrowUpRight size={12} />
                  </a>
                ))}
              </div>
            </details>
          ))}
        </nav>
        <div className="anthropic-footer-about">
          <section>
            <h2>我们的服务</h2>
            <p>独立桌面 App，连接你的云端工作空间。</p>
          </section>
          <section>
            <h2>登录</h2>
            <a href="/download">
              下载 App <ArrowUpRight size={12} />
            </a>
            <a href="/billing">
              账户中心 <ArrowUpRight size={12} />
            </a>
            {config.user?.role === "admin" && (
              <a href="/admin">
                管理后台 <ArrowUpRight size={12} />
              </a>
            )}
          </section>
        </div>
      </div>
    </footer>
  );
}
export function App() {
  const path = location.pathname;
  if (path === "/chat" || path === "/code" || path === "/claude-ui")
    return <RetiredPage />;
  return <SiteApp />;
}
function SiteApp() {
  const [config, setConfig] = useState(null),
    [error, setError] = useState("");
  const refresh = async () => {
    const c = await api("/config");
    setConfig(c);
    return c;
  };
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);
  if (error)
    return (
      <div className="loading-page">
        <Brand />
        <Notice>{error}</Notice>
        <button className="button" onClick={() => location.reload()}>
          重新加载
        </button>
      </div>
    );
  if (!config)
    return (
      <div className="loading-page">
        <Brand />
        <LoaderCircle className="spin" />
      </div>
    );
  return (
    <>
      <AppRoute config={config} refresh={refresh} />
    </>
  );
}
function AppRoute({ config, refresh }) {
  const path = location.pathname.replace(/\/$/, "") || "/";
  if (path === "/") return <Home config={config} />;
  if (path === "/download") return <DownloadPage config={config} />;
  if (path === "/guide") return <GuidePage config={config} />;
  if (path === "/support") return <SupportPage config={config} />;
  if (path === "/privacy" || path === "/terms") return <PolicyPage config={config} terms={path === "/terms"} />;
  if (path === "/login") return <Login config={config} />;
  if (path === "/billing") return <Billing config={config} />;
  if (["/account", "/admin"].includes(path)) {
    if (!config.user) {
      location.replace("/login?return=" + encodeURIComponent(path));
      return null;
    }
    if (path === "/account") return <Account config={config} />;
    if (path === "/admin" && config.user.role === "admin") return <VpsAdmin config={config} />;
  }
  return <NotFoundPage config={config} />;
}
