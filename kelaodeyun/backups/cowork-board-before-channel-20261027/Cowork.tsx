import React, { useEffect, useState } from "react";
import { ChatComposer } from "../../../vendor/open-claude-ui/code-examples/ChatComposer";
import { CoworkAgentCanvas } from "../../../vendor/open-claude-ui/code-examples/CoworkAgentCanvas";
import { McpToolDecisionCard } from "../../../vendor/open-claude-ui/code-examples/McpToolDecisionCard";
import { CdsButton } from "../../../vendor/open-claude-ui/code-examples/CdsButton";
import { UserMessageBubble } from "../../../vendor/open-claude-ui/code-examples/ChatMessageBubbles";
import {
  UiIcon,
  PanelLeft,
  X,
  Download,
  FileText,
  Square,
  Plus,
  Paperclip,
} from "./design-system/icons";
const stages = [
  {
    id: "materials",
    name: "整理材料",
    role: "Context",
    avatarIcon: "search",
    currentTask: "梳理任务要求与输入材料",
  },
  {
    id: "analysis",
    name: "分析归纳",
    role: "Analysis",
    avatarIcon: "plan",
    currentTask: "整理关键问题，形成执行结构",
  },
  {
    id: "draft",
    name: "撰写初稿",
    role: "Draft",
    avatarIcon: "write",
    currentTask: "生成一份可供审阅的文档",
  },
  {
    id: "review",
    name: "复核交付",
    role: "Review",
    avatarIcon: "review",
    currentTask: "核对结果与交付格式",
  },
];
export { readTasks } from "./task-state.mjs";
import { advanceTasks, agentStatus } from "./task-state.mjs";
export default function Cowork({
  tasks,
  setTasks,
  active,
  onSelect,
  sidebar,
  onOpenSidebar,
}: any) {
  const task = tasks.find((t) => t.id === active),
    [file, setFile] = useState(false),
    [log, setLog] = useState(false),
    [directive, setDirective] = useState(false),
    [extra, setExtra] = useState("");
  function update(id: string, fn: any) {
    setTasks((prev) => prev.map((t) => (t.id === id ? fn(t) : t)));
  }
  useEffect(() => {
    setFile(false);
    setLog(false);
    setDirective(false);
  }, [active]);
  useEffect(() => {
    try {
      localStorage.setItem("kelaodeyun.ui.tasks.v1", JSON.stringify(tasks));
    } catch {}
  }, [tasks]);
  const running = tasks
    .filter((t) => t.status === "running")
    .map((t) => t.id)
    .join(",");
  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => setTasks(advanceTasks), 1800);
    return () => clearInterval(tick);
  }, [running]);
  function start(text: string, attachments: any[], model: string) {
    if (!text.trim() && !attachments.length) return;
    const t = {
      id: crypto.randomUUID(),
      title: (text || "整理示例材料").slice(0, 24),
      prompt: text || "整理示例材料",
      model,
      step: 0,
      status: "running",
      notes: [],
    };
    setTasks((prev) => [t, ...prev]);
    onSelect(t.id);
  }
  const agents = stages.map((a, i) => ({
    ...a,
    status: agentStatus(task, i),
    completedTasksCount: task && i < task.step ? 1 : 0,
  }));
  const documentText = task
    ? `# ${task.title}\n\n## 任务目标\n${task.prompt}\n\n## 工作结构\n1. 确认输入材料与目标读者。\n2. 提炼重点，组织内容。\n3. 复核表达与最终格式。\n\n## 下一步\n补充真实资料后，继续完善内容。\n\n${task.notes?.length ? "## 补充要求\n" + task.notes.join("\n") + "\n\n" : ""}---\n本地演示文档，未调用模型或处理真实文件。`
    : "";
  function download() {
    const url = URL.createObjectURL(
      new Blob([documentText], { type: "text/markdown;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "cowork-demo.md";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="cowork-page">
      <header className="chat-top">
        <div className="chat-top-title">
          {!sidebar && (
            <CdsButton
              size="icon"
              variant="ghost"
              aria-label="打开侧栏"
              onClick={onOpenSidebar}
            >
              <PanelLeft size={18} />
            </CdsButton>
          )}
          <span>{task?.title || "Cowork"}</span>
        </div>
        <span className="demo-mark" title="任务和文档仅在当前浏览器演示">
          本地演示
        </span>
        {task && (
          <CdsButton
            variant="ghost"
            size="icon"
            aria-label="新建 Cowork 任务"
            onClick={() => onSelect(null)}
          >
            <Plus size={18} />
          </CdsButton>
        )}
      </header>
      {!task ? (
        <div className="cowork-start">
          <div className="welcome">
            <span className="spark">
              <UiIcon name="team" size={44} />
            </span>
            <h1>把任务交给 Claude。</h1>
          </div>
          <ChatComposer
            placeholder="描述你想完成的工作…"
            onSendMessage={start}
          />
          <div className="starters">
            <button
              onClick={() =>
                start("将零散笔记整理成一份项目简报", [], "Claude 3.7 Sonnet")
              }
            >
              <UiIcon name="file" />
              整理项目简报
            </button>
            <button
              onClick={() =>
                start("分析这周的工作，整理行动清单", [], "Claude 3.7 Sonnet")
              }
            >
              <UiIcon name="plan" />
              整理行动清单
            </button>
            <button
              onClick={() =>
                start("为下次分享准备演讲提纲", [], "Claude 3.7 Sonnet")
              }
            >
              <UiIcon name="write" />
              准备分享提纲
            </button>
          </div>
        </div>
      ) : (
        <div className="cowork-scroll">
          <div className="cowork-content">
            <UserMessageBubble text={task.prompt} time="" />
            <div className="task-state">
              <span
                className={
                  "status-dot " + (task.status === "running" ? "running" : "")
                }
              />
              <span>
                {
                  {
                    running: "正在处理示例任务",
                    review: "等待你确认",
                    done: "任务已完成",
                    paused: "任务已暂停",
                    denied: "已取消生成",
                  }[task.status]
                }
              </span>
              {task.status === "running" && (
                <CdsButton
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    update(task.id, (t) => ({ ...t, status: "paused" }))
                  }
                >
                  <Square size={12} />
                  暂停
                </CdsButton>
              )}
              {task.status === "paused" && (
                <CdsButton
                  size="sm"
                  onClick={() =>
                    update(task.id, (t) => ({ ...t, status: "running" }))
                  }
                >
                  继续任务
                </CdsButton>
              )}
            </div>
            <div className="cowork-canvas">
              <CoworkAgentCanvas
                agents={agents}
                artifacts={
                  task.status === "done"
                    ? [
                        {
                          id: "result",
                          title: "任务简报.md",
                          type: "doc",
                          authorAgentId: "draft",
                          updatedAt: "刚刚",
                          version: "v1",
                        },
                      ]
                    : []
                }
                onDirective={() => setDirective(true)}
                onAudit={() => setLog(!log)}
                onArtifact={() => setFile(true)}
              />
            </div>
            {log && (
              <div className="task-log">
                {stages.map((s, i) => (
                  <div key={s.id}>
                    <UiIcon name={i < task.step ? "check" : "clock"} />
                    <span>{s.name}</span>
                    <span>{i < task.step ? "已完成" : "等待中"}</span>
                  </div>
                ))}
              </div>
            )}
            {task.status === "review" && (
              <McpToolDecisionCard
                key={task.id}
                toolCall={{
                  id: task.id,
                  toolName: "生成演示文档",
                  inputParams: { filename: "任务简报.md", format: "Markdown" },
                  resultOutput: "文件仅在浏览器中生成。",
                }}
                onVerdict={(v) => {
                  update(task.id, (t) => ({
                    ...t,
                    status: v === "deny" ? "denied" : "done",
                  }));
                  if (v !== "deny") setFile(true);
                }}
              />
            )}
            {directive && (
              <form
                className="task-directive"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!extra.trim()) return;
                  update(task.id, (t) => ({
                    ...t,
                    notes: [...(t.notes || []), extra.trim()],
                  }));
                  setExtra("");
                  setDirective(false);
                }}
              >
                <label htmlFor="directive">补充要求</label>
                <textarea
                  id="directive"
                  autoFocus
                  value={extra}
                  onChange={(e) => setExtra(e.target.value)}
                  placeholder="补充你的要求"
                />
                <div>
                  <CdsButton
                    type="button"
                    variant="ghost"
                    onClick={() => setDirective(false)}
                  >
                    取消
                  </CdsButton>
                  <CdsButton type="submit">保存</CdsButton>
                </div>
              </form>
            )}
            {task.notes?.map((n, i) => (
              <p className="task-note" key={i}>
                <UiIcon name="write" /> {n}
              </p>
            ))}
          </div>
        </div>
      )}
      {file && task && (
        <aside className="cowork-file">
          <header>
            <FileText size={18} />
            <strong>任务简报.md</strong>
            <CdsButton
              variant="ghost"
              size="icon"
              aria-label="下载任务文档"
              onClick={download}
            >
              <Download size={17} />
            </CdsButton>
            <CdsButton
              variant="ghost"
              size="icon"
              aria-label="关闭任务文档"
              onClick={() => setFile(false)}
            >
              <X size={18} />
            </CdsButton>
          </header>
          <article>
            {documentText
              .split("\n")
              .filter(Boolean)
              .map((line, i) =>
                line.startsWith("# ") ? (
                  <h1 key={i}>{line.slice(2)}</h1>
                ) : line.startsWith("## ") ? (
                  <h2 key={i}>{line.slice(3)}</h2>
                ) : (
                  <p key={i}>{line}</p>
                ),
              )}
          </article>
        </aside>
      )}
    </div>
  );
}
