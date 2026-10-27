import React, { useEffect, useRef, useState } from "react";

import { createRoot } from "react-dom/client";
import { UiIcon } from "../../open-claude-ui/chat/design-system/icons";
import Cowork, { readTasks } from "../../open-claude-ui/chat/Cowork";
import { readChats, DIFF, FILE } from "../../open-claude-ui/chat/state.mjs";
import { McpToolDecisionCard } from "../../../vendor/open-claude-ui/code-examples/McpToolDecisionCard";
import { StreamingDiffViewer } from "../../../vendor/open-claude-ui/code-examples/StreamingDiffViewer";
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
function readSaved() {
  try {
    const stored = JSON.parse(
      localStorage.getItem("kelaodeyun.web.chats.v1") || "null",
    );
    if (Array.isArray(stored)) return stored;
    const prior = readChats();
    if (prior.length) return prior;
    const old = JSON.parse(
      localStorage.getItem("claude-reconstruction-chats") || "[]",
    );
    return Array.isArray(old)
      ? old.filter((c) => !c.id.startsWith("sample-"))
      : [];
  } catch {
    return [];
  }
}
const menuModels = [
  ["Fable 5.1", "For your toughest challenges"],
  ["Opus 5.5", "For complex work and everyday tasks"],
  ["Sonnet 5.5", "Most efficient for simpler tasks"],
  ["Haiku 5.5", "Fastest for quick answers"],
];

export function App() {
  const [surface, setSurface] = useState("chat"),
    [tasks, setTasks] = useState(readTasks),
    [activeTask, setActiveTask] = useState(null),
    [showFile, setShowFile] = useState(false);
  function navigate(next) {
    setSurface(next);
    setShowFile(false);
    setMenu("");
    if (innerWidth < 700) setSidebar(false);
  }
  function decide(index, decision) {
    setMessages((prev) => {
      const next = prev.map((m, i) =>
        i === index
          ? { ...m, tool: decision === "deny" ? "denied" : "allowed" }
          : m,
      );
      if (!incognito)
        setChats((cs) =>
          cs.map((c) => (c.id === active ? { ...c, messages: next } : c)),
        );
      return next;
    });
    if (decision !== "deny") setShowFile(true);
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
    [chats, setChats] = useState(readSaved),
    [active, setActive] = useState(null),
    [messages, setMessages] = useState([]),
    [streaming, setStreaming] = useState(false),
    [search, setSearch] = useState(""),
    [collapsed, setCollapsed] = useState(false),
    [incognito, setIncognito] = useState(false);
  const editor = useRef(),
    file = useRef(),
    timer = useRef(),
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
    try {
      localStorage.setItem("kelaodeyun.web.chats.v1", JSON.stringify(chats));
    } catch {}
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
      clearInterval(timer.current);
    };
  }, []);
  useEffect(() => {
    history.current?.scrollTo(0, history.current.scrollHeight);
  }, [messages]);
  function newChat() {
    setSurface("chat");
    setShowFile(false);
    clearInterval(timer.current);
    setStreaming(false);
    setMessages([]);
    setActive(null);
    setText("");
    setAttachments([]);
    setMenu("");
    if (editor.current) editor.current.innerText = "";
  }
  function openChat(c) {
    setSurface("chat");
    setShowFile(false);
    clearInterval(timer.current);
    setStreaming(false);
    setMessages(c.messages);
    setActive(c.id);
    setModal("");
    if (innerWidth < 700) setSidebar(false);
  }
  function send() {
    if (surface === "cowork") {
      if (!text.trim() && !attachments.length) return;
      const task = {
        id: crypto.randomUUID(),
        title: (text.trim() || "整理附件").slice(0, 24),
        prompt: text.trim() || "整理附件",
        model,
        notes: [],
      };
      setTasks((v) => [task, ...v]);
      setActiveTask(task.id);
      setText("");
      setAttachments([]);
      setMenu("");
      if (editor.current) editor.current.innerText = "";
      return;
    }

    if (streaming) {
      clearInterval(timer.current);
      setStreaming(false);
      if (!incognito && active) {
        const row = {
          id: active,
          title:
            messages.find((m) => m.role === "user")?.text.slice(0, 36) ||
            "File conversation",
          messages,
        };
        setChats((cs) =>
          cs.some((c) => c.id === active)
            ? cs.map((c) => (c.id === active ? row : c))
            : [row, ...cs],
        );
      }
      return;
    }
    const prompt = text.trim();
    if (!prompt && !attachments.length) return;
    const id = active || crypto.randomUUID();
    setActive(id);
    const next = [
      ...messages,
      { role: "user", text: prompt, files: attachments.map((f) => f.name) },
      {
        role: "assistant",
        text: "",
        tool: /修改|代码|文件|html/i.test(prompt) ? "pending" : undefined,
      },
    ];
    setMessages(next);
    if (!incognito)
      setChats((cs) => {
        const row = {
          id,
          title: prompt.slice(0, 36) || "附件对话",
          messages: next,
        };
        return cs.some((c) => c.id === id)
          ? cs.map((c) => (c.id === id ? row : c))
          : [row, ...cs];
      });
    setText("");
    editor.current.innerText = "";
    setAttachments([]);
    setStreaming(true);
    setMenu("");
    const reply =
      "这是本地演示回复，尚未连接模型。\n\n我们可以先梳理目标，再继续完善你的想法。";
    let n = 0;
    timer.current = setInterval(() => {
      n = Math.min(n + 2, reply.length);
      const updated = next.map((m, i) =>
        i === next.length - 1 ? { ...m, text: reply.slice(0, n) } : m,
      );
      setMessages(updated);
      if (n === reply.length) {
        clearInterval(timer.current);
        setStreaming(false);
        if (!incognito)
          setChats((cs) => {
            const row = {
              id,
              title: prompt.slice(0, 36) || "File conversation",
              messages: updated,
            };
            return cs.some((c) => c.id === id)
              ? cs.map((c) => (c.id === id ? row : c))
              : [row, ...cs];
          });
      }
    }, 80);
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
        (messages.length && surface === "chat" ? "conversation" : "")
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
                    className={"chat-item " + (surface === "chat" && active === c.id ? "active" : "")}
                    onClick={() => openChat(c)}
                  >
                    <span className="idle-dot" />
                    <span>{c.title}</span>
                  </button>
                ))}
              {!collapsed &&
                tasks.map((t) => (
                  <button
                    className={
                      "chat-item " +
                      (surface === "cowork" && activeTask === t.id
                        ? "active"
                        : "")
                    }
                    key={t.id}
                    onClick={() => {
                      setActiveTask(t.id);
                      navigate("cowork");
                    }}
                  >
                    <I name="cowork" />
                    <span>{t.title}</span>
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
        {!sidebar && !(surface === "cowork" && activeTask) && (
          <div className="show-sidebar">
            {btn("Show sidebar", "sidebar", () => setSidebar(true))}
          </div>
        )}
        <div
          className="web-chat-surface"
          hidden={surface !== "chat" && !(surface === "cowork" && !activeTask)}
        >
          <button
            className={"incognito " + (incognito ? "enabled" : "")}
            aria-label="Use incognito"
            title="Use incognito"
            aria-pressed={incognito}
            onClick={() => {
              setIncognito(!incognito);
              newChat();
            }}
          >
            <img src="/claude-web-assets/incognito.svg" alt="" />
          </button>
          {surface === "chat" && messages.length ? (
            <>
              <div className="conversation-title">
                {chats.find((c) => c.id === active)?.title || "New chat"}
                <span>Local demo</span>
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
                      {m.text || <span className="thinking">Thinking…</span>}
                      {m.role === "assistant" &&
                        m.tool === "pending" &&
                        !streaming && (
                          <div className="web-tool">
                            <McpToolDecisionCard
                              toolCall={{
                                id: "edit-" + i,
                                toolName: "修改 welcome.html",
                                serverUrl: "本地演示",
                                inputParams: {
                                  file: "welcome.html",
                                  action: "展示修改差异",
                                },
                              }}
                              onVerdict={(d) => decide(i, d)}
                            />
                          </div>
                        )}
                      {m.tool === "allowed" && (
                        <button
                          className="web-file-link"
                          onClick={() => setShowFile(true)}
                        >
                          <I name="artifacts" />
                          welcome.html <I name="send" />
                        </button>
                      )}
                      {m.tool === "denied" && (
                        <p className="muted">已拒绝修改。</p>
                      )}
                    </div>
                  </div>
                ))}
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
                      onClick={() => navigate("chat")}
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
                      onClick={() => navigate("cowork")}
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
                  {text.trim() || attachments.length || streaming ? (
                    <button
                      className="send"
                      aria-label={streaming ? "Stop response" : "Send message"}
                      onClick={send}
                    >
                      {streaming ? (
                        <span className="stop-square" />
                      ) : (
                        <I name="send" />
                      )}
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
        <div
          className="web-cowork-surface"
          hidden={surface !== "cowork" || !activeTask}
        >
          <Cowork
            tasks={tasks}
            setTasks={setTasks}
            active={activeTask}
            onSelect={setActiveTask}
            sidebar={sidebar}
            onOpenSidebar={() => setSidebar(true)}
          />
        </div>
        {["projects", "artifacts", "customize"].includes(surface) && (
          <Framework
            section={surface}
            chats={chats}
            tasks={tasks}
            onOpenChat={openChat}
            onOpenTask={(id) => {
              setActiveTask(id);
              navigate("cowork");
            }}
            onFile={() => setShowFile(true)}
          />
        )}
      </main>
      {showFile && (
        <section className="web-artifact" aria-label="文件修改">
          <header>
            <span>welcome.html</span>
            <button aria-label="关闭文件" onClick={() => setShowFile(false)}>
              <UiIcon name="close" />
            </button>
          </header>
          <StreamingDiffViewer
            filename="welcome.html"
            language="html"
            rawDiff={DIFF}
          />
          <iframe title="文件预览" sandbox="" srcDoc={FILE} />
        </section>
      )}

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
                  {[...chats, ...tasks.map((t) => ({ ...t, isTask: true }))]
                    .filter((c) =>
                      c.title.toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          if (c.isTask) {
                            setActiveTask(c.id);
                            navigate("cowork");
                            setModal("");
                          } else openChat(c);
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
