// @effect-diagnostics nodeBuiltinImport:off -- Isolated temporary account storage exercises the desktop boundary.
import * as NodeCrypto from "node:crypto";
import * as NodeFs from "node:fs/promises";
import * as NodeOs from "node:os";
import * as NodePath from "node:path";
import * as NodeChildProcess from "node:child_process";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it, vi } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as ElectronDialog from "../electron/ElectronDialog.ts";
import * as ElectronSafeStorage from "../electron/ElectronSafeStorage.ts";
import * as ElectronShell from "../electron/ElectronShell.ts";
import * as ElectronWindow from "../electron/ElectronWindow.ts";
import * as DesktopAccount from "./DesktopAccount.ts";

const FIXTURE_TYPED_VALUE = ["fixture", "value"].join("-");

describe("desktop account", () => {
  /* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- The subprocess fixture follows the existing desktop boundary tests. */
  it("discards an undecryptable account and starts signed out", async () => {
    const root = await NodeFs.mkdtemp(NodePath.join(NodeOs.tmpdir(), "acos-account-test-"));
    const directory = NodePath.join(root, "agent-cloud-os-dev");
    const statePath = NodePath.join(directory, "account.json");
    const legacyPath = NodePath.join(directory, "kelaodeyun-account.json");
    await NodeFs.mkdir(directory);
    const saved = JSON.stringify({
      encryptedToken: Buffer.from("fixture").toString("base64"),
      user: { email: "user@example.com", name: null, avatar: null },
    });
    await NodeFs.writeFile(statePath, saved);
    await NodeFs.writeFile(legacyPath, saved);
    try {
      const layer = Layer.mergeAll(
        NodeServices.layer,
        Layer.succeed(DesktopEnvironment.DesktopEnvironment, {
          appDataDirectory: root,
          isDevelopment: true,
          platform: "darwin",
        } as unknown as DesktopEnvironment.DesktopEnvironment["Service"]),
        Layer.succeed(ElectronSafeStorage.ElectronSafeStorage, {
          isEncryptionAvailable: Effect.succeed(true),
          encryptString: () => Effect.succeed(new Uint8Array()),
          decryptString: () =>
            Effect.fail(
              new ElectronSafeStorage.ElectronSafeStorageDecryptError({
                cause: new Error("unavailable"),
              }),
            ),
          selectedStorageBackend: Effect.succeedNone,
        }),
        Layer.mock(ElectronShell.ElectronShell, {}),
        Layer.mock(ElectronWindow.ElectronWindow, { sendAll: () => Effect.void }),
        Layer.mock(ElectronDialog.ElectronDialog, {}),
      );
      const account = await Effect.runPromise(DesktopAccount.make.pipe(Effect.provide(layer)));
      expect(await Effect.runPromise(account.state)).toEqual({ status: "signed-out" });
      await expect(NodeFs.stat(statePath)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(NodeFs.stat(legacyPath)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await NodeFs.rm(root, { recursive: true, force: true });
    }
  });
  it("saves resolved SSH credentials, skips encrypted keys, and rejects unsafe or missing keys", async () => {
    const root = await NodeFs.mkdtemp(NodePath.join(NodeOs.tmpdir(), "kld-ssh-test-"));
    const stateDir = NodePath.join(root, "agent-cloud-os-dev");
    const oldPath = process.env.PATH;
    const oldConfig = process.env.SSH_TEST_CONFIG;
    const user = { email: "user@example.com", name: "用户", avatar: null };
    const encrypted = NodePath.join(root, "encrypted");
    const valid = NodePath.join(root, "valid");
    const config = NodePath.join(root, "ssh-output");
    await NodeFs.mkdir(stateDir);
    await NodeFs.writeFile(
      NodePath.join(stateDir, "account.json"),
      JSON.stringify({
        encryptedToken: Buffer.from(`encrypted:${"a".repeat(64)}`).toString("base64"),
        user,
      }),
    );
    NodeChildProcess.execFileSync(
      "ssh-keygen",
      ["-q", "-t", "ed25519", "-N", "passphrase", "-f", encrypted],
      {
        stdio: "ignore",
      },
    );
    NodeChildProcess.execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", valid], {
      stdio: "ignore",
    });
    await NodeFs.writeFile(NodePath.join(root, "ssh"), '#!/bin/sh\ncat "$SSH_TEST_CONFIG"\n', {
      mode: 0o755,
    });
    process.env.PATH = `${root}${NodePath.delimiter}${oldPath ?? ""}`;
    process.env.SSH_TEST_CONFIG = config;
    let posted: Record<string, unknown> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL, init?: RequestInit) => {
        posted = JSON.parse(String(init?.body));
        return Response.json({
          id: "host-1",
          label: posted.label,
          hostname: posted.hostname,
          port: posted.port,
          username: posted.username,
          authType: posted.authType,
          source: "account",
        });
      }),
    );
    try {
      const layer = Layer.mergeAll(
        NodeServices.layer,
        Layer.succeed(DesktopEnvironment.DesktopEnvironment, {
          appDataDirectory: root,
          isDevelopment: true,
          platform: "darwin",
        } as unknown as DesktopEnvironment.DesktopEnvironment["Service"]),
        Layer.succeed(
          ElectronSafeStorage.ElectronSafeStorage,
          ElectronSafeStorage.ElectronSafeStorage.of({
            isEncryptionAvailable: Effect.succeed(true),
            encryptString: (value) => Effect.succeed(Buffer.from(`encrypted:${value}`)),
            decryptString: (value) => Effect.succeed(Buffer.from(value).toString().slice(10)),
            selectedStorageBackend: Effect.succeedNone,
          }),
        ),
        Layer.mock(ElectronShell.ElectronShell, {}),
        Layer.mock(ElectronWindow.ElectronWindow, { sendAll: () => Effect.void }),
        Layer.mock(ElectronDialog.ElectronDialog, {}),
      );
      const account = await Effect.runPromise(DesktopAccount.make.pipe(Effect.provide(layer)));
      const target = { alias: "example.com", hostname: "example.com", username: null, port: null };
      await NodeFs.writeFile(
        config,
        `hostname resolved.example.com\nuser alice\nport 2222\nidentityfile ${encrypted}\nidentityfile ${valid}\n`,
      );
      await Effect.runPromise(account.saveSshHost({ target }));
      expect(posted).toEqual({
        label: "example.com",
        hostname: "resolved.example.com",
        port: 2222,
        username: "alice",
        authType: "key",
        secret: await NodeFs.readFile(valid, "utf8"),
      });
      await expect(
        Effect.runPromise(account.saveSshHost({ target: { ...target, alias: "-bad" } })),
      ).rejects.toThrow("SSH 主机无效");
      await NodeFs.writeFile(
        config,
        `hostname resolved.example.com\nuser alice\nport 2222\nidentityfile ${encrypted}\n`,
      );
      await expect(Effect.runPromise(account.saveSshHost({ target }))).rejects.toThrow(
        "未找到可保存的私钥（带口令的私钥或 ssh-agent 暂不支持），请改用密码或手动选择私钥",
      );
      await Effect.runPromise(account.saveSshHost({ target, password: FIXTURE_TYPED_VALUE }));
      expect(posted).toMatchObject({
        hostname: "resolved.example.com",
        username: "alice",
        port: 2222,
        authType: "password",
        secret: FIXTURE_TYPED_VALUE,
      });
    } finally {
      if (oldPath === undefined) delete process.env.PATH;
      else process.env.PATH = oldPath;
      if (oldConfig === undefined) delete process.env.SSH_TEST_CONFIG;
      else process.env.SSH_TEST_CONFIG = oldConfig;
      vi.unstubAllGlobals();
      await NodeFs.rm(root, { recursive: true, force: true });
    }
  });
  /* oxlint-enable t3code/no-manual-effect-runtime-in-tests */
  it("exchanges a pending PKCE callback, caches a key privately and clears it on 401", async () => {
    const root = await NodeFs.mkdtemp(NodePath.join(NodeOs.tmpdir(), "kld-account-test-"));
    const stateDir = NodePath.join(root, "agent-cloud-os-dev");
    const user = { email: "user@example.com", name: "用户", avatar: null };
    const host = {
      id: "host-1",
      label: "test",
      hostname: "example.com",
      port: 22,
      username: "root",
      authType: "key",
      source: "account",
    };
    let opened!: (url: string) => void;
    const openedUrl = new Promise<string>((resolve) => {
      opened = resolve;
    });
    let verifier = "",
      unauthorized = false,
      secretCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        const url = new URL(String(input));
        if (url.pathname === "/api/app/token") {
          verifier = JSON.parse(String(init?.body)).verifier;
          return Response.json({ token: "a".repeat(64), user });
        }
        if (unauthorized) return Response.json({ error: "expired" }, { status: 401 });
        if (url.pathname === "/api/app/hosts") return Response.json({ hosts: [host] });
        if (url.pathname.endsWith("/secret")) {
          secretCalls++;
          return Response.json({ authType: "key", secret: "private-key-fixture" });
        }
        return Response.json({ ok: true });
      }),
    );
    try {
      const layer = Layer.mergeAll(
        NodeServices.layer,
        Layer.succeed(DesktopEnvironment.DesktopEnvironment, {
          appDataDirectory: root,
          isDevelopment: true,
          platform: "darwin",
        } as unknown as DesktopEnvironment.DesktopEnvironment["Service"]),
        Layer.succeed(
          ElectronSafeStorage.ElectronSafeStorage,
          ElectronSafeStorage.ElectronSafeStorage.of({
            isEncryptionAvailable: Effect.succeed(true),
            encryptString: (value) => Effect.succeed(Buffer.from(`encrypted:${value}`)),
            decryptString: (value) => Effect.succeed(Buffer.from(value).toString().slice(10)),
            selectedStorageBackend: Effect.succeedNone,
          }),
        ),
        Layer.succeed(
          ElectronShell.ElectronShell,
          ElectronShell.ElectronShell.of({
            openExternal: (url) =>
              Effect.sync(() => {
                opened(String(url));
                return true;
              }),
            openSystemSettings: () => Effect.succeed(false),
            copyText: () => Effect.void,
          }),
        ),
        Layer.succeed(ElectronWindow.ElectronWindow, {
          sendAll: () => Effect.void,
          currentMainOrFirst: Effect.succeedNone,
        } as unknown as ElectronWindow.ElectronWindow["Service"]),
        Layer.succeed(ElectronDialog.ElectronDialog, {
          pickFiles: () => Effect.succeed([]),
        } as unknown as ElectronDialog.ElectronDialog["Service"]),
      );
      const account = await Effect.runPromise(
        DesktopAccount.make.pipe(
          Effect.provide(layer),
          Effect.provideService(HostProcess.Environment, {
            AGENT_CLOUD_OS_ACCOUNT_ORIGIN: "https://new-origin.example",
            KELAODEYUN_ACCOUNT_ORIGIN: "https://old-origin.example",
          }),
        ),
      );
      expect(
        account.receiveCallback(`agentcloudos-dev://app/account/callback?code=${"b".repeat(64)}`),
      ).toBe(false);
      const login = Effect.runPromise(account.login);
      const authorize = new URL(await openedUrl);
      expect(authorize.origin).toBe("https://new-origin.example");
      expect(authorize.searchParams.get("scheme")).toBe("agentcloudos-dev");
      expect(
        account.receiveCallback(`agentcloudos://app/account/callback?code=${"b".repeat(64)}`),
      ).toBe(false);
      expect(
        account.receiveCallback(`agentcloudos-dev://app/account/callback?code=${"b".repeat(64)}`),
      ).toBe(true);
      expect(await login).toEqual({ status: "signed-in", user });
      expect(authorize.searchParams.get("challenge")).toBe(
        NodeCrypto.createHash("sha256").update(verifier).digest("base64url"),
      );
      const persisted = await NodeFs.readFile(NodePath.join(stateDir, "account.json"), "utf8");
      expect(persisted).not.toContain("a".repeat(64));
      await expect(
        Effect.runPromise(
          account.saveHost({
            hostname: "example.com",
            port: 22,
            username: "root",
            auth: { type: "key", privateKeyPath: "/not-selected" },
          }),
        ),
      ).rejects.toThrow("请先选择私钥文件");
      const target = {
        alias: "example.com",
        hostname: "example.com",
        username: "root",
        port: null,
      };
      const first = await Effect.runPromise(account.credentialFor(target));
      expect(Option.isSome(first)).toBe(true);
      if (Option.isSome(first)) {
        expect(await NodeFs.readFile(first.value.identityFile!, "utf8")).toBe(
          "private-key-fixture",
        );
        expect((await NodeFs.stat(first.value.identityFile!)).mode & 0o777).toBe(0o600);
      }
      await Effect.runPromise(account.credentialFor(target));
      expect(secretCalls).toBe(1);
      unauthorized = true;
      await expect(Effect.runPromise(account.listHosts)).rejects.toThrow();
      expect(await Effect.runPromise(account.state)).toEqual({ status: "signed-out" });
      await expect(NodeFs.stat(NodePath.join(stateDir, "account-keys"))).rejects.toMatchObject({
        code: "ENOENT",
      });
      await expect(NodeFs.stat(NodePath.join(stateDir, "account.json"))).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      vi.unstubAllGlobals();
      await NodeFs.rm(root, { recursive: true, force: true });
    }
  });

  it("caches an empty host list and backs off failed credential lookups", async () => {
    const root = await NodeFs.mkdtemp(NodePath.join(NodeOs.tmpdir(), "kld-account-test-"));
    const stateDir = NodePath.join(root, "agent-cloud-os-dev");
    const user = { email: "user@example.com", name: "用户", avatar: null };
    await NodeFs.mkdir(stateDir);
    await NodeFs.writeFile(
      NodePath.join(stateDir, "account.json"),
      JSON.stringify({
        encryptedToken: Buffer.from(`encrypted:${"a".repeat(64)}`).toString("base64"),
        user,
      }),
    );
    let hostCalls = 0;
    let secretCalls = 0;
    let offline = false;
    let secretOffline = false;
    let includeHost = false;
    const host = {
      id: "host-1",
      label: "test",
      hostname: "example.com",
      port: 22,
      username: "root",
      authType: "password",
      source: "account",
    };
    const clock = vi.spyOn(Date, "now").mockReturnValue(1_000);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        if (new URL(String(input)).pathname === "/api/app/hosts" && init?.method === "GET") {
          hostCalls++;
          if (offline) throw Error("offline");
          return Response.json({ hosts: includeHost ? [host] : [] });
        }
        if (new URL(String(input)).pathname.endsWith("/secret")) {
          secretCalls++;
          if (secretOffline) throw Error("offline");
          return Response.json({ authType: "password", secret: "password" });
        }
        return Response.json({ ok: true });
      }),
    );
    try {
      const layer = Layer.mergeAll(
        NodeServices.layer,
        Layer.succeed(DesktopEnvironment.DesktopEnvironment, {
          appDataDirectory: root,
          isDevelopment: true,
          platform: "darwin",
        } as unknown as DesktopEnvironment.DesktopEnvironment["Service"]),
        Layer.succeed(
          ElectronSafeStorage.ElectronSafeStorage,
          ElectronSafeStorage.ElectronSafeStorage.of({
            isEncryptionAvailable: Effect.succeed(true),
            encryptString: (value) => Effect.succeed(Buffer.from(`encrypted:${value}`)),
            decryptString: (value) => Effect.succeed(Buffer.from(value).toString().slice(10)),
            selectedStorageBackend: Effect.succeedNone,
          }),
        ),
        Layer.mock(ElectronShell.ElectronShell, {}),
        Layer.mock(ElectronWindow.ElectronWindow, { sendAll: () => Effect.void }),
        Layer.mock(ElectronDialog.ElectronDialog, {}),
      );
      const account = await Effect.runPromise(DesktopAccount.make.pipe(Effect.provide(layer)));
      const target = {
        alias: "example.com",
        hostname: "example.com",
        username: "root",
        port: null,
      };
      const [first, second] = await Promise.all([
        Effect.runPromise(account.credentialFor(target)),
        Effect.runPromise(account.credentialFor(target)),
      ]);
      expect(Option.isNone(first)).toBe(true);
      expect(Option.isNone(second)).toBe(true);
      expect(Option.isNone(await Effect.runPromise(account.credentialFor(target)))).toBe(true);
      expect(hostCalls).toBe(1);
      await Effect.runPromise(account.deleteHost("host-1"));
      offline = true;
      expect(Option.isNone(await Effect.runPromise(account.credentialFor(target)))).toBe(true);
      expect(Option.isNone(await Effect.runPromise(account.credentialFor(target)))).toBe(true);
      expect(hostCalls).toBe(2);
      clock.mockReturnValue(61_000);
      offline = false;
      expect(Option.isNone(await Effect.runPromise(account.credentialFor(target)))).toBe(true);
      expect(hostCalls).toBe(3);
      await Effect.runPromise(account.listHosts);
      expect(hostCalls).toBe(4);
      await Effect.runPromise(account.deleteHost("host-1"));
      includeHost = true;
      secretOffline = true;
      expect(Option.isNone(await Effect.runPromise(account.credentialFor(target)))).toBe(true);
      expect(Option.isNone(await Effect.runPromise(account.credentialFor(target)))).toBe(true);
      expect(secretCalls).toBe(1);
      clock.mockReturnValue(121_000);
      secretOffline = false;
      expect(Option.getOrNull(await Effect.runPromise(account.credentialFor(target)))).toEqual({
        password: "password",
      });
      expect(secretCalls).toBe(2);
    } finally {
      clock.mockRestore();
      vi.unstubAllGlobals();
      await NodeFs.rm(root, { recursive: true, force: true });
    }
  });
});
