import { sshTargetKey } from "@t3tools/client-runtime/connection";
import type {
  DesktopSshEnvironmentProgress,
  DesktopSshEnvironmentTarget,
} from "@t3tools/contracts";
import { useEffect, useState } from "react";

export interface SshConnectionLine {
  key: string;
  text: string;
  detail?: string;
  progress?: number;
}

export function useSshConnectionProgress(target: DesktopSshEnvironmentTarget | null) {
  const key = target === null ? null : sshTargetKey(target);
  const [state, setState] = useState<{
    key: string | null;
    latest: DesktopSshEnvironmentProgress | null;
  }>({ key, latest: null });
  if (state.key !== key) setState({ key, latest: null });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- subscribes to native SSH progress for the selected target
  useEffect(() => {
    if (key === null) return;
    return window.desktopBridge?.onSshEnvironmentProgress?.((event) => {
      if (sshTargetKey(event.target) === key) setState({ key, latest: event });
    });
  }, [key]);

  return state.key === key ? state.latest : null;
}

export function sshProgressLine(event: DesktopSshEnvironmentProgress): SshConnectionLine {
  switch (event.step) {
    case "resolving":
      return { key: event.step, text: `正在解析服务器地址 ${event.target.hostname}…` };
    case "checking-runtime":
      return { key: event.step, text: "正在检查服务器环境…" };
    case "runtime-current":
      return { key: event.step, text: "云端运行程序已是最新" };
    case "uploading-runtime": {
      const progress = event.totalBytes > 0 ? Math.min(1, event.sentBytes / event.totalBytes) : 1;
      const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
      return {
        key: event.step,
        text: `正在上传云端运行程序 ${Math.floor(progress * 100)}%`,
        detail: `${mb(event.sentBytes)} / ${mb(event.totalBytes)} MB`,
        progress,
      };
    }
    case "starting-server":
      return { key: event.step, text: "正在启动远端服务…" };
    case "server-ready":
      return { key: event.step, text: "远端服务已就绪" };
    case "reusing-tunnel":
      return { key: event.step, text: "复用已有的加密通道" };
    case "opening-tunnel":
      return { key: event.step, text: "正在建立加密通道…" };
    case "issuing-pairing":
      return { key: event.step, text: "正在签发安全凭证…" };
    case "ready":
      return { key: event.step, text: "正在验证身份并建立会话…" };
  }
}
