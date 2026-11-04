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
    expect(JSON.parse(NodeFS.readFileSync(config, "utf8"))).toEqual({
      theme: "dark",
      projects: {
        "/other": { hasTrustDialogAccepted: false },
        [NodeFS.realpathSync(f.project)]: { hasTrustDialogAccepted: true },
      },
    });
    expect(NodeFS.readFileSync(config + ".before-kelaodeyun-trust", "utf8")).toBe(initial);
  });
  it("reads text history while excluding tools, sidechains, and malformed records", () => {
    using f = fixture();
    NodeFS.writeFileSync(
      f.file,
      [
        "broken json",
        JSON.stringify({ uuid: "one", message: { role: "user", content: "继续这个项目" } }),
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
    const listed = f.run("claude-list");
    expect(listed.status).toBe(0);
    expect(JSON.parse(listed.stdout)).toMatchObject([{ id, title: "继续这个项目" }]);
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
