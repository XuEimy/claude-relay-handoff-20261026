import "~/index.css";
import { EnvironmentId, type DesktopSshFileOperation } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render, stubGlobal } from "../../../test/render";
import { ComputerAddProjectDialog } from "./ComputerAddProjectDialog";
import { useComputerScopeStore } from "./computerScopeStore";

const mocks = vi.hoisted(() => ({ create: vi.fn(), projects: [] as unknown[] }));
vi.mock("../../state/entities", () => ({
  useProjects: () => mocks.projects,
  waitForProject: vi.fn(async () => undefined),
}));
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
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => mocks.create }));
vi.mock("../../state/use-orchestration-command", () => ({
  useOrchestrationCommand: () => vi.fn(),
}));
vi.mock("../../state/projects", () => ({ projectEnvironment: { create: {}, update: {} } }));

it("browses a computer folder and creates the corresponding server project", async () => {
  mocks.projects = [];
  mocks.create.mockReset().mockResolvedValue({ _tag: "Success", value: undefined });
  useComputerScopeStore.setState({ byEnvironmentId: {}, addProjectEnvironmentId: null });
  const calls: DesktopSshFileOperation[] = [];
  using _bridge = stubGlobal("desktopBridge", {
    sshFileOperation: async (input: DesktopSshFileOperation) => {
      calls.push(input);
      if (input.operation === "computer-list-dir")
        return JSON.stringify({
          ok: true,
          path: input.path === "~" ? "/home/user" : input.path,
          entries: input.path === "~" ? ["project"] : [],
        });
      if (input.operation === "computer-add-project")
        return JSON.stringify({
          ok: true,
          dir: "/home/me/computers/box/project",
          name: "project",
          remotePath: input.path,
        });
      throw new Error("unexpected operation");
    },
  });
  const onCreated = vi.fn(async () => undefined);
  const onClose = vi.fn();
  await using screen = await render(
    <ComputerAddProjectDialog
      environmentId={EnvironmentId.make("server")}
      selection={{
        slug: "box",
        dir: "/home/me/computers/box",
        label: "Box",
        host: "box.tail",
        username: "root",
        os: "linux",
      }}
      onCreated={onCreated}
      onClose={onClose}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "project", exact: true }));
  await expect.element(page.getByRole("button", { name: "添加“project”" })).toBeEnabled();
  await userEvent.click(page.getByRole("button", { name: "添加“project”" }));
  await vi.waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  expect(calls.find((input) => input.operation === "computer-add-project")?.path).toBe(
    "/home/user/project",
  );
  expect(mocks.create.mock.calls[0]![0].input).toMatchObject({
    title: "project",
    workspaceRoot: "/home/me/computers/box/project",
    createWorkspaceRootIfMissing: false,
  });
  expect(useComputerScopeStore.getState().byEnvironmentId.server?.projectPaths).toEqual({
    "/home/me/computers/box/project": "/home/user/project",
  });
  expect(onClose).toHaveBeenCalledOnce();
});
