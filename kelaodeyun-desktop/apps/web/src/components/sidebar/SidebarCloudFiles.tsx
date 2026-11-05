import { WorkspaceLoadingPlaceholder } from "../WorkspaceLoadingPlaceholder";
import { SidebarErrorDialog } from "./SidebarErrorDialog";
import { MaterialFileIcon } from "../files/MaterialFileIcon";
import { SidebarInteractiveRow } from "./SidebarInteractiveRow";
import { useCloudSessionWorkspace } from "./useCloudSessionWorkspace";
import { useCloudDownloadSource } from "./useCloudDownloadSource";
import { CLOUD_FILE_DRAG_TYPE, setCloudDownloadDragData } from "../chat/cloudFileDrag";
import {
  COMPOSER_MENTION_DRAG_TYPE,
  composerMentionFromTreePath,
} from "../chat/composerMentionDrag";
import { useRef, useState, type ReactNode, type DragEvent } from "react";
import {
  ChevronRightIcon,
  FolderPlusIcon,
  SearchIcon,
  UploadIcon,
  RefreshCwIcon,
} from "lucide-react";
import type { EnvironmentId, ProjectEntry, ScopedThreadRef } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { useEnvironments } from "../../state/environments";
import { useDirectoryEntries } from "../files/useDirectoryEntries";
import { useEnvironmentQuery } from "../../state/query";
import { projectEnvironment } from "../../state/projects";
import {
  SidebarContent,
  SidebarGroup,
  SidebarInput,
  SidebarMenu,
  SidebarMenuItem,
} from "../ui/sidebar";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { SidebarHeaderIconButton } from "./SidebarThreadHeader";
import {
  collectDroppedCloudFiles,
  encodeCloudFile,
  validateCloudRelativePath,
} from "./cloudFileUpload";

export function SidebarCloudFiles({
  viewTabs,
  onOpenFile,
  environmentId,
  cwd,
  threadRef,
}: {
  threadRef: ScopedThreadRef | null;
  viewTabs: ReactNode;
  onOpenFile: (path: string) => void;
  environmentId?: EnvironmentId | undefined;
  cwd?: string | undefined;
}) {
  const sessionWorkspace = useCloudSessionWorkspace(threadRef, cwd);
  const { environments } = useEnvironments();
  const environment = environments.find((item) => item.environmentId === environmentId);
  const profile = environment ? Option.getOrNull(environment.entry.profile) : null;
  if (!environmentId || !cwd || profile?._tag !== "SshConnectionProfile")
    return (
      <SidebarContent fixedHeader={<SidebarGroup>{viewTabs}</SidebarGroup>}>
        <p className="px-4 py-6 text-sm text-muted-foreground">
          请先打开云端项目，文件会与当前远程终端保持一致。
        </p>
      </SidebarContent>
    );
  const root = sessionWorkspace.sessionId ? sessionWorkspace.cwd : cwd;
  if (!root)
    return (
      <SidebarContent fixedHeader={<SidebarGroup>{viewTabs}</SidebarGroup>}>
        {sessionWorkspace.loading ? (
          <WorkspaceLoadingPlaceholder compact label="正在确认项目目录" />
        ) : (
          <div className="space-y-2 px-4 py-4">
            <p role="status" className="text-xs text-muted-foreground">
              {sessionWorkspace.error || "当前会话没有可确认的项目目录"}
            </p>
            <Button variant="ghost" size="sm" onClick={sessionWorkspace.retry}>
              重试
            </Button>
          </div>
        )}
      </SidebarContent>
    );
  return (
    <CloudFileTree
      key={`${environmentId}:${root}`}
      viewTabs={viewTabs}
      onOpenFile={(path) => onOpenFile(`${root.replace(/\/+$/, "")}/${path}`)}
      environmentId={environmentId}
      cwd={root}
      sessionWorkspace={sessionWorkspace}
      target={profile.target}
      connected={environment?.connection.phase === "connected"}
    />
  );
}

function CloudFileTree({
  viewTabs,
  onOpenFile,
  environmentId,
  cwd,
  target,
  connected,
  sessionWorkspace,
}: {
  sessionWorkspace: ReturnType<typeof useCloudSessionWorkspace>;
  viewTabs: ReactNode;
  onOpenFile: (path: string) => void;
  environmentId: EnvironmentId;
  cwd: string;
  target: import("@t3tools/contracts").DesktopSshEnvironmentTarget;
  connected: boolean;
}) {
  const tree = useDirectoryEntries(environmentId, cwd);
  const downloadSource = useCloudDownloadSource(target, cwd, connected);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [rootOpen, setRootOpen] = useState(true);
  const [folder, setFolder] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  const uploadLock = useRef(false);
  const search = useEnvironmentQuery(
    query.trim()
      ? projectEnvironment.searchEntries({
          environmentId,
          input: { cwd, query: query.trim(), limit: 200 },
        })
      : null,
  );
  const canWrite = connected && Boolean(window.desktopBridge?.sshFileOperation) && !busy;
  const refresh = () => {
    tree.refresh();
    search.refresh();
  };
  const sendFiles = async (files: Array<{ file: File; path: string }>) => {
    if (!canWrite || uploadLock.current) return;
    uploadLock.current = true;
    setBusy(true);
    setError(null);
    const destination = folder;
    const failures: string[] = [];
    try {
      for (const { file, path } of files) {
        try {
          const relativePath = validateCloudRelativePath(
            destination ? `${destination}/${path}` : path,
          );
          await window.desktopBridge!.sshFileOperation!({
            target,
            cwd,
            relativePath,
            operation: "upload",
            contentsBase64: await encodeCloudFile(file),
          });
        } catch (cause) {
          failures.push(`${file.name}：${cause instanceof Error ? cause.message : "上传失败"}`);
        }
      }
      if (failures.length) setError(failures.join("\n"));
      refresh();
      if (destination) void tree.load(destination, true);
    } finally {
      uploadLock.current = false;
      setBusy(false);
    }
  };
  const drop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
    if (!canWrite || uploadLock.current) return;
    try {
      const files = await collectDroppedCloudFiles(event.dataTransfer);
      if (!files.length) throw new Error("没有可上传的文件，空文件夹请使用新建文件夹。");
      await sendFiles(files);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法读取拖拽文件");
    }
  };
  const makeFolder = async () => {
    if (!canWrite) return;
    setError(null);
    setBusy(true);
    try {
      const name = folderName.trim();
      if (name.includes("/")) throw new Error("请输入单个文件夹名称");
      validateCloudRelativePath(name);
      await window.desktopBridge!.sshFileOperation!({
        target,
        cwd,
        relativePath: folder ? `${folder}/${name}` : name,
        operation: "mkdir",
      });
      setNewFolderOpen(false);
      setFolderName("");
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建失败");
    } finally {
      setBusy(false);
    }
  };
  const rows = (entries: readonly ProjectEntry[], level = 0): ReactNode =>
    entries.map((entry) => {
      const directory = entry.kind === "directory";
      const open = expanded.has(entry.path);
      const currentWorkspace =
        directory && `${cwd.replace(/\/+$/, "")}/${entry.path}` === sessionWorkspace.cwd;
      return (
        <SidebarMenuItem key={entry.path}>
          <div className="flex items-center" style={{ paddingLeft: query ? 0 : level * 14 }}>
            <SidebarInteractiveRow
              compact
              active={selectedPath === entry.path}
              pending={directory && tree.loadingDirectories.has(entry.path)}
              disabled={!connected}
              dimmed={!connected}
              draggable={Boolean(downloadSource.url)}
              onDragStart={(event) => {
                const path = `${cwd.replace(/\/+$/, "")}/${entry.path}`;
                event.dataTransfer.effectAllowed = "copyMove";
                event.dataTransfer.setData(
                  CLOUD_FILE_DRAG_TYPE,
                  JSON.stringify({ environmentId, path }),
                );
                event.dataTransfer.setData(
                  COMPOSER_MENTION_DRAG_TYPE,
                  composerMentionFromTreePath(path) ?? path,
                );
                event.dataTransfer.setData("text/plain", path);
                if (downloadSource.url) {
                  setCloudDownloadDragData(
                    event.dataTransfer,
                    downloadSource.url,
                    entry.path,
                    directory,
                  );
                }
              }}
              aria-current={selectedPath === entry.path ? "true" : undefined}
              aria-expanded={directory ? open : undefined}
              aria-label={currentWorkspace ? `${entry.path}，当前 session 工作目录` : undefined}
              onClick={() => {
                setSelectedPath(entry.path);
                if (directory) {
                  if (!busy) setFolder(entry.path);
                  setExpanded((current) => {
                    const next = new Set(current);
                    if (open) next.delete(entry.path);
                    else next.add(entry.path);
                    return next;
                  });
                  if (!open) void tree.load(entry.path);
                } else {
                  onOpenFile(entry.path);
                }
              }}
            >
              {directory ? (
                <ChevronRightIcon className={open ? "size-3 rotate-90" : "size-3"} />
              ) : null}
              <MaterialFileIcon path={entry.path} directory={directory} expanded={open} />
              <span
                className="min-w-0 flex-1 truncate"
                style={currentWorkspace ? { color: "var(--primary)", fontWeight: 600 } : undefined}
              >
                {query ? entry.path : entry.path.split("/").at(-1)}
              </span>
            </SidebarInteractiveRow>
          </div>
          {directory && open && !query ? (
            <SidebarMenu>
              {rows(
                tree.entries.filter(
                  (child) => child.path.slice(0, child.path.lastIndexOf("/")) === entry.path,
                ),
                level + 1,
              )}
              {tree.loadingDirectories.has(entry.path) &&
              !tree.entries.some(
                (child) => child.path.slice(0, child.path.lastIndexOf("/")) === entry.path,
              ) ? (
                <li>
                  <WorkspaceLoadingPlaceholder compact label="正在读取文件夹" />
                </li>
              ) : null}
            </SidebarMenu>
          ) : null}
        </SidebarMenuItem>
      );
    });
  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          event.stopPropagation();
          setDragging(canWrite);
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = canWrite ? "copy" : "none";
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => void drop(event)}
    >
      <input
        ref={picker}
        className="hidden"
        type="file"
        multiple
        onChange={(event) => {
          const files = [...(event.target.files ?? [])].map((file) => ({ file, path: file.name }));
          event.target.value = "";
          void sendFiles(files);
        }}
      />
      <SidebarContent
        fixedHeader={
          <SidebarGroup>
            <div className="flex flex-col gap-1">
              <div className="flex items-center">
                {viewTabs}
                <div className="flex shrink-0 items-center">
                  <SidebarHeaderIconButton
                    label="上传本地文件到云端"
                    disabled={!canWrite}
                    onClick={() => picker.current?.click()}
                  >
                    <UploadIcon />
                  </SidebarHeaderIconButton>
                  <SidebarHeaderIconButton
                    label="刷新云端文件"
                    disabled={!connected || busy}
                    onClick={refresh}
                  >
                    <RefreshCwIcon />
                  </SidebarHeaderIconButton>
                  <SidebarHeaderIconButton
                    label="新建云端文件夹"
                    disabled={!canWrite}
                    onClick={() => setNewFolderOpen(true)}
                  >
                    <FolderPlusIcon />
                  </SidebarHeaderIconButton>
                </div>
              </div>
              <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-sidebar-muted-foreground focus-within:bg-sidebar-row-hover">
                <SearchIcon className="size-4 shrink-0" />
                <SidebarInput
                  nativeInput
                  type="search"
                  aria-label="搜索云端文件"
                  placeholder="搜索文件"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </div>
          </SidebarGroup>
        }
      >
        <SidebarGroup>
          <SidebarInteractiveRow
            compact
            active={selectedPath === ""}
            disabled={!connected}
            dimmed={!connected}
            aria-current={selectedPath === "" ? "true" : undefined}
            aria-expanded={rootOpen}
            draggable={Boolean(downloadSource.url)}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "copyMove";
              event.dataTransfer.setData(
                CLOUD_FILE_DRAG_TYPE,
                JSON.stringify({ environmentId, path: cwd }),
              );
              event.dataTransfer.setData(
                COMPOSER_MENTION_DRAG_TYPE,
                composerMentionFromTreePath(cwd) ?? cwd,
              );
              event.dataTransfer.setData("text/plain", cwd);
              if (downloadSource.url)
                setCloudDownloadDragData(
                  event.dataTransfer,
                  downloadSource.url,
                  ".",
                  true,
                  cwd.split("/").filter(Boolean).at(-1) || "workspace",
                );
            }}
            onClick={() => {
              setSelectedPath("");
              if (!busy) setFolder("");
              setRootOpen(!rootOpen);
              if (!rootOpen || tree.error) void tree.load("");
            }}
            className="mb-2"
            aria-label={`${sessionWorkspace.cwd === cwd ? "当前 session 工作目录" : "文件浏览根目录"} ${cwd}，${rootOpen ? "收起" : "展开"}文件夹`}
          >
            <ChevronRightIcon
              className={`size-3 shrink-0 transition-transform ${rootOpen ? "rotate-90" : ""}`}
              aria-hidden="true"
            />
            <MaterialFileIcon path={cwd} directory expanded={rootOpen} root />
            <span
              className="min-w-0 flex-1 truncate"
              style={sessionWorkspace.cwd === cwd ? { color: "var(--primary)" } : undefined}
            >
              {cwd.split("/").filter(Boolean).at(-1) || "/"}
            </span>
          </SidebarInteractiveRow>
          {sessionWorkspace.sessionId ? (
            <p className="mb-2 break-all px-2 text-xs text-muted-foreground" role="status">
              {sessionWorkspace.loading
                ? "正在核对 session 目录…"
                : (sessionWorkspace.error ??
                  (sessionWorkspace.cwd
                    ? `Session 目录：${sessionWorkspace.cwd}`
                    : "此 session 暂无可确认的工作目录"))}
            </p>
          ) : null}
          {!connected ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">连接已断开，请先连接云电脑。</p>
          ) : null}
          <div hidden={!rootOpen && !query}>
            <SidebarMenu aria-label="云端文件">
              {rows(
                query
                  ? (search.data?.entries ?? [])
                  : tree.entries.filter((entry) => !entry.path.includes("/")),
              )}
            </SidebarMenu>
            {(query ? search.isPending && !search.data : !tree.ready && tree.isPending) ? (
              <WorkspaceLoadingPlaceholder compact label="正在读取文件" />
            ) : null}
            {rootOpen && !query && tree.ready && tree.entries.length === 0 && !tree.error ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">文件夹为空</p>
            ) : null}
          </div>
          {query && search.data?.entries.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">未找到文件</p>
          ) : null}
        </SidebarGroup>
      </SidebarContent>
      {(error || search.error || tree.error || downloadSource.error) && !newFolderOpen ? (
        <SidebarErrorDialog
          key={error || search.error || tree.error || downloadSource.error}
          message={error || search.error || tree.error || downloadSource.error || "操作失败"}
        />
      ) : null}
      {dragging ? (
        <div className="pointer-events-none absolute inset-1 z-20 flex items-center justify-center rounded-lg border border-primary bg-background/90 p-4 text-center text-sm">
          松开上传到云端
          <br />
          {folder || cwd}
        </div>
      ) : null}
      <Dialog
        open={newFolderOpen}
        onOpenChange={(open) => {
          if (!busy) setNewFolderOpen(open);
        }}
      >
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>新建云端文件夹</DialogTitle>
            <DialogDescription>{folder || cwd}</DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void makeFolder();
              }}
            >
              <Input
                aria-label="文件夹名称"
                value={folderName}
                onValueChange={setFolderName}
                placeholder="文件夹名称"
              />
              {error ? (
                <p role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              ) : null}
              <Button disabled={!canWrite || !folderName.trim()} type="submit">
                创建文件夹
              </Button>
            </form>
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
