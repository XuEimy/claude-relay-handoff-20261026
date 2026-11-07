import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { backgroundWorkHoldsCompletion } from "@t3tools/shared/orchestrationV2PendingBackgroundWork";
import { isLatestRunSettled } from "../../session-logic";
import { hasUnseenCompletion, hasUnseenFailure } from "../Sidebar.logic";

export type SessionLight = "attention" | "running" | "done" | "idle";
export type CliStatus = {
  state: "running" | "needs-input" | "failed" | "done" | "idle";
  at: number;
};

export function resolveSessionLight(input: {
  thread: EnvironmentThreadShell | null;
  lastVisitedAt: string | undefined;
  cli: CliStatus | null;
  cliSeenAt: number | null;
  active: boolean;
}): SessionLight {
  const { thread, lastVisitedAt, cli, cliSeenAt, active } = input;
  let threadLight: SessionLight = "idle";
  if (thread) {
    const visitedThread = { ...thread, lastVisitedAt };
    if (
      thread.hasPendingApprovals ||
      thread.hasPendingUserInput ||
      thread.pendingSubagentRequest != null ||
      (thread.pendingGuestMessageCount ?? 0) > 0 ||
      hasUnseenFailure(visitedThread) ||
      (!thread.hasPendingUserInput &&
        thread.interactionMode === "plan" &&
        isLatestRunSettled(thread.latestRun, thread.runtime) &&
        thread.hasActionableProposedPlan)
    ) {
      threadLight = "attention";
    } else if (
      ["running", "waiting", "preparing", "starting", "queued"].includes(
        thread.runtime?.status ?? "",
      ) ||
      backgroundWorkHoldsCompletion(thread.pendingBackgroundTasks ?? [])
    ) {
      threadLight = "running";
    } else if (!active && hasUnseenCompletion(visitedThread)) {
      threadLight = "done";
    }
  }
  const visitedSeconds = lastVisitedAt ? Date.parse(lastVisitedAt) / 1000 : 0;
  const cliLight: SessionLight =
    cli?.state === "needs-input" || cli?.state === "failed"
      ? "attention"
      : cli?.state === "running"
        ? "running"
        : cli?.state === "done" &&
            !active &&
            cli.at > Math.max(cliSeenAt ?? 0, Number.isNaN(visitedSeconds) ? 0 : visitedSeconds)
          ? "done"
          : "idle";
  const priority: SessionLight[] = ["attention", "running", "done", "idle"];
  return priority[Math.min(priority.indexOf(threadLight), priority.indexOf(cliLight))] ?? "idle";
}
