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
  Copy,
  CircleCheck,
  CircleHelp,
  LockKeyhole,
  Pause,
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
import { Glyph, Tool, Greeting, Composer, ModelMenu } from "./components/ClaudeUI.jsx";
import "./claude-code.css";

const formatOutput = (value) => {
  let parsed = value;
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      parsed = JSON.parse(value);
    } catch {
      return value;
    }
  }
  if (
    Array.isArray(parsed) &&
    parsed.every(
      (block) => block.type === "text" && typeof block.text === "string",
    )
  )
    return parsed.map((block) => block.text).join("\n");
  return typeof value === "string"
    ? value
    : value == null
      ? ""
      : JSON.stringify(value, null, 2);
};
const isActive = (state) => state === "running" || state === "waiting";
function projectRelative(value, projectId) {
  if (typeof value !== "string") return "";
  const path = value.replaceAll("\\", "/");
  const marker = projectId ? `/${projectId}/` : "";
  if (marker && path.includes(marker))
    return path.slice(path.indexOf(marker) + marker.length);
  return path.replace(/^.*\/(?:demo-)?code-workspaces\/[^/]+\/[^/]+\//, "");
}

function ToolInput({ name, input = {}, projectId, preview }) {
  if (preview) return <DiffPreview {...preview} compact />;
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
    if (event.type === "approval") {
      const tool = [...tools.values()]
        .reverse()
        .find((tool) => tool.name === data.tool && tool.status === "running");
      if (tool) {
        tool.status = "waiting";
        tool.approvalId = data.id;
      }
    }
    if (event.type === "approval_resolved") {
      const tool = [...tools.values()].find(
        (tool) => tool.approvalId === data.id,
      );
      if (tool) {
        tool.status = "running";
        tool.declined = !data.allow;
      }
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

const ToolCard = React.memo(function ToolCard({ item, projectId, onOpen }) {
  const bash = item.name === "Bash",
    done = item.status === "complete",
    failed = !!item.isError && !item.declined,
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
          {item.declined ? (
            <X size={14} />
          ) : item.status === "waiting" ? (
            <Pause size={13} />
          ) : failed ? (
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
        {(failed || stopped || item.declined || item.status === "waiting") && (
          <span className="kc-tool-status-label">
            {item.declined
              ? "已拒绝"
              : item.status === "waiting"
                ? "等待批准"
                : failed
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
        <ToolInput
          name={item.name}
          input={item.input}
          projectId={projectId}
          preview={item.preview}
        />
        {item.output != null && (
          <div className="kc-tool-output">
            <span>结果</span>
            <pre>{formatOutput(item.output)}</pre>
          </div>
        )}
        {item.input?.file_path && done && !failed && (
          <button
            type="button"
            className="kc-inline-file-open"
            onClick={() =>
              onOpen(projectRelative(item.input.file_path, projectId))
            }
          >
            <FileText size={13} /> 打开文件 <ChevronRight size={12} />
          </button>
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
        {isQuestion ? <CircleHelp size={18} /> : <LockKeyhole size={17} />}
        <div>
          <strong>
            {isQuestion
              ? "Claude 有一个问题"
              : approval.tool === "Bash"
                ? "允许执行这条命令？"
                : "允许修改这个文件？"}
          </strong>
          <span className="kc-approval-scope">
            {isQuestion ? "选择后继续任务" : "仅允许本次操作"}
          </span>
        </div>
        <span className="kc-awaiting">
          <span />
          等待确认
        </span>
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
            preview={approval.preview}
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
          拒绝本次
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
  const a = before == null ? [] : before.replace(/\n$/, "").split("\n"),
    b = after == null ? [] : after.replace(/\n$/, "").split("\n");
  if (!before) a.length = 0;
  if (!after) b.length = 0;
  const result = [];
  let i = 0,
    j = 0;
  const push = (kind) =>
    result.push({
      kind,
      text: kind === "add" ? b[j] : a[i],
      old: kind === "add" ? undefined : ++i,
      next: kind === "remove" ? undefined : ++j,
    });
  if (a.length * b.length <= 200000) {
    const rows = Array.from(
      { length: a.length + 1 },
      () => new Uint32Array(b.length + 1),
    );
    for (let x = a.length - 1; x >= 0; x--)
      for (let y = b.length - 1; y >= 0; y--)
        rows[x][y] =
          a[x] === b[y]
            ? rows[x + 1][y + 1] + 1
            : Math.max(rows[x + 1][y], rows[x][y + 1]);
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i] === b[j]) push("same");
      else if (
        i < a.length &&
        (j === b.length || rows[i + 1][j] >= rows[i][j + 1])
      )
        push("remove");
      else push("add");
    }
  } else {
    while (i < a.length && j < b.length && a[i] === b[j]) push("same");
    let tail = 0;
    while (
      tail < a.length - i &&
      tail < b.length - j &&
      a[a.length - tail - 1] === b[b.length - tail - 1]
    )
      tail++;
    while (i < a.length - tail) push("remove");
    while (j < b.length - tail) push("add");
    while (i < a.length) push("same");
  }
  return result;
}
function DiffPreview({ path, before, after, compact = false }) {
  const lines = useMemo(() => diffLines(before, after), [before, after]);
  const added = lines.filter((l) => l.kind === "add").length,
    removed = lines.filter((l) => l.kind === "remove").length;
  return (
    <div className={"kc-diff-preview " + (compact ? "is-compact" : "")}>
      <div className="kc-diff-file">
        <FileCode2 size={14} />
        <code>{path || "文件修改"}</code>
        <span className="kc-diff-totals">
          <span className="added">+{added}</span>
          <span className="removed">−{removed}</span>
        </span>
      </div>
      <div
        className="kc-diff"
        role="region"
        aria-label={"文件差异：" + (path || "修改预览")}
        tabIndex={0}
      >
        {lines.map((line, index) => (
          <div className={"kc-diff-line " + line.kind} key={index}>
            <span aria-hidden="true">{line.old}</span>
            <span aria-hidden="true">{line.next}</span>
            <b aria-hidden="true">
              {line.kind === "add" ? "+" : line.kind === "remove" ? "−" : " "}
            </b>
            <code>{line.text || " "}</code>
          </div>
        ))}
      </div>
    </div>
  );
}
function AssistantText({ text, actions }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <article className="kc-assistant-message">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      {actions && (
        <div className="kc-response-actions">
          <IconButton
            label={copied ? "已复制回复" : "复制回复"}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </IconButton>
        </div>
      )}
    </article>
  );
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
          <DiffPreview
            path={file.path}
            before={file.before}
            after={file.after}
          />
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
  const [composerMenu, setComposerMenu] = useState(null);
  useEffect(() => { const close = event => { if(event.key === "Escape") setComposerMenu(null); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, []);
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
  useEffect(() => {
    const input = draftRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height =
      Math.min(180, Math.max(timeline.length ? 28 : 53, input.scrollHeight)) +
      "px";
  }, [draft, events.length]);
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
      setSessions((old) =>
        old.map((session) =>
          session.id === id && session.title === "新任务"
            ? { ...session, title: text.slice(0, 40) }
            : session,
        ),
      );
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
        "cc-app kc-app " +
        (!leftOpen ? "kc-left-closed " : "") +
        (!rightOpen ? "kc-right-closed " : "") +
        "kc-mobile-" +
        mobileTab +
        (!timeline.length && !active ? " kc-new cc-new" : " kc-has-messages cc-conversation")
      }
    >
      {composerMenu && <button className="cc-dismiss" aria-label="关闭菜单" onClick={() => setComposerMenu(null)} />}
      {leftOpen && (
        <button
          className="kc-side-backdrop"
          aria-label="关闭侧栏"
          onClick={() => setLeftOpen(false)}
        />
      )}
      <aside className="kc-sidebar cc-sidebar">
        <header className="kc-sidebar-brand">
          <IconButton label="收起侧栏" onClick={() => setLeftOpen(false)}>
            <Glyph name="sidebar" />
          </IconButton>
          <a className="cc-wordmark" href="/">
            kelaodeyun
          </a>
        </header>
        <nav className="kc-primary-nav">
          <button type="button" onClick={createSession} disabled={sending}>
            <Glyph name="plus" />
            New
          </button>
          <button type="button" onClick={() => setSearchOpen(!searchOpen)}>
            <Glyph name="search" />
            Search
          </button>
          <button
            type="button"
            onClick={() => setProjectOpen(!projectOpen)}
            aria-expanded={projectOpen}
          >
            <Glyph name="projects" />
            Projects
          </button>
          <a className="is-selected" href="/code">
            <Glyph name="code" />
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
              <Glyph name="sidebar" />
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
            <Greeting name={config.user.name} />
          ) : (
            <div className="kc-timeline">
              {timeline.map((item) =>
                item.kind === "user" ? (
                  <div key={item.key} className="kc-user-message">
                    {item.text}
                  </div>
                ) : item.kind === "tool" ? (
                  <ToolCard
                    key={item.key}
                    item={item}
                    projectId={projectId}
                    onOpen={openFile}
                  />
                ) : item.kind === "error" ? (
                  <div key={item.key} className="kc-inline-error">
                    {item.text}
                  </div>
                ) : (
                  <AssistantText
                    key={item.key}
                    text={item.text}
                    actions={!active && item === timeline.at(-1)}
                  />
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
        <div className={"cc-composer-position kc-shared-composer " + (composerMenu ? "cc-front" : "")}>
          <Composer onSubmit={send}>
            {timeline.length > 0 && <Tool name="plus" label="项目与执行设置" className="cc-inline-plus" onClick={() => setComposerMenu(composerMenu === "settings" ? null : "settings")} />}
            <textarea ref={draftRef} aria-label="发送给 Claude Code 的任务" placeholder={timeline.length ? "Write a message…" : "描述你想完成的任务…"} value={draft} disabled={sending} rows={1}
              onChange={event => {setDraft(event.target.value); event.target.style.height = "auto"; event.target.style.height = Math.min(200, event.target.scrollHeight) + "px";}}
              onKeyDown={event => {if(event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {event.preventDefault(); send();}}} />
            {!timeline.length && <div className="cc-composer-controls">
              <div className="cc-left-controls">
                <Tool name="plus" label="项目与执行设置" onClick={() => setComposerMenu(composerMenu === "settings" ? null : "settings")} />
                <div className="cc-surface" role="group" aria-label="工作模式"><button type="button" onClick={() => location.assign('/chat')}>Chat</button><button type="button" aria-pressed="true">Code</button></div>
              </div>
              <div className="cc-right-controls">
                <button type="button" className="cc-model-button" aria-label="选择 Claude Code 模型" aria-expanded={composerMenu === "model"} disabled={active || sending} onClick={() => setComposerMenu(composerMenu === "model" ? null : "model")}>{model[0].toUpperCase() + model.slice(1)}</button>
                {active ? <Tool label="停止执行" className="cc-send" onClick={stop}><span className="cc-stop" /></Tool> : <button className="cc-tool cc-send" type="submit" aria-label="开始任务" disabled={!draft.trim() || sending || !runtime?.available}><Glyph name="send" /></button>}
              </div>
            </div>}
            {timeline.length > 0 && (active ? <Tool label="停止执行" className="cc-send" onClick={stop}><span className="cc-stop" /></Tool> : <button className="cc-tool cc-send" type="submit" aria-label="开始任务" disabled={!draft.trim() || sending || !runtime?.available}><Glyph name="send" /></button>)}
          </Composer>
          {timeline.length > 0 && <div className="cc-composer-footer"><span>{config.demo ? "演示环境 · 模拟回复" : "AI can make mistakes. Please double-check responses."}</span><button type="button" className="cc-model-button" aria-label="选择 Claude Code 模型" aria-expanded={composerMenu === "model"} disabled={active || sending} onClick={() => setComposerMenu(composerMenu === "model" ? null : "model")}>{model[0].toUpperCase() + model.slice(1)}</button></div>}
          {composerMenu === "model" && <ModelMenu options={[{id:'sonnet',name:'Sonnet'},{id:'opus',name:'Opus'},{id:'haiku',name:'Haiku'}]} value={model} onChange={value => {setModel(value);setComposerMenu(null);}} />}
          {composerMenu === "settings" && <div className="cc-popover cc-attach-menu kc-task-settings">
            <label>项目<select aria-label="任务所在项目" value={projectId} disabled={sending || active || loading} onChange={event => selectProject(event.target.value)}><option value="" disabled>选择项目</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
            <button type="button" onClick={() => {setComposerMenu(null);setModal(true);}}><Glyph name="plus" />新建项目</button><hr />
            <label>执行模式<select aria-label="执行模式" value={mode} disabled={active || sending} onChange={event => setMode(event.target.value)}><option value="default">执行前确认</option><option value="plan">仅规划</option></select></label>
          </div>}
        </div>
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
