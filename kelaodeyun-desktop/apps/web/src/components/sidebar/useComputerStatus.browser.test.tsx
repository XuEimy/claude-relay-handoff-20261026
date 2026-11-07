import { EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { expect, it, vi } from "vite-plus/test";
import { render, stubGlobal } from "../../../test/render";
import type { ComputerSelection } from "./computerPicker";
import { useComputerStatus } from "./useComputerStatus";

vi.mock("../../state/environments", () => ({
  useEnvironments: () => ({
    environments: [
      {
        environmentId: "server",
        connection: { phase: "connected" },
        entry: {
          profile: Option.some({
            _tag: "SshConnectionProfile",
            target: { alias: "server", hostname: "server", username: "me", port: null },
          }),
        },
      },
    ],
  }),
}));

function Status({ selection }: { selection: ComputerSelection }) {
  return <span>{useComputerStatus(EnvironmentId.make("server"), selection)}</span>;
}

it("retains its last result during a focus probe and ignores stale selections", async () => {
  const requests: Array<{ resolve: (value: string) => void }> = [];
  using _bridge = stubGlobal("desktopBridge", {
    sshFileOperation: (input: { operation: string }) => {
      if (input.operation === "computer-list-dir") {
        return Promise.resolve(JSON.stringify({ ok: true, path: "/home/user", entries: [] }));
      }
      let resolve!: (value: string) => void;
      const promise = new Promise<string>((done) => {
        resolve = done;
      });
      requests.push({ resolve });
      return promise;
    },
  });
  const selection = {
    slug: "box",
    dir: "/computers/box",
    label: "Box",
    host: "status-box.tail",
    username: "root",
  };
  await using screen = await render(<Status selection={selection} />);
  await expect.element(screen.getByText("checking")).toBeVisible();
  await vi.waitFor(() => expect(requests).toHaveLength(1));
  requests[0]!.resolve(JSON.stringify({ ok: true, os: "linux" }));
  await expect.element(screen.getByText("connected")).toBeVisible();
  window.dispatchEvent(new Event("focus"));
  await vi.waitFor(() => expect(requests).toHaveLength(2));
  await expect.element(screen.getByText("connected")).toBeVisible();
  await screen.rerender(<Status selection={{ ...selection, host: "other.tail" }} />);
  await expect.element(screen.getByText("checking")).toBeVisible();
  await vi.waitFor(() => expect(requests).toHaveLength(3));
  requests[1]!.resolve(JSON.stringify({ ok: true, os: "linux" }));
  requests[2]!.resolve(JSON.stringify({ ok: false, error: "unreachable", message: "offline" }));
  await expect.element(screen.getByText("unreachable")).toBeVisible();
});
