import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId } from "@t3tools/contracts";
import { useEffect } from "react";
import { useUiStateStore } from "../../uiStateStore";
import { resolveThreadLastVisitedAt } from "../Sidebar.logic";
import {
  markCliSessionSeen,
  useCliSessionSeen,
  useCloudClaudeSessionStatus,
} from "./cloudClaudeStatus";
import { resolveSessionLight } from "./sessionLight";

export function useSessionLight(
  environmentId: EnvironmentId | undefined,
  sessionId: string | undefined,
  thread: EnvironmentThreadShell | null,
  active: boolean,
) {
  const localVisited = useUiStateStore((state) =>
    thread
      ? state.threadLastVisitedAtById[
          scopedThreadKey({ environmentId: thread.environmentId, threadId: thread.id })
        ]
      : undefined,
  );
  const cli = useCloudClaudeSessionStatus(environmentId, sessionId);
  const cliSeenAt = useCliSessionSeen(environmentId, sessionId);
  const cliAt = cli?.at;
  const lastVisitedAt = resolveThreadLastVisitedAt(thread?.lastVisitedAt, localVisited);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- persists completion watermarks for the active CLI session
  useEffect(() => {
    if (active && environmentId && sessionId && cliAt !== undefined) {
      markCliSessionSeen(environmentId, sessionId, Math.max(Date.now() / 1000, cliAt));
    }
  }, [active, environmentId, sessionId, cliAt]);
  return resolveSessionLight({ thread, lastVisitedAt, cli, cliSeenAt, active });
}
