export const CLOUD_FILE_DRAG_TYPE = "application/x-kelaodeyun-cloud-file";

export function readCloudFileDrag(data: string, environmentId: string): string[] {
  const value: unknown = JSON.parse(data);
  if (
    !value ||
    typeof value !== "object" ||
    !("environmentId" in value) ||
    value.environmentId !== environmentId
  )
    throw new Error("文件来自另一台云电脑，请切换到对应工作区后再拖入。");
  const paths = "paths" in value ? value.paths : "path" in value ? [value.path] : [];
  if (
    !Array.isArray(paths) ||
    !paths.length ||
    paths.some(
      (path) =>
        typeof path !== "string" || !path.startsWith("/") || /[\u0000-\u001f\u007f]/u.test(path),
    )
  )
    throw new Error("文件路径无效");
  return paths;
}

export function quoteTerminalFilePath(path: string): string {
  if (!path || /[\u0000-\u001f\u007f]/u.test(path))
    throw new Error("文件路径包含不可输入终端的控制字符");
  return `'${path.replaceAll("'", "'\\''")}'`;
}

export function setCloudDownloadDragData(
  transfer: Pick<DataTransfer, "setData">,
  source: string,
  path: string,
  directory = false,
  displayName?: string,
) {
  const url = new URL(source);
  url.searchParams.set("path", path);
  if (directory) url.searchParams.set("directory", "1");
  const name = (displayName || path.split("/").at(-1) || "download").replaceAll(":", "_");
  transfer.setData(
    "DownloadURL",
    `application/octet-stream:${name}${directory ? ".zip" : ""}:${url.href}`,
  );
}
