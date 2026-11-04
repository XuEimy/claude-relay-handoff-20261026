import { SidebarHeaderIconButton } from "./SidebarThreadHeader";
import { toastManager } from "../ui/toast";
import { useState, type ReactNode } from "react";
import {
  UploadIcon,
  CloudUploadIcon,
  FolderPlusIcon,
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  SearchIcon,
} from "lucide-react";
import {
  SidebarContent,
  SidebarGroup,
  SidebarInput,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "../ui/sidebar";

const files = [
  {
    path: "src/App.tsx",
    content: "export default function App() {\n  return <main>Welcome</main>;\n}",
  },
  { path: "src/styles.css", content: ":root {\n  color-scheme: dark;\n}" },
  { path: "public/logo.svg", content: '<svg viewBox="0 0 24 24">\n  <!-- 项目图标 -->\n</svg>' },
  { path: "package.json", content: '{\n  "name": "sample-project",\n  "version": "0.1.0"\n}' },
  { path: "README.md", content: "# Sample project\n\n从这里开始你的项目。" },
];

export function SidebarMockFiles({ viewTabs }: { viewTabs: ReactNode }) {
  const [query, setQuery] = useState("");
  const [folders, setFolders] = useState(["src", "public"]);
  const [expanded, setExpanded] = useState(["src"]);
  const [selected, setSelected] = useState<string | null>(null);
  const visible = files.filter((file) => file.path.toLowerCase().includes(query.toLowerCase()));
  const selectedFile = files.find((file) => file.path === selected);
  const fileRow = (file: (typeof files)[number], nested = false) => (
    <SidebarMenuItem key={file.path} className={nested ? "ml-4" : undefined}>
      <SidebarMenuButton
        size="sm"
        isActive={selected === file.path}
        onClick={() => setSelected(file.path)}
      >
        <FileIcon className="text-(--sidebar-icon-color)" />
        <span className="truncate">{query ? file.path : file.path.split("/").at(-1)}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
  return (
    <SidebarContent
      fixedHeader={
        <SidebarGroup>
          <div className="flex flex-col gap-1">
            <div className="flex items-center">
              {viewTabs}
              <div className="flex shrink-0 items-center">
                <SidebarHeaderIconButton
                  label="导入本地文件"
                  onClick={() =>
                    toastManager.add({
                      type: "info",
                      title: "导入本地文件",
                      description: "模拟操作：选择本地文件后，将添加到当前项目。",
                    })
                  }
                >
                  <UploadIcon />
                </SidebarHeaderIconButton>
                <SidebarHeaderIconButton
                  label="上传到云端"
                  onClick={() =>
                    toastManager.add({
                      type: "info",
                      title: "上传到云端",
                      description: "模拟操作：将选中的文件上传至 SSH 连接的服务器。",
                    })
                  }
                >
                  <CloudUploadIcon />
                </SidebarHeaderIconButton>
                <SidebarHeaderIconButton
                  label="新建文件夹"
                  onClick={() => {
                    const name = `新建文件夹${folders.length > 2 ? ` ${folders.length - 1}` : ""}`;
                    setFolders((current) => [...current, name]);
                    setExpanded((current) => [...current, name]);
                  }}
                >
                  <FolderPlusIcon />
                </SidebarHeaderIconButton>
              </div>
            </div>
            <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-within:bg-sidebar-row-hover focus-within:text-sidebar-foreground focus-within:ring-1 focus-within:ring-inset focus-within:ring-ring/70">
              <SearchIcon className="size-4 shrink-0 text-(--sidebar-icon-color)" />
              <SidebarInput
                nativeInput
                type="search"
                aria-label="搜索文件"
                placeholder="搜索文件"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </div>
        </SidebarGroup>
      }
    >
      <SidebarGroup>
        <div className="flex items-center justify-between px-2 pb-2 text-xs text-sidebar-muted-foreground">
          <span>sample-project</span>
        </div>
        <SidebarMenu aria-label="示例项目文件">
          {query ? (
            visible.map((file) => fileRow(file))
          ) : (
            <>
              {folders.map((folder) => {
                const open = expanded.includes(folder);
                const Icon = open ? FolderOpenIcon : FolderIcon;
                return (
                  <SidebarMenuItem key={folder}>
                    <SidebarMenuButton
                      size="sm"
                      aria-expanded={open}
                      onClick={() =>
                        setExpanded((current) =>
                          open ? current.filter((item) => item !== folder) : [...current, folder],
                        )
                      }
                    >
                      <ChevronRightIcon
                        className={
                          open
                            ? "rotate-90 text-(--sidebar-icon-color)"
                            : "text-(--sidebar-icon-color)"
                        }
                      />
                      <Icon className="text-(--sidebar-icon-color)" />
                      <span>{folder}</span>
                    </SidebarMenuButton>
                    {open ? (
                      <SidebarMenu>
                        {files
                          .filter((file) => file.path.startsWith(`${folder}/`))
                          .map((file) => fileRow(file, true))}
                      </SidebarMenu>
                    ) : null}
                  </SidebarMenuItem>
                );
              })}
              {files.filter((file) => !file.path.includes("/")).map((file) => fileRow(file))}
            </>
          )}
        </SidebarMenu>
        {visible.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">未找到文件</p>
        ) : null}
        {selectedFile ? (
          <div className="mt-5 border-t border-sidebar-border pt-3">
            <p className="truncate px-2 text-xs text-muted-foreground">
              {selectedFile.path} · 预览
            </p>
            <pre className="mt-2 overflow-x-auto px-2 text-xs leading-relaxed text-sidebar-foreground">
              <code>{selectedFile.content}</code>
            </pre>
          </div>
        ) : null}
      </SidebarGroup>
    </SidebarContent>
  );
}
