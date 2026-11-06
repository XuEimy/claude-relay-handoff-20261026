import { useAtomValue } from "@effect/atom-react";
import { NotificationSettings } from "./NotificationSettings";
import { PRIVACY_POLICY_URL } from "../../legalLinks";
import { CheckIcon } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  type DesktopUpdateChannel,
  IDLE_COMPACTION_MODES,
  globalIdleCompaction,
  managedUpdatesDenial,
  managedUpdatesMessage,
  ProviderDriverKind,
  type ProviderInstanceId,
  type SidebarProjectGroupingMode,
} from "@t3tools/contracts";
import {
  DEFAULT_UNIFIED_SETTINGS,
  type DiffLayout,
  MAX_SIDEBAR_AUTO_SETTLE_AFTER_DAYS,
  MIN_SIDEBAR_AUTO_SETTLE_AFTER_DAYS,
  type ResponseStreamingMode,
  type QuitConfirmationMode,
  SidebarProjectSortOrder,
} from "@t3tools/contracts/settings";
import { desktopUpdateChannelOf } from "@t3tools/shared/cliRelease";
import { createModelSelection } from "@t3tools/shared/model";
import { resolvePastedPath } from "@t3tools/shared/path";
import * as Equal from "effect/Equal";
import * as Schema from "effect/Schema";
import { APP_VERSION, HOSTED_APP_CHANNEL, HOSTED_APP_CHANNEL_LABEL } from "../../branding";
import { AboutVersionTitle } from "./AboutVersionTitle";
import { CliCommandSettingsRow } from "./CliCommandSettingsRow";
import { MobileAppSettingsRow } from "./MobileAppSettingsRow";
import {
  canCheckForUpdate,
  getDesktopUpdateButtonTooltip,
  getDesktopUpdateDisabledReason,
  getDesktopUpdateInstallConfirmationMessage,
  isDesktopUpdateButtonDisabled,
  resolveDesktopUpdateButtonAction,
} from "../../components/desktopUpdate.logic";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import { TraitsPicker } from "../chat/TraitsPicker";
import { isElectron } from "../../env";
import { buildHostedChannelSelectionUrl, type HostedAppChannel } from "../../hostedPairing";
import {
  readAppearanceModePreference,
  readThemeHalves,
  readThemePreference,
  useTheme,
} from "../../hooks/useTheme";
import {
  useScopedSettings,
  useScopedSettingsMixed,
  useUpdateScopedSettings,
} from "./useScopedSettings";
import { useScopedModelDisabledReason } from "./useScopedModelAvailability";
import { useOptionalSettingsScope, useSettingsScope } from "./SettingsScopeContext";
import { scopedIdleCompaction } from "./scopedSettings";
import { ProjectDefaultsSettings } from "./ProjectDefaultsSettings";
import { ThreadTitleInstructionsSettings } from "./ThreadTitleInstructionsSettings";
import { SnoozePresetsRow } from "./SnoozePresetsSettings";
import { useDesktopUpdateState } from "../../state/desktopUpdate";
import { managedTelemetryOffMessage, usePrimaryManagedPolicy } from "../../state/managedPolicy";
import {
  getCustomModelOptionsByInstance,
  resolveAppModelSelectionState,
  selectsPlanAgent,
} from "../../modelSelection";
import { providerInstanceEntriesFor } from "../../providerInstances";
import { ensureLocalApi, readLocalApi } from "../../localApi";
import { isMacPlatform } from "../../lib/utils";
import { useEnvironmentProviders, useEnvironments } from "../../state/environments";
import { EMPTY_SERVER_PROVIDERS } from "../../state/server";
import { Button } from "../ui/button";
import { DraftInput } from "../ui/draft-input";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { ScopedSwitch } from "./ScopedSwitch";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  getChangedBrowserSettingLabels,
  getChangedTypographySettingLabels,
  hasChangedBackgroundActivitySettings,
  isProjectGroupingEnabled,
  projectGroupingModeFromToggle,
  readLastEnabledProjectGroupingMode,
  rememberEnabledProjectGroupingMode,
} from "./SettingsPanels.logic";
import {
  SETTINGS_PICKER_TRIGGER_CLASSNAME,
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { BackgroundActivitySettingsRow } from "./BackgroundActivitySettings";
import { AdvancedSettings } from "./AdvancedSettings";
import { PullRequestLinksOpenInAppSetting } from "./IntegrationsSettings";
import { StorageCleanupSections } from "./StorageSettings";
import { UpdateTrackSwitchDialog } from "./UpdateTrackSwitchDialog";
import { environmentIdsKey } from "~/state/environmentAtomList";
import { environmentSessionStatesAtom } from "~/state/session";
import { canUpdateServer } from "../ServerUpdateAction";
import { useUpdateEverythingRun } from "../sidebar/updateEverythingRun";
import { awaitsTrackSwitch, channelSwitchLabel } from "../sidebar/updateEverything.logic";
import { isHostedByThisApp } from "../sidebar/useUpdateEverything";

const RESPONSE_STREAMING_MODE_LABELS: Record<ResponseStreamingMode, string> = {
  turn: "等待完整回复",
  paragraph: "逐段显示",
};

const RESPONSE_STREAMING_MODE_DESCRIPTIONS: Record<ResponseStreamingMode, string> = {
  turn: "智能体完成本轮回复后再显示文字。",
  paragraph: "每个段落或代码块完成后立即显示。",
};

const SIDEBAR_PROJECT_SORT_ORDER_LABELS: Record<SidebarProjectSortOrder, string> = {
  updated_at: "最近用户消息",
  created_at: "创建时间",
  manual: "手动",
};
const isSidebarProjectSortOrder = Schema.is(SidebarProjectSortOrder);

const TIMESTAMP_FORMAT_LABELS = {
  locale: "系统默认",
  "12-hour": "12 小时制",
  "24-hour": "24 小时制",
} as const;

const DIFF_LAYOUT_LABELS: Record<DiffLayout, string> = {
  stacked: "上下排列",
  split: "左右分栏",
};

const QUIT_CONFIRMATION_MODE_LABELS: Record<QuitConfirmationMode, string> = {
  direct: "直接退出",
  hold: "长按",
  "double-click": "按两次",
};

const DEFAULT_DRIVER_KIND = ProviderDriverKind.make("codex");
function AboutVersionSection() {
  const updateState = useDesktopUpdateState();
  const [switchChannel, setSwitchChannel] = useState<DesktopUpdateChannel | null>(null);
  const [isUpdateActionPending, setIsUpdateActionPending] = useState(false);
  const { environments } = useEnvironments();
  const sessionStates = useAtomValue(
    environmentSessionStatesAtom(
      environmentIdsKey(environments.map(({ environmentId }) => environmentId)),
    ),
  );
  // A second run would replace the first run's progress and local download.
  const updateRun = useUpdateEverythingRun();

  const hasDesktopBridge = typeof window !== "undefined" && Boolean(window.desktopBridge);
  const selectedUpdateChannel = updateState?.channel ?? "latest";
  // The desktop updates this machine, whose policy the primary environment reports.
  const primaryPolicy = usePrimaryManagedPolicy();
  const updatesDenial = hasDesktopBridge ? managedUpdatesDenial(primaryPolicy) : undefined;
  const nightlyDeniedBy =
    hasDesktopBridge && primaryPolicy?.limits?.updates?.allowNightly === false
      ? primaryPolicy.organization
      : undefined;
  const selectedHostedAppChannel = hasDesktopBridge ? null : HOSTED_APP_CHANNEL;
  // A switch that failed part way leaves this app or a server on the other track.
  // With its updater off, a switch cannot move this app, so it is not counted.
  const appOffTrack =
    updateState?.enabled !== false && desktopUpdateChannelOf(APP_VERSION) !== selectedUpdateChannel;
  const unswitchedMachines =
    (appOffTrack ? 1 : 0) +
    environments.filter(
      (environment, index) =>
        environment.connection.phase === "connected" &&
        canUpdateServer(sessionStates[index]!) &&
        awaitsTrackSwitch(
          {
            serverConfig: environment.serverConfig,
            hostedByThisApp: isHostedByThisApp(environment),
          },
          selectedUpdateChannel,
        ),
    ).length;

  const handleButtonClick = async () => {
    const bridge = window.desktopBridge;
    if (!bridge) return;

    const action = updateState ? resolveDesktopUpdateButtonAction(updateState) : "none";

    if (action === "download") {
      void bridge.downloadUpdate().catch((error: unknown) => {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "无法下载更新",
            description: error instanceof Error ? error.message : "下载失败。",
          }),
        );
      });
      return;
    }

    if (action === "install") {
      if (isUpdateActionPending) return;
      setIsUpdateActionPending(true);
      let confirmed = false;
      try {
        confirmed = await ensureLocalApi().dialogs.confirm(
          getDesktopUpdateInstallConfirmationMessage(
            updateState ?? { availableVersion: null, downloadedVersion: null },
          ),
        );
      } catch (error) {
        setIsUpdateActionPending(false);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "无法确认更新",
            description: error instanceof Error ? error.message : "更新确认失败。",
          }),
        );
        return;
      }
      if (!confirmed) {
        setIsUpdateActionPending(false);
        return;
      }
      void bridge
        .installUpdate()
        .catch((error: unknown) => {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "无法安装更新",
              description: error instanceof Error ? error.message : "Install failed.",
            }),
          );
        })
        .finally(() => setIsUpdateActionPending(false));
      return;
    }

    if (typeof bridge.checkForUpdate !== "function") return;
    void bridge
      .checkForUpdate()
      .then((result) => {
        if (!result.checked) {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "无法检查更新",
              description:
                updatesDenial ??
                result.state.message ??
                "Automatic updates are not available in this build.",
            }),
          );
        }
      })
      .catch((error: unknown) => {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "无法检查更新",
            description: error instanceof Error ? error.message : "Update check failed.",
          }),
        );
      });
  };

  const action = updateState ? resolveDesktopUpdateButtonAction(updateState) : "none";
  const buttonTooltip = updateState ? getDesktopUpdateButtonTooltip(updateState) : null;
  const buttonDisabled =
    action === "none"
      ? !canCheckForUpdate(updateState)
      : isDesktopUpdateButtonDisabled(updateState);

  const actionLabel: Record<string, string> = { download: "下载", install: "安装" };
  const statusLabel: Record<string, string> = {
    checking: "正在检查…",
    downloading: "Downloading…",
    // Off its track, "up to date" only means no switch is pending; Review moves it.
    ...(appOffTrack ? {} : { "up-to-date": "Up to Date" }),
  };
  const buttonLabel =
    actionLabel[action] ?? statusLabel[updateState?.status ?? ""] ?? "Check for Updates";
  const description =
    action === "download" || action === "install"
      ? "Update available."
      : (getDesktopUpdateDisabledReason(updateState, updatesDenial) ?? "当前应用版本。");

  return (
    <>
      <SettingsRow
        id={searchableSetting("app-version").id}
        title={<AboutVersionTitle />}
        description={description}
        managed={updatesDenial}
        control={
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="sm"
                  variant="outline"
                  disabled={buttonDisabled || isUpdateActionPending}
                  onClick={handleButtonClick}
                >
                  {buttonLabel}
                </Button>
              }
            />
            {buttonTooltip ? <TooltipPopup>{buttonTooltip}</TooltipPopup> : null}
          </Tooltip>
        }
      />
      {hasDesktopBridge ? (
        <SettingsRow
          {...searchableSetting("update-track")}
          description={
            nightlyDeniedBy !== undefined ? (
              `${managedUpdatesMessage(nightlyDeniedBy)} Nightly builds are not available${
                selectedUpdateChannel === "nightly"
                  ? "; switch to Stable to keep getting updates."
                  : "."
              }`
            ) : unswitchedMachines > 0 ? (
              <>
                {unswitchedMachines === 1
                  ? "1 machine still runs"
                  : `${unswitchedMachines} machines still run`}{" "}
                {channelSwitchLabel(selectedUpdateChannel === "nightly" ? "latest" : "nightly")}.{" "}
                {/* The dialog moves what it can and says why it skips the rest. */}
                <Button
                  size="xs"
                  variant="link"
                  disabled={updateRun !== null}
                  onClick={() => setSwitchChannel(selectedUpdateChannel)}
                >
                  审查
                </Button>
              </>
            ) : (
              "Switches this app and every connected machine whose database the target release supports."
            )
          }
          managed={updatesDenial}
          control={
            <Select
              value={selectedUpdateChannel}
              onValueChange={(value) => {
                if (value !== selectedUpdateChannel) {
                  setSwitchChannel(value as DesktopUpdateChannel);
                }
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-full sm:w-40"
                aria-label="更新通道"
                disabled={switchChannel !== null || updateRun !== null}
              >
                <SelectValue>{channelSwitchLabel(selectedUpdateChannel)}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="latest">
                  稳定版
                </SelectItem>
                <SelectItem
                  hideIndicator
                  value="nightly"
                  disabled={nightlyDeniedBy !== undefined && selectedUpdateChannel !== "nightly"}
                >
                  每日构建版
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />
      ) : selectedHostedAppChannel ? (
        <SettingsRow
          {...searchableSetting("update-track")}
          description="切换托管应用的发布通道。"
          control={
            <Select
              value={selectedHostedAppChannel}
              onValueChange={(value) => {
                if (value === selectedHostedAppChannel) return;
                window.location.assign(
                  buildHostedChannelSelectionUrl({ channel: value as HostedAppChannel }),
                );
              }}
            >
              <SelectTrigger size="sm" className="w-full sm:w-40" aria-label="更新通道">
                <SelectValue>{HOSTED_APP_CHANNEL_LABEL}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="latest">
                  最新版
                </SelectItem>
                <SelectItem hideIndicator value="nightly">
                  每日构建版
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />
      ) : null}
      {hasDesktopBridge ? <CliCommandSettingsRow /> : null}
      {switchChannel === null ? null : (
        <UpdateTrackSwitchDialog channel={switchChannel} onClose={() => setSwitchChannel(null)} />
      )}
    </>
  );
}

export function useSettingsRestore(onRestored?: () => void) {
  const {
    theme,
    setTheme,
    followSystem,
    setFollowSystem,
    setThemeHalf,
    clearThemeHalves,
    themeHalves,
  } = useTheme();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();

  const isTextGenerationModelDirty = !Equal.equals(
    settings.textGenerationModelSelection ?? null,
    DEFAULT_UNIFIED_SETTINGS.textGenerationModelSelection ?? null,
  );
  const isBackgroundActivityDirty = hasChangedBackgroundActivitySettings(settings);

  const changedSettingLabels = [
    ...(theme !== "system" ? ["Theme"] : []),
    ...(!followSystem ? ["跟随系统"] : []),
    ...(themeHalves !== null ? ["Theme mix"] : []),
    ...(settings.appearanceContrast !== DEFAULT_UNIFIED_SETTINGS.appearanceContrast
      ? ["对比度"]
      : []),
    ...(settings.glassOpacity !== DEFAULT_UNIFIED_SETTINGS.glassOpacity
      ? ["玻璃效果不透明度"]
      : []),
    ...(settings.diffColorScheme !== DEFAULT_UNIFIED_SETTINGS.diffColorScheme ? ["差异颜色"] : []),
    ...(settings.chatWidth !== DEFAULT_UNIFIED_SETTINGS.chatWidth ? ["对话宽度"] : []),
    ...(settings.effortDisplay !== DEFAULT_UNIFIED_SETTINGS.effortDisplay ? ["思考强度显示"] : []),
    ...(settings.interactiveAnswersEnabled !== DEFAULT_UNIFIED_SETTINGS.interactiveAnswersEnabled
      ? ["交互式回答"]
      : []),
    ...(settings.mathRenderingEnabled !== DEFAULT_UNIFIED_SETTINGS.mathRenderingEnabled
      ? ["渲染数学公式"]
      : []),
    ...(settings.panelAnimationDurationMs !== DEFAULT_UNIFIED_SETTINGS.panelAnimationDurationMs
      ? ["面板动画"]
      : []),
    ...(settings.environmentIdentificationMode !==
    DEFAULT_UNIFIED_SETTINGS.environmentIdentificationMode
      ? ["环境标识"]
      : []),
    ...(settings.timestampFormat !== DEFAULT_UNIFIED_SETTINGS.timestampFormat ? ["时间格式"] : []),
    ...(settings.notificationMode !== DEFAULT_UNIFIED_SETTINGS.notificationMode
      ? ["会话通知"]
      : []),
    ...(settings.inAppNotificationsEnabled !== DEFAULT_UNIFIED_SETTINGS.inAppNotificationsEnabled
      ? ["应用内通知"]
      : []),
    ...(settings.sidebarProjectGroupingMode !== DEFAULT_UNIFIED_SETTINGS.sidebarProjectGroupingMode
      ? ["Project Grouping"]
      : []),
    ...(settings.sidebarProjectSortOrder !== DEFAULT_UNIFIED_SETTINGS.sidebarProjectSortOrder
      ? ["项目排序"]
      : []),
    ...(settings.sidebarWorkingShelfEnabled !== DEFAULT_UNIFIED_SETTINGS.sidebarWorkingShelfEnabled
      ? ["处理中分组"]
      : []),
    ...(settings.sidebarAutoSettleAfterDays !== DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleAfterDays
      ? ["自动归结不活跃会话"]
      : []),
    ...(settings.sidebarAutoSettleKeepPullRequests !==
    DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleKeepPullRequests
      ? ["保留有关联拉取请求的会话"]
      : []),
    ...(settings.sidebarAutoSettleOnMerge !== DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleOnMerge
      ? ["合并后自动归结会话"]
      : []),
    ...(settings.autoResumeLimitedThreads !== DEFAULT_UNIFIED_SETTINGS.autoResumeLimitedThreads
      ? ["用量限制重置后恢复"]
      : []),
    ...(settings.snoozeLimitedThreads !== DEFAULT_UNIFIED_SETTINGS.snoozeLimitedThreads
      ? ["推迟到用量限制重置"]
      : []),
    ...(!Equal.equals(settings.snoozePresets, DEFAULT_UNIFIED_SETTINGS.snoozePresets)
      ? ["稍后处理选项"]
      : []),
    ...(settings.wordWrap !== DEFAULT_UNIFIED_SETTINGS.wordWrap ? ["自动换行"] : []),
    ...(settings.persistComposerContextStrip !==
    DEFAULT_UNIFIED_SETTINGS.persistComposerContextStrip
      ? ["输入框上下文"]
      : []),
    ...getChangedTypographySettingLabels(settings),
    ...(settings.diffFilesCollapsed !== DEFAULT_UNIFIED_SETTINGS.diffFilesCollapsed
      ? ["差异文件默认状态"]
      : []),
    ...(settings.diffIgnoreWhitespace !== DEFAULT_UNIFIED_SETTINGS.diffIgnoreWhitespace
      ? ["Diff whitespace changes"]
      : []),
    ...(settings.diffLayout !== DEFAULT_UNIFIED_SETTINGS.diffLayout ? ["差异布局"] : []),
    ...(settings.proactivePanelsEnabled !== DEFAULT_UNIFIED_SETTINGS.proactivePanelsEnabled
      ? ["自动打开拉取请求与变更面板"]
      : []),
    ...(settings.showSkillsInSlashMenu !== DEFAULT_UNIFIED_SETTINGS.showSkillsInSlashMenu
      ? ["在 / 菜单中显示技能"]
      : []),
    ...(settings.composerRichTextEnabled !== DEFAULT_UNIFIED_SETTINGS.composerRichTextEnabled
      ? ["富文本输入框"]
      : []),
    ...(settings.sendShortcut !== DEFAULT_UNIFIED_SETTINGS.sendShortcut ? ["发送快捷键"] : []),
    ...(settings.followUpBehavior !== DEFAULT_UNIFIED_SETTINGS.followUpBehavior
      ? ["后续消息处理方式"]
      : []),
    ...(settings.contextWindowMeterEnabled !== DEFAULT_UNIFIED_SETTINGS.contextWindowMeterEnabled
      ? ["Context window indicator"]
      : []),
    ...(settings.responseStreamingMode !== DEFAULT_UNIFIED_SETTINGS.responseStreamingMode
      ? ["流式输出"]
      : []),
    ...(settings.enableProviderUpdateChecks !== DEFAULT_UNIFIED_SETTINGS.enableProviderUpdateChecks
      ? ["服务更新检查"]
      : []),
    ...(settings.continueThreadsAfterServerUpdate !==
    DEFAULT_UNIFIED_SETTINGS.continueThreadsAfterServerUpdate
      ? ["重启后继续会话"]
      : []),
    ...(isBackgroundActivityDirty ? ["后台活动"] : []),
    ...(settings.defaultThreadEnvMode !== DEFAULT_UNIFIED_SETTINGS.defaultThreadEnvMode
      ? ["New thread mode"]
      : []),
    ...(settings.newWorktreesStartFromOrigin !==
    DEFAULT_UNIFIED_SETTINGS.newWorktreesStartFromOrigin
      ? ["New worktrees start from remote"]
      : []),
    ...(settings.addProjectBaseDirectory !== DEFAULT_UNIFIED_SETTINGS.addProjectBaseDirectory
      ? ["添加项目的起始目录"]
      : []),
    ...(settings.confirmThreadUnpin !== DEFAULT_UNIFIED_SETTINGS.confirmThreadUnpin
      ? ["取消置顶确认"]
      : []),
    ...(settings.confirmThreadArchive !== DEFAULT_UNIFIED_SETTINGS.confirmThreadArchive
      ? ["归档确认"]
      : []),
    ...(settings.confirmThreadDelete !== DEFAULT_UNIFIED_SETTINGS.confirmThreadDelete
      ? ["删除确认"]
      : []),
    ...(settings.confirmQuit !== DEFAULT_UNIFIED_SETTINGS.confirmQuit ? ["退出快捷键"] : []),
    ...(isTextGenerationModelDirty ? ["文本生成模型"] : []),
    ...(settings.threadTitleInstructions !== DEFAULT_UNIFIED_SETTINGS.threadTitleInstructions
      ? ["会话标题生成要求"]
      : []),
    ...getChangedBrowserSettingLabels(settings),
    ...(settings.enableAgentBrowserAccess !== DEFAULT_UNIFIED_SETTINGS.enableAgentBrowserAccess
      ? ["智能体浏览器权限"]
      : []),
  ];

  const restoreDefaults = async () => {
    if (changedSettingLabels.length === 0) return;
    const api = readLocalApi();
    const confirmed = await (api ?? ensureLocalApi()).dialogs.confirm(
      ["Restore default settings?", `This will reset: ${changedSettingLabels.join(", ")}.`].join(
        "\n",
      ),
      { variant: "destructive" },
    );
    if (!confirmed) return;

    // Reset only dirty theme keys so storage failures cannot block other settings; re-read after confirmation
    // for safe rollback.
    let previousTheme = theme;
    try {
      previousTheme = readThemePreference();
    } catch {}
    const liveHalves = readThemeHalves();
    const needsThemeReset = previousTheme !== "system";
    const needsMixReset = liveHalves !== null;
    const needsFollowSystemReset = readAppearanceModePreference(previousTheme) !== "system";
    const notifyThemeRestoreFailure = () => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "无法恢复主题设置",
          description: "请重试。",
        }),
      );
    };
    // Restore the base preference before the mix because restoring the base clears the mix.
    const previousHalves = liveHalves;
    const rollbackThemeState = () => {
      if (needsThemeReset) setTheme(previousTheme);
      if (previousHalves?.light) setThemeHalf("light", previousHalves.light);
      if (previousHalves?.dark) setThemeHalf("dark", previousHalves.dark);
    };
    if (needsThemeReset && !setTheme("system")) {
      notifyThemeRestoreFailure();
      return;
    }
    if (needsMixReset && !clearThemeHalves()) {
      rollbackThemeState();
      notifyThemeRestoreFailure();
      return;
    }
    if (needsFollowSystemReset && !setFollowSystem(true)) {
      rollbackThemeState();
      notifyThemeRestoreFailure();
      return;
    }
    updateSettings({
      appearanceContrast: DEFAULT_UNIFIED_SETTINGS.appearanceContrast,
      diffColorScheme: DEFAULT_UNIFIED_SETTINGS.diffColorScheme,
      chatWidth: DEFAULT_UNIFIED_SETTINGS.chatWidth,
      effortDisplay: DEFAULT_UNIFIED_SETTINGS.effortDisplay,
      mathRenderingEnabled: DEFAULT_UNIFIED_SETTINGS.mathRenderingEnabled,
      interactiveAnswersEnabled: DEFAULT_UNIFIED_SETTINGS.interactiveAnswersEnabled,
      timestampFormat: DEFAULT_UNIFIED_SETTINGS.timestampFormat,
      notificationMode: DEFAULT_UNIFIED_SETTINGS.notificationMode,
      inAppNotificationsEnabled: DEFAULT_UNIFIED_SETTINGS.inAppNotificationsEnabled,
      wordWrap: DEFAULT_UNIFIED_SETTINGS.wordWrap,
      persistComposerContextStrip: DEFAULT_UNIFIED_SETTINGS.persistComposerContextStrip,
      diffFilesCollapsed: DEFAULT_UNIFIED_SETTINGS.diffFilesCollapsed,
      diffIgnoreWhitespace: DEFAULT_UNIFIED_SETTINGS.diffIgnoreWhitespace,
      diffLayout: DEFAULT_UNIFIED_SETTINGS.diffLayout,
      proactivePanelsEnabled: DEFAULT_UNIFIED_SETTINGS.proactivePanelsEnabled,
      showSkillsInSlashMenu: DEFAULT_UNIFIED_SETTINGS.showSkillsInSlashMenu,
      composerRichTextEnabled: DEFAULT_UNIFIED_SETTINGS.composerRichTextEnabled,
      sendShortcut: DEFAULT_UNIFIED_SETTINGS.sendShortcut,
      followUpBehavior: DEFAULT_UNIFIED_SETTINGS.followUpBehavior,
      contextWindowMeterEnabled: DEFAULT_UNIFIED_SETTINGS.contextWindowMeterEnabled,
      environmentIdentificationMode: DEFAULT_UNIFIED_SETTINGS.environmentIdentificationMode,
      glassOpacity: DEFAULT_UNIFIED_SETTINGS.glassOpacity,
      panelAnimationDurationMs: DEFAULT_UNIFIED_SETTINGS.panelAnimationDurationMs,
      sidebarProjectGroupingMode: DEFAULT_UNIFIED_SETTINGS.sidebarProjectGroupingMode,
      sidebarProjectSortOrder: DEFAULT_UNIFIED_SETTINGS.sidebarProjectSortOrder,
      sidebarWorkingShelfEnabled: DEFAULT_UNIFIED_SETTINGS.sidebarWorkingShelfEnabled,
      sidebarAutoSettleAfterDays: DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleAfterDays,
      sidebarAutoSettleKeepPullRequests: DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleKeepPullRequests,
      sidebarAutoSettleOnMerge: DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleOnMerge,
      autoResumeLimitedThreads: DEFAULT_UNIFIED_SETTINGS.autoResumeLimitedThreads,
      snoozeLimitedThreads: DEFAULT_UNIFIED_SETTINGS.snoozeLimitedThreads,
      snoozePresets: DEFAULT_UNIFIED_SETTINGS.snoozePresets,
      responseStreamingMode: DEFAULT_UNIFIED_SETTINGS.responseStreamingMode,
      enableProviderUpdateChecks: DEFAULT_UNIFIED_SETTINGS.enableProviderUpdateChecks,
      continueThreadsAfterServerUpdate: DEFAULT_UNIFIED_SETTINGS.continueThreadsAfterServerUpdate,
      backgroundActivity: DEFAULT_UNIFIED_SETTINGS.backgroundActivity,
      backgroundActivityProfile: DEFAULT_UNIFIED_SETTINGS.backgroundActivityProfile,
      automaticGitFetchInterval: DEFAULT_UNIFIED_SETTINGS.automaticGitFetchInterval,
      providerHealthRefreshInterval: DEFAULT_UNIFIED_SETTINGS.providerHealthRefreshInterval,
      defaultThreadEnvMode: DEFAULT_UNIFIED_SETTINGS.defaultThreadEnvMode,
      newWorktreesStartFromOrigin: DEFAULT_UNIFIED_SETTINGS.newWorktreesStartFromOrigin,
      addProjectBaseDirectory: DEFAULT_UNIFIED_SETTINGS.addProjectBaseDirectory,
      confirmThreadArchive: DEFAULT_UNIFIED_SETTINGS.confirmThreadArchive,
      confirmThreadDelete: DEFAULT_UNIFIED_SETTINGS.confirmThreadDelete,
      confirmThreadUnpin: DEFAULT_UNIFIED_SETTINGS.confirmThreadUnpin,
      confirmQuit: DEFAULT_UNIFIED_SETTINGS.confirmQuit,
      textGenerationModelSelection: DEFAULT_UNIFIED_SETTINGS.textGenerationModelSelection,
      threadTitleInstructions: DEFAULT_UNIFIED_SETTINGS.threadTitleInstructions,
      fontFamilySans: DEFAULT_UNIFIED_SETTINGS.fontFamilySans,
      fontFamilyComposer: DEFAULT_UNIFIED_SETTINGS.fontFamilyComposer,
      fontFamilyCode: DEFAULT_UNIFIED_SETTINGS.fontFamilyCode,
      fontFamilyTerminal: DEFAULT_UNIFIED_SETTINGS.fontFamilyTerminal,
      fontSizeInterface: DEFAULT_UNIFIED_SETTINGS.fontSizeInterface,
      fontSizePrompt: DEFAULT_UNIFIED_SETTINGS.fontSizePrompt,
      fontSizeCode: DEFAULT_UNIFIED_SETTINGS.fontSizeCode,
      fontSizeTerminal: DEFAULT_UNIFIED_SETTINGS.fontSizeTerminal,
      browserDefaultViewport: DEFAULT_UNIFIED_SETTINGS.browserDefaultViewport,
      browserDefaultZoomFactor: DEFAULT_UNIFIED_SETTINGS.browserDefaultZoomFactor,
      browserDefaultAppearance: DEFAULT_UNIFIED_SETTINGS.browserDefaultAppearance,
      browserRecordingFrameRate: DEFAULT_UNIFIED_SETTINGS.browserRecordingFrameRate,
      browserRecordingShowKeyPresses: DEFAULT_UNIFIED_SETTINGS.browserRecordingShowKeyPresses,
      browserRecordingShowMousePresses: DEFAULT_UNIFIED_SETTINGS.browserRecordingShowMousePresses,
      browserLinkTarget: DEFAULT_UNIFIED_SETTINGS.browserLinkTarget,
      browserSearchEngine: DEFAULT_UNIFIED_SETTINGS.browserSearchEngine,
      browserCustomSearchUrl: DEFAULT_UNIFIED_SETTINGS.browserCustomSearchUrl,
      browserAutoShowFloatingPreview: DEFAULT_UNIFIED_SETTINGS.browserAutoShowFloatingPreview,
      pullRequestLinksOpenInApp: DEFAULT_UNIFIED_SETTINGS.pullRequestLinksOpenInApp,
      enableAgentBrowserAccess: DEFAULT_UNIFIED_SETTINGS.enableAgentBrowserAccess,
    });
    onRestored?.();
  };

  return {
    changedSettingLabels,
    restoreDefaults,
  };
}

const AUTO_SETTLE_DEFAULT_DAYS = DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleAfterDays ?? 3;

function AutoSettleDaysInput({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (days: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [draftSource, setDraftSource] = useState(value);
  if (draftSource !== value) {
    setDraftSource(value);
    setDraft(String(value));
  }

  return (
    <Input
      size="sm"
      type="number"
      min={MIN_SIDEBAR_AUTO_SETTLE_AFTER_DAYS}
      max={MAX_SIDEBAR_AUTO_SETTLE_AFTER_DAYS}
      className="w-full sm:w-24"
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        const parsed = Number(event.target.value);
        if (
          Number.isInteger(parsed) &&
          parsed >= MIN_SIDEBAR_AUTO_SETTLE_AFTER_DAYS &&
          parsed <= MAX_SIDEBAR_AUTO_SETTLE_AFTER_DAYS
        ) {
          onCommit(parsed);
        }
      }}
      onBlur={() => setDraft(String(value))}
      aria-label="无活动多少天后自动归结"
    />
  );
}

export function LegacyFeaturesSection() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();

  return (
    <SettingsSection id="legacy-features" title="旧版功能">
      <SettingsRow
        {...searchableSetting("legacy-plan-mode")}
        description="恢复构建/规划模式、/plan、/default 和 Shift+Tab。关闭后使用构建模式。"
        control={
          <Switch
            checked={settings.planModeEnabled}
            onCheckedChange={(checked) => {
              updateSettings({ planModeEnabled: Boolean(checked) });
            }}
            aria-label="规划模式（旧版）"
          />
        }
      />
      <SettingsRow
        {...searchableSetting("legacy-context-window-indicator")}
        description="在输入框中用圆环显示上下文使用量。"
        control={
          <Switch
            checked={settings.contextWindowMeterEnabled}
            onCheckedChange={(checked) =>
              updateSettings({ contextWindowMeterEnabled: Boolean(checked) })
            }
            aria-label="上下文用量指示器（旧版）"
          />
        }
      />
    </SettingsSection>
  );
}

export function GeneralSettingsPanel() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const lastEnabledProjectGroupingMode = useRef<SidebarProjectGroupingMode>(
    readLastEnabledProjectGroupingMode(),
  );

  return (
    <SettingsPageContainer>
      <SettingsSection id="notifications" title="通知">
        <NotificationSettings />
        <SettingsRow
          {...searchableSetting("in-app-notifications")}
          description="使用应用时，其他会话完成、失败或需要输入、批准时显示通知。"
          control={
            <Switch
              checked={settings.inAppNotificationsEnabled}
              onCheckedChange={(checked) => updateSettings({ inAppNotificationsEnabled: checked })}
              aria-label="应用内通知"
            />
          }
        />
      </SettingsSection>

      <SettingsSection id="sidebar" title="侧栏">
        <SettingsRow
          {...searchableSetting("project-grouping")}
          description="合并显示不同环境中的同一仓库。"
          resetAction={
            settings.sidebarProjectGroupingMode !==
            DEFAULT_UNIFIED_SETTINGS.sidebarProjectGroupingMode ? (
              <SettingResetButton
                label="project grouping"
                onClick={() =>
                  updateSettings({
                    sidebarProjectGroupingMode: DEFAULT_UNIFIED_SETTINGS.sidebarProjectGroupingMode,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={isProjectGroupingEnabled(settings.sidebarProjectGroupingMode)}
              onCheckedChange={(checked) => {
                if (!checked && settings.sidebarProjectGroupingMode !== "separate") {
                  lastEnabledProjectGroupingMode.current = settings.sidebarProjectGroupingMode;
                  rememberEnabledProjectGroupingMode(settings.sidebarProjectGroupingMode);
                }
                updateSettings({
                  sidebarProjectGroupingMode: projectGroupingModeFromToggle(
                    checked,
                    lastEnabledProjectGroupingMode.current,
                  ),
                });
              }}
              aria-label="项目分组"
            />
          }
        />
        <SettingsRow
          {...searchableSetting("project-order")}
          description="设置侧栏项目选择器和命令面板中的项目顺序。"
          resetAction={
            settings.sidebarProjectSortOrder !==
            DEFAULT_UNIFIED_SETTINGS.sidebarProjectSortOrder ? (
              <SettingResetButton
                label="project order"
                onClick={() =>
                  updateSettings({
                    sidebarProjectSortOrder: DEFAULT_UNIFIED_SETTINGS.sidebarProjectSortOrder,
                  })
                }
              />
            ) : null
          }
          control={
            <Select
              value={settings.sidebarProjectSortOrder}
              onValueChange={(value) => {
                if (isSidebarProjectSortOrder(value)) {
                  updateSettings({ sidebarProjectSortOrder: value });
                }
              }}
            >
              <SelectTrigger size="sm" className="w-full sm:w-44" aria-label="项目排序">
                <SelectValue>
                  {SIDEBAR_PROJECT_SORT_ORDER_LABELS[settings.sidebarProjectSortOrder]}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {SidebarProjectSortOrder.literals.map((sortOrder) => (
                  <SelectItem hideIndicator key={sortOrder} value={sortOrder}>
                    {SIDEBAR_PROJECT_SORT_ORDER_LABELS[sortOrder]}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />
        <SettingsRow
          {...searchableSetting("working-shelf")}
          description="将运行中和监控中的会话收进“处理中”分组，需要你操作时再移回列表顶部。实验功能中的简洁侧栏不显示此分组。"
          resetAction={
            settings.sidebarWorkingShelfEnabled !==
            DEFAULT_UNIFIED_SETTINGS.sidebarWorkingShelfEnabled ? (
              <SettingResetButton
                label="working section"
                onClick={() =>
                  updateSettings({
                    sidebarWorkingShelfEnabled: DEFAULT_UNIFIED_SETTINGS.sidebarWorkingShelfEnabled,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.sidebarWorkingShelfEnabled}
              onCheckedChange={(checked) =>
                updateSettings({ sidebarWorkingShelfEnabled: Boolean(checked) })
              }
              aria-label="处理中分组"
            />
          }
        />
      </SettingsSection>

      <SettingsSection id="confirmations" title="操作确认">
        <SettingsRow
          {...searchableSetting("unpin-confirmation")}
          description="取消置顶会话前先确认。"
          resetAction={
            settings.confirmThreadUnpin !== DEFAULT_UNIFIED_SETTINGS.confirmThreadUnpin ? (
              <SettingResetButton
                label="unpin confirmation"
                onClick={() =>
                  updateSettings({
                    confirmThreadUnpin: DEFAULT_UNIFIED_SETTINGS.confirmThreadUnpin,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.confirmThreadUnpin}
              onCheckedChange={(checked) =>
                updateSettings({ confirmThreadUnpin: Boolean(checked) })
              }
              aria-label="取消置顶前确认"
            />
          }
        />
        <SettingsRow
          {...searchableSetting("archive-confirmation")}
          description="再次点击归档按钮后才归档会话。"
          resetAction={
            settings.confirmThreadArchive !== DEFAULT_UNIFIED_SETTINGS.confirmThreadArchive ? (
              <SettingResetButton
                label="archive confirmation"
                onClick={() =>
                  updateSettings({
                    confirmThreadArchive: DEFAULT_UNIFIED_SETTINGS.confirmThreadArchive,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.confirmThreadArchive}
              onCheckedChange={(checked) =>
                updateSettings({ confirmThreadArchive: Boolean(checked) })
              }
              aria-label="归档会话前确认"
            />
          }
        />
        <SettingsRow
          {...searchableSetting("delete-confirmation")}
          description="删除会话及其聊天记录前先确认。"
          resetAction={
            settings.confirmThreadDelete !== DEFAULT_UNIFIED_SETTINGS.confirmThreadDelete ? (
              <SettingResetButton
                label="delete confirmation"
                onClick={() =>
                  updateSettings({
                    confirmThreadDelete: DEFAULT_UNIFIED_SETTINGS.confirmThreadDelete,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.confirmThreadDelete}
              onCheckedChange={(checked) =>
                updateSettings({ confirmThreadDelete: Boolean(checked) })
              }
              aria-label="删除会话前确认"
            />
          }
        />
        {isElectron ? (
          <SettingsRow
            {...searchableSetting("quit-confirmation")}
            description="长按模式也支持快速按两次退出。"
            resetAction={
              settings.confirmQuit !== DEFAULT_UNIFIED_SETTINGS.confirmQuit ? (
                <SettingResetButton
                  label="quit shortcut behavior"
                  onClick={() =>
                    updateSettings({ confirmQuit: DEFAULT_UNIFIED_SETTINGS.confirmQuit })
                  }
                />
              ) : null
            }
            control={
              <Select
                value={settings.confirmQuit}
                onValueChange={(value) => {
                  if (value === "direct" || value === "hold" || value === "double-click") {
                    updateSettings({ confirmQuit: value });
                  }
                }}
              >
                <SelectTrigger size="sm" className="w-full sm:w-40" aria-label="退出快捷键行为">
                  <SelectValue>{QUIT_CONFIRMATION_MODE_LABELS[settings.confirmQuit]}</SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  {Object.entries(QUIT_CONFIRMATION_MODE_LABELS).map(([value, label]) => (
                    <SelectItem hideIndicator key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            }
          />
        ) : null}
      </SettingsSection>

      <SettingsSection id="display" title="显示">
        <SettingsRow
          {...searchableSetting("time-format")}
          description="系统默认会跟随浏览器或操作系统的时间格式。"
          resetAction={
            settings.timestampFormat !== DEFAULT_UNIFIED_SETTINGS.timestampFormat ? (
              <SettingResetButton
                label="time format"
                onClick={() =>
                  updateSettings({
                    timestampFormat: DEFAULT_UNIFIED_SETTINGS.timestampFormat,
                  })
                }
              />
            ) : null
          }
          control={
            <Select
              value={settings.timestampFormat}
              onValueChange={(value) => {
                if (value === "locale" || value === "12-hour" || value === "24-hour") {
                  updateSettings({ timestampFormat: value });
                }
              }}
            >
              <SelectTrigger size="sm" className="w-full sm:w-40" aria-label="时间显示格式">
                <SelectValue>{TIMESTAMP_FORMAT_LABELS[settings.timestampFormat]}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="locale">
                  {TIMESTAMP_FORMAT_LABELS.locale}
                </SelectItem>
                <SelectItem hideIndicator value="12 小时制">
                  {TIMESTAMP_FORMAT_LABELS["12-hour"]}
                </SelectItem>
                <SelectItem hideIndicator value="24 小时制">
                  {TIMESTAMP_FORMAT_LABELS["24-hour"]}
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}

export function ChatSettingsPanel() {
  const modifierLabel = isMacPlatform(navigator.platform) ? "⌘" : "Ctrl";
  const sendShortcutOptions = [
    { value: "enter", label: "Enter" },
    { value: "mod-enter-multiline", label: `${modifierLabel} + Enter for multiline prompts` },
    { value: "mod-enter", label: `${modifierLabel} + Enter always` },
  ] as const;
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();

  return (
    <SettingsPageContainer>
      <SettingsSection id="composer" title="输入框">
        <SettingsRow
          {...searchableSetting("composer-rich-text")}
          description="输入时显示 Markdown 格式效果。"
          resetAction={
            settings.composerRichTextEnabled !==
            DEFAULT_UNIFIED_SETTINGS.composerRichTextEnabled ? (
              <SettingResetButton
                label="rich text composer"
                onClick={() =>
                  updateSettings({
                    composerRichTextEnabled: DEFAULT_UNIFIED_SETTINGS.composerRichTextEnabled,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.composerRichTextEnabled}
              onCheckedChange={(checked) =>
                updateSettings({ composerRichTextEnabled: Boolean(checked) })
              }
              aria-label="富文本输入框"
            />
          }
        />
        <SettingsRow
          {...searchableSetting("send-shortcut")}
          description="设置 Enter 键发送消息或换行的方式"
          resetAction={
            settings.sendShortcut !== DEFAULT_UNIFIED_SETTINGS.sendShortcut ? (
              <SettingResetButton
                label="send shortcut"
                onClick={() =>
                  updateSettings({ sendShortcut: DEFAULT_UNIFIED_SETTINGS.sendShortcut })
                }
              />
            ) : null
          }
          control={
            <Select
              value={settings.sendShortcut}
              onValueChange={(value) => {
                const option = sendShortcutOptions.find((option) => option.value === value);
                if (option) updateSettings({ sendShortcut: option.value });
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-auto min-w-0 max-w-full"
                aria-label="发送快捷键"
              >
                <SelectValue>
                  {
                    sendShortcutOptions.find((option) => option.value === settings.sendShortcut)
                      ?.label
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {sendShortcutOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <span className="flex items-center justify-between gap-4">
                      {option.label}
                      {settings.sendShortcut === option.value && <CheckIcon aria-hidden="true" />}
                    </span>
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />
        <AdvancedSettings targetIds={[searchableSetting("skills-in-slash-menu").id]}>
          <SettingsRow
            {...searchableSetting("skills-in-slash-menu")}
            description="在 / 命令菜单中同时显示技能。输入 $ 时始终显示技能。"
            resetAction={
              settings.showSkillsInSlashMenu !== DEFAULT_UNIFIED_SETTINGS.showSkillsInSlashMenu ? (
                <SettingResetButton
                  label="skills in slash menu"
                  onClick={() =>
                    updateSettings({
                      showSkillsInSlashMenu: DEFAULT_UNIFIED_SETTINGS.showSkillsInSlashMenu,
                    })
                  }
                />
              ) : null
            }
            control={
              <Switch
                checked={settings.showSkillsInSlashMenu}
                onCheckedChange={(checked) =>
                  updateSettings({ showSkillsInSlashMenu: Boolean(checked) })
                }
                aria-label="在 / 菜单中显示技能"
              />
            }
          />
        </AdvancedSettings>
      </SettingsSection>

      <SettingsSection id="follow-ups" title="后续消息">
        <SettingsRow
          {...searchableSetting("follow-up-behavior")}
          description={
            "Queue follow-ups while the agent runs or steer the current run. " +
            (settings.sendShortcut === "mod-enter-multiline"
              ? `Press ${modifierLabel} + Enter for single-line prompts or ${modifierLabel} + Shift + Enter for multiline prompts to do the opposite for one message.`
              : `Press ${modifierLabel}${settings.sendShortcut === "mod-enter" ? " + Shift" : ""} + Enter to do the opposite for one message.`)
          }
          resetAction={
            settings.followUpBehavior !== DEFAULT_UNIFIED_SETTINGS.followUpBehavior ? (
              <SettingResetButton
                label="follow-up behavior"
                onClick={() =>
                  updateSettings({
                    followUpBehavior: DEFAULT_UNIFIED_SETTINGS.followUpBehavior,
                  })
                }
              />
            ) : null
          }
          control={
            <Select
              value={settings.followUpBehavior}
              onValueChange={(value) => {
                if (value === "queue" || value === "steer") {
                  updateSettings({ followUpBehavior: value });
                }
              }}
            >
              <SelectTrigger size="sm" className="w-auto min-w-0" aria-label="后续消息处理方式">
                <SelectValue>
                  {settings.followUpBehavior === "queue" ? "排队" : "调整方向"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem value="queue">排队</SelectItem>
                <SelectItem value="steer">调整方向</SelectItem>
              </SelectPopup>
            </Select>
          }
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}

function DiffColorsSettingsRow() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  return (
    <SettingsRow
      {...searchableSetting("diff-color-scheme")}
      description="设置新增、删除及变更统计的颜色。"
      resetAction={
        settings.diffColorScheme !== DEFAULT_UNIFIED_SETTINGS.diffColorScheme ? (
          <SettingResetButton
            label="diff colors"
            onClick={() =>
              updateSettings({ diffColorScheme: DEFAULT_UNIFIED_SETTINGS.diffColorScheme })
            }
          />
        ) : null
      }
      control={
        <div className="w-full sm:w-40">
          <Select
            value={settings.diffColorScheme}
            onValueChange={(value) => {
              if (value === "red-green" || value === "blue-orange")
                updateSettings({ diffColorScheme: value });
            }}
          >
            <SelectTrigger size="sm" className="w-full min-w-0" aria-label="差异颜色">
              <span
                aria-hidden="true"
                className={
                  settings.diffColorScheme === "blue-orange"
                    ? "flex shrink-0 flex-row-reverse gap-1"
                    : "flex shrink-0 gap-1"
                }
              >
                <span className="size-2 rounded-full bg-diff-deletion" />
                <span className="size-2 rounded-full bg-diff-addition" />
              </span>
              <SelectValue>
                {settings.diffColorScheme === "blue-orange" ? "蓝色与橙色" : "Red & green"}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              <SelectItem value="red-green">红色与绿色（默认）</SelectItem>
              <SelectItem value="blue-orange">蓝色与橙色</SelectItem>
            </SelectPopup>
          </Select>
        </div>
      }
    />
  );
}

export function DiffsSettingsPanel() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();

  return (
    <SettingsPageContainer>
      <SettingsSection id="diffs" title="差异">
        <SettingsRow
          {...searchableSetting("diff-layout")}
          description="选择上下或左右显示差异，也可在差异工具栏中切换。"
          resetAction={
            settings.diffLayout !== DEFAULT_UNIFIED_SETTINGS.diffLayout ? (
              <SettingResetButton
                label="diff layout"
                onClick={() => updateSettings({ diffLayout: DEFAULT_UNIFIED_SETTINGS.diffLayout })}
              />
            ) : null
          }
          control={
            <Select
              value={settings.diffLayout}
              onValueChange={(value) => {
                if (value === "stacked" || value === "split") {
                  updateSettings({ diffLayout: value });
                }
              }}
            >
              <SelectTrigger size="sm" className="w-full sm:w-40" aria-label="差异布局">
                <SelectValue>{DIFF_LAYOUT_LABELS[settings.diffLayout]}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="stacked">
                  {DIFF_LAYOUT_LABELS.stacked}
                </SelectItem>
                <SelectItem hideIndicator value="split">
                  {DIFF_LAYOUT_LABELS.split}
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />
        <SettingsRow
          {...searchableSetting("hide-whitespace-changes")}
          description="设置差异面板是否默认忽略仅修改空白字符的变更。"
          resetAction={
            settings.diffIgnoreWhitespace !== DEFAULT_UNIFIED_SETTINGS.diffIgnoreWhitespace ? (
              <SettingResetButton
                label="diff whitespace changes"
                onClick={() =>
                  updateSettings({
                    diffIgnoreWhitespace: DEFAULT_UNIFIED_SETTINGS.diffIgnoreWhitespace,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.diffIgnoreWhitespace}
              onCheckedChange={(checked) =>
                updateSettings({ diffIgnoreWhitespace: Boolean(checked) })
              }
              aria-label="默认隐藏空白字符变更"
            />
          }
        />
        <SettingsRow
          {...searchableSetting("default-diff-file-state")}
          description="打开差异或拉取请求的代码页时，默认展开或折叠文件。"
          resetAction={
            settings.diffFilesCollapsed !== DEFAULT_UNIFIED_SETTINGS.diffFilesCollapsed ? (
              <SettingResetButton
                label="default diff file state"
                onClick={() =>
                  updateSettings({
                    diffFilesCollapsed: DEFAULT_UNIFIED_SETTINGS.diffFilesCollapsed,
                  })
                }
              />
            ) : null
          }
          control={
            <Select
              value={settings.diffFilesCollapsed ? "collapsed" : "expanded"}
              onValueChange={(value) => {
                if (value === "expanded" || value === "collapsed") {
                  updateSettings({ diffFilesCollapsed: value === "collapsed" });
                }
              }}
            >
              <SelectTrigger size="sm" className="w-full sm:w-40" aria-label="差异文件默认状态">
                <SelectValue>{settings.diffFilesCollapsed ? "折叠" : "展开"}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="expanded">
                  展开
                </SelectItem>
                <SelectItem hideIndicator value="collapsed">
                  折叠
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />
        <DiffColorsSettingsRow />
      </SettingsSection>

      <SettingsSection id="pull-requests" title="拉取请求">
        <SettingsRow
          {...searchableSetting("proactive-panels")}
          description="优先打开关联的拉取请求；没有关联时，修改达到 3 个文件或 50 行后自动打开变更面板。"
          resetAction={
            settings.proactivePanelsEnabled !== DEFAULT_UNIFIED_SETTINGS.proactivePanelsEnabled ? (
              <SettingResetButton
                label="proactive panels"
                onClick={() =>
                  updateSettings({
                    proactivePanelsEnabled: DEFAULT_UNIFIED_SETTINGS.proactivePanelsEnabled,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.proactivePanelsEnabled}
              onCheckedChange={(checked) =>
                updateSettings({ proactivePanelsEnabled: Boolean(checked) })
              }
              aria-label="自动打开拉取请求与变更面板"
            />
          }
        />
        <PullRequestLinksOpenInAppSetting />
      </SettingsSection>
    </SettingsPageContainer>
  );
}

/** The Providers panel can render without a settings scope, as its tests do; this row needs one. */
export function CompactIdleThreadsRow() {
  return useOptionalSettingsScope() === null ? null : <ScopedCompactIdleThreadsRow />;
}

function ScopedCompactIdleThreadsRow() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const { targets } = useSettingsScope();
  const idleCompaction = scopedIdleCompaction(targets.length > 0 ? targets : [{ settings }]);

  return (
    <SettingsRow
      serverScoped
      settingKeys={["idleCompaction", "compactIdleThreads"]}
      mixed={idleCompaction.mixed}
      {...searchableSetting("compact-idle-threads")}
      description="Claude 会话空闲且上下文超过 200,000 token 时，可在返回会话后、提示词缓存过期前压缩，或不压缩。各 Claude 服务可单独设置。"
      resetAction={
        globalIdleCompaction(settings) !== globalIdleCompaction(DEFAULT_UNIFIED_SETTINGS) ? (
          <SettingResetButton
            label="compact idle threads"
            onClick={() =>
              updateSettings({ idleCompaction: globalIdleCompaction(DEFAULT_UNIFIED_SETTINGS) })
            }
          />
        ) : null
      }
      control={
        <Select
          value={idleCompaction.mixed ? null : globalIdleCompaction(settings)}
          onValueChange={(value) => {
            const mode = IDLE_COMPACTION_MODES.find((candidate) => candidate.value === value);
            if (mode) updateSettings({ idleCompaction: mode.value });
          }}
        >
          <SelectTrigger size="sm" className="w-full sm:w-56" aria-label="压缩空闲会话">
            <SelectValue>
              {(value: string | null) =>
                value === null
                  ? "Mixed"
                  : IDLE_COMPACTION_MODES.find((mode) => mode.value === value)?.label
              }
            </SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            {IDLE_COMPACTION_MODES.map((mode) => (
              <SelectItem
                hideIndicator
                key={mode.value}
                value={mode.value}
                // A server from before modes has only the on/off switch, so it cannot store "Never".
                disabled={mode.value === "off" && !idleCompaction.neverAvailable}
              >
                {mode.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      }
    />
  );
}

export function ThreadsSettingsPanel() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const navigate = useNavigate();
  const { environment, connectedEnvironments, target, scope } = useSettingsScope();
  const isProjectScope = scope.kind === "project" || scope.kind === "checkout";
  const environmentId = environment?.environmentId ?? null;
  const hasServerTargets = connectedEnvironments.length > 0;
  const mixedResponseStreamingMode = useScopedSettingsMixed(["responseStreamingMode"]);
  const providersByEnvironment = useEnvironmentProviders();
  const serverProviders =
    (environment?.serverConfig
      ? providersByEnvironment.get(environment.environmentId)
      : undefined) ?? EMPTY_SERVER_PROVIDERS;
  const supportsAutoSettlementScope = connectedEnvironments.every(
    (target) => target.serverConfig?.environment.capabilities.threadAutoSettlementScope === true,
  );

  const textGenerationProviders = serverProviders.filter(
    (provider) => provider.supportsTextGeneration !== false,
  );
  const textGenerationModelSelection = resolveAppModelSelectionState(
    settings,
    textGenerationProviders,
  );
  const textGenInstanceId = textGenerationModelSelection.instanceId;
  const textGenModel = textGenerationModelSelection.model;
  const textGenModelOptions = textGenerationModelSelection.options;
  const textGenerationModelInstanceEntries = providerInstanceEntriesFor(
    textGenerationProviders,
    settings,
    target?.projectId ?? null,
  );
  const hasTextGenerationProvider = textGenerationModelInstanceEntries.some(
    (entry) => entry.enabled && entry.isAvailable,
  );
  const textGenInstanceEntry = textGenerationModelInstanceEntries.find(
    (entry) => entry.instanceId === textGenInstanceId,
  );
  const textGenProvider: ProviderDriverKind =
    textGenInstanceEntry?.driverKind ?? DEFAULT_DRIVER_KIND;
  const textGenerationModelOptionsByInstance = getCustomModelOptionsByInstance(
    settings,
    textGenerationProviders,
    textGenInstanceId,
    textGenModel,
  );
  const isTextGenerationModelDirty = !Equal.equals(
    settings.textGenerationModelSelection ?? null,
    DEFAULT_UNIFIED_SETTINGS.textGenerationModelSelection ?? null,
  );
  const textGenerationModelDisabledReason = useScopedModelDisabledReason(
    settings,
    textGenerationModelInstanceEntries,
  );
  const mixedAddProjectBaseDirectory = useScopedSettingsMixed(["addProjectBaseDirectory"]);
  const mixedTextGenerationModel = useScopedSettingsMixed(["textGenerationModelSelection"]);

  return (
    <SettingsPageContainer>
      <SettingsSection id="new-projects" title="新项目">
        <SettingsRow
          serverScoped
          settingKeys={["addProjectBaseDirectory"]}
          {...searchableSetting("add-project-starts-in")}
          description="留空时，添加项目将从 ~/ 开始浏览。"
          resetAction={
            settings.addProjectBaseDirectory !==
            DEFAULT_UNIFIED_SETTINGS.addProjectBaseDirectory ? (
              <SettingResetButton
                label="add project base directory"
                onClick={() =>
                  updateSettings({
                    addProjectBaseDirectory: DEFAULT_UNIFIED_SETTINGS.addProjectBaseDirectory,
                  })
                }
              />
            ) : null
          }
          control={
            <DraftInput
              size="sm"
              className="w-full sm:w-72"
              value={mixedAddProjectBaseDirectory ? "" : settings.addProjectBaseDirectory}
              onCommit={(next) => updateSettings({ addProjectBaseDirectory: next })}
              normalizeDraft={resolvePastedPath}
              placeholder={mixedAddProjectBaseDirectory ? "Mixed" : "~/"}
              spellCheck={false}
              aria-label="添加项目的起始目录"
            />
          }
        />
      </SettingsSection>

      <ProjectDefaultsSettings category="general" />

      {!isProjectScope ? (
        <SettingsSection id="snooze" title="稍后处理">
          <SnoozePresetsRow />
        </SettingsSection>
      ) : null}

      <SettingsSection id="usage-limits" title="用量限制">
        <SettingsRow
          serverScoped
          {...searchableSetting("auto-resume-limited-threads")}
          description="用量限制重置后自动恢复会话，可在每个会话中取消自动恢复。"
          settingKeys={["autoResumeLimitedThreads"]}
          control={
            <ScopedSwitch
              settingKeys={["autoResumeLimitedThreads"]}
              checked={settings.autoResumeLimitedThreads}
              onCheckedChange={(checked) =>
                updateSettings({ autoResumeLimitedThreads: Boolean(checked) })
              }
              aria-label="用量限制重置后恢复"
            />
          }
        />
        <SettingsRow
          serverScoped
          {...searchableSetting("snooze-limited-threads")}
          description="将会话推迟到用量限制重置时处理。启用自动恢复后，智能体会在重置后继续运行。"
          settingKeys={["snoozeLimitedThreads"]}
          control={
            <ScopedSwitch
              settingKeys={["snoozeLimitedThreads"]}
              checked={settings.snoozeLimitedThreads}
              onCheckedChange={(checked) =>
                updateSettings({ snoozeLimitedThreads: Boolean(checked) })
              }
              aria-label="推迟到用量限制重置"
            />
          }
        />
      </SettingsSection>

      {hasServerTargets ? (
        <SettingsSection id="auto-settle" title="自动归结">
          <SettingsRow
            serverScoped
            settingKeys={["sidebarAutoSettleOnMerge"]}
            {...searchableSetting("auto-settle-merged-threads")}
            description="拉取请求合并后归结会话；拉取请求关闭后仍会自动归结。"
            resetAction={
              settings.sidebarAutoSettleOnMerge !==
              DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleOnMerge ? (
                <SettingResetButton
                  label="auto-settle on merge"
                  onClick={() =>
                    updateSettings({
                      sidebarAutoSettleOnMerge: DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleOnMerge,
                    })
                  }
                />
              ) : null
            }
            control={
              <ScopedSwitch
                settingKeys={["sidebarAutoSettleOnMerge"]}
                checked={settings.sidebarAutoSettleOnMerge}
                onCheckedChange={(checked) =>
                  updateSettings({ sidebarAutoSettleOnMerge: Boolean(checked) })
                }
                aria-label="合并后自动归结会话"
              />
            }
          />

          <SettingsRow
            serverScoped
            settingKeys={["sidebarAutoSettleAfterDays"]}
            {...searchableSetting("auto-settle-inactive-threads")}
            description="侧栏中的会话连续无活动达到此时长后自动归结。"
            resetAction={
              settings.sidebarAutoSettleAfterDays !==
              DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleAfterDays ? (
                <SettingResetButton
                  label="auto-settle"
                  onClick={() =>
                    updateSettings({
                      sidebarAutoSettleAfterDays:
                        DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleAfterDays,
                    })
                  }
                />
              ) : null
            }
            control={
              <ScopedSwitch
                settingKeys={["sidebarAutoSettleAfterDays"]}
                checked={settings.sidebarAutoSettleAfterDays !== null}
                onCheckedChange={(checked) =>
                  updateSettings({
                    sidebarAutoSettleAfterDays: checked ? AUTO_SETTLE_DEFAULT_DAYS : null,
                  })
                }
                aria-label="自动归结不活跃会话"
              />
            }
          />
          {settings.sidebarAutoSettleAfterDays !== null ? (
            <SettingsRow
              serverScoped
              settingKeys={["sidebarAutoSettleAfterDays"]}
              title={searchableSetting("days-before-auto-settle").title}
              description="出现新活动时，会话会自动恢复为未归结。"
              control={
                <AutoSettleDaysInput
                  value={settings.sidebarAutoSettleAfterDays}
                  onCommit={(days) => updateSettings({ sidebarAutoSettleAfterDays: days })}
                />
              }
            />
          ) : null}
          {settings.sidebarAutoSettleAfterDays !== null && supportsAutoSettlementScope ? (
            <SettingsRow
              serverScoped
              settingKeys={["sidebarAutoSettleKeepPullRequests"]}
              title="保留有关联拉取请求的会话"
              description="有关联拉取请求的会话不会因不活跃而归结，但仍会在合并或关闭后归结。"
              control={
                <ScopedSwitch
                  settingKeys={["sidebarAutoSettleKeepPullRequests"]}
                  checked={settings.sidebarAutoSettleKeepPullRequests}
                  onCheckedChange={(checked) =>
                    updateSettings({ sidebarAutoSettleKeepPullRequests: checked })
                  }
                  aria-label="保留有关联拉取请求的会话"
                />
              }
            />
          ) : null}
        </SettingsSection>
      ) : null}

      <SettingsSection id="text-generation" title="文本生成">
        <SettingsRow
          serverScoped
          settingKeys={["textGenerationModelSelection"]}
          {...searchableSetting("text-generation-model")}
          description="使用此服务为已连接设备生成会话标题等文本。源代码管理可单独指定模型。"
          resetAction={
            hasServerTargets && isTextGenerationModelDirty ? (
              <SettingResetButton
                label="text generation model"
                onClick={() =>
                  updateSettings({
                    textGenerationModelSelection:
                      DEFAULT_UNIFIED_SETTINGS.textGenerationModelSelection,
                  })
                }
              />
            ) : null
          }
          control={
            !hasServerTargets ? (
              <span className="text-sm text-muted-foreground">
                连接环境后即可选择文本生成模型。
              </span>
            ) : !hasTextGenerationProvider ? (
              <span className="text-sm text-muted-foreground">没有可用的文本生成服务。</span>
            ) : (
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <ProviderModelPicker
                  environmentId={environmentId}
                  activeInstanceId={textGenInstanceId}
                  model={textGenModel}
                  lockedProvider={null}
                  instanceEntries={textGenerationModelInstanceEntries}
                  modelOptionsByInstance={textGenerationModelOptionsByInstance}
                  triggerClassName={SETTINGS_PICKER_TRIGGER_CLASSNAME}
                  {...(mixedTextGenerationModel ? { triggerLabel: "Mixed" } : {})}
                  getModelDisabledReason={textGenerationModelDisabledReason}
                  {...(environmentId
                    ? {
                        onOpenProviderSetup: (instanceId: ProviderInstanceId) => {
                          void navigate({
                            to: "/settings/providers",
                            search: { environmentId, instanceId },
                          });
                        },
                      }
                    : {})}
                  onInstanceModelChange={(instanceId, model) => {
                    const reason = textGenerationModelDisabledReason(instanceId, model);
                    if (reason) {
                      toastManager.add({
                        type: "error",
                        title: "文本生成模型未保存",
                        description: reason,
                      });
                      return;
                    }
                    updateSettings({
                      textGenerationModelSelection: resolveAppModelSelectionState(
                        {
                          ...settings,
                          textGenerationModelSelection: createModelSelection(instanceId, model),
                        },
                        textGenerationProviders,
                      ),
                    });
                  }}
                />
                {textGenInstanceEntry ? (
                  <TraitsPicker
                    provider={textGenProvider}
                    models={textGenInstanceEntry?.models ?? []}
                    model={textGenModel}
                    modelOptions={textGenModelOptions}
                    allowPromptInjectedEffort={false}
                    planModeEnabled={
                      settings.planModeEnabled || selectsPlanAgent(textGenModelOptions)
                    }
                    triggerClassName={SETTINGS_PICKER_TRIGGER_CLASSNAME}
                    onModelOptionsChange={(nextOptions) => {
                      updateSettings({
                        textGenerationModelSelection: resolveAppModelSelectionState(
                          {
                            ...settings,
                            textGenerationModelSelection: createModelSelection(
                              textGenInstanceId,
                              textGenModel,
                              nextOptions,
                            ),
                          },
                          textGenerationProviders,
                        ),
                      });
                    }}
                  />
                ) : null}
              </div>
            )
          }
        />
        <AdvancedSettings
          targetIds={[
            searchableSetting("thread-title-instructions").id,
            searchableSetting("response-streaming").id,
          ]}
        >
          <ThreadTitleInstructionsSettings />
          <SettingsRow
            serverScoped
            settingKeys={["responseStreamingMode"]}
            {...searchableSetting("response-streaming")}
            description={
              mixedResponseStreamingMode
                ? "The selected targets use different streaming modes."
                : RESPONSE_STREAMING_MODE_DESCRIPTIONS[settings.responseStreamingMode]
            }
            resetAction={
              settings.responseStreamingMode !== DEFAULT_UNIFIED_SETTINGS.responseStreamingMode ? (
                <SettingResetButton
                  label="response streaming"
                  onClick={() =>
                    updateSettings({
                      responseStreamingMode: DEFAULT_UNIFIED_SETTINGS.responseStreamingMode,
                    })
                  }
                />
              ) : null
            }
            control={
              <Select
                value={mixedResponseStreamingMode ? null : settings.responseStreamingMode}
                onValueChange={(value) => {
                  if (value === "turn" || value === "paragraph") {
                    updateSettings({ responseStreamingMode: value });
                  }
                }}
              >
                <SelectTrigger size="sm" className="w-full sm:w-56" aria-label="流式输出">
                  <SelectValue>
                    {(value: ResponseStreamingMode | null) =>
                      value === null ? "Mixed" : RESPONSE_STREAMING_MODE_LABELS[value]
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem hideIndicator value="turn">
                    {RESPONSE_STREAMING_MODE_LABELS.turn}
                  </SelectItem>
                  <SelectItem hideIndicator value="paragraph">
                    {RESPONSE_STREAMING_MODE_LABELS.paragraph}
                  </SelectItem>
                </SelectPopup>
              </Select>
            }
          />
        </AdvancedSettings>
      </SettingsSection>
    </SettingsPageContainer>
  );
}

export function MaintenanceSettingsPanel() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const { scope, environment, connectedEnvironments } = useSettingsScope();
  const environmentId = environment?.environmentId ?? null;
  const isEnvironmentScope = scope.environmentIds.length === 1 && environmentId !== null;
  const hasServerTargets = connectedEnvironments.length > 0;

  return (
    <SettingsPageContainer>
      <SettingsSection id="updates" title="更新">
        <SettingsRow
          serverScoped
          settingKeys={["enableProviderUpdateChecks"]}
          {...searchableSetting("provider-update-checks")}
          description="检查已安装的模型服务命令行工具，并更新模型列表。关闭后可能无法显示新模型。"
          resetAction={
            settings.enableProviderUpdateChecks !==
            DEFAULT_UNIFIED_SETTINGS.enableProviderUpdateChecks ? (
              <SettingResetButton
                label="provider update checks"
                onClick={() =>
                  updateSettings({
                    enableProviderUpdateChecks: DEFAULT_UNIFIED_SETTINGS.enableProviderUpdateChecks,
                  })
                }
              />
            ) : null
          }
          control={
            <ScopedSwitch
              settingKeys={["enableProviderUpdateChecks"]}
              checked={settings.enableProviderUpdateChecks}
              onCheckedChange={(checked) =>
                updateSettings({ enableProviderUpdateChecks: Boolean(checked) })
              }
              aria-label="检查服务版本"
            />
          }
        />
        <SettingsRow
          {...searchableSetting("continue-threads-after-server-update")}
          serverScoped
          settingKeys={["continueThreadsAfterServerUpdate"]}
          description="所选环境更新、崩溃或重启后，自动恢复中断的会话。"
          status={
            !hasServerTargets
              ? "All selected connected environments must support restart continuation."
              : undefined
          }
          resetAction={
            hasServerTargets &&
            settings.continueThreadsAfterServerUpdate !==
              DEFAULT_UNIFIED_SETTINGS.continueThreadsAfterServerUpdate ? (
              <SettingResetButton
                label="continue threads after restarts"
                onClick={() =>
                  updateSettings({
                    continueThreadsAfterServerUpdate:
                      DEFAULT_UNIFIED_SETTINGS.continueThreadsAfterServerUpdate,
                  })
                }
              />
            ) : null
          }
          control={
            <ScopedSwitch
              settingKeys={["continueThreadsAfterServerUpdate"]}
              checked={settings.continueThreadsAfterServerUpdate}
              disabled={!hasServerTargets}
              onCheckedChange={(checked) =>
                updateSettings({ continueThreadsAfterServerUpdate: Boolean(checked) })
              }
              aria-label="重启后继续会话"
            />
          }
        />
      </SettingsSection>

      <SettingsSection id="background" title="后台活动">
        <BackgroundActivitySettingsRow />
      </SettingsSection>

      <StorageCleanupSections />

      <SettingsSection id="diagnostics-section" title="诊断">
        <SettingsRow
          {...searchableSetting("diagnostics")}
          description={
            isEnvironmentScope
              ? "Inspect processes, resource use, and logs on this environment."
              : "Inspect processes, resource use, and logs on one environment at a time."
          }
          control={
            <Button
              render={
                <Link to="/settings/diagnostics" search={{ machine: environmentId ?? undefined }} />
              }
              size="sm"
              variant="outline"
            >
              查看诊断
            </Button>
          }
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}

export function AboutSettingsPanel() {
  const primaryPolicy = usePrimaryManagedPolicy();
  const telemetryOff = managedTelemetryOffMessage(primaryPolicy);
  return (
    <SettingsPageContainer>
      <SettingsSection id="about" title="应用">
        {primaryPolicy ? (
          <SettingsRow
            title="组织"
            description={`This environment is managed by ${primaryPolicy.organization}. Some settings and features follow its policy.`}
            control={
              primaryPolicy.supportUrl ? (
                <Button
                  render={
                    <a href={primaryPolicy.supportUrl} target="_blank" rel="noreferrer noopener" />
                  }
                  size="sm"
                  variant="outline"
                >
                  获取帮助
                </Button>
              ) : null
            }
          />
        ) : null}
        {isElectron || HOSTED_APP_CHANNEL ? (
          <AboutVersionSection />
        ) : (
          <>
            <SettingsRow
              id={searchableSetting("app-version").id}
              title={<AboutVersionTitle />}
              description="当前应用版本。"
            />
          </>
        )}
        <SettingsRow
          title="开屏动画"
          description="手写 welcome 后绘出云形标志。可按 Esc 跳过。"
          control={
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void import("../../lib/welcomeSplash").then(({ showWelcomeSplash }) =>
                  showWelcomeSplash(),
                );
              }}
            >
              重播开屏动画
            </Button>
          }
        />
        <MobileAppSettingsRow />
      </SettingsSection>

      <SettingsSection id="legal" title="法律信息">
        <SettingsRow
          {...searchableSetting("privacy-policy")}
          description={
            telemetryOff === undefined
              ? "How we handle your data, including the anonymous usage data kelaodeyun collects."
              : `How we handle your data. ${telemetryOff}`
          }
          control={
            <Button
              render={<a href={PRIVACY_POLICY_URL} target="_blank" rel="noreferrer noopener" />}
              size="sm"
              variant="outline"
            >
              查看政策
            </Button>
          }
        />
        <SettingsRow
          {...searchableSetting("open-source-licenses")}
          description="kelaodeyun 使用的依赖、资源和可选工具的许可声明。"
          control={
            <Button
              render={<Link to="/settings/open-source-licenses" />}
              size="sm"
              variant="outline"
            >
              查看许可
            </Button>
          }
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}
