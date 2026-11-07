import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type {
  EnvironmentId,
  ProjectId,
  ScopedProjectRef,
  ScopedThreadRef,
} from "@t3tools/contracts";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import {
  ChevronRightIcon,
  ArchiveIcon,
  FolderIcon,
  FolderOpenIcon,
  PlusIcon,
  PinIcon,
  PinOffIcon,
  SquarePenIcon,
} from "lucide-react";
import { useProjects, useThreadShells } from "../../state/entities";
import { SidebarInteractiveRow } from "./SidebarInteractiveRow";
import { SidebarHeaderIconButton } from "./SidebarThreadHeader";
import {
  CloudClaudeSessions,
  NativeSessionRow,
  useNativeClaudeSessions,
  useNativeSessionActions,
} from "./CloudClaudeSessions";
import { SidebarErrorDialog } from "./SidebarErrorDialog";
import { CloudSessionRow } from "./CloudSessionRow";
import { useCloudClaudeStatusPolling } from "./cloudClaudeStatus";
import { useSessionLight } from "./useSessionLight";
import { WorkspaceLoadingPlaceholder } from "../WorkspaceLoadingPlaceholder";
import { useArchivedThreadSnapshots } from "../../lib/archivedThreadsState";
import {
  paginateProjectSessions,
  PROJECT_SESSION_INITIAL,
  PROJECT_SESSION_PAGE,
} from "./projectSessionPage";
import { defaultCloudSidebarState, useCloudSidebarState } from "./cloudSidebarState";
import { defaultComputerScope, projectInComputerScope } from "./computerPicker";
import { useComputerScopeStore } from "./computerScopeStore";

function AppThreadRow({
  thread,
  active,
  onClick,
  onRename,
  onArchive,
  actions,
}: {
  thread: EnvironmentThreadShell;
  active: boolean;
  onClick: () => void;
  onRename: (title: string) => void;
  onArchive: () => void;
  actions: React.ReactNode;
}) {
  const light = useSessionLight(thread.environmentId, undefined, thread, active);
  return (
    <CloudSessionRow
      className="pr-24"
      title={thread.title || "新会话"}
      light={light}
      active={active}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      onRename={onRename}
      onArchive={onArchive}
      actions={actions}
    />
  );
}

function ProjectFolder({
  project,
  threads,
  currentThreadRef,
  query,
  open,
  draft,
  archivedThreadIds,
  visibleCount,
  onShowMore,
  onRenameThread,
  onArchiveThread,
  renderThread,
}: {
  project: EnvironmentProject;
  threads: readonly EnvironmentThreadShell[];
  currentThreadRef: ScopedThreadRef | null;
  query: string;
  open: boolean;
  draft: boolean;
  archivedThreadIds: ReadonlySet<string>;
  visibleCount: number;
  onShowMore: () => void;
  onRenameThread: (ref: ScopedThreadRef, title: string, originalTitle: string) => void;
  onArchiveThread: (ref: ScopedThreadRef, title: string) => Promise<void>;
  renderThread: (thread: EnvironmentThreadShell) => React.ReactNode;
}) {
  const { environmentId } = project;
  const {
    sessions,
    loading,
    connected,
    error: listError,
  } = useNativeClaudeSessions({
    environmentId,
    cwd: project.workspaceRoot,
    enabled: true,
  });
  const { resume, rename, archive, importing, importingSessionId, error } = useNativeSessionActions(
    {
      environmentId,
      projectId: project.id,
      cwd: project.workspaceRoot,
      currentThreadRef,
      onRenameThread,
      onArchiveThread,
    },
  );
  const search = query.trim().toLowerCase();
  const appItems = threads
    .filter(
      (thread) =>
        thread.projectId === project.id &&
        !thread.id.startsWith("cloud-claude-") &&
        thread.title.toLowerCase().includes(search),
    )
    .map((thread) => ({ kind: "app" as const, thread, updatedAt: Date.parse(thread.updatedAt) }));
  const nativeItems = sessions
    .filter((session) => !archivedThreadIds.has(`cloud-claude-${session.id}`))
    .map((session) => ({
      kind: "native" as const,
      session,
      thread: threads.find((thread) => thread.id === `cloud-claude-${session.id}`) ?? null,
      updatedAt: session.updatedAt * 1000,
    }))
    .filter(({ session, thread }) =>
      (thread?.title || session.title).toLowerCase().includes(search),
    );
  const items = [...appItems, ...nativeItems].toSorted((a, b) => b.updatedAt - a.updatedAt);
  const isActive = (id: string) =>
    currentThreadRef?.environmentId === environmentId && currentThreadRef.threadId === id;
  const { visible, remaining } = paginateProjectSessions(items, visibleCount, (item) =>
    isActive(item.kind === "app" ? item.thread.id : `cloud-claude-${item.session.id}`),
  );
  return (
    <div hidden={!open} className="mb-1 ml-5" role="group" aria-label={`${project.title} 的对话`}>
      {draft ? (
        <SidebarInteractiveRow active aria-current="page">
          <span className="truncate">新会话</span>
        </SidebarInteractiveRow>
      ) : null}
      {loading ? <WorkspaceLoadingPlaceholder compact /> : null}
      {visible.map((item) =>
        item.kind === "app" ? (
          renderThread(item.thread)
        ) : (
          <NativeSessionRow
            key={item.session.id}
            session={item.session}
            thread={item.thread}
            environmentId={environmentId}
            active={isActive(`cloud-claude-${item.session.id}`)}
            pending={importingSessionId === item.session.id}
            disabled={importing || !connected}
            rowClassName={undefined}
            actions={undefined}
            onResume={() => void resume(item.session)}
            onRename={(title) => void rename(item.session, item.thread, title)}
            onArchive={() => void archive(item.session, item.thread)}
          />
        ),
      )}
      {remaining > 0 ? (
        <button
          type="button"
          className="px-3 py-1 text-xs text-muted-foreground hover:text-sidebar-foreground"
          onClick={onShowMore}
        >
          展示更多
        </button>
      ) : null}
      {error ? <SidebarErrorDialog key={error} message={error} /> : null}
      {listError ? <SidebarErrorDialog key={listError} message={listError} /> : null}
    </div>
  );
}

export function CloudProjectSidebar({
  environmentId,
  currentProjectId,
  currentThreadRef,
  projectIds,
  draftProjectId,
  query,
  onAddProject,
  onNewThread,
  onTogglePin,
  onRenameThread,
  onArchiveThread,
}: {
  environmentId: EnvironmentId;
  currentProjectId: ProjectId | undefined;
  currentThreadRef: ScopedThreadRef | null;
  projectIds: readonly ProjectId[];
  draftProjectId?: ProjectId | undefined;
  query: string;
  onAddProject: () => void;
  onNewThread: (project: ScopedProjectRef) => Promise<unknown>;
  onTogglePin: (thread: ScopedThreadRef, pinned: boolean) => void;
  onRenameThread: (thread: ScopedThreadRef, title: string, originalTitle: string) => void;
  onArchiveThread: (thread: ScopedThreadRef, title: string) => Promise<void>;
}) {
  useCloudClaudeStatusPolling(environmentId);
  const { snapshots } = useArchivedThreadSnapshots([environmentId]);
  const archivedThreadIds = new Set(
    snapshots.flatMap(({ snapshot }) => snapshot.threads.map((thread) => thread.id)),
  );
  const computerScope = useComputerScopeStore(
    (state) => state.byEnvironmentId[environmentId] ?? defaultComputerScope,
  );
  const projects = useProjects().filter(
    (project) =>
      project.environmentId === environmentId &&
      !project.archivedAt &&
      projectInComputerScope(project.workspaceRoot, computerScope) &&
      (!projectIds.length || projectIds.includes(project.id)),
  );
  const threads = useThreadShells().filter(
    (thread) =>
      thread.environmentId === environmentId &&
      !thread.archivedAt &&
      projects.some((project) => project.id === thread.projectId),
  );
  const { pinnedOpen, projectsOpen, recentOpen, expanded, visibleCounts } = useCloudSidebarState(
    (state) => state.byEnvironmentId[environmentId] ?? defaultCloudSidebarState,
  );
  const updateSidebar = useCloudSidebarState((state) => state.update);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const search = query.trim().toLowerCase();
  const recent = threads
    .filter((thread) => !thread.pinnedAt && thread.title.toLowerCase().includes(search))
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 30);
  const pinned = threads.filter(
    (thread) => thread.pinnedAt && thread.title.toLowerCase().includes(search),
  );
  const newThread = async (projectId: ProjectId) => {
    setError(null);
    try {
      await onNewThread(scopeProjectRef(environmentId, projectId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "打开项目失败");
    }
  };
  const row = (thread: EnvironmentThreadShell) => {
    const project = projects.find((item) => item.id === thread.projectId);
    const actions = (
      <SidebarHeaderIconButton
        label={`${thread.pinnedAt ? "取消置顶" : "置顶"}：${thread.title || "新会话"}`}
        onClick={() =>
          onTogglePin({ environmentId, threadId: thread.id }, Boolean(thread.pinnedAt))
        }
      >
        {thread.pinnedAt ? <PinOffIcon /> : <PinIcon />}
      </SidebarHeaderIconButton>
    );
    if (thread.id.startsWith("cloud-claude-") && project)
      return (
        <CloudClaudeSessions
          key={thread.id}
          nested
          rowClassName="pr-24"
          session={{
            id: thread.id.slice(13),
            title: thread.title,
            updatedAt: Date.parse(thread.updatedAt),
          }}
          environmentId={environmentId}
          projectId={project.id}
          cwd={thread.worktreePath ?? project.workspaceRoot}
          currentThreadRef={currentThreadRef}
          query={query}
          onRenameThread={onRenameThread}
          onArchiveThread={onArchiveThread}
          archivedThreadIds={archivedThreadIds}
          actions={actions}
        />
      );
    return (
      <AppThreadRow
        key={thread.id}
        thread={thread}
        active={
          currentThreadRef?.environmentId === environmentId &&
          currentThreadRef.threadId === thread.id
        }
        onRename={(title) =>
          onRenameThread({ environmentId, threadId: thread.id }, title, thread.title)
        }
        onArchive={() => void onArchiveThread({ environmentId, threadId: thread.id }, thread.title)}
        actions={actions}
        onClick={() => {
          void navigate({
            to: "/$environmentId/$threadId",
            params: { environmentId, threadId: thread.id },
          });
        }}
      />
    );
  };
  return (
    <div className="px-2 py-3">
      <section aria-label="置顶对话" className="mb-5">
        <h3 className="mb-1 flex h-7 items-center px-3">
          <button
            type="button"
            aria-expanded={pinnedOpen}
            onClick={() =>
              updateSidebar(environmentId, (state) => ({ ...state, pinnedOpen: !state.pinnedOpen }))
            }
            className="flex cursor-pointer items-center gap-1.5 rounded-sm py-1 text-xs font-black text-sidebar-foreground/80 transition-colors hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
          >
            置顶
            <ChevronRightIcon
              aria-hidden="true"
              className={`size-3 transition-transform motion-reduce:transition-none ${pinnedOpen ? "rotate-90" : ""}`}
            />
          </button>
        </h3>
        <div hidden={!pinnedOpen}>{pinned.map(row)}</div>
      </section>
      <section aria-label="云端项目">
        <div className="group/section mb-1 flex h-7 items-center justify-between pl-3 pr-1">
          <h3>
            <button
              type="button"
              aria-expanded={projectsOpen}
              onClick={() =>
                updateSidebar(environmentId, (state) => ({
                  ...state,
                  projectsOpen: !state.projectsOpen,
                }))
              }
              className="flex cursor-pointer items-center gap-1.5 rounded-sm py-1 text-xs font-black text-sidebar-foreground/80 transition-colors hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
            >
              项目
              <ChevronRightIcon
                aria-hidden="true"
                className={`size-3 transition-transform motion-reduce:transition-none ${projectsOpen ? "rotate-90" : ""}`}
              />
            </button>
          </h3>
          <span className="pointer-events-none opacity-0 transition-opacity group-hover/section:pointer-events-auto group-hover/section:opacity-100 group-has-[:focus-visible]/section:pointer-events-auto group-has-[:focus-visible]/section:opacity-100">
            <SidebarHeaderIconButton label="添加云端项目" onClick={onAddProject}>
              <PlusIcon />
            </SidebarHeaderIconButton>
          </span>
        </div>
        <div hidden={!projectsOpen}>
          {projects.map((project) => {
            const open =
              expanded[project.id] ??
              (draftProjectId === project.id || currentProjectId === project.id);
            const Folder = open ? FolderOpenIcon : FolderIcon;
            return (
              <div key={project.id}>
                <div className="group/project relative flex items-center rounded-md">
                  <SidebarInteractiveRow
                    className="pr-9"
                    aria-expanded={open}
                    onClick={() =>
                      updateSidebar(environmentId, (state) => ({
                        ...state,
                        expanded: { ...state.expanded, [project.id]: !open },
                      }))
                    }
                  >
                    <Folder
                      aria-hidden="true"
                      strokeWidth={1.5}
                      className="size-4 shrink-0 text-sidebar-foreground/70"
                    />
                    <span className="min-w-0 flex-1 truncate">{project.title}</span>
                  </SidebarInteractiveRow>
                  <span className="absolute right-1 pointer-events-none opacity-0 transition-opacity group-hover/project:pointer-events-auto group-hover/project:opacity-100 group-has-[:focus-visible]/project:pointer-events-auto group-has-[:focus-visible]/project:opacity-100 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100">
                    <SidebarHeaderIconButton
                      label={`在 ${project.title} 中新建会话`}
                      onClick={() => void newThread(project.id)}
                    >
                      <SquarePenIcon />
                    </SidebarHeaderIconButton>
                  </span>
                </div>
                {expanded[project.id] !== undefined ||
                draftProjectId === project.id ||
                currentProjectId === project.id ? (
                  <ProjectFolder
                    project={project}
                    threads={threads}
                    currentThreadRef={currentThreadRef}
                    query={query}
                    open={open}
                    draft={draftProjectId === project.id}
                    archivedThreadIds={archivedThreadIds}
                    visibleCount={visibleCounts[project.id] ?? PROJECT_SESSION_INITIAL}
                    onShowMore={() =>
                      updateSidebar(environmentId, (state) => ({
                        ...state,
                        visibleCounts: {
                          ...state.visibleCounts,
                          [project.id]:
                            (state.visibleCounts[project.id] ?? PROJECT_SESSION_INITIAL) +
                            PROJECT_SESSION_PAGE,
                        },
                      }))
                    }
                    onRenameThread={onRenameThread}
                    onArchiveThread={onArchiveThread}
                    renderThread={row}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
      <section aria-label="最近对话" className="mt-5">
        <div className="group/section mb-1 flex h-7 items-center justify-between pl-3 pr-1">
          <h3>
            <button
              type="button"
              aria-expanded={recentOpen}
              onClick={() =>
                updateSidebar(environmentId, (state) => ({
                  ...state,
                  recentOpen: !state.recentOpen,
                }))
              }
              className="flex cursor-pointer items-center gap-1.5 rounded-sm py-1 text-xs font-black text-sidebar-foreground/80 transition-colors hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
            >
              最近
              <ChevronRightIcon
                aria-hidden="true"
                className={`size-3 transition-transform motion-reduce:transition-none ${recentOpen ? "rotate-90" : ""}`}
              />
            </button>
          </h3>
          <span className="pointer-events-none opacity-0 transition-opacity group-hover/section:pointer-events-auto group-hover/section:opacity-100 group-has-[:focus-visible]/section:pointer-events-auto group-has-[:focus-visible]/section:opacity-100">
            <SidebarHeaderIconButton
              label="新建对话"
              disabled={!currentProjectId}
              onClick={() => {
                if (currentProjectId) void newThread(currentProjectId);
              }}
            >
              <PlusIcon />
            </SidebarHeaderIconButton>
          </span>
        </div>
        <div hidden={!recentOpen}>
          {recent.map(row)}
          {!recent.length ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {search ? "未找到对话" : "暂无最近对话"}
            </p>
          ) : null}
        </div>
      </section>
      <button
        type="button"
        className="mt-5 flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground hover:text-sidebar-foreground"
        onClick={() => void navigate({ to: "/settings/archived" })}
      >
        <ArchiveIcon aria-hidden="true" className="size-3.5" />
        已归档会话
      </button>
      {error ? <SidebarErrorDialog key={error} message={error} /> : null}
    </div>
  );
}
