import { useEffect, useState } from "react";
import * as Option from "effect/Option";
import type { DesktopSshEnvironmentTarget, ScopedThreadRef } from "@t3tools/contracts";
import { useEnvironments } from "../../state/environments";
import { cloudClaudeTimelineEntries, type CloudClaudeMessage } from "./cloudClaudeHistory";

export function useCloudClaudeHistory(threadRef: ScopedThreadRef | null, cwd: string | undefined) {
  const { environments } = useEnvironments();
  const environment = environments.find((item) => item.environmentId === threadRef?.environmentId);
  const profile = environment ? Option.getOrNull(environment.entry.profile) : null;
  const sessionId = threadRef?.threadId.startsWith("cloud-claude-")
    ? threadRef.threadId.slice("cloud-claude-".length)
    : null;
  const targetKey = JSON.stringify(
    profile?._tag === "SshConnectionProfile" ? profile.target : null,
  );
  const connected = environment?.connection.phase === "connected";
  const key = JSON.stringify([threadRef?.environmentId, sessionId, cwd]);
  const [state, setState] = useState<{
    key: string;
    messages: CloudClaudeMessage[];
    error: string | null;
  } | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- imports the native SSH transcript into the shared timeline and discards stale navigation results
  useEffect(() => {
    let cancelled = false;
    const target = JSON.parse(targetKey) as DesktopSshEnvironmentTarget | null;
    if (!target || !connected || !sessionId || !cwd || !window.desktopBridge?.sshFileOperation)
      return;
    void window.desktopBridge
      .sshFileOperation({ target, cwd, relativePath: sessionId, operation: "claude-read" })
      .then((data) => {
        if (!cancelled)
          setState({ key, messages: JSON.parse(data) as CloudClaudeMessage[], error: null });
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setState({
            key,
            messages: [],
            error: cause instanceof Error ? cause.message : "无法读取云端历史",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [targetKey, connected, cwd, sessionId, key]);
  const current = state?.key === key ? state : null;
  const entries = cloudClaudeTimelineEntries(current?.messages ?? []);
  return {
    entries,
    error: current?.error ?? null,
    loading: sessionId !== null && current === null,
  };
}
