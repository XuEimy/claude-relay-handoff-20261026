import { EnvironmentId, type DesktopSshFileOperation } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { expect, it, vi } from "vite-plus/test";
import { render } from "../../../test/render";
import { useTerminalFileDrop } from "./useTerminalFileDrop";
import { CLOUD_FILE_DRAG_TYPE } from "../chat/cloudFileDrag";

vi.mock("../../state/environments", () => ({
  useEnvironments: () => ({
    environments: [
      {
        environmentId: "test-cloud",
        entry: {
          profile: Option.some({
            _tag: "SshConnectionProfile",
            target: { host: "example.invalid" },
          }),
          target: { _tag: "SshConnectionTarget" },
        },
      },
    ],
  }),
}));
vi.mock("../ui/toast", () => ({ toastManager: { add: vi.fn() } }));
function installBridge(upload: (input: DesktopSshFileOperation) => Promise<string>) {
  const original = Object.getOwnPropertyDescriptor(window, "desktopBridge");
  Object.defineProperty(window, "desktopBridge", {
    configurable: true,
    value: { sshFileOperation: upload },
  });
  return {
    [Symbol.dispose]() {
      if (original) Object.defineProperty(window, "desktopBridge", original);
      else Reflect.deleteProperty(window, "desktopBridge");
    },
  };
}

function Target({ paste }: { paste: (text: string) => Promise<void> }) {
  const handlers = useTerminalFileDrop({
    environmentId: EnvironmentId.make("test-cloud"),
    cwd: "/work",
    canWrite: true,
    paste,
  });
  return <div data-drop-target {...handlers} />;
}
function drop(element: Element, data: DataTransfer) {
  element.dispatchEvent(
    new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: data }),
  );
}

it("uploads local bytes before inserting a quoted remote path without Enter", async () => {
  const upload = vi.fn<(input: DesktopSshFileOperation) => Promise<string>>(async () => "{}");
  using _bridge = installBridge(upload);
  const paste = vi.fn<(text: string) => Promise<void>>(async () => {});
  await using screen = await render(<Target paste={paste} />);
  const transfer = new DataTransfer();
  transfer.items.add(new File(["hello"], "a b.txt"));
  drop(screen.container.querySelector("[data-drop-target]")!, transfer);
  await expect.poll(() => paste.mock.calls.length).toBe(1);
  expect(upload.mock.calls[0]?.[0]).toMatchObject({
    operation: "upload",
    cwd: "/work",
    contentsBase64: "aGVsbG8=",
  });
  expect(paste.mock.calls[0]?.[0]).toMatch(/^'\/work\/\.kelaodeyun-uploads\/[^/]+\/a b\.txt' $/);
});

it("inserts same-server cloud paths without uploading and rejects other servers", async () => {
  const paste = vi.fn<(text: string) => Promise<void>>(async () => {});
  await using screen = await render(<Target paste={paste} />);
  const target = screen.container.querySelector("[data-drop-target]")!;
  const transfer = new DataTransfer();
  transfer.setData(
    CLOUD_FILE_DRAG_TYPE,
    JSON.stringify({ environmentId: "other", path: "/private/notes.md" }),
  );
  drop(target, transfer);
  expect(paste).not.toHaveBeenCalled();
  transfer.setData(
    CLOUD_FILE_DRAG_TYPE,
    JSON.stringify({ environmentId: "test-cloud", path: "/work/notes.md" }),
  );
  drop(target, transfer);
  await expect.poll(() => paste.mock.calls.length).toBe(1);
  expect(paste).toHaveBeenCalledWith("'/work/notes.md' ");
});

it("does not paste a nonexistent remote path after an upload failure", async () => {
  using _bridge = installBridge(async () => {
    throw new Error("upload failed");
  });
  const paste = vi.fn<(text: string) => Promise<void>>(async () => {});
  await using screen = await render(<Target paste={paste} />);
  const transfer = new DataTransfer();
  transfer.items.add(new File(["hello"], "notes.txt"));
  const { toastManager } = await import("../ui/toast");
  vi.mocked(toastManager.add).mockClear();
  drop(screen.container.querySelector("[data-drop-target]")!, transfer);
  await expect
    .poll(() => vi.mocked(toastManager.add).mock.calls.some(([toast]) => toast.type === "error"))
    .toBe(true);
  expect(paste).not.toHaveBeenCalled();
});

it("does not paste a completed upload into a disposed terminal", async () => {
  let resolveUpload!: (value: string) => void;
  const pending = new Promise<string>((resolve) => {
    resolveUpload = resolve;
  });
  const upload = vi.fn(() => pending);
  using _bridge = installBridge(upload);
  const paste = vi.fn<(text: string) => Promise<void>>(async () => {});
  await using screen = await render(<Target paste={paste} />);
  const transfer = new DataTransfer();
  transfer.items.add(new File(["hello"], "notes.txt"));
  drop(screen.container.querySelector("[data-drop-target]")!, transfer);
  await expect.poll(() => upload.mock.calls.length).toBe(1);
  await screen.unmount();
  const { act } = await import("../../../test/render");
  await act(async () => {
    resolveUpload("{}");
    await pending;
  });
  expect(paste).not.toHaveBeenCalled();
});
