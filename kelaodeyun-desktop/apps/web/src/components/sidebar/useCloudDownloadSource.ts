import type { DesktopSshEnvironmentTarget } from "@t3tools/contracts";
import { useEffect, useState } from "react";

export function useCloudDownloadSource(
  target: DesktopSshEnvironmentTarget,
  cwd: string,
  connected: boolean,
) {
  const { alias, hostname, username, port } = target;
  const key = JSON.stringify([alias, hostname, username, port, cwd, connected]);
  const [sourceState, setSourceState] = useState<{ key: string; url: string } | null>(null);
  const [errorState, setErrorState] = useState<{ key: string; text: string } | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Registers a native download source for this SSH workspace and releases its socket/listener when it changes.
  useEffect(() => {
    const bridge = window.desktopBridge;
    if (!connected || !bridge?.registerCloudDownloadSource) return;
    let active = true;
    let source: string | null = null;
    const unsubscribe = bridge.onCloudDownloadStatus?.((status) => {
      if (!active || status.source !== source) return;
      if (status.state === "downloading") setErrorState(null);
      if (status.state === "failed")
        setErrorState({
          key,
          text: `下载失败：${status.path}。请检查 SSH 连接、读取权限及符号链接。当前内置传输上限为 32 MB，更大的文件可通过 SFTP 下载。`,
        });
    });
    void bridge
      .registerCloudDownloadSource({
        target: { alias, hostname, username, port },
        cwd,
        relativePath: "",
        operation: "download",
      })
      .then((value) => {
        if (!active) {
          void bridge.releaseCloudDownloadSource?.(value);
          return;
        }
        source = value;
        setSourceState({ key, url: value });
      })
      .catch(() => {
        if (active) setErrorState({ key, text: "文件拖拽下载暂不可用，请重新连接云电脑。" });
      });
    return () => {
      active = false;
      unsubscribe?.();
      if (source) void bridge.releaseCloudDownloadSource?.(source);
    };
  }, [alias, hostname, username, port, cwd, connected, key]);
  return {
    url: sourceState?.key === key ? sourceState.url : null,
    error: errorState?.key === key ? errorState.text : "",
  };
}
