import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { APP_BASE_NAME } from "~/branding";
import {
  isModifierPairShortcut,
  type ClientSettingsPatch,
  type DesktopSnapShotShortcutAvailability,
  type DesktopSnapShotSetupAction,
  type SnapShotShortcut,
} from "@t3tools/contracts";
import { PlayIcon } from "lucide-react";
import { settlePromise } from "@t3tools/client-runtime/state/runtime";
import * as Cause from "effect/Cause";
import { useContext, useRef, useState } from "react";

import { useClientSettings, updateClientSettings } from "../../hooks/useSettings";
import { getDesktopSnapShotBridge } from "../../lib/desktopSnapShot";
import {
  saveSnapShotSetupResume,
  clearSnapShotSetupResume,
  readSnapShotSetupResume,
} from "../../lib/snapShotSetupResume";
import { sameSnapShotShortcut, snapShotKeybindingConflict } from "../../lib/snapShotShortcut";
import { playSnapShotSound } from "../../lib/snapShotSound";
import {
  desktopSnapShotAtom,
  refreshDesktopSnapShotState,
  snapShotSetupError,
  type SnapShotSetupError,
} from "../../state/desktopSnapShot";
import { toastManager } from "../ui/toast";
import { primaryServerKeybindingsAtom } from "../../state/server";
import { commandLabel } from "./KeybindingsSettings.logic";
import {
  snapShotStatus,
  snapShotShortcutStatus,
  snapShotSetupButtonLabel,
  snapShotUnavailableMessage,
  snapShotSoundPatch,
  snapShotFeedbackUnavailableMessage,
  snapShotDescription,
  snapShotAccessibilityUnavailableMessage,
  snapShotSetupComplete,
  type SnapShotSoundSelection,
} from "./SnapShotSettings.logic";
import {
  SettingsUnavailableGroup,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "../ui/menu";
import { SelectButton } from "../ui/select";
import { Switch } from "../ui/switch";
import { SnapShotSetupDialog } from "./SnapShotSetupDialog";
import { useSnapShotShortcutRecorder } from "./useSnapShotShortcutRecorder";
import {
  captureSetupAccessReady,
  captureSetupInitialStep,
  captureSetupShouldDisableOnClose,
  type CaptureSetupStep,
} from "./SnapShotSetupDialog.logic";

const soundOptionRowClassName = "grid grid-cols-[1fr_auto]";

type ShortcutCheck =
  | { readonly status: "idle"; readonly availability: null }
  | {
      readonly status: "checking";
      readonly availability: null;
      readonly shortcut: SnapShotShortcut;
      readonly savedShortcut: SnapShotShortcut;
    }
  | {
      readonly status: "checked";
      readonly shortcut: SnapShotShortcut;
      readonly savedShortcut: SnapShotShortcut;
      readonly availability: DesktopSnapShotShortcutAvailability;
    };

export function SnapShotSettings() {
  const settings = useClientSettings((current) => ({
    snapShotAnimations: current.snapShotAnimations,
    snapShotEnabled: current.snapShotEnabled,
    snapShotFlash: current.snapShotFlash,
    snapShotIncludeAccessibility: current.snapShotIncludeAccessibility,
    snapShotPlaySound: current.snapShotPlaySound,
    snapShotShortcut: current.snapShotShortcut,
    snapShotSound: current.snapShotSound,
  }));
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const bridge = getDesktopSnapShotBridge();
  const registry = useContext(RegistryContext);
  const { state, refreshError } = useAtomValue(desktopSnapShotAtom);
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupError, setSetupError] = useState<SnapShotSetupError | null>(null);
  // macOS can quit the app from a permission prompt; until the user opens or closes the wizard
  // themselves, a saved resume reopens it where it left off.
  const [resume] = useState(readSnapShotSetupResume);
  const [chosenWizard, setWizard] = useState<{
    initialStep: CaptureSetupStep;
    wasEnabled: boolean;
  } | null>();
  const wizard =
    chosenWizard !== undefined
      ? chosenWizard
      : state?.macPermissions && resume
        ? { initialStep: "access" as const, wasEnabled: resume.wasEnabled }
        : null;
  // The wizard shows errors inline; outside it there is nowhere to, so they become a toast.
  const reportSetupError = (title: string, error: unknown) => {
    const report = snapShotSetupError(title, error);
    setSetupError(report);
    if (!wizard)
      toastManager.add({ type: "error", title: report.title, description: report.message });
  };
  const refreshState = () =>
    refreshDesktopSnapShotState(registry, (error) =>
      reportSetupError("无法检查截图设置", error),
    );
  const [candidate, setCandidate] = useState<SnapShotShortcut>(settings.snapShotShortcut);
  const [latestShortcutCheck, setShortcutCheck] = useState<ShortcutCheck>({
    status: "idle",
    availability: null,
  });
  // A check answers for one candidate against one saved shortcut. Once either moves on (an edit,
  // or hydration saving a new shortcut) a late answer no longer shows, so a check for the
  // shortcut that just got saved can't claim it is ready to save.
  const savedShortcut = settings.snapShotShortcut;
  const shortcutCheck: ShortcutCheck =
    latestShortcutCheck.status === "idle" ||
    (sameSnapShotShortcut(latestShortcutCheck.shortcut, candidate) &&
      sameSnapShotShortcut(latestShortcutCheck.savedShortcut, savedShortcut))
      ? latestShortcutCheck
      : { status: "idle", availability: null };
  const shortcutCheckIdRef = useRef(0);
  const unavailableMessage = snapShotUnavailableMessage(Boolean(bridge));
  const captureAvailable = Boolean(bridge) && state !== null && state.mode !== "unavailable";
  const feedbackUnavailable = snapShotFeedbackUnavailableMessage(state);
  const managedShortcut = state?.linuxBackend === "niri" || state?.linuxBackend === "hyprland";
  const shortcutChanged = !managedShortcut && !sameSnapShotShortcut(candidate, savedShortcut);
  const displayShortcut = shortcutChanged ? candidate : (state?.shortcut ?? savedShortcut);
  const candidateConflict = shortcutChanged
    ? snapShotKeybindingConflict(candidate, keybindings)
    : null;
  const canSaveShortcut =
    shortcutChanged && candidateConflict === null && shortcutCheck.availability?.available === true;
  const soundSelection = settings.snapShotPlaySound ? settings.snapShotSound : "off";
  const soundLabel =
    soundSelection === "off"
      ? "关闭"
      : soundSelection === "soft-pop"
        ? "轻响（默认）"
        : "快门声";

  const setup = async (action: DesktopSnapShotSetupAction) => {
    if (!bridge || setupBusy) return;
    setSetupBusy(true);
    setSetupError(null);
    const result = await settlePromise(async () => {
      if (
        state?.macPermissions &&
        wizard &&
        (action === "allow-screen-recording" || action === "allow-accessibility")
      ) {
        // macOS can quit the app from its permission prompt.
        saveSnapShotSetupResume(wizard.wasEnabled);
      }
      await bridge.setupSnapShot(action);
      await refreshState();
    });
    if (result._tag === "Failure") {
      reportSetupError(
        action === "retry-shortcut"
          ? "无法打开快捷键权限"
          : "无法完成截图设置",
        Cause.squash(result.cause),
      );
    }
    setSetupBusy(false);
  };

  // Hydration can hand back an equal shortcut object; only a different shortcut resets the edit.
  const [renderedSavedShortcut, setRenderedSavedShortcut] = useState(savedShortcut);
  if (!sameSnapShotShortcut(renderedSavedShortcut, savedShortcut)) {
    setRenderedSavedShortcut(savedShortcut);
    setCandidate(savedShortcut);
    setShortcutCheck({ status: "idle", availability: null });
  }

  const save = async (patch: ClientSettingsPatch) => {
    setSetupError(null);
    try {
      await updateClientSettings(patch);
      return await refreshState();
    } catch (error) {
      reportSetupError("无法保存截图设置", error);
    }
  };

  const saveIncludeAccessibility = async (includeAccessibility: boolean) => {
    try {
      if (includeAccessibility && settings.snapShotEnabled)
        await bridge?.requestSnapShotPermissions(true);
      await save({ snapShotIncludeAccessibility: includeAccessibility });
    } catch (error) {
      reportSetupError("无法允许截取应用文本", error);
    }
  };

  const checkShortcut = async (shortcut: SnapShotShortcut) => {
    const checkId = ++shortcutCheckIdRef.current;
    setCandidate(shortcut);
    const conflict = snapShotKeybindingConflict(shortcut, keybindings);
    if (conflict || !bridge) return;
    setShortcutCheck({ status: "checking", availability: null, shortcut, savedShortcut });
    try {
      const availability = await bridge.checkSnapShotShortcut(shortcut);
      if (checkId === shortcutCheckIdRef.current) {
        setShortcutCheck({ status: "checked", availability, shortcut, savedShortcut });
      }
    } catch (error) {
      if (checkId !== shortcutCheckIdRef.current) return;
      setShortcutCheck({
        status: "checked",
        shortcut,
        savedShortcut,
        availability: {
          available: false,
          message: error instanceof Error ? error.message : "无法检查此快捷键。",
        },
      });
    }
  };

  const {
    recording,
    stopRecording,
    input: shortcutInput,
  } = useSnapShotShortcutRecorder({
    shortcut: displayShortcut,
    shortcutLabel: !shortcutChanged ? state?.shortcutLabel : undefined,
    disabled: setupBusy,
    allowModifierPairs: state?.mode !== "portal",
    onRecord: (shortcut) => void checkShortcut(shortcut),
    onStart: () => {
      shortcutCheckIdRef.current++;
      setShortcutCheck({ status: "idle", availability: null });
    },
    onError: (message) =>
      setShortcutCheck({
        status: "checked",
        shortcut: candidate,
        savedShortcut,
        availability: { available: false, message },
      }),
  });

  const shortcutStatus = recording
    ? "请按下快捷键，Esc 可取消。"
    : candidateConflict
      ? `${APP_BASE_NAME} 已将此快捷键用于“${commandLabel(candidateConflict)}”。`
      : shortcutCheck.status === "checking"
        ? "正在检查快捷键…"
        : shortcutCheck.availability
          ? shortcutCheck.availability.available
            ? "可以保存。"
            : shortcutCheck.availability.message
          : state?.mode === "portal" &&
              !state.shortcutLabel &&
              isModifierPairShortcut(displayShortcut)
            ? "请尝试 Ctrl+Shift+2 等快捷键。"
            : snapShotShortcutStatus(state);

  const openSetup = async (requested: CaptureSetupStep | "resume" = "resume") => {
    if (!state || setupBusy) return;
    stopRecording();
    shortcutCheckIdRef.current++;
    setCandidate(savedShortcut);
    setShortcutCheck({ status: "idle", availability: null });
    setSetupError(null);
    setSetupBusy(true);
    await prepareSetup(requested).finally(() => setSetupBusy(false));
  };

  const prepareSetup = async (requested: CaptureSetupStep | "resume") => {
    let current = await refreshState();
    if (!current) return;
    if (current.macPermissions) requested = "access";
    if (!settings.snapShotEnabled && captureSetupInitialStep(current, requested) !== "access") {
      current = await save({ snapShotEnabled: true });
      if (!current) {
        // Settings may save before status checking fails; keep Finish later available to disable capture.
        setWizard({ initialStep: "access", wasEnabled: false });
        return;
      }
    }
    setWizard({
      initialStep: captureSetupInitialStep(current, requested),
      wasEnabled: settings.snapShotEnabled,
    });
  };

  const enableForSetup = async () => {
    if (setupBusy) return false;
    setSetupBusy(true);
    setSetupError(null);
    const verified = await settlePromise(async () => {
      if (state?.macPermissions) {
        saveSnapShotSetupResume(wizard?.wasEnabled ?? settings.snapShotEnabled);
        await bridge?.setupSnapShot("test-mac-capture");
      }
      if (state?.mode === "direct")
        await bridge?.requestSnapShotPermissions(settings.snapShotIncludeAccessibility);
      const nextState =
        settings.snapShotEnabled && !state?.message
          ? await refreshState()
          : await save({ snapShotEnabled: true });
      return nextState !== undefined && captureSetupAccessReady(nextState);
    });
    setSetupBusy(false);
    if (verified._tag === "Success") return verified.value;
    reportSetupError("无法验证截图权限", Cause.squash(verified.cause));
    return false;
  };

  const closeSetup = async (completed: boolean) => {
    if (!wizard || setupBusy) return;
    setSetupBusy(true);
    const closed = await settlePromise(async () => {
      if (
        settings.snapShotEnabled &&
        captureSetupShouldDisableOnClose(wizard.wasEnabled, completed)
      ) {
        if (!(await save({ snapShotEnabled: false }))) return;
      }
      stopRecording();
      setSetupError(null);
      clearSnapShotSetupResume();
      setWizard(null);
    });
    if (closed._tag === "Failure") {
      reportSetupError("无法关闭截图设置", Cause.squash(closed.cause));
    }
    setSetupBusy(false);
  };

  const saveShortcut = async () => {
    if (!canSaveShortcut || setupBusy) return false;
    setSetupBusy(true);
    const saved = await save({ snapShotShortcut: candidate }).finally(() => setSetupBusy(false));
    return Boolean(saved?.shortcutRegistered || saved?.shortcutPending);
  };

  return (
    <SettingsPageContainer>
      <SettingsSection id="snap-shot" title="快照">
        <SettingsUnavailableGroup message={unavailableMessage}>
          <SettingsRow
            {...searchableSetting("snap-shot-enabled")}
            description={snapShotDescription(state)}
            status={
              bridge
                ? setupBusy && !wizard
                  ? "正在更新截图设置…"
                  : refreshError
                    ? `${refreshError.title}. ${refreshError.message}`
                    : snapShotStatus(state, settings.snapShotEnabled)
                : undefined
            }
            control={
              <>
                {settings.snapShotEnabled &&
                !snapShotSetupComplete(state, settings.snapShotIncludeAccessibility) ? (
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={setupBusy}
                    onClick={() => void openSetup()}
                  >
                    {snapShotSetupButtonLabel(state)}
                  </Button>
                ) : null}
                <Switch
                  checked={settings.snapShotEnabled || Boolean(wizard)}
                  disabled={!captureAvailable || setupBusy}
                  aria-label="启用截图"
                  onCheckedChange={(checked) => {
                    if (!checked) void save({ snapShotEnabled: false });
                    else if (state?.windows) void save({ snapShotEnabled: true });
                    else void openSetup();
                  }}
                />
              </>
            }
          />
          {settings.snapShotEnabled && captureAvailable ? (
            <>
              <SettingsRow
                {...searchableSetting("snap-shot-accessibility")}
                description="在应用提供文本和控件时一并包含。"
                status={snapShotAccessibilityUnavailableMessage(state)}
                control={
                  <Switch
                    checked={
                      !snapShotAccessibilityUnavailableMessage(state) &&
                      settings.snapShotIncludeAccessibility
                    }
                    disabled={
                      !captureAvailable || Boolean(snapShotAccessibilityUnavailableMessage(state))
                    }
                    aria-label="在截图中包含应用文本"
                    onCheckedChange={(checked) => void saveIncludeAccessibility(checked)}
                  />
                }
              />
              <SettingsRow
                {...searchableSetting("snap-shot-shortcut")}
                description={
                  state?.linuxBackend === "picker"
                    ? "从任意应用中选择窗口进行截图。"
                    : "无需切换应用即可截取当前使用的窗口。"
                }
                status={managedShortcut ? undefined : shortcutStatus}
                control={
                  managedShortcut ? (
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={setupBusy}
                      onClick={() => void openSetup("shortcut")}
                    >
                      更改快捷键
                    </Button>
                  ) : (
                    <>
                      {shortcutInput}
                      {shortcutChanged ? (
                        <>
                          <Button
                            size="xs"
                            disabled={!canSaveShortcut || setupBusy}
                            onClick={() => void saveShortcut()}
                          >
                            {setupBusy ? "正在保存…" : "保存"}
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            disabled={setupBusy}
                            onClick={() => {
                              stopRecording();
                              shortcutCheckIdRef.current++;
                              setCandidate(savedShortcut);
                              setShortcutCheck({ status: "idle", availability: null });
                            }}
                          >
                            取消
                          </Button>
                        </>
                      ) : state?.mode === "portal" &&
                        state.shortcutCanRetry !== false &&
                        !isModifierPairShortcut(savedShortcut) ? (
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={setupBusy || state.shortcutPending}
                          onClick={() => void setup("retry-shortcut")}
                        >
                          快捷键权限
                        </Button>
                      ) : null}
                    </>
                  )
                }
              />
              <SettingsRow
                {...searchableSetting("snap-shot-sound")}
                description="选择开始截图时播放的声音。"
                control={
                  <Menu>
                    <MenuTrigger
                      aria-label={"截图声音：" + soundLabel}
                      render={<SelectButton size="sm" />}
                      className="w-auto min-w-0"
                      disabled={!captureAvailable}
                    >
                      {soundSelection === "off" ? (
                        "关闭"
                      ) : soundSelection === "soft-pop" ? (
                        <>
                          轻响 <span className="text-muted-foreground">（默认）</span>
                        </>
                      ) : (
                        "快门声"
                      )}
                    </MenuTrigger>
                    <MenuPopup align="end">
                      <MenuRadioGroup
                        onValueChange={(value) =>
                          void save(snapShotSoundPatch(value as SnapShotSoundSelection))
                        }
                        value={soundSelection}
                      >
                        <MenuRadioItem closeOnClick value="off">
                          关闭
                        </MenuRadioItem>
                        <div className={soundOptionRowClassName}>
                          <MenuRadioItem closeOnClick value="soft-pop">
                            轻响 <span className="text-muted-foreground">（默认）</span>
                          </MenuRadioItem>
                          <MenuItem
                            aria-label="播放轻响"
                            closeOnClick={false}
                            onClick={() => playSnapShotSound("soft-pop")}
                          >
                            <PlayIcon />
                          </MenuItem>
                        </div>
                        <div className={soundOptionRowClassName}>
                          <MenuRadioItem closeOnClick value="camera-shutter">
                            快门声
                          </MenuRadioItem>
                          <MenuItem
                            aria-label="播放快门声"
                            closeOnClick={false}
                            onClick={() => playSnapShotSound("camera-shutter")}
                          >
                            <PlayIcon />
                          </MenuItem>
                        </div>
                      </MenuRadioGroup>
                    </MenuPopup>
                  </Menu>
                }
              />
              <SettingsRow
                {...searchableSetting("snap-shot-flash")}
                description="在截图窗口上显示柔和提示。"
                status={feedbackUnavailable}
                control={
                  <Switch
                    checked={!feedbackUnavailable && settings.snapShotFlash}
                    disabled={!captureAvailable || Boolean(feedbackUnavailable)}
                    aria-label="闪烁截图窗口"
                    onCheckedChange={(checked) => void save({ snapShotFlash: checked })}
                  />
                }
              />
              <SettingsRow
                {...searchableSetting("snap-shot-animations")}
                description="将截图窗口以动画形式添加到草稿。"
                status={feedbackUnavailable}
                control={
                  <Switch
                    checked={!feedbackUnavailable && settings.snapShotAnimations}
                    disabled={!captureAvailable || Boolean(feedbackUnavailable)}
                    aria-label="启用截图动画"
                    onCheckedChange={(checked) => void save({ snapShotAnimations: checked })}
                  />
                }
              />
            </>
          ) : null}
        </SettingsUnavailableGroup>
      </SettingsSection>
      {wizard && state ? (
        <SnapShotSetupDialog
          state={state}
          initialStep={wizard.initialStep}
          wasEnabled={wizard.wasEnabled}
          includeAccessibility={settings.snapShotIncludeAccessibility}
          busy={setupBusy}
          error={(setupError ?? refreshError)?.message ?? null}
          shortcutInput={shortcutInput}
          shortcutStatus={shortcutStatus}
          shortcutChanged={shortcutChanged}
          canSaveShortcut={canSaveShortcut}
          onSaveShortcut={saveShortcut}
          onEnable={enableForSetup}
          onAction={setup}
          onRefresh={refreshState}
          onClose={closeSetup}
          onLeaveStep={stopRecording}
        />
      ) : null}
    </SettingsPageContainer>
  );
}
