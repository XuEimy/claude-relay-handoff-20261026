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
  Settings,
  LogOut,
  ChevronDown,
  Check,
  Copy,
  Trash2,
  Square,
  LoaderCircle,
  PanelLeftClose,
  Pause,
  Play,
  KeyRound,
  RefreshCw,
  Pencil,
  FileText,
  ThumbsUp,
  ThumbsDown,
  ChevronRight,
  Terminal,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
const money = (n, d = 2) =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format((n || 0) / 1e6);
const date = (s) =>
  new Date(s).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
const statusLabel = {
  pending: "待支付",
  paid: "已到账",
  failed: "未完成",
  complete: "已完成",
  streaming: "生成中",
  stopped: "已停止",
  interrupted: "已中断",
};
export async function api(path, body, method) {
  const res = await fetch("/api" + path, {
    credentials: "same-origin",
    ...(body !== undefined
      ? {
          method: method || "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await res.json();
  if (!res.ok) throw Error(data.error || "请求失败");
  return data;
}
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
function Empty({ children }) {
  return <div className="empty-state">{children}</div>;
}
function Brand({ compact = false }) {
  return (
    <a
      className={"brand " + (compact ? "compact" : "")}
      href="/"
      aria-label="kelaodeyun 首页"
    >
      <span className="brand-mark">k</span>
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
    [paused, setPaused] = useState(false),
    [heroModelId, setHeroModelId] = useState(
      () =>
        config.models.find((m) => /sonnet/i.test(m.name))?.id ||
        config.models[0]?.id ||
        "",
    );
  const heroModel =
    config.models.find((m) => m.id === heroModelId) || config.models[0];
  const heroChatUrl = heroModel
    ? "/chat?model=" + encodeURIComponent(heroModel.id)
    : "/chat";
  useEffect(() => {
    const openingTimer = setTimeout(() => setOpening(false), 2100);
    const esc = (e) => e.key === "Escape" && setMenu(false);
    window.addEventListener("keydown", esc);
    document.title = "kelaodeyun · AI 模型中转站";
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
          <a href="#models">模型与价格</a>
          <a href="#recharge">充值</a>
          <a href="#how">使用指南</a>
          <a href="/code">Claude Code</a>
        </nav>
        <Brand />
        <div className="header-right">
          <a className="pill" href={config.user ? "/billing" : "/login"}>
            {config.user ? "我的账户" : "登录 / 注册"}
          </a>
          <a className="pill" href="/chat">
            开始聊天 <ArrowUpRight size={13} />
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
            ["#models", "模型与价格"],
            ["#recharge", "充值方式"],
            ["#how", "使用指南"],
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
            <p>Claude 模型中转，一站开始对话。</p>
            <div className="gateway-actions">
              <a className="button dark" href={heroChatUrl}>
                开始使用 <ArrowRight size={17} />
              </a>
              <a className="button" href="#models">
                探索模型
              </a>
            </div>
            <ul className="gateway-facts">
              <li>
                <MessageSquare size={17} />
                网页直聊
              </li>
              <li>
                <RefreshCw size={17} />
                多模型切换
              </li>
              <li>
                <Wallet size={17} />
                人民币计费
              </li>
            </ul>
          </div>
          <div className="gateway-features">
            <article className="gateway-feature">
              <h2>
                <MessageSquare size={17} />
                一个账户，连接 Claude
              </h2>
              <div className="gateway-account">
                <MessageSquare size={21} />
                <span>云上克劳德</span>
              </div>
              <div className="gateway-route">
                <span>你的问题</span>
                <ArrowRight size={15} />
                <img src="/claude-assets/spark.svg" alt="" />
                <span>Claude</span>
                <ArrowRight size={15} />
                <span>你的答案</span>
              </div>
              <a href={config.user ? "/billing" : "/register"}>
                管理我的账户 <ArrowRight size={13} />
              </a>
            </article>
            <article className="gateway-feature">
              <h2>
                <RefreshCw size={17} />
                选择模型，即刻开始
              </h2>
              <div
                className="feature-models"
                role="group"
                aria-label="选择模型"
              >
                {config.models.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={m.id === heroModel?.id}
                    onClick={() => setHeroModelId(m.id)}
                  >
                    {m.name.replace(/^Claude\s*/i, "").replace(/\s+\d.*$/, "")}
                  </button>
                ))}
              </div>
              <p
                key={heroModel?.id}
                className="gateway-model-name"
                aria-live="polite"
              >
                {heroModel?.name || "选择适合你的模型"}
              </p>
              <a href={heroChatUrl}>
                开始对话 <ArrowRight size={13} />
              </a>
            </article>
            <article className="gateway-feature">
              <h2>
                <Wallet size={17} />
                按需使用，每笔清晰
              </h2>
              {heroModel ? (
                <div
                  key={heroModel.id}
                  className="gateway-price"
                  aria-live="polite"
                >
                  <div>
                    <span>输入 / 百万 tokens</span>
                    <strong>¥{heroModel.input_rate}</strong>
                  </div>
                  <div>
                    <span>输出 / 百万 tokens</span>
                    <strong>¥{heroModel.output_rate}</strong>
                  </div>
                </div>
              ) : (
                <p className="gateway-model-name">在账户中查看模型费率</p>
              )}
              <a href="/billing">
                充值与用量 <ArrowRight size={13} />
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
        <TrustSection />
        <ModelCarousel config={config} />
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
              登录 / 注册 <ArrowUpRight size={13} />
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
                    <strong>¥50</strong>
                  </div>
                  <div className="wish-budget-bar">
                    <span />
                  </div>
                  <div>
                    <span>接近预算时提醒</span>
                    <span className="wish-switch" />
                  </div>
                  <div>
                    <span>余额不足提醒</span>
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
                      ? "/chat?model=" + encodeURIComponent(configured.id)
                      : model.url
                  }
                  {...(!configured
                    ? { target: "_blank", rel: "noreferrer" }
                    : {})}
                >
                  {configured ? "开始对话" : "官方资料"}
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
              <div className="code-demo-answer"><img src="/claude-assets/spark.svg" alt="" /><p>我先看看页面结构，再精简布局和文案。</p></div>
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
            <div className="trust-facts"><p>对话自动保存，请求超时保护。</p><p>异常或中断时，释放预留额度。</p><p>调用状态与费用，随时可查。</p></div>
            <a href="/billing#usage">调用记录 <ArrowUpRight size={16} /></a>
          </div>
        </article>
        <article className="trust-story">
          <img className="trust-art" src="/images/cards/security.jpg" alt="" loading="lazy" width="768" height="512" />
          <div className="trust-copy">
            <h3>安全</h3>
            <div className="trust-facts"><p>账户与会话按用户鉴权。</p><p>密码加盐哈希，模型密钥加密。</p><p>相关对话由所选模型服务商处理。</p></div>
            <a href="/privacy">隐私说明 <ArrowUpRight size={16} /></a>
          </div>
        </article>
      </div>
      <div className="trust-access">
        <div id="how" className="trust-guide">
          <h3>使用指南</h3>
          <nav aria-label="开始使用的步骤"><a href="/login">注册登录 <ArrowUpRight size={14} /></a><span aria-hidden="true">→</span><a href="/billing">充值 <ArrowUpRight size={14} /></a><span aria-hidden="true">→</span><a href="/chat">开始聊天 <ArrowUpRight size={14} /></a></nav>
        </div>
        <div id="recharge" className="trust-billing">
          <h3>充值与账单</h3>
          <p>兑换码、支付宝与微信支付，以账户页开放方式为准。</p>
          <a href="/billing">前往充值 <ArrowUpRight size={14} /></a>
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
              "kelaodeyun 是独立的 AI 模型中转站。你在网页中发送消息，本站将相关对话上下文转交给所选模型服务商，并展示回复、记录用量。",
            ],
            [
              "和 Claude、Anthropic 是什么关系？",
              "本站是独立服务，不是 Anthropic 或其他模型服务商的官方网站。模型是否可用，以本站模型列表为准。",
            ],
            [
              "现在能使用真实模型吗？",
              config.demo
                ? "当前是演示环境，聊天为固定回复，充值使用测试余额，尚未调用真实模型。"
                : config.models.length
                  ? "可以登录后选择列表中已开放的模型。余额不足时，需要先充值。"
                  : "真实模型尚未开放。上方会在模型开放后展示名称与价格。",
            ],
            [
              "费用如何计算？",
              "输入和输出分别按模型费率与实际返回的 token 用量计费。例如，1,000 个输入 token 的费用为输入费率 × 1,000 ÷ 1,000,000。最终结算和用量明细可在账户页查看。",
            ],
            [
              "对话会保存吗？",
              "登录后的对话保存在本站服务器，并按账户隔离。你可以从侧栏继续或删除历史对话。消息和相关上下文会发送给所选模型服务商处理。",
            ],
            [
              "支持开发者 API 调用吗？",
              "当前提供网页聊天服务。面向开发者的 API Key 和 API 调用入口尚未开放。",
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
      <section className="relay-bottom-cta" aria-label="开始使用">
        <h2>少操作，多创造。</h2>
        <p>从一次对话，到你的下一个作品。</p>
        <div>
          <a className="button dark" href="/chat">
            开始对话 <ArrowRight size={17} />
          </a>
          <a className="button" href="/code">
            打开 Code 工作台 <ArrowUpRight size={17} />
          </a>
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
        ["常见问题", "#questions"],
      ],
    ],
    [
      "模型与价格",
      [
        ["查看模型", "#models"],
        ["费用如何计算", "#questions"],
      ],
    ],
    [
      "网页聊天",
      [
        ["开始新对话", "/chat"],
        ["历史对话", "/chat"],
      ],
    ],
    [
      "充值与账单",
      [
        ["账户充值", "/billing"],
        ["用量明细", "/billing#usage"],
      ],
    ],
    [
      "使用指南",
      [
        ["开始使用", "#how"],
        ["充值方式", "#recharge"],
      ],
    ],
    [
      "账户管理",
      [
        ["登录账户", "/login"],
        ["账户与余额", "/billing"],
      ],
    ],
    [
      "帮助与支持",
      [
        ["常见问题", "#questions"],
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
            KELAODEYUN
          </a>
          <div className="anthropic-footer-meta">
            <p>© 2026 {config.operator || "kelaodeyun"}</p>
            <div className="anthropic-footer-shortcuts">
              <a href="/chat" aria-label="开始聊天" title="开始聊天">
                <MessageSquare size={18} />
              </a>
              <a href="/billing" aria-label="账户与充值" title="账户与充值">
                <Wallet size={18} />
              </a>
              <a href="#questions" aria-label="常见问题" title="常见问题">
                <Search size={18} />
              </a>
            </div>
            {config.icp && (
              <a
                href="https://beian.miit.gov.cn/"
                target="_blank"
                rel="noreferrer"
              >
                {config.icp}
              </a>
            )}
            {config.securityFiling && <span>{config.securityFiling}</span>}
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
            <p>独立 AI 中转站，提供网页对话与账户服务。</p>
          </section>
          <section>
            <h2>登录</h2>
            <a href="/chat">
              网页聊天 <ArrowUpRight size={12} />
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
function Auth({ config, refresh }) {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const setup = config.setup;
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        setup ? "/setup" : register ? "/register" : "/login",
        Object.fromEntries(new FormData(e.target)),
      );
      await refresh();
      window.location.href =
        location.pathname === "/code"
          ? "/code"
          : "/chat" + window.location.search;
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <Brand />
      <div className="auth-layout">
        <div className="auth-art">
          <Art kind={0} />
          <h1>
            好想法，
            <br />
            从这里开始。
          </h1>
          <p>把问题带来，把思路打开。</p>
        </div>
        <form onSubmit={submit} className="auth-form">
          <p className="eyebrow">YOUR SPACE TO THINK</p>
          <h2>
            {setup ? "创建站点管理员" : register ? "创建你的账户" : "欢迎回来"}
          </h2>
          <p>
            {setup
              ? "首次使用，设置管理员账号后即可配置站点。"
              : register
                ? "保存对话，随时继续。"
                : "登录后，继续你的对话。"}
          </p>
          {(register || setup) && (
            <label>
              昵称
              <input
                name="name"
                required
                maxLength={40}
                autoComplete="nickname"
                placeholder="如何称呼你"
              />
            </label>
          )}
          <label>
            邮箱
            <input
              name="email"
              type="email"
              required
              maxLength={180}
              autoComplete="username"
              placeholder="you@example.com"
            />
          </label>
          <label>
            密码
            <input
              name="password"
              type="password"
              minLength={register || setup ? 10 : 1}
              maxLength={200}
              required
              autoComplete={
                register || setup ? "new-password" : "current-password"
              }
              placeholder={register || setup ? "至少 10 位" : "输入你的密码"}
            />
          </label>
          {setup && config.setupRequiresToken && (
            <label>
              初始化口令
              <input name="setupToken" type="password" autoComplete="off" />
            </label>
          )}
          {setup && !config.setupRequiresToken && (
            <p className="setup-note">
              本地开发模式，无需初始化口令。直接设置管理员账号即可。
            </p>
          )}
          {(register || setup) && (
            <label className="consent">
              <input name="accepted" type="checkbox" required />
              我已阅读并同意{" "}
              <a href="/terms" target="_blank">
                服务说明
              </a>{" "}
              和{" "}
              <a href="/privacy" target="_blank">
                隐私说明
              </a>
            </label>
          )}
          <Notice>{error}</Notice>
          <button className="button dark" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={16} /> : null}
            {setup ? "创建管理员" : register ? "创建账户" : "登录"}
            <ArrowRight size={16} />
          </button>
          {!setup && config.registration && (
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setRegister(!register);
                setError("");
              }}
            >
              {register ? "已有账户？登录" : "还没有账户？创建账户"}
            </button>
          )}
          <small>本站为独立服务。密码不会发送给模型服务商。</small>
        </form>
      </div>
      <a className="back-home" href="/">
        返回首页 <ArrowUpRight size={14} />
      </a>
    </main>
  );
}
function Workspace({ config, refresh, children, active }) {
  return (
    <div className="account-shell">
      <header>
        <Brand />
        <nav>
          <a href="/chat">
            <MessageSquare size={16} />
            对话
          </a>
          <a className={active === "billing" ? "active" : ""} href="/billing">
            <Wallet size={16} />
            账户与用量
          </a>
          {config.user.role === "admin" && (
            <a className={active === "admin" ? "active" : ""} href="/admin">
              <Settings size={16} />
              管理后台
            </a>
          )}
        </nav>
        <button
          className="user-button"
          onClick={async () => {
            await api("/logout", {});
            await refresh();
            window.location.href = "/";
          }}
        >
          {config.user.name}
          <LogOut size={16} />
        </button>
      </header>
      {children}
    </div>
  );
}
function Field({ label, ...props }) {
  return (
    <label>
      {label}
      <input {...props} />
    </label>
  );
}
function Billing({ config, refresh }) {
  const [data, setData] = useState(null),
    [notice, setNotice] = useState(""),
    [amount, setAmount] = useState(5000),
    [pay, setPay] = useState(null),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("usage");
  const load = () =>
    api("/billing")
      .then(setData)
      .catch((e) => setNotice(e.message));
  useEffect(() => {
    load();
  }, []);
  async function redeem(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/redeem", { code: new FormData(e.target).get("code") });
      e.target.reset();
      setNotice("兑换成功，余额已到账。");
      await load();
      await refresh();
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function order(provider) {
    setBusy(true);
    setNotice("");
    try {
      setPay(
        await api("/orders", { provider, amount, mobile: innerWidth < 600 }),
      );
      load();
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function query(id) {
    setBusy(true);
    try {
      const d = await api("/orders/" + id);
      setNotice(
        d.status === "paid"
          ? "充值成功，余额已到账。"
          : "订单尚未支付成功，请稍后刷新。",
      );
      if (d.status === "paid") setPay(null);
      await load();
      await refresh();
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Workspace config={config} refresh={refresh} active="billing">
      <main className="dashboard">
        <div className="page-heading">
          <div>
            <p className="eyebrow">YOUR ACCOUNT</p>
            <h1>让每一次使用，都清清楚楚。</h1>
          </div>
          <span className="subtle-pill">人民币 · 北京时间</span>
        </div>
        <Notice>{notice}</Notice>
        <section className="wallet-grid">
          <div className="balance-card">
            <Wallet size={23} />
            <p>可用余额</p>
            <strong>{money(data?.balance)}</strong>
            <small>按模型实际返回的 token 用量结算</small>
            <a href="#usage">
              查看使用记录 <ArrowUpRight size={15} />
            </a>
          </div>
          <div className="recharge-card">
            <h2>为下一次灵感充值</h2>
            <div className="amounts">
              {[1000, 5000, 10000, 20000].map((n) => (
                <button
                  key={n}
                  className={amount === n ? "selected" : ""}
                  onClick={() => setAmount(n)}
                >
                  ¥ {n / 100}
                </button>
              ))}
            </div>
            <div className="payment-options">
              {config.payments.map((p) => (
                <button
                  disabled={busy || !p.enabled}
                  key={p.id}
                  onClick={() => order(p.id)}
                >
                  <span className={"payment-logo " + p.id}>
                    {p.id === "alipay" ? "支" : "微"}
                  </span>
                  <span>
                    {p.name}
                    <small>
                      {p.enabled
                        ? config.demo
                          ? "模拟收银台"
                          : "前往支付"
                        : "尚未开通"}
                    </small>
                  </span>
                  <ArrowUpRight size={16} />
                </button>
              ))}
            </div>
            <form className="redeem" onSubmit={redeem}>
              <label htmlFor="redeem-code">有兑换码？</label>
              <div>
                <input
                  id="redeem-code"
                  name="code"
                  placeholder="输入兑换码"
                  required
                  maxLength={100}
                />
                <button className="button" disabled={busy}>
                  兑换
                </button>
              </div>
            </form>
          </div>
        </section>
        <section className="data-section" id="usage">
          <div className="tabs">
            <button
              className={tab === "usage" ? "active" : ""}
              onClick={() => setTab("usage")}
            >
              用量明细
            </button>
            <button
              className={tab === "orders" ? "active" : ""}
              onClick={() => setTab("orders")}
            >
              充值订单
            </button>
            <button
              className={tab === "ledger" ? "active" : ""}
              onClick={() => setTab("ledger")}
            >
              余额记录
            </button>
          </div>
          {tab === "usage" ? (
            <Table
              headers={["时间", "模型", "输入 / 输出 token", "费用", "状态"]}
              rows={(data?.usage || []).map((u) => [
                date(u.created),
                u.model,
                `${u.input_tokens} / ${u.output_tokens}`,
                money(u.cost, 4),
                statusLabel[u.status] || u.status,
              ])}
              empty="还没有使用记录。开始一段对话后，用量会显示在这里。"
            />
          ) : tab === "orders" ? (
            <Table
              headers={["时间", "订单号", "方式", "金额", "状态", "操作"]}
              rows={(data?.orders || []).map((o) => [
                date(o.created),
                o.id.slice(0, 12) + "…",
                o.provider === "alipay" ? "支付宝" : "微信支付",
                `¥ ${(o.amount / 100).toFixed(2)}`,
                statusLabel[o.status],
                o.status === "pending" ? (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => query(o.id)}
                  >
                    查询支付结果
                  </button>
                ) : (
                  "—"
                ),
              ])}
              empty="暂无充值订单"
            />
          ) : (
            <Table
              headers={["时间", "类型", "金额", "说明"]}
              rows={(data?.ledger || []).map((l) => [
                date(l.created),
                {
                  voucher: "兑换码",
                  admin: "管理员充值",
                  payment: "在线充值",
                  release: "额度退回",
                }[l.kind] || l.kind,
                money(l.amount),
                l.note,
              ])}
              empty="暂无余额变动"
            />
          )}
        </section>
        <section className="model-rates">
          <h2>当前模型费率</h2>
          <Table
            headers={["模型", "输入 / 百万 token", "输出 / 百万 token"]}
            rows={config.models.map((m) => [
              m.name,
              `¥ ${m.input_rate}`,
              `¥ ${m.output_rate}`,
            ])}
            empty="管理员尚未开放模型。"
          />
        </section>
        <details className="password-settings">
          <summary>
            <KeyRound size={16} />
            修改密码
          </summary>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api(
                  "/password",
                  Object.fromEntries(new FormData(e.target)),
                );
                e.target.reset();
                setNotice("密码已更新，其他登录会话已退出。");
              } catch (e) {
                setNotice(e.message);
              }
            }}
          >
            <Field
              label="原密码"
              name="current"
              type="password"
              autoComplete="current-password"
              required
            />
            <Field
              label="新密码"
              name="password"
              type="password"
              minLength={10}
              maxLength={200}
              autoComplete="new-password"
              required
            />
            <button className="button">更新密码</button>
          </form>
        </details>
      </main>
      {pay && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="pay-title"
            className="payment-modal"
          >
            <IconButton label="关闭支付窗口" onClick={() => setPay(null)}>
              <X size={18} />
            </IconButton>
            <h2 id="pay-title">
              {pay.provider === "alipay" ? "支付宝支付" : "微信扫码支付"}
            </h2>
            {pay.demo && (
              <span className="demo-label">模拟订单 · 不会真实扣款</span>
            )}
            <strong>¥ {(pay.amount / 100).toFixed(2)}</strong>
            {pay.qr && (
              <img src={pay.qr} width="240" height="240" alt="微信支付二维码" />
            )}
            {pay.url && (
              <a
                className="button dark"
                href={pay.url}
                target="_blank"
                rel="noreferrer"
              >
                打开支付宝收银台 <ArrowUpRight size={16} />
              </a>
            )}
            <p>
              {pay.demo
                ? "点击下方按钮模拟支付成功，体验订单入账。此演示不会连接真实支付平台。"
                : "支付完成后，点击下方查询到账结果。"}
            </p>
            <button
              disabled={busy}
              className="button"
              onClick={() => query(pay.id)}
            >
              <RefreshCw size={15} />
              {pay.demo ? "模拟付款成功（不扣款）" : "查询支付结果"}
            </button>
          </section>
        </div>
      )}
    </Workspace>
  );
}
function Table({ headers, rows, empty = "暂无记录" }) {
  return rows.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (
                <td key={j}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty>{empty}</Empty>
  );
}
function Admin({ config, refresh }) {
  const [data, setData] = useState(null),
    [tab, setTab] = useState("overview"),
    [notice, setNotice] = useState(""),
    [voucher, setVoucher] = useState(""),
    [channel, setChannel] = useState(null),
    [discoveredModels, setDiscoveredModels] = useState({}),
    [model, setModel] = useState(null),
    [busy, setBusy] = useState(false);
  const load = () =>
    api("/admin/overview")
      .then(setData)
      .catch((e) => setNotice(e.message));
  useEffect(() => {
    load();
  }, []);
  async function save(path, body) {
    setBusy(true);
    setNotice("");
    try {
      const result = await api("/admin/" + path, body);
      await load();
      await refresh();
      setNotice("已保存。");
      return result;
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function discoverModels(c) {
    setBusy(true);
    setNotice("");
    try {
      const result = await api(`/admin/channels/${c.id}/models`, {});
      setDiscoveredModels((previous) => ({
        ...previous,
        [c.id]: result.models,
      }));
      setNotice(
        `已连接「${c.name}」，读取到 ${result.models.length} 个模型${result.hasMore ? "（前 100 项）" : ""}。添加模型时可从上游模型 ID 的建议中选择。`,
      );
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <Workspace config={config} refresh={refresh} active="admin">
        <main className="dashboard">
          <Notice>{notice || "正在加载管理后台…"}</Notice>
        </main>
      </Workspace>
    );
  const nav = [
    ["overview", "概览"],
    ["users", "用户与余额"],
    ["channels", "模型渠道"],
    ["vouchers", "兑换码"],
    ["orders", "支付订单"],
    ["logs", "用量与日志"],
  ];
  return (
    <Workspace config={config} refresh={refresh} active="admin">
      <main className="dashboard admin">
        <div className="page-heading">
          <div>
            <p className="eyebrow">WORKSPACE ADMINISTRATION</p>
            <h1>管理你的 kelaodeyun。</h1>
          </div>
          <span className="subtle-pill">管理员</span>
        </div>
        <nav className="tabs admin-tabs">
          {nav.map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => {
                setTab(key);
                setNotice("");
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        <Notice>{notice}</Notice>
        {tab === "overview" && (
          <>
            <div className="stat-grid">
              {[
                ["账户", data.users.length],
                ["开放模型", config.models.length],
                [
                  "已到账订单",
                  data.orders.filter((o) => o.status === "paid").length,
                ],
                ["近期调用", data.usage.length],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <div className="admin-intro">
              <div>
                <p className="eyebrow">开始提供服务</p>
                <h2>准备好，再开放。</h2>
                <p>
                  添加上游渠道、设置模型与费率，给用户充值后，即可开始对话。
                </p>
                <button
                  className="button dark"
                  onClick={() => setTab("channels")}
                >
                  配置模型渠道 <ArrowUpRight size={16} />
                </button>
              </div>
              <ul>
                <li>
                  <Check size={17} />
                  账号和会话服务已就绪
                </li>
                <li>
                  {config.models.length ? (
                    <Check size={17} />
                  ) : (
                    <span className="status-dot" />
                  )}
                  模型服务{config.models.length ? "已配置" : "待配置"}
                </li>
                {data.payments.map((p) => (
                  <li key={p.id}>
                    {p.enabled ? (
                      <Check size={17} />
                    ) : (
                      <span className="status-dot" />
                    )}
                    {p.name}
                    {p.enabled
                      ? config.demo
                        ? "模拟模式（未接商户）"
                        : "已配置，需完成商户验收"
                      : "待配置商户"}
                  </li>
                ))}
              </ul>
            </div>
            <p className="muted">
              概览展示最近 200 个用户、100
              条订单及调用。完整记录保存在数据库中。
            </p>
          </>
        )}
        {tab === "users" && (
          <>
            <Table
              headers={["用户", "邮箱", "身份", "余额", "状态", "操作"]}
              rows={data.users.map((u) => [
                u.name,
                u.email,
                u.role === "admin" ? "管理员" : "用户",
                money(u.balance),
                u.disabled ? "已禁用" : "正常",
                u.role === "admin" ? (
                  "—"
                ) : (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      save("users", { id: u.id, disabled: !u.disabled })
                    }
                  >
                    {u.disabled ? "启用" : "禁用"}
                  </button>
                ),
              ])}
            />
            <form
              className="admin-form inline-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = Object.fromEntries(new FormData(e.target));
                if (
                  await save("credit", {
                    ...f,
                    amount: Math.round(Number(f.amount) * 1e6),
                  })
                )
                  e.target.reset();
              }}
            >
              <h2>管理员充值</h2>
              <label>
                账户
                <select name="user_id" required>
                  {data.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} · {u.email}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                label="金额（元）"
                name="amount"
                type="number"
                min="0.01"
                max="10000"
                step="0.01"
                required
              />
              <Field
                label="充值备注"
                name="note"
                maxLength={100}
                required
                placeholder="填写充值原因"
              />
              <button disabled={busy} className="button dark">
                确认充值
              </button>
            </form>
          </>
        )}
        {tab === "channels" && (
          <>
            <h2>上游渠道</h2>
            <p className="muted">
              通过 Anthropic 官方 SDK 连接 Claude 或兼容 Messages
              协议的授权接口。密钥仅保存在服务端。
            </p>
            <Table
              headers={["渠道", "地址", "状态", "操作"]}
              rows={data.channels.map((c) => [
                c.name,
                c.base_url,
                c.enabled ? "已启用" : "已停用",
                <div className="form-actions">
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => setChannel(c)}
                  >
                    编辑
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => discoverModels(c)}
                  >
                    读取模型
                  </button>
                </div>,
              ])}
              empty="还没有渠道，先添加一个上游接口。"
            />
            <form
              className="admin-form form-grid"
              key={channel?.id || "new-channel"}
              onSubmit={async (e) => {
                e.preventDefault();
                const f = Object.fromEntries(new FormData(e.target));
                if (
                  await save("channels", {
                    ...f,
                    id: channel?.id,
                    enabled: f.enabled === "true",
                  })
                ) {
                  setChannel(null);
                  e.target.reset();
                }
              }}
            >
              <h3>{channel ? "编辑渠道" : "添加渠道"}</h3>
              <Field
                label="渠道名称"
                name="name"
                defaultValue={channel?.name}
                required
                maxLength={60}
              />
              <Field
                label="接口根地址"
                name="base_url"
                type="url"
                defaultValue={channel?.base_url || "https://api.anthropic.com"}
                required
              />
              <Field
                label={channel ? "密钥（留空保留原值）" : "上游 API 密钥"}
                name="api_key"
                type="password"
                autoComplete="off"
                required={!channel}
              />
              <label>
                状态
                <select
                  name="enabled"
                  defaultValue={channel?.enabled === 0 ? "false" : "true"}
                >
                  <option value="true">启用</option>
                  <option value="false">停用</option>
                </select>
              </label>
              <div className="form-actions">
                <button className="button dark" disabled={busy}>
                  保存渠道
                </button>
                {channel && (
                  <button
                    type="button"
                    className="button"
                    onClick={() => setChannel(null)}
                  >
                    取消编辑
                  </button>
                )}
              </div>
            </form>
            <h2>模型与计费</h2>
            <Table
              headers={[
                "显示名称",
                "上游模型 ID",
                "输入 / 输出（元 / 百万 token）",
                "状态",
                "操作",
              ]}
              rows={data.models.map((m) => [
                m.name,
                m.upstream_id,
                `${m.input_rate} / ${m.output_rate}`,
                m.enabled ? "已启用" : "已停用",
                <button className="text-button" onClick={() => setModel(m)}>
                  编辑
                </button>,
              ])}
              empty="尚未添加模型。请使用上游实际支持的模型 ID。"
            />
            <form
              className="admin-form form-grid"
              key={model?.id || "new-model"}
              onSubmit={async (e) => {
                e.preventDefault();
                const f = Object.fromEntries(new FormData(e.target));
                if (
                  await save("models", {
                    ...f,
                    id: model?.id,
                    input_rate: Number(f.input_rate),
                    output_rate: Number(f.output_rate),
                    max_output: Number(f.max_output),
                    enabled: f.enabled === "true",
                  })
                ) {
                  setModel(null);
                  e.target.reset();
                }
              }}
            >
              <h3>{model ? "编辑模型" : "添加模型"}</h3>
              <Field
                label="显示名称"
                name="name"
                required
                maxLength={60}
                defaultValue={model?.name}
              />
              <Field
                label="上游模型 ID"
                name="upstream_id"
                list="available-upstream-models"
                required
                maxLength={150}
                defaultValue={model?.upstream_id}
              />
              <datalist id="available-upstream-models">
                {data.channels.flatMap((c) =>
                  (discoveredModels[c.id] || []).map((m) => (
                    <option key={`${c.id}:${m.id}`} value={m.id}>
                      {c.name} · {m.name}
                    </option>
                  )),
                )}
              </datalist>
              <label>
                所属渠道
                <select
                  name="channel_id"
                  required
                  defaultValue={model?.channel_id || ""}
                >
                  <option value="" disabled>
                    选择渠道
                  </option>
                  {data.channels.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                状态
                <select
                  name="enabled"
                  defaultValue={model?.enabled === 0 ? "false" : "true"}
                >
                  <option value="true">启用</option>
                  <option value="false">停用</option>
                </select>
              </label>
              <Field
                label="输入费率（元 / 百万 token）"
                name="input_rate"
                type="number"
                required
                step="0.01"
                min="0"
                max="10000"
                defaultValue={model?.input_rate}
              />
              <Field
                label="输出费率（元 / 百万 token）"
                name="output_rate"
                type="number"
                required
                step="0.01"
                min="0"
                max="10000"
                defaultValue={model?.output_rate}
              />
              <Field
                label="单次最大输出 token"
                name="max_output"
                type="number"
                required
                min="128"
                max="16384"
                defaultValue={model?.max_output || 2048}
              />
              <div className="form-actions">
                <button
                  className="button dark"
                  disabled={busy || !data.channels.length}
                >
                  保存模型
                </button>
                {model && (
                  <button
                    className="button"
                    type="button"
                    onClick={() => setModel(null)}
                  >
                    取消编辑
                  </button>
                )}
              </div>
            </form>
          </>
        )}
        {tab === "vouchers" && (
          <>
            <form
              className="admin-form inline-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const d = await save("vouchers", {
                  amount: Math.round(
                    Number(new FormData(e.target).get("amount")) * 1e6,
                  ),
                });
                if (d) setVoucher(d.code);
              }}
            >
              <h2>生成单次兑换码</h2>
              <Field
                label="兑换金额（元）"
                type="number"
                name="amount"
                min="0.01"
                max="1000"
                step="0.01"
                required
              />
              <button disabled={busy} className="button dark">
                生成兑换码
              </button>
            </form>
            {voucher && (
              <div className="voucher-result">
                <p>兑换码只展示这一次，请妥善保存。</p>
                <code>{voucher}</code>
                <button
                  className="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(voucher);
                      setNotice("兑换码已复制");
                    } catch {
                      setNotice("请手动复制兑换码");
                    }
                  }}
                >
                  <Copy size={15} />
                  复制
                </button>
              </div>
            )}
            <Table
              headers={["生成时间", "尾号", "金额", "状态"]}
              rows={data.vouchers.map((v) => [
                date(v.created),
                v.label,
                money(v.amount),
                v.used_by ? "已兑换" : "未使用",
              ])}
            />
          </>
        )}
        {tab === "orders" && (
          <>
            <h2>在线支付</h2>
            <div className="payment-status">
              {data.payments.map((p) => (
                <div key={p.id}>
                  <strong>{p.name}</strong>
                  <span>
                    {p.enabled
                      ? config.demo
                        ? "模拟模式（未接商户）"
                        : "已配置"
                      : "待接入商户"}
                  </span>
                </div>
              ))}
            </div>
            <p className="muted">
              只有经服务端验签、金额及商户校验通过的成功订单才会入账。商户凭据通过服务端环境变量配置。
            </p>
            <Table
              headers={["时间", "订单号", "用户", "方式", "金额", "状态"]}
              rows={data.orders.map((o) => [
                date(o.created),
                o.id,
                data.users.find((u) => u.id === o.user_id)?.email || o.user_id,
                o.provider === "alipay" ? "支付宝" : "微信支付",
                `¥ ${o.amount / 100}`,
                statusLabel[o.status],
              ])}
            />
          </>
        )}
        {tab === "logs" && (
          <>
            <h2>近期调用</h2>
            <Table
              headers={[
                "时间",
                "用户",
                "模型",
                "输入 / 输出 token",
                "费用",
                "状态",
              ]}
              rows={data.usage.map((u) => [
                date(u.created),
                data.users.find((x) => x.id === u.user_id)?.email || u.user_id,
                u.model,
                `${u.input_tokens} / ${u.output_tokens}`,
                money(u.cost, 4),
                statusLabel[u.status],
              ])}
            />
            <h2>管理操作日志</h2>
            <Table
              headers={["时间", "管理员", "操作", "详情"]}
              rows={data.audit.map((a) => [
                date(a.created),
                data.users.find((u) => u.id === a.actor)?.name || a.actor,
                a.action,
                a.detail,
              ])}
            />
          </>
        )}
      </main>
    </Workspace>
  );
}
function UpstreamUI({ section }) {
  const target = section ? "/claude-chat/index.html" : "/claude-ui/index.html";
  useEffect(() => { location.replace(target); }, [target]);
  return <a href={target}>打开 Open Claude UI</a>;
}
export function App() {
  const path = location.pathname;
  if (path === "/chat" || path === "/code" || path === "/claude-ui")
    return <UpstreamUI section={path === "/chat" ? "chat" : path === "/code" ? "v2-lab" : ""} />;
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
      <DemoNotice config={config} />
      <AppRoute config={config} refresh={refresh} />
    </>
  );
}
function DemoNotice({ config }) {
  const show =
    config.demo &&
    location.pathname !== "/" &&
    !(["/chat", "/code"].includes(location.pathname) && config.user);
  useEffect(() => {
    document.body.classList.toggle("demo-mode", !!show);
    return () => document.body.classList.remove("demo-mode");
  }, [show]);
  return show ? (
    <div className="demo-banner">
      演示环境 · 模型为固定回复，充值为测试余额，不会真实扣款
    </div>
  ) : null;
}
function AppRoute({ config, refresh }) {
  const path = location.pathname;
  if (path === "/privacy" || path === "/terms")
    return <Policy config={config} terms={path === "/terms"} />;
  if (path === "/") return <Home config={config} />;
  if (!config.user || path === "/login")
    return <Auth config={config} refresh={refresh} />;
  if (path === "/billing") return <Billing config={config} refresh={refresh} />;
  if (path === "/admin")
    return config.user.role === "admin" ? (
      <Admin config={config} refresh={refresh} />
    ) : (
      <div className="loading-page">
        <Notice>需要管理员权限</Notice>
        <a href="/chat">返回对话</a>
      </div>
    );
  return (
    <div className="loading-page">
      <Brand />
      <h1>这个页面暂时不存在</h1>
      <a href="/">返回首页</a>
    </div>
  );
}
function Policy({ config, terms }) {
  return (
    <main className="policy-page">
      <Brand />
      <p className="eyebrow">KELAODEYUN / {terms ? "SERVICE" : "PRIVACY"}</p>
      <h1>{terms ? "服务说明" : "隐私说明"}</h1>
      <Notice>
        当前为本地预览说明。正式运营信息、服务条款与隐私政策需在公开上线前补充确认。
      </Notice>
      {terms ? (
        <>
          <h2>服务与使用</h2>
          <p>
            kelaodeyun
            提供网页模型对话服务，是独立站点。模型能力与可用性取决于管理员配置的服务商。请核实
            AI 回答中的重要信息，勿将其作为专业决策的唯一依据。
          </p>
          <h2>计费与充值</h2>
          <p>
            费率以发送时所选模型的费率为准，金额使用人民币。每次请求会按上下文大小和输出上限预留额度，结束时根据服务商已报告的
            token
            用量结算并释放剩余额度。服务中断时，未收到计量信息的部分不向用户补估收费。
          </p>
          <p>
            兑换码、管理员充值及经支付服务确认的在线充值进入账户余额。在线支付只有在商户开通后才可使用。当前版本未开放自动退款；正式上线前需确认退款规则、联系方式与支付商户约定。
          </p>
          <h2>账户与服务管理</h2>
          <p>
            请妥善保管账号。管理员可停用账户、调整后续请求的模型费率，并记录相关管理操作。密码修改后，其他已登录会话会失效。
          </p>
        </>
      ) : (
        <>
          <h2>我们保存什么</h2>
          <p>
            本站保存邮箱、昵称、密码的加盐哈希、会话内容、模型用量、余额流水和支付订单。支付密码与完整银行卡信息不经过本站。登录凭证通过
            HttpOnly Cookie 保存。
          </p>
          <h2>信息如何使用</h2>
          <p>
            邮箱用于识别账户，当前未接入邮件通知或邮箱验证。发送消息时，当前会话中的相关内容会转发给所选模型渠道。渠道密钥加密保存在服务端，不发送给浏览器。支付订单金额和订单号会传给对应的支付商户接口。
          </p>
          <h2>保存与删除</h2>
          <p>
            聊天侧栏支持删除会话，删除后会从本站活动数据库中移除。账单、用量和管理日志保留用于查询与核对。当前版本尚未开放自助注销账户、自动保留期限或备份清理；请在正式运营前确定并告知用户相关规则。
          </p>
        </>
      )}
      <h2>运营与联系</h2>
      <p>
        {config.operator || "运营主体待配置。"}{" "}
        {config.supportEmail ? (
          <>
            联系邮箱：
            <a href={"mailto:" + config.supportEmail}>{config.supportEmail}</a>
          </>
        ) : (
          "联系邮箱待配置。"
        )}
      </p>
      <a className="button" href="/">
        返回首页 <ArrowUpRight size={15} />
      </a>
    </main>
  );
}
