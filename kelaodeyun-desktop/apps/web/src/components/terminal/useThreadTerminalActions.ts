import { claimFirstClaudeTerminal, releaseFailedClaudeTerminal } from "./firstClaudeTerminal";
import { claudeSettingsArgument } from "../sidebar/cloudClaudeStatus";
import * as Option from "effect/Option";
import { useEnvironments } from "../../state/environments";
import {
  AuthTerminalOperateScope,
  AuthTerminalReadScope,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { isAtomCommandInterrupted } from "@t3tools/client-runtime/state/runtime";
import { projectScriptCwd, projectScriptRuntimeEnv } from "@t3tools/shared/projectScripts";
import { nextTerminalId } from "@t3tools/shared/terminalLabels";
import { useComposerDraftStore } from "../../composerDraftStore";
import { useStableCallback } from "../../hooks/useStableCallback";
import { randomUUID } from "~/lib/utils";
import { selectThreadRightPanelState, useRightPanelStore } from "../../rightPanelStore";
import { useProject, useQuietThreadShell } from "../../state/entities";
import { readEnvironmentScope } from "../../state/session";
import { terminalEnvironment } from "../../state/terminal";
import { useKnownTerminalSessions } from "../../state/terminalSessions";
import { useAtomCommand } from "../../state/use-atom-command";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "../../terminalUiStateStore";

/** Where a new terminal starts. Omitted fields fall back to the thread's project and worktree. */
export interface TerminalLaunchLocation {
  readonly cwd: string;
  readonly worktreePath: string | null;
}

/** Allocate terminal ids and launch locations centrally so all surfaces share one view of sessions. */
export function useThreadTerminalActions(threadRef: ScopedThreadRef | null) {
  const { environments } = useEnvironments();
  const cloudEnvironment = environments.find(
    (environment) => environment.environmentId === threadRef?.environmentId,
  );
  const cloudProfile = cloudEnvironment ? Option.getOrNull(cloudEnvironment.entry.profile) : null;
  const isCloud = cloudProfile?._tag === "SshConnectionProfile";
  const openTerminalCommand = useAtomCommand(terminalEnvironment.open, "terminal open");
  const writeTerminal = useAtomCommand(terminalEnvironment.write, "terminal write");
  const closeTerminalCommand = useAtomCommand(terminalEnvironment.close, "terminal close");
  const serverThread = useQuietThreadShell(threadRef);
  const draftThread = useComposerDraftStore((store) =>
    threadRef ? store.getDraftThreadByRef(threadRef) : null,
  );
  const projectRef = serverThread
    ? scopeProjectRef(serverThread.environmentId, serverThread.projectId)
    : draftThread
      ? scopeProjectRef(draftThread.environmentId, draftThread.projectId)
      : null;
  const project = useProject(projectRef);
  const threadWorktreePath = serverThread?.worktreePath ?? draftThread?.worktreePath ?? null;
  const knownSessions = useKnownTerminalSessions({
    environmentId: threadRef?.environmentId ?? null,
    threadId: threadRef?.threadId ?? null,
  });
  const drawerTerminalIds = useTerminalUiStateStore(
    (state) => selectThreadTerminalUiState(state.terminalUiStateByThreadKey, threadRef).terminalIds,
  );
  const panelSurfaces = useRightPanelStore(
    (state) => selectThreadRightPanelState(state.byThreadKey, threadRef).surfaces,
  );

  const canWrite = () =>
    threadRef !== null && readEnvironmentScope(threadRef.environmentId, AuthTerminalOperateScope);

  // Server lists lag and colliding ids share a PTY; without read access, suffix ids to avoid unseen sessions.
  const allocateTerminalId = () => {
    const ids = new Set([
      ...(knownSessions ?? []).map((session) => session.target.terminalId),
      ...drawerTerminalIds,
      ...panelSurfaces.flatMap((surface) =>
        surface.kind === "terminal" ? surface.terminalIds : [],
      ),
    ]);
    const canReuse =
      knownSessions !== null &&
      threadRef !== null &&
      readEnvironmentScope(threadRef.environmentId, AuthTerminalReadScope);
    return nextTerminalId([...ids], canReuse ? undefined : randomUUID());
  };

  const defaultLaunchLocation = (): TerminalLaunchLocation | null =>
    project
      ? {
          cwd: projectScriptCwd({
            project: { cwd: project.workspaceRoot },
            worktreePath: threadWorktreePath,
          }),
          worktreePath: threadWorktreePath,
        }
      : null;

  /** place mounts the destination before the server open resolves. */
  const launchTerminal = (input: {
    readonly place: (terminalId: string) => void;
    readonly startClaude?: boolean;
    readonly terminalId?: string;
    readonly location?: TerminalLaunchLocation | null;
    readonly extraEnv?: Record<string, string>;
    readonly size?: { readonly cols: number; readonly rows: number };
  }) => {
    if (!threadRef || !canWrite() || !project) return null;
    const location = input.location ?? defaultLaunchLocation();
    if (!location) return null;
    const terminalId = input.terminalId ?? allocateTerminalId();
    const threadKey = JSON.stringify([threadRef.environmentId, threadRef.threadId]);
    const shouldStartClaude = claimFirstClaudeTerminal({
      threadKey,
      cloud: isCloud,
      existingTerminalCount:
        (knownSessions?.length ?? 0) +
        drawerTerminalIds.length +
        panelSurfaces.filter((surface) => surface.kind === "terminal").length,
      ...(input.terminalId === undefined ? {} : { explicitTerminalId: input.terminalId }),
      ...(input.startClaude === undefined ? {} : { startClaude: input.startClaude }),
    });
    input.place(terminalId);
    const openResult = openTerminalCommand({
      environmentId: threadRef.environmentId,
      input: {
        threadId: threadRef.threadId,
        terminalId,
        cwd: location.cwd,
        ...(location.worktreePath !== null ? { worktreePath: location.worktreePath } : {}),
        env: projectScriptRuntimeEnv({
          project: { cwd: project.workspaceRoot },
          worktreePath: location.worktreePath,
          ...(input.extraEnv ? { extraEnv: input.extraEnv } : {}),
        }),
        ...input.size,
      },
    });
    const result = openResult.then(async (opened) => {
      if (opened._tag === "Failure") {
        if (shouldStartClaude) releaseFailedClaudeTerminal(threadKey);
        return opened;
      }
      if (!shouldStartClaude) return opened;
      let settingsArgument = "";
      if (cloudProfile?._tag === "SshConnectionProfile" && window.desktopBridge?.sshFileOperation) {
        const output = await window.desktopBridge.sshFileOperation({
          target: cloudProfile.target,
          cwd: location.cwd,
          relativePath: ".",
          operation: "claude-trust",
        });
        settingsArgument = claudeSettingsArgument(output);
      }
      return writeTerminal({
        environmentId: threadRef.environmentId,
        input: { threadId: threadRef.threadId, terminalId, data: `claude${settingsArgument}\n` },
      });
    });
    return { terminalId, result };
  };

  /** Ends a session and deletes its history. A failed close falls back to typing `exit`. */
  const closeTerminalSession = (terminalId: string, target = threadRef) => {
    if (!target || !readEnvironmentScope(target.environmentId, AuthTerminalOperateScope)) return;
    const environmentId = target.environmentId;
    const threadId = target.threadId;
    void (async () => {
      const closeResult = await closeTerminalCommand({
        environmentId,
        input: { threadId, terminalId, deleteHistory: true },
      });
      if (
        closeResult._tag === "Failure" &&
        !isAtomCommandInterrupted(closeResult) &&
        readEnvironmentScope(environmentId, AuthTerminalOperateScope)
      ) {
        await writeTerminal({ environmentId, input: { threadId, terminalId, data: "exit\n" } });
      }
    })();
  };

  const writeToTerminal = (terminalId: string, data: string) => {
    if (!threadRef || !canWrite()) return null;
    return writeTerminal({
      environmentId: threadRef.environmentId,
      input: { threadId: threadRef.threadId, terminalId, data },
    });
  };

  return {
    canWrite: useStableCallback(canWrite),
    allocateTerminalId: useStableCallback(allocateTerminalId),
    launchTerminal: useStableCallback(launchTerminal),
    closeTerminalSession: useStableCallback(closeTerminalSession),
    writeToTerminal: useStableCallback(writeToTerminal),
  };
}
