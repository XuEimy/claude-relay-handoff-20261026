import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./claude-chat.css";
const glyphs = {
  sidebar: "\ue0dd",
  plus: "\ue001",
  projects: "\ue0c9",
  artifacts: "\ue017",
  code: "\ue048",
  customize: "\ue100",
  sort: "\ue070",
  search: "\ue0d3",
  apps: "\uf031",
  micdown: "\uf003",
  down: "\ue027",
  chat: "\ue037",
  cowork: "\ue0f1",
  mic: "\ue0ab",
  send: "\ue00f",
  more: "\ue061",
  copy: "\ue056",
  audio: "\ue0e4",
  good: "\ue0fb",
  bad: "\ue0f9",
  retry: "\ue11d",
  files: "\ue06c",
  share: "\ue0da",
};
function Glyph({ name }) {
  return (
    <span className="cc-icon" aria-hidden="true">
      {glyphs[name]}
    </span>
  );
}
function Tool({ name, label, className = "", children, ...props }) {
  return (
    <button
      type="button"
      className={"cc-tool " + className}
      aria-label={label}
      title={label}
      {...props}
    >
      {name ? <Glyph name={name} /> : children}
    </button>
  );
}
export default function ClaudeChat({ config, refresh, api }) {
  const [history, setHistory] = useState([]),
    [conversation, setConversation] = useState(null),
    [messages, setMessages] = useState([]),
    [draft, setDraft] = useState(
      new URLSearchParams(location.search).get("prompt") || "",
    ),
    [model, setModel] = useState(() => {
      const requested = new URLSearchParams(location.search).get("model");
      return (
        config.models.find((m) => m.id === requested)?.id ||
        config.models[0]?.id ||
        ""
      );
    }),
    [sending, setSending] = useState(false),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [sidebar, setSidebar] = useState(() => window.innerWidth > 700),
    [copied, setCopied] = useState(-1);
  const [menu, setMenu] = useState(null),
    [modal, setModal] = useState(null),
    [sidebarWidth, setSidebarWidth] = useState(288),
    [chatsExpanded, setChatsExpanded] = useState(true),
    [sortAlpha, setSortAlpha] = useState(false),
    [feedback, setFeedback] = useState({});
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
    const esc = (e) => {
      if (e.key === "Escape") {
        setMenu(null);
        setModal(null);
        if (window.innerWidth <= 700) setSidebar(false);
      }
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);
  async function open(id) {
    if (sending) return;
    try {
      const c = await api("/conversations/" + id);
      setConversation(id);
      setMessages(c.messages);
      if (window.innerWidth <= 700) setSidebar(false);
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
    if (window.innerWidth <= 700) setSidebar(false);
    inputRef.current?.focus();
    setMenu(null);
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
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height =
        Math.min(200, inputRef.current.scrollHeight) + "px";
    }
  }, [draft, messages.length > 0]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const update = () => setSidebar(!media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const hasMessages = messages.length > 0;
  const currentTitle =
    history.find((h) => h.id === conversation)?.title || "New chat";
  const currentModel = config.models.find((m) => m.id === model);
  const toggleMenu = (name) => setMenu(menu === name ? null : name);
  const unavailable = (title) => {
    setMenu(null);
    setModal({
      title,
      text: "此功能尚未接入。当前可使用文字聊天、会话记录、账户充值和用量查询。",
    });
  };
  const modelButton = (
    <button
      type="button"
      className="cc-model-button"
      aria-label="选择模型"
      aria-expanded={menu === "model"}
      onClick={() => toggleMenu("model")}
      disabled={sending}
    >
      {currentModel?.name || "暂无可用模型"}
    </button>
  );
  const copy = async (text, index) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(index);
      setTimeout(() => setCopied(-1), 1500);
    } catch {
      setError("复制失败，请手动选择文本复制。");
    }
  };
  const voiceControls = (
    <div className="cc-voice-controls">
      <Tool name="mic" label="Dictate" onClick={() => unavailable("Dictate")} />
      <Tool
        name="micdown"
        label="Microphone"
        className="cc-mic-menu"
        onClick={() => unavailable("Microphone")}
      />
      {sending ? (
        <Tool
          label="停止生成"
          className="cc-send"
          onClick={() => controller.current?.abort()}
        >
          <span className="cc-stop" />
        </Tool>
      ) : draft.trim() ? (
        <button
          type="submit"
          className="cc-tool cc-send"
          aria-label="发送消息"
          disabled={!model}
        >
          <Glyph name="send" />
        </button>
      ) : (
        <Tool label="Use voice mode" onClick={() => unavailable("Voice mode")}>
          <img src="/claude-assets/voice.svg" alt="" />
        </Tool>
      )}
    </div>
  );
  const filteredHistory = history.filter((h) =>
    h.title.toLowerCase().includes(search.toLowerCase()),
  );
  if (sortAlpha) filteredHistory.sort((a, b) => a.title.localeCompare(b.title));
  return (
    <div
      className={"cc-app " + (hasMessages ? "cc-conversation" : "cc-new")}
      style={{ "--cc-sidebar-width": sidebarWidth + "px" }}
    >
      {menu && (
        <button
          className="cc-dismiss"
          aria-label="关闭菜单"
          onClick={() => setMenu(null)}
        />
      )}
      {sidebar && (
        <>
          <button
            className="cc-mobile-shade"
            aria-label="关闭侧栏"
            onClick={() => setSidebar(false)}
          />
          <aside className="cc-sidebar">
            <header>
              <Tool
                name="sidebar"
                label="收起侧栏"
                onClick={() => setSidebar(false)}
              />
              <a href="/chat" className="cc-wordmark">
                kelaodeyun
              </a>
            </header>
            <nav aria-label="Main navigation">
              <button
                className={"cc-nav-item " + (!hasMessages ? "selected" : "")}
                onClick={fresh}
                disabled={sending}
              >
                <Glyph name="plus" />
                New
              </button>
              <button
                className="cc-nav-item"
                onClick={() => {
                  setSearch("");
                  setModal({ title: "Search your chats", search: true });
                }}
              >
                <Glyph name="search" />
                Search
              </button>
              {[
                ["projects", "Projects"],
                ["artifacts", "Artifacts"],
                ["code", "Code"],
                ["customize", "Customize"],
              ].map(([icon, label]) => (
                <button
                  className="cc-nav-item"
                  key={icon}
                  onClick={() => unavailable(label)}
                >
                  <Glyph name={icon} />
                  {label}
                  {icon === "code" && <small>Upgrade</small>}
                </button>
              ))}
            </nav>
            <section className="cc-history">
              <div className="cc-history-heading">
                <button
                  onClick={() => setChatsExpanded(!chatsExpanded)}
                  aria-expanded={chatsExpanded}
                >
                  Chats and tasks{" "}
                  <span className={chatsExpanded ? "" : "closed"}>⌄</span>
                </button>
                <Tool
                  name="sort"
                  label="Group and sort"
                  onClick={() => toggleMenu("sort")}
                />
              </div>
              {menu === "sort" && (
                <div className="cc-popover cc-sort">
                  <button
                    onClick={() => {
                      setSortAlpha(false);
                      setMenu(null);
                    }}
                  >
                    Recent {!sortAlpha && "✓"}
                  </button>
                  <button
                    onClick={() => {
                      setSortAlpha(true);
                      setMenu(null);
                    }}
                  >
                    Alphabetical {sortAlpha && "✓"}
                  </button>
                </div>
              )}
              {chatsExpanded &&
                filteredHistory.map((h) => (
                  <div
                    className={
                      "cc-history-row " +
                      (conversation === h.id ? "selected" : "")
                    }
                    key={h.id}
                  >
                    <button
                      className="cc-history-link"
                      disabled={sending}
                      onClick={() => open(h.id)}
                    >
                      <span className="cc-idle" />
                      <span>{h.title}</span>
                    </button>
                    <Tool
                      name="more"
                      label={"会话选项：" + h.title}
                      onClick={() => toggleMenu("history:" + h.id)}
                    />
                    {menu === "history:" + h.id && (
                      <div className="cc-popover cc-history-menu">
                        <button
                          onClick={() => {
                            setMenu(null);
                            rename(h.id, h.title);
                          }}
                        >
                          重命名
                        </button>
                        <button
                          disabled={sending}
                          onClick={() => {
                            setMenu(null);
                            remove(h.id);
                          }}
                        >
                          删除
                        </button>
                      </div>
                    )}
                  </div>
                ))}
            </section>
            <footer>
              <button
                className="cc-profile"
                aria-label="账户菜单"
                aria-expanded={menu === "profile"}
                onClick={() => toggleMenu("profile")}
              >
                <span className="cc-avatar">
                  {config.user.name?.[0] || "U"}
                </span>
                <span>{config.user.name}</span>
                <span className="cc-dim">
                  · {config.demo ? "演示" : "账户"}
                </span>
                <Glyph name="down" />
              </button>
              <Tool
                name="apps"
                label="Apps and extensions"
                onClick={() => unavailable("Apps and extensions")}
              />
            </footer>
            {menu === "profile" && (
              <div className="cc-popover cc-profile-menu">
                <div className="cc-account">
                  <strong>{config.user.name}</strong>
                  <span>{config.user.email}</span>
                  <small>kelaodeyun 独立站点</small>
                </div>
                <hr />
                <a href="/billing">
                  账户、充值与用量{" "}
                  <span>¥{((config.user.balance || 0) / 1e6).toFixed(2)}</span>
                </a>
                {config.user.role === "admin" && <a href="/admin">管理后台</a>}
                <a href="/">返回首页</a>
                <hr />
                {config.demo && (
                  <p>演示环境：模型为固定回复，充值不产生真实扣款。</p>
                )}
                <button
                  onClick={async () => {
                    await api("/logout", {});
                    location.href = "/login";
                  }}
                >
                  退出登录
                </button>
              </div>
            )}
            <div
              className="cc-resize"
              role="separator"
              aria-label="Resize sidebar"
              aria-orientation="vertical"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft")
                  setSidebarWidth((w) => Math.max(220, w - 8));
                if (e.key === "ArrowRight")
                  setSidebarWidth((w) => Math.min(420, w + 8));
              }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId))
                  setSidebarWidth(Math.max(220, Math.min(420, e.clientX)));
              }}
            />
          </aside>
        </>
      )}
      <main className="cc-main">
        {hasMessages ? (
          <header
            className={"cc-topbar " + (menu === "title" ? "cc-front" : "")}
          >
            {!sidebar && (
              <Tool
                name="sidebar"
                label="打开侧栏"
                onClick={() => setSidebar(true)}
              />
            )}
            <button className="cc-title" onClick={() => toggleMenu("title")}>
              {currentTitle}
              <Glyph name="down" />
            </button>
            <Tool
              name="files"
              label="Files"
              onClick={() => unavailable("Files")}
            />
            <button
              className="cc-share"
              onClick={() => setModal({ title: "分享对话", share: true })}
            >
              <Glyph name="share" />
              Share
            </button>
            {menu === "title" && (
              <div className="cc-popover cc-title-menu">
                <button
                  onClick={() => {
                    setMenu(null);
                    rename(conversation, currentTitle);
                  }}
                >
                  重命名
                </button>
                <button
                  onClick={() =>
                    copy(
                      messages
                        .map(
                          (m) =>
                            (m.role === "user" ? "You" : "Assistant") +
                            ": " +
                            m.content,
                        )
                        .join("\n\n"),
                      "all",
                    )
                  }
                >
                  {copied === "all" ? "已复制" : "复制对话"}
                </button>
                <button
                  disabled={sending}
                  onClick={() => {
                    setMenu(null);
                    remove(conversation);
                  }}
                >
                  删除对话
                </button>
              </div>
            )}
          </header>
        ) : (
          <>
            {!sidebar && (
              <Tool
                name="sidebar"
                label="打开侧栏"
                className="cc-open-sidebar"
                onClick={() => setSidebar(true)}
              />
            )}
            <Tool
              label="Use incognito"
              className="cc-incognito"
              onClick={() => unavailable("Incognito chat")}
            >
              <img src="/claude-assets/incognito.svg" alt="" />
            </Tool>
            <div className="cc-plan">
              Free plan <span>·</span>
              <a href="/billing">Upgrade</a>
            </div>
            <h1 className="cc-greeting">
              <img src="/claude-assets/spark.svg" alt="" />
              <span>Good afternoon, {config.user.name}</span>
            </h1>
          </>
        )}
        {hasMessages && (
          <div className="cc-message-scroll">
            <div className="cc-messages">
              {messages.map((m, i) => (
                <article
                  className={"cc-message cc-" + m.role}
                  key={i}
                  aria-label={
                    (m.role === "user" ? "You" : "Assistant") +
                    " message " +
                    (i + 1)
                  }
                >
                  <div className="cc-message-body">
                    {m.content ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {m.content}
                      </ReactMarkdown>
                    ) : (
                      <span className="cc-thinking">
                        {sending ? "Thinking…" : "未收到回复"}
                      </span>
                    )}
                  </div>
                  {m.role === "assistant" && m.content && !sending && (
                    <div className="cc-message-actions">
                      <Tool
                        name={copied === i ? null : "copy"}
                        label="复制回复"
                        onClick={() => copy(m.content, i)}
                      >
                        {copied === i ? "✓" : null}
                      </Tool>
                      <Tool
                        name="audio"
                        label="Read aloud"
                        onClick={() => unavailable("Read aloud")}
                      />
                      <Tool
                        name="good"
                        label="Good response"
                        aria-pressed={feedback[i] === "good"}
                        onClick={() => {
                          setFeedback({ ...feedback, [i]: "good" });
                          setModal({
                            title: "反馈",
                            text: "已在当前页面标记。服务端反馈收集尚未接入。",
                          });
                        }}
                      />
                      <Tool
                        name="bad"
                        label="Bad response"
                        aria-pressed={feedback[i] === "bad"}
                        onClick={() => {
                          setFeedback({ ...feedback, [i]: "bad" });
                          setModal({
                            title: "反馈",
                            text: "已在当前页面标记。服务端反馈收集尚未接入。",
                          });
                        }}
                      />
                      <Tool
                        name="retry"
                        label="Retry"
                        onClick={() => {
                          const previous = messages
                            .slice(0, i)
                            .findLast((x) => x.role === "user");
                          if (previous) {
                            setDraft(previous.content);
                            inputRef.current?.focus();
                          }
                        }}
                      />
                    </div>
                  )}
                </article>
              ))}
              <div ref={end} />
            </div>
          </div>
        )}
        <div
          className={
            "cc-composer-position " +
            (["model", "attach"].includes(menu) ? "cc-front" : "")
          }
        >
          {error && (
            <div role="alert" className="cc-error">
              {error}
              <button aria-label="关闭错误提示" onClick={() => setError("")}>
                ×
              </button>
            </div>
          )}
          {!config.models.length && (
            <div className="cc-service-note">
              模型服务尚未开放。
              {config.user.role === "admin" && <a href="/admin">配置模型</a>}
            </div>
          )}
          <form className="cc-composer" onSubmit={send}>
            {hasMessages && (
              <Tool
                name="plus"
                label="Add files, connectors, and more"
                className="cc-inline-plus"
                onClick={() => toggleMenu("attach")}
              />
            )}
            <textarea
              ref={inputRef}
              aria-label="消息"
              value={draft}
              placeholder={
                hasMessages ? "Write a message…" : "Type / for skills"
              }
              onChange={(e) => {
                setDraft(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height =
                  Math.min(200, e.target.scrollHeight) + "px";
              }}
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
              rows={1}
            />
            {hasMessages ? (
              voiceControls
            ) : (
              <div className="cc-composer-controls">
                <div className="cc-left-controls">
                  <Tool
                    name="plus"
                    label="Add files, connectors, and more"
                    onClick={() => toggleMenu("attach")}
                  />
                  <div
                    className="cc-surface"
                    role="radiogroup"
                    aria-label="Surface"
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-label="Chat"
                      aria-checked="true"
                    >
                      <span className="cc-desktop-label">Chat</span>
                      <span className="cc-mobile-label">
                        <Glyph name="chat" />
                      </span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-label="Cowork"
                      aria-checked="false"
                      onClick={() => unavailable("Cowork")}
                    >
                      <span className="cc-desktop-label">Cowork</span>
                      <span className="cc-mobile-label">
                        <Glyph name="cowork" />
                      </span>
                    </button>
                  </div>
                </div>
                <div className="cc-right-controls">
                  {modelButton}
                  {voiceControls}
                </div>
              </div>
            )}
          </form>
          {hasMessages && (
            <div className="cc-composer-footer">
              <span>
                {config.demo
                  ? "演示环境 · 固定回复，不会真实扣款。"
                  : "AI can make mistakes. Please double-check responses."}
              </span>
              {modelButton}
            </div>
          )}
          {menu === "model" && (
            <div
              className="cc-popover cc-model-menu"
              role="menu"
              aria-label="模型"
            >
              <div className="cc-menu-heading">Models</div>
              {config.models.map((m) => (
                <button
                  role="menuitemradio"
                  aria-checked={m.id === model}
                  key={m.id}
                  onClick={() => {
                    setModel(m.id);
                    setMenu(null);
                  }}
                >
                  <span>
                    {m.name}
                    <small>
                      输入 ¥{m.input_rate} / 输出 ¥{m.output_rate} · 百万 tokens
                    </small>
                  </span>
                  {m.id === model && <span className="cc-check">✓</span>}
                </button>
              ))}
              {!config.models.length && <p>暂无可用模型</p>}
              <hr />
              <a href="/billing">查看余额与用量</a>
            </div>
          )}
          {menu === "attach" && (
            <div className="cc-popover cc-attach-menu">
              <button onClick={() => unavailable("Add files or photos")}>
                ＋ Add files or photos
              </button>
              <button onClick={() => unavailable("Connectors")}>
                Connectors
              </button>
              <hr />
              <button onClick={() => unavailable("Web search")}>
                Web search
              </button>
              <button onClick={() => unavailable("Use style")}>
                Use style
              </button>
            </div>
          )}
        </div>
      </main>
      {modal && (
        <div className="cc-modal-backdrop" onClick={() => setModal(null)}>
          <section
            className="cc-modal"
            role="dialog"
            aria-modal="true"
            aria-label={modal.title}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="cc-modal-close"
              aria-label="关闭"
              onClick={() => setModal(null)}
            >
              ×
            </button>
            <h2>{modal.title}</h2>
            {modal.search ? (
              <>
                <input
                  autoFocus
                  aria-label="搜索对话"
                  value={search}
                  placeholder="Search your chats"
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="cc-search-results">
                  {filteredHistory.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => {
                        open(h.id);
                        setModal(null);
                        setSearch("");
                      }}
                    >
                      <Glyph name="chat" />
                      {h.title}
                    </button>
                  ))}
                  {!filteredHistory.length && <p>No chats found</p>}
                </div>
              </>
            ) : modal.share ? (
              <>
                <p>可复制这段对话。公开分享链接尚未接入。</p>
                <button
                  className="cc-primary"
                  onClick={() =>
                    copy(
                      messages
                        .map(
                          (m) =>
                            (m.role === "user" ? "You" : "Assistant") +
                            ": " +
                            m.content,
                        )
                        .join("\n\n"),
                      "all",
                    )
                  }
                >
                  {copied === "all" ? "已复制" : "复制对话"}
                </button>
              </>
            ) : (
              <p>{modal.text}</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
