import theme from "./materialIconTheme.json";

export function materialFileIcon(
  path: string,
  directory = false,
  expanded = false,
  root = false,
  light = false,
) {
  const name = path.replace(/\/+$/, "").split("/").at(-1)?.toLowerCase() ?? "";
  const names: Record<string, string> = directory
    ? root
      ? expanded
        ? theme.rootFolderNamesExpanded
        : theme.rootFolderNames
      : expanded
        ? theme.folderNamesExpanded
        : theme.folderNames
    : theme.fileNames;
  const lightNames: Record<string, string> = directory
    ? root
      ? expanded
        ? theme.light.rootFolderNamesExpanded
        : theme.light.rootFolderNames
      : expanded
        ? theme.light.folderNamesExpanded
        : theme.light.folderNames
    : theme.light.fileNames;
  if (light && lightNames[name]) return lightNames[name];
  if (names[name]) return names[name];
  if (directory)
    return root
      ? expanded
        ? theme.rootFolderExpanded
        : theme.rootFolder
      : expanded
        ? theme.folderExpanded
        : theme.folder;
  const extensions: Record<string, string> = theme.fileExtensions;
  const lightExtensions: Record<string, string> = theme.light.fileExtensions;
  const parts = name.split(".");
  for (let index = 1; index < parts.length; index++) {
    const suffix = parts.slice(index).join(".");
    if (light && lightExtensions[suffix]) return lightExtensions[suffix];
    if (extensions[suffix]) return extensions[suffix];
  }
  return theme.file;
}

export function MaterialFileIcon({
  path,
  directory = false,
  expanded = false,
  root = false,
}: {
  path: string;
  directory?: boolean;
  expanded?: boolean;
  root?: boolean;
}) {
  const dark = materialFileIcon(path, directory, expanded, root);
  const light = materialFileIcon(path, directory, expanded, root, true);
  const icon = (name: string | undefined) =>
    `${import.meta.env.BASE_URL}icons/material/${name ?? "file"}.svg`;
  return (
    <span className="inline-flex size-4 shrink-0" aria-hidden="true">
      <img
        src={icon(light)}
        alt=""
        draggable={false}
        className={light === dark ? "size-4" : "size-4 dark:hidden"}
      />
      {light !== dark ? (
        <img src={icon(dark)} alt="" draggable={false} className="hidden size-4 dark:block" />
      ) : null}
    </span>
  );
}
