import { useEffect, useRef, useState } from "react";
import * as Option from "effect/Option";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { inferProjectTitleFromPath } from "@t3tools/client-runtime/state/projects";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, ScopedProjectRef } from "@t3tools/contracts";
import { useEnvironments } from "../../state/environments";
import { useProjects, waitForProject } from "../../state/entities";
import { useAtomCommand } from "../../state/use-atom-command";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { projectEnvironment } from "../../state/projects";
import { newProjectId } from "../../lib/utils";
import { MaterialFileIcon } from "../files/MaterialFileIcon";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { SidebarInteractiveRow } from "./SidebarInteractiveRow";
import { ComputerListingLoader } from "./ComputerListingLoader";
import {
  cachedComputerListing,
  loadComputerListing,
  prefetchComputerListing,
  type ComputerListing,
} from "./computerListing";
import { runComputerOperation } from "./computerOperations";
import type { ComputerSelection } from "./computerPicker";
import { useComputerScopeStore } from "./computerScopeStore";

export function ComputerAddProjectDialog({
  environmentId,
  selection,
  onClose,
  onCreated,
}: {
  environmentId: EnvironmentId;
  selection: ComputerSelection;
  onClose: () => void;
  onCreated: (project: ScopedProjectRef) => Promise<unknown>;
}) {
  const { environments } = useEnvironments();
  const environment = environments.find((entry) => entry.environmentId === environmentId) ?? null;
  const profile = environment ? Option.getOrNull(environment.entry.profile) : null;
  const target = profile?._tag === "SshConnectionProfile" ? profile.target : null;
  const targetKey = JSON.stringify(target);
  const computerKey = JSON.stringify(selection);
  const connected = Boolean(target) && environment?.connection.phase === "connected";
  const [cwd, setCwd] = useState("~");
  const [reload, setReload] = useState(0);
  const requestKey = JSON.stringify([cwd, reload]);
  const [input, setInput] = useState("~");
  const [listing, setListing] = useState<ComputerListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const projects = useProjects();
  const update = useOrchestrationCommand(projectEnvironment.update, { label: "project unarchive" });
  const create = useAtomCommand(projectEnvironment.create, { reportFailure: false });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- loads the selected computer's directory over SSH
  useEffect(() => {
    let cancelled = false;
    const server = JSON.parse(targetKey) as typeof target;
    const computer = JSON.parse(computerKey) as ComputerSelection;
    const [path] = JSON.parse(requestKey) as [string, number];
    if (!server || environment?.connection.phase !== "connected") {
      return;
    }
    const cached = cachedComputerListing(computer, path);
    /* oxlint-disable react/set-state-in-effect -- cached directory state is shown while its SSH refresh runs */
    if (cached) {
      setListing(cached);
      setInput(cached.path);
      setError(null);
    }
    setLoading(true);
    /* oxlint-enable react/set-state-in-effect */
    const timeout = window.setTimeout(() => {
      if (cancelled || cached) return;
      cancelled = true;
      setLoading(false);
      setListing(null);
      setError("读取电脑目录超时，请检查这台电脑的 SSH 服务后重试。");
    }, 45_000);
    void loadComputerListing(server, computer, path).then(
      (result) => {
        if (cancelled) return;
        setLoading(false);
        if (!result.ok) {
          setListing(null);
          setError(result.message);
          return;
        }
        const fresh = { path: result.path, entries: result.entries };
        setListing(fresh);
        setInput(result.path);
        setError(null);
      },
      (cause) => {
        if (!cancelled) {
          setLoading(false);
          setListing(null);
          setError(cause instanceof Error ? cause.message : "无法读取电脑目录");
        }
      },
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [targetKey, computerKey, requestKey, environment?.connection.phase]);

  const browse = (path: string) => {
    if (!path || (path !== "~" && !path.startsWith("/")) || /[\x00-\x1f]/u.test(path)) {
      setError("请输入电脑上的完整目录。");
      return;
    }
    if (path === cwd) {
      if (!listing) {
        setLoading(true);
        setReload((value) => value + 1);
      }
      return;
    }
    setError(null);
    setListing(null);
    setLoading(true);
    setCwd(path);
  };

  const visibleListing = connected ? listing : null;
  const path = visibleListing?.path ?? cwd;
  const refreshing = loading && visibleListing !== null;
  const prefetchChild = (name: string) => {
    if (!target || !connected) return;
    prefetchComputerListing(target, selection, `${path.replace(/\/+$/u, "")}/${name}`);
  };

  const add = async () => {
    if (lock.current || !target || !visibleListing || !connected) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await runComputerOperation<{ dir: string; name: string; remotePath: string }>(
        target,
        "computer-add-project",
        {
          host: selection.host,
          username: selection.username,
          label: selection.label,
          os: selection.os ?? "",
        },
        visibleListing.path,
      );
      if (!result.ok) throw new Error(result.message);
      const existing = projects.find(
        (project) =>
          project.environmentId === environmentId &&
          project.workspaceRoot.replace(/\/+$/u, "") === result.dir.replace(/\/+$/u, ""),
      );
      const projectId = existing?.id ?? newProjectId();
      if (existing?.archivedAt) {
        const restored = await update({ environmentId, input: { projectId, archived: false } });
        if (restored._tag === "Failure") throw new Error("无法恢复已归档的项目，请重试。");
      } else if (!existing) {
        const created = await create({
          environmentId,
          input: {
            projectId,
            title: inferProjectTitleFromPath(result.remotePath),
            workspaceRoot: result.dir,
            createWorkspaceRootIfMissing: false,
            defaultModelSelection: null,
          },
        });
        if (created._tag === "Failure") throw squashAtomCommandFailure(created);
        await waitForProject(scopeProjectRef(environmentId, projectId));
      }
      const scope = useComputerScopeStore.getState().byEnvironmentId[environmentId];
      useComputerScopeStore.getState().update(environmentId, {
        projectPaths: { ...scope?.projectPaths, [result.dir]: result.remotePath },
      });
      await onCreated(scopeProjectRef(environmentId, projectId));
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "添加项目失败");
    } finally {
      lock.current = false;
      setBusy(false);
    }
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
          <DialogTitle>添加项目</DialogTitle>
          <DialogDescription>选择「{selection.label}」上的文件夹作为项目。</DialogDescription>
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
              aria-label="电脑项目路径"
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
              disabled={busy || path === "/" || !visibleListing}
              onClick={() => browse(path.slice(0, path.lastIndexOf("/")) || "/")}
            >
              上一级
            </Button>
            <span className="min-w-0 flex-1 break-all text-xs text-muted-foreground">{path}</span>
          </div>
          <div className="mt-2 max-h-64 overflow-y-auto" aria-label="电脑文件夹">
            {loading && connected && !visibleListing ? (
              <ComputerListingLoader label={selection.label} />
            ) : null}
            {refreshing ? (
              <div className="workspace-loading-glint mt-1" aria-hidden="true" />
            ) : null}
            {visibleListing?.entries.map((name) => (
              <SidebarInteractiveRow
                compact
                key={name}
                disabled={busy}
                onClick={() => browse(`${path.replace(/\/+$/u, "")}/${name}`)}
                onFocus={() => prefetchChild(name)}
                onPointerEnter={() => prefetchChild(name)}
              >
                <MaterialFileIcon path={name} directory />
                <span className="truncate">{name}</span>
              </SidebarInteractiveRow>
            ))}
          </div>
          {!connected ? (
            <p role="alert" className="mt-3 break-words text-xs text-destructive">
              请先连接你的服务器
            </p>
          ) : error ? (
            <p role="alert" className="mt-3 break-words text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button disabled={busy || !visibleListing || !connected} onClick={() => void add()}>
            {busy ? "正在添加…" : `添加“${inferProjectTitleFromPath(path)}”`}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
