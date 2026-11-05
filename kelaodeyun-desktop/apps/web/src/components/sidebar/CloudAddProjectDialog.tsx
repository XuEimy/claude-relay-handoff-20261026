import { useRef, useState } from "react";
import { type EnvironmentId, type ScopedProjectRef } from "@t3tools/contracts";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { inferProjectTitleFromPath } from "@t3tools/client-runtime/state/projects";
import { useProjects } from "../../state/entities";
import { useAtomCommand } from "../../state/use-atom-command";
import { useEnvironmentQuery } from "../../state/query";
import { projectEnvironment } from "../../state/projects";
import { newProjectId } from "../../lib/utils";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogFooter,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { MaterialFileIcon } from "../files/MaterialFileIcon";
import { SidebarInteractiveRow } from "./SidebarInteractiveRow";

export function CloudAddProjectDialog({
  environmentId,
  initialCwd,
  onClose,
  onCreated,
}: {
  environmentId: EnvironmentId;
  initialCwd: string;
  onClose: () => void;
  onCreated: (project: ScopedProjectRef) => Promise<unknown>;
}) {
  const [cwd, setCwd] = useState(initialCwd);
  const [input, setInput] = useState(initialCwd);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const projects = useProjects();
  const update = useOrchestrationCommand(projectEnvironment.update, { label: "project unarchive" });
  const create = useAtomCommand(projectEnvironment.create, { reportFailure: false });
  const listing = useEnvironmentQuery(
    projectEnvironment.listEntries({ environmentId, input: { cwd, directoryPath: "" } }),
  );
  const browse = (path: string) => {
    const normalized = path.trim().replace(/\/+$/, "") || "/";
    if (
      !normalized.startsWith("/") ||
      /[\x00-\x1f]/.test(normalized) ||
      normalized.split("/").includes("..")
    ) {
      setError("请输入云电脑上的完整目录，例如 /home/dev/my-project。");
      return;
    }
    setInput(normalized);
    setCwd(normalized);
    setError(null);
  };
  const submit = async () => {
    try {
      const existing = projects.find(
        (project) =>
          project.environmentId === environmentId &&
          project.workspaceRoot.replace(/\/+$/, "") === cwd.replace(/\/+$/, ""),
      );
      const projectId = existing?.id ?? newProjectId();
      if (existing?.archivedAt) {
        const result = await update({ environmentId, input: { projectId, archived: false } });
        if (result._tag === "Failure") {
          setError("无法恢复已归档的项目，请重试。");
          return;
        }
      }
      if (!existing) {
        const result = await create({
          environmentId,
          input: {
            projectId,
            title: inferProjectTitleFromPath(cwd),
            workspaceRoot: cwd,
            createWorkspaceRootIfMissing: false,
            defaultModelSelection: null,
          },
        });
        if (result._tag === "Failure") {
          const failure = squashAtomCommandFailure(result);
          setError(failure instanceof Error ? failure.message : "添加云端项目失败");
          return;
        }
      }
      await onCreated(scopeProjectRef(environmentId, projectId));
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "打开项目失败，请重试");
    }
  };
  const add = () => {
    if (lock.current || listing.isPending || listing.error || !listing.data) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    void submit().finally(() => {
      lock.current = false;
      setBusy(false);
    });
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>添加云端项目</DialogTitle>
          <DialogDescription>选择当前云电脑上的文件夹作为项目目录。</DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              browse(input);
            }}
          >
            <Input
              aria-label="云端项目路径"
              value={input}
              onValueChange={setInput}
              disabled={busy}
            />
            <Button type="submit" variant="outline" disabled={busy}>
              前往
            </Button>
          </form>
          <div className="mt-3 flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={busy || cwd === "/"}
              onClick={() => browse(cwd.slice(0, cwd.lastIndexOf("/")) || "/")}
            >
              上一级
            </Button>
            <span className="min-w-0 flex-1 break-all text-xs text-muted-foreground">{cwd}</span>
          </div>
          <div className="mt-2 max-h-64 overflow-y-auto" aria-label="云端文件夹">
            {listing.isPending ? <Spinner size="sm" aria-label="正在读取云端目录" /> : null}
            {listing.data?.entries
              .filter((entry) => entry.kind === "directory")
              .map((entry) => (
                <SidebarInteractiveRow
                  compact
                  key={entry.path}
                  disabled={busy}
                  onClick={() => browse(`${cwd.replace(/\/+$/, "")}/${entry.path}`)}
                >
                  <MaterialFileIcon path={entry.path} directory />
                  <span className="truncate">{entry.path.split("/").at(-1)}</span>
                </SidebarInteractiveRow>
              ))}
          </div>
          {error || listing.error ? (
            <p role="alert" className="mt-3 break-words text-xs text-destructive">
              {error || listing.error}
            </p>
          ) : null}
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={busy || listing.isPending || Boolean(listing.error) || !listing.data}
            onClick={() => void add()}
          >
            {busy ? "正在添加…" : `添加“${inferProjectTitleFromPath(cwd)}”`}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
