export const MAX_CLOUD_UPLOAD_BYTES = 32 * 1024 * 1024;

export function validateCloudRelativePath(path: string): string {
  if (
    !path ||
    path.split("/").some((part) => !part || part === "." || part === ".." || /[\\\0]/u.test(part))
  )
    throw new Error("文件名或路径无效");
  return path;
}

export function encodeCloudFile(file: File): Promise<string> {
  if (file.size > MAX_CLOUD_UPLOAD_BYTES)
    return Promise.reject(new Error(`${file.name} 超过 32 MB，请使用 SFTP 传输大文件。`));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`无法读取 ${file.name}`));
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(file);
  });
}

export async function collectDroppedCloudFiles(
  transfer: DataTransfer,
): Promise<Array<{ file: File; path: string }>> {
  const result: Array<{ file: File; path: string }> = [];
  const visit = async (entry: FileSystemEntry, parent: string) => {
    const path = validateCloudRelativePath(parent ? `${parent}/${entry.name}` : entry.name);
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      );
      result.push({ file, path });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      while (true) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
          reader.readEntries(resolve, reject),
        );
        if (!batch.length) break;
        for (const child of batch) await visit(child, path);
      }
    }
  };
  const entries = [...transfer.items]
    .filter((item) => item.kind === "file")
    .map((item) => ({ entry: item.webkitGetAsEntry(), file: item.getAsFile() }));
  for (const { entry, file } of entries) {
    if (entry) await visit(entry, "");
    else if (file) result.push({ file, path: validateCloudRelativePath(file.name) });
  }
  if (!entries.length)
    for (const file of transfer.files)
      result.push({ file, path: validateCloudRelativePath(file.name) });
  return result;
}
