// @effect-diagnostics globalFetch:off -- Exercises the real loopback endpoint as Chromium would, without an Effect HTTP client layer.
import { expect, it, vi } from "vite-plus/test";
import { createCloudDownloadSource } from "./CloudDownloadSource.ts";

it("reads nothing until a promised file is requested, then serves exact binary bytes", async () => {
  const read = vi.fn(async () => JSON.stringify({ contentsBase64: "AAEC/w==" }));
  const status = vi.fn();
  const source = await createCloudDownloadSource(read, status);
  try {
    expect(read).not.toHaveBeenCalled();
    expect((await fetch(new URL("/wrong?path=data.bin", source.url))).status).toBe(404);
    expect((await fetch(`${source.url}?path=../escape`)).status).toBe(400);
    expect((await fetch(`${source.url}?path=/absolute`)).status).toBe(400);
    expect(read).not.toHaveBeenCalled();
    const response = await fetch(`${source.url}?path=${encodeURIComponent("中文/file #1.bin")}`);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0, 1, 2, 255]));
    expect(read).toHaveBeenCalledWith("中文/file #1.bin", false);
    expect(status.mock.calls.map(([event]) => event.state)).toEqual(["downloading", "completed"]);
    read.mockRejectedValueOnce(new Error("SSH disconnected"));
    expect((await fetch(`${source.url}?path=data.bin`)).status).toBe(502);
    expect(status).toHaveBeenLastCalledWith({ path: "data.bin", state: "failed" });
  } finally {
    source.close();
  }
});

it("asks before reading directories and cancels without starting SSH", async () => {
  const read = vi.fn(async () => JSON.stringify({ contentsBase64: "UEs=" }));
  const status = vi.fn();
  const confirm = vi.fn(async () => false);
  const source = await createCloudDownloadSource(read, status, confirm);
  try {
    expect(confirm).not.toHaveBeenCalled();
    expect((await fetch(`${source.url}?path=folder&directory=1`)).status).toBe(409);
    expect(confirm).toHaveBeenCalledWith("folder");
    expect(read).not.toHaveBeenCalled();
    expect(status).toHaveBeenLastCalledWith({ path: "folder", state: "cancelled" });
    confirm.mockResolvedValue(true);
    expect((await fetch(`${source.url}?path=folder&directory=1`)).status).toBe(200);
    expect(read).toHaveBeenCalledWith("folder", true);
    expect((await fetch(`${source.url}?path=.&directory=1`)).status).toBe(200);
    expect(read).toHaveBeenCalledWith(".", true);
    expect((await fetch(`${source.url}?path=..&directory=1`)).status).toBe(400);
  } finally {
    source.close();
  }
});
