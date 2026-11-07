import type { DesktopSshEnvironmentTarget, DesktopSshFileOperation } from "@t3tools/contracts";

export type ComputerInput = NonNullable<DesktopSshFileOperation["computer"]>;
export type ComputerResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string; message: string; state?: string | null };

export async function runComputerOperation<T>(
  target: DesktopSshEnvironmentTarget,
  operation: DesktopSshFileOperation["operation"],
  computer?: ComputerInput,
  path?: string,
): Promise<ComputerResult<T>> {
  const bridge = window.desktopBridge?.sshFileOperation;
  if (!bridge) throw new Error("SSH 操作不可用");
  const output = await bridge({
    target,
    cwd: "~",
    relativePath: "",
    operation,
    ...(computer ? { computer } : {}),
    ...(path === undefined ? {} : { path }),
  });
  return JSON.parse(output) as ComputerResult<T>;
}
