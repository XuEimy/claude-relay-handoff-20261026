import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { inferProjectTitleFromPath } from "@t3tools/client-runtime/state/projects";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { newProjectId } from "../../lib/utils";
import { readProjects, waitForProject } from "../../state/entities";
import type { EnvironmentPresentation } from "../../state/environments";
import { projectEnvironment } from "../../state/projects";
import { useAtomCommand } from "../../state/use-atom-command";
import { useUiStateStore } from "../../uiStateStore";
import { defaultComputerScope, projectInComputerScope } from "./computerPicker";
import { useComputerScopeStore } from "./computerScopeStore";

export function useEnterEnvironmentWorkspace() {
  const createProject = useAtomCommand(projectEnvironment.create, { reportFailure: false });
  const openThread = useNewThreadHandler();
  return async (server: EnvironmentPresentation, options?: { workspaceRoot?: string }) => {
    if (server.connection.phase !== "connected" || !server.serverConfig) {
      throw new Error("工作区尚未就绪，请重试。");
    }
    const scope =
      useComputerScopeStore.getState().byEnvironmentId[server.environmentId] ??
      defaultComputerScope;
    const existing = readProjects().find(
      (project) =>
        project.environmentId === server.environmentId &&
        project.archivedAt == null &&
        (options?.workspaceRoot !== undefined
          ? project.workspaceRoot === options.workspaceRoot
          : projectInComputerScope(project.workspaceRoot, { ...scope, selected: null })),
    );
    const projectId = existing?.id ?? newProjectId();
    if (!existing) {
      const workspaceRoot = options?.workspaceRoot ?? server.serverConfig.cwd;
      const result = await createProject({
        environmentId: server.environmentId,
        input: {
          projectId,
          title: inferProjectTitleFromPath(workspaceRoot),
          workspaceRoot,
          createWorkspaceRootIfMissing: false,
          defaultModelSelection: null,
        },
      });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      await waitForProject(scopeProjectRef(server.environmentId, projectId));
    }
    useUiStateStore.getState().setSidebarProjectScopeKeys([]);
    const opened = await openThread(scopeProjectRef(server.environmentId, projectId));
    if (!opened) throw new Error("工作区尚未就绪，请重试。");
  };
}
