import { describe, expect, it } from "vite-plus/test";
import { collectDroppedCloudFiles, validateCloudRelativePath } from "./cloudFileUpload";

describe("cloud file drops", () => {
  it("captures dropped entries before asynchronous folder reads and reads every directory batch", async () => {
    const first = new File(["first"], "一.txt");
    const second = new File(["second"], "two.txt");
    const entry = (file: File) => ({
      name: file.name,
      isFile: true,
      isDirectory: false,
      file: (resolve: (value: File) => void) => resolve(file),
    });
    const batches = [[entry(first)], [entry(second)], []];
    const folder = {
      name: "folder",
      isFile: false,
      isDirectory: true,
      createReader: () => ({
        readEntries: (resolve: (value: unknown[]) => void) => resolve(batches.shift() ?? []),
      }),
    };
    const items = [{ kind: "file", webkitGetAsEntry: () => folder, getAsFile: () => null }];
    const transfer = { items, files: [] } as unknown as DataTransfer;
    const pending = collectDroppedCloudFiles(transfer);
    items.length = 0;
    expect(await pending).toEqual([
      { file: first, path: "folder/一.txt" },
      { file: second, path: "folder/two.txt" },
    ]);
  });
  it("rejects paths that could escape the selected destination", () => {
    for (const path of ["../x", "/x", "a//b", "a/../b", "a\\b", "a\0b"]) {
      expect(() => validateCloudRelativePath(path)).toThrow();
    }
    expect(validateCloudRelativePath("中文目录/file.txt")).toBe("中文目录/file.txt");
  });
});
