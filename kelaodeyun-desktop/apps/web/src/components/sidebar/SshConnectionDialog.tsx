import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { inferProjectTitleFromPath } from "@t3tools/client-runtime/state/projects";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { newProjectId } from "../../lib/utils";
import { readProjects, waitForProject } from "../../state/entities";
import { projectEnvironment } from "../../state/projects";
import { useUiStateStore } from "../../uiStateStore";
import { useEffect, useRef, useState } from "react";
import { SshConnectingAnimation } from "./SshConnectingAnimation";
import { Spinner } from "../ui/spinner";
import { ServerIcon } from "lucide-react";
import * as Option from "effect/Option";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useNavigate } from "@tanstack/react-router";
import { useEnvironments, type EnvironmentPresentation } from "../../state/environments";
import { useAtomCommand } from "../../state/use-atom-command";
import { environmentCatalog } from "../../connection/catalog";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogFooter,
} from "../ui/dialog";

export function SshConnectionDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { environments } = useEnvironments();
  const navigate = useNavigate();
  const [animation, setAnimation] = useState<"idle" | "connecting" | "exiting">("idle");
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- cancels the pending dialog fade timer when the dialog owner unmounts
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );
  const changeOpen = (next: boolean) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setAnimation("idle");
    onOpenChange(next);
  };
  const finish = () => {
    setAnimation("exiting");
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 500;
    closeTimer.current = setTimeout(() => changeOpen(false), duration);
  };
  const servers = environments.filter(
    (environment) => environment.entry.target._tag === "SshConnectionTarget",
  );
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogPopup className="sm:max-w-md" showCloseButton={animation === "idle"}>
        {animation !== "idle" ? (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-background transition-opacity duration-500 motion-reduce:transition-none"
            style={{ opacity: animation === "exiting" ? 0 : 1 }}
            role="status"
            aria-label="正在连接云电脑"
          >
            <SshConnectingAnimation />
          </div>
        ) : null}
        <DialogHeader
          style={{ visibility: animation === "idle" ? "visible" : "hidden" }}
          inert={animation !== "idle"}
        >
          <DialogTitle>SSH 连接</DialogTitle>
          <DialogDescription>连接你的远程工作空间。</DialogDescription>
        </DialogHeader>
        <DialogPanel
          style={{ visibility: animation === "idle" ? "visible" : "hidden" }}
          inert={animation !== "idle"}
        >
          <div className="flex flex-col gap-4">
            {servers.map((server) => (
              <SshServerCard
                key={server.environmentId}
                server={server}
                onSelected={finish}
                onConnecting={() => setAnimation("connecting")}
                onConnectionFailed={() => setAnimation("idle")}
                dialogOpen={open}
              />
            ))}
            {servers.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">还没有配置服务器</p>
            ) : null}
          </div>
        </DialogPanel>
        <DialogFooter
          style={{ visibility: animation === "idle" ? "visible" : "hidden" }}
          inert={animation !== "idle"}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              changeOpen(false);
              void navigate({ to: "/settings/connections" });
            }}
          >
            管理服务器
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

export function SshServerCard({
  server,
  onSelected,
  onConnecting,
  onConnectionFailed,
  dialogOpen = true,
}: {
  server: EnvironmentPresentation;
  onSelected?: () => void;
  onConnecting?: () => void;
  onConnectionFailed?: () => void;
  dialogOpen?: boolean;
}) {
  const resumeAfterConnect = useRef(false);
  const createProject = useAtomCommand(projectEnvironment.create, { reportFailure: false });
  const openThread = useNewThreadHandler();
  const enterWorkspace = async () => {
    if (server.connection.phase !== "connected" || !server.serverConfig) return;
    setPending(true);
    setError(null);
    onConnecting?.();
    try {
      const existing = readProjects().find(
        (project) => project.environmentId === server.environmentId && project.archivedAt == null,
      );
      const projectId = existing?.id ?? newProjectId();
      if (!existing) {
        const workspaceRoot = server.serverConfig.cwd;
        const result = await createProject({
          environmentId: server.environmentId,
          input: {
            projectId,
            title: inferProjectTitleFromPath(workspaceRoot),
            workspaceRoot,
            createWorkspaceRootIfMissing: false,
            defaultModelSelection: null,
          },
        });
        if (result._tag === "Failure") throw squashAtomCommandFailure(result);
        await waitForProject(scopeProjectRef(server.environmentId, projectId));
      }
      useUiStateStore.getState().setSidebarProjectScopeKeys([]);
      const opened = await openThread(scopeProjectRef(server.environmentId, projectId));
      if (!opened) throw new Error("工作区尚未就绪，请重试。");
      onSelected?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法打开服务器工作区");
      onConnectionFailed?.();
    } finally {
      setPending(false);
    }
  };
  const setEnabled = useAtomCommand(environmentCatalog.setEnabled, { reportFailure: false });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const profile = Option.getOrNull(server.entry.profile);
  const target = profile?._tag === "SshConnectionProfile" ? profile.target : null;
  const phase = server.connection.phase;
  const connected = phase === "connected";
  const connecting = phase === "connecting" || phase === "reconnecting";
  const status = connected ? "Connected" : connecting ? "Connecting…" : "Disconnected";
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- completes the user-requested SSH handshake before opening that server's workspace
  useEffect(() => {
    if (!dialogOpen) {
      resumeAfterConnect.current = false;
      return;
    }
    if (!resumeAfterConnect.current) return;
    if (connected && server.serverConfig) {
      resumeAfterConnect.current = false;
      void enterWorkspace();
    } else if (server.connection.error && !connecting) {
      resumeAfterConnect.current = false;
      onConnectionFailed?.();
    }
  }, [
    dialogOpen,
    connected,
    connecting,
    server.serverConfig,
    server.connection.error,
    enterWorkspace,
    onConnectionFailed,
  ]);
  const toggle = async () => {
    setPending(true);
    setError(null);
    if (!server.entry.enabled && onConnecting) {
      resumeAfterConnect.current = true;
      onConnecting();
    }
    try {
      const result = await setEnabled({
        environmentId: server.environmentId,
        enabled: !server.entry.enabled,
      });
      if (result._tag === "Failure") {
        resumeAfterConnect.current = false;
        onConnectionFailed?.();
        const cause = squashAtomCommandFailure(result);
        setError(cause instanceof Error ? cause.message : "操作失败，请重试。");
      }
    } catch (cause) {
      resumeAfterConnect.current = false;
      onConnectionFailed?.();
      setError(cause instanceof Error ? cause.message : "操作失败，请重试。");
    } finally {
      setPending(false);
    }
  };
  return (
    <section className="rounded-xl border border-border p-4">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
          {connecting ? (
            <Spinner size="lg" tone="muted" />
          ) : (
            <ServerIcon className="size-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium">{server.label}</h3>
          <p role="status" className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              aria-hidden
              className={
                connected
                  ? "size-1.5 rounded-full bg-success"
                  : "size-1.5 rounded-full bg-muted-foreground"
              }
            />
            {status}
          </p>
        </div>
      </div>
      {target ? (
        <dl className="my-5 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">服务器</dt>
          <dd className="font-mono text-xs">{target.hostname}</dd>
          <dt className="text-muted-foreground">端口</dt>
          <dd className="font-mono text-xs">{target.port ?? 22}</dd>
          <dt className="text-muted-foreground">用户</dt>
          <dd className="font-mono text-xs">{target.username ?? "默认用户"}</dd>
        </dl>
      ) : null}
      {error || server.connection.error ? (
        <p role="alert" className="mb-3 break-words text-xs text-destructive">
          {error ?? server.connection.error}
        </p>
      ) : null}
      {connected ? (
        <div className="mb-2">
          <Button className="w-full" disabled={pending} onClick={() => void enterWorkspace()}>
            {pending ? "正在打开…" : "进入工作区"}
          </Button>
        </div>
      ) : null}
      <Button
        className="w-full"
        variant={server.entry.enabled ? "secondary" : "default"}
        disabled={pending}
        onClick={() => void toggle()}
      >
        {pending
          ? "正在处理…"
          : server.entry.enabled
            ? connecting
              ? "取消连接"
              : "断开连接"
            : "连接服务器"}
      </Button>
    </section>
  );
}
