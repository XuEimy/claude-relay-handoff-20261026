import { WorkspaceLoadingPlaceholder } from "../WorkspaceLoadingPlaceholder";
import { create } from "zustand";
import { SidebarErrorDialog } from "./SidebarErrorDialog";
import { SidebarInteractiveRow } from "./SidebarInteractiveRow";
import * as Schema from "effect/Schema";
import { useRef, type ReactNode } from "react";
import { getLocalStorageItem } from "../../hooks/useLocalStorage";
import { useAtomCommand } from "../../state/use-atom-command";
import { terminalEnvironment } from "../../state/terminal";
import { useKnownTerminalSessions } from "../../state/terminalSessions";
import { useTerminalUiStateStore, selectThreadTerminalUiState } from "../../terminalUiStateStore";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { randomUUID } from "../../lib/utils";
import { useEffect, useState } from "react";
import * as Option from "effect/Option";
import { useNavigate } from "@tanstack/react-router";
import {
  ProviderDriverKind,
  CommandId,
  ThreadId,
  type EnvironmentId,
  type ProjectId,
} from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useEnvironments, useEnvironmentProviders } from "../../state/environments";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { orchestrationEnvironment } from "../../state/orchestration";
import { readThreadShell } from "../../state/entities";
import { resolveProjectDefaultProviderModelSelection } from "../../providerInstances";

const useCloudResumeState = create<{ sessionId: string | null }>(() => ({ sessionId: null }));

interface NativeSession {
  id: string;
  title: string;
  updatedAt: number;
}
const sessionListCache = new Map<string, NativeSession[]>();

export function CloudClaudeSessions({
  environmentId,
  projectId,
  cwd,
  currentThreadRef,
  query,
  session,
  nested = false,
  showEmpty = true,
  emptyState,
  rowClassName,
}: {
  environmentId: EnvironmentId | undefined;
  projectId: ProjectId | undefined;
  cwd: string | undefined;
  currentThreadRef: ScopedThreadRef | null;
  query: string;
  session?: NativeSession;
  nested?: boolean;
  showEmpty?: boolean;
  emptyState?: ReactNode;
  rowClassName?: string;
}) {
  const { environments } = useEnvironments();
  const providers = useEnvironmentProviders();
  const environment = environments.find((item) => item.environmentId === environmentId);
  const profile = environment ? Option.getOrNull(environment.entry.profile) : null;
  const target = profile?._tag === "SshConnectionProfile" ? profile.target : null;
  const connected = environment?.connection.phase === "connected";
  const listRequestKey = JSON.stringify(target);
  const cacheKey = JSON.stringify([environmentId, listRequestKey, cwd]);
  const [result, setResult] = useState<{ key: string; sessions: NativeSession[] } | null>(null);
  const sessions =
    result?.key === cacheKey ? result.sessions : (sessionListCache.get(cacheKey) ?? []);
  const loading =
    !session && connected && result?.key !== cacheKey && !sessionListCache.has(cacheKey);
  const [error, setError] = useState<string | null>(null);
  const importingSessionId = useCloudResumeState((state) => state.sessionId);
  const setImportingSessionId = (sessionId: string | null) =>
    useCloudResumeState.setState({ sessionId });
  const importing = importingSessionId !== null;
  const dispatch = useOrchestrationCommand(orchestrationEnvironment.v2.dispatchCommand, {
    reportFailure: false,
  });
  const navigate = useNavigate();
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- reads native Claude sessions over SSH and cancels stale results on workspace changes
  useEffect(() => {
    let cancelled = false;
    const target = JSON.parse(listRequestKey) as
      | import("@t3tools/contracts").DesktopSshEnvironmentTarget
      | null;
    if (session || !target || !cwd || !connected || !window.desktopBridge?.sshFileOperation) return;
    let pending = false;
    const refresh = async () => {
      if (cancelled || pending || document.hidden) return;
      pending = true;
      try {
        const data = await window.desktopBridge!.sshFileOperation!({
          target,
          cwd,
          relativePath: "sessions",
          operation: "claude-list",
        });
        if (!cancelled) {
          const next = JSON.parse(data) as NativeSession[];
          sessionListCache.set(cacheKey, next);
          setResult({ key: cacheKey, sessions: next });
          setError(null);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "无法读取云端会话");
          setResult({ key: cacheKey, sessions: sessionListCache.get(cacheKey) ?? [] });
        }
      } finally {
        pending = false;
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [listRequestKey, cacheKey, cwd, connected, session]);
  const openTerminal = useAtomCommand(terminalEnvironment.open);
  const writeTerminal = useAtomCommand(terminalEnvironment.write);
  const knownSessions = useKnownTerminalSessions({
    environmentId: environmentId ?? null,
    threadId: null,
  });
  const inFlight = useRef(false);
  const resume = async (selected: NativeSession) => {
    if (
      !selected ||
      !environmentId ||
      !projectId ||
      !environment?.serverConfig ||
      importing ||
      useCloudResumeState.getState().sessionId !== null ||
      inFlight.current
    )
      return;
    const selection = resolveProjectDefaultProviderModelSelection(
      (providers.get(environmentId) ?? []).filter((provider) => provider.driver === "claudeAgent"),
      environment.serverConfig.settings,
      projectId,
    );
    if (!selection) {
      setError("云电脑的 Claude 尚未就绪，请先检查提供程序。");
      return;
    }
    const threadId = ThreadId.make(`cloud-claude-${selected.id}`);
    const terminalMode =
      (getLocalStorageItem("t3code:terminal-workspace:v1", Schema.Boolean) ?? true) &&
      selectThreadTerminalUiState(
        useTerminalUiStateStore.getState().terminalUiStateByThreadKey,
        currentThreadRef,
      ).terminalOpen;
    if (terminalMode && knownSessions === null) {
      setError("正在读取终端状态，请稍后再试。");
      return;
    }
    inFlight.current = true;
    setImportingSessionId(selected.id);
    setError(null);
    try {
      if (!readThreadShell({ environmentId, threadId })) {
        const result = await dispatch({
          environmentId,
          input: {
            type: "thread.create",
            commandId: CommandId.make(randomUUID()),
            threadId,
            projectId,
            title: selected.title || "Claude 会话",
            modelSelection: selection,
            runtimeMode: "approval-required",
            interactionMode: "default",
            branch: null,
            worktreePath: null,
            createdBy: "user",
            creationSource: "web",
            importedNativeThread: {
              ref: {
                driver: ProviderDriverKind.make("claudeAgent"),
                nativeId: selected.id,
                strength: "strong",
              },
              metadata: { title: selected.title },
            },
          },
        });
        if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      }
      if (terminalMode && cwd) {
        const terminalId = `claude-native-${selected.id}`;
        const existing = knownSessions?.find(
          (session) =>
            session.target.threadId === threadId && session.target.terminalId === terminalId,
        );
        if (!existing?.state.hasRunningSubprocess) {
          if (!/^[a-fA-F0-9-]{36}$/.test(selected.id)) throw new Error("会话 ID 无效");
          const opened = await openTerminal({
            environmentId,
            input: { threadId, terminalId, cwd },
          });
          if (opened._tag === "Failure") throw squashAtomCommandFailure(opened);
          if (target && window.desktopBridge?.sshFileOperation) {
            await window.desktopBridge.sshFileOperation({
              target,
              cwd,
              relativePath: ".",
              operation: "claude-trust",
            });
          }
          const written = await writeTerminal({
            environmentId,
            input: { threadId, terminalId, data: `claude --resume '${selected.id}'\n` },
          });
          if (written._tag === "Failure") throw squashAtomCommandFailure(written);
        }
        useTerminalUiStateStore
          .getState()
          .ensureTerminal({ environmentId, threadId }, terminalId, { open: true, active: true });
      }
      await navigate({ to: "/$environmentId/$threadId", params: { environmentId, threadId } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法继续此会话");
    } finally {
      inFlight.current = false;
      setImportingSessionId(null);
    }
  };
  if (!target || !cwd) return null;
  return (
    <section className={nested ? "min-w-0" : "px-2 py-2"} aria-label="云端 Claude CLI 会话">
      {loading ? <WorkspaceLoadingPlaceholder compact /> : null}
      {!session && showEmpty && !loading && sessions.length === 0
        ? (emptyState ?? (
            <p className="px-3 py-2 text-xs text-muted-foreground">此目录暂无 CLI 对话</p>
          ))
        : null}
      {(session ? [session] : sessions)
        .filter((session) => session.title.toLowerCase().includes(query.toLowerCase()))
        .map((session) => {
          const active =
            currentThreadRef?.environmentId === environmentId &&
            currentThreadRef?.threadId === `cloud-claude-${session.id}`;
          const pending = importingSessionId === session.id;
          return (
            <SidebarInteractiveRow
              className={rowClassName}
              key={session.id}
              type="button"
              disabled={importing || !connected}
              aria-current={active ? "page" : undefined}
              active={active}
              pending={pending}
              dimmed={!connected || (importing && !pending)}
              onClick={() => void resume(session)}
            >
              <span className="min-w-0 flex-1 truncate">{session.title}</span>
              {pending ? (
                <span role="status" className="shrink-0 text-xs text-muted-foreground">
                  恢复中…
                </span>
              ) : null}
            </SidebarInteractiveRow>
          );
        })}

      {error ? <SidebarErrorDialog key={error} message={error} /> : null}
    </section>
  );
}
