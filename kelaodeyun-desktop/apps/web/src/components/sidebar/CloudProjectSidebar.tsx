import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type {
  EnvironmentId,
  ProjectId,
  ScopedProjectRef,
  ScopedThreadRef,
} from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import {
  ChevronRightIcon,
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
import { CloudClaudeSessions } from "./CloudClaudeSessions";
import { SidebarErrorDialog } from "./SidebarErrorDialog";

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
}) {
  const projects = useProjects().filter(
    (project) =>
      project.environmentId === environmentId &&
      !project.archivedAt &&
      (!projectIds.length || projectIds.includes(project.id)),
  );
  const threads = useThreadShells().filter(
    (thread) =>
      thread.environmentId === environmentId &&
      !thread.archivedAt &&
      projects.some((project) => project.id === thread.projectId),
  );
  const [pinnedOpen, setPinnedOpen] = useState(true);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [recentOpen, setRecentOpen] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
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
  const rowContent = (thread: EnvironmentThreadShell) => {
    const project = projects.find((item) => item.id === thread.projectId);
    if (thread.id.startsWith("cloud-claude-") && project)
      return (
        <CloudClaudeSessions
          key={thread.id}
          nested
          rowClassName="pr-10"
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
        />
      );
    return (
      <SidebarInteractiveRow
        className="pr-10"
        key={thread.id}
        active={
          currentThreadRef?.environmentId === environmentId &&
          currentThreadRef.threadId === thread.id
        }
        onClick={() => {
          void navigate({
            to: "/$environmentId/$threadId",
            params: { environmentId, threadId: thread.id },
          });
        }}
      >
        <span className="min-w-0 flex-1 truncate">{thread.title || "新会话"}</span>
      </SidebarInteractiveRow>
    );
  };
  const row = (thread: EnvironmentThreadShell) => (
    <div key={thread.id} className="group/conversation relative rounded-md">
      {rowContent(thread)}
      <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover/conversation:pointer-events-auto group-hover/conversation:opacity-100 group-has-[:focus-visible]/conversation:pointer-events-auto group-has-[:focus-visible]/conversation:opacity-100">
        <SidebarHeaderIconButton
          label={`${thread.pinnedAt ? "取消置顶" : "置顶"}：${thread.title || "新会话"}`}
          onClick={() =>
            onTogglePin({ environmentId, threadId: thread.id }, Boolean(thread.pinnedAt))
          }
        >
          {thread.pinnedAt ? <PinOffIcon /> : <PinIcon />}
        </SidebarHeaderIconButton>
      </span>
    </div>
  );
  return (
    <div className="px-2 py-3">
      <section aria-label="置顶对话" className="mb-5">
        <h3 className="mb-1 flex h-7 items-center px-3">
          <button
            type="button"
            aria-expanded={pinnedOpen}
            onClick={() => setPinnedOpen((open) => !open)}
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
              onClick={() => setProjectsOpen((open) => !open)}
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
            const open = expanded[project.id] ?? draftProjectId === project.id;
            const nativeThreads = threads.filter(
              (thread) =>
                thread.projectId === project.id &&
                !thread.id.startsWith("cloud-claude-") &&
                thread.title.toLowerCase().includes(search),
            );
            const Folder = open ? FolderOpenIcon : FolderIcon;
            return (
              <div key={project.id}>
                <div className="group/project relative flex items-center rounded-md">
                  <SidebarInteractiveRow
                    className="pr-9"
                    aria-expanded={open}
                    onClick={() =>
                      setExpanded((previous) => ({ ...previous, [project.id]: !open }))
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
                {expanded[project.id] !== undefined || draftProjectId === project.id ? (
                  <div
                    hidden={!open}
                    className="mb-1 ml-5"
                    role="group"
                    aria-label={`${project.title} 的对话`}
                  >
                    {draftProjectId === project.id ? (
                      <SidebarInteractiveRow active aria-current="page">
                        <span className="truncate">新会话</span>
                      </SidebarInteractiveRow>
                    ) : null}
                    {nativeThreads.map(row)}
                    <CloudClaudeSessions
                      nested
                      showEmpty={false}
                      environmentId={environmentId}
                      projectId={project.id}
                      cwd={project.workspaceRoot}
                      currentThreadRef={currentThreadRef}
                      query={query}
                    />
                  </div>
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
              onClick={() => setRecentOpen((open) => !open)}
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
      {error ? <SidebarErrorDialog key={error} message={error} /> : null}
    </div>
  );
}
