import React, { useEffect, useRef, useState } from "react";
import { UiIcon } from "./design-system/icons";
export { readTasks } from "./task-state.mjs";
export default function Cowork({
  tasks,
  setTasks,
  active,
  onSelect,
  sidebar,
  onOpenSidebar,
}: any) {
  const task = tasks.find((t) => t.id === active),
    [draft, setDraft] = useState("");
  const scroll = useRef<HTMLDivElement>(null),
    following = useRef(true);
  useEffect(() => {
    setDraft("");
    following.current = true;
  }, [active]);
  useEffect(() => {
    try {
      localStorage.setItem("kelaodeyun.ui.tasks.v1", JSON.stringify(tasks));
    } catch {}
  }, [tasks]);
  useEffect(() => {
    if (following.current && scroll.current)
      scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [active, task?.notes?.length]);
  if (!task) return null;
  function send() {
    if (!draft.trim()) return;
    setTasks((prev) =>
      prev.map((t) =>
        t.id === active
          ? { ...t, notes: [...(t.notes || []), draft.trim()] }
          : t,
      ),
    );
    setDraft("");
    following.current = true;
  }
  return (
    <div className="cowork-channel">
      <header className="conversation-title cowork-channel-title">
        {!sidebar && (
          <button aria-label="打开侧栏" onClick={onOpenSidebar}>
            <UiIcon name="sidebar" />
          </button>
        )}
        <strong>{task.title}</strong>
        <span>Cowork</span>
        <button aria-label="新建 Cowork 对话" onClick={() => onSelect(null)}>
          <UiIcon name="plus" />
        </button>
      </header>
      <div
        className="messages cowork-thread"
        ref={scroll}
        onScroll={(e) => {
          const el = e.currentTarget;
          following.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 100;
        }}
      >
        <div className="message user">
          <div>{task.prompt}</div>
        </div>
        <div className="message assistant">
          <img
            className="small-spark"
            src="/claude-web-assets/spark.svg"
            alt=""
          />
          <div>执行服务尚未连接，目前不会运行任务或修改文件。</div>
        </div>
        {task.notes?.map((note, i) => (
          <div className="message user" key={i}>
            <div>{note}</div>
          </div>
        ))}
      </div>
      <form
        className="composer-position cowork-composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div className="composer">
          <textarea
            className="editor"
            aria-label="继续 Cowork 对话"
            placeholder="描述你想完成的工作…"
            value={draft}
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
          />
          <div className="composer-controls">
            <div className="left-controls">
              <span className="cowork-mode">
                <UiIcon name="team" />
                Cowork
              </span>
            </div>
            <div className="right-controls">
              <span className="model-button">{task.model || "Sonnet 5.5"}</span>
              <button
                className="send"
                aria-label="发送补充要求"
                disabled={!draft.trim()}
              >
                <UiIcon name="send" />
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
