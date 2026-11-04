import type { ClientSettings } from "@t3tools/contracts";

// Ids are stored in client settings, so never rename one.
export const THREAD_DETAILS_ITEMS = [
  { id: "environment", label: "环境与工作树", defaultVisible: true },
  { id: "openIn", label: "在编辑器中打开", defaultVisible: true },
  { id: "scripts", label: "项目脚本", defaultVisible: true },
  { id: "branch", label: "分支与拉取请求", defaultVisible: true },
  { id: "gitActions", label: "Git 操作", defaultVisible: true },
  { id: "changes", label: "变更", defaultVisible: true },
  { id: "servers", label: "服务器", defaultVisible: true },
  { id: "automations", label: "自动化任务", defaultVisible: true },
  { id: "lineage", label: "会话关系", defaultVisible: true },
  { id: "sideChats", label: "侧边对话", defaultVisible: true },
  { id: "usage", label: "用量限制", defaultVisible: false },
  { id: "context", label: "上下文窗口", defaultVisible: false },
] as const;

export type ThreadDetailsItemId = (typeof THREAD_DETAILS_ITEMS)[number]["id"];
export type ThreadDetailsVisibility = Readonly<Record<ThreadDetailsItemId, boolean>>;

type ThreadDetailsItem = (typeof THREAD_DETAILS_ITEMS)[number];
type ThreadDetailsItemSettings = Pick<
  ClientSettings,
  "threadDetailsItems" | "threadDetailsUsageEnabled"
>;

// People who turned on the retired Labs toggle keep Usage and Context until they change them here.
function defaultVisible(item: ThreadDetailsItem, settings: ThreadDetailsItemSettings) {
  return item.id === "usage" || item.id === "context"
    ? settings.threadDetailsUsageEnabled
    : item.defaultVisible;
}

export function resolveThreadDetailsVisibility(
  settings: ThreadDetailsItemSettings,
): ThreadDetailsVisibility {
  return Object.fromEntries(
    THREAD_DETAILS_ITEMS.map((item) => [
      item.id,
      settings.threadDetailsItems[item.id] ?? defaultVisible(item, settings),
    ]),
  ) as Record<ThreadDetailsItemId, boolean>;
}

/** Stores only choices that differ from the default, so a later default change reaches everyone else. */
export function setThreadDetailsItem(
  settings: ThreadDetailsItemSettings,
  item: ThreadDetailsItem,
  visible: boolean,
): ClientSettings["threadDetailsItems"] {
  const { [item.id]: _previous, ...rest } = settings.threadDetailsItems;
  return visible === defaultVisible(item, settings) ? rest : { ...rest, [item.id]: visible };
}

export function isDefaultThreadDetailsVisibility(visibility: ThreadDetailsVisibility) {
  return THREAD_DETAILS_ITEMS.every((item) => visibility[item.id] === item.defaultVisible);
}

/** Also clears the retired Labs flag, so Usage and Context return to off. */
export const RESET_THREAD_DETAILS_ITEMS = {
  threadDetailsItems: {},
  threadDetailsUsageEnabled: false,
} satisfies Partial<ClientSettings>;
