import { useEffect, useState } from "react";
import * as Option from "effect/Option";
import type { ScopedThreadRef, DesktopSshEnvironmentTarget } from "@t3tools/contracts";
import { useEnvironments } from "../../state/environments";

const confirmedWorkspaces = new Map<string, string>();

export function useCloudSessionWorkspace(threadRef: ScopedThreadRef | null, lookupCwd?: string) {
  const { environments } = useEnvironments();
  const environment = environments.find((item) => item.environmentId === threadRef?.environmentId);
  const profile = environment ? Option.getOrNull(environment.entry.profile) : null;
  const targetKey = JSON.stringify(
    profile?._tag === "SshConnectionProfile" ? profile.target : null,
  );
  const sessionId = threadRef?.threadId.startsWith("cloud-claude-")
    ? threadRef.threadId.slice(13)
    : null;
  const connected = environment?.connection.phase === "connected";
  const key = JSON.stringify([threadRef?.environmentId, sessionId, targetKey, lookupCwd]);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    cwd: string | null;
    error: string | null;
  } | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- resolves the active native session's recorded cwd over SSH and rejects late responses from other sessions
  useEffect(() => {
    if (!sessionId || !lookupCwd || !connected || !window.desktopBridge?.sshFileOperation) return;
    const target = JSON.parse(targetKey) as DesktopSshEnvironmentTarget | null;
    if (!target) return;
    let cancelled = false;
    let pending = false;
    const refresh = async () => {
      if (cancelled || pending || document.hidden) return;
      pending = true;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const request = window.desktopBridge!.sshFileOperation!({
          target,
          cwd: lookupCwd,
          relativePath: sessionId,
          operation: "claude-info",
        });
        const raw = await Promise.race([
          request,
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(new Error("读取会话目录超时，请稍后重试")), 15_000);
          }),
        ]);
        const info = JSON.parse(raw) as {
          sessionId?: string;
          cwd?: string | null;
          exists?: boolean;
        };
        if (!cancelled) {
          const resolvedCwd =
            info.sessionId === sessionId &&
            info.exists === true &&
            typeof info.cwd === "string" &&
            info.cwd.startsWith("/")
              ? info.cwd
              : null;
          if (resolvedCwd) confirmedWorkspaces.set(key, resolvedCwd);
          else confirmedWorkspaces.delete(key);
          setState({ key, cwd: resolvedCwd, error: null });
        }
      } catch (cause) {
        if (!cancelled)
          setState({
            key,
            cwd: confirmedWorkspaces.get(key) ?? null,
            error: cause instanceof Error ? cause.message : "无法确认此 session 的工作目录",
          });
      } finally {
        clearTimeout(timeout);
        pending = false;
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [key, targetKey, sessionId, lookupCwd, connected, retryAttempt]);
  const cachedCwd = confirmedWorkspaces.get(key);
  const current = state?.key === key ? state : cachedCwd ? { cwd: cachedCwd, error: null } : null;
  const canLookup = Boolean(
    sessionId &&
    lookupCwd &&
    connected &&
    targetKey !== "null" &&
    window.desktopBridge?.sshFileOperation,
  );
  return {
    retry: () => setRetryAttempt((attempt) => attempt + 1),
    sessionId,
    cwd: current?.cwd ?? null,
    error:
      current?.error ??
      (sessionId && !canLookup && !current ? "云电脑尚未就绪，请检查连接后重试" : null),
    loading: Boolean(canLookup && !current),
  };
}
