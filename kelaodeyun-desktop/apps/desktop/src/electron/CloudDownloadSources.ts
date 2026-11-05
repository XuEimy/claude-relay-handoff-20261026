import * as Electron from "electron";
import { createCloudDownloadSource } from "./CloudDownloadSource.ts";
import { CLOUD_DOWNLOAD_STATUS_CHANNEL } from "../ipc/channels.ts";

const sources = new Map<string, { owner: number; close: () => void }>();

export async function registerCloudDownloadSource(
  owner: number,
  read: (path: string, directory: boolean) => Promise<string>,
) {
  const sender = Electron.webContents.fromId(owner);
  if (!sender || sender.isDestroyed()) throw new Error("窗口已关闭");
  const source = await createCloudDownloadSource(
    read,
    (status) => {
      if (!sender.isDestroyed())
        sender.send(CLOUD_DOWNLOAD_STATUS_CHANNEL, { ...status, source: source.url });
    },
    async (path) => {
      if (sender.isDestroyed()) return false;
      const options: Electron.MessageBoxOptions = {
        type: "question",
        title: "下载文件夹",
        message: `下载文件夹“${path === "." ? "当前项目" : path.split("/").at(-1)}”？`,
        detail:
          "文件夹将打包为 ZIP 压缩包，保存到刚才拖入的位置。包含子文件夹及隐藏文件；总文件大小上限 32 MB。包含符号链接或无法读取的文件时会停止并提示失败。",
        buttons: ["取消", "下载"],
        defaultId: 1,
        cancelId: 0,
        noLink: true,
      };
      const window = Electron.BrowserWindow.fromWebContents(sender);
      const result = window
        ? await Electron.dialog.showMessageBox(window, options)
        : await Electron.dialog.showMessageBox(options);
      return result.response === 1;
    },
  );
  if (sender.isDestroyed()) {
    source.close();
    throw new Error("窗口已关闭");
  }
  const close = () => {
    sources.delete(source.url);
    sender.removeListener("destroyed", close);
    source.close();
  };
  sources.set(source.url, { owner, close });
  sender.once("destroyed", close);
  return source.url;
}

export function releaseCloudDownloadSource(owner: number, url: string) {
  const source = sources.get(url);
  if (source?.owner === owner) source.close();
}
