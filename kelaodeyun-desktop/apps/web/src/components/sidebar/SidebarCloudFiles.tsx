import { useRef, useState, type ReactNode, type DragEvent } from "react";
import {
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  SearchIcon,
  UploadIcon,
  RefreshCwIcon,
} from "lucide-react";
import type { EnvironmentId, ProjectEntry } from "@t3tools/contracts";
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
  SidebarMenuButton,
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
}: {
  viewTabs: ReactNode;
  onOpenFile: (path: string) => void;
  environmentId?: EnvironmentId | undefined;
  cwd?: string | undefined;
}) {
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
  return (
    <CloudFileTree
      key={`${environmentId}:${cwd}`}
      viewTabs={viewTabs}
      onOpenFile={onOpenFile}
      environmentId={environmentId}
      cwd={cwd}
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
}: {
  viewTabs: ReactNode;
  onOpenFile: (path: string) => void;
  environmentId: EnvironmentId;
  cwd: string;
  target: import("@t3tools/contracts").DesktopSshEnvironmentTarget;
  connected: boolean;
}) {
  const tree = useDirectoryEntries(environmentId, cwd);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [folder, setFolder] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
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
    let completed = 0;
    const failures: string[] = [];
    try {
      for (const { file, path } of files) {
        setNotice(`上传 ${completed + failures.length + 1}/${files.length}：${file.name}`);
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
          completed++;
        } catch (cause) {
          failures.push(`${file.name}：${cause instanceof Error ? cause.message : "上传失败"}`);
        }
      }
      setNotice(`上传完成 ${completed}/${files.length}`);
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
      setNotice("文件夹已创建");
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
      const Icon = directory ? (open ? FolderOpenIcon : FolderIcon) : FileIcon;
      return (
        <SidebarMenuItem key={entry.path}>
          <div style={{ paddingLeft: query ? 0 : level * 14 }}>
            <SidebarMenuButton
              size="sm"
              isActive={directory ? folder === entry.path : preview === entry.path}
              aria-expanded={directory ? open : undefined}
              onClick={() => {
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
                  setPreview(entry.path);
                  onOpenFile(entry.path);
                }
              }}
            >
              {directory ? (
                <ChevronRightIcon className={open ? "size-3 rotate-90" : "size-3"} />
              ) : null}
              <Icon className="text-(--sidebar-icon-color)" />
              <span className="truncate">{query ? entry.path : entry.path.split("/").at(-1)}</span>
            </SidebarMenuButton>
          </div>
          {directory && open && !query ? (
            <SidebarMenu>
              {rows(
                tree.entries.filter(
                  (child) => child.path.slice(0, child.path.lastIndexOf("/")) === entry.path,
                ),
                level + 1,
              )}
              {tree.loadingDirectories.has(entry.path) ? (
                <li className="px-5 py-1 text-xs text-muted-foreground">加载中…</li>
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
          <button
            type="button"
            disabled={busy}
            onClick={() => setFolder("")}
            className="truncate px-2 pb-2 text-left text-xs text-muted-foreground"
            aria-label={`上传根目录 ${cwd}`}
          >
            {cwd}
          </button>
          {!connected ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">连接已断开，请先连接云电脑。</p>
          ) : null}
          <SidebarMenu aria-label="云端文件">
            {rows(
              query
                ? (search.data?.entries ?? [])
                : tree.entries.filter((entry) => !entry.path.includes("/")),
            )}
          </SidebarMenu>
          {(query ? search.isPending : !tree.ready && tree.isPending) ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">加载中…</p>
          ) : null}
          {search.error || tree.error || error ? (
            <p
              role="alert"
              className="whitespace-pre-wrap break-words px-2 py-3 text-xs text-destructive"
            >
              {error ?? search.error ?? tree.error}
            </p>
          ) : null}
          {query && search.data?.entries.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">未找到文件</p>
          ) : null}
          <p className="mt-3 break-all px-2 text-2xs text-muted-foreground">
            拖拽文件上传至：{folder || cwd}
          </p>
          <p role="status" className="px-2 py-2 text-xs text-muted-foreground">
            {notice || "单文件最大 32 MB · 同名文件不会覆盖"}
          </p>
        </SidebarGroup>
      </SidebarContent>
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
