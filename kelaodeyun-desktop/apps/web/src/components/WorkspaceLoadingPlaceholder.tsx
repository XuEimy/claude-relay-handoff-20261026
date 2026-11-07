/** Quiet placeholders for initial workspace reads; no pulse or spinner, compact uses a faint glint line. */
export function WorkspaceLoadingPlaceholder({
  terminal = false,
  compact = false,
  label,
}: {
  terminal?: boolean;
  compact?: boolean;
  label?: string;
}) {
  if (compact) {
    return (
      <div
        role="status"
        aria-label={label ?? "正在读取对话"}
        className="workspace-loading-glint mx-3 my-1.5 text-sidebar-foreground"
      />
    );
  }
  return (
    <div
      role="status"
      aria-label={label ?? (terminal ? "正在准备终端" : "正在读取对话")}
      className={
        terminal
            ? "space-y-3 p-5 text-(--terminal-foreground)"
            : "mx-auto w-full max-w-3xl space-y-8 px-6 py-8 text-foreground"
      }
    >
      {!terminal ? (
        <div aria-hidden="true" className="ml-auto h-8 w-1/3 rounded-lg bg-current/5" />
      ) : null}
      <div aria-hidden="true" className="space-y-3">
        <div className="h-2 w-1/3 rounded-sm bg-current/10" />
        <div className="h-2 w-2/3 rounded-sm bg-current/5" />
        <div className="h-2 w-1/2 rounded-sm bg-current/5" />
      </div>
    </div>
  );
}
