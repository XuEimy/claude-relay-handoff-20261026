import * as NodeFSP from "node:fs/promises";
import * as NodeProcess from "node:process";
import * as NodeURL from "node:url";
import sharp from "sharp";
import { encodePngIco, WINDOWS_ICON_SIZES } from "./lib/icon-export.ts";

const directory = new URL("../assets/kelaodeyun/", import.meta.url);
const svg = await NodeFSP.readFile(new URL("app-icon.svg", directory));
const png = (size) => sharp(svg).resize(size, size).png().toBuffer();
const outputs = new Map();
for (const [name, size] of [
  ["app-icon-1024.png", 1024],
  ["favicon-16x16.png", 16],
  ["favicon-32x32.png", 32],
  ["apple-touch-icon.png", 180],
]) {
  outputs.set(new URL(name, directory).href, await png(size));
}
for (const [name, sizes] of [
  ["app-icon.ico", WINDOWS_ICON_SIZES],
  ["favicon.ico", [16, 32, 48]],
]) {
  const images = await Promise.all(
    sizes.map(async (size) => ({ size, contents: await png(size) })),
  );
  outputs.set(new URL(name, directory).href, encodePngIco(images));
}
for (const name of [
  "favicon.ico",
  "favicon-16x16.png",
  "favicon-32x32.png",
  "apple-touch-icon.png",
]) {
  outputs.set(
    new URL(`../apps/web/public/${name}`, import.meta.url).href,
    outputs.get(new URL(name, directory).href),
  );
}
const dmg = await NodeFSP.readFile(new URL("dmg-background.svg", directory));
outputs.set(
  new URL("../apps/desktop/resources/dmg/kelaodeyun-background.png", import.meta.url).href,
  await sharp(dmg).png().toBuffer(),
);
for (const [url, bytes] of outputs) {
  const file = new URL(url);
  if (NodeProcess.argv.includes("--check")) {
    const current = await NodeFSP.readFile(file);
    if (!current.equals(bytes))
      throw new Error(`Regenerate product icons: ${NodeURL.fileURLToPath(file)}`);
  } else {
    await NodeFSP.writeFile(file, bytes);
  }
}
