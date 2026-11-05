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
    expect(JSON.parse(f.run("中文目录/data.bin", "", "download").stdout)).toEqual({
      contentsBase64: "AAEC/w==",
    });
    expect(f.run("missing/entry", "", "download").status).not.toBe(0);
    expect(NodeFS.existsSync(NodePath.join(f.root, "missing"))).toBe(false);
    expect(f.run("empty", "", "mkdir").status).toBe(0);
    expect(f.run("empty", "", "download").status).not.toBe(0);
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
    expect(f.run("link/escape", "", "download").status).not.toBe(0);
    NodeFS.writeFileSync(NodePath.join(outside.root, "secret"), "private");
    NodeFS.symlinkSync(NodePath.join(outside.root, "secret"), NodePath.join(f.root, "file-link"));
    expect(f.run("file-link", "", "download").status).not.toBe(0);
    NodeFS.unlinkSync(NodePath.join(f.root, "file-link"));
    NodeFS.unlinkSync(NodePath.join(outside.root, "secret"));
    expect(NodeFS.readdirSync(outside.root)).toEqual([]);
    expect(NodeFS.readdirSync(f.root)).toEqual(["link"]);
  });
  it("archives nested files and empty folders, rejects symlinks and oversized folders", () => {
    using f = fixture();
    expect(f.run("项目/sub/data.bin").status).toBe(0);
    expect(f.run("项目/.hidden", "aGk=").status).toBe(0);
    expect(f.run("项目/empty", "", "mkdir").status).toBe(0);
    const archive = f.run("项目", "", "download-directory");
    expect(archive.status).toBe(0);
    const inspect = NodeChildProcess.spawnSync(
      "python3",
      [
        "-c",
        "import base64, io, json, sys, zipfile; z=zipfile.ZipFile(io.BytesIO(base64.b64decode(json.load(sys.stdin)['contentsBase64']))); print(json.dumps({n:base64.b64encode(z.read(n)).decode('ascii') for n in z.namelist()}))",
      ],
      { input: archive.stdout, encoding: "utf8" },
    );
    expect(JSON.parse(inspect.stdout)).toEqual({
      "项目/": "",
      "项目/sub/": "",
      "项目/sub/data.bin": "AAEC/w==",
      "项目/.hidden": "aGk=",
      "项目/empty/": "",
    });
    expect(f.run(".", "", "download-directory").status).toBe(0);
    NodeFS.symlinkSync("sub", NodePath.join(f.root, "项目/link"));
    expect(f.run("项目", "", "download-directory").status).not.toBe(0);
    NodeFS.unlinkSync(NodePath.join(f.root, "项目/link"));
    const large = NodeFS.openSync(NodePath.join(f.root, "项目/large"), "w");
    NodeFS.ftruncateSync(large, 33554433);
    NodeFS.closeSync(large);
    expect(f.run("项目", "", "download-directory").status).not.toBe(0);
  });
});
