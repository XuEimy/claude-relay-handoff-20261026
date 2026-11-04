import { useThreadRouteTarget } from "../../hooks/useThreadRouteTarget";
import { useComposerDraftStore } from "../../composerDraftStore";
import { SshConnectionDialog } from "./SshConnectionDialog";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChartNoAxesColumnIcon,
  SettingsIcon,
  UserRoundIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { memo, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";

import { useAtomValue } from "@effect/atom-react";
import { useEnvironmentIdentificationMode } from "../../hooks/useSettings";
import { shortcutLabelForCommand } from "../../keybindings";
import {
  navigateHistory,
  useCanNavigateHistory,
  type HistoryDirection,
} from "../../navigationHistory";
import { primaryServerKeybindingsAtom } from "../../state/server";
import { cn } from "../../lib/utils";
import { useEnvironments, usePullRequestsSupported } from "../../state/environments";
import {
  resolveEnvironmentIdentificationPillLabel,
  resolveSidebarStageBackdropVariant,
  useEnvironmentStageLabel,
} from "../SidebarStageBackdrop";
import { SshConnectionBackdrop } from "./SshConnectionBackdrop";
import "./sshConnection.css";
import { useMockProfile } from "../../hooks/useMockProfile";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { readPullRequestListPreferences } from "../pullRequest/pullRequestListPreferences";
import { isSidebarUtilityPage, useNavigateToMainApp } from "./mainAppLocation";
import { SidebarThreadUndoNotice } from "./SidebarThreadUndoNotice";
import { SidebarProviderUpdatePill } from "./SidebarProviderUpdatePill";
import { SidebarUpdateArchitectureWarning, SidebarUpdatePill } from "./SidebarUpdatePill";
import { PullRequestGlyph } from "~/components/pullRequest/pullRequestIcons";
import { observeResize } from "~/lib/observeResize";

export const SidebarChromeHeader = memo(function SidebarChromeHeader({
  isElectron,
}: {
  isElectron: boolean;
}) {
  const [connectionOpen, setConnectionOpen] = useState(false);
  const { environments } = useEnvironments();
  const sshEnvironments = environments.filter(
    (environment) => environment.entry.target._tag === "SshConnectionTarget",
  );
  const routeTarget = useThreadRouteTarget();
  const routeDraft = useComposerDraftStore((store) =>
    routeTarget?.kind === "draft" ? store.getDraftSession(routeTarget.draftId) : null,
  );
  const activeEnvironmentId =
    routeTarget?.kind === "server"
      ? routeTarget.threadRef.environmentId
      : routeDraft?.environmentId;
  const ssh =
    sshEnvironments.find((environment) => environment.environmentId === activeEnvironmentId) ??
    sshEnvironments.find((environment) => environment.connection.phase === "connected") ??
    sshEnvironments[0];
  const connected = ssh?.connection.phase === "connected";
  const statusLabel = connected
    ? "Connected"
    : ssh?.connection.phase === "connecting" || ssh?.connection.phase === "reconnecting"
      ? "Connecting…"
      : "Disconnected";
  const stageLabel = useEnvironmentStageLabel();
  const environmentIdentificationMode = useEnvironmentIdentificationMode();
  const backdropVariant = resolveSidebarStageBackdropVariant(
    stageLabel,
    environmentIdentificationMode,
  );
  const pillLabel =
    environmentIdentificationMode === "pill"
      ? resolveEnvironmentIdentificationPillLabel(stageLabel)
      : null;

  return (
    <div
      className={cn(
        "relative flex h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center gap-2 pr-3",
        isElectron && "drag-region",
      )}
      data-ssh-chrome=""
      data-connection={connected ? "connected" : "disconnected"}
    >
      <SshConnectionDialog open={connectionOpen} onOpenChange={setConnectionOpen} />
      {backdropVariant ? (
        <SshConnectionBackdrop key={String(connected)} connected={connected} />
      ) : null}
      <div className="relative top-[calc(var(--workspace-controls-top)-env(safe-area-inset-top))] z-10 ml-[calc(var(--workspace-controls-left)+1px-env(safe-area-inset-left))] flex shrink-0 items-center md:hidden">
        <SidebarTrigger
          variant={backdropVariant ? "media-navigation" : "ghost"}
          className="relative top-auto translate-y-0"
          aria-label="切换主侧栏"
        />
      </div>
      <div className="relative z-10 flex h-8 min-w-0 flex-1 flex-wrap content-start items-center gap-x-2 overflow-hidden py-0.5">
        <div className="flex shrink-0 items-center gap-1">
          <SidebarBrand
            onBackdrop={backdropVariant !== null}
            connected={connected}
            statusLabel={statusLabel}
            title={
              ssh
                ? `${ssh.label} · ${statusLabel}${ssh.connection.error ? ` · ${ssh.connection.error}` : ""}`
                : "配置 SSH 连接"
            }
            onToggle={() => setConnectionOpen(true)}
          />
          {isElectron ? (
            <div className="hidden items-center md:flex">
              <HistoryNavigationButton direction="back" onBackdrop={backdropVariant !== null} />
              <HistoryNavigationButton direction="forward" onBackdrop={backdropVariant !== null} />
            </div>
          ) : null}
        </div>
        {pillLabel ? (
          <div className="ml-1 flex h-7 items-center">
            <Badge data-environment-identification="pill" size="sm" variant="secondary">
              {pillLabel}
            </Badge>
          </div>
        ) : null}
      </div>
    </div>
  );
});

export function SidebarBrandWidthProbe({
  isElectron,
  onWidthChange,
}: {
  isElectron: boolean;
  onWidthChange: (width: number) => void;
}) {
  const observeWidth = (probe: HTMLDivElement) => {
    return observeResize(probe, ([entry]) => {
      if (entry) onWidthChange(entry.borderBoxSize[0]?.inlineSize ?? probe.offsetWidth);
    });
  };

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none invisible fixed top-0 left-0 flex w-max border-r border-transparent pr-3"
      ref={observeWidth}
    >
      <div className="ml-[var(--workspace-titlebar-content-left)] flex gap-1">
        <Button size="sm" variant="ghost" className="w-32 justify-start" tabIndex={-1}>
          <SidebarBrandMark onBackdrop={false} connected={false} />
        </Button>
        {isElectron ? <div className="w-[calc(2*var(--workspace-titlebar-control-size))]" /> : null}
      </div>
    </div>
  );
}

function HistoryNavigationButton({
  direction,
  onBackdrop,
}: {
  direction: HistoryDirection;
  onBackdrop: boolean;
}) {
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const enabled = useCanNavigateHistory(direction);
  const label = direction === "back" ? "后退" : "前进";
  const shortcutLabel = shortcutLabelForCommand(
    keybindings,
    direction === "back" ? "navigation.back" : "navigation.forward",
  );
  const Icon = direction === "back" ? ArrowLeftIcon : ArrowRightIcon;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            className={cn(
              "[-webkit-app-region:no-drag]",
              onBackdrop && "relative top-auto translate-y-0",
            )}
            disabled={!enabled}
            onClick={() => navigateHistory(direction)}
            size="icon-sm"
            variant={onBackdrop ? "media-navigation" : "ghost"}
          />
        }
      >
        <Icon className="size-3.5" />
      </TooltipTrigger>
      <TooltipPopup side="bottom">
        {label}
        {shortcutLabel ? ` (${shortcutLabel})` : ""}
      </TooltipPopup>
    </Tooltip>
  );
}

function SidebarBrand({
  onBackdrop,
  connected,
  onToggle,
  statusLabel,
  title,
}: {
  onBackdrop: boolean;
  connected: boolean;
  onToggle: () => void;
  statusLabel: string;
  title: string;
}) {
  return (
    <Button
      size="sm"
      variant={onBackdrop ? "media-navigation" : "ghost"}
      data-ssh-part="connection-status"
      className="relative top-auto z-10 ml-[var(--workspace-titlebar-content-left)] hidden w-32 min-w-0 shrink-0 translate-y-0 justify-start md:flex [-webkit-app-region:no-drag]"
      aria-label={`${statusLabel} · SSH 连接设置`}
      title={title}
      onClick={onToggle}
    >
      <SidebarBrandMark onBackdrop={onBackdrop} connected={connected} statusLabel={statusLabel} />
    </Button>
  );
}

function SidebarBrandMark({
  onBackdrop,
  connected,
  statusLabel,
}: {
  onBackdrop: boolean;
  connected: boolean;
  statusLabel?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-sm font-medium tracking-tight",
        onBackdrop ? "text-white/80" : "text-muted-foreground",
      )}
    >
      <span
        data-ssh-part="status-dot"
        key={String(connected)}
        aria-hidden="true"
        className={cn(
          "relative size-1.5 shrink-0 rounded-full",
          connected ? "bg-success" : "bg-muted-foreground",
        )}
      />
      <span aria-live="polite">{statusLabel ?? (connected ? "Connected" : "Disconnected")}</span>
    </span>
  );
}

function SidebarUtilityItem({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <SidebarMenuItem className="shrink-0">
      <Tooltip>
        <TooltipTrigger
          render={
            <SidebarMenuButton aria-label={label} onClick={onClick} size="icon">
              {icon}
            </SidebarMenuButton>
          }
        />
        <TooltipPopup side="top">{label}</TooltipPopup>
      </Tooltip>
    </SidebarMenuItem>
  );
}

const SidebarUtilityMenu = memo(function SidebarUtilityMenu() {
  const profile = useMockProfile();
  const navigate = useNavigate();
  const navigateToMainApp = useNavigateToMainApp();
  const { isMobile, setOpenMobile } = useSidebar();
  const isOnUtilityPage = useLocation({
    select: (location) => isSidebarUtilityPage(location.pathname),
  });
  const pullRequestsSupported = usePullRequestsSupported();
  const closeMobileSidebar = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };
  const handlePullRequestsClick = () => {
    closeMobileSidebar();
    void navigate({
      to: "/pull-requests",
      search: readPullRequestListPreferences(),
    });
  };
  const handleSettingsClick = () => {
    closeMobileSidebar();
    void navigate({ to: "/settings" });
  };

  const handleUsageClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
    void navigate({ to: "/usage" });
  };

  const handleBackClick = () => {
    closeMobileSidebar();
    void navigateToMainApp();
  };

  return (
    <SidebarMenu className="flex-row items-center">
      <SidebarMenuItem className="min-w-0 flex-1">
        <SidebarMenuButton
          aria-label="个人资料"
          onClick={() => {
            closeMobileSidebar();
            void navigate({ to: "/settings/profile" });
          }}
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <UserRoundIcon className="size-3.5" />
          </span>
          <span className="truncate">{profile.name}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      {isOnUtilityPage ? (
        <SidebarMenuItem className="min-w-0 flex-1">
          <SidebarMenuButton onClick={handleBackClick}>
            <ArrowLeftIcon />
            <span>返回</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ) : (
        <>
          <SidebarUtilityItem icon={<SettingsIcon />} label="设置" onClick={handleSettingsClick} />
          {pullRequestsSupported ? (
            <SidebarUtilityItem
              icon={<PullRequestGlyph.pullRequest />}
              label="拉取请求"
              onClick={handlePullRequestsClick}
            />
          ) : null}
          <SidebarUtilityItem
            icon={<ChartNoAxesColumnIcon />}
            label="用量"
            onClick={handleUsageClick}
          />
        </>
      )}
      <SidebarThreadUndoNotice />
      <SidebarUpdatePill />
    </SidebarMenu>
  );
});

export const SidebarChromeFooter = memo(function SidebarChromeFooter() {
  return (
    <SidebarFooter>
      <SidebarProviderUpdatePill />
      <SidebarUpdateArchitectureWarning />
      <SidebarUtilityMenu />
    </SidebarFooter>
  );
});
