import { useState } from "react";
import { APP_BASE_NAME } from "~/branding";

import {
  desktopCliCommandStateAtom,
  getDesktopCliCommandBridge,
  refreshDesktopCliCommandState,
} from "~/state/desktopCliCommand";
import { useEnvironmentQuery } from "~/state/query";
import { Button } from "../ui/button";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

export function CliCommandSettingsRow() {
  const bridge = getDesktopCliCommandBridge();
  const query = useEnvironmentQuery(bridge ? desktopCliCommandStateAtom : null);
  const state = query.data;
  const [pending, setPending] = useState(false);

  const change = (action: "install" | "uninstall") => {
    if (!bridge || pending) return;
    setPending(true);
    void bridge[action]()
      .then(refreshDesktopCliCommandState)
      .catch((error: unknown) => {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title:
              action === "install" ? "无法安装 kelaodeyun" : "无法移除 kelaodeyun",
            description: error instanceof Error ? error.message : "发生错误。",
          }),
        );
      })
      .finally(() => setPending(false));
  };

  if (!bridge || !state?.supported) return null;
  const installed = state.installedPath !== null;
  const description = state.shadowedBy
    ? `另一个位于 ${state.shadowedBy} 的 kelaodeyun 会在新终端中优先运行。请移除它以使用 ${APP_BASE_NAME} 的命令。`
    : !installed
      ? `在任意终端运行 \`kelaodeyun\` 以使用 ${APP_BASE_NAME} 命令行工具。`
      : state.onPath
        ? `已安装到 ${state.installedPath}，请打开新终端以使用。`
        : `已安装到 ${state.installedPath}，但尚未添加到 PATH。请将其目录添加到 PATH 后运行 \`kelaodeyun\`。`;

  return (
    <SettingsRow
      {...searchableSetting("cli-command")}
      description={description}
      control={
        <Button
          size="sm"
          variant="outline"
          disabled={pending || query.isPending || (!installed && Boolean(state.shadowedBy))}
          onClick={() => change(installed ? "uninstall" : "install")}
        >
          {installed ? "移除" : "安装"}
        </Button>
      }
    />
  );
}
