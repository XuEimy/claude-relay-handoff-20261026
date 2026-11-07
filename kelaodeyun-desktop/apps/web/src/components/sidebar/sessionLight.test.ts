import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { describe, expect, it } from "vite-plus/test";
import { resolveSessionLight, type CliStatus, type SessionLight } from "./sessionLight";

const thread = {
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  pendingSubagentRequest: null,
  pendingGuestMessageCount: 0,
  hasActionableProposedPlan: false,
  interactionMode: "default",
  latestRun: null,
  runtime: null,
  pendingBackgroundTasks: [],
} as unknown as EnvironmentThreadShell;
const completed = {
  runId: "run",
  status: "completed",
  completedAt: "2026-01-02T00:00:00Z",
};
const base = {
  thread: null,
  lastVisitedAt: undefined,
  cli: null,
  cliSeenAt: null,
  active: false,
};
describe("session lights", () => {
  it.each([
    ["idle", {}, "idle"],
    ["approval", { thread: { ...thread, hasPendingApprovals: true } }, "attention"],
    ["input", { thread: { ...thread, hasPendingUserInput: true } }, "attention"],
    ["guest", { thread: { ...thread, pendingGuestMessageCount: 1 } }, "attention"],
    ["subagent", { thread: { ...thread, pendingSubagentRequest: "approval" } }, "attention"],
    [
      "failure",
      { thread: { ...thread, latestRun: { ...completed, status: "failed" } } },
      "attention",
    ],
    [
      "plan",
      {
        thread: {
          ...thread,
          interactionMode: "plan",
          latestRun: completed,
          hasActionableProposedPlan: true,
        },
      },
      "attention",
    ],
    ["running", { thread: { ...thread, runtime: { status: "running" } } }, "running"],
    [
      "background",
      {
        thread: {
          ...thread,
          pendingBackgroundTasks: [
            { taskId: "x", kind: "monitor", description: "task", awaited: true },
          ],
        },
      },
      "running",
    ],
    [
      "completion",
      { thread: { ...thread, latestRun: completed }, lastVisitedAt: "2026-01-01T00:00:00Z" },
      "done",
    ],
    [
      "active completion",
      {
        thread: { ...thread, latestRun: completed },
        lastVisitedAt: "2026-01-01T00:00:00Z",
        active: true,
      },
      "idle",
    ],
    ["cli question", { cli: { state: "needs-input", at: 100 } }, "attention"],
    ["cli failure", { cli: { state: "failed", at: 100 } }, "attention"],
    ["cli running", { cli: { state: "running", at: 100 } }, "running"],
    ["cli done", { cli: { state: "done", at: 100 }, cliSeenAt: 99 }, "done"],
    ["seen cli done", { cli: { state: "done", at: 100 }, cliSeenAt: 100 }, "idle"],
    [
      "visited cli done",
      { cli: { state: "done", at: 100 }, lastVisitedAt: "1970-01-01T00:02:00Z" },
      "idle",
    ],
    ["active cli done", { cli: { state: "done", at: 100 }, active: true }, "idle"],
    [
      "attention over running",
      { thread: { ...thread, hasPendingApprovals: true }, cli: { state: "running", at: 100 } },
      "attention",
    ],
    [
      "running over done",
      { thread: { ...thread, runtime: { status: "running" } }, cli: { state: "done", at: 100 } },
      "running",
    ],
  ] as const)("%s", (_name, overrides, expected: SessionLight) => {
    expect(
      resolveSessionLight({ ...base, ...overrides } as {
        thread: EnvironmentThreadShell | null;
        lastVisitedAt: string | undefined;
        cli: CliStatus | null;
        cliSeenAt: number | null;
        active: boolean;
      }),
    ).toBe(expected);
  });
});
