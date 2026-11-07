import type { ScopedProjectRef } from "@t3tools/contracts";
import { ComputerAddProjectDialog } from "./ComputerAddProjectDialog";
import { useComputerScopeStore } from "./computerScopeStore";

export function ComputerProjectDialogHost({
  onCreated,
}: {
  onCreated: (project: ScopedProjectRef) => Promise<unknown>;
}) {
  const environmentId = useComputerScopeStore((state) => state.addProjectEnvironmentId);
  const selection = useComputerScopeStore((state) =>
    state.addProjectEnvironmentId
      ? state.byEnvironmentId[state.addProjectEnvironmentId]?.selected
      : null,
  );
  const request = useComputerScopeStore((state) => state.requestAddProject);
  return environmentId && selection ? (
    <ComputerAddProjectDialog
      key={`${environmentId}:${selection.dir}`}
      environmentId={environmentId}
      selection={selection}
      onClose={() => request(null)}
      onCreated={onCreated}
    />
  ) : null;
}
