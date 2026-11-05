import { SidebarProvider } from "../ui/sidebar";
import "~/index.css";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { CloudProjectSidebar } from "./CloudProjectSidebar";

vi.mock("../../state/entities", () => ({
  useProjects: () => [
    { id: "a", environmentId: "cloud", title: "Alpha", workspaceRoot: "/a", archivedAt: null },
    { id: "b", environmentId: "cloud", title: "Beta", workspaceRoot: "/b", archivedAt: null },
    { id: "c", environmentId: "other", title: "Other", workspaceRoot: "/c", archivedAt: null },
  ],
  useThreadShells: () => [
    {
      id: "one",
      environmentId: "cloud",
      projectId: "a",
      title: "Alpha conversation",
      updatedAt: "2026-11-01",
      archivedAt: null,
      pinnedAt: null,
    },
    {
      id: "two",
      environmentId: "cloud",
      projectId: "b",
      title: "Beta conversation",
      updatedAt: "2026-11-02",
      archivedAt: null,
      pinnedAt: null,
    },
    {
      id: "three",
      environmentId: "other",
      projectId: "c",
      title: "Private other server",
      updatedAt: "2026-11-03",
      archivedAt: null,
      pinnedAt: null,
    },
  ],
}));
vi.mock("./CloudClaudeSessions", () => ({ CloudClaudeSessions: () => null }));

it("shows each project's own conversations and keeps recent conversations ordered within the current server", async () => {
  const newThread = vi.fn(async () => undefined);
  const togglePin = vi.fn();
  await using screen = await render(
    <SidebarProvider>
      <CloudProjectSidebar
        environmentId={EnvironmentId.make("cloud")}
        currentProjectId={ProjectId.make("a")}
        currentThreadRef={null}
        projectIds={[]}
        query=""
        onAddProject={() => undefined}
        onNewThread={newThread}
        onTogglePin={togglePin}
      />
    </SidebarProvider>,
  );
  await expect.element(page.getByRole("button", { name: "置顶", exact: true })).toBeVisible();
  await userEvent.hover(page.getByRole("button", { name: "Beta conversation", exact: true }));
  await userEvent.click(page.getByRole("button", { name: "置顶：Beta conversation", exact: true }));
  expect(togglePin).toHaveBeenCalledWith({ environmentId: "cloud", threadId: "two" }, false);
  await userEvent.click(page.getByRole("button", { name: "Alpha", exact: true }));
  await expect
    .element(page.getByRole("group", { name: "Alpha 的对话" }))
    .toHaveTextContent("Alpha conversation");
  await expect.element(page.getByRole("group", { name: "Beta 的对话" })).not.toBeInTheDocument();
  expect(screen.container.textContent).not.toContain("Private other server");
  const recent = screen.container.querySelector('[aria-label="最近对话"]')!.textContent!;
  expect(recent.indexOf("Beta conversation")).toBeLessThan(recent.indexOf("Alpha conversation"));
  await userEvent.click(page.getByRole("button", { name: "Beta", exact: true }));
  await expect
    .element(page.getByRole("group", { name: "Beta 的对话" }))
    .toHaveTextContent("Beta conversation");
  await expect
    .element(page.getByRole("group", { name: "Beta 的对话" }))
    .not.toHaveTextContent("Alpha conversation");
  await userEvent.click(page.getByRole("button", { name: "在 Beta 中新建会话" }));
  expect(newThread).toHaveBeenCalledWith({ environmentId: "cloud", projectId: "b" });
});
