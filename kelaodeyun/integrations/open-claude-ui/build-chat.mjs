import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "tailwindcss";
const here = dirname(fileURLToPath(import.meta.url)),
  root = resolve(here, "../.."),
  vendor = resolve(root, "vendor/open-claude-ui"),
  out = resolve(root, "public/claude-chat");
const require = createRequire(import.meta.url),
  config = require(resolve(vendor, "code-examples/tailwind.config.js"));
config.content = [
  resolve(here, "chat/**/*.{tsx,mjs}"),
  resolve(root,"integrations/claude-web/app/**/*.{jsx,css}"),
];
await mkdir(out, { recursive: true });
await mkdir(resolve(out, "fonts"), { recursive: true });
for (const [family, file] of [
  ["inter", "inter-latin-wght-normal.woff2"],
  ["newsreader", "newsreader-latin-wght-normal.woff2"],
  ["jetbrains-mono", "jetbrains-mono-latin-wght-normal.woff2"],
]) {
  await copyFile(
    resolve(here, "node_modules/@fontsource-variable", family, "files", file),
    resolve(out, "fonts", file),
  );
  await copyFile(
    resolve(here, "node_modules/@fontsource-variable", family, "LICENSE"),
    resolve(out, "fonts", family + "-LICENSE.txt"),
  );
}
const webAssets=resolve(root,'public/claude-web-assets');
await mkdir(webAssets,{recursive:true});
for(const file of ['cc27851ad-DDVos-BJ.woff2','c66fc489e-2VcCjn5t.woff2','spark.svg','voice.svg','incognito.svg']) await copyFile(resolve(root,'integrations/claude-web/original/assets',file),resolve(webAssets,file));
const css = await postcss([tailwind(config)]).process(
  "@tailwind base;\n" +
    (await readFile(resolve(vendor, "code-examples/cds-theme.css"), "utf8")) +
    "\n@tailwind components;\n@tailwind utilities;\n" +
    (await readFile(resolve(here, "chat/design-system/fonts.css"), "utf8")) +
(await readFile(resolve(root,"integrations/claude-web/app/web-base.css"),"utf8")) +
(await readFile(resolve(root,"integrations/claude-web/app/web-adapter.css"),"utf8")),
  { from: undefined },
);
await writeFile(resolve(out, "chat.css"), css.css);
await build({
  entryPoints: [resolve(root, "integrations/claude-web/app/WebApp.jsx")],
  bundle: true,
  minify: true,
  platform: "browser",
  format: "iife",
  outfile: resolve(out, "chat.js"),
  nodePaths: [resolve(here, "node_modules"), resolve(vendor, "node_modules")],
  alias: {
    react: resolve(vendor, "node_modules/react"),
    "react-dom": resolve(vendor, "node_modules/react-dom"),
    "lucide-react": resolve(vendor, "node_modules/lucide-react"),
    "framer-motion": resolve(vendor, "node_modules/framer-motion"),
  },
  define: { "process.env.NODE_ENV": '"production"' },
  legalComments: "linked",
});
await writeFile(
  resolve(out, "index.html"),
  '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>云上克劳德 · 对话</title><link rel="stylesheet" href="/claude-chat/chat.css"></head><body><div id="root"></div><script src="/claude-chat/chat.js"></script></body></html>',
);
await copyFile(resolve(vendor, "LICENSE"), resolve(out, "LICENSE.txt"));
console.log("Built Chat/Cowork: vendor preserved; host adapters applied.");
