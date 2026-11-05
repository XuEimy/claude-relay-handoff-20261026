import "~/index.css";
import { EnvironmentId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { CloudAddProjectDialog } from "./CloudAddProjectDialog";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  projects: [] as Array<{ id: string; environmentId: string; workspaceRoot: string }>,
}));
vi.mock("../../state/entities", () => ({ useProjects: () => mocks.projects }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => mocks.create }));
vi.mock("../../state/use-orchestration-command", () => ({
  useOrchestrationCommand: () => vi.fn(),
}));
vi.mock("../../state/projects", () => ({
  projectEnvironment: { create: {}, update: {}, listEntries: (input: unknown) => input },
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: (request: { input: { cwd: string } }) => ({
    isPending: false,
    error: null,
    data: {
      entries: request.input.cwd === "/work" ? [{ path: "real-project", kind: "directory" }] : [],
    },
  }),
}));

it("persists the chosen remote folder before opening its conversation, and reuses existing projects", async () => {
  mocks.projects = [];
  mocks.create.mockReset().mockResolvedValue({ _tag: "Success", value: undefined });
  const open = vi.fn(async () => undefined);
  const close = vi.fn();
  await using screen = await render(
    <CloudAddProjectDialog
      environmentId={EnvironmentId.make("cloud")}
      initialCwd="/work"
      onCreated={open}
      onClose={close}
    />,
  );
  await userEvent.click(page.getByRole("button", { name: "real-project", exact: true }));
  await userEvent.click(page.getByRole("button", { name: "添加“real-project”" }));
  await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1));
  const request = mocks.create.mock.calls[0]![0];
  expect(request.environmentId).toBe("cloud");
  expect(request.input.workspaceRoot).toBe("/work/real-project");
  expect(request.input.createWorkspaceRootIfMissing).toBe(false);
  expect(open).toHaveBeenCalledWith({ environmentId: "cloud", projectId: request.input.projectId });
  expect(close).toHaveBeenCalledTimes(1);
  mocks.projects = [
    { id: request.input.projectId, environmentId: "cloud", workspaceRoot: "/work/real-project" },
  ];
  await screen.rerender(
    <CloudAddProjectDialog
      environmentId={EnvironmentId.make("cloud")}
      initialCwd="/work"
      onCreated={open}
      onClose={close}
    />,
  );
  await userEvent.click(page.getByRole("button", { name: "添加“real-project”" }));
  await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(2));
  expect(mocks.create).toHaveBeenCalledTimes(1);
});
