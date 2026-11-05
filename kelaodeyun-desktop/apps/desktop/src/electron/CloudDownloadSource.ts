// @effect-diagnostics nodeBuiltinImport:off cryptoRandomUUID:off -- Chromium file promises fetch a window-scoped, capability-protected loopback URL only after an external drop.
import * as NodeHttp from "node:http";

export async function createCloudDownloadSource(
  read: (path: string, directory: boolean) => Promise<string>,
  status: (event: {
    path: string;
    state: "downloading" | "completed" | "failed" | "cancelled";
  }) => void,
  confirmDirectory: (path: string) => Promise<boolean> = async () => false,
) {
  const capability = crypto.randomUUID();
  let active = 0;
  const server = NodeHttp.createServer((request, response) => {
    const run = async () => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const path = url.searchParams.get("path") ?? "";
      const directory = url.searchParams.get("directory") === "1";
      if (request.method !== "GET" || url.pathname !== `/${capability}`) {
        response.writeHead(404).end();
        return;
      }
      if (
        !path ||
        path.length > 4096 ||
        (!(directory && path === ".") &&
          path
            .split("/")
            .some((part) => !part || part === "." || part === ".." || /[\\\x00-\x1f]/.test(part)))
      ) {
        response.writeHead(400).end();
        return;
      }
      if (active >= 4) {
        response.writeHead(429).end();
        return;
      }
      active++;
      try {
        if (directory && !(await confirmDirectory(path))) {
          response.writeHead(409).end("Download cancelled");
          status({ path, state: "cancelled" });
          return;
        }
        status({ path, state: "downloading" });
        const result: unknown = JSON.parse(await read(path, directory));
        if (
          !result ||
          typeof result !== "object" ||
          !("contentsBase64" in result) ||
          typeof result.contentsBase64 !== "string" ||
          result.contentsBase64.length > 44739244
        )
          throw new Error("Invalid download response");
        const bytes = Buffer.from(result.contentsBase64, "base64");
        response.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Content-Length": bytes.length,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        response.end(bytes);
        status({ path, state: "completed" });
      } catch {
        response.writeHead(502).end("Cloud file download failed");
        status({ path, state: "failed" });
      } finally {
        active--;
      }
    };
    void run().catch(() => {
      response.destroy();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  server.unref();
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Cannot start download source");
  }
  return {
    url: `http://127.0.0.1:${address.port}/${capability}`,
    close: () => {
      server.close();
      server.closeAllConnections();
    },
  };
}
