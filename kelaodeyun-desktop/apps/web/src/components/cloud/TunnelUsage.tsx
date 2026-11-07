import { T3CHAT_PLAN_TUNNEL_LIMITS } from "@t3tools/contracts/relay";
import { TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { ManagedTunnelUpgrade } from "../../cloud/managedRelayState";
import { cn } from "../../lib/utils";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "../ui/alert";
import { Button } from "../ui/button";

// Above this, one slot per tunnel is too thin to read, so the bar fills instead.
const MAX_SEGMENTS = 10;

export const T3CHAT_SUBSCRIPTION_URL = "https://t3.chat/settings/subscription";

export function tunnelUpgradeCopy(upgrade: Exclude<ManagedTunnelUpgrade, null>): string {
  const { pro, premier } = T3CHAT_PLAN_TUNNEL_LIMITS;
  switch (upgrade) {
    case "link":
      return `关联 T3 Chat Pro 最多可使用 ${pro} 条隧道，关联 Premier 最多可使用 ${premier} 条。`;
    case "pro":
      return `升级到 T3 Chat Pro 最多可使用 ${pro} 条隧道，升级到 Premier 最多可使用 ${premier} 条。`;
    case "premier":
      return `升级到 T3 Chat Premier 最多可使用 ${premier} 条隧道。`;
  }
}

/** "2 of 3 tunnels in use" with one bar slot per tunnel. */
export function TunnelUsageMeter({
  used,
  limit,
  action,
  className,
}: {
  readonly used: number;
  readonly limit: number;
  readonly action?: ReactNode;
  readonly className?: string;
}) {
  const full = used >= limit;
  const fill = full ? "bg-warning" : "bg-foreground/72";
  return (
    <div className={cn("flex max-w-sm flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className={cn("tabular-nums", full ? "text-warning-foreground" : "text-foreground")}>
          已使用 {used} / {limit} 条隧道
        </span>
        {action}
      </div>
      <div
        role="meter"
        aria-label="已使用的云中继隧道"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
        className="flex h-1.5 gap-1"
      >
        {limit <= MAX_SEGMENTS ? (
          Array.from({ length: limit }, (_, index) => (
            <span
              key={index}
              className={cn("flex-1 rounded-full", index < used ? fill : "bg-muted")}
            />
          ))
        ) : (
          <span className="flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className={cn("block h-full rounded-full", fill)}
              style={{ width: `${Math.min(100, (used / limit) * 100)}%` }}
            />
          </span>
        )}
      </div>
    </div>
  );
}

/** Shown when the relay refuses a new tunnel because the account is at its cap. */
export function TunnelLimitAlert({
  upgrade,
  onLinkT3Chat,
  onManageTunnels,
}: {
  readonly upgrade: ManagedTunnelUpgrade;
  readonly onLinkT3Chat: (() => void) | null;
  readonly onManageTunnels: (() => void) | null;
}) {
  const action =
    upgrade === "link" && onLinkT3Chat ? (
      <Button size="sm" onClick={onLinkT3Chat}>
        关联 T3 Chat
      </Button>
    ) : upgrade === "pro" || upgrade === "premier" ? (
      <Button
        size="sm"
        render={<a href={T3CHAT_SUBSCRIPTION_URL} target="_blank" rel="noopener noreferrer" />}
      >
        在 T3 Chat 升级
      </Button>
    ) : onManageTunnels ? (
      <Button size="sm" variant="outline" onClick={onManageTunnels}>
        管理隧道
      </Button>
    ) : null;
  return (
    <Alert variant="warning">
      <TriangleAlertIcon />
      <AlertTitle>隧道名额已用完。</AlertTitle>
      <AlertDescription>
        {upgrade === "link"
          ? "请改用 Tailscale，或关联 T3 Chat 订阅以获得更多隧道。"
          : upgrade
            ? "请改用 Tailscale，或升级 T3 Chat 订阅以获得更多隧道。"
            : "请改用 Tailscale，或注销不再使用的环境。"}
      </AlertDescription>
      {action ? <AlertAction>{action}</AlertAction> : null}
    </Alert>
  );
}
