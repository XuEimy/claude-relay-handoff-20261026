import { useEnterEnvironmentWorkspace } from "./useEnterEnvironmentWorkspace";
import { useEffect, useRef, useState } from "react";
import { SshConnectingAnimation } from "./SshConnectingAnimation";
import { SshConnectionTicker } from "./SshConnectionTicker";
import { sshProgressLine, useSshConnectionProgress } from "./useSshConnectionProgress";
import { Spinner } from "../ui/spinner";
import { MacIcon } from "./MacIcons";
import * as Option from "effect/Option";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useNavigate } from "@tanstack/react-router";
import { useEnvironments, type EnvironmentPresentation } from "../../state/environments";
import { useAtomCommand } from "../../state/use-atom-command";
import { environmentCatalog } from "../../connection/catalog";
import { connectSshEnvironment } from "../../connection/onboarding";
import { useAccountHosts } from "../../hooks/useDesktopAccount";
import { unmatchedAccountHosts } from "./accountHosts";
import {
  accountHostMatchesTarget,
  accountHostSshTarget,
  type DesktopAccountHost,
  type DesktopSshEnvironmentTarget,
} from "@t3tools/contracts";
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
  const [connectingTarget, setConnectingTarget] = useState<DesktopSshEnvironmentTarget | null>(
    null,
  );
  const progress = useSshConnectionProgress(connectingTarget);
  const { hosts: accountHosts, error: accountError } = useAccountHosts(open);
  const [accountConnecting, setAccountConnecting] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const connectAccountHost = useAtomCommand(connectSshEnvironment, { reportFailure: false });
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
    setConnectingTarget(null);
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
  const targets = servers.flatMap((server) => {
    const profile = Option.getOrNull(server.entry.profile);
    return profile?._tag === "SshConnectionProfile" ? [profile.target] : [];
  });
  const availableAccountHosts = unmatchedAccountHosts(accountHosts, targets);
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogPopup className="sm:max-w-md" showCloseButton={animation === "idle"}>
        {animation !== "idle" ? (
          <div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 rounded-[inherit] bg-background transition-opacity duration-500 motion-reduce:transition-none"
            style={{ opacity: animation === "exiting" ? 0 : 1 }}
          >
            <SshConnectingAnimation />
            <SshConnectionTicker
              line={
                progress
                  ? sshProgressLine(progress)
                  : { key: "connecting", text: "正在连接云电脑…" }
              }
            />
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
                accountHosts={accountHosts}
                onSelected={finish}
                onConnecting={() => {
                  const profile = Option.getOrNull(server.entry.profile);
                  setConnectingTarget(
                    profile?._tag === "SshConnectionProfile" ? profile.target : null,
                  );
                  setAnimation("connecting");
                }}
                onConnectionFailed={() => {
                  setConnectingTarget(null);
                  setAnimation("idle");
                }}
                dialogOpen={open}
              />
            ))}
            {availableAccountHosts.length ? (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">账户中的服务器</h3>
                {availableAccountHosts.map((host) => (
                  <div
                    key={host.id}
                    className="flex items-center justify-between gap-2 rounded-md border p-3"
                  >
                    <MacIcon
                      kind={host.source === "purchased" ? "mini" : "imac"}
                      size="sm"
                      className="size-9 shrink-0 text-muted-foreground"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">
                        {host.label} {host.source === "purchased" ? "· 已购买" : ""}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {host.username}@{host.hostname}:{host.port}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={accountConnecting !== null}
                      onClick={() => {
                        setAccountConnecting(host.id);
                        setConnectionError(null);
                        void connectAccountHost({
                          target: accountHostSshTarget(host),
                          label: host.label,
                        })
                          .then((result) => {
                            if (result._tag === "Failure") {
                              const cause = squashAtomCommandFailure(result);
                              setConnectionError(
                                cause instanceof Error ? cause.message : "连接失败",
                              );
                            }
                          })
                          .finally(() => setAccountConnecting(null));
                      }}
                    >
                      {accountConnecting === host.id ? "连接中…" : "连接"}
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
            {accountError || connectionError ? (
              <p className="text-sm text-destructive">{accountError || connectionError}</p>
            ) : null}
            {servers.length === 0 && availableAccountHosts.length === 0 ? (
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
  accountHosts = [],
}: {
  server: EnvironmentPresentation;
  onSelected?: () => void;
  onConnecting?: () => void;
  onConnectionFailed?: () => void;
  dialogOpen?: boolean;
  accountHosts?: readonly DesktopAccountHost[];
}) {
  const resumeAfterConnect = useRef(false);
  const openWorkspace = useEnterEnvironmentWorkspace();
  const enterWorkspace = async () => {
    if (server.connection.phase !== "connected" || !server.serverConfig) return;
    setPending(true);
    setError(null);
    onConnecting?.();
    try {
      await openWorkspace(server);
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
  const matchingHost = target
    ? accountHosts.find((host) => accountHostMatchesTarget(host, target))
    : undefined;
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
            <MacIcon
              kind={
                matchingHost?.source === "purchased" ? "mini" : matchingHost ? "imac" : "macbook"
              }
              connected={connected}
              size="sm"
              className="size-7 text-muted-foreground"
            />
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
