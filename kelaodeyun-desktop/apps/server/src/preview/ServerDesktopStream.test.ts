import { expect, it } from "@effect/vitest";
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  AuthPreviewOperateScope,
  AuthSessionId,
  PREVIEW_DESKTOP_FAILED_CLOSE_CODE,
  PREVIEW_DESKTOP_PREPARING_CLOSE_CODE,
  PREVIEW_DESKTOP_WS_PATH,
  PREVIEW_STREAM_HOST_SETUP_CLOSE_CODE,
} from "@t3tools/contracts";
import * as NodeNet from "node:net";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { HttpRouter, HttpServer } from "effect/http";

import * as EnvironmentAuth from "../auth/EnvironmentAuth.ts";
import * as PreviewBrowserHost from "./PreviewBrowserHost.ts";
import * as ServerDesktop from "./ServerDesktop.ts";
import * as ServerDesktopStream from "./ServerDesktopStream.ts";

const serve = (vncSocket: ServerDesktop.ServerDesktop["Service"]["vncSocket"]) =>
  Effect.gen(function* () {
    const services = yield* Layer.build(
      HttpRouter.serve(ServerDesktopStream.routeLayer, { disableListenLog: true }).pipe(
        Layer.provideMerge(NodeHttpServer.layerTest),
        Layer.provide(
          Layer.succeed(EnvironmentAuth.EnvironmentAuth, {
            authenticateWebSocketUpgrade: () =>
              Effect.succeed({
                sessionId: AuthSessionId.make("test"),
                subject: "test",
                method: "bearer-access-token",
                scopes: [AuthPreviewOperateScope],
              }),
          } as unknown as EnvironmentAuth.EnvironmentAuth["Service"]),
        ),
        Layer.provide(
          Layer.succeed(ServerDesktop.ServerDesktop, ServerDesktop.ServerDesktop.of({ vncSocket })),
        ),
      ),
    );
    const origin = HttpServer.formatAddress(
      Context.get(services, HttpServer.HttpServer).address,
    ).replace(/^http/, "ws");
    return yield* Effect.acquireRelease(
      Effect.sync(() => {
        const socket = new WebSocket(`${origin}${PREVIEW_DESKTOP_WS_PATH}?wsTicket=test`);
        socket.binaryType = "arraybuffer";
        return socket;
      }),
      (socket) => Effect.sync(() => socket.close()),
    );
  });

const closeOf = (socket: WebSocket) =>
  Effect.promise(
    () =>
      new Promise<{ code: number; reason: string }>((resolve) =>
        socket.addEventListener("close", ({ code, reason }) => resolve({ code, reason })),
      ),
  );

it.live("bridges WebSocket frames to the VNC server's Unix socket both ways", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = (yield* Path.Path).join(yield* fs.makeTempDirectoryScoped(), "vnc.sock");
    // Greets like an RFB server, then echoes.
    yield* Effect.acquireRelease(
      Effect.promise(
        () =>
          new Promise<NodeNet.Server>((resolve) => {
            const server = NodeNet.createServer((socket) => {
              socket.write("RFB 003.008\n");
              socket.on("data", (data) => socket.write(data));
            });
            server.listen(path, () => resolve(server));
          }),
      ),
      (server) =>
        Effect.promise(() => new Promise<void>((resolve) => server.close(() => resolve()))),
    );
    const client = yield* serve(Effect.succeed(path));
    const frames: Array<string> = [];
    const received = Promise.withResolvers<void>();
    client.addEventListener("error", () => received.reject(new Error("Bridge failed")));
    client.addEventListener("message", ({ data }) => {
      frames.push(new TextDecoder().decode(data as ArrayBuffer));
      if (frames.length === 1) client.send(new TextEncoder().encode("RFB 003.008\n"));
      else received.resolve();
    });
    yield* Effect.promise(() => received.promise);
    expect(frames).toEqual(["RFB 003.008\n", "RFB 003.008\n"]);
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.live("closes with the reason a viewer shows when the desktop cannot start yet", () =>
  Effect.gen(function* () {
    const preparing = yield* serve(
      Effect.fail(new ServerDesktop.ServerDesktopPreparingError({ detail: "Downloading Chrome…" })),
    );
    expect(yield* closeOf(preparing)).toEqual({
      code: PREVIEW_DESKTOP_PREPARING_CLOSE_CODE,
      reason: "Downloading Chrome…",
    });
    const packages = yield* serve(
      Effect.fail(
        new ServerDesktop.ServerDesktopPackagesError({
          packages: ["xvfb", "x11vnc", "openbox", "fonts-noto-cjk"],
          command: "sudo apt-get install -y xvfb x11vnc openbox fonts-noto-cjk",
        }),
      ),
    );
    const setup = yield* closeOf(packages);
    expect(setup.code).toBe(PREVIEW_STREAM_HOST_SETUP_CLOSE_CODE);
    expect(JSON.parse(setup.reason)).toEqual({
      need: "desktop",
      command: "sudo apt-get install -y xvfb x11vnc openbox fonts-noto-cjk",
    });
    // A setup command too long for a close reason still reaches the viewer, truncated.
    const longCommand = `sudo /${"very-long-path/".repeat(10)}t3 browser setup`;
    const libraries = yield* serve(
      Effect.fail(
        new PreviewBrowserHost.PreviewBrowserLibrariesError({
          setupCommand: longCommand,
          libraries: ["libcups.so.2"],
        }),
      ),
    );
    const failed = yield* closeOf(libraries);
    expect(failed.code).toBe(PREVIEW_DESKTOP_FAILED_CLOSE_CODE);
    expect(new TextEncoder().encode(failed.reason).byteLength).toBeLessThanOrEqual(123);
    expect(failed.reason).toMatch(/^Run this on the host, then try again: sudo \/very-long-path/);
  }),
);
