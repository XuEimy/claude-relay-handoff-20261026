// @effect-diagnostics nodeBuiltinImport:off -- Exercises the remote Python reader with isolated transcript fixtures.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { SSH_CLAUDE_SESSIONS_SCRIPT } from "./claudeSessions.ts";

const id = "12345678-1234-1234-1234-123456789abc";
function fixture() {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "claude-history-"));
  const project = NodePath.join(root, "projects", "-workspace-project");
  NodeFS.mkdirSync(project, { recursive: true });
  const file = NodePath.join(project, `${id}.jsonl`);
  return {
    file,
    project,
    run(operation: string, relativePath = id) {
      return NodeChildProcess.spawnSync("python3", ["-c", SSH_CLAUDE_SESSIONS_SCRIPT], {
        env: { ...process.env, CLAUDE_CONFIG_DIR: root },
        input: JSON.stringify({ operation, relativePath, cwd: "/workspace/project" }),
        encoding: "utf8",
      });
    },
    [Symbol.dispose]() {
      NodeFS.rmSync(root, { recursive: true, force: true });
    },
  };
}
describe("native Claude session reader", () => {
  it("resolves cwd from the exact native session, ignoring child and other-session records", () => {
    using f = fixture();
    NodeFS.writeFileSync(
      f.file,
      [
        JSON.stringify({ sessionId: id, cwd: "/old" }),
        JSON.stringify({ sessionId: id, cwd: f.project }),
        JSON.stringify({ sessionId: id, cwd: "/sidechain", isSidechain: true }),
        JSON.stringify({ sessionId: "another-session", cwd: "/other" }),
      ].join("\n"),
    );
    expect(JSON.parse(f.run("claude-info").stdout)).toEqual({
      sessionId: id,
      cwd: f.project,
      exists: true,
    });
  });
  it("does not invent a cwd for missing sessions or records without cwd", () => {
    using f = fixture();
    expect(JSON.parse(f.run("claude-info").stdout)).toEqual({
      sessionId: id,
      cwd: null,
      exists: false,
    });
    NodeFS.writeFileSync(f.file, JSON.stringify({ message: { role: "user", content: "hello" } }));
    expect(JSON.parse(f.run("claude-info").stdout).cwd).toBeNull();
    expect(f.run("claude-info", "../../etc/passwd").status).not.toBe(0);
  });

  it("trusts only the selected workspace and preserves other settings with a backup", () => {
    using f = fixture();
    const root = NodePath.dirname(f.project);
    const config = NodePath.join(root, ".claude.json");
    const initial = JSON.stringify({
      theme: "dark",
      projects: { "/other": { hasTrustDialogAccepted: false } },
    });
    NodeFS.writeFileSync(config, initial);
    const result = NodeChildProcess.spawnSync("python3", ["-c", SSH_CLAUDE_SESSIONS_SCRIPT], {
      env: { ...process.env, CLAUDE_CONFIG_DIR: root },
      input: JSON.stringify({ operation: "claude-trust", cwd: f.project }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    const settingsPath = NodePath.join(root, "kelaodeyun", "settings.json");
    expect(JSON.parse(result.stdout)).toEqual({
      trusted: true,
      cwd: NodeFS.realpathSync(f.project),
      settingsPath: NodeFS.realpathSync(settingsPath),
    });
    const hookSettings = JSON.parse(NodeFS.readFileSync(settingsPath, "utf8"));
    expect(hookSettings.hooks.PreToolUse[0].hooks[0].command).toContain("hook.py");
    expect(NodeFS.existsSync(NodePath.join(root, "kelaodeyun", "hook.py"))).toBe(true);
    expect(JSON.parse(NodeFS.readFileSync(config, "utf8"))).toEqual({
      theme: "dark",
      projects: {
        "/other": { hasTrustDialogAccepted: false },
        [NodeFS.realpathSync(f.project)]: { hasTrustDialogAccepted: true },
      },
    });
    expect(NodeFS.readFileSync(config + ".before-kelaodeyun-trust", "utf8")).toBe(initial);
  });
  it("records hook events and ignores invalid input and irrelevant notifications", () => {
    using f = fixture();
    const root = NodePath.dirname(f.project);
    const trust = NodeChildProcess.spawnSync("python3", ["-c", SSH_CLAUDE_SESSIONS_SCRIPT], {
      env: { ...process.env, CLAUDE_CONFIG_DIR: root },
      input: JSON.stringify({ operation: "claude-trust", cwd: f.project }),
      encoding: "utf8",
    });
    expect(trust.status).toBe(0);
    const hook = NodePath.join(root, "kelaodeyun", "hook.py");
    const status = NodePath.join(root, "kelaodeyun", "status");
    const file = NodePath.join(status, `${id}.json`);
    const run = (input: string) =>
      NodeChildProcess.spawnSync("python3", [hook, status], { input, encoding: "utf8" });
    for (const [event, extra, state] of [
      ["SessionStart", {}, "idle"],
      ["UserPromptSubmit", {}, "running"],
      ["PreToolUse", { tool_name: "AskUserQuestion" }, "needs-input"],
      ["PreToolUse", { tool_name: "Bash" }, "running"],
      ["PermissionRequest", {}, "needs-input"],
      ["PostToolUse", {}, "running"],
      ["PostToolUseFailure", {}, "running"],
      ["Notification", { notification_type: "permission_prompt" }, "needs-input"],
      ["Elicitation", {}, "needs-input"],
      ["ElicitationResult", {}, "running"],
      ["Stop", {}, "done"],
      ["StopFailure", {}, "failed"],
      ["SessionEnd", {}, "idle"],
    ] as const) {
      const result = run(JSON.stringify({ session_id: id, hook_event_name: event, ...extra }));
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("");
      expect(JSON.parse(NodeFS.readFileSync(file, "utf8")).state).toBe(state);
    }
    const before = NodeFS.readFileSync(file, "utf8");
    run(
      JSON.stringify({
        session_id: id,
        hook_event_name: "Notification",
        notification_type: "idle_prompt",
      }),
    );
    run(JSON.stringify({ session_id: "../invalid", hook_event_name: "Stop" }));
    expect(run("garbage").status).toBe(0);
    expect(NodeFS.readFileSync(file, "utf8")).toBe(before);
    const simulatedProc = `
import io, os, pathlib, runpy, sys
original_bytes = pathlib.Path.read_bytes
original_text = pathlib.Path.read_text
def read_bytes(path):
    if str(path) == '/proc/100/cmdline': return b"/bin/sh\\0-c\\0python3 '/home/user/.claude/kelaodeyun/hook.py'"
    if str(path) == '/proc/200/cmdline': return b'/usr/bin/node\\0/opt/claude/cli.js'
    return original_bytes(path)
def read_text(path, *args, **kwargs):
    if str(path) == '/proc/100/stat': return '100 (sh) S 200'
    return original_text(path, *args, **kwargs)
pathlib.Path.read_bytes, pathlib.Path.read_text = read_bytes, read_text
os.getppid = lambda: 100
sys.argv = [sys.argv[1], sys.argv[2]]
sys.stdin = io.StringIO(${JSON.stringify(JSON.stringify({ session_id: id, hook_event_name: "UserPromptSubmit" }))})
runpy.run_path(sys.argv[0], run_name='__main__')
`;
    expect(NodeChildProcess.spawnSync("python3", ["-c", simulatedProc, hook, status]).status).toBe(
      0,
    );
    expect(JSON.parse(NodeFS.readFileSync(file, "utf8")).pid).toBe(200);
  });
  it("combines hook states, stale process and interrupt detection with bounded JSONL inference", () => {
    using f = fixture();
    const root = NodePath.dirname(NodePath.dirname(f.project));
    const statusDir = NodePath.join(root, "kelaodeyun", "status");
    NodeFS.mkdirSync(statusDir, { recursive: true });
    const ids = [
      "10000000-0000-0000-0000-000000000000",
      "20000000-0000-0000-0000-000000000000",
      "30000000-0000-0000-0000-000000000000",
      "40000000-0000-0000-0000-000000000000",
      "50000000-0000-0000-0000-000000000000",
      "60000000-0000-0000-0000-000000000000",
      "70000000-0000-0000-0000-000000000000",
    ];
    const [hookId, deadId, interruptId, doneId, questionId, promptId, oldId] = ids;
    const transcript = NodePath.join(f.project, `${interruptId}.jsonl`);
    NodeFS.writeFileSync(
      transcript,
      JSON.stringify({
        message: { role: "user", content: "[Request interrupted by user for tool use]" },
      }),
    );
    for (const [sessionId, state, extra] of [
      [hookId, "needs-input", {}],
      [deadId, "running", { pid: 999999999 }],
      [interruptId, "running", { transcript }],
    ] as const)
      NodeFS.writeFileSync(
        NodePath.join(statusDir, `${sessionId}.json`),
        JSON.stringify({ state, at: 1, ...extra }),
      );
    const write = (sessionId: string | undefined, message: object) =>
      NodeFS.writeFileSync(
        NodePath.join(f.project, `${sessionId}.jsonl`),
        JSON.stringify({ message }),
      );
    write(doneId, { role: "assistant", content: [{ type: "text", text: "done" }] });
    write(questionId, {
      role: "assistant",
      content: [{ type: "tool_use", id: "q", name: "AskUserQuestion" }],
    });
    write(promptId, { role: "user", content: "continue" });
    write(oldId, { role: "user", content: "old" });
    NodeFS.utimesSync(NodePath.join(f.project, `${oldId}.jsonl`), 946684800, 946684800);
    const result = NodeChildProcess.spawnSync("python3", ["-c", SSH_CLAUDE_SESSIONS_SCRIPT], {
      env: { ...process.env, CLAUDE_CONFIG_DIR: root },
      input: JSON.stringify({ operation: "claude-status", cwd: "/", relativePath: "status" }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(
      Object.fromEntries(
        JSON.parse(result.stdout).map((row: { id: string; state: string }) => [row.id, row.state]),
      ),
    ).toEqual({
      [hookId!]: "needs-input",
      [deadId!]: "idle",
      [interruptId!]: "idle",
      [doneId!]: "done",
      [questionId!]: "needs-input",
      [promptId!]: "running",
    });
  });
  it("reads text history while excluding tools, sidechains, and malformed records", () => {
    using f = fixture();
    NodeFS.writeFileSync(
      f.file,
      [
        "broken json",
        JSON.stringify({
          uuid: "one",
          entrypoint: "cli",
          message: { role: "user", content: "继续这个项目" },
        }),
        JSON.stringify({
          uuid: "two",
          message: {
            role: "assistant",
            content: [
              { type: "text", text: "好的" },
              { type: "tool_use", input: { secret: "not a transcript message" } },
            ],
          },
        }),
        JSON.stringify({
          isSidechain: true,
          message: { role: "user", content: "hidden child task" },
        }),
        JSON.stringify({ isMeta: true, message: { role: "user", content: "hidden metadata" } }),
      ].join("\n"),
    );
    const appId = "87654321-4321-4321-4321-cba987654321";
    const legacyId = "11111111-1111-1111-1111-111111111111";
    NodeFS.writeFileSync(
      NodePath.join(f.project, `${appId}.jsonl`),
      [
        JSON.stringify({
          isSidechain: true,
          entrypoint: "cli",
          message: { role: "user", content: "child" },
        }),
        JSON.stringify({
          entrypoint: "cli",
          message: { role: "user", content: "<system-reminder>ignored" },
        }),
        JSON.stringify({ entrypoint: "cli", message: { role: "assistant", content: "hello" } }),
        JSON.stringify({ entrypoint: "t3-code", message: { role: "user", content: "app thread" } }),
        JSON.stringify({ entrypoint: "cli", message: { role: "user", content: "follow-up" } }),
      ].join("\n"),
    );
    NodeFS.writeFileSync(
      NodePath.join(f.project, `${legacyId}.jsonl`),
      JSON.stringify({ message: { role: "user", content: "legacy session" } }),
    );
    const listed = f.run("claude-list");
    expect(listed.status).toBe(0);
    expect(JSON.parse(listed.stdout)).toHaveLength(2);
    expect(JSON.parse(listed.stdout)).toEqual(
      expect.arrayContaining([
        { id, title: "继续这个项目", updatedAt: expect.any(Number) },
        { id: legacyId, title: "legacy session", updatedAt: expect.any(Number) },
      ]),
    );
    expect(JSON.parse(f.run("claude-read").stdout)).toEqual([
      { id: "one", role: "user", text: "继续这个项目", createdAt: null },
      { id: "two", role: "assistant", text: "好的", createdAt: null },
    ]);
  });
  it("rejects paths outside the session store and symbolic links", () => {
    using f = fixture();
    expect(f.run("claude-read", "../../etc/passwd").status).not.toBe(0);
    NodeFS.symlinkSync("/etc/hosts", f.file);
    expect(f.run("claude-read").status).not.toBe(0);
    expect(JSON.parse(f.run("claude-list").stdout)).toEqual([]);
  });
});
