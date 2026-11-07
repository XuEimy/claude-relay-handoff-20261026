import type { DesktopSshEnvironmentTarget, EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { useEffect } from "react";
import { create } from "zustand";
import { useEnvironments } from "../../state/environments";
import type { CliStatus } from "./sessionLight";

const seenKey = "kelaodeyun:cli-session-seen:v1";
function readSeen(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(seenKey) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, value]) => typeof value === "number" && Number.isFinite(value),
      ),
    );
  } catch {
    return {};
  }
}

const useStatusStore = create<{
  statuses: Record<string, Record<string, CliStatus>>;
  seen: Record<string, number>;
}>(() => ({ statuses: {}, seen: readSeen() }));

export function markCliSessionSeen(environmentId: EnvironmentId, sessionId: string, at: number) {
  const key = `${environmentId}:${sessionId}`;
  const seen = useStatusStore.getState().seen;
  if ((seen[key] ?? 0) >= at) return;
  const next = { ...seen, [key]: at };
  useStatusStore.setState({ seen: next });
  try {
    window.localStorage.setItem(seenKey, JSON.stringify(next));
  } catch {
    // Storage can be unavailable in private browsing.
  }
}

export function useCloudClaudeSessionStatus(
  environmentId: EnvironmentId | undefined,
  sessionId: string | undefined,
) {
  return useStatusStore((state) =>
    environmentId && sessionId ? (state.statuses[environmentId]?.[sessionId] ?? null) : null,
  );
}

export function useCliSessionSeen(
  environmentId: EnvironmentId | undefined,
  sessionId: string | undefined,
) {
  return useStatusStore((state) =>
    environmentId && sessionId ? (state.seen[`${environmentId}:${sessionId}`] ?? null) : null,
  );
}

const pollers = new Map<string, { count: number; stop: () => void }>();

function subscribe(environmentId: EnvironmentId, target: DesktopSshEnvironmentTarget) {
  const existing = pollers.get(environmentId);
  if (existing) {
    existing.count++;
  } else {
    let cancelled = false;
    let pending = false;
    const refresh = async () => {
      if (cancelled || pending || document.hidden || !window.desktopBridge?.sshFileOperation)
        return;
      pending = true;
      try {
        const output = await window.desktopBridge.sshFileOperation({
          target,
          cwd: "/",
          relativePath: "status",
          operation: "claude-status",
        });
        const rows: unknown = JSON.parse(output);
        if (cancelled || !Array.isArray(rows)) return;
        const statuses: Record<string, CliStatus> = {};
        for (const row of rows) {
          if (
            row &&
            typeof row.id === "string" &&
            ["running", "needs-input", "failed", "done", "idle"].includes(row.state) &&
            typeof row.at === "number" &&
            Number.isFinite(row.at)
          )
            statuses[row.id] = { state: row.state, at: row.at };
        }
        useStatusStore.setState((state) => ({
          statuses: { ...state.statuses, [environmentId]: statuses },
        }));
      } catch {
        // Keep the last known status when SSH is temporarily unavailable.
      } finally {
        pending = false;
      }
    };
    const onFocus = () => void refresh();
    const interval = window.setInterval(onFocus, 5000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    pollers.set(environmentId, {
      count: 1,
      stop: () => {
        cancelled = true;
        window.clearInterval(interval);
        window.removeEventListener("focus", onFocus);
        document.removeEventListener("visibilitychange", onFocus);
      },
    });
    void refresh();
  }
  return () => {
    const poller = pollers.get(environmentId);
    if (poller && --poller.count === 0) {
      poller.stop();
      pollers.delete(environmentId);
    }
  };
}

export function useCloudClaudeStatusPolling(environmentId: EnvironmentId | undefined) {
  const { environments } = useEnvironments();
  const environment = environments.find((item) => item.environmentId === environmentId);
  const profile = environment ? Option.getOrNull(environment.entry.profile) : null;
  const target = profile?._tag === "SshConnectionProfile" ? profile.target : null;
  const targetKey = JSON.stringify(target);
  const connected = environment?.connection.phase === "connected";
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- shares the SSH poller across mounted sidebar sections
  useEffect(() => {
    if (!environmentId || !connected || !targetKey || targetKey === "null") return;
    return subscribe(environmentId, JSON.parse(targetKey) as DesktopSshEnvironmentTarget);
  }, [environmentId, connected, targetKey]);
}

export function claudeSettingsArgument(output: string): string {
  try {
    const path: unknown = JSON.parse(output)?.settingsPath;
    return typeof path === "string" && path && !path.includes("'") ? ` --settings '${path}'` : "";
  } catch {
    return "";
  }
}
