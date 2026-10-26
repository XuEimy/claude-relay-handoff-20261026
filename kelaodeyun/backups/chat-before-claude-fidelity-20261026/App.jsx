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
    [paused, setPaused] = useState(false);
  const ideas = [
    {
      label: "写作与表达",
      title: "让想法，找到合适的语言。",
      desc: "从一个提纲到一篇完整文章，梳理结构，推敲措辞，把想说的话说清楚。",
      prompt: "我想写一篇文章，请先帮我梳理思路和提纲。",
      art: 0,
    },
    {
      label: "学习与思考",
      title: "把复杂的问题，慢慢讲明白。",
      desc: "拆解难懂的概念，比较不同的观点，在一问一答之间建立自己的理解。",
      prompt: "我想学习一个新概念，请用循序渐进的方式引导我。",
      art: 1,
    },
    {
      label: "代码与创造",
      title: "从一个念头，到一次实现。",
      desc: "讨论方案、理解代码、寻找问题，让每一步探索都有一个可以商量的伙伴。",
      prompt: "我有一个应用想法，请帮我拆解实现步骤。",
      art: 3,
    },
  ];
  useEffect(() => {
    const esc = (e) => e.key === "Escape" && setMenu(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);
  return (
    <div className="site">
      <a className="skip-link" href="#main">
        跳转到正文
      </a>
      <header className="site-header">
        <nav className="header-left">
          <a href="#possibilities">使用场景</a>
          <a href="#how">如何开始</a>
          <a href="#questions">常见问题</a>
        </nav>
        <Brand />
        <div className="header-right">
          <a className="pill" href={config.user ? "/billing" : "/login"}>
            {config.user ? "我的账户" : "登录"}
          </a>
          <a className="pill" href="/chat">
            开始对话 <ArrowUpRight size={13} />
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
          <a onClick={() => setMenu(false)} href="#possibilities">
            使用场景 <ArrowUpRight />
          </a>
          <a onClick={() => setMenu(false)} href="#how">
            如何开始 <ArrowUpRight />
          </a>
          <a onClick={() => setMenu(false)} href="#questions">
            常见问题 <ArrowUpRight />
          </a>
          <a href="/billing">
            账户与充值 <ArrowUpRight />
          </a>
        </nav>
      )}
      <main id="main">
        <h1 className="mission">
          <strong>让好奇心，多走一步。</strong> 与 AI
          一起思考、写作和创造。从一个问题开始，让每一个尚未成形的想法，都有继续生长的可能。
        </h1>
        <section
          className={"hero-stage " + (paused ? "paused" : "")}
          aria-label="与好想法对话"
        >
          <div className="collage" aria-hidden="true">
            {Array.from({ length: 12 }, (_, i) => (
              <div className={"tile tile-" + i} key={i}>
                <Art kind={i % 8} />
              </div>
            ))}
          </div>
          <div className="hero-copy">
            <p className="eyebrow">A SPACE FOR YOUR NEXT IDEA</p>
            <h2>
              与好想法
              <br />
              对话。
            </h2>
            <p>
              写下问题，展开思路。
              <br />
              你的下一步，或许就藏在一场对话里。
            </p>
            <a className="button dark" href="/chat">
              开启一段对话 <ArrowUpRight size={17} />
            </a>
            <span className="preview-note">
              {config.models.length
                ? "按实际使用量计费"
                : "本地预览 · 模型服务待接入"}
            </span>
          </div>
          <IconButton
            label={paused ? "播放装饰动画" : "暂停装饰动画"}
            onClick={() => setPaused(!paused)}
            className="motion-toggle"
          >
            {paused ? <Play size={14} /> : <Pause size={14} />}
          </IconButton>
        </section>
        <section className="possibilities content-width" id="possibilities">
          <div className="section-heading">
            <span>从这里，打开思路</span>
            <span>THINK. WRITE. BUILD.</span>
          </div>
          <div className="idea-grid">
            {ideas.map((idea, i) => (
              <article className="idea" key={idea.label}>
                <div className={"idea-art idea-art-" + i}>
                  <Art kind={idea.art} />
                </div>
                <p className="eyebrow">{idea.label}</p>
                <h3>{idea.title}</h3>
                <p>{idea.desc}</p>
                <a href={"/chat?prompt=" + encodeURIComponent(idea.prompt)}>
                  试着聊一聊 <ArrowUpRight size={17} />
                </a>
              </article>
            ))}
          </div>
        </section>
        <section id="how" className="how content-width">
          <div>
            <p className="eyebrow">简单开始，自然继续</p>
            <h2>
              留一点空间，
              <br />
              给新的可能。
            </h2>
          </div>
          <ol>
            <li>
              <span>01</span>
              <div>
                <h3>拥有你的对话空间</h3>
                <p>创建账户，保存和继续自己的会话。</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>选择模型，写下问题</h3>
                <p>查看模型与费率，选择适合当前任务的助手。</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>随时回来，接着聊</h3>
                <p>浏览历史对话，查询用量和余额，按需充值。</p>
              </div>
            </li>
          </ol>
        </section>
        <section id="questions" className="questions content-width">
          <h2>你可能想知道</h2>
          <div>
            {[
              [
                "这是 Anthropic 官方网站吗？",
                "不是。kelaodeyun 是独立的网页聊天服务；模型由站点配置的服务商提供。",
              ],
              [
                "如何计费和充值？",
                "模型启用后会展示输入、输出 token 费率。账户页提供用量明细、兑换码充值和在线支付入口。支付商户尚未配置时，在线支付不会开放。",
              ],
              [
                "对话会保存在哪里？",
                "登录后的对话保存在本站服务器，按账户隔离。你可以在聊天侧栏查看或删除。发送消息时，相关对话上下文会交给所选模型服务商处理。",
              ],
              [
                "现在可以使用真实模型吗？",
                config.models.length
                  ? "登录后选择已开放的模型即可开始。余额不足时，请先在账户页充值。"
                  : "当前是本地预览。账号、会话管理与余额功能可操作，真实模型需要管理员配置上游渠道后开放。",
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
      </main>
      <footer className="site-footer content-width">
        <Brand />
        <p>一个与好想法相遇的地方。</p>
        <div>
          <span>© 2026 kelaodeyun</span>
          <a href="/chat">
            开始对话 <ArrowUpRight size={14} />
          </a>
          <a href="/billing">账户与充值</a>
          <a href="/terms">服务说明</a>
          <a href="/privacy">隐私说明</a>
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
      </footer>
    </div>
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
      window.location.href = "/chat" + window.location.search;
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
function Chat({ config, refresh }) {
  const [history, setHistory] = useState([]),
    [conversation, setConversation] = useState(null),
    [messages, setMessages] = useState([]),
    [draft, setDraft] = useState(
      new URLSearchParams(location.search).get("prompt") || "",
    ),
    [model, setModel] = useState(config.models[0]?.id || ""),
    [sending, setSending] = useState(false),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [sidebar, setSidebar] = useState(false),
    [copied, setCopied] = useState(-1);
  const controller = useRef(null),
    end = useRef(null),
    inputRef = useRef(null);
  const loadHistory = () =>
    api("/conversations")
      .then(setHistory)
      .catch((e) => setError(e.message));
  useEffect(() => {
    loadHistory();
    return () => controller.current?.abort();
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({
      behavior: sending ? "instant" : "smooth",
      block: "end",
    });
  }, [messages, sending]);
  useEffect(() => {
    const esc = (e) => e.key === "Escape" && setSidebar(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);
  async function open(id) {
    if (sending) return;
    try {
      const c = await api("/conversations/" + id);
      setConversation(id);
      setMessages(c.messages);
      setSidebar(false);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  function fresh() {
    if (sending) return;
    setConversation(null);
    setMessages([]);
    setDraft("");
    setError("");
    setSidebar(false);
    inputRef.current?.focus();
  }
  async function send(e) {
    e?.preventDefault();
    if (!draft.trim() || sending || !model) return;
    const text = draft.trim();
    setSending(true);
    setError("");
    setDraft("");
    const next = [
      ...messages,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ];
    setMessages(next);
    const abort = new AbortController();
    controller.current = abort;
    let activeConv = conversation,
      received = false;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: conversation,
          content: text,
          model,
        }),
        signal: abort.signal,
      });
      if (!response.ok) {
        const data = await response.json();
        if (data.conversationId) {
          activeConv = data.conversationId;
          setConversation(activeConv);
        }
        throw Error(data.error);
      }
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let buffer = "",
        reply = "",
        finished = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let split;
        while ((split = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          const type = block
            .split("\n")
            .find((l) => l.startsWith("event:"))
            ?.slice(6)
            .trim();
          const raw = block
            .split("\n")
            .find((l) => l.startsWith("data:"))
            ?.slice(5);
          if (!raw) continue;
          const data = JSON.parse(raw);
          if (type === "meta") {
            activeConv = data.conversationId;
            setConversation(activeConv);
          }
          if (type === "delta") {
            received = true;
            reply += data.text;
            setMessages([
              ...next.slice(0, -1),
              { role: "assistant", content: reply },
            ]);
          }
          if (type === "error") {
            finished = true;
            setError(data.error);
          }
          if (type === "done") finished = true;
        }
      }
      if (!finished) setError("连接中断，回复可能不完整。");
    } catch (e) {
      if (e.name !== "AbortError") {
        setError(e.message);
        if (!received) setDraft(text);
        if (!activeConv) setMessages(messages);
      } else setError("已停止生成。");
    } finally {
      controller.current = null;
      setSending(false);
      await loadHistory();
      if (activeConv && !abort.signal.aborted) {
        try {
          const c = await api("/conversations/" + activeConv);
          setMessages(c.messages);
        } catch {}
      }
      await refresh();
    }
  }
  async function remove(id) {
    if (!window.confirm("删除这段对话？此操作无法撤销。")) return;
    try {
      await api("/conversations/" + id, {}, "DELETE");
      if (conversation === id) fresh();
      loadHistory();
    } catch (e) {
      setError(e.message);
    }
  }
  async function rename(id, title) {
    const next = window.prompt("新的会话标题", title);
    if (!next?.trim()) return;
    try {
      await api("/conversations/" + id, { title: next }, "PATCH");
      loadHistory();
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <div className="chat-app">
      {sidebar && (
        <button
          className="sidebar-shade"
          aria-label="关闭侧栏"
          onClick={() => setSidebar(false)}
        />
      )}
      <aside className={"chat-sidebar " + (sidebar ? "is-open" : "")}>
        <div className="sidebar-brand">
          <Brand />
          <IconButton label="收起侧栏" onClick={() => setSidebar(false)}>
            <PanelLeftClose size={18} />
          </IconButton>
        </div>
        <button className="new-chat" onClick={fresh} disabled={sending}>
          <Plus size={17} />
          新对话<span>开始</span>
        </button>
        <label className="search">
          <Search size={15} />
          <input
            placeholder="搜索对话"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="搜索对话"
          />
        </label>
        <p className="sidebar-label">你的对话</p>
        <div className="history-list">
          {history
            .filter((h) => h.title.toLowerCase().includes(search.toLowerCase()))
            .map((h) => (
              <div
                className={
                  "history-item " + (conversation === h.id ? "selected" : "")
                }
                key={h.id}
              >
                <button disabled={sending} onClick={() => open(h.id)}>
                  {h.title}
                </button>
                <IconButton
                  disabled={sending}
                  label={"重命名 " + h.title}
                  onClick={() => rename(h.id, h.title)}
                >
                  <Pencil size={13} />
                </IconButton>
                <IconButton
                  disabled={sending}
                  label={"删除 " + h.title}
                  onClick={() => remove(h.id)}
                >
                  <Trash2 size={13} />
                </IconButton>
              </div>
            ))}
          {!history.length && (
            <p className="history-empty">
              开始一段对话后，
              <br />
              会自动保存在这里。
            </p>
          )}
        </div>
        <div className="sidebar-footer">
          <a href="/billing">
            <Wallet size={16} />
            <span>账户与用量</span>
            <span>{money(config.user.balance)}</span>
          </a>
          {config.user.role === "admin" && (
            <a href="/admin">
              <Settings size={16} />
              管理后台
            </a>
          )}
          <button
            onClick={async () => {
              await api("/logout", {});
              location.href = "/";
            }}
          >
            <span className="avatar">{config.user.name[0]}</span>
            {config.user.name}
            <LogOut size={15} />
          </button>
        </div>
      </aside>
      <main className="chat-main">
        <header className="chat-top">
          <IconButton label="打开侧栏" onClick={() => setSidebar(true)}>
            <Menu size={19} />
          </IconButton>
          <span>
            {conversation
              ? history.find((h) => h.id === conversation)?.title || "对话"
              : "新的对话"}
          </span>
          <span className="saved-note">对话自动保存</span>
        </header>
        <div className={"chat-content " + (!messages.length ? "welcome" : "")}>
          {!messages.length ? (
            <div className="greeting">
              <div className="greeting-mark">✳</div>
              <p className="eyebrow">HELLO, {config.user.name}</p>
              <h1>今天，有什么新想法？</h1>
              <p>从一个问题、一段文字，或一个还没成形的念头开始。</p>
            </div>
          ) : (
            <div className="messages">
              {messages.map((m, i) => (
                <article key={i} className={"message " + m.role}>
                  <span className="message-label">
                    {m.role === "user" ? "你" : "kelaodeyun"}
                  </span>
                  <div className="message-body">
                    {m.content ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {m.content}
                      </ReactMarkdown>
                    ) : sending ? (
                      <span className="thinking">
                        正在思考<span>•••</span>
                      </span>
                    ) : (
                      <span className="muted">未收到回复</span>
                    )}
                  </div>
                  {m.role === "assistant" && m.content && !sending && (
                    <IconButton
                      label="复制回复"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(m.content);
                          setCopied(i);
                          setTimeout(() => setCopied(-1), 1500);
                        } catch {
                          setError("复制失败，请选择文本手动复制");
                        }
                      }}
                    >
                      {copied === i ? <Check size={14} /> : <Copy size={14} />}
                    </IconButton>
                  )}
                </article>
              ))}
              <div ref={end} />
            </div>
          )}
          <div className="composer-area">
            <Notice>{error}</Notice>
            {!config.models.length && (
              <div className="service-note">
                模型服务尚未开放。
                {config.user.role === "admin" ? (
                  <a href="/admin">
                    前往管理后台配置渠道和模型 <ArrowUpRight size={13} />
                  </a>
                ) : (
                  "请稍后再来。"
                )}
              </div>
            )}
            <form className="composer" onSubmit={send}>
              <textarea
                ref={inputRef}
                aria-label="消息"
                value={draft}
                placeholder="想从哪里开始？"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    send();
                  }
                }}
                maxLength={24000}
                rows={2}
              />
              <div className="composer-bottom">
                <label className="model-select">
                  <select
                    aria-label="选择模型"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    disabled={sending || !config.models.length}
                  >
                    {!config.models.length && (
                      <option value="">暂无可用模型</option>
                    )}
                    {config.models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={13} />
                </label>
                {sending ? (
                  <IconButton
                    label="停止生成"
                    className="send-button"
                    onClick={() => controller.current?.abort()}
                    type="button"
                  >
                    <Square size={15} fill="currentColor" />
                  </IconButton>
                ) : (
                  <IconButton
                    label="发送消息"
                    className="send-button"
                    type="submit"
                    disabled={!draft.trim() || !model}
                  >
                    <ArrowUp size={19} />
                  </IconButton>
                )}
              </div>
            </form>
            {!messages.length && (
              <div className="prompt-chips">
                {[
                  "帮我梳理一个想法",
                  "解释一个复杂概念",
                  "一起推敲一段文字",
                ].map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setDraft(t);
                      inputRef.current?.focus();
                    }}
                  >
                    {t}
                    <ArrowUpRight size={13} />
                  </button>
                ))}
              </div>
            )}
            <p className="composer-hint">
              AI 的回答可能有误，请核实重要信息。
              {model && (
                <>
                  输入 {config.models.find((m) => m.id === model)?.input_rate} /
                  输出 {config.models.find((m) => m.id === model)?.output_rate}{" "}
                  元 / 百万 token
                </>
              )}
            </p>
          </div>
        </div>
      </main>
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
              使用 Anthropic Messages 协议的授权接口。密钥仅保存在服务端。
            </p>
            <Table
              headers={["渠道", "地址", "状态", "操作"]}
              rows={data.channels.map((c) => [
                c.name,
                c.base_url,
                c.enabled ? "已启用" : "已停用",
                <button className="text-button" onClick={() => setChannel(c)}>
                  编辑
                </button>,
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
                required
                maxLength={150}
                defaultValue={model?.upstream_id}
              />
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
export function App() {
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
  useEffect(() => {
    document.body.classList.toggle("demo-mode", !!config.demo);
    return () => document.body.classList.remove("demo-mode");
  }, [config.demo]);
  return config.demo ? (
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
  if (path === "/chat") return <Chat config={config} refresh={refresh} />;
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
