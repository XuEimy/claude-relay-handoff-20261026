import { HOSTED_APP_CHANNEL } from "~/branding";
import { isElectron, isSecretsFeatureEnabled } from "~/env";
import { isMacPlatform, isWindowsPlatform, normalizeSearchText } from "~/lib/utils";
import { STATIC_KEYBINDING_COMMANDS, type KeybindingCommand } from "@t3tools/contracts";
import type { EnvironmentId } from "@t3tools/contracts";
import type { EnvironmentConnectionPhase } from "@t3tools/client-runtime/connection";
import {
  sourceControlClients,
  type SourceControlDefinition,
} from "@t3tools/client-runtime/source-control-clients";
import { DEFAULT_KEYBINDINGS } from "@t3tools/shared/keybindings";
import * as Schema from "effect/Schema";
import { TYPOGRAPHY_ADVANCED_STORAGE_KEY } from "../../appearanceFonts";
import { writeLocalStorageValue } from "../../hooks/useLocalStorage";
import { commandLabel } from "./KeybindingsSettings.logic";
import type { ResolvedSettingsScope } from "./settingsScope";

export type SettingsPath =
  | "/settings/profile"
  | "/settings/projects"
  | "/settings/general"
  | "/settings/diagnostics"
  | "/settings/appearance"
  | "/settings/chat"
  | "/settings/diffs"
  | "/settings/keybindings"
  | "/settings/snap-shot"
  | "/settings/providers"
  | "/settings/threads"
  | "/settings/browser"
  | "/settings/devices"
  | "/settings/scheduled-tasks"
  | "/settings/source-control"
  | "/settings/worktrees"
  | "/settings/connections"
  | "/settings/access"
  | "/settings/secrets"
  | "/settings/maintenance"
  | "/settings/labs"
  | "/settings/about"
  | "/settings/archived";

export type SettingsSearchScope =
  | "environment"
  | "environment-defaults"
  | "project-defaults"
  | "project"
  | "checkout"
  | "connections";

export interface SettingsSearchItem {
  readonly id: string;
  readonly title: string;
  readonly to: SettingsPath;
  readonly targetId?: string;
  readonly searchTerms?: ReadonlyArray<string>;
  readonly scope?: SettingsSearchScope;
  readonly desktopOnly?: boolean;
  readonly macOnly?: boolean;
  readonly windowsOnly?: boolean;
  readonly releaseChannelOnly?: boolean;
  readonly secretsFeatureOnly?: boolean;
  readonly cloudOnly?: boolean;
  readonly environmentOnly?: boolean;
  readonly providerSettingsOnly?: boolean;
  readonly macProviderSettingsOnly?: boolean;
  readonly localBackendManagementOnly?: boolean;
  readonly localEnvironmentOnly?: boolean;
  readonly wslAvailableOnly?: boolean;
  readonly managedTunnelOnly?: boolean;
  readonly peerLinksOnly?: boolean;
  readonly secondary?: boolean;
  readonly requiresThreadAutoSettlement?: boolean;
}

export interface SettingsSearchAvailability {
  readonly localEnvironmentDisabled?: boolean;
  readonly hasCloudPublicConfig: boolean;
  readonly hasEnvironment: boolean;
  readonly hasProviderSettingsEnvironment: boolean;
  readonly hasMacProviderSettingsEnvironment: boolean;
  readonly canManageLocalBackend: boolean;
  readonly isWslSettingsRowVisible: boolean;
  readonly hasThreadAutoSettlement: boolean;
  readonly managedTunnelActive?: boolean;
  readonly hasPeerLinkHost?: boolean;
}

export const SETTINGS_SECTION_LABELS: Readonly<Record<SettingsPath, string>> = {
  "/settings/diagnostics": "诊断",
  "/settings/projects": "项目",
  "/settings/profile": "个人资料",
  "/settings/general": "通用",
  "/settings/appearance": "外观",
  "/settings/chat": "对话",
  "/settings/diffs": "差异与拉取请求",
  "/settings/keybindings": "快捷键",
  "/settings/snap-shot": "快照",
  "/settings/providers": "模型服务",
  "/settings/threads": "会话",
  "/settings/browser": "浏览器",
  "/settings/devices": "设备",
  "/settings/scheduled-tasks": "定时任务",
  "/settings/source-control": "源代码管理",
  "/settings/worktrees": "工作树",
  "/settings/connections": "环境",
  "/settings/access": "分享与访问",
  "/settings/secrets": "Secrets",
  "/settings/maintenance": "维护",
  "/settings/labs": "实验功能",
  "/settings/about": "关于",
  "/settings/archived": "归档",
};

/** Sidebar order. A group without a heading is set apart by space alone. */
export const SETTINGS_NAV_GROUPS: ReadonlyArray<{
  readonly heading: string | null;
  readonly paths: ReadonlyArray<SettingsPath>;
}> = [
  {
    heading: null,
    paths: [
      "/settings/profile",
      "/settings/general",
      "/settings/appearance",
      "/settings/chat",
      "/settings/diffs",
      "/settings/keybindings",
      "/settings/snap-shot",
    ],
  },
  {
    heading: "智能体",
    paths: [
      "/settings/providers",
      "/settings/threads",
      "/settings/browser",
      "/settings/devices",
      "/settings/scheduled-tasks",
    ],
  },
  {
    heading: "代码",
    paths: ["/settings/projects", "/settings/source-control", "/settings/worktrees"],
  },
  {
    heading: "连接",
    paths: [
      "/settings/connections",
      "/settings/access",
      ...(isSecretsFeatureEnabled ? (["/settings/secrets"] as const) : []),
    ],
  },
  {
    heading: null,
    paths: ["/settings/maintenance", "/settings/labs", "/settings/about", "/settings/archived"],
  },
];

export function keybindingSearchAnchorId<Command extends KeybindingCommand>(command: Command) {
  return `keybinding-${command}` as const;
}

const KEYBINDING_SEARCH_ITEMS = STATIC_KEYBINDING_COMMANDS.toSorted((left, right) =>
  commandLabel(left).localeCompare(commandLabel(right)),
).map((command) => {
  const defaultKeys = DEFAULT_KEYBINDINGS.filter((binding) => binding.command === command).map(
    (binding) => binding.key,
  );
  return {
    id: keybindingSearchAnchorId(command),
    title: commandLabel(command),
    to: "/settings/keybindings" as const,
    searchTerms: [command, ...defaultKeys],
    secondary: true,
    ...(defaultKeys.length === 0 ? { targetId: "keybindings" } : {}),
  };
});

export function sourceControlHostSettingsSearchId(kind: string) {
  return `source-control-host-${kind}` as const;
}

/** Each host's own settings: its accounts and token, or the fields of its settings form. */
export function sourceControlHostSearchItems(
  definitions: ReadonlyArray<SourceControlDefinition>,
): ReadonlyArray<
  SettingsSearchItem & { readonly id: ReturnType<typeof sourceControlHostSettingsSearchId> }
> {
  return definitions.flatMap((definition) => {
    if (!definition.settings) return [];
    const names = [definition.label, ...(definition.searchKeywords ?? [])].join(" ");
    const { credentials } = definition;
    return [
      {
        id: sourceControlHostSettingsSearchId(definition.kind),
        title: credentials
          ? `${definition.label} accounts and token`
          : `${definition.label} credentials`,
        to: "/settings/source-control" as const,
        searchTerms: [
          credentials
            ? `${names} ${credentials.cliName} account login user host switch multiple accounts disable sign in token personal access token pat api key credential`
            : `${names} ${Object.keys(definition.settings.fields).join(" ")} token credentials sign in`,
        ],
        environmentOnly: true,
        scope: "environment-defaults" as const,
      },
    ];
  });
}

/** For settings that apply to every host. */
const SOURCE_CONTROL_HOST_LABELS = sourceControlClients.definitions
  .map((definition) => definition.label)
  .join(" ");
const SOURCE_CONTROL_HOST_TERMS = sourceControlClients.definitions
  .flatMap((definition) => [definition.label, ...(definition.searchKeywords ?? [])])
  .join(" ");

export const SETTINGS_SEARCH_ITEMS = [
  {
    id: "storage-worktree-keep-when",
    targetId: "storage-worktrees",
    title: "保留有本地变更的工作树",
    to: "/settings/worktrees",
    scope: "project-defaults",
    searchTerms: [
      "any local files uncommitted changes edited tracked files ignored env build output cleanup",
    ],
  },
  {
    id: "storage-delete-now",
    title: "立即删除",
    to: "/settings/maintenance",
    scope: "environment-defaults",
    searchTerms: ["storage cleanup run now results report removed kept failed"],
  },
  {
    id: "storage-worktrees",
    title: "工作树清理",
    to: "/settings/worktrees",
    scope: "project-defaults",
    searchTerms: [
      "disk storage automatic delete deleted archived threads old inactive merged settled unchanged worktrees retention days project inherit off custom",
    ],
  },
  {
    id: "storage-worktrees-location",
    title: "工作树位置",
    to: "/settings/worktrees",
    scope: "environment-defaults",
    searchTerms: ["worktree location folder directory path drive external disk"],
  },
  {
    id: "storage-artifacts",
    title: "产物与日志",
    to: "/settings/maintenance",
    scope: "environment-defaults",
    searchTerms: [
      "disk storage delete old browser artifacts screenshots captures rotated logs cleanup retention",
    ],
  },
  {
    id: "project-defaults",
    title: "项目默认值与单独设置",
    to: "/settings/threads",
    scope: "project-defaults",
    searchTerms: ["model workspace environments projects inheritance checkout"],
  },
  {
    id: "project-overview",
    title: "项目概览",
    to: "/settings/projects",
    searchTerms: ["name icon emoji image checkout remove delete"],
  },
  {
    id: "default-model",
    title: "默认模型",
    to: "/settings/threads",
    scope: "project-defaults",
    searchTerms: ["new thread project provider reasoning effort"],
  },
  {
    id: "fallback-model",
    title: "备用模型",
    to: "/settings/threads",
    scope: "environment-defaults",
    searchTerms: ["fallback agent provider out of usage new threads"],
    environmentOnly: true,
  },
  {
    id: "default-permissions",
    title: "权限",
    to: "/settings/threads",
    scope: "project-defaults",
    searchTerms: [
      "new thread default runtime mode supervised approvals auto accept edits full access",
    ],
  },
  {
    id: "color-scheme",
    title: "配色模式",
    to: "/settings/appearance",
    searchTerms: ["appearance light dark system mode"],
    targetId: "appearance",
  },
  {
    id: "theme",
    title: "主题",
    to: "/settings/appearance",
    searchTerms: ["appearance colors palette custom import"],
    targetId: "appearance",
  },
  {
    // Prefixed because the slider control already owns the `appearance-contrast` id.
    id: "setting-appearance-contrast",
    title: "对比度",
    to: "/settings/appearance",
    searchTerms: ["colors borders interface"],
  },
  {
    // Prefixed because the slider control already owns the `glass-opacity` id.
    id: "setting-glass-opacity",
    title: "玻璃效果不透明度",
    to: "/settings/appearance",
    searchTerms: ["transparent transparency solid menus dialogs composer"],
  },
  {
    id: "diff-color-scheme",
    title: "差异颜色",
    to: "/settings/diffs",
    searchTerms: ["red green blue orange additions deletions changes counts palette colorblind"],
  },
  {
    id: "chat-width",
    title: "对话宽度",
    to: "/settings/appearance",
    searchTerms: ["wide full width column layout messages composer monitor"],
  },
  {
    id: "effort-display",
    title: "思考强度显示",
    to: "/settings/appearance",
    searchTerms: ["reasoning effort thinking bars graph word label level composer"],
  },
  {
    id: "interactive-answers",
    title: "交互式回答",
    to: "/settings/appearance",
    searchTerms: ["intelligent ui artifacts sandpack react preview 交互 预览 尺子"],
  },
  {
    id: "math-rendering",
    title: "渲染数学公式",
    to: "/settings/appearance",
    searchTerms: ["latex tex katex equations formulas markdown"],
  },
  {
    id: "panel-animations",
    title: "面板动画",
    to: "/settings/appearance",
  },
  {
    id: "environment-identification",
    title: "环境标识",
    to: "/settings/appearance",
    searchTerms: ["dev nightly latest channel artwork pill label hide none"],
    targetId: "appearance-interface",
  },
  {
    id: "interface-font",
    title: "界面字体",
    to: "/settings/appearance",
    searchTerms: ["typography family size system sans"],
  },
  {
    id: "prompt-font",
    title: "提示词字体",
    to: "/settings/appearance",
    searchTerms: ["typography family size composer input"],
  },
  {
    id: "code-font",
    title: "代码字体",
    to: "/settings/appearance",
    searchTerms: ["typography family size monospace code blocks diffs file previews"],
  },
  {
    id: "terminal-font",
    title: "终端字体",
    to: "/settings/appearance",
    searchTerms: ["typography family size monospace output"],
  },
  {
    id: "separate-fonts",
    title: "分别设置字体",
    to: "/settings/appearance",
    searchTerms: ["typography advanced prompt code terminal font family size individually"],
  },
  {
    id: "font-smoothing",
    title: "字体平滑",
    to: "/settings/appearance",
    searchTerms: ["typography text grayscale anti aliasing macos thin"],
    macOnly: true,
  },
  {
    id: "word-wrap",
    title: "自动换行",
    to: "/settings/appearance",
    searchTerms: ["long lines code blocks diffs file previews"],
  },
  {
    id: "composer-context",
    title: "输入框上下文",
    to: "/settings/appearance",
  },
  {
    id: "project-grouping",
    title: "项目分组",
    to: "/settings/general",
    searchTerms: ["combine matching repositories environments sidebar"],
  },
  {
    id: "project-order",
    title: "项目排序",
    to: "/settings/general",
    searchTerms: ["sort projects sidebar manual created recent"],
  },
  {
    id: "snooze-options",
    title: "稍后处理选项",
    to: "/settings/threads",
    searchTerms: ["snooze presets times later tonight tomorrow next week remind"],
    environmentOnly: true,
    scope: "environment-defaults",
  },
  {
    id: "snooze-limited-threads",
    title: "推迟到用量限制重置",
    to: "/settings/threads",
    searchTerms: ["usage quota rate limit reset wake recover continue"],
  },
  {
    id: "auto-resume-limited-threads",
    title: "用量限制重置后恢复",
    to: "/settings/threads",
    searchTerms: ["usage quota rate limit reset recover continue"],
  },
  {
    id: "working-shelf",
    title: "处理中分组",
    to: "/settings/general",
    searchTerms: ["hide fold running monitoring threads inbox sidebar shelf"],
  },
  {
    id: "boring-sidebar",
    title: "按项目分组的简洁侧栏",
    to: "/settings/labs",
    searchTerms: ["beta folders project tree legacy old classic sidebar"],
  },
  {
    id: "boring-sidebar-multiline",
    title: "文件夹显示为两行",
    to: "/settings/labs",
    searchTerms: ["beta boring sidebar folder rows multiline branch pull request details"],
  },
  {
    id: "guest-links",
    title: "访客链接",
    to: "/settings/labs",
    scope: "environment",
    searchTerms: ["beta share guest invite link teammate watch t3 connect tunnel"],
  },
  {
    id: "linked-environments-beta",
    title: "关联环境",
    to: "/settings/labs",
    scope: "environment",
    searchTerms: ["beta link another machine vps peer agents work there delegate"],
  },
  {
    id: "simlock-hosts",
    title: "Simlock 设备主机（内测）",
    to: "/settings/labs",
    scope: "environment",
    searchTerms: ["beta alpha simlock callstack simulator emulator ios android pool lease gateway"],
  },
  {
    id: "auto-settle-inactive-threads",
    title: "自动归结不活跃会话",
    to: "/settings/threads",
    searchTerms: ["sidebar inactivity days no activity automatically"],
    requiresThreadAutoSettlement: true,
    scope: "project-defaults",
  },
  {
    id: "compact-idle-threads",
    title: "压缩空闲会话",
    to: "/settings/providers",
    scope: "environment-defaults",
    searchTerms: ["claude context compaction idle cache tokens usage summary resume"],
  },
  {
    id: "auto-settle-merged-threads",
    title: "合并后自动归结会话",
    to: "/settings/threads",
    searchTerms: ["pull request merge closed automatically sidebar"],
    requiresThreadAutoSettlement: true,
    scope: "project-defaults",
  },
  {
    id: "keep-threads-with-pull-requests",
    title: "保留有关联拉取请求的会话",
    to: "/settings/threads",
    targetId: "auto-settle-inactive-threads",
    searchTerms: ["pull request inactivity auto-settle merge close sidebar"],
    requiresThreadAutoSettlement: true,
    scope: "project-defaults",
  },
  {
    id: "days-before-auto-settle",
    title: "无活动多少天后自动归结",
    to: "/settings/threads",
    targetId: "auto-settle-inactive-threads",
    searchTerms: ["thread timeout activity sidebar"],
    requiresThreadAutoSettlement: true,
    scope: "project-defaults",
  },
  {
    id: "thread-notifications",
    title: "会话通知",
    to: "/settings/general",
    searchTerms: ["notification sound alert completion input approval desktop"],
  },
  {
    id: "in-app-notifications",
    title: "应用内通知",
    to: "/settings/general",
    searchTerms: ["notification toast popup completion input approval failure"],
  },
  {
    id: "time-format",
    title: "时间格式",
    to: "/settings/general",
    searchTerms: ["timestamp clock locale system browser os 12 hour 24 hour"],
  },
  {
    id: "response-streaming",
    title: "流式输出",
    to: "/settings/threads",
    scope: "project-defaults",
    searchTerms: ["output token paragraph buffered wait turn legacy"],
  },
  {
    id: "hide-whitespace-changes",
    title: "隐藏空白字符变更",
    to: "/settings/diffs",
    searchTerms: ["diff ignore spaces edits default"],
  },
  {
    id: "default-diff-file-state",
    title: "差异文件默认状态",
    to: "/settings/diffs",
    searchTerms: ["collapsed expanded collapse expand files pull request pr code tab"],
  },
  {
    id: "diff-layout",
    title: "差异布局",
    to: "/settings/diffs",
    searchTerms: ["stacked split side by side unified inline view"],
  },
  {
    id: "proactive-panels",
    title: "自动打开拉取请求与变更面板",
    to: "/settings/diffs",
    searchTerms: ["proactive automatically open diff pull request pr right panel agent completion"],
  },
  {
    id: "skills-in-slash-menu",
    title: "在 / 菜单中显示技能",
    to: "/settings/chat",
    searchTerms: ["command menu dollar $ slash /"],
  },
  {
    id: "composer-rich-text",
    title: "富文本输入框",
    to: "/settings/chat",
    searchTerms: ["composer rich text tiptap bold italic markdown styled wysiwyg"],
  },
  {
    id: "send-shortcut",
    title: "发送快捷键",
    to: "/settings/chat",
    searchTerms: ["enter return command ctrl multiline prompt new line composer"],
  },
  {
    id: "follow-up-behavior",
    title: "后续消息处理方式",
    to: "/settings/chat",
    searchTerms: ["queue steer running turn send default behavior composer"],
  },
  {
    id: "provider-update-checks",
    title: "服务更新检查",
    to: "/settings/maintenance",
    searchTerms: [
      "installed cli versions newer available codex claude cursor grok fx kiro opencode",
    ],
    scope: "environment-defaults",
  },
  {
    id: "continue-threads-after-server-update",
    title: "重启后继续会话",
    to: "/settings/maintenance",
    scope: "project-defaults",
    searchTerms: [
      "resume running active interrupted work restart reboot machine crash desktop update automatically",
    ],
  },
  {
    id: "background-activity",
    title: "后台活动",
    to: "/settings/maintenance",
    scope: "environment-defaults",
    searchTerms: [
      "balanced performance battery saver advanced git fetch provider health refresh host power monitor idle policy",
    ],
  },
  {
    id: "new-threads",
    title: "新会话",
    to: "/settings/threads",
    scope: "project-defaults",
    searchTerms: ["default workspace mode draft local worktree"],
  },
  {
    id: "worktree-submodules",
    title: "子模块",
    to: "/settings/worktrees",
    scope: "project-defaults",
    searchTerms: ["git submodule init recursive top-level none worktree t3.json"],
  },
  {
    id: "start-from-origin",
    title: "从远程开始",
    to: "/settings/worktrees",
    scope: "project-defaults",
    searchTerms: ["new worktrees start remote origin latest fetched branch local"],
  },
  {
    id: "add-project-starts-in",
    title: "添加项目的起始位置",
    to: "/settings/threads",
    scope: "environment-defaults",
    searchTerms: ["base directory folder browser path home"],
  },
  {
    id: "unpin-confirmation",
    title: "取消置顶确认",
    to: "/settings/general",
    searchTerms: ["ask before thread pinned section"],
  },
  {
    id: "archive-confirmation",
    title: "归档确认",
    to: "/settings/general",
    searchTerms: ["ask before thread second click inline action"],
  },
  {
    id: "delete-confirmation",
    title: "删除确认",
    to: "/settings/general",
    searchTerms: ["ask before thread chat history"],
  },
  {
    id: "quit-confirmation",
    title: "退出快捷键",
    to: "/settings/general",
    searchTerms: ["confirmation desktop app exit direct hold double click press twice"],
    desktopOnly: true,
  },
  {
    id: "text-generation-model",
    title: "文本生成模型",
    to: "/settings/threads",
    scope: "project-defaults",
    searchTerms: ["generated thread titles source control content default provider"],
  },
  {
    id: "thread-title-instructions",
    title: "会话标题生成要求",
    to: "/settings/threads",
    scope: "project-defaults",
    searchTerms: ["generated thread titles prompt custom style naming rename regenerate"],
  },
  {
    id: "app-version",
    title: "版本",
    to: "/settings/about",
    searchTerms: ["about check for updates download install upgrade release"],
  },
  {
    id: "update-track",
    title: "更新通道",
    to: "/settings/about",
    searchTerms: ["release channel stable latest nightly prerelease"],
    releaseChannelOnly: true,
  },
  {
    id: "cli-command",
    title: "kelaodeyun 命令",
    to: "/settings/about",
    searchTerms: ["cli terminal shell path install command line"],
    desktopOnly: true,
  },
  {
    id: "mobile-app",
    title: "移动应用",
    to: "/settings/about",
    searchTerms: ["phone tablet iPhone iPad iOS Android App Store Google Play QR"],
  },
  {
    id: "privacy-policy",
    title: "隐私政策",
    to: "/settings/about",
    searchTerms: ["telemetry analytics usage data tracking legal opt out"],
  },
  {
    id: "telemetry-export",
    title: "OpenTelemetry 导出",
    to: "/settings/diagnostics",
    targetId: "telemetry-export",
    scope: "environment",
    searchTerms: ["OTel OTLP telemetry export endpoints logs traces metrics Grafana"],
  },
  {
    id: "diagnostics",
    title: "诊断",
    to: "/settings/maintenance",
    searchTerms: ["logs traces processes resource history failures spans cpu memory"],
  },
  {
    id: "open-source-licenses",
    title: "开源许可",
    to: "/settings/about",
  },
  {
    id: "legacy-plan-mode",
    title: "规划模式（旧版）",
    to: "/settings/labs",
    searchTerms: ["build plan composer old"],
  },
  {
    id: "legacy-context-window-indicator",
    title: "上下文用量指示器（旧版）",
    to: "/settings/labs",
    searchTerms: ["composer meter usage tokens circle old"],
  },
  {
    id: "keybindings",
    title: "快捷键",
    to: "/settings/keybindings",
    searchTerms: ["keyboard shortcuts hotkeys commands bindings json"],
  },
  ...KEYBINDING_SEARCH_ITEMS,
  {
    id: "snap-shot-enabled",
    title: "快照",
    searchTerms: ["window capture screenshot"],
    to: "/settings/snap-shot",
  },
  {
    id: "snap-shot-accessibility",
    title: "包含应用文字",
    to: "/settings/snap-shot",
    targetId: "snap-shot-enabled",
    searchTerms: [
      "capture accessibility data text UI structure elements privacy omit agent context",
    ],
  },
  {
    id: "snap-shot-shortcut",
    title: "截图快捷键",
    to: "/settings/snap-shot",
    targetId: "snap-shot-enabled",
  },
  {
    id: "snap-shot-sound",
    title: "截图音效",
    to: "/settings/snap-shot",
    targetId: "snap-shot-enabled",
  },
  {
    id: "snap-shot-flash",
    title: "截图闪光",
    to: "/settings/snap-shot",
    targetId: "snap-shot-enabled",
  },
  {
    id: "snap-shot-animations",
    title: "截图动画",
    to: "/settings/snap-shot",
    targetId: "snap-shot-enabled",
  },
  {
    id: "providers",
    title: "模型服务",
    to: "/settings/providers",
    searchTerms: [
      "agents cli codex claude cursor grok fx kiro opencode antigravity google sign in sign out install subscription instances authentication api key models configuration binary path config directory codex_home shadow home endpoint arguments environment variables display name accent color custom favorite hidden auto compact native sessions import resume",
    ],
  },
  {
    id: "usage-providers",
    title: "用量服务",
    to: "/settings/providers",
    searchTerms: [
      "usage sources CLIProxyAPI CLI proxy hub quota subscription limits management key add remove",
    ],
    providerSettingsOnly: true,
  },
  {
    id: "cursor-keychain-usage",
    title: "Cursor 账户用量",
    to: "/settings/providers",
    searchTerms: ["cursor macOS keychain usage tokens cost limits permission"],
    providerSettingsOnly: true,
    macProviderSettingsOnly: true,
  },
  {
    id: "provider-health-check-interval",
    title: "健康检查间隔",
    to: "/settings/providers",
    searchTerms: ["refresh availability versions auth state models background probes seconds off"],
    providerSettingsOnly: true,
  },
  {
    id: "agent-browser-access",
    title: "智能体浏览器权限",
    to: "/settings/browser",
    scope: "project-defaults",
    searchTerms: ["allow disable enable open drive preview tools sessions project override"],
  },
  {
    id: "device-sources",
    title: "设备来源",
    to: "/settings/devices",
    searchTerms: [
      "device hosts ssh remote mac mini identity key connection eas expo cloud simlock pool gateway local simulators",
    ],
  },
  {
    id: "agent-device-access",
    title: "允许智能体使用设备",
    to: "/settings/devices",
    targetId: "devices",
    searchTerms: ["allow simulator emulator ios android drive tools sessions"],
  },
  {
    id: "device-hub",
    title: "使用设备",
    to: "/settings/devices",
    targetId: "devices",
    searchTerms: ["device hub simulator emulator ios android install start version"],
  },
  {
    id: "device-platform-support",
    title: "本地模拟器",
    to: "/settings/devices",
    targetId: "device-sources",
    searchTerms: ["simulator support xcode android studio sdk avd runtime"],
  },
  {
    id: "browser-profiles",
    title: "浏览器配置",
    to: "/settings/browser",
    targetId: "browser",
  },
  {
    id: "browser-default-profile",
    title: "默认浏览器配置",
    to: "/settings/browser",
    targetId: "browser-profiles",
  },
  {
    id: "browser-default-viewport",
    title: "默认浏览器视口",
    to: "/settings/browser",
    searchTerms: ["preview size width height device desktop mobile rotate"],
  },
  {
    id: "browser-default-zoom",
    title: "默认浏览器缩放",
    to: "/settings/browser",
    searchTerms: ["preview page scale tabs percent"],
  },
  {
    id: "browser-default-appearance",
    title: "默认浏览器外观",
    to: "/settings/browser",
    searchTerms: ["preview color scheme light dark system os"],
  },
  {
    id: "browser-recording-frame-rate",
    title: "浏览器录屏帧率",
    to: "/settings/browser",
  },
  {
    id: "browser-recording-key-presses",
    title: "在录屏中显示按键",
    to: "/settings/browser",
    searchTerms: ["browser preview keyboard shortcuts keystrokes overlay capture"],
  },
  {
    id: "browser-recording-mouse-presses",
    title: "在录屏中显示鼠标点击",
    to: "/settings/browser",
    searchTerms: ["browser preview clicks buttons drag overlay capture"],
  },
  {
    id: "browser-link-target",
    title: "链接打开方式",
    to: "/settings/browser",
    searchTerms: ["links default browser in-app browser external open"],
  },
  {
    id: "browser-search-engine",
    title: "搜索引擎",
    to: "/settings/browser",
    searchTerms: ["address bar duckduckgo google bing brave kagi ecosia custom url"],
  },
  {
    id: "pull-request-links-open-in-app",
    title: "在 kelaodeyun 中打开拉取请求",
    to: "/settings/diffs",
    searchTerms: [
      `pr commit links ${SOURCE_CONTROL_HOST_LABELS} browser external click default pull request view panel`,
    ],
  },
  {
    id: "browser-auto-show-floating-preview",
    title: "自动显示浮动预览",
    to: "/settings/browser",
    searchTerms: ["agent opens browser device simulator pop into view hide"],
  },
  {
    id: "automatic-pull",
    title: "自动拉取",
    to: "/settings/source-control",
    scope: "project-defaults",
    searchTerms: ["auto pull default branch current checkout fast forward upstream"],
  },
  {
    id: "remove-agent-credits-on-merge",
    title: "合并时移除智能体署名",
    to: "/settings/source-control",
    scope: "project-defaults",
    searchTerms: [
      `pull request ${SOURCE_CONTROL_HOST_LABELS} squash co-authored-by attribution claude codex generated`,
    ],
  },
  {
    id: "pull-request-merge-method",
    title: "默认合并方式",
    to: "/settings/source-control",
    scope: "project-defaults",
    searchTerms: ["pull request merge squash rebase last selected"],
  },
  {
    id: "source-control",
    title: "源代码管理",
    to: "/settings/source-control",
    scope: "environment-defaults",
    searchTerms: [
      `version control git ${SOURCE_CONTROL_HOST_TERMS} hosting integrations credentials scan server environment`,
    ],
  },
  {
    id: "git-fetch-interval",
    title: "Git 拉取间隔",
    to: "/settings/maintenance",
    targetId: "background-activity",
    searchTerms: [
      "automatic remote branch refresh background credentials security keys seconds off",
    ],
    environmentOnly: true,
    scope: "environment-defaults",
  },
  {
    id: "worktree-branch-naming",
    title: "工作树分支命名",
    to: "/settings/worktrees",
    searchTerms: ["static semantic prefix custom prompt instructions feat fix refactor chore"],
    environmentOnly: true,
    scope: "project-defaults",
  },
  ...sourceControlHostSearchItems(sourceControlClients.definitions),
  {
    id: "source-control-writing-style",
    title: "源代码管理文案风格",
    to: "/settings/source-control",
    searchTerms: [
      "repository conventions conventional commits custom instructions change descriptions request titles",
    ],
    environmentOnly: true,
  },
  {
    id: "follow-change-request-templates",
    title: "遵循变更请求模板",
    to: "/settings/source-control",
    searchTerms: ["repository pr pull request description structure"],
    environmentOnly: true,
  },
  {
    id: "source-control-writer-model",
    title: "源代码管理文案模型",
    to: "/settings/source-control",
    searchTerms: [
      "override generated commit change request pr titles descriptions branch bookmark",
    ],
    environmentOnly: true,
    scope: "project-defaults",
  },
  {
    id: "review-guides",
    title: "审查指南（测试版）",
    to: "/settings/source-control",
    searchTerms: ["pull request pr guided review guide tour beta experimental"],
    environmentOnly: true,
  },
  {
    id: "review-guide-model",
    title: "审查指南模型",
    to: "/settings/source-control",
    // Hidden until review guides are on, so a search lands on the switch that shows it.
    targetId: "review-guides",
    searchTerms: ["pull request pr guided review guide brief maintainer"],
    environmentOnly: true,
    scope: "project-defaults",
  },
  {
    id: "review-guide-instructions",
    title: "审查指南说明",
    to: "/settings/source-control",
    targetId: "review-guides",
    searchTerms: ["pull request pr guided review guide preferences taste prompt custom"],
    environmentOnly: true,
    scope: "project-defaults",
  },
  {
    id: "project-actions",
    title: "操作",
    to: "/settings/projects",
    searchTerms: ["commands scripts setup run dev server checkout worktree t3.json import"],
  },
  {
    id: "environment-icon",
    title: "环境图标",
    to: "/settings/access",
    targetId: "connections-environment",
    searchTerms: ["machine glyph sidebar mac mini studio laptop desktop server cloud vm"],
  },
  {
    id: "local-environment",
    title: "本地环境",
    to: "/settings/connections",
    searchTerms: ["turn off on disable enable local server agents remote only restart"],
    desktopOnly: true,
  },
  {
    id: "network-access",
    title: "网络访问",
    to: "/settings/access",
    targetId: "connections-environment",
    searchTerms: ["expose backend remote pairing local machine interfaces host restart"],
    localBackendManagementOnly: true,
  },
  {
    id: "tailscale-https",
    title: "Tailscale HTTPS",
    to: "/settings/access",
    targetId: "connections-environment",
    searchTerms: ["serve magicdns endpoint remote secure network"],
    desktopOnly: true,
    localBackendManagementOnly: true,
  },
  {
    id: "wsl-backend",
    title: "WSL 后端",
    to: "/settings/access",
    searchTerms: [
      "windows subsystem linux distro second server projects stop windows backend restart wsl only",
    ],
    desktopOnly: true,
    windowsOnly: true,
    localBackendManagementOnly: true,
    wslAvailableOnly: true,
  },
  {
    id: "t3-connect",
    localEnvironmentOnly: true,
    title: "T3 Connect",
    to: "/settings/access",
    targetId: "connections-environment",
    searchTerms: ["managed tunnel cloud other devices remote tunnels limit t3 chat"],
    desktopOnly: true,
    cloudOnly: true,
  },
  {
    id: "hold-webhooks-while-offline",
    localEnvironmentOnly: true,
    title: "离线时暂存 Webhook",
    to: "/settings/access",
    targetId: "connections-environment",
    searchTerms: ["webhook automations offline queue mailbox t3 connect"],
    cloudOnly: true,
    managedTunnelOnly: true,
  },
  {
    id: "publish-agent-activity",
    localEnvironmentOnly: true,
    title: "公开智能体活动",
    to: "/settings/access",
    targetId: "connections-environment",
    searchTerms: ["mobile push notifications live activities cloud tunnel"],
    cloudOnly: true,
  },
  {
    id: "connections-environment",
    title: "当前设备",
    to: "/settings/access",
    searchTerms: [
      "connections server backend local remote access administrative permissions scope pairing links qr code authorized clients sessions revoke endpoint",
    ],
  },
  {
    id: "linked-environments",
    peerLinksOnly: true,
    title: "关联环境",
    to: "/settings/connections",
    targetId: "linked-environments",
    searchTerms: ["link peer another machine vps agents work there handoff pairing code"],
  },
  {
    id: "remote-environments",
    title: "环境",
    to: "/settings/connections",
    searchTerms: ["add pair backend host code ssh config agent tunnel saved t3 connect"],
  },
  {
    id: "load-balancing",
    title: "负载均衡",
    to: "/settings/connections",
    searchTerms: [
      "automatic machine environment resources cpu memory capacity preference weight shared projects",
    ],
  },
  {
    id: "pull-request-routing",
    title: "拉取请求分享",
    to: "/settings/connections",
    searchTerms: [
      `pull request routing trusted environments shared credentials permissions read actions source control ${SOURCE_CONTROL_HOST_LABELS}`,
    ],
  },
  {
    id: "secret-providers",
    title: "密钥服务",
    to: "/settings/secrets",
    searchTerms: ["1password vault credentials api key"],
    secretsFeatureOnly: true,
  },
  {
    id: "secret-providers-add",
    title: "添加密钥服务",
    to: "/settings/secrets",
    targetId: "secret-providers",
    searchTerms: ["new 1password vault op cli account"],
    secretsFeatureOnly: true,
  },
  {
    id: "archive",
    title: "已归档会话",
    to: "/settings/archived",
    searchTerms: ["restore reopen deleted history projects"],
  },
] as const satisfies ReadonlyArray<SettingsSearchItem>;

export type SettingsSearchItemId = (typeof SETTINGS_SEARCH_ITEMS)[number]["id"];

const SEARCH_ITEMS_BY_ID = new Map(SETTINGS_SEARCH_ITEMS.map((item) => [item.id, item] as const));

const SETTINGS_CATEGORY_SCOPES: Readonly<Record<SettingsPath, SettingsSearchScope | null>> = {
  "/settings/diagnostics": "environment",
  "/settings/projects": "project",
  "/settings/profile": null,
  "/settings/general": null,
  "/settings/appearance": null,
  "/settings/chat": null,
  "/settings/diffs": null,
  "/settings/snap-shot": null,
  "/settings/keybindings": null,
  "/settings/providers": null,
  "/settings/threads": null,
  "/settings/browser": null,
  "/settings/devices": null,
  "/settings/source-control": "environment-defaults",
  "/settings/worktrees": "project-defaults",
  "/settings/connections": "connections",
  "/settings/access": "connections",
  "/settings/secrets": null,
  "/settings/scheduled-tasks": null,
  "/settings/maintenance": null,
  "/settings/labs": null,
  "/settings/about": null,
  "/settings/archived": "project-defaults",
};

const RENAMED_SETTINGS_PATHS: Readonly<Record<string, SettingsPath>> = {
  "/settings/integrations": "/settings/browser",
  "/settings/storage": "/settings/maintenance",
  "/settings/beta": "/settings/labs",
};
const SPLIT_SETTINGS_PATHS: ReadonlySet<string> = new Set([
  "/settings/general",
  "/settings/appearance",
  "/settings/source-control",
  "/settings/connections",
  ...Object.keys(RENAMED_SETTINGS_PATHS),
]);
// Section anchors that moved but are not search results themselves.
const MOVED_SECTION_ANCHORS: Readonly<Record<string, SettingsPath>> = {
  "authorized-clients": "/settings/access",
  "legacy-features": "/settings/labs",
  "text-generation": "/settings/threads",
  about: "/settings/about",
};

/** Where an old settings link now lives. Its anchor finds the page its row moved to. */
export function movedSettingsPath(pathname: string, hash: string): SettingsPath | null {
  if (!SPLIT_SETTINGS_PATHS.has(pathname)) return null;
  const items: readonly SettingsSearchItem[] = SETTINGS_SEARCH_ITEMS;
  const anchored = hash
    ? (items.find((item) => item.id === hash) ?? items.find((item) => item.targetId === hash))
    : undefined;
  const to =
    anchored?.to ?? MOVED_SECTION_ANCHORS[hash] ?? RENAMED_SETTINGS_PATHS[pathname] ?? null;
  return to === pathname ? null : to;
}

export function getSettingsSearchTargetScope(targetId: string) {
  const items: readonly SettingsSearchItem[] = SETTINGS_SEARCH_ITEMS;
  const item =
    items.find((candidate) => candidate.id === targetId) ??
    items.find((candidate) => candidate.targetId === targetId);
  return item
    ? {
        title: item.title,
        scope: item.scope ?? SETTINGS_CATEGORY_SCOPES[item.to],
        ...(item.requiresThreadAutoSettlement ? { requiresThreadAutoSettlement: true } : {}),
      }
    : null;
}

interface AutoSettlementSearchEnvironment {
  readonly environmentId: EnvironmentId;
  readonly connection: { readonly phase: EnvironmentConnectionPhase };
  readonly serverConfig: object | null;
}

export function getThreadAutoSettlementSearchAvailability(
  environments: readonly AutoSettlementSearchEnvironment[],
  scope?: Pick<ResolvedSettingsScope, "kind" | "environmentIds">,
) {
  const connected = environments.filter(
    (environment) =>
      environment.connection.phase === "connected" && environment.serverConfig !== null,
  );
  const eligibleEnvironmentIds = connected.map((environment) => environment.environmentId);
  const selected = connected.filter((environment) =>
    scope?.environmentIds.includes(environment.environmentId),
  );
  return {
    eligibleEnvironmentIds,
    isTargetAvailable:
      scope !== undefined &&
      scope.kind !== "unavailable" &&
      selected.length > 0 &&
      selected.every((environment) => eligibleEnvironmentIds.includes(environment.environmentId)),
  };
}

export function isSettingsSearchScopeAvailable(
  requiredScope: SettingsSearchScope | null,
  scopeKind: ResolvedSettingsScope["kind"],
): boolean {
  switch (requiredScope) {
    case null:
    case "connections":
      return true;
    case "environment":
    case "checkout":
      return requiredScope === scopeKind;
    case "project":
      return scopeKind === "project" || scopeKind === "checkout";
    case "environment-defaults":
      return scopeKind === "environment" || scopeKind === "all";
    case "project-defaults":
      return (
        scopeKind === "environment" ||
        scopeKind === "all" ||
        scopeKind === "project" ||
        scopeKind === "checkout"
      );
  }
}

export function searchableSetting(id: SettingsSearchItemId): {
  readonly id: string;
  readonly title: string;
} {
  const { id: anchorId, title } = SEARCH_ITEMS_BY_ID.get(id)!;
  return { id: anchorId, title };
}

export function filterAvailableSettingsSearchItems(
  availability: SettingsSearchAvailability,
): ReadonlyArray<SettingsSearchItem> {
  const items: ReadonlyArray<SettingsSearchItem> = SETTINGS_SEARCH_ITEMS;
  return items.filter(
    (item) =>
      (!item.cloudOnly || availability.hasCloudPublicConfig) &&
      (!item.environmentOnly || availability.hasEnvironment) &&
      (!item.providerSettingsOnly || availability.hasProviderSettingsEnvironment) &&
      (!item.macProviderSettingsOnly || availability.hasMacProviderSettingsEnvironment) &&
      (!item.localBackendManagementOnly || availability.canManageLocalBackend) &&
      (!item.localEnvironmentOnly || !availability.localEnvironmentDisabled) &&
      (!item.wslAvailableOnly || availability.isWslSettingsRowVisible) &&
      (!item.requiresThreadAutoSettlement || availability.hasThreadAutoSettlement) &&
      (!item.managedTunnelOnly || availability.managedTunnelActive === true) &&
      (!item.peerLinksOnly || availability.hasPeerLinkHost === true),
  );
}

/** The settings that exist on this platform and app channel. */
export function settingsForThisPlatform(
  items: ReadonlyArray<SettingsSearchItem>,
): ReadonlyArray<SettingsSearchItem> {
  const platform = typeof navigator === "undefined" ? "" : navigator.platform;
  return items.filter(
    (item) =>
      (isElectron || item.desktopOnly !== true) &&
      (!item.releaseChannelOnly || isElectron || HOSTED_APP_CHANNEL !== null) &&
      (!item.secretsFeatureOnly || isSecretsFeatureEnabled) &&
      (!item.macOnly || isMacPlatform(platform)) &&
      (!item.windowsOnly || isWindowsPlatform(platform)),
  );
}

const SETTINGS_ENGLISH_SECTION_LABELS: Readonly<Record<SettingsPath, string>> = {
  "/settings/diagnostics": "Diagnostics",
  "/settings/projects": "Projects",
  "/settings/profile": "Profile",
  "/settings/general": "General",
  "/settings/appearance": "Appearance",
  "/settings/chat": "Chat",
  "/settings/diffs": "Diffs & pull requests",
  "/settings/keybindings": "Keybindings",
  "/settings/snap-shot": "SnapShots",
  "/settings/providers": "Providers",
  "/settings/threads": "Threads",
  "/settings/browser": "Browser",
  "/settings/devices": "Devices",
  "/settings/scheduled-tasks": "Scheduled tasks",
  "/settings/source-control": "Source control",
  "/settings/worktrees": "Worktrees",
  "/settings/connections": "Environments",
  "/settings/access": "Sharing & access",
  "/settings/secrets": "Secrets",
  "/settings/maintenance": "Maintenance",
  "/settings/labs": "Labs",
  "/settings/about": "About",
  "/settings/archived": "Archive",
};

const SETTINGS_ENGLISH_TITLES: Readonly<Record<string, string>> = {
  "storage-worktree-keep-when": "Keep worktrees with local changes",
  "storage-delete-now": "Delete now",
  "storage-worktrees": "Worktree cleanup",
  "storage-worktrees-location": "Worktree location",
  "storage-artifacts": "Artifacts and logs",
  "project-defaults": "Project defaults and overrides",
  "project-overview": "Project overview",
  "default-model": "Default model",
  "fallback-model": "Fallback model",
  "default-permissions": "Permissions",
  "color-scheme": "Color scheme",
  theme: "Themes",
  "setting-appearance-contrast": "Contrast",
  "setting-glass-opacity": "Glass opacity",
  "diff-color-scheme": "Diff colors",
  "chat-width": "Chat width",
  "effort-display": "Effort display",
  "interactive-answers": "Interactive answers",
  "math-rendering": "Render math",
  "panel-animations": "Panel animations",
  "environment-identification": "Environment identification",
  "interface-font": "Interface font",
  "prompt-font": "Prompt font",
  "code-font": "Code font",
  "terminal-font": "Terminal font",
  "separate-fonts": "Separate fonts",
  "font-smoothing": "Font smoothing",
  "word-wrap": "Word wrap",
  "composer-context": "Composer context",
  "project-grouping": "Project grouping",
  "project-order": "Project order",
  "snooze-options": "Snooze options",
  "snooze-limited-threads": "Snooze until limits reset",
  "auto-resume-limited-threads": "Resume after usage limits",
  "working-shelf": "Working section",
  "boring-sidebar": "Boring sidebar (group by project)",
  "boring-sidebar-multiline": "Two-line folder rows",
  "guest-links": "Guest links",
  "linked-environments-beta": "Linked environments",
  "simlock-hosts": "Simlock device hosts (alpha)",
  "auto-settle-inactive-threads": "Auto-settle inactive threads",
  "compact-idle-threads": "Compact idle threads",
  "auto-settle-merged-threads": "Auto-settle merged threads",
  "keep-threads-with-pull-requests": "Keep threads with a PR",
  "days-before-auto-settle": "Days of inactivity before auto-settle",
  "thread-notifications": "Thread notifications",
  "in-app-notifications": "In-app notifications",
  "time-format": "Time format",
  "response-streaming": "Response streaming",
  "hide-whitespace-changes": "Hide whitespace changes",
  "default-diff-file-state": "Default diff file state",
  "diff-layout": "Diff layout",
  "proactive-panels": "Open pull requests and changes panels proactively",
  "skills-in-slash-menu": "Show skills in slash menu",
  "composer-rich-text": "Rich text composer",
  "send-shortcut": "Send shortcut",
  "follow-up-behavior": "Follow-up behavior",
  "provider-update-checks": "Provider update checks",
  "continue-threads-after-server-update": "Continue threads after restarts",
  "background-activity": "Background activity",
  "new-threads": "New threads",
  "worktree-submodules": "Submodules",
  "start-from-origin": "Start from remote",
  "add-project-starts-in": "Add project starts in",
  "unpin-confirmation": "Unpin confirmation",
  "archive-confirmation": "Archive confirmation",
  "delete-confirmation": "Delete confirmation",
  "quit-confirmation": "Quit shortcut",
  "text-generation-model": "Text generation model",
  "thread-title-instructions": "Thread title instructions",
  "app-version": "Version",
  "update-track": "Update track",
  "cli-command": "kelaodeyun command",
  "mobile-app": "Mobile app",
  "privacy-policy": "Privacy policy",
  "telemetry-export": "OpenTelemetry export",
  diagnostics: "Diagnostics",
  "open-source-licenses": "Open source licenses",
  "legacy-plan-mode": "Plan mode (legacy)",
  "legacy-context-window-indicator": "Context window indicator (legacy)",
  keybindings: "Keybindings",
  "snap-shot-enabled": "SnapShots",
  "snap-shot-accessibility": "Include app text",
  "snap-shot-shortcut": "Capture shortcut",
  "snap-shot-sound": "Capture sound",
  "snap-shot-flash": "Capture flash",
  "snap-shot-animations": "Capture animations",
  providers: "Providers",
  "usage-providers": "Usage providers",
  "cursor-keychain-usage": "Cursor account usage",
  "provider-health-check-interval": "Health check interval",
  "agent-browser-access": "Agent browser access",
  "device-sources": "Device sources",
  "agent-device-access": "Agents can use devices",
  "device-hub": "Use devices",
  "device-platform-support": "Local simulators",
  "browser-profiles": "Browser profiles",
  "browser-default-profile": "Default browser profile",
  "browser-default-viewport": "Default browser viewport",
  "browser-default-zoom": "Default browser zoom",
  "browser-default-appearance": "Default browser appearance",
  "browser-recording-frame-rate": "Browser recording frame rate",
  "browser-recording-key-presses": "Show key presses in recordings",
  "browser-recording-mouse-presses": "Show mouse presses in recordings",
  "browser-link-target": "Open links in",
  "browser-search-engine": "Search engine",
  "pull-request-links-open-in-app": "Open pull requests in kelaodeyun",
  "browser-auto-show-floating-preview": "Auto-show floating preview",
  "automatic-pull": "Automatically pull",
  "remove-agent-credits-on-merge": "Remove agent credits when merging",
  "pull-request-merge-method": "Default merge method",
  "source-control": "Source control",
  "git-fetch-interval": "Git fetch interval",
  "worktree-branch-naming": "Worktree branch naming",
  "source-control-writing-style": "Source control writing style",
  "follow-change-request-templates": "Follow change request templates",
  "source-control-writer-model": "Source control writer model",
  "review-guides": "Review guides (beta)",
  "review-guide-model": "Review guide model",
  "review-guide-instructions": "Review guide instructions",
  "project-actions": "Actions",
  "environment-icon": "Environment icon",
  "local-environment": "Local environment",
  "network-access": "Network access",
  "tailscale-https": "Tailscale HTTPS",
  "wsl-backend": "WSL backend",
  "t3-connect": "T3 Connect",
  "hold-webhooks-while-offline": "Hold webhooks while offline",
  "publish-agent-activity": "Publish agent activity",
  "connections-environment": "This machine",
  "linked-environments": "Linked environments",
  "remote-environments": "Environments",
  "load-balancing": "Load balancing",
  "pull-request-routing": "Pull request sharing",
  "secret-providers": "Secret providers",
  "secret-providers-add": "Add secret provider",
  archive: "Archived threads",
};

export function searchSettings(
  query: string,
  items: ReadonlyArray<SettingsSearchItem> = SETTINGS_SEARCH_ITEMS,
): ReadonlyArray<SettingsSearchItem> {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length === 0) return [];
  const queryTokens = normalizedQuery.split(" ");

  return settingsForThisPlatform(items)
    .flatMap((item, index) => {
      const localizedTitle = normalizeSearchText(item.title);
      const title = normalizeSearchText(
        /\p{Script=Han}/u.test(normalizedQuery)
          ? item.title
          : (SETTINGS_ENGLISH_TITLES[item.id] ?? item.title),
      );
      const fields = [
        title,
        localizedTitle,
        normalizeSearchText(SETTINGS_ENGLISH_TITLES[item.id] ?? ""),
        normalizeSearchText(SETTINGS_ENGLISH_SECTION_LABELS[item.to]),
        normalizeSearchText(SETTINGS_SECTION_LABELS[item.to]),
        ...(item.searchTerms ?? []).map(normalizeSearchText),
      ];
      if (!queryTokens.every((token) => fields.some((field) => field.includes(token)))) return [];

      const exactPhraseField = fields.findIndex((field) => field.includes(normalizedQuery));
      const rank =
        title === normalizedQuery
          ? 5
          : title.startsWith(normalizedQuery)
            ? 4
            : title.includes(normalizedQuery)
              ? 3
              : queryTokens.every((token) => title.includes(token))
                ? 2
                : exactPhraseField >= 0
                  ? 1
                  : 0;
      return [{ item, index, rank }];
    })
    .toSorted(
      (left, right) =>
        Number(left.item.secondary ?? false) - Number(right.item.secondary ?? false) ||
        right.rank - left.rank ||
        left.index - right.index,
    )
    .map(({ item }) => item);
}

// These rows only exist with separate fonts on, so a search jump to one turns them on.
const ADVANCED_TYPOGRAPHY_TARGET_IDS: ReadonlySet<string> = new Set([
  "prompt-font",
  "terminal-font",
]);

export function isAdvancedTypographyTarget(targetId: string): boolean {
  return ADVANCED_TYPOGRAPHY_TARGET_IDS.has(targetId);
}

/**
 * Opens the persisted section a search result lives in before jumping to it, so
 * its row is mounted to scroll to. The terminal reads the same flag, so it must
 * stay on after the jump.
 */
export function revealSettingsSearchTarget(targetId: string): void {
  if (isAdvancedTypographyTarget(targetId)) {
    writeLocalStorageValue(TYPOGRAPHY_ADVANCED_STORAGE_KEY, true, false, Schema.Boolean);
  }
}
