// @effect-diagnostics nodeBuiltinImport:off globalFetch:off globalFetchInEffect:off globalTimers:off globalDate:off -- Native callbacks and account I/O run in the Electron main process.
import * as NodeCrypto from "node:crypto";
import * as NodeFs from "node:fs/promises";
import * as NodeOs from "node:os";
import * as NodePath from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  DesktopAccountHostSchema,
  DesktopAccountUserSchema,
  accountHostMatchesTarget,
  type DesktopAccountHost,
  type DesktopAccountHostInput,
  type DesktopAccountState,
  type DesktopSshEnvironmentTarget,
} from "@t3tools/contracts";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as DesktopUserData from "../app/DesktopUserData.ts";
import * as ElectronDialog from "../electron/ElectronDialog.ts";
import * as ElectronProtocol from "../electron/ElectronProtocol.ts";
import * as ElectronSafeStorage from "../electron/ElectronSafeStorage.ts";
import * as ElectronShell from "../electron/ElectronShell.ts";
import * as ElectronWindow from "../electron/ElectronWindow.ts";
import * as IpcChannels from "../ipc/channels.ts";

const execFileAsync = promisify(execFile);
const TokenResponseSchema = Schema.Struct({ token: Schema.String, user: DesktopAccountUserSchema });
const HostsResponseSchema = Schema.Struct({ hosts: Schema.Array(DesktopAccountHostSchema) });
const SecretResponseSchema = Schema.Struct({
  authType: Schema.Literals(["key", "password"]),
  secret: Schema.String,
});
const StoredAccountSchema = Schema.Struct({
  encryptedToken: Schema.String,
  user: DesktopAccountUserSchema,
});
const decodeToken = Schema.decodeUnknownSync(TokenResponseSchema);
const decodeHosts = Schema.decodeUnknownSync(HostsResponseSchema);
const decodeHost = Schema.decodeUnknownSync(DesktopAccountHostSchema);
const decodeSecret = Schema.decodeUnknownSync(SecretResponseSchema);
const decodeStored = Schema.decodeUnknownSync(StoredAccountSchema);

export class DesktopAccountError extends Schema.TaggedError<DesktopAccountError>()(
  "DesktopAccountError",
  { message: Schema.String },
) {}

export class DesktopAccount extends Context.Service<
  DesktopAccount,
  {
    readonly state: Effect.Effect<DesktopAccountState, DesktopAccountError>;
    readonly login: Effect.Effect<DesktopAccountState, DesktopAccountError>;
    readonly logout: Effect.Effect<void, DesktopAccountError>;
    readonly receiveCallback: (url: string) => boolean;
    readonly onChange: (listener: () => void) => () => void;
    readonly listHosts: Effect.Effect<readonly DesktopAccountHost[], DesktopAccountError>;
    readonly pickPrivateKey: Effect.Effect<{ readonly path: string } | null, DesktopAccountError>;
    readonly saveHost: (
      input: DesktopAccountHostInput,
    ) => Effect.Effect<DesktopAccountHost, DesktopAccountError>;
    readonly deleteHost: (id: string) => Effect.Effect<void, DesktopAccountError>;
    readonly credentialFor: (
      target: DesktopSshEnvironmentTarget,
    ) => Effect.Effect<
      Option.Option<{ readonly identityFile?: string; readonly password?: string }>
    >;
  }
>()("@t3tools/desktop/account/DesktopAccount") {}

const asError = (cause: unknown) =>
  new DesktopAccountError({
    message: cause instanceof Error ? cause.message : "账户服务暂时不可用",
  });

export const make = Effect.gen(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const userData = yield* DesktopUserData.resolveUserDataPath(environment);
  const safeStorage = yield* ElectronSafeStorage.ElectronSafeStorage;
  const shell = yield* ElectronShell.ElectronShell;
  const dialog = yield* ElectronDialog.ElectronDialog;
  const windows = yield* ElectronWindow.ElectronWindow;
  const env = yield* HostProcess.Environment;
  const home = yield* HostProcess.HomeDirectory;
  const context = yield* Effect.context<never>();
  const runPromise = Effect.runPromiseWith(context);
  const origin = env.KELAODEYUN_ACCOUNT_ORIGIN?.trim() || "https://kelaodeyun.com";
  const scheme = ElectronProtocol.getDesktopScheme(environment.isDevelopment);
  const statePath = NodePath.join(userData, "kelaodeyun-account.json");
  const keyDir = NodePath.join(userData, "account-keys");
  let state: DesktopAccountState = { status: "signed-out" };
  let token: string | null = null;
  let hosts: readonly DesktopAccountHost[] | null = null;
  let hostsRequest: Promise<readonly DesktopAccountHost[]> | null = null;
  let hostsRetryAt = 0;
  let hostsVersion = 0;
  const invalidateHosts = () => {
    hosts = null;
    hostsRequest = null;
    hostsRetryAt = 0;
    hostsVersion++;
  };
  const secrets = new Map<string, { readonly identityFile?: string; readonly password?: string }>();
  const secretRetryAt = new Map<string, number>();
  const selectedKeys = new Set<string>();
  const listeners = new Set<() => void>();
  let generation = 0;
  let credentialVersion = 0;
  let writes: Promise<void> = Promise.resolve();
  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = writes.then(operation, operation);
    writes = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
  let loaded: Promise<void> | undefined;
  let pending: {
    verifier: string;
    generation: number;
    claimed: boolean;
    timer: ReturnType<typeof setTimeout>;
    resolve: (state: DesktopAccountState) => void;
    reject: (error: Error) => void;
  } | null = null;

  const broadcast = () => {
    for (const listener of listeners) listener();
    void runPromise(windows.sendAll(IpcChannels.ACCOUNT_STATE_CHANNEL, state));
  };
  const load = () =>
    (loaded ??= (async () => {
      let raw: string;
      try {
        raw = await NodeFs.readFile(statePath, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
      }
      const saved = decodeStored(JSON.parse(raw));
      if (!(await runPromise(safeStorage.isEncryptionAvailable))) throw Error("系统安全存储不可用");
      token = await runPromise(
        safeStorage.decryptString(Buffer.from(saved.encryptedToken, "base64")),
      );
      state = { status: "signed-in", user: saved.user };
    })());

  const clear = async () => {
    generation++;
    credentialVersion++;
    const login = pending;
    pending = null;
    if (login) {
      clearTimeout(login.timer);
      login.reject(Error("登录已取消"));
    }
    token = null;
    state = { status: "signed-out" };
    invalidateHosts();
    secrets.clear();
    secretRetryAt.clear();
    selectedKeys.clear();
    await serialize(async () => {
      await Promise.all([
        NodeFs.rm(statePath, { force: true }),
        NodeFs.rm(keyDir, { recursive: true, force: true }),
      ]);
    });
    broadcast();
  };
  const api = async (path: string, method = "GET", body?: unknown) => {
    await load();
    if (!token) throw Error("请先登录");
    const requestToken = token;
    const response = await fetch(new URL(path, origin), {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${requestToken}`,
        ...(method === "GET" ? {} : { "Content-Type": "application/json" }),
      },
      ...(method === "GET" ? {} : { body: JSON.stringify(body ?? {}) }),
    });
    if (response.status === 401) {
      if (token === requestToken) await clear();
      throw Error("登录已失效，请重新登录");
    }
    if (token !== requestToken) throw Error("登录已失效，请重新登录");
    const result: unknown = await response.json();
    if (token !== requestToken) throw Error("登录已失效，请重新登录");
    if (!response.ok) {
      const message =
        typeof result === "object" &&
        result !== null &&
        "error" in result &&
        typeof result.error === "string"
          ? result.error
          : "账户请求失败";
      throw Error(message);
    }
    return result;
  };
  const fetchHosts = () => {
    const version = hostsVersion;
    let request!: Promise<readonly DesktopAccountHost[]>;
    request = (async () => {
      try {
        const result = decodeHosts(await api("/api/app/hosts"));
        if (version === hostsVersion) {
          hosts = result.hosts;
          hostsRetryAt = 0;
        }
        return result.hosts;
      } catch (error) {
        if (version === hostsVersion) hostsRetryAt = Date.now() + 60_000;
        throw error;
      } finally {
        if (hostsRequest === request) hostsRequest = null;
      }
    })();
    hostsRequest = request;
    return request;
  };
  const listHosts = () => {
    invalidateHosts();
    return fetchHosts();
  };
  const login = async (): Promise<DesktopAccountState> => {
    await load();
    if (pending) throw Error("已有登录正在进行");
    if (token) throw Error("请先退出当前账户");
    const verifier = NodeCrypto.randomBytes(32).toString("base64url");
    const challenge = NodeCrypto.createHash("sha256").update(verifier).digest("base64url");
    const url = new URL("/api/app/authorize", origin);
    url.search = new URLSearchParams({ challenge, scheme }).toString();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (pending?.timer !== timer) return;
        pending = null;
        reject(Error("登录超时，请重试"));
      }, 300_000);
      pending = { verifier, generation, claimed: false, timer, resolve, reject };
      void runPromise(shell.openExternal(url.href)).then((opened) => {
        if (!opened && pending?.timer === timer) {
          clearTimeout(timer);
          pending = null;
          reject(Error("无法打开浏览器"));
        }
      });
    });
  };
  const receiveCallback = (raw: string) => {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return false;
    }
    if (
      url.protocol !== `${scheme}:` ||
      url.host !== "app" ||
      url.pathname !== "/account/callback" ||
      url.username ||
      url.password ||
      url.hash
    )
      return false;
    const code = url.searchParams.get("code");
    const current = pending;
    if (!current || current.claimed || !code || !/^[a-f0-9]{64}$/.test(code)) return false;
    current.claimed = true;
    void (async () => {
      try {
        const response = await fetch(new URL("/api/app/token", origin), {
          method: "POST",
          redirect: "error",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(10_000),
          body: JSON.stringify({ code, verifier: current.verifier, device: "kelaodeyun macOS" }),
        });
        if (!response.ok) throw Error("登录码无效或已过期");
        const result = decodeToken(await response.json());
        if (!/^[a-f0-9]{64}$/.test(result.token)) throw Error("账户返回了无效的登录凭据");
        if (!(await runPromise(safeStorage.isEncryptionAvailable)))
          throw Error("系统安全存储不可用");
        const encrypted = await runPromise(safeStorage.encryptString(result.token));
        await serialize(async () => {
          if (pending !== current || generation !== current.generation) return;
          await NodeFs.mkdir(userData, { recursive: true });
          const temporary = statePath + "." + NodeCrypto.randomBytes(12).toString("hex");
          try {
            await NodeFs.writeFile(
              temporary,
              JSON.stringify({
                encryptedToken: Buffer.from(encrypted).toString("base64"),
                user: result.user,
              }),
              { mode: 0o600, flag: "wx" },
            );
            if (pending !== current || generation !== current.generation) return;
            await NodeFs.rename(temporary, statePath);
            if (pending !== current || generation !== current.generation) return;
            token = result.token;
            state = { status: "signed-in", user: result.user };
            invalidateHosts();
            secrets.clear();
            secretRetryAt.clear();
            clearTimeout(current.timer);
            pending = null;
            broadcast();
            current.resolve(state);
          } finally {
            await NodeFs.rm(temporary, { force: true });
          }
        });
      } catch (error) {
        if (pending === current) {
          clearTimeout(current.timer);
          pending = null;
          current.reject(error instanceof Error ? error : Error("登录失败"));
        }
      }
    })();
    return true;
  };
  const saveHost = async (input: DesktopAccountHostInput) => {
    await load();
    const sessionGeneration = generation;
    if (!token) throw Error("请先登录");
    let secret: string;
    if (input.auth.type === "password") secret = input.auth.password;
    else {
      if (!selectedKeys.has(input.auth.privateKeyPath)) throw Error("请先选择私钥文件");
      try {
        secret = await NodeFs.readFile(input.auth.privateKeyPath, "utf8");
      } catch {
        throw Error("私钥无效或带有口令，暂不支持带口令的私钥");
      }
      if (secret.length > 16384) throw Error("私钥无效或带有口令，暂不支持带口令的私钥");
      const temporaryDir = await NodeFs.mkdtemp(NodePath.join(NodeOs.tmpdir(), "kelaodeyun-key-"));
      const temp = NodePath.join(temporaryDir, "key");
      try {
        await NodeFs.writeFile(temp, secret, { mode: 0o600, flag: "wx" });
        await execFileAsync("ssh-keygen", ["-y", "-P", "", "-f", temp], { timeout: 10_000 });
      } catch {
        throw Error("私钥无效或带有口令，暂不支持带口令的私钥");
      } finally {
        await NodeFs.rm(temporaryDir, { recursive: true, force: true });
      }
    }
    if (sessionGeneration !== generation) throw Error("登录已失效，请重新登录");
    const result = decodeHost(
      await api("/api/app/hosts", "POST", {
        label: input.label,
        hostname: input.hostname,
        port: input.port,
        username: input.username,
        authType: input.auth.type,
        secret,
      }),
    );
    if (!/^[a-zA-Z0-9-]+$/.test(result.id)) throw Error("账户返回了无效的服务器");
    if (input.auth.type === "key") selectedKeys.delete(input.auth.privateKeyPath);
    credentialVersion++;
    secrets.delete(result.id);
    secretRetryAt.delete(result.id);
    await serialize(() => NodeFs.rm(NodePath.join(keyDir, result.id), { force: true }));
    invalidateHosts();
    broadcast();
    return result;
  };
  const deleteHost = async (id: string) => {
    if (!/^[a-zA-Z0-9-]+$/.test(id)) throw Error("服务器无效");
    await api(`/api/app/hosts/${id}`, "DELETE");
    credentialVersion++;
    secrets.delete(id);
    secretRetryAt.delete(id);
    invalidateHosts();
    await serialize(() => NodeFs.rm(NodePath.join(keyDir, id), { force: true }));
    broadcast();
  };
  const credentialFor = async (target: DesktopSshEnvironmentTarget) => {
    await load();
    if (!token) return Option.none();
    if (hosts === null) {
      if (Date.now() < hostsRetryAt) return Option.none();
      await (hostsRequest ?? fetchHosts());
    }
    const host = hosts?.find((entry) => accountHostMatchesTarget(entry, target));
    if (!host || !/^[a-zA-Z0-9-]+$/.test(host.id)) return Option.none();
    const cached = secrets.get(host.id);
    if (cached) return Option.some(cached);
    if (Date.now() < (secretRetryAt.get(host.id) ?? 0)) return Option.none();
    const currentGeneration = generation,
      currentVersion = credentialVersion;
    let result: typeof SecretResponseSchema.Type;
    try {
      result = decodeSecret(await api(`/api/app/hosts/${host.id}/secret`));
    } catch (error) {
      if (currentGeneration === generation && currentVersion === credentialVersion) {
        secretRetryAt.set(host.id, Date.now() + 60_000);
      }
      throw error;
    }
    if (currentGeneration !== generation || currentVersion !== credentialVersion)
      return Option.none();
    secretRetryAt.delete(host.id);
    let credential: { identityFile?: string; password?: string };
    if (result.authType === "password") credential = { password: result.secret };
    else {
      const identityFile = NodePath.join(keyDir, host.id);
      await serialize(async () => {
        if (currentGeneration !== generation || currentVersion !== credentialVersion) return;
        await NodeFs.mkdir(keyDir, { recursive: true, mode: 0o700 });
        await NodeFs.chmod(keyDir, 0o700);
        await NodeFs.writeFile(identityFile, result.secret, { mode: 0o600 });
        await NodeFs.chmod(identityFile, 0o600);
      });
      if (currentGeneration !== generation || currentVersion !== credentialVersion)
        return Option.none();
      credential = { identityFile };
    }
    secrets.set(host.id, credential);
    return Option.some(credential);
  };

  return DesktopAccount.of({
    state: Effect.tryPromise({
      try: async () => {
        await load();
        return state;
      },
      catch: asError,
    }),
    login: Effect.tryPromise({ try: login, catch: asError }),
    logout: Effect.tryPromise({
      try: async () => {
        await load();
        const previous = token;
        await clear();
        if (previous) {
          try {
            await fetch(new URL("/api/app/logout", origin), {
              method: "POST",
              redirect: "error",
              headers: { Authorization: `Bearer ${previous}`, "Content-Type": "application/json" },
              body: "{}",
              signal: AbortSignal.timeout(10_000),
            });
          } catch {}
        }
      },
      catch: asError,
    }),
    receiveCallback,
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    listHosts: Effect.tryPromise({ try: listHosts, catch: asError }),
    pickPrivateKey: Effect.gen(function* () {
      const owner = yield* windows.currentMainOrFirst;
      const files = yield* dialog.pickFiles({
        owner,
        defaultPath: Option.some(NodePath.join(home, ".ssh")),
        filters: [],
        multiple: false,
      });
      if (!files[0]) return null;
      selectedKeys.add(files[0]);
      return { path: files[0] };
    }).pipe(Effect.mapError(asError)),
    saveHost: Effect.fn("DesktopAccount.saveHost")((input: DesktopAccountHostInput) =>
      Effect.tryPromise({ try: () => saveHost(input), catch: asError }),
    ),
    deleteHost: Effect.fn("DesktopAccount.deleteHost")((id: string) =>
      Effect.tryPromise({ try: () => deleteHost(id), catch: asError }),
    ),
    credentialFor: Effect.fn("DesktopAccount.credentialFor")(
      (target: DesktopSshEnvironmentTarget) =>
        Effect.tryPromise({ try: () => credentialFor(target), catch: asError }).pipe(
          Effect.orElseSucceed(() => Option.none()),
        ),
    ),
  });
});

export const layer = Layer.effect(DesktopAccount, make);
