import { expect, it } from "vite-plus/test";
import {
  readCloudFileDrag,
  quoteTerminalFilePath,
  setCloudDownloadDragData,
} from "./cloudFileDrag";

it("rejects cross-environment and malformed cloud paths", () => {
  expect(
    readCloudFileDrag(JSON.stringify({ environmentId: "one", path: "/work/你好 notes.md" }), "one"),
  ).toEqual(["/work/你好 notes.md"]);
  expect(() =>
    readCloudFileDrag(JSON.stringify({ environmentId: "one", path: "/a" }), "two"),
  ).toThrow("另一台");
  for (const path of ["relative", "/a\nls", "/a\u001b[0m"])
    expect(() =>
      readCloudFileDrag(JSON.stringify({ environmentId: "one", path }), "one"),
    ).toThrow();
});

it("quotes shell metacharacters and refuses control characters without adding Enter", () => {
  expect(quoteTerminalFilePath("/work/John's $(touch bad).txt")).toBe(
    "'/work/John'\\''s $(touch bad).txt'",
  );
  expect(() => quoteTerminalFilePath("/work/a\nb")).toThrow();
});

it("adds a promised download without replacing the internal cloud reference", () => {
  const data = new Map<string, string>();
  const cloud = JSON.stringify({ environmentId: "one", path: "/work/中文/file #1.txt" });
  data.set("application/x-kelaodeyun-cloud-file", cloud);
  setCloudDownloadDragData(
    {
      setData: (key, value) => {
        data.set(key, value);
      },
    },
    "http://127.0.0.1:1234/capability",
    "中文/file #1.txt",
  );
  const value = data.get("DownloadURL")!;
  expect(value.startsWith("application/octet-stream:file #1.txt:")).toBe(true);
  const url = new URL(value.slice("application/octet-stream:file #1.txt:".length));
  expect(url.searchParams.get("path")).toBe("中文/file #1.txt");
  expect(readCloudFileDrag(data.get("application/x-kelaodeyun-cloud-file")!, "one")).toEqual([
    "/work/中文/file #1.txt",
  ]);
});

it("advertises folders as ZIP downloads while retaining their cloud directory path", () => {
  const data = new Map<string, string>();
  setCloudDownloadDragData(
    {
      setData: (key, value) => {
        data.set(key, value);
      },
    },
    "http://127.0.0.1:1234/capability",
    "项目",
    true,
  );
  const value = data.get("DownloadURL")!;
  expect(value.startsWith("application/octet-stream:项目.zip:")).toBe(true);
  const url = new URL(value.slice("application/octet-stream:项目.zip:".length));
  expect(url.searchParams.get("directory")).toBe("1");
  expect(url.searchParams.get("path")).toBe("项目");
});
