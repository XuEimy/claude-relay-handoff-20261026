// @effect-diagnostics nodeBuiltinImport:off -- Verifies that the vendored theme associations resolve to real bundled SVG assets.
import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { expect, it } from "vite-plus/test";
import { materialFileIcon } from "./MaterialFileIcon";
import theme from "./materialIconTheme.json";

it("uses official filename, compound-extension, and expanded-folder associations", () => {
  expect(materialFileIcon("src/app.tsx")).toBe("react_ts");
  expect(materialFileIcon("package.json")).toBe("nodejs");
  expect(materialFileIcon("script.PY")).toBe("python");
  expect(materialFileIcon("unknown.unrecognized")).toBe("file");
  expect(materialFileIcon("src", true)).toBe("folder-src");
  expect(materialFileIcon("src", true, true)).toBe("folder-src-open");
  expect(materialFileIcon("project", true, true, true)).toBe("folder-root-open");
});

it("ships every referenced icon including upstream cloned variants", () => {
  const visit = (value: unknown): string[] =>
    typeof value === "string"
      ? [value]
      : value && typeof value === "object"
        ? Object.values(value).flatMap(visit)
        : [];
  const icons = new Set(visit(theme));
  for (const icon of icons) {
    const path = NodeURL.fileURLToPath(
      new URL(`../../../public/icons/material/${icon}.svg`, import.meta.url),
    );
    expect(NodeFS.existsSync(path), icon).toBe(true);
  }
});
