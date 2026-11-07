import * as NodeSocket from "@effect/platform-node/NodeSocket";
import {
  AuthPreviewOperateScope,
  PREVIEW_DESKTOP_FAILED_CLOSE_CODE,
  PREVIEW_DESKTOP_PREPARING_CLOSE_CODE,
  PREVIEW_DESKTOP_WS_PATH,
  PREVIEW_STREAM_HOST_SETUP_CLOSE_CODE,
  PreviewStreamHostSetup,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";
import * as Socket from "effect/socket/Socket";

import { authenticateMediaRequest } from "../auth/http.ts";
import * as ServerDesktop from "./ServerDesktop.ts";

/** WebSocket close reasons are limited to 123 UTF-8 bytes. */
const CLOSE_REASON_BYTES = 123;
const textEncoder = new TextEncoder();

const fitsCloseReason = (reason: string) =>
  textEncoder.encode(reason).byteLength <= CLOSE_REASON_BYTES;

const truncateCloseReason = (reason: string) => {
  if (fitsCloseReason(reason)) return reason;
  let end = reason.length;
  while (!fitsCloseReason(`${reason.slice(0, end)}…`)) end -= 1;
  return `${reason.slice(0, end)}…`;
};

const encodeHostSetup = Schema.encodeSync(Schema.fromJsonString(PreviewStreamHostSetup));

const ROOT_MESSAGE =
  "This root T3 server needs T3CODE_SERVER_BROWSER_SANDBOX=0 in its environment to run Chrome. Set it, then restart T3.";

const closeFor = (error: ServerDesktop.ServerDesktopError): Socket.CloseEvent => {
  const hostSetup = (setup: PreviewStreamHostSetup) => {
    const reason = encodeHostSetup(setup);
    return fitsCloseReason(reason)
      ? new Socket.CloseEvent(PREVIEW_STREAM_HOST_SETUP_CLOSE_CODE, reason)
      : new Socket.CloseEvent(
          PREVIEW_DESKTOP_FAILED_CLOSE_CODE,
          truncateCloseReason(`Run this on the host, then try again: ${setup.command}`),
        );
  };
  switch (error._tag) {
    case "ServerDesktopPreparingError":
      return new Socket.CloseEvent(
        PREVIEW_DESKTOP_PREPARING_CLOSE_CODE,
        truncateCloseReason(error.message),
      );
    case "ServerDesktopPackagesError":
      return hostSetup({ need: "desktop", command: error.command });
    case "PreviewBrowserSandboxError":
      return hostSetup({ need: "sandbox", command: error.setupCommand });
    case "PreviewBrowserLibrariesError":
      return hostSetup({ need: "libraries", command: error.setupCommand });
    case "PreviewBrowserRootError":
      return new Socket.CloseEvent(PREVIEW_DESKTOP_FAILED_CLOSE_CODE, ROOT_MESSAGE);
    case "ServerDesktopUnsupportedError":
    case "ServerDesktopStartError":
      return new Socket.CloseEvent(
        PREVIEW_DESKTOP_FAILED_CLOSE_CODE,
        truncateCloseReason(error.message),
      );
  }
};

/* Byte pumping runs for the whole session; a span per stream adds no diagnostic value. */
const pump = Effect.fnUntraced(function* (source: Socket.Socket, sink: Socket.Writer) {
  const { pull } = yield* source.reader;
  while (true) {
    yield* sink.writeAll(yield* pull);
  }
});

// Request middleware owns tracing, including long-lived WebSocket sessions.
const makeHandler = Effect.fnUntraced(function* (desktop: ServerDesktop.ServerDesktop["Service"]) {
  const request = yield* HttpServerRequest.HttpServerRequest;
  if (request.headers.upgrade?.toLowerCase() !== "websocket") {
    return HttpServerResponse.text("Not Found", { status: 404 });
  }
  yield* authenticateMediaRequest(AuthPreviewOperateScope);
  const ready = yield* desktop.vncSocket.pipe(
    Effect.map((path) => ({ _tag: "ready" as const, path })),
    Effect.catch((error) =>
      (error._tag === "ServerDesktopPreparingError"
        ? Effect.void
        : Effect.logWarning("server desktop unavailable", { error: error.message })
      ).pipe(Effect.as({ _tag: "closed" as const, close: closeFor(error) })),
    ),
  );
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const client = yield* request.upgrade;
      const toClient = yield* client.writer;
      if (ready._tag === "closed") {
        // The upgraded socket only flushes writes once something reads it.
        yield* client.reader;
        yield* toClient.write(ready.close);
        return HttpServerResponse.empty();
      }
      // A reconnecting viewer retries; x11vnc may be restarting.
      const vnc = yield* NodeSocket.makeNet({ path: ready.path, openTimeout: "5 seconds" });
      const toVnc = yield* vnc.writer;
      yield* Effect.raceFirst(pump(vnc, toClient), pump(client, toVnc)).pipe(Effect.ignoreCause);
      return HttpServerResponse.empty();
    }),
  ).pipe(Effect.orElseSucceed(() => HttpServerResponse.empty()));
});

export const routeLayer = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const desktop = yield* ServerDesktop.ServerDesktop;
    yield* router.add("GET", PREVIEW_DESKTOP_WS_PATH, makeHandler(desktop));
  }),
);
