// @effect-diagnostics nodeBuiltinImport:off -- Isolated temporary account storage exercises the desktop boundary.
import * as NodeCrypto from "node:crypto";
import * as NodeFs from "node:fs/promises";
import * as NodeOs from "node:os";
import * as NodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it, vi } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as ElectronDialog from "../electron/ElectronDialog.ts";
import * as ElectronSafeStorage from "../electron/ElectronSafeStorage.ts";
import * as ElectronShell from "../electron/ElectronShell.ts";
import * as ElectronWindow from "../electron/ElectronWindow.ts";
import * as DesktopAccount from "./DesktopAccount.ts";

describe("desktop account", () => {
  it("exchanges a pending PKCE callback, caches a key privately and clears it on 401", async () => {
    const root = await NodeFs.mkdtemp(NodePath.join(NodeOs.tmpdir(), "kld-account-test-"));
    const stateDir = NodePath.join(root, "kelaodeyun-dev");
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
      const account = await Effect.runPromise(DesktopAccount.make.pipe(Effect.provide(layer)));
      expect(
        account.receiveCallback(`kelaodeyun-dev://app/account/callback?code=${"b".repeat(64)}`),
      ).toBe(false);
      const login = Effect.runPromise(account.login);
      const authorize = new URL(await openedUrl);
      expect(authorize.searchParams.get("scheme")).toBe("kelaodeyun-dev");
      expect(
        account.receiveCallback(`kelaodeyun://app/account/callback?code=${"b".repeat(64)}`),
      ).toBe(false);
      expect(
        account.receiveCallback(`kelaodeyun-dev://app/account/callback?code=${"b".repeat(64)}`),
      ).toBe(true);
      expect(await login).toEqual({ status: "signed-in", user });
      expect(authorize.searchParams.get("challenge")).toBe(
        NodeCrypto.createHash("sha256").update(verifier).digest("base64url"),
      );
      const persisted = await NodeFs.readFile(
        NodePath.join(stateDir, "kelaodeyun-account.json"),
        "utf8",
      );
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
      await expect(
        NodeFs.stat(NodePath.join(stateDir, "kelaodeyun-account.json")),
      ).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      vi.unstubAllGlobals();
      await NodeFs.rm(root, { recursive: true, force: true });
    }
  });

  it("caches an empty host list and backs off failed credential lookups", async () => {
    const root = await NodeFs.mkdtemp(NodePath.join(NodeOs.tmpdir(), "kld-account-test-"));
    const stateDir = NodePath.join(root, "kelaodeyun-dev");
    const user = { email: "user@example.com", name: "用户", avatar: null };
    await NodeFs.mkdir(stateDir);
    await NodeFs.writeFile(
      NodePath.join(stateDir, "kelaodeyun-account.json"),
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
