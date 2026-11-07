import type { ClientSettingsPatch, DesktopSnapShotState, SnapShotSound } from "@t3tools/contracts";
import {
  captureSetupBackend,
  captureSetupDesktopName,
  captureSetupAccessReady,
  captureSetupMacPermissionsReady,
} from "./SnapShotSetupDialog.logic";

export function snapShotStatus(state: DesktopSnapShotState | null, enabled: boolean): string {
  if (!state) return "正在检查截图…";
  if (state.mode === "unavailable") return state.message ?? "此平台不支持截图。";
  if (!enabled) return "请开启此功能以设置截图。";
  return snapShotSetupSummary(state, enabled);
}

export function snapShotSetupSummary(state: DesktopSnapShotState, enabled: boolean): string {
  if (state.message) return "截图需要处理";
  if (state.linuxBackend === "hyprland" && state.hyprlandHelper?.status !== "ready")
    return state.hyprlandHelper?.status === "error"
      ? "请在设置中检查截图权限"
      : "请安装截图助手后继续";
  if (captureSetupBackend(state) === "gnome" && state.gnomeExtension?.status !== "enabled")
    return "设置当前窗口截图";
  if (captureSetupBackend(state) === "kde" && state.kdeHelper?.status !== "ready")
    return state.kdeHelper?.status === "error"
      ? "请在设置中检查截图权限"
      : "请安装截图助手后继续";
  if (captureSetupBackend(state) === "picker")
    return "仅支持手动截图，每次都需选择窗口";
  if (!enabled) return "请启用截图后继续";
  if (state.shortcutPending)
    return state.linuxBackend === "hyprland"
      ? "正在连接快捷键…"
      : "正在等待快捷键权限";
  if (state.shortcutVerified) return "截图已就绪";
  if (state.linuxBackend === "niri" && state.shortcutBinding)
    return "请在其他应用中使用快捷键";
  if (state.linuxBackend === "hyprland" && state.shortcutActionRegistered)
    return "请在其他应用中使用快捷键";
  if (state.shortcutRegistered) return state.shortcutLabel ? "截图已就绪" : "快捷键已保存";
  return "完成快捷键设置";
}

export function snapShotShortcutStatus(state: DesktopSnapShotState | null): string | null {
  if (!state) return null;
  if (state.linuxBackend === "hyprland") return state.shortcutMessage;
  if (state.shortcutPending) return "请批准快捷键权限提示后继续。";
  if (state.shortcutRegistered) return state.mode === "portal" ? null : "快捷键已保存。";
  return state.shortcutMessage;
}

export function snapShotSetupButtonLabel(state: DesktopSnapShotState | null): string {
  if (!state) return "继续设置";
  if (captureSetupAccessReady(state)) return "管理截图";
  const desktop = captureSetupDesktopName(state);
  return desktop ? `设置 ${desktop} 截图` : "继续设置";
}

export function snapShotSetupComplete(
  state: DesktopSnapShotState | null,
  includeAccessibility: boolean,
): boolean {
  if (state?.windows) return true;
  return (
    state?.macPermissions !== undefined &&
    captureSetupAccessReady(state) &&
    captureSetupMacPermissionsReady(state, includeAccessibility) &&
    state.shortcutRegistered
  );
}

export type SnapShotSoundSelection = SnapShotSound | "off";

export function snapShotFeedbackUnavailableMessage(
  state: DesktopSnapShotState | null,
): string | undefined {
  if (state?.mode !== "portal" || state.linuxFeedbackAvailable) return undefined;
  if (state.linuxBackend === "hyprland")
    return state.hyprlandHelper?.status === "ready"
      ? "此桌面不支持截图效果。"
      : "请安装或更新截图助手以启用效果。";
  if (state.linuxBackend === "niri") return "Niri 不支持截图效果。";
  if (state.linuxBackend === "kde")
    return state.kdeHelper?.status === "ready"
      ? "此桌面不支持截图效果。"
      : "请安装或更新截图助手以启用效果。";
  return state.linuxBackend === "gnome-extension"
    ? "请更新 GNOME 扩展，然后注销并重新登录以启用效果。"
    : captureSetupBackend(state) === "gnome"
      ? "请完成扩展设置以启用效果。"
      : "此桌面不支持截图效果。";
}

export function snapShotDescription(state: DesktopSnapShotState | null): string {
  return state?.mode === "portal" && captureSetupBackend(state) === "picker"
    ? "此处不支持自动截图，请选择窗口。"
    : "截取窗口并附加到当前草稿。";
}

export function snapShotAccessibilityUnavailableMessage(
  state: DesktopSnapShotState | null,
): string | undefined {
  if (state?.mode !== "portal") return undefined;
  if (state.linuxBackend === "picker" || state.linuxBackend === "screenshot-portal")
    return "此桌面仅提供截图。";
  return undefined;
}

export function snapShotUnavailableMessage(hasBridge: boolean): string | undefined {
  if (hasBridge) return undefined;
  return typeof window !== "undefined" && window.desktopBridge
    ? "请更新桌面应用以使用截图。"
    : "仅在桌面应用中可用。";
}

export function snapShotSoundPatch(sound: SnapShotSoundSelection): ClientSettingsPatch {
  return sound === "off"
    ? { snapShotPlaySound: false }
    : { snapShotPlaySound: true, snapShotSound: sound };
}

export function createRecordingRequestTracker() {
  let currentRequest: symbol | null = null;

  return {
    tryBegin() {
      if (currentRequest) return null;
      currentRequest = Symbol();
      return currentRequest;
    },
    clear() {
      currentRequest = null;
    },
    owns(request: symbol) {
      return currentRequest === request;
    },
  };
}
