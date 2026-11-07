// @effect-diagnostics nodeBuiltinImport:off -- Runs the remote script against isolated filesystem and command fixtures.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { SSH_COMPUTER_LINK_SCRIPT } from "./computerLink.ts";

function fixture() {
  const home = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "computer-link-"));
  const bin = NodePath.join(home, "bin");
  NodeFS.mkdirSync(bin);
  return {
    home,
    command(name: string, script: string) {
      NodeFS.writeFileSync(NodePath.join(bin, name), `#!/bin/sh\n${script}\n`, { mode: 0o700 });
    },
    run(operation: string, computer?: object, path?: string) {
      const result = NodeChildProcess.spawnSync("python3", ["-c", SSH_COMPUTER_LINK_SCRIPT], {
        env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH ?? ""}` },
        input: JSON.stringify({ operation, computer, path }),
        encoding: "utf8",
      });
      expect(result.status, result.stderr).toBe(0);
      return JSON.parse(result.stdout);
    },
    [Symbol.dispose]() {
      NodeFS.rmSync(home, { recursive: true, force: true });
    },
  };
}

describe("computer link", () => {
  it("sanitizes slugs and replaces only its managed CLAUDE.md block", () => {
    using f = fixture();
    const computer = { host: "My--Host.tail.net", username: "root", label: "电脑", os: "linux" };
    const first = f.run("computer-prepare", computer);
    expect(first.slug).toBe("my-host");
    const file = NodePath.join(first.dir, "CLAUDE.md");
    const generated = NodeFS.readFileSync(file, "utf8");
    NodeFS.writeFileSync(file, `before\n${generated}after\n`);
    f.run("computer-prepare", { ...computer, label: "新电脑" });
    const updated = NodeFS.readFileSync(file, "utf8");
    expect(updated.startsWith("before\n")).toBe(true);
    expect(updated.endsWith("after\n")).toBe(true);
    expect(updated).toContain("# 目标电脑：新电脑");
    f.run("computer-prepare", { ...computer, label: "新电脑" });
    expect(NodeFS.readFileSync(file, "utf8")).toBe(updated);
    expect(f.run("computer-list").computers).toMatchObject([
      { ...computer, label: "新电脑", slug: "my-host", dir: first.dir },
    ]);
  });

  it("normalizes tailnet status and reports stopped state", () => {
    using f = fixture();
    const status = JSON.stringify({
      BackendState: "Running",
      Self: { ID: "self", DNSName: "local.tail.", OS: "MacOS", Online: true },
      Peer: {
        "nodekey:one": {
          HostName: "box",
          DNSName: "box.tail.",
          TailscaleIPs: ["100.64.0.2", "fd7a::1"],
          OS: "Linux",
          Online: true,
        },
      },
    });
    f.command("tailscale", `printf '%s' '${status}'`);
    expect(f.run("computer-peers")).toEqual({
      ok: true,
      peers: [
        {
          id: "self",
          hostName: "",
          dnsName: "local.tail",
          ips: [],
          os: "macos",
          online: true,
          self: true,
        },
        {
          id: "nodekey:one",
          hostName: "box",
          dnsName: "box.tail",
          ips: ["100.64.0.2", "fd7a::1"],
          os: "linux",
          online: true,
          self: false,
        },
      ],
    });
    f.command("tailscale", `printf '%s' '{"BackendState":"Stopped"}'`);
    expect(f.run("computer-peers")).toMatchObject({
      ok: false,
      error: "tailscale-stopped",
      state: "Stopped",
    });
  });

  it.each([
    {
      name: "running",
      tailscale: `if [ "$1" = "status" ]; then printf '%s' '{"BackendState":"Running"}'; exit 0; fi
exit 0`,
      expected: { ok: true, state: "running" },
      killJob: false,
    },
    {
      name: "auth url from status",
      tailscale: `if [ "$1" = "status" ]; then printf '%s' '{"BackendState":"NeedsLogin","AuthURL":"https://login.tailscale.com/a/xyz789"}'; exit 0; fi
exit 0`,
      expected: { ok: true, state: "needs-login", url: "https://login.tailscale.com/a/xyz789" },
      killJob: false,
    },
    {
      name: "auth url from tailscale up output",
      tailscale: `if [ "$1" = "status" ]; then printf '%s' '{"BackendState":"NeedsLogin"}'; exit 0; fi
printf 'To authenticate, visit:\\n\\n\\thttps://login.tailscale.com/a/abc123\\n' >&2
exec sleep 60`,
      expected: { ok: true, state: "needs-login", url: "https://login.tailscale.com/a/abc123" },
      killJob: true,
    },
  ])("logs into tailscale on the server: $name", ({ tailscale, expected, killJob }) => {
    using f = fixture();
    f.command("sudo", '[ "$1" = -n ] && shift; exec "$@"');
    f.command("tailscale", tailscale);
    try {
      expect(f.run("computer-tailscale-login")).toMatchObject(expected);
    } finally {
      if (killJob) {
        try {
          const pid = Number(
            NodeFS.readFileSync(NodePath.join(f.home, ".kelaodeyun/tailscale-login.pid"), "utf8"),
          );
          try {
            process.kill(-pid, "SIGKILL");
          } catch {
            process.kill(pid, "SIGKILL");
          }
        } catch {
          // job already exited or was never started
        }
      }
    }
  });

  it("reports missing privilege for tailscale login", () => {
    using f = fixture();
    f.command("sudo", "exit 1");
    f.command("tailscale", "exit 0");
    expect(f.run("computer-tailscale-login")).toMatchObject({
      ok: false,
      error: "tailscale-permission",
    });
  });

  it("distinguishes SSH authentication failures from network failures", () => {
    using f = fixture();
    const computer = { host: "box.tail", username: "root", label: "box", os: "linux" };
    f.command("ssh", "echo 'Permission denied (publickey,password).' >&2; exit 255");
    expect(f.run("computer-probe", computer)).toMatchObject({ ok: false, error: "auth" });
    f.command("ssh", `printf '%0300d' 0 >&2; echo ' Permission denied' >&2; exit 255`);
    expect(f.run("computer-probe", computer)).toMatchObject({ ok: false, error: "auth" });
    f.command("ssh", "echo 'Connection refused' >&2; exit 255");
    expect(f.run("computer-probe", computer)).toMatchObject({
      ok: false,
      error: "unreachable",
      message: "Connection refused",
    });
    f.command("ssh", "echo Darwin");
    expect(f.run("computer-probe", computer)).toEqual({ ok: true, os: "darwin" });
  });

  it("lists remote folders using a separately quoted path argument", () => {
    using f = fixture();
    const computer = { host: "box.tail", username: "root", label: "box", os: "linux" };
    const remote = NodePath.join(f.home, "remote space's");
    NodeFS.mkdirSync(NodePath.join(remote, "folder"), { recursive: true });
    NodeFS.mkdirSync(NodePath.join(remote, ".hidden"));
    NodeFS.symlinkSync(NodePath.join(remote, "folder"), NodePath.join(remote, "link"));
    f.command("ssh", `while [ "$1" = "-o" ]; do shift 2; done
shift
exec sh -c "$*"`);
    expect(f.run("computer-list-dir", computer, remote)).toMatchObject({
      ok: true, path: remote, entries: expect.arrayContaining(["folder", ".hidden"]),
    });
    expect(f.run("computer-list-dir", computer, remote).entries).not.toContain("link");
    expect(f.run("computer-list-dir", { ...computer, os: "windows" }, remote)).toMatchObject({
      ok: false, error: "unsupported",
    });
  });

  it("adds, reuses, and disambiguates computer projects while preserving CLAUDE.md", () => {
    using f = fixture();
    const computer = { host: "box.tail", username: "root", label: "Box", os: "linux" };
    f.command("ssh", `while [ "$1" = "-o" ]; do shift 2; done
shift
exec sh -c "$*"`);
    f.run("computer-prepare", computer);
    const a = NodePath.join(f.home, "first", "proj ect's");
    const b = NodePath.join(f.home, "second", "proj ect's");
    NodeFS.mkdirSync(a, { recursive: true });
    NodeFS.mkdirSync(b, { recursive: true });
    const first = f.run("computer-add-project", computer, a);
    expect(first).toMatchObject({ ok: true, name: "proj-ect-s", remotePath: a });
    const claude = NodePath.join(first.dir, "CLAUDE.md");
    const text = NodeFS.readFileSync(claude, "utf8");
    expect(text).toContain(`项目目录：${a}`);
    NodeFS.writeFileSync(claude, `before\n${text}after\n`);
    expect(f.run("computer-add-project", computer, a).dir).toBe(first.dir);
    const refreshed = NodeFS.readFileSync(claude, "utf8");
    expect(refreshed.startsWith("before\n")).toBe(true);
    expect(refreshed.endsWith("after\n")).toBe(true);
    const second = f.run("computer-add-project", computer, b);
    expect(second.name).toBe("proj-ect-s-2");
    expect(f.run("computer-list").computers[0].projects).toEqual([
      { dir: first.dir, remotePath: a },
      { dir: second.dir, remotePath: b },
    ]);
  });

  it("passes the temporary password only through the child environment", () => {
    using f = fixture();
    const sshDir = NodePath.join(f.home, ".ssh");
    NodeFS.mkdirSync(sshDir);
    NodeFS.writeFileSync(NodePath.join(sshDir, "id_ed25519"), "private");
    NodeFS.writeFileSync(NodePath.join(sshDir, "id_ed25519.pub"), "ssh-ed25519 public-key\n");
    f.command("sshpass", 'shift; exec "$@"');
    f.command(
      "ssh",
      `case "$*" in *BatchMode=yes*) echo Linux; exit 0;; esac
case "$*" in *secret-password*) exit 7;; esac
test "$KELAODEYUN_SSH_PASSWORD" = secret-password || exit 8
grep -q secret-password "$SSH_ASKPASS" && exit 9
while [ "$1" = "-o" ]; do shift 2; done
shift
exec sh -c "$1"`,
    );
    expect(
      f.run("computer-install-key", {
        host: "box.tail",
        username: "root",
        label: "box",
        os: "linux",
        password: "secret-password",
      }),
    ).toEqual({ ok: true, os: "linux" });
    expect(NodeFS.readFileSync(NodePath.join(sshDir, "authorized_keys"), "utf8")).toBe(
      "ssh-ed25519 public-key\n",
    );
    expect(
      f.run("computer-install-key", {
        host: "box.tail",
        username: "root",
        label: "box",
        os: "linux",
        password: "secret-password",
      }),
    ).toEqual({ ok: true, os: "linux" });
    expect(NodeFS.readFileSync(NodePath.join(sshDir, "authorized_keys"), "utf8")).toBe(
      "ssh-ed25519 public-key\n",
    );
  });
});
