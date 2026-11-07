import { SidebarProvider } from "../ui/sidebar";
import "~/index.css";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { CloudProjectSidebar } from "./CloudProjectSidebar";
import { useArchivedThreadSnapshots } from "../../lib/archivedThreadsState";
import { useCloudSidebarState } from "./cloudSidebarState";
import { useComputerScopeStore } from "./computerScopeStore";

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
      hasPendingApprovals: true,
      updatedAt: "2026-11-02",
      archivedAt: null,
      pinnedAt: null,
    },
    {
      id: "four",
      environmentId: "cloud",
      projectId: "b",
      title: "Beta second",
      updatedAt: "2026-10-30",
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
vi.mock("./CloudClaudeSessions", () => ({
  CloudClaudeSessions: () => null,
  NativeSessionRow: ({ session }: { session: { title: string } }) => (
    <button type="button" data-native-row>
      {session.title}
    </button>
  ),
  useNativeClaudeSessions: ({ cwd }: { cwd: string }) => ({
    sessions:
      cwd === "/b"
        ? Array.from({ length: 7 }, (_, index) => ({
            id: `native-${index + 1}`,
            title: `Native ${index + 1}`,
            updatedAt: 1_700_000_000 + index,
          }))
        : [],
    loading: false,
    connected: true,
    error: null,
  }),
  useNativeSessionActions: () => ({
    resume: vi.fn(),
    rename: vi.fn(),
    archive: vi.fn(),
    importingSessionId: null,
    importing: false,
    error: null,
  }),
}));
vi.mock("../../lib/archivedThreadsState", () => ({
  useArchivedThreadSnapshots: vi.fn(),
}));
vi.mock("./cloudClaudeStatus", () => ({
  useCloudClaudeStatusPolling: () => undefined,
  useCloudClaudeSessionStatus: () => null,
  useCliSessionSeen: () => null,
  markCliSessionSeen: () => undefined,
}));

function setup() {
  useCloudSidebarState.setState({ byEnvironmentId: {} });
  useComputerScopeStore.setState({ byEnvironmentId: {} });
  vi.mocked(useArchivedThreadSnapshots).mockReturnValue({
    snapshots: [
      {
        environmentId: EnvironmentId.make("cloud"),
        snapshot: { threads: [{ id: "cloud-claude-native-7" }] } as never,
      },
    ],
    isLoading: false,
    error: null,
    refresh: () => undefined,
  });
}

it("filters projects and recent threads by the selected computer", async () => {
  setup();
  useComputerScopeStore.getState().update(EnvironmentId.make("cloud"), {
    computersRoot: "/b",
    selected: { slug: "box", dir: "/b", label: "box", host: "box", username: "root" },
  });
  await using screen = await render(
    <SidebarProvider>
      <CloudProjectSidebar
        environmentId={EnvironmentId.make("cloud")}
        currentProjectId={undefined}
        currentThreadRef={null}
        projectIds={[]}
        query=""
        onAddProject={() => undefined}
        onNewThread={async () => undefined}
        onTogglePin={() => undefined}
        onRenameThread={() => undefined}
        onArchiveThread={async () => undefined}
      />
    </SidebarProvider>,
  );
  expect(screen.container.textContent).toContain("Beta conversation");
  expect(screen.container.textContent).not.toContain("Alpha conversation");
  expect(screen.container.textContent).not.toContain("Alpha");
});

it("shows each project's own conversations and keeps recent conversations ordered within the current server", async () => {
  setup();
  const newThread = vi.fn(async () => undefined);
  const togglePin = vi.fn();
  const rename = vi.fn();
  const archive = vi.fn(async () => undefined);
  await using screen = await render(
    <SidebarProvider>
      <CloudProjectSidebar
        environmentId={EnvironmentId.make("cloud")}
        currentProjectId={undefined}
        currentThreadRef={null}
        projectIds={[]}
        query=""
        onAddProject={() => undefined}
        onNewThread={newThread}
        onTogglePin={togglePin}
        onRenameThread={rename}
        onArchiveThread={archive}
      />
    </SidebarProvider>,
  );
  await expect.element(page.getByRole("button", { name: "置顶", exact: true })).toBeVisible();
  await userEvent.hover(page.getByRole("button", { name: "Beta conversation", exact: true }));
  await expect.element(page.getByRole("img", { name: "需要你决策" })).toBeVisible();
  await userEvent.click(
    page.getByRole("button", { name: "重命名：Beta conversation", exact: true }),
  );
  await userEvent.type(page.getByRole("textbox", { name: "会话名称" }), "New title{Enter}");
  expect(rename).toHaveBeenCalledWith(
    { environmentId: "cloud", threadId: "two" },
    "New title",
    "Beta conversation",
  );
  await userEvent.hover(page.getByRole("button", { name: "Beta conversation", exact: true }));
  await userEvent.click(
    page.getByRole("button", { name: "重命名：Beta conversation", exact: true }),
  );
  await userEvent.type(page.getByRole("textbox", { name: "会话名称" }), "Cancelled{Escape}");
  expect(rename).toHaveBeenCalledTimes(1);
  await userEvent.dblClick(page.getByRole("button", { name: "Beta conversation", exact: true }));
  await expect.element(page.getByRole("textbox", { name: "会话名称" })).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await userEvent.click(page.getByRole("button", { name: "归档：Beta conversation", exact: true }));
  expect(archive).toHaveBeenCalledWith(
    { environmentId: "cloud", threadId: "two" },
    "Beta conversation",
  );
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
  const betaGroup = screen.container.querySelector('[aria-label="Beta 的对话"]')!;
  expect(betaGroup.textContent).toContain("Beta conversation");
  expect(betaGroup.textContent).not.toContain("Alpha conversation");
  await userEvent.click(page.getByRole("button", { name: "在 Beta 中新建会话" }));
  expect(newThread).toHaveBeenCalledWith({ environmentId: "cloud", projectId: "b" });
});

it("paginates combined project sessions and reacts to archive snapshot changes", async () => {
  setup();
  const sidebar = () => (
    <SidebarProvider>
      <CloudProjectSidebar
        environmentId={EnvironmentId.make("cloud")}
        currentProjectId={undefined}
        currentThreadRef={null}
        projectIds={[]}
        query=""
        onAddProject={() => undefined}
        onNewThread={async () => undefined}
        onTogglePin={() => undefined}
        onRenameThread={() => undefined}
        onArchiveThread={async () => undefined}
      />
    </SidebarProvider>
  );
  await using screen = await render(sidebar());
  await userEvent.click(page.getByRole("button", { name: "Beta", exact: true }));
  const group = screen.container.querySelector('[aria-label="Beta 的对话"]')!;
  const rowCount = () =>
    group.querySelectorAll("button[data-native-row], div.group\\/conversation").length;
  expect(rowCount()).toBe(5);
  expect(group.textContent).not.toContain("Native 7");
  await userEvent.click(page.getByRole("button", { name: "展示更多", exact: true }));
  expect(rowCount()).toBe(8);
  await expect
    .element(page.getByRole("button", { name: "展示更多", exact: true }))
    .not.toBeInTheDocument();
  expect(group.textContent).not.toContain("Native 7");
  vi.mocked(useArchivedThreadSnapshots).mockReturnValue({
    snapshots: [],
    isLoading: false,
    error: null,
    refresh: () => undefined,
  });
  await screen.rerender(sidebar());
  expect(group.textContent).toContain("Native 7");
  expect(rowCount()).toBe(9);
});

it("keeps the active project open when a draft becomes a thread", async () => {
  setup();
  const sidebar = (draft: boolean) => (
    <SidebarProvider>
      <CloudProjectSidebar
        environmentId={EnvironmentId.make("cloud")}
        currentProjectId={ProjectId.make("a")}
        draftProjectId={draft ? ProjectId.make("a") : undefined}
        currentThreadRef={
          draft
            ? null
            : { environmentId: EnvironmentId.make("cloud"), threadId: ThreadId.make("one") }
        }
        projectIds={[]}
        query=""
        onAddProject={() => undefined}
        onNewThread={async () => undefined}
        onTogglePin={() => undefined}
        onRenameThread={() => undefined}
        onArchiveThread={async () => undefined}
      />
    </SidebarProvider>
  );
  await using screen = await render(sidebar(true));
  await expect.element(page.getByRole("group", { name: "Alpha 的对话" })).toBeVisible();
  await screen.rerender(sidebar(false));
  await expect.element(page.getByRole("group", { name: "Alpha 的对话" })).toBeVisible();
  const group = screen.container.querySelector('[aria-label="Alpha 的对话"]')!;
  expect(group.querySelector('[aria-current="page"]')?.textContent).toContain("Alpha conversation");
});

it("preserves folder, section and pagination state across remounts", async () => {
  setup();
  const sidebar = () => (
    <SidebarProvider>
      <CloudProjectSidebar
        environmentId={EnvironmentId.make("cloud")}
        currentProjectId={ProjectId.make("a")}
        currentThreadRef={null}
        projectIds={[]}
        query=""
        onAddProject={() => undefined}
        onNewThread={async () => undefined}
        onTogglePin={() => undefined}
        onRenameThread={() => undefined}
        onArchiveThread={async () => undefined}
      />
    </SidebarProvider>
  );
  await using screen = await render(sidebar());
  await userEvent.click(page.getByRole("button", { name: "Alpha", exact: true }));
  await userEvent.click(page.getByRole("button", { name: "Beta", exact: true }));
  await userEvent.click(page.getByRole("button", { name: "展示更多", exact: true }));
  await userEvent.click(page.getByRole("button", { name: "最近", exact: true }));
  await screen.unmount();
  await using remounted = await render(sidebar());
  await expect
    .element(page.getByRole("button", { name: "Alpha", exact: true }))
    .toHaveAttribute("aria-expanded", "false");
  await expect
    .element(page.getByRole("button", { name: "Beta", exact: true }))
    .toHaveAttribute("aria-expanded", "true");
  await expect
    .element(page.getByRole("button", { name: "最近", exact: true }))
    .toHaveAttribute("aria-expanded", "false");
  const group = remounted.container.querySelector('[aria-label="Beta 的对话"]')!;
  expect(group.querySelectorAll("button[data-native-row], div.group\\/conversation")).toHaveLength(
    8,
  );
  await expect
    .element(page.getByRole("button", { name: "展示更多", exact: true }))
    .not.toBeInTheDocument();
});
