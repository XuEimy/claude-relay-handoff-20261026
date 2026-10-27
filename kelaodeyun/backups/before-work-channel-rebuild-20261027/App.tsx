import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  PanelLeft,
  Plus,
  Search,
  MessageSquare,
  Sun,
  Moon,
  Home,
  Trash2,
  X,
  Square,
  ArrowUpRight,
  Download,
  FileCode,
  Pin,
  Pencil,
  Briefcase,
  Gear,
  UiIcon,
} from "./design-system/icons";
import {
  ChatComposer,
  CLAUDE_MODELS,
} from "../../../vendor/open-claude-ui/code-examples/ChatComposer";
import {
  UserMessageBubble,
  AssistantMessageBubble,
} from "../../../vendor/open-claude-ui/code-examples/ChatMessageBubbles";
import { McpToolDecisionCard } from "../../../vendor/open-claude-ui/code-examples/McpToolDecisionCard";
import { StreamingDiffViewer } from "../../../vendor/open-claude-ui/code-examples/StreamingDiffViewer";
import { ArtifactsSplitPaneResizer } from "../../../vendor/open-claude-ui/code-examples/ArtifactsSplitPaneResizer";
import { ConfirmationDialog } from "../../../vendor/open-claude-ui/code-examples/ConfirmationDialog";
import { CdsButton } from "../../../vendor/open-claude-ui/code-examples/CdsButton";
import { readChats, newChat, demoReply, DIFF, FILE } from "./state.mjs";

import Cowork, { readTasks } from "./Cowork";
import { SegmentedControl } from "../../../vendor/open-claude-ui/code-examples/SegmentedControl";

function App() {
  const [mode, setMode] = useState("chat"),
    [tasks, setTasks] = useState(readTasks),
    [activeTask, setActiveTask] = useState<string | null>(null),
    [accountMenu, setAccountMenu] = useState(false);
  const [chats, setChats] = useState(readChats),
    [active, setActive] = useState<string | null>(null),
    [sidebar, setSidebar] = useState(innerWidth > 800);
  const [search, setSearch] = useState(false),
    [query, setQuery] = useState(""),
    [dark, setDark] = useState(() => {
      try {
        return localStorage.getItem("kelaodeyun.ui.theme") === "dark";
      } catch {
        return false;
      }
    });
  const [busy, setBusy] = useState(false),
    [artifact, setArtifact] = useState(false),
    [deleteId, setDeleteId] = useState<string | null>(null),
    [notice, setNotice] = useState("");
  const [rename, setRename] = useState(false),
    [name, setName] = useState(""),
    [small, setSmall] = useState(innerWidth < 1000);
  const timer = useRef<ReturnType<typeof setInterval>>(),
    end = useRef<HTMLDivElement>(null),
    scroll = useRef<HTMLDivElement>(null),
    follow = useRef(true),
    running = useRef<{ chat: string; msg: string } | null>(null);
  const chat = chats.find((c) => c.id === active),
    messages = chat?.messages || [],
    pending = messages.some((m) => m.tool === "pending");
  useEffect(() => {
    try {
      localStorage.setItem("kelaodeyun.ui.chats.v1", JSON.stringify(chats));
    } catch {
      setNotice("浏览器存储已满，本次会话暂未保存。");
    }
  }, [chats]);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("kelaodeyun.ui.theme", dark ? "dark" : "light");
    } catch {}
  }, [dark]);
  useEffect(() => {
    const resize = () => setSmall(innerWidth < 1000);
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      clearInterval(timer.current);
    };
  }, []);
  useEffect(() => {
    if (follow.current) end.current?.scrollIntoView({ block: "end" });
  }, [messages]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 3000);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (!deleteId) return;
    const before = document.activeElement as HTMLElement;
    const dialog = document.querySelector("[role=dialog]") as HTMLElement;
    const focusables = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button,[href],input,[tabindex="0"]',
        ) || [],
      );
    focusables()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const f = focusables();
      const i = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) {
        e.preventDefault();
        f.at(-1)?.focus();
      } else if (!e.shiftKey && i === f.length - 1) {
        e.preventDefault();
        f[0]?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      before?.focus();
    };
  }, [deleteId]);
  function update(id: string, fn: any) {
    setChats((prev) => prev.map((c) => (c.id === id ? fn(c) : c)));
  }
  function stop() {
    clearInterval(timer.current);
    if (running.current) {
      const r = running.current;
      update(r.chat, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === r.msg
            ? { ...m, text: m.text || "回复已停止。", stopped: true }
            : m,
        ),
      }));
    }
    running.current = null;
    setBusy(false);
  }
  useEffect(() => {
    if (!accountMenu) return;
    const close = (e: any) => {
      if (e.type === "keydown" && e.key !== "Escape") return;
      if (e.type === "pointerdown" && e.target.closest(".account-anchor"))
        return;
      setAccountMenu(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [accountMenu]);
  function choose(id: string | null) {
    setMode("chat");
    stop();
    setActive(id);
    setArtifact(false);
    setRename(false);
    follow.current = true;
    if (innerWidth < 800) setSidebar(false);
  }
  function send(
    text: string,
    attachments: any[] = [],
    model = "Claude 3.7 Sonnet",
    thinking = false,
  ) {
    if ((!text.trim() && !attachments.length) || busy || pending) return;
    text = text.trim() || "查看示例附件";
    let id = active;
    if (!id) {
      const c = newChat(text);
      id = c.id;
      setChats((prev) => [c, ...prev]);
      setActive(id);
    }
    const cid = id!,
      aid = crypto.randomUUID();
    const tools = /代码|文件|页面|修改|code|html|工具/i.test(text);
    update(cid, (c) => ({
      ...c,
      lastModel: model,
      messages: [
        ...c.messages,
        {
          id: crypto.randomUUID(),
          role: "user",
          text,
          attachment: attachments[0],
        },
        {
          id: aid,
          role: "assistant",
          text: "",
          model,
          thinking,
          tool: undefined,
        },
      ],
    }));
    follow.current = true;
    setBusy(true);
    running.current = { chat: cid, msg: aid };
    const reply = demoReply(text, tools, attachments.length);
    let cursor = 0;
    timer.current = setInterval(() => {
      cursor += 3;
      update(cid, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === aid ? { ...m, text: reply.slice(0, cursor) } : m,
        ),
      }));
      if (cursor >= reply.length) {
        clearInterval(timer.current);
        running.current = null;
        setBusy(false);
        if (tools)
          update(cid, (c) => ({
            ...c,
            messages: c.messages.map((m) =>
              m.id === aid
                ? { ...m, tool: c.allowTools ? "allowed" : "pending" }
                : m,
            ),
          }));
      }
    }, 24);
  }
  function verdict(mid: string, value: string) {
    if (!active) return;
    const result = value === "deny" ? "denied" : "allowed";
    update(active, (c) => ({
      ...c,
      allowTools: value === "always_allow" || c.allowTools,
      messages: c.messages.map((m) =>
        m.id === mid ? { ...m, tool: result } : m,
      ),
    }));
    if (result === "allowed") setArtifact(true);
  }
  function download() {
    const blob = new Blob([FILE], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "welcome-demo.html";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const chatPane = (
    <div className={"conversation " + (!messages.length ? "empty" : "")}>
      <header className="chat-top">
        <div className="chat-top-title">
          {!sidebar && (
            <CdsButton
              variant="ghost"
              size="icon"
              aria-label="打开侧栏"
              onClick={() => setSidebar(true)}
            >
              <PanelLeft size={18} />
            </CdsButton>
          )}
          {chat ? (
            <button
              className="title-button"
              onClick={() => {
                setName(chat.title);
                setRename(true);
              }}
            >
              {chat.title}
              <Pencil size={12} />
            </button>
          ) : (
            <span>新对话</span>
          )}
        </div>
        <span
          className="demo-mark"
          title="所有回复、附件与工具操作均为浏览器内演示，未连接模型服务。"
        >
          本地演示
        </span>
        {chat && (
          <CdsButton
            variant="ghost"
            size="icon"
            aria-label="删除当前对话"
            onClick={() => setDeleteId(chat.id)}
          >
            <Trash2 size={16} />
          </CdsButton>
        )}
      </header>
      {rename && (
        <form
          className="rename"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim())
              update(active!, (c) => ({
                ...c,
                title: name.trim().slice(0, 80),
              }));
            setRename(false);
          }}
        >
          <input
            aria-label="对话名称"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <CdsButton type="submit">保存</CdsButton>
          <CdsButton
            type="button"
            variant="ghost"
            onClick={() => setRename(false)}
          >
            取消
          </CdsButton>
        </form>
      )}
      {messages.length ? (
        <div
          className="message-scroll"
          ref={scroll}
          onScroll={() => {
            const e = scroll.current!;
            follow.current =
              e.scrollHeight - e.scrollTop - e.clientHeight < 100;
          }}
        >
          <div className="messages">
            {messages.map((m) => (
              <div key={m.id} className="turn">
                {m.role === "user" ? (
                  <UserMessageBubble
                    text={m.text}
                    time=""
                    attachment={m.attachment}
                  />
                ) : (
                  <>
                    <div
                      onClick={(e) => {
                        const title = (e.target as HTMLElement).closest(
                          "button",
                        )?.title;
                        if (
                          title === "Good response" ||
                          title === "Bad response"
                        ) {
                          update(active!, (c) => ({
                            ...c,
                            messages: c.messages.map((x) =>
                              x.id === m.id ? { ...x, feedback: title } : x,
                            ),
                          }));
                          setNotice("反馈已保存在此浏览器。");
                        }
                      }}
                    >
                      <AssistantMessageBubble
                        text={m.text}
                        modelName={
                          (CLAUDE_MODELS.find(
                            (x) => x.id === m.model || x.name === m.model,
                          )?.name || "Claude").replace(/^Claude\s*/, "")
                        }
                        time=""
                        isThinkingLive={
                          busy && m.id === running.current?.msg && m.thinking
                        }
                        thinkingSteps={
                          m.thinking
                            ? ["本地演示：整理问题与回复结构。"]
                            : undefined
                        }
                        thinkingTime="演示"
                        artifact={
                          m.tool === "allowed"
                            ? {
                                title: "welcome.html",
                                version: "v1",
                                desc: "查看文件修改",
                              }
                            : null
                        }
                        onOpenArtifact={() => setArtifact(true)}
                      />
                    </div>
                    {m.stopped && <p className="turn-status">已停止</p>}
                    {m.feedback && (
                      <p className="turn-status">
                        {m.feedback === "Good response" ? "已赞同" : "已反馈"}
                      </p>
                    )}
                    {m.tool === "pending" && (
                      <McpToolDecisionCard
                        toolCall={{
                          id: m.id,
                          toolName: "编辑示例文件",
                          inputParams: {
                            file: "welcome.html",
                            change: "精简标题与页面结构",
                          },
                          resultOutput: "示例差异已生成，未修改本地文件。",
                        }}
                        onVerdict={(v) => verdict(m.id, v)}
                      />
                    )}
                    {m.tool && m.tool !== "pending" && (
                      <div className="tool-result">
                        <FileCode size={15} />
                        <span>
                          {m.tool === "allowed"
                            ? "示例修改已确认"
                            : "已拒绝文件修改"}
                        </span>
                        {m.tool === "allowed" && (
                          <button onClick={() => setArtifact(true)}>
                            查看差异 <ArrowUpRight size={14} />
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
            <div ref={end} />
          </div>
        </div>
      ) : (
        <div className="welcome">
          <span className="spark" aria-hidden="true">
            {<UiIcon name="spark" size={48} />}
          </span>
          <h1>今天，一起做点什么？</h1>
        </div>
      )}
      <div className="compose-area">
        <fieldset disabled={busy || pending}>
          <ChatComposer
            key={active || "new"}
            initialModel={chat?.lastModel}
            placeholder={pending ? "先确认上方的工具请求" : "你想聊些什么？"}
            onSendMessage={send}
          />
        </fieldset>
        {busy ? (
          <CdsButton
            variant="secondary"
            size="sm"
            className="stop"
            onClick={stop}
          >
            <Square size={11} />
            停止回复
          </CdsButton>
        ) : pending ? (
          <button
            className="pending-link"
            onClick={() => {
              follow.current = true;
              end.current?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            查看待确认请求 ↑
          </button>
        ) : null}
        {!messages.length && (
          <div className="starters">
            <button onClick={() => send("帮我梳理一个想法")}>
              梳理想法 <ArrowUpRight size={13} />
            </button>
            <button onClick={() => send("帮我修改一个 HTML 页面")}>
              修改页面 <ArrowUpRight size={13} />
            </button>
            <button onClick={() => send("帮我润色一段文字")}>
              润色文字 <ArrowUpRight size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
  const artifactPane = (
    <aside className="artifact">
      <header>
        <FileCode size={17} />
        <strong>welcome.html</strong>
        <CdsButton
          variant="ghost"
          size="icon"
          aria-label="下载示例文件"
          onClick={download}
        >
          <Download size={16} />
        </CdsButton>
        <CdsButton
          variant="ghost"
          size="icon"
          aria-label="关闭文件"
          onClick={() => setArtifact(false)}
        >
          <X size={18} />
        </CdsButton>
      </header>
      <div className="artifact-body">
        <StreamingDiffViewer
          filename="welcome.html"
          language="html"
          rawDiff={DIFF}
        />
        <div className="preview-label">预览</div>
        <iframe title="文件预览" sandbox="" srcDoc={FILE} />
      </div>
    </aside>
  );
  return (
    <div className="app-shell">
      {sidebar && (
        <>
          <button
            className="sidebar-backdrop"
            aria-label="关闭侧栏"
            onClick={() => setSidebar(false)}
          />
          <aside className="sidebar">
            <header>
              <a className="wordmark" href="/">
                云上克劳德
              </a>
              <CdsButton
                variant="ghost"
                size="icon"
                aria-label="收起侧栏"
                onClick={() => setSidebar(false)}
              >
                <PanelLeft size={18} />
              </CdsButton>
            </header>
            <SegmentedControl
              className="mode-switch"
              tabs={[
                {
                  id: "chat",
                  label: "聊天",
                  icon: <MessageSquare size={16} />,
                },
                {
                  id: "cowork",
                  label: "Cowork",
                  icon: <Briefcase size={16} />,
                },
              ]}
              value={mode}
              onChange={(v) => {
                stop();
                setMode(String(v));
                setQuery("");
                setSearch(false);
              }}
            />
            <button
              className="nav-row new-chat"
              onClick={() =>
                mode === "chat" ? choose(null) : setActiveTask(null)
              }
            >
              <Plus size={18} />
              {mode === "chat" ? "新对话" : "新任务"}
            </button>
            <button className="nav-row" onClick={() => setSearch(!search)}>
              <Search size={17} />
              {mode === "chat" ? "搜索对话" : "搜索任务"}
            </button>
            {search && (
              <input
                className="search-field"
                aria-label={mode === "chat" ? "搜索对话内容" : "搜索任务内容"}
                placeholder="搜索名称或内容"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            )}
            <div className="recents-label">
              {mode === "chat" ? "最近对话" : "最近任务"}
            </div>
            <div className="sessions">
              {(mode === "chat" ? [...chats] : [])
                .sort((a, b) => Number(b.pinned) - Number(a.pinned))
                .filter((c) =>
                  (c.title + " " + c.messages.map((m) => m.text).join(" "))
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .map((c) => (
                  <div
                    className={"session " + (c.id === active ? "selected" : "")}
                    key={c.id}
                  >
                    <button
                      className="session-title"
                      onClick={() => choose(c.id)}
                    >
                      {c.pinned ? (
                        <Pin size={13} />
                      ) : (
                        <MessageSquare size={14} />
                      )}
                      <span>{c.title}</span>
                    </button>
                    <button
                      className="session-action"
                      aria-label={"固定 " + c.title}
                      onClick={() =>
                        update(c.id, (x) => ({ ...x, pinned: !x.pinned }))
                      }
                    >
                      <Pin size={12} />
                    </button>
                    <button
                      className="session-action"
                      aria-label={"删除 " + c.title}
                      onClick={() => setDeleteId(c.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              {mode === "cowork" &&
                tasks
                  .filter((t) =>
                    (t.title + " " + t.prompt)
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((t) => (
                    <button
                      key={t.id}
                      className={
                        "session task-session " +
                        (t.id === activeTask ? "selected" : "")
                      }
                      onClick={() => {
                        setActiveTask(t.id);
                        if (innerWidth < 800) setSidebar(false);
                      }}
                    >
                      <Briefcase size={15} />
                      <span>{t.title}</span>
                      <i className={"task-dot " + t.status} />
                    </button>
                  ))}
              {mode === "chat" && !chats.length && (
                <p className="empty-history">你的对话会保存在这里</p>
              )}
            </div>
            <footer>
              <div className="account-anchor">
                {accountMenu && (
                  <div className="account-menu">
                    <strong>
                      云上克劳德 <span>Max</span>
                    </strong>
                    <p>本地界面演示</p>
                    <a href="/account">
                      <Gear size={16} />
                      账户与用量 <ArrowUpRight size={14} />
                    </a>
                    <button onClick={() => setDark(!dark)}>
                      {dark ? <Sun size={16} /> : <Moon size={16} />}{" "}
                      {dark ? "切换浅色" : "切换深色"}
                    </button>
                    <a href="/claude-ui/index.html">
                      <FileCode size={16} />
                      组件原版
                    </a>
                  </div>
                )}
                <button
                  className="nav-row account-trigger"
                  aria-expanded={accountMenu}
                  onClick={() => setAccountMenu(!accountMenu)}
                >
                  <span className="avatar">云</span>
                  <span>
                    <b>云上克劳德</b>
                    <small>Max</small>
                  </span>
                  <UiIcon name="caret" size={14} />
                </button>
              </div>
              <div className="sidebar-bottom">
                <a href="/" aria-label="返回官网">
                  <Home size={16} />
                </a>
                <button
                  onClick={() => setDark(!dark)}
                  aria-label={dark ? "浅色模式" : "深色模式"}
                >
                  {dark ? <Sun size={16} /> : <Moon size={16} />}
                </button>
              </div>
            </footer>
          </aside>
        </>
      )}
      <main>
        <div className="mode-page" hidden={mode !== "chat"}>
          {
            <ArtifactsSplitPaneResizer
              leftPane={chatPane}
              rightPane={artifact && !small ? artifactPane : null}
              initialSplitRatio={0.53}
              minLeftWidth={340}
              minRightWidth={340}
              className={
                "host-split " + (!artifact || small ? "no-artifact" : "")
              }
            />
          }
          {artifact && small && (
            <div className="artifact-overlay">{artifactPane}</div>
          )}
        </div>
        <div className="mode-page" hidden={mode !== "cowork"}>
          <Cowork
            tasks={tasks}
            setTasks={setTasks}
            active={activeTask}
            onSelect={setActiveTask}
            sidebar={sidebar}
            onOpenSidebar={() => setSidebar(true)}
          />
        </div>
      </main>
      <ConfirmationDialog
        isOpen={!!deleteId}
        title="删除这段对话？"
        description="删除后，将无法在此浏览器恢复。"
        confirmLabel="删除对话"
        cancelLabel="取消"
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (active === deleteId) choose(null);
          setChats((prev) => prev.filter((c) => c.id !== deleteId));
          setDeleteId(null);
        }}
      />
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
