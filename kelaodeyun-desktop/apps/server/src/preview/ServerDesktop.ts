import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

import * as ServerConfig from "../config.ts";
import { resolveRootCliCommand } from "../cli/invocation.ts";
import * as PreviewBrowser from "./PreviewBrowser.ts";
import * as PreviewBrowserHost from "./PreviewBrowserHost.ts";
import * as DesktopSession from "./desktopSession.ts";

const SCREEN = "1600x900x24";
const START_URL = "https://www.google.com";
const CHROME_LANGUAGE = "zh-CN";
/** How long a viewer's connection waits on a desktop that is still installing or starting. */
const READY_WAIT = "20 seconds";
const DISPLAY_WAIT = "10 seconds";
/** A process that ran this long before exiting restarts quickly; quicker exits back off. */
const HEALTHY_RUN_MS = 10_000;
const MAX_RESTART_DELAY_SECONDS = 60;

const TOOLS = [
  { command: "Xvfb", aptPackage: "xvfb" },
  { command: "x11vnc", aptPackage: "x11vnc" },
  { command: "openbox", aptPackage: "openbox" },
  { command: "tint2", aptPackage: "tint2" },
  { command: "pcmanfm", aptPackage: "pcmanfm" },
] as const;
const CJK_FONT_PACKAGE = "fonts-noto-cjk";
const ICON_THEME = {
  path: "/usr/share/icons/Adwaita/index.theme",
  aptPackage: "adwaita-icon-theme",
};
/** gdk-pixbuf's SVG loader draws the wallpaper and most theme icons. */
const SVG_LOADER = {
  relativePath: "gdk-pixbuf-2.0/2.10.0/loaders/libpixbufloader-svg.so",
  aptPackage: "librsvg2-common",
};
const APT_GET = "/usr/bin/apt-get";

export class ServerDesktopUnsupportedError extends Schema.TaggedError<ServerDesktopUnsupportedError>()(
  "ServerDesktopUnsupportedError",
  { platform: Schema.String },
) {
  override get message(): string {
    return `The desktop needs a Linux server; this one runs ${this.platform}.`;
  }
}

export class ServerDesktopPreparingError extends Schema.TaggedError<ServerDesktopPreparingError>()(
  "ServerDesktopPreparingError",
  { detail: Schema.String },
) {
  override get message(): string {
    return this.detail;
  }
}

export class ServerDesktopPackagesError extends Schema.TaggedError<ServerDesktopPackagesError>()(
  "ServerDesktopPackagesError",
  { packages: Schema.Array(Schema.String), command: Schema.String },
) {
  override get message(): string {
    return `This host is missing ${this.packages.join(", ")}. Run \`${this.command}\` on the host, then try again.`;
  }
}

export class ServerDesktopStartError extends Schema.TaggedError<ServerDesktopStartError>()(
  "ServerDesktopStartError",
  { detail: Schema.String, cause: Schema.optional(Schema.Defect()) },
) {
  override get message(): string {
    return this.detail;
  }
}

export type ServerDesktopError =
  | ServerDesktopUnsupportedError
  | ServerDesktopPreparingError
  | ServerDesktopPackagesError
  | ServerDesktopStartError
  | PreviewBrowserHost.PreviewBrowserRootError
  | PreviewBrowserHost.PreviewBrowserSandboxError
  | PreviewBrowserHost.PreviewBrowserLibrariesError;

export class ServerDesktop extends Context.Service<
  ServerDesktop,
  {
    /** Starts the desktop on first use; resolves to the Unix socket of its VNC server. */
    readonly vncSocket: Effect.Effect<string, ServerDesktopError>;
  }
>()("t3/preview/ServerDesktop") {}

/** Debian package names for what the desktop needs and this host lacks. */
export const missingDesktopPackages = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const directories = ((yield* HostProcess.Environment).PATH ?? "")
    .split(":")
    .filter((directory) => directory.length > 0);
  const missing: Array<string> = [];
  for (const tool of TOOLS) {
    const found = yield* Effect.findFirst(directories, (directory) =>
      fs.exists(path.join(directory, tool.command)).pipe(Effect.orElseSucceed(() => false)),
    );
    if (Option.isNone(found)) missing.push(tool.aptPackage);
  }
  // Without a CJK font, Chinese and Japanese pages render as boxes.
  const cjkFonts = yield* spawner
    .string(
      ChildProcess.make("fc-list", [":lang=zh", "family"], { stdin: "ignore", stderr: "ignore" }),
    )
    .pipe(
      Effect.timeout("10 seconds"),
      Effect.orElseSucceed(() => ""),
    );
  if (cjkFonts.trim() === "") missing.push(CJK_FONT_PACKAGE);
  const exists = (file: string) => fs.exists(file).pipe(Effect.orElseSucceed(() => false));
  if (!(yield* exists(ICON_THEME.path))) missing.push(ICON_THEME.aptPackage);
  // Multiarch hosts keep loaders under /usr/lib/<triplet>.
  const libDirectories = (yield* fs.readDirectory("/usr/lib").pipe(Effect.orElseSucceed(() => [])))
    .filter((name) => name.includes("-linux-"))
    .map((name) => path.join("/usr/lib", name));
  const svgLoader = yield* Effect.findFirst(["/usr/lib", ...libDirectories], (directory) =>
    exists(path.join(directory, SVG_LOADER.relativePath)),
  );
  if (Option.isNone(svgLoader)) missing.push(SVG_LOADER.aptPackage);
  return missing;
}).pipe(Effect.withSpan("ServerDesktop.missingDesktopPackages"));

type State =
  | { readonly _tag: "idle" }
  | {
      readonly _tag: "starting";
      readonly done: Deferred.Deferred<string, ServerDesktopError>;
    }
  | { readonly _tag: "running"; readonly socket: string; readonly scope: Scope.Closeable }
  | { readonly _tag: "failed"; readonly error: ServerDesktopError };

const megabytes = (bytes: number) => Math.round(bytes / 1_000_000);

const make = Effect.gen(function* () {
  const config = yield* ServerConfig.ServerConfig;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const platform = yield* HostProcess.Platform;
  const serviceScope = yield* Effect.scope;
  const services = yield* Effect.context<
    FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
  >();
  const chrome = yield* PreviewBrowser.makePreviewBrowser({
    baseDir: config.baseDir,
    product: PreviewBrowser.DESKTOP_CHROME,
    wait: "5 seconds",
  });
  // sudo resets the environment, so the command has to name this server's home.
  const setupCommand = yield* resolveRootCliCommand(PreviewBrowserHost.SETUP_SUBCOMMAND, [
    "--base-dir",
    config.baseDir,
  ]);
  const profileDir = path.join(config.stateDir, "desktop-chromium");
  const sessionDir = path.join(config.stateDir, "desktop-session");
  const gate = yield* Semaphore.make(1);
  let state: State = { _tag: "idle" };
  let phase = "Starting the desktop…";

  const startError = (detail: string) => (cause: unknown) =>
    new ServerDesktopStartError({ detail, cause });

  const aptGet = (args: ReadonlyArray<string>) =>
    spawner
      .exitCode(
        ChildProcess.make(APT_GET, args, {
          env: { DEBIAN_FRONTEND: "noninteractive" },
          extendEnv: true,
          stdin: "ignore",
          stdout: "ignore",
          stderr: "ignore",
        }),
      )
      .pipe(
        Effect.mapError(startError(`Could not run apt-get ${args[0]}.`)),
        Effect.flatMap((code) =>
          code === 0
            ? Effect.void
            : Effect.fail(
                new ServerDesktopStartError({
                  detail: `apt-get ${args.join(" ")} exited with ${code}. Run it on the host to see why.`,
                }),
              ),
        ),
      );

  /** Installs with apt as root; anywhere else, says what to run. */
  const ensurePackages = Effect.fn("ServerDesktop.ensurePackages")(function* (isRoot: boolean) {
    const packages = yield* missingDesktopPackages;
    if (packages.length === 0) return;
    const hasApt = yield* fs.exists(APT_GET).pipe(Effect.orElseSucceed(() => false));
    if (!hasApt) {
      return yield* new ServerDesktopStartError({
        detail: `Install ${packages.join(", ")} with this host's package manager, then try again.`,
      });
    }
    if (!isRoot) {
      return yield* new ServerDesktopPackagesError({
        packages,
        command: `sudo apt-get install -y ${packages.join(" ")}`,
      });
    }
    phase = `Installing ${packages.join(", ")}…`;
    yield* aptGet(["update"]);
    yield* aptGet(["install", "-y", ...packages]);
    const still = yield* missingDesktopPackages;
    if (still.length > 0) {
      return yield* new ServerDesktopStartError({
        detail: `${still.join(", ")} still missing after apt-get install.`,
      });
    }
  });

  const chromeExecutable = chrome.executable.pipe(
    Effect.tapError((error) =>
      Effect.sync(() => {
        if (error._tag !== "PreviewBrowserInstallingError") return;
        phase = error.unpacking
          ? "Unpacking Chrome…"
          : `Downloading Chrome (${megabytes(error.downloadedBytes)} of ${megabytes(error.totalBytes)} MB)…`;
      }),
    ),
    Effect.retry({ while: (error) => error._tag === "PreviewBrowserInstallingError" }),
    Effect.mapError((error) => new ServerDesktopStartError({ detail: error.message })),
  );

  const ensureLibraries = Effect.fn("ServerDesktop.ensureLibraries")(function* (
    executable: string,
    isRoot: boolean,
  ) {
    const libraries = yield* PreviewBrowserHost.missingLibraries(executable);
    if (libraries.length === 0) return;
    const hasApt = yield* fs.exists(APT_GET).pipe(Effect.orElseSucceed(() => false));
    if (!isRoot || !hasApt) {
      return yield* new PreviewBrowserHost.PreviewBrowserLibrariesError({
        setupCommand,
        libraries,
      });
    }
    phase = "Installing Chrome's libraries…";
    const packages = yield* PreviewBrowserHost.aptPackages(
      PreviewBrowserHost.DESKTOP_DEBIAN_PACKAGES,
    );
    yield* aptGet(["update"]);
    yield* aptGet(["install", "-y", "--no-install-recommends", ...packages]);
  });

  /** Restarts a process whenever it exits, such as Chrome after its last window closes. */
  const supervise = Effect.fn("ServerDesktop.supervise")(function* (
    desktopScope: Scope.Closeable,
    name: string,
    command: ChildProcess.Command,
    prepare: Effect.Effect<void> = Effect.void,
  ) {
    return yield* Effect.gen(function* () {
      let quickExits = 0;
      while (true) {
        yield* prepare;
        const startedAt = yield* Clock.currentTimeMillis;
        const exit = yield* spawner.spawn(command).pipe(
          Effect.flatMap((child) => child.exitCode),
          Effect.scoped,
          Effect.exit,
        );
        const ranFor = (yield* Clock.currentTimeMillis) - startedAt;
        quickExits = ranFor < HEALTHY_RUN_MS ? quickExits + 1 : 0;
        yield* Effect.logWarning("server desktop process exited; restarting", {
          process: name,
          exit,
        });
        yield* Effect.sleep(Duration.seconds(Math.min(2 ** quickExits, MAX_RESTART_DELAY_SECONDS)));
      }
    }).pipe(Effect.forkIn(desktopScope));
  });

  const launch = Effect.fn("ServerDesktop.launch")(function* (
    desktopScope: Scope.Closeable,
    executable: string,
    sandbox: boolean,
  ) {
    phase = "Starting the desktop…";
    const inDesktop = Effect.provideService(Scope.Scope, desktopScope);
    const socketDir = yield* fs
      .makeTempDirectoryScoped({ prefix: "t3-desktop-" })
      .pipe(inDesktop, Effect.mapError(startError("Could not create the desktop's socket.")));
    const socket = path.join(socketDir, "vnc.sock");
    // -displayfd picks a free display and prints its number once the server accepts clients.
    const xvfb = yield* spawner
      .spawn(
        ChildProcess.make("Xvfb", ["-displayfd", "1", "-screen", "0", SCREEN, "-nolisten", "tcp"], {
          stdin: "ignore",
          stderr: "ignore",
        }),
      )
      .pipe(inDesktop, Effect.mapError(startError("Could not start Xvfb.")));
    const display = yield* xvfb.stdout.pipe(
      Stream.decodeText(),
      Stream.splitLines,
      Stream.runHead,
      Effect.timeout(DISPLAY_WAIT),
      Effect.mapError(startError("Xvfb did not report a display.")),
      Effect.flatMap((line) =>
        Option.isSome(line) && /^\d+$/.test(line.value.trim())
          ? Effect.succeed(`:${line.value.trim()}`)
          : Effect.fail(new ServerDesktopStartError({ detail: "Xvfb did not report a display." })),
      ),
    );
    // Everything else on the display goes with it.
    yield* xvfb.exitCode.pipe(
      Effect.exit,
      Effect.flatMap((exit) =>
        Effect.logWarning("server desktop display exited", { exit }).pipe(
          Effect.andThen(
            gate.withPermit(
              Effect.sync(() => {
                if (state._tag === "running" && state.scope === desktopScope) {
                  state = { _tag: "idle" };
                }
              }),
            ),
          ),
          Effect.andThen(Scope.close(desktopScope, Exit.void)),
        ),
      ),
      Effect.forkIn(serviceScope),
    );
    const layout = DesktopSession.desktopSessionLayout(sessionDir);
    // One launcher for the supervisor, the taskbar and the desktop icon: a second launch with
    // the same profile and flags opens a window in the running Chrome.
    const chromeIcon = path.join(path.dirname(executable), "product_logo_48.png");
    yield* Effect.forEach(
      DesktopSession.desktopSessionFiles({
        layout,
        home: yield* HostProcess.HomeDirectory,
        chromeIcon: (yield* fs.exists(chromeIcon).pipe(Effect.orElseSucceed(() => false)))
          ? chromeIcon
          : "applications-internet",
        chromeCommand: [
          executable,
          ...(sandbox ? [] : ["--no-sandbox"]),
          `--user-data-dir=${profileDir}`,
          `--lang=${CHROME_LANGUAGE}`,
          "--start-maximized",
          "--no-first-run",
          "--no-default-browser-check",
          "--password-store=basic",
          "--ozone-platform=x11",
        ],
      }),
      (file) =>
        fs
          .makeDirectory(path.dirname(file.path), { recursive: true })
          .pipe(
            Effect.andThen(fs.writeFileString(file.path, file.content)),
            Effect.andThen(fs.chmod(file.path, file.executable ? 0o755 : 0o644)),
          ),
      { discard: true },
    ).pipe(Effect.mapError(startError("Could not write the desktop's session files.")));
    const session = {
      env: DesktopSession.desktopSessionEnv(layout, display),
      extendEnv: true,
      cwd: yield* HostProcess.HomeDirectory,
    } as const;
    const quiet = { stdin: "ignore", stdout: "ignore", stderr: "ignore" } as const;
    yield* supervise(
      desktopScope,
      "openbox",
      ChildProcess.make("openbox", [], { ...session, ...quiet }),
    );
    yield* supervise(
      desktopScope,
      "tint2",
      ChildProcess.make("tint2", ["-c", path.join(layout.configHome, "tint2", "tint2rc")], {
        ...session,
        ...quiet,
      }),
    );
    // Draws the wallpaper and desktop icons, and serves file manager windows.
    yield* supervise(
      desktopScope,
      "pcmanfm",
      ChildProcess.make("pcmanfm", ["--desktop"], { ...session, ...quiet }),
    );
    yield* supervise(
      desktopScope,
      "x11vnc",
      ChildProcess.make(
        "x11vnc",
        // No TCP port at all: only this server, through its authenticated route, reaches the socket.
        [
          "-display",
          display,
          "-unixsock",
          socket,
          "-rfbport",
          "0",
          "-nopw",
          "-forever",
          "-shared",
          "-quiet",
        ],
        { ...session, ...quiet },
      ),
      fs.remove(socket, { force: true }).pipe(Effect.ignore),
    );
    yield* supervise(
      desktopScope,
      "chrome",
      ChildProcess.make(layout.chromeLauncher, [START_URL], { ...session, ...quiet }),
    );
    yield* fs.exists(socket).pipe(
      Effect.orElseSucceed(() => false),
      Effect.flatMap((exists) =>
        exists
          ? Effect.void
          : Effect.fail(new ServerDesktopStartError({ detail: "x11vnc did not start." })),
      ),
      Effect.retry({ schedule: Schedule.spaced("200 millis"), times: 50 }),
    );
    return socket;
  });

  const start = Effect.fn("ServerDesktop.start")(function* (desktopScope: Scope.Closeable) {
    if (platform !== "linux") return yield* new ServerDesktopUnsupportedError({ platform });
    const sandbox = !PreviewBrowserHost.sandboxDisabled(yield* HostProcess.Environment);
    const isRoot = (yield* HostProcess.UserId) === 0;
    if (sandbox && isRoot) return yield* new PreviewBrowserHost.PreviewBrowserRootError();
    if (sandbox && (yield* PreviewBrowserHost.desktopSandboxBlocked)) {
      return yield* new PreviewBrowserHost.PreviewBrowserSandboxError({ setupCommand });
    }
    yield* ensurePackages(isRoot);
    phase = "Downloading Chrome…";
    const executable = yield* chromeExecutable;
    yield* ensureLibraries(executable, isRoot);
    return yield* launch(desktopScope, executable, sandbox);
  });

  const join = gate.withPermit(
    Effect.gen(function* () {
      if (state._tag !== "idle") {
        const current = state;
        // A failure is reported once; the next request starts over.
        if (current._tag === "failed") state = { _tag: "idle" };
        return current;
      }
      const done = yield* Deferred.make<string, ServerDesktopError>();
      const desktopScope = yield* Scope.fork(serviceScope);
      const starting: State = { _tag: "starting", done };
      state = starting;
      phase = "Starting the desktop…";
      yield* start(desktopScope).pipe(
        Effect.onExit((exit) =>
          gate
            .withPermit(
              Effect.gen(function* () {
                if (Exit.isSuccess(exit)) {
                  state = { _tag: "running", socket: exit.value, scope: desktopScope };
                  return;
                }
                state = {
                  _tag: "failed",
                  error: Option.getOrElse(
                    Cause.findErrorOption(exit.cause),
                    () => new ServerDesktopStartError({ detail: "The desktop stopped starting." }),
                  ),
                };
                yield* Scope.close(desktopScope, Exit.void);
              }),
            )
            .pipe(Effect.andThen(Deferred.done(done, exit))),
        ),
        Effect.ignoreCause,
        Effect.interruptible,
        Effect.forkIn(serviceScope),
      );
      return starting;
    }),
  );

  const clearFailure = (error: ServerDesktopError) =>
    gate.withPermit(
      Effect.sync(() => {
        if (state._tag === "failed" && state.error === error) state = { _tag: "idle" };
      }),
    );

  const vncSocket = Effect.gen(function* () {
    const current = yield* join;
    switch (current._tag) {
      case "running":
        return current.socket;
      case "failed":
        return yield* current.error;
      case "starting":
        return yield* Deferred.await(current.done).pipe(
          Effect.tapError(clearFailure),
          Effect.timeoutOrElse({
            duration: READY_WAIT,
            orElse: () => Effect.fail(new ServerDesktopPreparingError({ detail: phase })),
          }),
        );
    }
  }).pipe(Effect.provideContext(services), Effect.withSpan("ServerDesktop.vncSocket"));

  return ServerDesktop.of({ vncSocket });
});

export const layer = Layer.effect(ServerDesktop, make);
