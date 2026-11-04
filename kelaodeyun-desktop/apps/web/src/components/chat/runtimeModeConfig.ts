import {
  managedRuntimeModeDenial,
  type ManagedPolicySummary,
  type RuntimeMode,
} from "@t3tools/contracts";
import { type LucideIcon, LockIcon, PenLineIcon, ShieldOffIcon, SparklesIcon } from "lucide-react";

export const runtimeModeConfig: Record<
  RuntimeMode,
  { label: string; description: string; icon: LucideIcon }
> = {
  "approval-required": {
    label: "监督模式",
    description: "执行命令和修改文件前先询问。",
    icon: LockIcon,
  },
  "auto-accept-edits": {
    label: "自动批准文件修改",
    description: "自动批准文件修改，其他操作先询问。",
    icon: PenLineIcon,
  },
  auto: {
    label: "自动",
    description: "支持此功能的服务会批准常规操作，其他服务仍会询问。",
    icon: SparklesIcon,
  },
  "full-access": {
    label: "完全访问",
    description: "执行命令和修改文件时不再询问。",
    // An open lock reads like a closed one at small sizes; a crossed shield does not.
    icon: ShieldOffIcon,
  },
};

export const runtimeModeOptions = Object.keys(runtimeModeConfig) as RuntimeMode[];

/** The modes a provider supports (all when it reports none) and the mode a thread really runs in. */
export function resolveCompatibleRuntimeMode(
  runtimeMode: RuntimeMode,
  supportedRuntimeModes: ReadonlyArray<RuntimeMode> | undefined,
) {
  const modes =
    supportedRuntimeModes && supportedRuntimeModes.length > 0
      ? runtimeModeOptions.filter((mode) => supportedRuntimeModes.includes(mode))
      : runtimeModeOptions;
  return { modes, mode: modes.includes(runtimeMode) ? runtimeMode : (modes[0] ?? runtimeMode) };
}

export function resolveRuntimeModeOptions(
  modes: ReadonlyArray<RuntimeMode>,
  managedPolicy: ManagedPolicySummary | undefined,
) {
  return modes.map((mode) => {
    const option = { mode, ...runtimeModeConfig[mode] };
    const disabledReason = managedRuntimeModeDenial(managedPolicy, mode);
    return disabledReason === undefined ? option : { ...option, disabledReason };
  });
}
