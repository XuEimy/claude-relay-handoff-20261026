import type { BrowserLinkTarget } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { resolveLinkTarget } from "./browserLinkTarget";

const settings = vi.hoisted(() => ({ browserLinkTarget: "system" as BrowserLinkTarget }));

vi.mock("~/hooks/useSettings", () => ({
  ensureClientSettingsHydrated: vi.fn(async () => undefined),
  getClientSettings: () => settings,
}));

const click = { metaKey: false, ctrlKey: false };

describe("resolveLinkTarget", () => {
  it("keeps cloud web URLs in-app even with system preference, modifiers, or an unavailable preview", () => {
    for (const url of ["https://claude.ai/artifact/example", "http://localhost:5173/"]) {
      expect(
        resolveLinkTarget({
          url,
          event: { metaKey: true, ctrlKey: false },
          preference: "system",
          canOpenInApp: false,
        }),
      ).toBe("app");
    }
  });
  it("leaves non-web schemes to the shell", () => {
    for (const url of ["mailto:someone@example.com", "vscode://file/x", "not a url"]) {
      expect(resolveLinkTarget({ url, event: click, preference: "app", canOpenInApp: true })).toBe(
        "system",
      );
    }
  });
});
