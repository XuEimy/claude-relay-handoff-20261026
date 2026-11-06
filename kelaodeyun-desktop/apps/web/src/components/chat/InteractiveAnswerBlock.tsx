import { lazy, Suspense, useState, type ReactNode } from "react";
import { observeIntersection } from "~/lib/observeIntersection";
import { RenderErrorBoundary } from "../RenderErrorBoundary";
import { Button } from "../ui/button";
import { interactiveAnswerCanRun, MAX_INTERACTIVE_ANSWER_LENGTH } from "./interactiveAnswer";

const InteractiveAnswerPreview = lazy(() => import("./InteractiveAnswerPreview"));

export function InteractiveAnswerBlock({
  code,
  title,
  theme,
  complete,
  streaming,
  children,
}: {
  code: string;
  title: string;
  theme: "light" | "dark";
  complete: boolean;
  streaming: boolean;
  children: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [paused, setPaused] = useState(false);
  const [revision, setRevision] = useState(0);
  const runnable = interactiveAnswerCanRun(code, complete);
  const observe = (element: HTMLDivElement) =>
    observeIntersection(
      element,
      (entry) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { rootMargin: "200px" },
    );
  const status =
    code.length > MAX_INTERACTIVE_ANSWER_LENGTH
      ? "组件内容过长，请查看源码。"
      : !complete
        ? streaming
          ? "正在生成交互内容…"
          : "生成未完成，可查看源码或继续对话。"
        : paused
          ? "预览已暂停。"
          : "正在加载交互预览…";

  return (
    <div
      ref={observe}
      className="my-3 overflow-hidden rounded-lg border border-border/70 bg-background"
      data-interactive-answer
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-3 py-1.5">
        <span className="truncate text-xs text-muted-foreground">{title}</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost-muted" size="xs" onClick={() => setShowCode(!showCode)}>
            {showCode ? "预览" : "代码"}
          </Button>
          {runnable && (
            <>
              <Button
                variant="ghost-muted"
                size="xs"
                onClick={() => {
                  setPaused(false);
                  setRevision(revision + 1);
                }}
              >
                重新加载
              </Button>
              <Button variant="ghost-muted" size="xs" onClick={() => setPaused(!paused)}>
                {paused ? "运行" : "暂停"}
              </Button>
              <Button variant="ghost-muted" size="xs" onClick={() => setExpanded(!expanded)}>
                {expanded ? "收起" : "展开"}
              </Button>
            </>
          )}
        </div>
      </div>
      <div hidden={showCode} style={{ minHeight: 120 }}>
        {runnable && visible && !paused ? (
          <RenderErrorBoundary
            key={revision}
            resetKeys={[code]}
            fallback={
              <p role="alert" className="p-4 text-sm text-muted-foreground">
                预览加载失败，可重新加载或查看代码。
              </p>
            }
          >
            <Suspense
              fallback={
                <p role="status" className="p-4 text-sm text-muted-foreground">
                  正在加载交互预览…
                </p>
              }
            >
              <div style={{ height: expanded ? 640 : 380, overflow: "auto" }}>
                <InteractiveAnswerPreview code={code} theme={theme} />
              </div>
            </Suspense>
          </RenderErrorBoundary>
        ) : (
          <p role="status" className="p-4 text-sm text-muted-foreground">
            {status}
          </p>
        )}
      </div>
      {showCode && <div className="max-h-96 overflow-auto p-3 text-xs">{children}</div>}
    </div>
  );
}
