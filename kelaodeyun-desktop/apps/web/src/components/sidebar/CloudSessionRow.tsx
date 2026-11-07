import { ArchiveIcon, PencilIcon } from "lucide-react";
import { useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useStableCallback } from "../../hooks/useStableCallback";
import { SidebarInteractiveRow } from "./SidebarInteractiveRow";
import { SidebarHeaderIconButton } from "./SidebarThreadHeader";
import type { SessionLight } from "./sessionLight";

const lights: Record<SessionLight, { label: string; className: string }> = {
  attention: { label: "需要你决策", className: "bg-red-500" },
  running: { label: "正在运行", className: "bg-amber-400 motion-safe:animate-status-pulse" },
  done: { label: "已完成", className: "bg-emerald-500" },
  idle: { label: "空闲", className: "bg-muted-foreground/40" },
};

// oxlint-disable t3code/no-native-title-tooltip -- the status dot must expose its label as a native title
export function CloudSessionRow({
  title,
  light,
  onRename,
  onArchive,
  actions,
  pending = false,
  onClick,
  ...props
}: Omit<ComponentProps<typeof SidebarInteractiveRow>, "children"> & {
  title: string;
  light: SessionLight;
  onRename: (title: string) => void;
  onArchive?: () => void;
  actions?: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const cancelled = useRef(false);
  const focusInput = useStableCallback((input: HTMLInputElement | null) => {
    if (input) {
      input.focus();
      input.select();
    }
  });
  const start = () => {
    cancelled.current = false;
    setValue(title);
    setEditing(true);
  };
  const commit = () => {
    if (cancelled.current) return;
    cancelled.current = true;
    setEditing(false);
    onRename(value);
  };
  return (
    <div className="group/conversation relative rounded-md">
      <SidebarInteractiveRow
        {...props}
        aria-label={title}
        pending={pending}
        onClick={(event) => {
          if (!editing && event.detail <= 1) onClick?.(event);
        }}
        onDoubleClick={(event) => {
          event.preventDefault();
          start();
        }}
      >
        <span
          role="img"
          aria-label={lights[light].label}
          title={lights[light].label}
          className={`size-2 rounded-full shrink-0 ${lights[light].className}`}
        />
        {editing ? (
          <input
            aria-label="会话名称"
            className="min-w-0 flex-1 bg-transparent outline-none"
            value={value}
            ref={focusInput}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onChange={(event) => setValue(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                cancelled.current = true;
                setEditing(false);
              }
            }}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate">{title}</span>
        )}
        {pending ? (
          <span role="status" className="shrink-0 text-xs text-muted-foreground">
            恢复中…
          </span>
        ) : null}
      </SidebarInteractiveRow>
      {!editing ? (
        <span className="pointer-events-none absolute right-1 top-1/2 flex -translate-y-1/2 opacity-0 transition-opacity group-hover/conversation:pointer-events-auto group-hover/conversation:opacity-100 group-has-[:focus-visible]/conversation:pointer-events-auto group-has-[:focus-visible]/conversation:opacity-100">
          <SidebarHeaderIconButton label={`重命名：${title}`} onClick={start}>
            <PencilIcon />
          </SidebarHeaderIconButton>
          {onArchive ? (
            <SidebarHeaderIconButton label={`归档：${title}`} onClick={onArchive}>
              <ArchiveIcon />
            </SidebarHeaderIconButton>
          ) : null}
          {actions}
        </span>
      ) : null}
    </div>
  );
}
// oxlint-enable t3code/no-native-title-tooltip
