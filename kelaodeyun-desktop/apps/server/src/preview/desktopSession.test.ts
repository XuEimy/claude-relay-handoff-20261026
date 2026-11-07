import { describe, expect, it } from "@effect/vitest";

import { desktopSessionFiles, desktopSessionLayout } from "./desktopSession.ts";

describe("desktopSessionFiles", () => {
  const layout = desktopSessionLayout("/t3/userdata/desktop-session");
  const files = desktopSessionFiles({
    layout,
    home: "/root",
    chromeIcon: "/tools/chrome/product_logo_48.png",
    chromeCommand: ["/tools/chrome/chrome", "--user-data-dir=/t3/it's here"],
  });
  const content = (path: string) => files.find((file) => file.path === path)?.content ?? "";

  it("starts Chrome from one launcher that the desktop icon and the taskbar share", () => {
    expect(content(layout.chromeLauncher)).toBe(
      `#!/bin/sh\nexec '/tools/chrome/chrome' '--user-data-dir=/t3/it'\\''s here' "$@"\n`,
    );
    expect(content(`${layout.desktopDir}/chrome.desktop`)).toContain(
      `Exec=${layout.chromeLauncher} %U`,
    );
    expect(content(`${layout.configHome}/tint2/tint2rc`)).toContain(
      `launcher_item_app = ${layout.desktopDir}/chrome.desktop`,
    );
  });

  it("keeps every file inside the session directory", () => {
    for (const file of files)
      expect(file.path.startsWith("/t3/userdata/desktop-session/")).toBe(true);
  });
});
