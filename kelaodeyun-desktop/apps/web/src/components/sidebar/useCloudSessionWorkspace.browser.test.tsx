import { EnvironmentId, ThreadId, type DesktopSshFileOperation } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { expect, it, vi } from "vite-plus/test";
import { act, render } from "../../../test/render";
import { useCloudSessionWorkspace } from "./useCloudSessionWorkspace";

vi.mock("../../state/environments", () => ({
  useEnvironments: () => ({
    environments: [
      {
        environmentId: "cloud",
        entry: {
          profile: Option.some({
            _tag: "SshConnectionProfile",
            target: { host: "example.invalid" },
          }),
        },
        connection: { phase: "connected" },
      },
    ],
  }),
}));
function Panel({ session }: { session: string }) {
  const result = useCloudSessionWorkspace(
    {
      environmentId: EnvironmentId.make("cloud"),
      threadId: ThreadId.make(`cloud-claude-${session}`),
    },
    "/default",
  );
  return <output data-cwd>{result.cwd ?? "unknown"}</output>;
}
function bridgeFixture() {
  const previous = Object.getOwnPropertyDescriptor(window, "desktopBridge");
  const pending = new Map<string, (value: string) => void>();
  Object.defineProperty(window, "desktopBridge", {
    configurable: true,
    value: {
      sshFileOperation: (input: DesktopSshFileOperation) =>
        new Promise<string>((resolve) => pending.set(input.relativePath, resolve)),
    },
  });
  return {
    pending,
    [Symbol.dispose]() {
      if (previous) Object.defineProperty(window, "desktopBridge", previous);
      else Reflect.deleteProperty(window, "desktopBridge");
    },
  };
}
it("does not use the default project cwd or a previous session's late response", async () => {
  using bridge = bridgeFixture();
  await using screen = await render(<Panel session="first" />);
  const cwd = () => screen.container.querySelector("[data-cwd]")?.textContent;
  expect(cwd()).toBe("unknown");
  await screen.rerender(<Panel session="second" />);
  await act(async () => {
    bridge.pending.get("first")!(
      JSON.stringify({ sessionId: "first", cwd: "/wrong", exists: true }),
    );
  });
  expect(cwd()).toBe("unknown");
  await act(async () => {
    bridge.pending.get("second")!(
      JSON.stringify({ sessionId: "second", cwd: "/actual", exists: true }),
    );
  });
  expect(cwd()).toBe("/actual");
  await screen.rerender(<Panel session="third" />);
  expect(cwd()).toBe("unknown");
  await screen.rerender(<Panel session="second" />);
  expect(cwd()).toBe("/actual");
});
