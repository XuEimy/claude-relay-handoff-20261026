import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { createApi } from "./lib/api.mjs";
export { createApi };
export async function start(env = process.env, options = {}) {
  if (
    env.NODE_ENV === "production" &&
    (!env.PUBLIC_ORIGIN?.startsWith("https://") ||
      !env.DATA_ENCRYPTION_KEY ||
      !env.SETUP_TOKEN)
  )
    throw Error(
      "Production requires HTTPS PUBLIC_ORIGIN, DATA_ENCRYPTION_KEY and SETUP_TOKEN.",
    );
  const api = createApi(env, options.fetcher, options),
    prod = env.NODE_ENV === "production";
  const vite = prod
    ? null
    : await (
        await import("vite")
      ).createServer({
        server: {
          middlewareMode: true,
          hmr: { port: (Number(env.PORT) || 4174) + 20000 },
          fs: {
            deny: [
              ".env",
              ".env.*",
              "*.{crt,pem,key}",
              "**/.git/**",
              "**/data/**",
              "**/.local-*",
            ],
          },
        },
        appType: "spa",
      });
  const root = resolve("dist/client");
  const mime = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".woff2": "font/woff2",
  };
  const server = http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Content-Security-Policy",
      "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
    );
    if (await api(req, res)) return;
    if (vite) {
      vite.middlewares(req, res);
      return;
    }
    try {
      const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      let file = resolve(root, "." + pathname);
      if (file !== root && !file.startsWith(root + sep)) {
        res.writeHead(403).end();
        return;
      }
      try {
        if (!(await stat(file)).isFile()) file = resolve(root, "index.html");
      } catch {
        file = resolve(root, "index.html");
      }
      res.writeHead(200, {
        "Content-Type": mime[extname(file)] || "application/octet-stream",
      });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) =>
    server.listen(Number(env.PORT) || 4174, env.HOST || "127.0.0.1", r),
  );
  console.log(
    `kelaodeyun: http://${env.HOST || "127.0.0.1"}:${Number(env.PORT) || 4174}`,
  );
  return server;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  start().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
