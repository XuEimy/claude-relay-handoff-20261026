import { WorkspaceLoadingPlaceholder } from "../WorkspaceLoadingPlaceholder";
import { create } from "zustand";
import { SidebarErrorDialog } from "./SidebarErrorDialog";
import { CloudSessionRow } from "./CloudSessionRow";
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
  AuthOrchestrationOperateScope,
} from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useEnvironments, useEnvironmentProviders } from "../../state/environments";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { orchestrationEnvironment } from "../../state/orchestration";
import { readThreadShell, useThreadShells, waitForThreadShell } from "../../state/entities";
import { useArchivedThreadSnapshots } from "../../lib/archivedThreadsState";
import { readEnvironmentScope } from "../../state/session";
import { threadEnvironment } from "../../state/threads";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { claudeSettingsArgument, useCloudClaudeStatusPolling } from "./cloudClaudeStatus";
import { useSessionLight } from "./useSessionLight";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { resolveProjectDefaultProviderModelSelection } from "../../providerInstances";

const useCloudResumeState = create<{ sessionId: string | null }>(() => ({ sessionId: null }));

export interface NativeSession {
  id: string;
  title: string;
  updatedAt: number;
}
const sessionListCache = new Map<string, NativeSession[]>();

export function NativeSessionRow({
  session,
  thread,
  environmentId,
  active,
  pending,
  disabled,
  rowClassName,
  actions,
  onResume,
  onRename,
  onArchive,
}: {
  session: NativeSession;
  thread: EnvironmentThreadShell | null;
  environmentId: EnvironmentId | undefined;
  active: boolean;
  pending: boolean;
  disabled: boolean;
  rowClassName: string | undefined;
  actions: ReactNode;
  onResume: () => void;
  onRename: (title: string) => void;
  onArchive: () => void;
}) {
  const light = useSessionLight(environmentId, session.id, thread, active);
  return (
    <CloudSessionRow
      title={thread?.title || session.title}
      light={light}
      className={rowClassName ?? "pr-16"}
      disabled={disabled}
      active={active}
      pending={pending}
      dimmed={disabled && !pending}
      aria-current={active ? "page" : undefined}
      onClick={onResume}
      onRename={onRename}
      onArchive={onArchive}
      actions={actions}
    />
  );
}

function useArchivedNativeThreadIds(environmentId: EnvironmentId | undefined) {
  const { snapshots } = useArchivedThreadSnapshots(environmentId ? [environmentId] : []);
  return new Set(snapshots.flatMap(({ snapshot }) => snapshot.threads.map((thread) => thread.id)));
}

export function useNativeClaudeSessions({
  environmentId,
  cwd,
  enabled,
}: {
  environmentId: EnvironmentId | undefined;
  cwd: string | undefined;
  enabled: boolean;
}) {
  const { environments } = useEnvironments();
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
    enabled && connected && result?.key !== cacheKey && !sessionListCache.has(cacheKey);
  const [error, setError] = useState<string | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- reads native Claude sessions over SSH and cancels stale results on workspace changes
  useEffect(() => {
    let cancelled = false;
    const target = JSON.parse(listRequestKey) as
      | import("@t3tools/contracts").DesktopSshEnvironmentTarget
      | null;
    if (!enabled || !target || !cwd || !connected || !window.desktopBridge?.sshFileOperation)
      return;
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
  }, [listRequestKey, cacheKey, cwd, connected, enabled]);
  return { sessions, loading, connected, error, target };
}

export function useNativeSessionActions({
  environmentId,
  projectId,
  cwd,
  currentThreadRef,
  onRenameThread,
  onArchiveThread,
}: {
  environmentId: EnvironmentId | undefined;
  projectId: ProjectId | undefined;
  cwd: string | undefined;
  currentThreadRef: ScopedThreadRef | null;
  onRenameThread?:
    | ((ref: ScopedThreadRef, title: string, originalTitle: string) => void)
    | undefined;
  onArchiveThread: (ref: ScopedThreadRef, title: string) => Promise<void>;
}) {
  const { environments } = useEnvironments();
  const providers = useEnvironmentProviders();
  const environment = environments.find((item) => item.environmentId === environmentId);
  const profile = environment ? Option.getOrNull(environment.entry.profile) : null;
  const target = profile?._tag === "SshConnectionProfile" ? profile.target : null;
  const [error, setError] = useState<string | null>(null);
  const importingSessionId = useCloudResumeState((state) => state.sessionId);
  const setImportingSessionId = (sessionId: string | null) =>
    useCloudResumeState.setState({ sessionId });
  const importing = importingSessionId !== null;
  const dispatch = useOrchestrationCommand(orchestrationEnvironment.v2.dispatchCommand, {
    reportFailure: false,
  });
  const updateThreadMetadata = useOrchestrationCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  const navigate = useNavigate();
  const openTerminal = useAtomCommand(terminalEnvironment.open);
  const writeTerminal = useAtomCommand(terminalEnvironment.write);
  const knownSessions = useKnownTerminalSessions({
    environmentId: environmentId ?? null,
    threadId: null,
  });
  const inFlight = useRef(false);
  const importNativeSession = async (selected: NativeSession, title: string) => {
    if (!environmentId || !projectId || !environment?.serverConfig)
      throw new Error("云电脑尚未就绪。");
    const selection = resolveProjectDefaultProviderModelSelection(
      (providers.get(environmentId) ?? []).filter((provider) => provider.driver === "claudeAgent"),
      environment.serverConfig.settings,
      projectId,
    );
    if (!selection) throw new Error("云电脑的 Claude 尚未就绪，请先检查提供程序。");
    const threadId = ThreadId.make(`cloud-claude-${selected.id}`);
    if (!readThreadShell({ environmentId, threadId })) {
      const result = await dispatch({
        environmentId,
        input: {
          type: "thread.create",
          commandId: CommandId.make(randomUUID()),
          threadId,
          projectId,
          title: title || "Claude 会话",
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
            metadata: { title },
          },
        },
      });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
    }
    return threadId;
  };
  const rename = async (
    selected: NativeSession,
    thread: EnvironmentThreadShell | null,
    title: string,
  ) => {
    if (!environmentId) return;
    const original = thread?.title || selected.title;
    if (thread && onRenameThread) {
      onRenameThread({ environmentId, threadId: thread.id }, title, original);
      return;
    }
    if (!readEnvironmentScope(environmentId, AuthOrchestrationOperateScope)) return;
    const trimmed = title.trim();
    if (!trimmed) {
      toastManager.add({ type: "warning", title: "会话标题不能为空" });
      return;
    }
    if (trimmed === original) return;
    try {
      if (thread) {
        const result = await updateThreadMetadata({
          environmentId,
          input: { threadId: thread.id, title: trimmed },
        });
        if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
          const error = squashAtomCommandFailure(result);
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "重命名会话失败",
              description: error instanceof Error ? error.message : "An error occurred.",
            }),
          );
        }
      } else {
        await importNativeSession(selected, trimmed);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法重命名会话");
    }
  };
  const archive = async (selected: NativeSession, thread: EnvironmentThreadShell | null) => {
    if (
      !environmentId ||
      importing ||
      useCloudResumeState.getState().sessionId !== null ||
      inFlight.current
    )
      return;
    inFlight.current = true;
    setImportingSessionId(selected.id);
    setError(null);
    try {
      const threadId = thread?.id ?? (await importNativeSession(selected, selected.title));
      const ref = { environmentId, threadId };
      if (!thread && !(await waitForThreadShell(ref)))
        throw new Error("等待会话导入超时，请重试。");
      await onArchiveThread(ref, thread?.title || selected.title);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法归档会话");
    } finally {
      inFlight.current = false;
      setImportingSessionId(null);
    }
  };
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
      if (!readThreadShell({ environmentId, threadId }))
        await importNativeSession(selected, selected.title);
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
          let settingsArgument = "";
          if (target && window.desktopBridge?.sshFileOperation) {
            const output = await window.desktopBridge.sshFileOperation({
              target,
              cwd,
              relativePath: ".",
              operation: "claude-trust",
            });
            settingsArgument = claudeSettingsArgument(output);
          }
          const written = await writeTerminal({
            environmentId,
            input: {
              threadId,
              terminalId,
              data: `claude${settingsArgument} --resume '${selected.id}'\n`,
            },
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
  return { resume, rename, archive, importingSessionId, importing, error };
}

interface CloudClaudeSessionsProps {
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
  onRenameThread?: (ref: ScopedThreadRef, title: string, originalTitle: string) => void;
  onArchiveThread: (ref: ScopedThreadRef, title: string) => Promise<void>;
  actions?: ReactNode;
  archivedThreadIds?: ReadonlySet<string>;
}

export function CloudClaudeSessions(props: CloudClaudeSessionsProps) {
  return props.archivedThreadIds ? (
    <CloudClaudeSessionsContent {...props} archivedThreadIds={props.archivedThreadIds} />
  ) : (
    <StandaloneCloudClaudeSessions {...props} />
  );
}

function StandaloneCloudClaudeSessions(props: CloudClaudeSessionsProps) {
  const archivedThreadIds = useArchivedNativeThreadIds(props.environmentId);
  return <CloudClaudeSessionsContent {...props} archivedThreadIds={archivedThreadIds} />;
}

function CloudClaudeSessionsContent({
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
  onRenameThread,
  onArchiveThread,
  actions,
  archivedThreadIds,
}: CloudClaudeSessionsProps & { archivedThreadIds: ReadonlySet<string> }) {
  useCloudClaudeStatusPolling(nested ? undefined : environmentId);
  const threads = useThreadShells();
  const {
    sessions,
    loading,
    connected,
    error: listError,
    target,
  } = useNativeClaudeSessions({
    environmentId,
    cwd,
    enabled: !session,
  });
  const { resume, rename, archive, importingSessionId, importing, error } = useNativeSessionActions(
    {
      environmentId,
      projectId,
      cwd,
      currentThreadRef,
      onRenameThread,
      onArchiveThread,
    },
  );
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
        .filter((session) => !archivedThreadIds.has(`cloud-claude-${session.id}`))
        .map((session) => ({
          session,
          thread:
            threads.find(
              (thread) =>
                thread.environmentId === environmentId &&
                thread.id === `cloud-claude-${session.id}` &&
                !thread.archivedAt,
            ) ?? null,
        }))
        .filter(({ session, thread }) =>
          (thread?.title || session.title).toLowerCase().includes(query.toLowerCase()),
        )
        .map(({ session, thread }) => {
          const active =
            currentThreadRef?.environmentId === environmentId &&
            currentThreadRef?.threadId === `cloud-claude-${session.id}`;
          const pending = importingSessionId === session.id;
          return (
            <NativeSessionRow
              key={session.id}
              rowClassName={rowClassName}
              session={session}
              thread={thread}
              environmentId={environmentId}
              disabled={importing || !connected}
              active={active}
              pending={pending}
              actions={actions}
              onResume={() => void resume(session)}
              onRename={(title) => void rename(session, thread, title)}
              onArchive={() => void archive(session, thread)}
            />
          );
        })}

      {error ? <SidebarErrorDialog key={error} message={error} /> : null}
      {listError ? <SidebarErrorDialog key={listError} message={listError} /> : null}
    </section>
  );
}
