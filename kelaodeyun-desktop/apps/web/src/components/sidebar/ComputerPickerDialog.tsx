import type { DesktopSshFileOperation, DesktopSshEnvironmentTarget } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { CheckIcon, MonitorIcon, RefreshCwIcon, ServerIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useStableCallback } from "../../hooks/useStableCallback";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Spinner } from "../ui/spinner";
import { defaultComputerScope, type ComputerSelection } from "./computerPicker";
import { useComputerScopeStore } from "./computerScopeStore";
import { useActiveSshEnvironment } from "./useActiveSshEnvironment";
import { useEnterEnvironmentWorkspace } from "./useEnterEnvironmentWorkspace";

interface Peer {
  id: string;
  hostName: string;
  dnsName: string;
  ips: string[];
  os: string;
  online: boolean;
  self: boolean;
}
interface SavedComputer extends ComputerSelection {
  os: string;
}
type Failure = { ok: false; error: string; message: string; state?: string | null };
type Result<T> = ({ ok: true } & T) | Failure;
type ComputerInput = NonNullable<DesktopSshFileOperation["computer"]>;

async function runOperation<T>(
  target: DesktopSshEnvironmentTarget,
  operation: DesktopSshFileOperation["operation"],
  computer?: ComputerInput,
): Promise<Result<T>> {
  const operationBridge = window.desktopBridge?.sshFileOperation;
  if (!operationBridge) throw new Error("SSH 操作不可用");
  const output = await operationBridge({
    target,
    cwd: "~",
    relativePath: "",
    operation,
    ...(computer ? { computer } : {}),
  });
  return JSON.parse(output) as Result<T>;
}

const normalizeHost = (value: string) => value.trim().toLowerCase().replace(/\.$/u, "");
function peerHost(peer: Peer) {
  return peer.dnsName || peer.ips[0] || peer.hostName;
}
function matchesPeer(peer: Peer, host: string) {
  return [peer.dnsName, peer.hostName, ...peer.ips]
    .map(normalizeHost)
    .filter(Boolean)
    .includes(normalizeHost(host));
}

export function ComputerPickerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const active = useActiveSshEnvironment();
  const profile = active ? Option.getOrNull(active.entry.profile) : null;
  const target = profile?._tag === "SshConnectionProfile" ? profile.target : null;
  const targetKey = JSON.stringify(target);
  const connected = active?.connection.phase === "connected" && Boolean(target);
  const scope = useComputerScopeStore((state) =>
    active
      ? (state.byEnvironmentId[active.environmentId] ?? defaultComputerScope)
      : defaultComputerScope,
  );
  const updateScope = useComputerScopeStore((state) => state.update);
  const enterWorkspace = useEnterEnvironmentWorkspace();
  const [peers, setPeers] = useState<Peer[]>([]);
  const [computers, setComputers] = useState<SavedComputer[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorRow, setErrorRow] = useState<string | null>(null);
  const [tailError, setTailError] = useState<string | null>(null);
  const [form, setForm] = useState<{ peer: Peer } | null>(null);
  const [username, setUsername] = useState("root");
  const [password, setPassword] = useState("");
  const generation = useRef(0);
  const refreshGeneration = useRef(0);

  const refresh = useStableCallback(async () => {
    if (!active || !target || !connected) return;
    const current = ++refreshGeneration.current;
    setLoading(true);
    setPending(null);
    setForm(null);
    setPassword("");
    setPeers([]);
    setComputers([]);
    setErrorRow(null);
    setTailError(null);
    setError(null);
    const [list, tail] = await Promise.allSettled([
      runOperation<{ root: string; computers: SavedComputer[] }>(target, "computer-list"),
      runOperation<{ peers: Peer[] }>(target, "computer-peers"),
    ]);
    if (current !== refreshGeneration.current) return;
    if (list.status === "fulfilled" && list.value.ok) {
      setComputers(list.value.computers);
      updateScope(active.environmentId, { computersRoot: list.value.root });
    } else {
      setComputers([]);
      setError(
        list.status === "fulfilled" && !list.value.ok
          ? list.value.message
          : "无法读取服务器上的电脑列表",
      );
    }
    if (tail.status === "fulfilled" && tail.value.ok) {
      setPeers(tail.value.peers);
    } else {
      setPeers([]);
      if (
        tail.status === "fulfilled" &&
        !tail.value.ok &&
        tail.value.error === "tailscale-missing"
      ) {
        setTailError(
          "服务器上未检测到 Tailscale。请在服务器上执行 `curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up` 后刷新。",
        );
      } else if (
        tail.status === "fulfilled" &&
        !tail.value.ok &&
        tail.value.error === "tailscale-stopped"
      ) {
        setTailError(`服务器上的 Tailscale 未连接（状态：${tail.value.state ?? "未知"}）`);
      } else {
        setTailError(
          tail.status === "fulfilled" && !tail.value.ok
            ? tail.value.message
            : "无法读取服务器上的 Tailscale 状态",
        );
      }
    }
    setLoading(false);
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- loads remote computer state when the connected server or dialog changes
  useEffect(() => {
    if (open && connected && targetKey && active?.environmentId) void refresh();
    return () => {
      refreshGeneration.current++;
      generation.current++;
    };
  }, [open, connected, targetKey, active?.environmentId, refresh]);

  const close = (next: boolean) => {
    if (!next) {
      generation.current++;
      refreshGeneration.current++;
      setPending(null);
      setForm(null);
      setPassword("");
      setError(null);
      setErrorRow(null);
    }
    onOpenChange(next);
  };
  const prepare = async (peer: Peer, user: string, os: string, current: number) => {
    if (!target || !active) return;
    const host = peerHost(peer);
    const label = peer.hostName || host;
    const result = await runOperation<{ root: string; dir: string; slug: string }>(
      target,
      "computer-prepare",
      { host, username: user, label, os },
    );
    if (current !== generation.current) return;
    if (!result.ok) throw new Error(result.message);
    const previous =
      useComputerScopeStore.getState().byEnvironmentId[active.environmentId] ??
      defaultComputerScope;
    updateScope(active.environmentId, {
      computersRoot: result.root,
      selected: { slug: result.slug, dir: result.dir, label, host, username: user },
    });
    try {
      await enterWorkspace(active, { workspaceRoot: result.dir });
    } catch (cause) {
      if (current === generation.current) updateScope(active.environmentId, previous);
      throw cause;
    }
    if (current === generation.current) close(false);
  };
  const connect = async (peer: Peer, user: string, secret?: string) => {
    if (!target || !active || pending) return;
    const current = ++generation.current;
    setPending(peer.id);
    setError(null);
    setErrorRow(peer.id);
    setPassword("");
    try {
      const computer = { host: peerHost(peer), username: user, label: peer.hostName, os: peer.os };
      const result =
        secret === undefined
          ? await runOperation<{ os: string }>(target, "computer-probe", computer)
          : await runOperation<{ os: string }>(target, "computer-install-key", {
              ...computer,
              password: secret,
            });
      if (current !== generation.current) return;
      if (!result.ok) {
        if (result.error === "auth" && secret === undefined) {
          if (peer.os === "windows") throw new Error("Windows 电脑请先手动配置 SSH 免密登录");
          setUsername(user);
          setForm({ peer });
          return;
        }
        throw new Error(result.error === "auth" ? "用户名或密码不正确" : result.message);
      }
      await prepare(peer, user, result.os, current);
    } catch (cause) {
      if (current === generation.current)
        setError(cause instanceof Error ? cause.message : "连接失败");
    } finally {
      if (current === generation.current) setPending(null);
    }
  };
  const selectServer = async () => {
    if (!active || pending) return;
    const current = ++generation.current;
    const previous = scope;
    setPending("server");
    setError(null);
    setErrorRow("server");
    updateScope(active.environmentId, { selected: null });
    try {
      await enterWorkspace(active);
      if (current === generation.current) close(false);
    } catch (cause) {
      if (current === generation.current) {
        updateScope(active.environmentId, previous);
        setError(cause instanceof Error ? cause.message : "无法打开工作区");
      }
    } finally {
      if (current === generation.current) setPending(null);
    }
  };
  const visiblePeers = peers
    .filter(
      (peer) =>
        !peer.self &&
        target &&
        !matchesPeer(peer, target.hostname) &&
        !matchesPeer(peer, target.alias),
    )
    .sort((a, b) => Number(b.online) - Number(a.online) || a.hostName.localeCompare(b.hostName));

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogPopup className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>选择电脑</DialogTitle>
          <DialogDescription>
            工作区和 Claude 保留在你的服务器上，通过 SSH 操作所选电脑。
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          {!connected || !active ? (
            <p className="py-4 text-sm text-muted-foreground">请先连接你的服务器</p>
          ) : (
            <div className="space-y-3">
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-md border p-3 text-left disabled:opacity-50"
                disabled={pending !== null}
                onClick={() => void selectServer()}
              >
                <ServerIcon className="size-4" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  我的服务器（{active.label}）
                </span>
                {pending === "server" ? (
                  <Spinner size="sm" />
                ) : !scope.selected ? (
                  <CheckIcon className="size-4" />
                ) : null}
              </button>
              {errorRow === "server" && error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Tailscale 电脑</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="刷新 Tailscale 电脑"
                  disabled={loading || pending !== null}
                  onClick={() => void refresh()}
                >
                  {loading ? <Spinner size="sm" /> : <RefreshCwIcon />}
                </Button>
              </div>
              {tailError ? <p className="text-sm text-muted-foreground">{tailError}</p> : null}
              {!tailError && !loading && !visiblePeers.length ? (
                <p className="text-sm text-muted-foreground">没有可显示的 Tailscale 电脑</p>
              ) : null}
              {visiblePeers.map((peer) => {
                const known = computers.find((item) => matchesPeer(peer, item.host));
                const selected = scope.selected && matchesPeer(peer, scope.selected.host);
                return (
                  <div key={peer.id} className="rounded-md border">
                    <button
                      type="button"
                      disabled={!peer.online || pending !== null}
                      className="flex w-full items-center gap-3 p-3 text-left disabled:opacity-50"
                      onClick={() => {
                        setError(null);
                        setErrorRow(peer.id);
                        setForm(null);
                        setPassword("");
                        void connect(peer, known?.username ?? "root");
                      }}
                    >
                      <MonitorIcon className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {peer.hostName || peerHost(peer)}
                        </span>
                        <span className="block truncate font-mono text-xs text-muted-foreground">
                          {peer.dnsName || peer.ips[0]}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {peer.online ? peer.os || "未知系统" : "离线"}
                      </span>
                      {pending === peer.id ? (
                        <Spinner size="sm" />
                      ) : selected ? (
                        <CheckIcon className="size-4" />
                      ) : (
                        <span
                          className={
                            peer.online
                              ? "size-1.5 rounded-full bg-success"
                              : "size-1.5 rounded-full bg-muted-foreground"
                          }
                        />
                      )}
                    </button>
                    {form?.peer.id === peer.id ? (
                      <form
                        className="space-y-2 border-t p-3"
                        onSubmit={(event) => {
                          event.preventDefault();
                          if (username.trim() && password)
                            void connect(peer, username.trim(), password);
                        }}
                      >
                        <Input
                          aria-label="用户名"
                          placeholder="用户名"
                          value={username}
                          onChange={(event) => setUsername(event.target.value)}
                          disabled={pending !== null}
                        />
                        <Input
                          aria-label="密码"
                          type="password"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          disabled={pending !== null}
                        />
                        <p className="text-xs text-muted-foreground">
                          仅用于首次配置免密登录，不会保存
                        </p>
                        <Button
                          size="sm"
                          type="submit"
                          disabled={pending !== null || !username.trim() || !password}
                        >
                          连接
                        </Button>
                      </form>
                    ) : null}
                    {errorRow === peer.id && error ? (
                      <p role="alert" className="px-3 pb-3 text-sm text-destructive">
                        {error}
                      </p>
                    ) : null}
                  </div>
                );
              })}
              {error && errorRow === null ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
          )}
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
