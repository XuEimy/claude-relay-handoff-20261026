import type { DesktopSshEnvironmentTarget } from "@t3tools/contracts";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import {
  cachedComputerListing,
  loadComputerListing,
  prefetchComputerListing,
} from "./computerListing";
import type { ComputerSelection } from "./computerPicker";

const mocks = vi.hoisted(() => ({ runComputerOperation: vi.fn() }));
vi.mock("./computerOperations", () => ({ runComputerOperation: mocks.runComputerOperation }));

beforeEach(() => {
  mocks.runComputerOperation.mockReset();
});

const server: DesktopSshEnvironmentTarget = {
  alias: "server",
  hostname: "server",
  username: "me",
  port: null,
};

function computer(host: string): ComputerSelection {
  return { slug: "box", dir: "/computers/box", label: "Box", host, username: "root" };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it("dedupes concurrent listing requests for the same computer path", async () => {
  const request = deferred<{ ok: true; path: string; entries: string[] }>();
  mocks.runComputerOperation.mockReturnValueOnce(request.promise);
  const target = computer("dedupe.tail");

  const first = loadComputerListing(server, target, "~");
  const second = loadComputerListing(server, target, "~");

  expect(second).toBe(first);
  expect(mocks.runComputerOperation).toHaveBeenCalledTimes(1);
  request.resolve({ ok: true, path: "/home/root", entries: ["b", "a"] });
  await expect(first).resolves.toMatchObject({ ok: true, path: "/home/root" });
  await expect(second).resolves.toMatchObject({ entries: ["a", "b"] });
});

it("caches a prefetch under both the requested and resolved paths", async () => {
  const request = deferred<{ ok: true; path: string; entries: string[] }>();
  mocks.runComputerOperation.mockReturnValueOnce(request.promise);
  const target = computer("prefetch.tail");

  prefetchComputerListing(server, target, "~");
  const loading = loadComputerListing(server, target, "~");

  expect(mocks.runComputerOperation).toHaveBeenCalledTimes(1);
  request.resolve({ ok: true, path: "/home/root", entries: ["b", "a"] });
  await expect(loading).resolves.toMatchObject({ ok: true });

  const cached = cachedComputerListing(target, "~");
  expect(cached).toEqual({ path: "/home/root", entries: ["a", "b"] });
  expect(cachedComputerListing(target, "/home/root")).toBe(cached);
});
