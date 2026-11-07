import * as NodeFSP from "node:fs/promises";
import * as NodeChildProcess from "node:child_process";
import * as NodeProcess from "node:process";
import * as NodeURL from "node:url";
import sharp from "sharp";

const directory = new URL("../assets/agent-cloud-os/", import.meta.url);
const python = NodeChildProcess.spawnSync(
  "python3",
  [
    NodeURL.fileURLToPath(new URL("./export-product-icons.py", import.meta.url)),
    ...NodeProcess.argv.slice(2),
  ],
  { stdio: "inherit" },
);
if (python.error) throw python.error;
if (python.status !== 0) process.exit(python.status ?? 1);
const outputs = new Map();
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
