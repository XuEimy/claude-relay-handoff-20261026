import { describe, expect, it } from "vite-plus/test";

import { previewDesktopClose, previewDesktopUrl } from "./serverDesktop.ts";

describe("previewDesktopUrl", () => {
  it("keeps a relay path prefix and the media ticket", () => {
    expect(
      previewDesktopUrl({
        httpBase: "https://relay.example/env/abc/api/preview-stream",
        wsBase: "wss://relay.example/env/abc/api/preview-stream",
        query: { wsTicket: "ticket" },
        credentials: false,
      }),
    ).toBe("wss://relay.example/env/abc/api/preview-desktop/ws?wsTicket=ticket");
  });
});

describe("previewDesktopClose", () => {
  it.each([
    [
      { code: 4513, reason: "Downloading Chrome…" },
      true,
      { _tag: "preparing", detail: "Downloading Chrome…" },
    ],
    [
      { code: 4503, reason: '{"need":"desktop","command":"sudo apt-get install -y xvfb"}' },
      true,
      { _tag: "hostSetup", setup: { need: "desktop", command: "sudo apt-get install -y xvfb" } },
    ],
    [
      { code: 4500, reason: "x11vnc did not start." },
      true,
      { _tag: "failed", message: "x11vnc did not start." },
    ],
    [{ code: 1006, reason: "" }, false, { _tag: "unauthorized" }],
    [{ code: 1006, reason: "" }, true, { _tag: "retry" }],
    [{ code: 1011, reason: "" }, true, { _tag: "retry" }],
  ] as const)("maps close %j (opened: %s)", (event, opened, expected) => {
    expect(previewDesktopClose(event, opened)).toEqual(expected);
  });
});
