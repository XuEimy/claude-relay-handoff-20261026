import type RFB from "@novnc/novnc";
import { previewStreamHostSetupMessage } from "@t3tools/client-runtime/preview/server-browser-stream";
import {
  previewDesktopClose,
  previewDesktopUrl,
} from "@t3tools/client-runtime/preview/server-desktop";
import type { DeviceHubAccess } from "@t3tools/client-runtime/device/hub-access";
import type { EnvironmentId, PreviewStreamHostSetup } from "@t3tools/contracts";
import { isMacPlatform } from "@t3tools/shared/keybindings";
import { useEffect, useRef, useState } from "react";

import { CommandBlock } from "~/components/CommandBlock";
import { Button } from "~/components/ui/button";
import { refreshPreviewStreamAccess, usePreviewStreamAccess } from "~/state/previewStream";

type DesktopStatus =
  | { readonly _tag: "connecting" }
  | { readonly _tag: "connected" }
  | { readonly _tag: "preparing"; readonly detail: string }
  | { readonly _tag: "hostSetup"; readonly setup: PreviewStreamHostSetup }
  | { readonly _tag: "failed"; readonly message: string }
  | { readonly _tag: "denied" };

const PREPARING_RETRY_MS = 2_000;
const MAX_UNAUTHORIZED_REFUSALS = 3;
const XK_CONTROL_L = 0xffe3;

/** Connects noVNC through the server's desktop route, reconnecting until stopped. */
function connectServerDesktop(
  container: HTMLElement,
  access: DeviceHubAccess,
  events: {
    readonly onStatus: (status: DesktopStatus) => void;
    readonly onUnauthorized: () => void;
  },
): () => void {
  let disposed = false;
  let rfb: RFB | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;
  const isMac = isMacPlatform(navigator.platform);

  const retry = (delay: number) => {
    retryTimer = setTimeout(() => void connect(), delay);
  };

  const connect = async () => {
    const { default: Rfb } = await import("@novnc/novnc");
    if (disposed) return;
    const socket = new WebSocket(previewDesktopUrl(access));
    let opened = false;
    socket.addEventListener("open", () => {
      opened = true;
    });
    socket.addEventListener("close", (event) => {
      if (disposed) return;
      rfb = null;
      const outcome = previewDesktopClose(event, opened);
      switch (outcome._tag) {
        case "hostSetup":
          events.onStatus({ _tag: "hostSetup", setup: outcome.setup });
          return;
        case "failed":
          events.onStatus({ _tag: "failed", message: outcome.message });
          return;
        case "preparing":
          events.onStatus({ _tag: "preparing", detail: outcome.detail });
          retry(PREPARING_RETRY_MS);
          return;
        case "unauthorized":
          events.onUnauthorized();
          return;
        case "retry":
          events.onStatus({ _tag: "connecting" });
          retry(Math.min(500 * 2 ** failures, 10_000));
          failures += 1;
          return;
      }
    });
    const next = new Rfb(container, socket, { shared: true });
    next.scaleViewport = true;
    next.addEventListener("connect", () => {
      failures = 0;
      events.onStatus({ _tag: "connected" });
    });
    next.addEventListener("clipboard", (event) => {
      const text = (event as CustomEvent<{ readonly text: string }>).detail.text;
      void navigator.clipboard?.writeText(text).catch(() => undefined);
    });
    rfb = next;
  };

  // The remote is Linux: Cmd shortcuts become Ctrl ones, and pasting sends this
  // machine's clipboard first, since VNC only syncs it on request.
  const onKey = (event: KeyboardEvent) => {
    const remote = rfb;
    if (!remote) return;
    if (isMac && event.key === "Meta") {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.type !== "keydown" || event.altKey || event.key.length !== 1) return;
    const letter = event.key.toLowerCase();
    if (letter < "a" || letter > "z") return;
    const command = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
    if (!command || (!isMac && letter !== "v")) return;
    event.preventDefault();
    event.stopPropagation();
    const press = () => {
      if (isMac) remote.sendKey(XK_CONTROL_L, "ControlLeft", true);
      remote.sendKey(letter.charCodeAt(0), `Key${letter.toUpperCase()}`);
      if (isMac) remote.sendKey(XK_CONTROL_L, "ControlLeft", false);
    };
    if (letter !== "v" || !navigator.clipboard?.readText) {
      press();
      return;
    }
    void navigator.clipboard
      .readText()
      .then((text) => remote.clipboardPasteFrom(text))
      .catch(() => undefined)
      .finally(press);
  };
  container.addEventListener("keydown", onKey, true);
  container.addEventListener("keyup", onKey, true);
  void connect();
  return () => {
    disposed = true;
    if (retryTimer !== null) clearTimeout(retryTimer);
    container.removeEventListener("keydown", onKey, true);
    container.removeEventListener("keyup", onKey, true);
    try {
      rfb?.disconnect();
    } catch {}
    rfb = null;
  };
}

/** A miniature desktop booting on the far side of a live link, while the VNC session opens. */
function ServerDesktopLoader(props: { readonly label: string; readonly detail?: string }) {
  return (
    <div className="server-desktop-loader" role="status" aria-live="polite">
      <div className="server-desktop-loader-scene" aria-hidden="true">
        <div className="server-desktop-loader-client" />
        <div className="server-desktop-loader-link">
          <span className="server-desktop-loader-packet" />
          <span className="server-desktop-loader-packet" />
          <span className="server-desktop-loader-packet" />
        </div>
        <div className="server-desktop-loader-screen">
          <div className="server-desktop-loader-bar">
            <span />
            <span />
            <span />
          </div>
          <div className="server-desktop-loader-window" />
          <div className="server-desktop-loader-window" />
          <div className="server-desktop-loader-window" />
          <div className="server-desktop-loader-scan" />
        </div>
      </div>
      <div className="server-desktop-loader-copy">
        <p className="server-desktop-loader-text">{props.label}</p>
        {props.detail ? (
          <p className="max-w-sm text-xs text-muted-foreground">{props.detail}</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The environment host's desktop over VNC, through the server's authenticated route.
 * No address bar: the browser inside the desktop has its own.
 */
export function ServerDesktopPanel(props: {
  readonly environmentId: EnvironmentId;
  readonly visible: boolean;
}) {
  const { environmentId, visible } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const refusalsRef = useRef(0);
  const [status, setStatus] = useState<DesktopStatus>({ _tag: "connecting" });
  const stopped =
    status._tag === "hostSetup" || status._tag === "failed" || status._tag === "denied";
  const access = usePreviewStreamAccess(environmentId, { retry: visible && !stopped });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- owns the VNC connection to the server desktop while the tab is visible
  useEffect(() => {
    const container = containerRef.current;
    if (!visible || stopped || !access || !container) return;
    return connectServerDesktop(container, access, {
      onStatus: (next) => {
        if (next._tag === "connected") refusalsRef.current = 0;
        setStatus(next);
      },
      onUnauthorized: () => {
        refusalsRef.current += 1;
        if (refusalsRef.current >= MAX_UNAUTHORIZED_REFUSALS) {
          setStatus({ _tag: "denied" });
          return;
        }
        // A fresh ticket arrives as new access, which reconnects.
        refreshPreviewStreamAccess(environmentId);
      },
    });
  }, [access, environmentId, stopped, visible]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-background">
      {/* role="application" keeps type-to-focus and surface shortcuts off the keys noVNC sends. */}
      <div
        ref={containerRef}
        role="application"
        aria-label="云电脑"
        className="min-h-0 flex-1"
        data-server-desktop
      />
      {status._tag === "connected" ? null : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background p-4 text-center">
          {status._tag === "connecting" ? (
            <ServerDesktopLoader label="正在连接云电脑…" />
          ) : status._tag === "preparing" ? (
            <ServerDesktopLoader label="正在准备云电脑…" detail={status.detail} />
          ) : status._tag === "hostSetup" ? (
            <>
              <p role="alert" className="max-w-sm text-sm text-muted-foreground">
                {previewStreamHostSetupMessage(status.setup)}
              </p>
              <CommandBlock command={status.setup.command} className="w-full max-w-md text-left" />
              <Button variant="outline" size="sm" onClick={() => setStatus({ _tag: "connecting" })}>
                重试
              </Button>
            </>
          ) : (
            <>
              <p role="alert" className="max-w-sm text-sm text-muted-foreground">
                {status._tag === "failed" ? status.message : "云电脑连接被拒绝。"}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  refusalsRef.current = 0;
                  if (status._tag === "denied") refreshPreviewStreamAccess(environmentId);
                  setStatus({ _tag: "connecting" });
                }}
              >
                重试
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
