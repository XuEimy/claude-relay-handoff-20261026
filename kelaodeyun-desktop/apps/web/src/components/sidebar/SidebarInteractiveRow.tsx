import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";

export function SidebarInteractiveRow({
  active = false,
  pending = false,
  dimmed = false,
  compact = false,
  className,
  children,
  ...props
}: ComponentProps<"button"> & {
  active?: boolean;
  pending?: boolean;
  dimmed?: boolean;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      aria-busy={pending || undefined}
      className={cn(
        "relative flex w-full cursor-pointer items-center gap-2 rounded-md px-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none disabled:cursor-default",
        compact ? "min-h-7 py-1 text-xs" : "my-0.5 min-h-8 py-1.5 text-sm leading-5",
        active || pending
          ? "bg-sidebar-foreground/10 text-sidebar-foreground"
          : "text-sidebar-foreground/80 group-hover/conversation:bg-sidebar-foreground/8 enabled:hover:bg-sidebar-foreground/8 enabled:hover:text-sidebar-foreground",
        "enabled:active:bg-sidebar-foreground/15",
        dimmed ? "opacity-50" : "",
        className,
      )}
    >
      {children}
    </button>
  );
}
