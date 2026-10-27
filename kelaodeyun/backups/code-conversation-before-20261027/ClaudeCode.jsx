import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  FileCode2,
  FileText,
  Files,
  Folder,
  FolderOpen,
  GitCompareArrows,
  LoaderCircle,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RefreshCw,
  Search,
  Save,
  ShieldCheck,
  Square,
  Terminal,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./claude-code.css";

const formatOutput = (value) =>
  typeof value === "string"
    ? value
    : value == null
      ? ""
      : JSON.stringify(value, null, 2);
const isActive = (state) => state === "running" || state === "waiting";
function projectRelative(value, projectId) {
  if (typeof value !== "string") return "";
  const path = value.replaceAll("\\", "/");
  const marker = projectId ? `/${projectId}/` : "";
  if (marker && path.includes(marker))
    return path.slice(path.indexOf(marker) + marker.length);
  return path.replace(/^.*\/(?:demo-)?code-workspaces\/[^/]+\/[^/]+\//, "");
}

function ToolInput({ name, input = {}, projectId }) {
  const path = projectRelative(input.file_path, projectId);
  if (name === "Write" || name === "Edit")
    return (
      <div className="kc-operation-preview">
        <div className="kc-operation-file">
          <FileCode2 size={13} />
          <code>{path || "文件"}</code>
        </div>
        {name === "Write" ? (
          <pre className="kc-operation-code">{input.content || ""}</pre>
        ) : (
          <>
            <div className="kc-operation-label">原内容</div>
            <pre className="kc-operation-code is-before">
              {input.old_string || ""}
            </pre>
            <div className="kc-operation-label">替换为</div>
            <pre className="kc-operation-code is-after">
              {input.new_string || ""}
            </pre>
            {input.replace_all && (
              <div className="kc-operation-label">替换所有匹配内容</div>
            )}
          </>
        )}
      </div>
    );
  if (name === "Bash")
    return (
      <div className="kc-operation-preview">
        {input.description && (
          <p className="kc-operation-description">{input.description}</p>
        )}
        <pre className="kc-operation-command">
          <span aria-hidden="true">$ </span>
          {input.command || ""}
        </pre>
      </div>
    );
  if (name === "Read")
    return (
      <div className="kc-operation-preview">
        <div className="kc-operation-file">
          <FileText size={13} />
          <code>{path}</code>
        </div>
        {(input.offset || input.limit) && (
          <p className="kc-operation-description">
            {input.offset ? `从第 ${input.offset} 行开始` : "从文件开头开始"}
            {input.limit ? `，读取 ${input.limit} 行` : ""}
          </p>
        )}
      </div>
    );
  return <pre>{formatOutput(input)}</pre>;
}
const stateNames = {
  running: "正在执行",
  waiting: "等待确认",
  complete: "已完成",
  stopped: "已停止",
  error: "执行未完成",
  idle: "就绪",
};
const STORAGE_KEY = "kelaode-code:v1:";
function readSaved(userId) {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY + userId) || "{}");
  } catch {
    return {};
  }
}
function IconButton({ label, children, ...props }) {
  return (
    <button
      type="button"
      className="kc-icon-button"
      title={label}
      aria-label={label}
      {...props}
    >
      {children}
    </button>
  );
}
function Empty({ icon: Icon = Files, children }) {
  return (
    <div className="kc-empty">
      <Icon size={25} strokeWidth={1.4} />
      <p>{children}</p>
    </div>
  );
}

function timelineFrom(events) {
  const items = [],
    tools = new Map();
  let text = null;
  for (const event of events) {
    const data = event.data || {};
    if (event.type === "user") {
      items.push({ key: event.seq, kind: "user", text: data.text });
      text = null;
    }
    if (event.type === "text") {
      if (!text) {
        text = { key: event.seq, kind: "text", text: "" };
        items.push(text);
      }
      text.text += data.text || "";
    }
    if (event.type === "tool") {
      text = null;
      const key = data.id || String(event.seq);
      if (tools.has(key)) Object.assign(tools.get(key), data);
      else {
        const item = { key: event.seq, kind: "tool", ...data };
        items.push(item);
        tools.set(key, item);
      }
    }
    if (
      event.type === "result" &&
      data.text &&
      !items.some((item) => item.kind === "text" && item.text === data.text)
    ) {
      items.push({ key: event.seq, kind: "text", text: data.text });
      text = null;
    }
    if (event.type === "error") {
      items.push({
        key: event.seq,
        kind: "error",
        text: data.message || "执行未完成，请重试。",
      });
      text = null;
    }
    if (
      event.type === "status" &&
      ["stopped", "error", "complete"].includes(data.state)
    )
      for (const tool of tools.values())
        if (tool.status !== "complete")
          tool.status = data.state === "stopped" ? "stopped" : "interrupted";
  }
  return items;
}

const ToolCard = React.memo(function ToolCard({ item, projectId }) {
  const bash = item.name === "Bash",
    done = item.status === "complete",
    failed = !!item.isError,
    stopped = item.status === "stopped" || item.status === "interrupted";
  const label = bash
    ? item.input?.description || "运行命令"
    : {
        Read: "读取文件",
        Write: "写入文件",
        Edit: "修改文件",
        Glob: "查找文件",
        Grep: "搜索内容",
        Task: "运行子任务",
        TodoWrite: "更新任务",
      }[item.name] || item.name;
  const detail =
    item.input?.command ||
    projectRelative(item.input?.file_path, projectId) ||
    item.input?.pattern ||
    "";
  return (
    <details
      className={
        "kc-tool-card " +
        (failed
          ? "is-failed"
          : stopped
            ? "is-stopped"
            : done
              ? "is-complete"
              : "is-running")
      }
    >
      <summary>
        <span className="kc-tool-state">
          {failed ? (
            <X size={14} />
          ) : stopped ? (
            <Square size={11} />
          ) : done ? (
            <Check size={14} />
          ) : (
            <LoaderCircle className="kc-spin" size={14} />
          )}
        </span>
        <span className="kc-tool-label">{label}</span>
        <code>{detail}</code>
        {(failed || stopped) && (
          <span className="kc-tool-status-label">
            {failed
              ? "未成功"
              : item.status === "stopped"
                ? "已停止"
                : "已中断"}
          </span>
        )}
        <ChevronRight size={13} className="kc-disclosure" />
      </summary>
      <div className="kc-tool-detail">
        <div className="kc-tool-name">{item.name}</div>
        <ToolInput name={item.name} input={item.input} projectId={projectId} />
        {item.output != null && (
          <>
            <div className="kc-tool-name">输出</div>
            <pre>{formatOutput(item.output)}</pre>
          </>
        )}
      </div>
    </details>
  );
});

function Approval({ approval, onAnswer, busy, projectId }) {
  const questions = approval.questions || approval.input?.questions || [];
  const [answers, setAnswers] = useState({});
  const isQuestion =
    approval.tool === "AskUserQuestion" || questions.length > 0;
  const update = (question, value, multi) =>
    setAnswers((old) => {
      if (!multi) return { ...old, [question]: value };
      const choices = Array.isArray(old[question]) ? old[question] : [];
      return {
        ...old,
        [question]: choices.includes(value)
          ? choices.filter((entry) => entry !== value)
          : [...choices, value],
      };
    });
  const complete =
    !isQuestion ||
    questions.every((question) => {
      const value = answers[question.question];
      return Array.isArray(value)
        ? value.length > 0
        : typeof value === "string" && value.trim();
    });
  return (
    <section
      className="kc-approval"
      aria-label={isQuestion ? "Claude 的问题" : "工具执行确认"}
    >
      <div className="kc-approval-title">
        <ShieldCheck size={17} />
        <strong>{isQuestion ? "需要你的选择" : "允许这次操作？"}</strong>
      </div>
      {isQuestion ? (
        questions.map((question, index) => (
          <fieldset key={question.question || index}>
            <legend>{question.question}</legend>
            <div className="kc-question-options">
              {(question.options || []).map((option) => (
                <label key={option.label}>
                  <input
                    type={question.multiSelect ? "checkbox" : "radio"}
                    name={approval.id + ":" + index}
                    checked={
                      Array.isArray(answers[question.question])
                        ? answers[question.question].includes(option.label)
                        : answers[question.question] === option.label
                    }
                    onChange={() =>
                      update(
                        question.question,
                        option.label,
                        question.multiSelect,
                      )
                    }
                  />
                  <span>
                    {option.label}
                    {option.description && <small>{option.description}</small>}
                  </span>
                </label>
              ))}
            </div>
            <input
              className="kc-free-answer"
              aria-label={"自定义回答：" + question.question}
              placeholder="或输入你的回答"
              value={
                typeof answers[question.question] === "string" &&
                !question.options?.some(
                  (option) => option.label === answers[question.question],
                )
                  ? answers[question.question]
                  : ""
              }
              onChange={(e) =>
                setAnswers((old) => ({
                  ...old,
                  [question.question]: e.target.value,
                }))
              }
            />
          </fieldset>
        ))
      ) : (
        <>
          <ToolInput
            name={approval.tool}
            input={approval.input}
            projectId={projectId}
          />
        </>
      )}
      <div className="kc-approval-actions">
        <button
          type="button"
          className="kc-button"
          disabled={busy}
          onClick={() => onAnswer(false)}
        >
          拒绝
        </button>
        <button
          type="button"
          className="kc-button kc-button-primary"
          disabled={busy || !complete}
          onClick={() =>
            onAnswer(
              true,
              Object.fromEntries(
                Object.entries(answers).map(([key, value]) => [
                  key,
                  Array.isArray(value) ? value.join(", ") : value,
                ]),
              ),
            )
          }
        >
          {busy ? (
            <LoaderCircle className="kc-spin" size={14} />
          ) : (
            <Check size={14} />
          )}
          {isQuestion ? "回答并继续" : "允许一次"}
        </button>
      </div>
    </section>
  );
}

function fileTree(files) {
  const root = { dirs: new Map(), files: [] };
  for (const file of files) {
    const parts = file.path.split("/");
    let node = root;
    for (const part of parts.slice(0, -1)) {
      if (!node.dirs.has(part))
        node.dirs.set(part, { dirs: new Map(), files: [] });
      node = node.dirs.get(part);
    }
    node.files.push(file);
  }
  return root;
}
const Tree = React.memo(function Tree({ node, onOpen, selected, depth = 0 }) {
  return (
    <>
      {Array.from(node.dirs.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, child]) => (
          <details className="kc-directory" key={name} open>
            <summary style={{ paddingLeft: 12 + depth * 13 }}>
              <ChevronRight size={12} className="kc-disclosure" />
              <Folder size={14} />
              <span>{name}</span>
            </summary>
            <Tree
              node={child}
              selected={selected}
              onOpen={onOpen}
              depth={depth + 1}
            />
          </details>
        ))}
      {node.files
        .sort((a, b) => a.path.localeCompare(b.path))
        .map((file) => (
          <button
            type="button"
            key={file.path}
            className={
              "kc-file " + (selected === file.path ? "is-selected" : "")
            }
            style={{ paddingLeft: 25 + depth * 13 }}
            onClick={() => onOpen(file.path)}
            title={file.path}
          >
            {/\.(html|css|jsx?|tsx?|json|mjs)$/.test(file.path) ? (
              <FileCode2 size={14} />
            ) : (
              <FileText size={14} />
            )}
            <span>{file.path.split("/").at(-1)}</span>
          </button>
        ))}
    </>
  );
});

function diffLines(before = "", after = "") {
  const a = before == null ? [] : before.split("\n"),
    b = after == null ? [] : after.split("\n");
  let start = 0,
    end = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  while (
    end < a.length - start &&
    end < b.length - start &&
    a[a.length - 1 - end] === b[b.length - 1 - end]
  )
    end++;
  return [
    ...a
      .slice(0, start)
      .map((text, i) => ({ text, kind: "same", old: i + 1, next: i + 1 })),
    ...a
      .slice(start, a.length - end)
      .map((text, i) => ({ text, kind: "remove", old: start + i + 1 })),
    ...b
      .slice(start, b.length - end)
      .map((text, i) => ({ text, kind: "add", next: start + i + 1 })),
    ...b.slice(b.length - end).map((text, i) => ({
      text,
      kind: "same",
      old: a.length - end + i + 1,
      next: b.length - end + i + 1,
    })),
  ];
}
const Changes = React.memo(function Changes({ files, onOpen }) {
  return files.length ? (
    <div className="kc-changes">
      {files.map((file) => (
        <details key={file.path} open>
          <summary>
            <GitCompareArrows size={14} />
            <span>{file.path}</span>
            <span className="kc-file-status">
              {{ added: "新增", deleted: "删除", modified: "修改" }[
                file.status
              ] || "修改"}
            </span>
          </summary>
          <div className="kc-diff">
            {diffLines(file.before, file.after).map((line, index) => (
              <div className={"kc-diff-line " + line.kind} key={index}>
                <span>{line.old}</span>
                <span>{line.next}</span>
                <b>
                  {line.kind === "add"
                    ? "+"
                    : line.kind === "remove"
                      ? "−"
                      : " "}
                </b>
                <code>{line.text || " "}</code>
              </div>
            ))}
          </div>
          {file.status !== "deleted" && (
            <button
              type="button"
              className="kc-change-open"
              onClick={() => onOpen(file.path)}
            >
              打开文件 <ChevronRight size={13} />
            </button>
          )}
        </details>
      ))}
    </div>
  ) : (
    <Empty icon={GitCompareArrows}>还没有文件变更</Empty>
  );
});

export default function ClaudeCode({ config, api }) {
  const saved = useMemo(() => readSaved(config.user.id), [config.user.id]);
  const [projects, setProjects] = useState([]),
    [projectId, setProjectId] = useState(""),
    [sessions, setSessions] = useState([]),
    [sessionId, setSessionId] = useState("");
  const [runtime, setRuntime] = useState(null),
    [files, setFiles] = useState([]),
    [events, setEvents] = useState([]),
    [runState, setRunState] = useState("idle"),
    [error, setError] = useState("");
  const [draft, setDraft] = useState(""),
    [model, setModel] = useState("sonnet"),
    [mode, setMode] = useState("default"),
    [sending, setSending] = useState(false),
    [answering, setAnswering] = useState(false);
  const [file, setFile] = useState(null),
    [content, setContent] = useState(""),
    [fileBusy, setFileBusy] = useState(false),
    [saving, setSaving] = useState(false),
    [fileNotice, setFileNotice] = useState("");
  const [changes, setChanges] = useState([]),
    [rightTab, setRightTab] = useState("files"),
    [rightOpen, setRightOpen] = useState(false),
    [leftOpen, setLeftOpen] = useState(() => window.innerWidth > 700),
    [mobileTab, setMobileTab] = useState("chat");
  const [searchOpen, setSearchOpen] = useState(false),
    [taskSearch, setTaskSearch] = useState(""),
    [projectOpen, setProjectOpen] = useState(false);
  const [modal, setModal] = useState(false),
    [projectName, setProjectName] = useState(""),
    [creating, setCreating] = useState(false),
    [loading, setLoading] = useState(true),
    [streamAttempt, setStreamAttempt] = useState(0),
    [connection, setConnection] = useState("connected"),
    [resolvedApprovals, setResolvedApprovals] = useState(new Set());
  const projectRef = useRef(""),
    sessionRef = useRef(""),
    streamRef = useRef(null),
    lastSeq = useRef(0),
    fileRequest = useRef(0),
    sessionRequest = useRef(0),
    endRef = useRef(null),
    editorRef = useRef(null),
    numbersRef = useRef(null),
    draftRef = useRef(null),
    stateRef = useRef("idle"),
    retryTimer = useRef(null),
    modalRef = useRef(null),
    followOutput = useRef(true),
    mounted = useRef(true);
  const dirty = !!file && file.content !== content;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const active = isActive(runState),
    selectedProject = projects.find((project) => project.id === projectId),
    selectedSession = sessions.find((session) => session.id === sessionId);
  const tree = useMemo(() => fileTree(files), [files]),
    timeline = useMemo(() => timelineFrom(events), [events]);
  const terminals = useMemo(
    () =>
      timeline.filter((item) => item.kind === "tool" && item.name === "Bash"),
    [timeline],
  );
  const pendingApproval = useMemo(() => {
    if (runState !== "waiting") return null;
    const resolved = new Set(resolvedApprovals);
    for (const event of events)
      if (event.type === "approval_resolved") resolved.add(event.data?.id);
    return (
      [...events]
        .reverse()
        .find(
          (event) => event.type === "approval" && !resolved.has(event.data?.id),
        )?.data || null
    );
  }, [events, runState, resolvedApprovals]);

  const remember = useCallback(
    (project, session) => {
      try {
        localStorage.setItem(
          STORAGE_KEY + config.user.id,
          JSON.stringify({ project, session }),
        );
      } catch {
        /* Storage can be disabled. */
      }
    },
    [config.user.id],
  );
  const clearStream = useCallback(() => {
    streamRef.current?.close();
    streamRef.current = null;
    clearTimeout(retryTimer.current);
  }, []);
  const setState = useCallback((value) => {
    stateRef.current = value;
    setRunState(value);
  }, []);
  const refreshFiles = useCallback(
    async (project = projectRef.current) => {
      if (!project) return;
      const [treeResult, changesResult] = await Promise.all([
        api(`/code/projects/${project}/tree`),
        api(`/code/projects/${project}/changes`),
      ]);
      if (projectRef.current !== project || !mounted.current) return;
      setFiles(treeResult.files || []);
      setChanges(changesResult.files || []);
    },
    [api],
  );
  const reloadSessions = useCallback(
    async (project = projectRef.current) => {
      if (!project) return [];
      const data = await api(`/code/projects/${project}/sessions`);
      if (projectRef.current === project && mounted.current)
        setSessions(data.sessions || []);
      return data.sessions || [];
    },
    [api],
  );
  const openSession = useCallback(
    async (id, project = projectRef.current) => {
      const ticket = ++sessionRequest.current;
      clearStream();
      sessionRef.current = id;
      setSessionId(id);
      setEvents([]);
      followOutput.current = true;
      lastSeq.current = 0;
      setState("idle");
      setResolvedApprovals(new Set());
      setConnection("connected");
      remember(project, id);
      if (!id) return;
      try {
        const data = await api(`/code/sessions/${id}`);
        if (
          ticket !== sessionRequest.current ||
          projectRef.current !== project ||
          !mounted.current
        )
          return;
        const history = data.events || [];
        setEvents(history);
        lastSeq.current = history.reduce(
          (max, event) => Math.max(max, event.seq || 0),
          0,
        );
        const latestStatus = [...history]
          .reverse()
          .find((event) => event.type === "status")?.data?.state;
        setState(
          data.session?.state || data.session?.status || latestStatus || "idle",
        );
        setStreamAttempt((attempt) => attempt + 1);
      } catch (e) {
        if (ticket === sessionRequest.current) setError(e.message);
      }
    },
    [api, clearStream, remember, setState],
  );
  const selectProject = useCallback(
    async (id, preferredSession) => {
      if (
        dirtyRef.current &&
        !window.confirm("当前文件尚未保存。放弃修改并切换项目？")
      )
        return;
      clearStream();
      projectRef.current = id;
      setProjectId(id);
      fileRequest.current++;
      setFile(null);
      setContent("");
      setFiles([]);
      setChanges([]);
      setSessions([]);
      setError("");
      setFileNotice("");
      sessionRequest.current++;
      sessionRef.current = "";
      setSessionId("");
      setEvents([]);
      lastSeq.current = 0;
      setState("idle");
      remember(id, "");
      if (!id) return;
      try {
        const [, list] = await Promise.all([
          refreshFiles(id),
          reloadSessions(id),
        ]);
        if (projectRef.current !== id || !mounted.current) return;
        const next =
          list.find((session) => session.id === preferredSession)?.id ||
          list[0]?.id ||
          "";
        if (next) await openSession(next, id);
      } catch (e) {
        if (projectRef.current === id) setError(e.message);
      }
    },
    [
      clearStream,
      refreshFiles,
      reloadSessions,
      openSession,
      remember,
      setState,
    ],
  );

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    Promise.allSettled([api("/code/status"), api("/code/projects")]).then(
      async ([statusResult, projectsResult]) => {
        if (cancelled) return;
        if (statusResult.status === "fulfilled") setRuntime(statusResult.value);
        else setError(statusResult.reason.message);
        if (projectsResult.status === "fulfilled") {
          const list = projectsResult.value.projects || [];
          setProjects(list);
          const selected =
            list.find((project) => project.id === saved.project)?.id ||
            list[0]?.id;
          if (selected) await selectProject(selected, saved.session);
        } else setError(projectsResult.reason.message);
        if (!cancelled) setLoading(false);
      },
    );
    return () => {
      cancelled = true;
      mounted.current = false;
      clearStream();
    };
  }, [api, saved, selectProject, clearStream]);

  useEffect(() => {
    if (!sessionId || !isActive(runState)) return;
    clearStream();
    let disposed = false;
    const connect = () => {
      if (disposed || sessionRef.current !== sessionId) return;
      const source = new EventSource(
        `/api/code/sessions/${encodeURIComponent(sessionId)}/events?after=${lastSeq.current}`,
      );
      streamRef.current = source;
      source.onopen = () => {
        if (!disposed) setConnection("connected");
      };
      source.addEventListener("code", (message) => {
        if (disposed || sessionRef.current !== sessionId) return;
        let event;
        try {
          event = JSON.parse(message.data);
        } catch {
          return;
        }
        if (
          !event ||
          !Number.isFinite(event.seq) ||
          event.seq <= lastSeq.current
        )
          return;
        lastSeq.current = event.seq;
        setEvents((old) => [...old, event]);
        if (event.type === "status") setState(event.data.state);
        if (event.type === "done") {
          source.close();
          setConnection("connected");
          if (isActive(stateRef.current)) setState("complete");
          refreshFiles().catch((e) => setError(e.message));
          reloadSessions().catch((e) => setError(e.message));
          setFileNotice(
            (notice) => notice || "项目已更新，可重新读取当前文件。",
          );
        }
      });
      source.onerror = () => {
        source.close();
        if (!disposed && isActive(stateRef.current)) {
          setConnection("reconnecting");
          retryTimer.current = setTimeout(connect, 1800);
        }
      };
    };
    connect();
    return () => {
      disposed = true;
      clearStream();
    };
    // Only reconnect on a new session/run. State changes arrive through this stream.
  }, [
    sessionId,
    streamAttempt,
    clearStream,
    refreshFiles,
    reloadSessions,
    setState,
  ]);

  useEffect(() => {
    const handler = (event) => {
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);
  useEffect(() => {
    if (followOutput.current)
      endRef.current?.scrollIntoView({ behavior: "instant", block: "end" });
  }, [events.length, pendingApproval]);
  useEffect(() => {
    if (!modal) return;
    const handler = (event) => {
      if (event.key === "Escape") setModal(false);
      if (event.key !== "Tab") return;
      const elements = Array.from(
        modalRef.current?.querySelectorAll(
          'button:not(:disabled),input:not(:disabled),[tabindex="0"]',
        ) || [],
      );
      const first = elements[0],
        last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modal]);

  async function createProject(event) {
    event.preventDefault();
    if (!projectName.trim() || creating) return;
    if (dirty && !window.confirm("当前文件尚未保存。放弃修改并新建项目？"))
      return;
    setCreating(true);
    setError("");
    try {
      const data = await api("/code/projects", { name: projectName.trim() });
      setProjects((old) => [data.project, ...old]);
      setModal(false);
      setProjectName("");
      dirtyRef.current = false;
      await selectProject(data.project.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }
  function createSession() {
    if (sending) return;
    openSession("");
    setDraft("");
    setError("");
    setMobileTab("chat");
    setRightOpen(false);
    if (window.innerWidth <= 700) setLeftOpen(false);
    draftRef.current?.focus();
  }
  async function send(event) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || active || sending) return;
    if (!projectId) {
      setModal(true);
      return;
    }
    if (
      dirty &&
      !window.confirm("文件尚未保存。继续执行将使用服务器上的版本，是否继续？")
    )
      return;
    setSending(true);
    setError("");
    const project = projectId;
    try {
      let id = sessionId;
      if (!id) {
        const data = await api(`/code/projects/${project}/sessions`, {});
        if (projectRef.current !== project) return;
        id = data.session.id;
        setSessions((old) => [data.session, ...old]);
        await openSession(id, project);
      }
      await api(`/code/sessions/${id}/run`, { prompt: text, model, mode });
      if (sessionRef.current !== id) return;
      followOutput.current = true;
      setDraft("");
      setState("running");
      setResolvedApprovals(new Set());
      setStreamAttempt((attempt) => attempt + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }
  async function stop() {
    try {
      await api(`/code/sessions/${sessionId}/stop`, {});
    } catch (e) {
      setError(e.message);
    }
  }
  async function answer(allow, answers) {
    if (!pendingApproval || answering) return;
    setAnswering(true);
    try {
      await api(`/code/sessions/${sessionId}/approval`, {
        id: pendingApproval.id,
        allow,
        ...(answers ? { answers } : {}),
      });
      setResolvedApprovals((old) => new Set([...old, pendingApproval.id]));
    } catch (e) {
      setError(e.message);
    } finally {
      setAnswering(false);
    }
  }
  const openFile = useCallback(
    async (path, force = false) => {
      if (
        !force &&
        dirty &&
        !window.confirm("当前文件尚未保存。放弃修改并打开文件？")
      )
        return;
      const ticket = ++fileRequest.current,
        project = projectRef.current;
      setFileBusy(true);
      setError("");
      try {
        const data = await api(
          `/code/projects/${project}/file?path=${encodeURIComponent(path)}`,
        );
        if (ticket !== fileRequest.current || projectRef.current !== project)
          return;
        setFile(data);
        setContent(data.content || "");
        setFileNotice("");
        setRightTab("files");
        setRightOpen(true);
        setMobileTab("workspace");
      } catch (e) {
        if (ticket === fileRequest.current) setError(e.message);
      } finally {
        if (ticket === fileRequest.current) setFileBusy(false);
      }
    },
    [api, dirty],
  );
  const saveFile = useCallback(async () => {
    if (!file || !dirty || saving || active) return;
    const project = projectId,
      path = file.path,
      edited = content;
    setSaving(true);
    setError("");
    try {
      const data = await api(
        `/code/projects/${project}/file`,
        { path, content: edited, version: file.version },
        "PUT",
      );
      if (projectRef.current !== project) return;
      setFile((old) =>
        old?.path === path ? { ...old, ...data, content: edited } : old,
      );
      setFileNotice("已保存");
      await refreshFiles(project);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }, [api, file, dirty, saving, active, projectId, content, refreshFiles]);
  useEffect(() => {
    const handler = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveFile();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saveFile]);

  return (
    <div
      className={
        "kc-app " +
        (!leftOpen ? "kc-left-closed " : "") +
        (!rightOpen ? "kc-right-closed " : "") +
        "kc-mobile-" +
        mobileTab +
        (!timeline.length && !active ? " kc-new" : " kc-has-messages")
      }
    >
      {leftOpen && (
        <button
          className="kc-side-backdrop"
          aria-label="关闭侧栏"
          onClick={() => setLeftOpen(false)}
        />
      )}
      <aside className="kc-sidebar">
        <header className="kc-sidebar-brand">
          <IconButton label="收起侧栏" onClick={() => setLeftOpen(false)}>
            <PanelLeftClose size={17} />
          </IconButton>
          <a className="kc-wordmark" href="/">
            kelaodeyun
          </a>
        </header>
        <nav className="kc-primary-nav">
          <button type="button" onClick={createSession} disabled={sending}>
            <Plus size={18} />
            新任务
          </button>
          <button type="button" onClick={() => setSearchOpen(!searchOpen)}>
            <Search size={18} />
            搜索任务
          </button>
          <button
            type="button"
            onClick={() => setProjectOpen(!projectOpen)}
            aria-expanded={projectOpen}
          >
            <Folder size={18} />
            项目
          </button>
          <a className="is-selected" href="/code">
            <Code2 size={18} />
            Code
          </a>
        </nav>
        {searchOpen && (
          <div className="kc-task-search">
            <Search size={14} />
            <input
              autoFocus
              aria-label="搜索已保存任务"
              placeholder="搜索任务"
              value={taskSearch}
              onChange={(event) => setTaskSearch(event.target.value)}
            />
            <IconButton
              label="关闭搜索"
              onClick={() => {
                setSearchOpen(false);
                setTaskSearch("");
              }}
            >
              <X size={13} />
            </IconButton>
          </div>
        )}
        <section
          className={"kc-sidebar-project " + (projectOpen ? "is-open" : "")}
        >
          <div className="kc-project-controls">
            <div className="kc-project-select">
              <FolderOpen size={16} />
              <select
                aria-label="选择项目"
                value={projectId}
                onChange={(event) => selectProject(event.target.value)}
                disabled={loading || sending}
              >
                <option value="" disabled>
                  {loading ? "加载项目…" : "选择项目"}
                </option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} />
            </div>
            <IconButton label="新建项目" onClick={() => setModal(true)}>
              <Plus size={16} />
            </IconButton>
          </div>
          <div className="kc-side-heading">
            <span>项目文件</span>
            <IconButton
              label="刷新文件"
              disabled={!projectId}
              onClick={() => refreshFiles().catch((e) => setError(e.message))}
            >
              <RefreshCw size={12} />
            </IconButton>
          </div>
          <div className="kc-tree">
            {files.length ? (
              <Tree node={tree} selected={file?.path} onOpen={openFile} />
            ) : (
              <p className="kc-sidebar-empty">
                {projectId ? "项目中还没有文件" : "先创建一个项目"}
              </p>
            )}
          </div>
        </section>
        <div className="kc-side-heading kc-history-heading">
          <span>
            对话与任务 <ChevronDown size={11} />
          </span>
          <IconButton label="新任务" onClick={createSession}>
            <Plus size={13} />
          </IconButton>
        </div>
        <div className="kc-sessions">
          {sessions
            .filter((session) =>
              (session.title || session.name || "新任务")
                .toLowerCase()
                .includes(taskSearch.toLowerCase()),
            )
            .map((session) => (
              <button
                className={session.id === sessionId ? "is-selected" : ""}
                key={session.id}
                title={session.title || session.name || "新任务"}
                onClick={() => {
                  openSession(session.id);
                  setMobileTab("chat");
                  if (window.innerWidth <= 700) setLeftOpen(false);
                }}
                disabled={sending}
              >
                <span className="kc-history-circle" />
                <span>{session.title || session.name || "新任务"}</span>
                {isActive(session.state || session.status) && (
                  <span className="kc-session-dot" />
                )}
              </button>
            ))}
          {!sessions.length && (
            <p className="kc-sidebar-empty">任务会保存在这里</p>
          )}
        </div>
        <a className="kc-account" href="/billing">
          <span className="kc-avatar">
            {(config.user.name || config.user.email || "K")
              .slice(0, 1)
              .toUpperCase()}
          </span>
          <span>
            <strong>
              {config.user.name || config.user.email?.split("@")[0]}
            </strong>
            <small>· {config.demo ? "演示" : "账户"}</small>
          </span>
          <ChevronRight size={13} />
        </a>
      </aside>

      <main className="kc-conversation">
        <header className="kc-context">
          {!leftOpen && (
            <IconButton label="展开侧栏" onClick={() => setLeftOpen(true)}>
              <PanelLeftOpen size={18} />
            </IconButton>
          )}
          <span className="kc-context-title">
            {timeline.length
              ? selectedSession?.title || selectedSession?.name || "新任务"
              : ""}
          </span>
          <div className="kc-context-actions">
            {(active || connection === "reconnecting") && (
              <span className="kc-run-state">
                {connection === "reconnecting"
                  ? "重新连接中"
                  : stateNames[runState]}
              </span>
            )}
            <span className="kc-runtime">
              {runtime?.mode === "demo"
                ? "演示"
                : runtime?.available
                  ? "Claude Code"
                  : runtime
                    ? "未连接"
                    : "连接中"}
            </span>
            <a href="/chat" className="kc-chat-link" aria-label="返回网页对话">
              <MessageSquare size={16} />
            </a>
            <IconButton
              label={rightOpen ? "收起工作区" : "打开文件与工作区"}
              onClick={() => {
                setRightOpen(!rightOpen);
                setProjectOpen(true);
                setMobileTab(rightOpen ? "chat" : "workspace");
              }}
            >
              <Files size={18} />
            </IconButton>
          </div>
        </header>
        {error && !modal && (
          <div className="kc-error" role="alert">
            <span>{error}</span>
            <IconButton label="关闭错误提示" onClick={() => setError("")}>
              <X size={14} />
            </IconButton>
          </div>
        )}
        <div
          className="kc-conversation-scroll"
          aria-busy={loading}
          onScroll={(event) => {
            const target = event.currentTarget;
            followOutput.current =
              target.scrollHeight - target.scrollTop - target.clientHeight < 80;
          }}
        >
          {!timeline.length && !active ? (
            <div className="kc-welcome">
              <img src="/claude-assets/spark.svg" alt="" />
              <h1>今天，想构建什么？</h1>
            </div>
          ) : (
            <div className="kc-timeline">
              {timeline.map((item) =>
                item.kind === "user" ? (
                  <div key={item.key} className="kc-user-message">
                    {item.text}
                  </div>
                ) : item.kind === "tool" ? (
                  <ToolCard key={item.key} item={item} projectId={projectId} />
                ) : item.kind === "error" ? (
                  <div key={item.key} className="kc-inline-error">
                    {item.text}
                  </div>
                ) : (
                  <div key={item.key} className="kc-assistant-message">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {item.text}
                    </ReactMarkdown>
                  </div>
                ),
              )}
              {active && !pendingApproval && (
                <div className="kc-thinking">
                  <LoaderCircle size={15} className="kc-spin" />
                  {connection === "reconnecting"
                    ? "正在恢复连接…"
                    : "Claude 正在处理…"}
                </div>
              )}
              {pendingApproval && (
                <Approval
                  key={pendingApproval.id}
                  approval={pendingApproval}
                  projectId={projectId}
                  onAnswer={answer}
                  busy={answering}
                />
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>
        <form className="kc-composer" onSubmit={send}>
          <textarea
            ref={draftRef}
            aria-label="发送给 Claude Code 的任务"
            placeholder={"描述你想完成的任务…"}
            value={draft}
            disabled={sending}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                send();
              }
            }}
            rows={2}
          />
          <div className="kc-composer-toolbar">
            <div className="kc-composer-project">
              <IconButton label="新建项目" onClick={() => setModal(true)}>
                <Plus size={18} />
              </IconButton>
              <div className="kc-inline-project">
                <Folder size={13} />
                <select
                  aria-label="任务所在项目"
                  value={projectId}
                  disabled={sending || active || loading}
                  onChange={(event) => selectProject(event.target.value)}
                >
                  <option value="" disabled>
                    选择项目
                  </option>
                  {projects.map((project) => (
                    <option value={project.id} key={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={10} />
              </div>
            </div>
            <div className="kc-composer-selects">
              <label>
                <select
                  aria-label="选择 Claude Code 模型"
                  value={model}
                  disabled={active || sending}
                  onChange={(event) => setModel(event.target.value)}
                >
                  <option value="sonnet">Sonnet</option>
                  <option value="opus">Opus</option>
                  <option value="haiku">Haiku</option>
                </select>
                <ChevronDown size={11} />
              </label>
              <label className={mode === "plan" ? "is-plan" : ""}>
                <ShieldCheck size={13} />
                <select
                  aria-label="执行模式"
                  value={mode}
                  disabled={active || sending}
                  onChange={(event) => setMode(event.target.value)}
                >
                  <option value="default">执行前确认</option>
                  <option value="plan">仅规划</option>
                </select>
                <ChevronDown size={11} />
              </label>
            </div>
            {active ? (
              <button
                className="kc-send kc-stop"
                type="button"
                aria-label="停止执行"
                onClick={stop}
              >
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button
                className="kc-send"
                type="submit"
                aria-label="开始任务"
                disabled={!draft.trim() || sending || !runtime?.available}
              >
                {sending ? (
                  <LoaderCircle size={17} className="kc-spin" />
                ) : (
                  <ArrowUp size={19} />
                )}
              </button>
            )}
          </div>
        </form>
        {!timeline.length && !active && (
          <div className="kc-starters">
            {[
              {
                icon: Files,
                label: "了解项目",
                prompt: "请先阅读这个项目，简要介绍它的结构和运行方式。",
              },
              {
                icon: Code2,
                label: "构建页面",
                prompt:
                  "请将 index.html 改造成一个精致的产品介绍页面，不添加依赖。先说明计划，再实现。",
              },
              {
                icon: Terminal,
                label: "检查代码",
                prompt:
                  "请检查当前项目的代码，找到问题并运行可用的检查。执行命令前向我确认。",
              },
            ].map(({ icon: Icon, label, prompt }) => (
              <button
                type="button"
                key={label}
                onClick={() => {
                  setDraft(prompt);
                  draftRef.current?.focus();
                }}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>
        )}
        {connection === "reconnecting" && (
          <div className="kc-composer-caption">
            连接中断，任务仍在服务器执行。
          </div>
        )}
      </main>

      <section className="kc-workspace" aria-label="项目工作区">
        <header
          className="kc-workspace-tabs"
          role="tablist"
          aria-label="工作区内容"
        >
          <button
            type="button"
            role="tab"
            aria-selected={rightTab === "files"}
            className={rightTab === "files" ? "is-selected" : ""}
            onClick={() => setRightTab("files")}
          >
            <Code2 size={14} />
            文件
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={rightTab === "changes"}
            className={rightTab === "changes" ? "is-selected" : ""}
            onClick={() => {
              setRightTab("changes");
              refreshFiles().catch((e) => setError(e.message));
            }}
          >
            <GitCompareArrows size={14} />
            变更
            {changes.length > 0 && (
              <span className="kc-count">{changes.length}</span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={rightTab === "terminal"}
            className={rightTab === "terminal" ? "is-selected" : ""}
            onClick={() => setRightTab("terminal")}
          >
            <Terminal size={14} />
            终端
            {terminals.length > 0 && (
              <span className="kc-count">{terminals.length}</span>
            )}
          </button>
          <IconButton
            label="关闭工作区"
            onClick={() => {
              setRightOpen(false);
              setMobileTab("chat");
            }}
          >
            <X size={16} />
          </IconButton>
        </header>
        {rightTab === "files" ? (
          file ? (
            <div className="kc-editor">
              <div className="kc-editor-toolbar">
                <span className="kc-editor-path">
                  <FileCode2 size={13} />
                  <span>{file.path}</span>
                  {dirty && <span className="kc-dirty-dot" title="尚未保存" />}
                </span>
                <div>
                  <IconButton
                    label="重新读取文件"
                    disabled={saving || fileBusy}
                    onClick={() => openFile(file.path)}
                  >
                    <RefreshCw size={13} />
                  </IconButton>
                  <button
                    className="kc-save"
                    onClick={saveFile}
                    disabled={!dirty || saving || active}
                  >
                    {saving ? (
                      <LoaderCircle className="kc-spin" size={13} />
                    ) : (
                      <Save size={13} />
                    )}
                    保存
                  </button>
                </div>
              </div>
              {fileNotice && (
                <div className="kc-file-notice" role="status">
                  {fileNotice}
                </div>
              )}
              <div className="kc-editor-body">
                <pre
                  className="kc-line-numbers"
                  ref={numbersRef}
                  aria-hidden="true"
                >
                  {Array.from(
                    { length: content.split("\n").length },
                    (_, index) => index + 1,
                  ).join("\n")}
                </pre>
                <textarea
                  ref={editorRef}
                  aria-label={"编辑文件 " + file.path}
                  spellCheck={false}
                  wrap="off"
                  value={content}
                  disabled={fileBusy || saving || active}
                  onChange={(event) => {
                    setContent(event.target.value);
                    setFileNotice("");
                  }}
                  onScroll={(event) => {
                    if (numbersRef.current)
                      numbersRef.current.scrollTop = event.target.scrollTop;
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Tab") {
                      event.preventDefault();
                      const target = event.currentTarget,
                        start = target.selectionStart,
                        end = target.selectionEnd;
                      setContent(
                        content.slice(0, start) + "  " + content.slice(end),
                      );
                      requestAnimationFrame(() => {
                        target.selectionStart = target.selectionEnd = start + 2;
                      });
                    }
                  }}
                />
              </div>
              <footer className="kc-editor-status">
                <span>
                  {fileBusy
                    ? "正在读取…"
                    : dirty
                      ? "有未保存的修改"
                      : "已与服务器同步"}
                </span>
                <span>UTF-8</span>
              </footer>
            </div>
          ) : fileBusy ? (
            <Empty icon={LoaderCircle}>正在读取文件…</Empty>
          ) : (
            <Empty icon={FileCode2}>从左侧选择一个文件</Empty>
          )
        ) : rightTab === "changes" ? (
          <Changes files={changes} onOpen={openFile} />
        ) : (
          <div className="kc-terminal">
            {terminals.length ? (
              terminals.map((item) => (
                <div key={item.key} className="kc-terminal-entry">
                  <div className="kc-terminal-command">
                    <span>$</span>
                    <code>
                      {item.input?.command || item.input?.description || "命令"}
                    </code>
                    {item.status === "running" && (
                      <LoaderCircle size={12} className="kc-spin" />
                    )}
                    {item.status === "stopped" && (
                      <span className="kc-tool-status-label">已停止</span>
                    )}
                    {item.isError && (
                      <span className="kc-tool-status-label">未成功</span>
                    )}
                  </div>
                  {item.output != null && (
                    <pre>{formatOutput(item.output)}</pre>
                  )}
                </div>
              ))
            ) : (
              <Empty icon={Terminal}>执行命令后，输出会显示在这里</Empty>
            )}
          </div>
        )}
      </section>
      {modal && (
        <div
          className="kc-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setModal(false);
          }}
        >
          <form
            ref={modalRef}
            className="kc-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="kc-project-title"
            onSubmit={createProject}
          >
            <header>
              <h2 id="kc-project-title">新建项目</h2>
              <IconButton label="关闭新建项目" onClick={() => setModal(false)}>
                <X size={17} />
              </IconButton>
            </header>
            <label htmlFor="kc-project-name">项目名称</label>
            <input
              autoFocus
              id="kc-project-name"
              maxLength={80}
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="例如：我的第一个网站"
              required
            />
            <p>文件与任务保存在这个项目中。</p>
            {error && (
              <div className="kc-modal-error" role="alert">
                {error}
              </div>
            )}
            <footer>
              <button
                type="button"
                className="kc-button"
                onClick={() => setModal(false)}
              >
                取消
              </button>
              <button
                type="submit"
                className="kc-button kc-button-primary"
                disabled={!projectName.trim() || creating}
              >
                {creating && <LoaderCircle size={14} className="kc-spin" />}
                创建项目
              </button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}
