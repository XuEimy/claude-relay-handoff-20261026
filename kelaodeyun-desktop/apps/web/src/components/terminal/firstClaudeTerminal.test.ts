import { expect, it } from "vite-plus/test";
import { claimFirstClaudeTerminal, releaseFailedClaudeTerminal } from "./firstClaudeTerminal";

it("reserves only the first cloud terminal even before session metadata arrives", () => {
  const input = { threadKey: "cloud/thread/race", cloud: true, existingTerminalCount: 0 };
  expect(claimFirstClaudeTerminal(input)).toBe(true);
  expect(claimFirstClaudeTerminal(input)).toBe(false);
  // Closing terminals must not trigger another automatic Claude launch.
  expect(claimFirstClaudeTerminal({ ...input, existingTerminalCount: 0 })).toBe(false);
});
it("does not launch for existing sessions, explicit resumes, scripts, or local terminals", () => {
  const input = { threadKey: "cloud/thread/existing", cloud: true, existingTerminalCount: 0 };
  expect(claimFirstClaudeTerminal({ ...input, existingTerminalCount: 1 })).toBe(false);
  expect(claimFirstClaudeTerminal({ ...input, explicitTerminalId: "resume" })).toBe(false);
  expect(claimFirstClaudeTerminal({ ...input, startClaude: false })).toBe(false);
  expect(claimFirstClaudeTerminal({ ...input, cloud: false })).toBe(false);
});
it("allows retry after an open failure and keeps different servers separate", () => {
  const input = { threadKey: "server-a/thread", cloud: true, existingTerminalCount: 0 };
  expect(claimFirstClaudeTerminal(input)).toBe(true);
  releaseFailedClaudeTerminal(input.threadKey);
  expect(claimFirstClaudeTerminal(input)).toBe(true);
  expect(claimFirstClaudeTerminal({ ...input, threadKey: "server-b/thread" })).toBe(true);
});
