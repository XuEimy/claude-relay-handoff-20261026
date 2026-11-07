// @effect-diagnostics nodeBuiltinImport:off -- Native, consent-gated compositor config I/O.
import * as NodeFSP from "node:fs/promises";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeCrypto from "node:crypto";
import * as NodeChildProcess from "node:child_process";
import * as NodeUtil from "node:util";
import * as Schema from "effect/Schema";
import type {
  DesktopCaptureConfigApplied,
  DesktopCaptureConfigPreview,
  DesktopCaptureConfigRequest,
} from "@t3tools/contracts";
import {
  captureConfigKeys,
  editCaptureConfig,
  niriConfigConflict,
  niriConfigIncludes,
  type CaptureConfigFormat,
} from "./captureConfigEdit.ts";

const execute = (file: string, args: string[], options: { timeout: number; maxBuffer: number }) =>
  NodeUtil.promisify(NodeChildProcess.execFile)(file, args, options);
const MAX_BYTES = 1024 * 1024;
const MAX_FILES = 64;
type Target = { desktop: "niri" | "hyprland"; path: string; appId: string };
type Snapshot = Awaited<ReturnType<typeof readSnapshot>>;
const decodeHyprlandBindings = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Array(
      Schema.Struct({
        modmask: Schema.Number,
        key: Schema.String,
        dispatcher: Schema.String,
        arg: Schema.String,
      }),
    ),
  ),
);

export function niriCaptureConfigPath(home: string, env = process.env) {
  return (
    env.NIRI_CONFIG ||
    NodePath.join(env.XDG_CONFIG_HOME || NodePath.join(home, ".config"), "niri", "config.kdl")
  );
}

async function readSnapshot(path: string) {
  const resolvedPath = await NodeFSP.realpath(path);
  const file = await NodeFSP.open(
    resolvedPath,
    NodeFS.constants.O_RDONLY | NodeFS.constants.O_NONBLOCK | NodeFS.constants.O_NOFOLLOW,
  );
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > MAX_BYTES)
      throw new Error("请选择小于 1 MB 的配置文件。");
    const bytes = await file.readFile();
    if (bytes.length > MAX_BYTES) throw new Error("请选择小于 1 MB 的配置文件。");
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    if (text.includes("\0")) throw new Error("请选择文本配置文件。");
    return { path, resolvedPath, text, bytes, stat };
  } finally {
    await file.close();
  }
}

const defaultTools = {
  validateNiri: async (path: string) => {
    try {
      await execute("niri", ["validate", "--config", path], {
        timeout: 5000,
        maxBuffer: 64 * 1024,
      });
    } catch {
      throw new Error(
        "Niri 无法验证建议的配置，未进行任何更改。请在高级设置中检查配置。",
      );
    }
  },
  hyprlandBindings: async () =>
    decodeHyprlandBindings(
      (await execute("hyprctl", ["-j", "binds"], { timeout: 5000, maxBuffer: MAX_BYTES })).stdout,
    ),
  reloadHyprland: async () => {
    await execute("hyprctl", ["reload"], { timeout: 5000, maxBuffer: 64 * 1024 });
    const errors = await execute("hyprctl", ["configerrors"], {
      timeout: 5000,
      maxBuffer: 64 * 1024,
    });
    if (errors.stdout.trim()) throw new Error("Hyprland 报告了配置错误。");
  },
};

/** The renderer can apply only the exact proposal retained by the desktop process. */
export class CaptureShortcutConfig {
  private pending:
    | {
        preview: DesktopCaptureConfigPreview;
        target: Target;
        files: Snapshot[];
        missing: string[];
        checkHyprlandKeys: boolean;
      }
    | undefined;
  private applying = false;
  private readonly home: string;
  private readonly tools: typeof defaultTools;
  constructor(home: string, tools = defaultTools) {
    this.home = home;
    this.tools = tools;
  }

  private async checkHyprlandKeys(appId: string, shortcut: string) {
    const keys = captureConfigKeys(shortcut);
    const bindings = await this.tools.hyprlandBindings().catch(() => {
      throw new Error(
        "无法检查 Hyprland 当前的快捷键，请在 Hyprland 会话中重试。",
      );
    });
    if (
      bindings.some(
        (binding) =>
          binding.modmask === keys.mask &&
          binding.key.toUpperCase() === keys.key &&
          !(binding.dispatcher === "global" && binding.arg === `${appId}:capture-window`),
      )
    )
      throw new Error(`${keys.label} 已被 Hyprland 使用，请选择其他快捷键。`);
  }

  async preview(
    target: Target,
    request: DesktopCaptureConfigRequest,
  ): Promise<DesktopCaptureConfigPreview> {
    if (this.applying) throw new Error("请等待当前配置更改完成。");
    this.pending = undefined;
    const root = await readSnapshot(target.path).catch(() => {
      throw new Error("无法读取设置文件，请在高级设置中选择其他文件。");
    });
    if (root.stat.uid !== process.getuid?.() || /\/omarchy\/default\//.test(root.resolvedPath))
      throw new Error("请选择自己的配置，不要使用系统或 Omarchy 默认配置。");
    const format: CaptureConfigFormat =
      target.desktop === "niri"
        ? "niri"
        : target.path.endsWith(".lua")
          ? "hyprland-lua"
          : "hyprland";
    if (
      !target.path.endsWith(
        format === "niri" ? ".kdl" : format === "hyprland-lua" ? ".lua" : ".conf",
      )
    )
      throw new Error("请选择 .kdl 格式的 Niri 配置或 .conf/.lua 格式的 Hyprland 配置。");
    const edit = editCaptureConfig(
      root.text,
      format,
      target.appId,
      request.operation,
      request.shortcut,
    );
    // Lua bindings appear as opaque callbacks, including our own unchanged shortcut.
    const checkHyprlandKeys =
      request.operation === "install" &&
      (format === "hyprland" || (format === "hyprland-lua" && edit.after !== root.text));
    const files = [root];
    const missing: string[] = [];
    if (target.desktop === "niri") {
      const visit = async (file: Snapshot, depth: number) => {
        if (
          depth > 10 ||
          files.length > MAX_FILES ||
          files.reduce((size, item) => size + item.bytes.length, 0) > MAX_BYTES
        )
          throw new Error("此配置包含过多文件，请在高级设置中手动配置。");
        for (const include of niriConfigIncludes(file.text)) {
          if (include.path.includes("$") || /[*?[\]]/.test(include.path))
            throw new Error("此配置使用动态包含，请在高级设置中手动配置。");
          const path = include.path.startsWith("~/")
            ? NodePath.join(this.home, include.path.slice(2))
            : NodePath.resolve(NodePath.dirname(file.path), include.path);
          let child: Snapshot;
          try {
            child = await readSnapshot(path);
          } catch (error) {
            if (include.optional && (error as NodeJS.ErrnoException).code === "ENOENT") {
              missing.push(path);
              continue;
            }
            throw new Error(
              "无法读取包含的 Niri 配置，请在高级设置中检查其位置。",
              { cause: error },
            );
          }
          if (files.some((item) => item.resolvedPath === child.resolvedPath)) continue;
          files.push(child);
          if (
            request.operation === "install" &&
            niriConfigConflict(child.text, target.appId, edit.shortcut)
          )
            throw new Error(
              `${edit.shortcut} 已在 ${child.path} 中使用，请选择其他快捷键。`,
            );
          await visit(child, depth + 1);
        }
      };
      await visit(root, 0);
    } else if (checkHyprlandKeys) {
      await this.checkHyprlandKeys(target.appId, edit.shortcut);
    }
    const preview = {
      id: NodeCrypto.randomUUID(),
      path: root.path,
      resolvedPath: root.resolvedPath,
      before: root.text,
      after: edit.after,
      shortcut: edit.shortcut,
      operation: request.operation,
    };
    this.pending = { preview, target, files, missing, checkHyprlandKeys };
    return preview;
  }

  async apply(id: string, desktop: Target["desktop"]): Promise<DesktopCaptureConfigApplied> {
    const pending = this.pending;
    if (
      this.applying ||
      !pending ||
      pending.preview.id !== id ||
      pending.target.desktop !== desktop
    )
      throw new Error("此预览已过期，请在保存前重新检查更改。");
    this.pending = undefined;
    this.applying = true;
    const { preview, files } = pending;
    const root = files[0]!;
    const directory = NodePath.dirname(root.resolvedPath);
    const temporary = NodePath.join(directory, `.t3-capture-${NodeCrypto.randomUUID()}.tmp`);
    let staged = false;
    try {
      const unchanged = async () => {
        for (const path of pending.missing) {
          if (
            await NodeFSP.lstat(path).then(
              () => true,
              (error: NodeJS.ErrnoException) => error.code !== "ENOENT",
            )
          )
            throw new Error(
              "预览后配置已更改，请在保存前重新检查更改。",
            );
        }
        for (const original of files) {
          const current = await readSnapshot(original.path).catch(() => undefined);
          if (
            !current ||
            current.resolvedPath !== original.resolvedPath ||
            current.stat.ino !== original.stat.ino ||
            current.stat.mode !== original.stat.mode ||
            !current.bytes.equals(original.bytes)
          )
            throw new Error(
              "预览后配置已更改，未保存任何内容。请在保存前重新检查更改。",
            );
        }
      };
      await unchanged();
      if (pending.checkHyprlandKeys)
        await this.checkHyprlandKeys(pending.target.appId, preview.shortcut);
      if (preview.before === preview.after) return { backupPath: null, warning: null };
      await NodeFSP.writeFile(temporary, preview.after, {
        flag: "wx",
        mode: root.stat.mode & 0o777,
      });
      staged = true;
      await NodeFSP.chmod(temporary, root.stat.mode & 0o777);
      if (desktop === "niri") {
        // Niri resolves includes against the selected path, not a dotfile symlink's target.
        const validationPath = NodePath.join(
          NodePath.dirname(root.path),
          NodePath.basename(temporary),
        );
        if (NodePath.resolve(validationPath) === NodePath.resolve(temporary)) {
          await this.tools.validateNiri(temporary);
        } else {
          await NodeFSP.symlink(temporary, validationPath);
          try {
            await this.tools.validateNiri(validationPath);
          } finally {
            await NodeFSP.unlink(validationPath);
          }
        }
      }
      await unchanged();
      const backupPath = `${root.resolvedPath}.t3-capture-backup-${NodeCrypto.randomUUID()}`;
      await NodeFSP.writeFile(backupPath, root.bytes, { flag: "wx", mode: 0o600 });
      await NodeFSP.rename(temporary, root.resolvedPath);
      staged = false;
      let warning: string | null = null;
      if (desktop === "hyprland") {
        try {
          await this.tools.reloadHyprland();
        } catch {
          warning =
            "配置已保存，但 Hyprland 未能正常重新加载。请检查 hyprctl configerrors，然后运行 hyprctl reload。";
        }
      }
      return { backupPath, warning };
    } finally {
      if (staged) await NodeFSP.unlink(temporary).catch(() => undefined);
      this.applying = false;
    }
  }
}
