import React, { useEffect, useRef, useState } from "react";

import { createRoot } from "react-dom/client";
import { UiIcon } from "../../open-claude-ui/chat/design-system/icons";
import {
  loadSessions,
  appendUserMessage,
  saveSessions,
} from "./session-store.mjs";
import { Framework } from "./Framework";
const iconMap = {
  sidebar: "sidebar",
  projects: "folder",
  artifacts: "artifacts",
  customize: "tool",
  sort: "plan",
  apps: "home",
  down: "caret",
  chat: "chat",
  cowork: "team",
  mic: "mic",
  more: "more",
};
const I = ({ name }) => (
  <span className="icon">
    <UiIcon name={iconMap[name] || name} size={20} />
  </span>
);
const menuModels = [
  ["Fable 5.1", "For your toughest challenges"],
  ["Opus 5.5", "For complex work and everyday tasks"],
  ["Sonnet 5.5", "Most efficient for simpler tasks"],
  ["Haiku 5.5", "Fastest for quick answers"],
];

export function App() {
  const [surface, setSurface] = useState("chat");
  const [notice, setNotice] = useState("");
  function navigate(next) {
    if (next === "chat" || next === "cowork") {
      newChat(next);
      return;
    }
    setSurface(next);
    setMenu("");
    if (innerWidth < 700) setSidebar(false);
  }
  const [sidebar, setSidebar] = useState(innerWidth > 700),
    [sideWidth, setSideWidth] = useState(288),
    [menu, setMenu] = useState(""),
    [modal, setModal] = useState(""),
    [model, setModel] = useState("Sonnet 5.5"),
    [effort, setEffort] = useState("Medium"),
    [text, setText] = useState(""),
    [attachments, setAttachments] = useState([]),
    [web, setWeb] = useState(true),
    [memory, setMemory] = useState(true),
    [chats, setChats] = useState(() => loadSessions(localStorage)),
    [active, setActive] = useState(null),
    [messages, setMessages] = useState([]),
    [search, setSearch] = useState(""),
    [collapsed, setCollapsed] = useState(false),
    [incognito, setIncognito] = useState(false);
  const editor = useRef(),
    file = useRef(),
    history = useRef();
  useEffect(() => {
    if (!modal) return;
    const prev = document.activeElement;
    const dialog = document.querySelector("[role=dialog]");
    const focusable = () => [
      ...dialog.querySelectorAll("button,a,input,[tabindex]"),
    ];
    focusable()[0]?.focus({ preventScroll: true });
    const trap = (e) => {
      if (e.key !== "Tab") return;
      const nodes = focusable(),
        first = nodes[0],
        last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    dialog.addEventListener("keydown", trap);
    return () => {
      dialog.removeEventListener("keydown", trap);
      prev?.focus({ preventScroll: true });
    };
  }, [modal]);
  useEffect(() => {
    const media = matchMedia("(max-width:700px)");
    const change = () => setSidebar(!media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!saveSessions(localStorage, chats)) {
      setNotice("浏览器存储不可用，消息暂未保存。请勿刷新或关闭页面。");
    }
  }, [chats]);
  useEffect(() => {
    const fn = (e) => {
      if (e.key === "Escape") {
        setMenu("");
        setModal("");
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        setSidebar((v) => !v);
      }
    };
    window.addEventListener("keydown", fn);
    return () => {
      window.removeEventListener("keydown", fn);
    };
  }, []);
  useEffect(() => {
    history.current?.scrollTo(0, history.current.scrollHeight);
  }, [messages]);
  function newChat(channel = "chat") {
    if (typeof channel !== "string") channel = "chat";
    setSurface(channel);
    setMessages([]);
    setActive(null);
    setText("");
    setAttachments([]);
    setMenu("");
    setNotice("");
    if (editor.current) editor.current.innerText = "";
  }
  function switchChannel(channel) {
    if (channel === surface) return;
    setSurface(channel);
    setMenu("");
    if (active && !incognito) {
      setChats((items) => items.map((item) =>
        item.id === active ? { ...item, channel } : item,
      ));
    }
    editor.current?.focus();
  }
  function openChat(c) {
    setIncognito(false);
    setSurface(c.channel || "chat");
    setMessages(c.messages);
    setActive(c.id);
    setText("");
    setAttachments([]);
    setMenu("");
    setModal("");
    setModel(c.model || "Sonnet 5.5");
    setEffort(c.effort || "Medium");
    setNotice(
      c.connection === "offline"
        ? "执行服务尚未连接，消息已保存在此浏览器。"
        : "",
    );
    if (editor.current) editor.current.innerText = "";
    if (innerWidth < 700) setSidebar(false);
  }
  function send() {
    if (!text.trim() && !attachments.length) return;
    const prior = active
      ? {
          ...(chats.find((c) => c.id === active) || {
            title: messages[0]?.text?.slice(0, 36) || "临时对话",
            channel: surface,
          }),
          id: active,
          messages,
        }
      : null;
    const next = appendUserMessage(prior, {
      text,
      files: attachments,
      channel: surface,
      model,
      effort,
    });
    setActive(next.id);
    setMessages(next.messages);
    if (!incognito)
      setChats((cs) => [next, ...cs.filter((c) => c.id !== next.id)]);
    setNotice(
      incognito
        ? "执行服务尚未连接，消息仅保留在本次临时对话中。"
        : "执行服务尚未连接，消息已保存在此浏览器。",
    );
    setText("");
    setAttachments([]);
    setMenu("");
    if (editor.current) editor.current.innerText = "";
  }
  function toggle(name) {
    setMenu((v) => (v === name ? "" : name));
  }
  function resize(e) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const move = (v) => setSideWidth(Math.max(220, Math.min(420, v.clientX)));
    const stop = () => {
      e.target.removeEventListener("pointermove", move);
      e.target.removeEventListener("pointerup", stop);
    };
    e.currentTarget.addEventListener("pointermove", move);
    e.currentTarget.addEventListener("pointerup", stop);
  }
  const btn = (label, icon, action, extra = "") => (
    <button
      className={"icon-button " + extra}
      aria-label={label}
      title={label}
      onClick={action}
    >
      <I name={icon} />
    </button>
  );
  return (
    <div
      className={
        "app " +
        (sidebar ? "sidebar-open " : "") +
        (messages.length && ["chat", "cowork"].includes(surface)
          ? "conversation"
          : "")
      }
      style={{ "--sidebar-width": sideWidth + "px" }}
    >
      {sidebar && (
        <>
          <div className="mobile-scrim" onClick={() => setSidebar(false)} />
          <aside className="web-sidebar">
            <header>
              {btn("Hide sidebar", "sidebar", () => setSidebar(false))}
              <a
                className="wordmark"
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  newChat();
                }}
              >
                Claude
              </a>
            </header>
            <nav>
              <button
                className={"nav-item " + (surface === "chat" ? "selected" : "")}
                onClick={newChat}
              >
                <I name="plus" />
                新对话
              </button>
              {[
                ["Cowork", "cowork", "cowork"],
                ["项目", "projects", "projects"],
                ["作品", "artifacts", "artifacts"],
                ["自定义", "customize", "customize"],
              ].map(([label, icon, key]) => (
                <button
                  key={key}
                  className={"nav-item " + (surface === key ? "selected" : "")}
                  onClick={() => navigate(key)}
                >
                  <I name={icon} />
                  {label}
                </button>
              ))}
            </nav>
            <section className="chat-list">
              <div className="list-title">
                <button
                  onClick={() => setCollapsed(!collapsed)}
                  aria-expanded={!collapsed}
                >
                  对话与任务
                </button>
                {btn("Group and sort", "sort", () => toggle("sort"))}
              </div>
              {menu === "sort" && (
                <div className="sort-menu popover">
                  <button
                    onClick={() => {
                      setChats((v) =>
                        [...v].sort((a, b) => a.title.localeCompare(b.title)),
                      );
                      setMenu("");
                    }}
                  >
                    Sort alphabetically
                  </button>
                  <button
                    onClick={() => {
                      setChats((v) => [...v].reverse());
                      setMenu("");
                    }}
                  >
                    Reverse order
                  </button>
                </div>
              )}
              {!collapsed &&
                chats.map((c) => (
                  <button
                    key={c.id}
                    className={
                      "chat-item " +
                      (["chat", "cowork"].includes(surface) && active === c.id
                        ? "active"
                        : "")
                    }
                    onClick={() => openChat(c)}
                  >
                    {c.channel === "cowork" ? (
                      <I name="cowork" />
                    ) : (
                      <span className="idle-dot" />
                    )}
                    <span>{c.title}</span>
                  </button>
                ))}
            </section>
            <footer>
              <button className="profile" onClick={() => toggle("profile")}>
                <span className="avatar">云</span>云上克劳德
                <I name="down" />
              </button>
              <a
                className="icon-button"
                aria-label="返回官网"
                href="/"
                target="_blank"
                rel="noreferrer"
              >
                <I name="apps" />
              </a>
              {btn("Search", "search", () => setModal("Search chats"))}
            </footer>
            {menu === "profile" && (
              <div className="profile-menu popover">
                <b>云上克劳德</b>
                <button
                  onClick={() => {
                    setModal("About this reconstruction");
                    setMenu("");
                  }}
                >
                  About this reconstruction
                </button>
                <a href="/account" target="_blank" rel="noreferrer">
                  账户与用量
                </a>
              </div>
            )}
            <div
              className="resize"
              role="separator"
              aria-label="Resize sidebar"
              aria-orientation="vertical"
              aria-valuenow={sideWidth}
              aria-valuemin={220}
              aria-valuemax={420}
              tabIndex={0}
              onPointerDown={resize}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight")
                  setSideWidth((v) => Math.min(420, v + 10));
                if (e.key === "ArrowLeft")
                  setSideWidth((v) => Math.max(220, v - 10));
              }}
            />
          </aside>
        </>
      )}
      <main>
        {!sidebar && (
          <div className="show-sidebar">
            {btn("Show sidebar", "sidebar", () => setSidebar(true))}
          </div>
        )}
        <div
          className="web-chat-surface"
          hidden={!["chat", "cowork"].includes(surface)}
        >
          <button
            className={"incognito " + (incognito ? "enabled" : "")}
            aria-label="Use incognito"
            title="Use incognito"
            aria-pressed={incognito}
            onClick={() => {
              setIncognito(!incognito);
              newChat(surface);
            }}
          >
            <img src="/claude-web-assets/incognito.svg" alt="" />
          </button>
          {messages.length ? (
            <>
              <div className="conversation-title">
                {chats.find((c) => c.id === active)?.title || "New chat"}
                {surface === "cowork" && <span>Cowork</span>}
              </div>
              <div className="messages" ref={history}>
                {messages.map((m, i) => (
                  <div className={"message " + m.role} key={i}>
                    {m.role === "assistant" && (
                      <img
                        className="small-spark"
                        src="/claude-web-assets/spark.svg"
                        alt="Claude"
                      />
                    )}
                    <div>
                      {m.files?.map((f) => (
                        <div className="file-chip" key={f}>
                          {f}
                        </div>
                      ))}
                      {m.text}
                    </div>
                  </div>
                ))}
                {notice && (
                  <p className="connection-note" role="status">
                    {notice}
                  </p>
                )}
              </div>
            </>
          ) : (
            <h1>
              <img src="/claude-web-assets/spark.svg" alt="" />
              <span>
                {surface === "cowork"
                  ? "把任务交给 Claude。"
                  : "今天，想聊些什么？"}
              </span>
            </h1>
          )}
          <div className="composer-position">
            <div className="composer">
              {attachments.length > 0 && (
                <div className="files">
                  {attachments.map((f, i) => (
                    <button
                      className="file-chip"
                      key={i}
                      onClick={() =>
                        setAttachments((a) => a.filter((_, j) => j !== i))
                      }
                    >
                      {f.name} ×
                    </button>
                  ))}
                </div>
              )}
              <div
                ref={editor}
                className="editor"
                role="textbox"
                contentEditable
                suppressContentEditableWarning
                aria-label="Write your prompt to Claude"
                aria-multiline="true"
                data-placeholder={
                  surface === "cowork"
                    ? "描述你想完成的工作…"
                    : "今天有什么可以帮你？"
                }
                onInput={(e) => setText(e.currentTarget.innerText)}
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
              />
              <div className="composer-controls">
                <div className="left-controls">
                  {btn("Add files, connectors, and more", "plus", () =>
                    toggle("attach"),
                  )}
                  <div className="mode" role="radiogroup" aria-label="Surface">
                    <button
                      role="radio"
                      aria-label="Chat"
                      aria-checked={surface === "chat"}
                      onClick={() => switchChannel("chat")}
                    >
                      <span className="desktop-label">Chat</span>
                      <span className="mobile-label">
                        <I name="chat" />
                      </span>
                    </button>
                    <button
                      role="radio"
                      aria-label="Cowork"
                      aria-checked={surface === "cowork"}
                      onClick={() => switchChannel("cowork")}
                    >
                      <span className="desktop-label">Cowork</span>
                      <span className="mobile-label">
                        <I name="cowork" />
                      </span>
                    </button>
                  </div>
                </div>
                <div className="right-controls">
                  <button
                    className="model-button"
                    aria-label={"Model: " + model + " " + effort}
                    aria-haspopup="menu"
                    aria-expanded={menu === "model" || menu === "effort"}
                    onClick={() => toggle("model")}
                  >
                    {model}
                    <span className="effort-label">{effort}</span>
                  </button>
                  {btn("Dictate", "mic", () => setModal("Voice input"))}
                  <button
                    className="mic-dropdown"
                    aria-label="Microphone"
                    onClick={() => setModal("Voice input")}
                  >
                    <I name="down" />
                  </button>
                  {text.trim() || attachments.length ? (
                    <button
                      className="send"
                      aria-label="Send message"
                      onClick={send}
                    >
                      <I name="send" />
                    </button>
                  ) : (
                    <button
                      className="icon-button voice"
                      aria-label="Use voice mode"
                      onClick={() => setModal("Voice input")}
                    >
                      <img src="/claude-web-assets/voice.svg" alt="" />
                    </button>
                  )}
                </div>
              </div>
            </div>
            {(menu === "model" || menu === "effort") && (
              <div
                className="model-menu popover"
                role="menu"
                aria-label="Choose model"
              >
                {menu === "effort" ? (
                  <>
                    <button onClick={() => setMenu("model")}>
                      Back to models
                    </button>
                    <p className="menu-help">
                      Higher effort means more thorough responses, but takes
                      longer and uses your limits faster.
                    </p>
                    {["Low", "Medium", "High", "Extra", "Max"].map((x) => (
                      <button
                        key={x}
                        role="menuitemradio"
                        aria-checked={effort === x}
                        onClick={() => {
                          setEffort(x);
                          setMenu("");
                        }}
                      >
                        {x}
                        {x === "Medium" && <small>Recommended</small>}
                        {effort === x && <span className="check">✓</span>}
                      </button>
                    ))}
                  </>
                ) : (
                  <>
                    {menuModels.map(([name, desc]) => (
                      <button
                        key={name}
                        role="menuitemradio"
                        aria-checked={model === name}
                        onClick={() => {
                          setModel(name);
                          setMenu("");
                        }}
                      >
                        <span>
                          <span>{name}</span>
                          <em>{desc}</em>
                        </span>
                        {model === name ? (
                          <span className="check">✓</span>
                        ) : null}
                      </button>
                    ))}
                    <hr />
                    <button onClick={() => setMenu("effort")}>
                      Effort <span className="push">{effort} ›</span>
                    </button>
                    <button onClick={() => setModal("More models")}>
                      More models <span className="push">›</span>
                    </button>
                  </>
                )}
              </div>
            )}
            {menu === "attach" && (
              <div
                className="attach-menu popover"
                role="menu"
                aria-label="Add files and tools"
              >
                <button
                  onClick={() => {
                    file.current.click();
                    setMenu("");
                  }}
                >
                  Upload or add files
                </button>
                {[
                  "Take a screenshot",
                  "Add to project",
                  "Skills",
                  "Connectors",
                  "Design system",
                  "Add plugins",
                ].map((x) => (
                  <button
                    key={x}
                    onClick={() => {
                      setModal(x);
                      setMenu("");
                    }}
                  >
                    {x}
                    <span className="push">›</span>
                  </button>
                ))}
                <hr />
                <button
                  role="menuitemcheckbox"
                  aria-checked={web}
                  onClick={() => setWeb(!web)}
                >
                  Web search <span className={"switch " + (web ? "on" : "")} />
                </button>
                <button
                  role="menuitemcheckbox"
                  aria-checked={memory}
                  onClick={() => setMemory(!memory)}
                >
                  Memory <span className={"switch " + (memory ? "on" : "")} />
                </button>
              </div>
            )}
          </div>
          <input
            hidden
            ref={file}
            type="file"
            multiple
            onChange={(e) => {
              setAttachments((a) => [...a, ...Array.from(e.target.files)]);
              e.target.value = "";
            }}
          />
        </div>
        {["projects", "artifacts", "customize"].includes(surface) && (
          <Framework section={surface} chats={chats} onOpenChat={openChat} />
        )}
      </main>
      {menu && <div className="menu-dismiss" onClick={() => setMenu("")} />}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal("")}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={modal}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              aria-label="Close"
              onClick={() => setModal("")}
            >
              ×
            </button>
            <h2>{modal}</h2>
            {modal === "Search chats" ? (
              <>
                <input
                  autoFocus
                  placeholder="Search your chats"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="search-results">
                  {chats
                    .filter((c) =>
                      [c.title, ...c.messages.map((m) => m.text)]
                        .some((value) => value.toLowerCase().includes(search.toLowerCase())),
                    )
                    .map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          openChat(c);
                        }}
                      >
                        {c.title}
                      </button>
                    ))}
                </div>
              </>
            ) : (
              <>
                <p>
                  {modal === "About this reconstruction"
                    ? "本地前端还原 · 根据 2026-10-26 的真实页面制作。演示消息不发送到 Claude，历史记录仅存于当前浏览器。"
                    : modal === "Voice input"
                      ? "此本地演示尚未接入语音服务。"
                      : "此入口已在原站确认。本地演示只还原新建聊天页；此功能需要 Claude 在线服务。"}
                </p>
                <button className="primary" onClick={() => setModal("")}>
                  Got it
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
