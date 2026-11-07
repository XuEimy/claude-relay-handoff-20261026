import {
  accountHostMatchesTarget,
  type DesktopAccountHost,
  type DesktopSshEnvironmentTarget,
} from "@t3tools/contracts";

export function unmatchedAccountHosts(
  hosts: readonly DesktopAccountHost[],
  targets: readonly DesktopSshEnvironmentTarget[],
) {
  return hosts.filter((host) => !targets.some((target) => accountHostMatchesTarget(host, target)));
}
