import type { DesktopSshEnvironmentTarget, EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { useEffect, useState } from "react";
import { useEnvironments } from "../../state/environments";
import { prefetchComputerListing } from "./computerListing";
import { runComputerOperation } from "./computerOperations";
import type { ComputerSelection } from "./computerPicker";

export function useComputerStatus(
  environmentId: EnvironmentId,
  selection: ComputerSelection | null,
) {
  const { environments } = useEnvironments();
  const environment = environments.find((entry) => entry.environmentId === environmentId) ?? null;
  const profile = environment ? Option.getOrNull(environment.entry.profile) : null;
  const target = profile?._tag === "SshConnectionProfile" ? profile.target : null;
  const connected = environment?.connection.phase === "connected" && Boolean(target);
  const key = JSON.stringify([environmentId, target, selection]);
  const [result, setResult] = useState<{ key: string; status: "connected" | "unreachable" } | null>(
    null,
  );

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- polls the selected computer through its server connection
  useEffect(() => {
    if (!connected) return;
    const [, target, selection] = JSON.parse(key) as [
      string,
      DesktopSshEnvironmentTarget | null,
      ComputerSelection | null,
    ];
    if (!selection || !target) return;
    let cancelled = false;
    let pending = false;
    const probe = async (initial = false) => {
      if (pending || (!initial && document.hidden)) return;
      pending = true;
      try {
        const response = await runComputerOperation<{ os: string }>(target, "computer-probe", {
          host: selection.host,
          username: selection.username,
          label: selection.label,
          os: selection.os ?? "",
        });
        if (!cancelled) {
          if (response.ok) {
            setResult({ key, status: "connected" });
            prefetchComputerListing(target, selection, "~");
          } else {
            setResult({ key, status: "unreachable" });
          }
        }
      } catch {
        if (!cancelled) setResult({ key, status: "unreachable" });
      } finally {
        pending = false;
      }
    };
    void probe(true);
    const timer = window.setInterval(() => void probe(), 60_000);
    const onVisible = () => {
      if (!document.hidden) void probe();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key, connected]);

  return !connected ? "unreachable" : result?.key === key ? result.status : "checking";
}
