import { randomUUID } from "../../lib/utils";
import { useEffect, useRef, type DragEvent } from "react";
import * as Option from "effect/Option";
import type { EnvironmentId } from "@t3tools/contracts";
import { useEnvironments } from "../../state/environments";
import { toastManager } from "../ui/toast";
import { collectDroppedCloudFiles, encodeCloudFile } from "../sidebar/cloudFileUpload";
import {
  CLOUD_FILE_DRAG_TYPE,
  readCloudFileDrag,
  quoteTerminalFilePath,
} from "../chat/cloudFileDrag";

export function useTerminalFileDrop({
  environmentId,
  cwd,
  canWrite,
  paste,
}: {
  environmentId: EnvironmentId;
  cwd: string;
  canWrite: boolean;
  paste: (text: string) => Promise<void>;
}) {
  const { environments } = useEnvironments();
  const environment = environments.find((item) => item.environmentId === environmentId);
  const profile = environment ? Option.getOrNull(environment.entry.profile) : null;
  const busy = useRef(false);
  const lifetime = useRef<object | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- prevents an upload completion from pasting into a terminal after its workspace is disposed
  useEffect(() => {
    lifetime.current = { environmentId, cwd };
    return () => {
      lifetime.current = null;
    };
  }, [environmentId, cwd]);
  const accepts = (event: DragEvent) =>
    event.dataTransfer.types.some((type) => type === "Files" || type === CLOUD_FILE_DRAG_TYPE);
  return {
    onDragOver: (event: DragEvent<HTMLDivElement>) => {
      if (!accepts(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect =
        canWrite && !busy.current
          ? event.dataTransfer.effectAllowed === "move"
            ? "move"
            : "copy"
          : "none";
    },
    onDrop: (event: DragEvent<HTMLDivElement>) => {
      if (!accepts(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!canWrite || busy.current) return;
      const transfer = event.dataTransfer;
      const cloud = transfer.types.includes(CLOUD_FILE_DRAG_TYPE)
        ? transfer.getData(CLOUD_FILE_DRAG_TYPE)
        : null;
      const localFiles = Array.from(transfer.files);
      const uploads =
        cloud === null && profile?._tag === "SshConnectionProfile"
          ? collectDroppedCloudFiles(transfer)
          : null;
      const owner = lifetime.current;
      busy.current = true;
      void (async () => {
        try {
          const paths: string[] = [];
          if (cloud !== null) {
            paths.push(...readCloudFileDrag(cloud, environmentId));
          } else if (uploads && profile?._tag === "SshConnectionProfile") {
            const bridge = window.desktopBridge;
            if (!bridge?.sshFileOperation) throw new Error("当前客户端不支持上传到云端终端");
            const files = await uploads;
            if (!files.length) throw new Error("没有可上传的文件");
            toastManager.add({
              type: "info",
              title: `正在上传 ${files.length} 个文件到终端工作目录`,
            });
            const destination = `.kelaodeyun-uploads/${randomUUID()}`;
            for (const { file, path } of files) {
              if (lifetime.current !== owner) return;
              quoteTerminalFilePath(path);
              const relativePath = `${destination}/${path}`;
              await bridge.sshFileOperation({
                target: profile.target,
                cwd,
                relativePath,
                operation: "upload",
                contentsBase64: await encodeCloudFile(file),
              });
              paths.push(`${cwd.replace(/\/+$/, "")}/${relativePath}`);
            }
          } else {
            if (
              environment?.entry.target._tag !== "PrimaryConnectionTarget" ||
              !window.desktopBridge?.getPathForFile
            )
              throw new Error("此连接不支持直接引用本机路径，请使用 SSH 云电脑或本机终端。");
            for (const file of localFiles) {
              const path = window.desktopBridge.getPathForFile(file);
              if (!path) throw new Error("无法读取本机文件路径");
              paths.push(path);
            }
          }
          if (!paths.length || lifetime.current !== owner) return;
          await paste(`${paths.map(quoteTerminalFilePath).join(" ")} `);
        } catch (error) {
          toastManager.add({
            type: "error",
            title: "无法拖入终端",
            description: error instanceof Error ? error.message : "文件处理失败",
          });
        } finally {
          busy.current = false;
        }
      })();
    },
  };
}
