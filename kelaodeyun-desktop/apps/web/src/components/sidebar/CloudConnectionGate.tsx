import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEnvironments } from "../../state/environments";
import { useThreadRouteTarget } from "../../hooks/useThreadRouteTarget";
import { useComposerDraftStore } from "../../composerDraftStore";
import { SshServerCard } from "./SshConnectionDialog";
import { useSshConnectionCelebration } from "./useSshConnectionCelebration";
import { Button } from "../ui/button";
import { SshConnectingAnimation } from "./SshConnectingAnimation";

export function CloudConnectionGate({ children }: { children: ReactNode }) {
  const { environments, isReady } = useEnvironments();
  const pathname = useLocation({ select: (location) => location.pathname });
  const navigate = useNavigate();
  const target = useThreadRouteTarget();
  const draft = useComposerDraftStore((store) =>
    target?.kind === "draft" ? store.getDraftSession(target.draftId) : null,
  );
  const environmentId =
    target?.kind === "server"
      ? target.threadRef.environmentId
      : draft?.environmentId;
  const servers = environments.filter(
    (environment) => environment.entry.target._tag === "SshConnectionTarget",
  );
  const server =
    servers.find(
      (environment) =>
        environment.environmentId === environmentId &&
        environment.entry.enabled,
    ) ??
    servers.find(
      (environment) =>
        environment.entry.enabled &&
        environment.connection.phase === "connected",
    ) ??
    servers.find((environment) => environment.entry.enabled) ??
    servers[0];
  const connected = server?.connection.phase === "connected";

  const connecting =
    !isReady ||
    server?.connection.phase === "connecting" ||
    server?.connection.phase === "reconnecting";
  const [retainAnimation, setRetainAnimation] = useState(connecting);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- retains the connection overlay until its exit transition finishes and cancels on reconnection
  useEffect(() => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const duration = connected && !reduced ? 500 : 0;
    const timer = window.setTimeout(
      () => setRetainAnimation(connecting),
      duration,
    );
    return () => window.clearTimeout(timer);
  }, [connecting, connected]);
  useSshConnectionCelebration(connected && !retainAnimation);
  if (pathname.startsWith("/settings")) return children;
  if (connecting || (connected && retainAnimation)) {
    return (
      <>
        {connected ? children : null}
        <main
          className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black transition-opacity duration-500 ease-out motion-reduce:transition-none"
          style={{
            opacity: connected ? 0 : 1,
            pointerEvents: connected ? "none" : "auto",
          }}
          aria-label="正在连接云电脑"
          aria-busy="true"
        >
          <div className="flex flex-col items-center gap-6">
            <SshConnectingAnimation />
            <div className="max-w-sm space-y-4 px-6 text-center text-white">
              <p role="status" className="text-sm">
                {server?.connection.phase === "reconnecting"
                  ? "连接中断，正在重新连接云电脑。"
                  : "正在连接云电脑…"}
              </p>
              {server?.connection.phase === "reconnecting" &&
              servers.some((item) => item.connection.phase === "connected") ? (
                <div className="space-y-3 rounded-xl bg-background p-4 text-left text-foreground">
                  <p className="text-sm">也可以选择已连接的工作区：</p>
                  {servers
                    .filter((item) => item.connection.phase === "connected")
                    .map((item) => (
                      <SshServerCard key={item.environmentId} server={item} />
                    ))}
                </div>
              ) : null}
              <Button
                variant="secondary"
                onClick={() => void navigate({ to: "/settings/connections" })}
              >
                查看连接与管理服务器
              </Button>
            </div>
          </div>
          <div className="absolute inset-x-0 top-0 h-12 drag-region" />
        </main>
      </>
    );
  }
  if (connected) return children;
  return (
    <main className="flex h-dvh w-full items-center justify-center bg-background px-6">
      <div className="absolute inset-x-0 top-0 h-12 drag-region" />
      <section className="w-full max-w-sm space-y-6" aria-label="连接云电脑">
        <div className="space-y-2 text-center">
          <h1 className="text-xl font-medium">连接你的云电脑</h1>
          <p role="status" className="text-sm text-muted-foreground">
            连接成功后，即可使用远程对话、终端和文件。
          </p>
        </div>
        {servers.map((item) => (
          <SshServerCard key={item.environmentId} server={item} />
        ))}
        <div className="flex justify-center">
          <Button
            variant="ghost"
            onClick={() => void navigate({ to: "/settings/connections" })}
          >
            管理服务器
          </Button>
        </div>
      </section>
    </main>
  );
}
