import { useThreadRouteTarget } from "../../hooks/useThreadRouteTarget";
import { useComposerDraftStore } from "../../composerDraftStore";
import { useEnvironments } from "../../state/environments";

export function useActiveSshEnvironment() {
  const { environments } = useEnvironments();
  const sshEnvironments = environments.filter(
    (environment) => environment.entry.target._tag === "SshConnectionTarget",
  );
  const routeTarget = useThreadRouteTarget();
  const routeDraft = useComposerDraftStore((store) =>
    routeTarget?.kind === "draft" ? store.getDraftSession(routeTarget.draftId) : null,
  );
  const activeEnvironmentId =
    routeTarget?.kind === "server"
      ? routeTarget.threadRef.environmentId
      : routeDraft?.environmentId;
  return (
    sshEnvironments.find((environment) => environment.environmentId === activeEnvironmentId) ??
    sshEnvironments.find((environment) => environment.connection.phase === "connected") ??
    sshEnvironments[0]
  );
}
