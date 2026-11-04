// @effect-diagnostics nodeBuiltinImport:off -- Tests execute the remote Python protocol against isolated temporary directories.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { SSH_FILE_OPERATION_SCRIPT } from "./fileTransfer.ts";

function fixture() {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "cloud-upload-"));
  return {
    root,
    run(relativePath: string, contentsBase64 = "AAEC/w==", operation = "upload") {
      return NodeChildProcess.spawnSync("python3", ["-c", SSH_FILE_OPERATION_SCRIPT], {
        input: JSON.stringify({ cwd: root, relativePath, contentsBase64, operation }),
        encoding: "utf8",
      });
    },
    [Symbol.dispose]() {
      NodeFS.rmSync(root, { recursive: true, force: true });
    },
  };
}

describe("SSH cloud file operations", () => {
  it("uploads binary bytes into nested Unicode folders without overwriting existing files", () => {
    using f = fixture();
    expect(f.run("中文目录/data.bin").status).toBe(0);
    expect(NodeFS.readFileSync(NodePath.join(f.root, "中文目录/data.bin"))).toEqual(
      Buffer.from([0, 1, 2, 255]),
    );
    expect(f.run("中文目录/data.bin", "bmV3").status).not.toBe(0);
    expect(NodeFS.readFileSync(NodePath.join(f.root, "中文目录/data.bin"))).toEqual(
      Buffer.from([0, 1, 2, 255]),
    );
    expect(NodeFS.readdirSync(NodePath.join(f.root, "中文目录"))).toEqual(["data.bin"]);
    expect(f.run("empty", "", "mkdir").status).toBe(0);
    expect(NodeFS.readdirSync(NodePath.join(f.root, "empty"))).toEqual([]);
  });
  it("rejects traversal, malformed data, and symlink destinations", () => {
    using f = fixture();
    using outside = fixture();
    for (const path of ["../escape", "/absolute", "a/../escape", "a\\b", "a\0b", "a//b"]) {
      expect(f.run(path).status).not.toBe(0);
    }
    expect(f.run("invalid", "not base64!").status).not.toBe(0);
    NodeFS.symlinkSync(outside.root, NodePath.join(f.root, "link"));
    expect(f.run("link/escape").status).not.toBe(0);
    expect(NodeFS.readdirSync(outside.root)).toEqual([]);
    expect(NodeFS.readdirSync(f.root)).toEqual(["link"]);
  });
});
