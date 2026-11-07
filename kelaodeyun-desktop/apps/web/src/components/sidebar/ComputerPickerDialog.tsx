import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import * as Option from "effect/Option";
import { CheckIcon, MonitorIcon, RefreshCwIcon, ServerIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useStableCallback } from "../../hooks/useStableCallback";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { readProjects } from "../../state/entities";
import { useUiStateStore } from "../../uiStateStore";
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
import {
  runComputerOperation as runOperation,
  type ComputerResult,
} from "./computerOperations";
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
  projects?: { dir: string; remotePath: string }[];
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
  const requestAddProject = useComputerScopeStore((state) => state.requestAddProject);
  const enterWorkspace = useEnterEnvironmentWorkspace();
  const openThread = useNewThreadHandler();
  const [peers, setPeers] = useState<Peer[]>([]);
  const [computers, setComputers] = useState<SavedComputer[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorRow, setErrorRow] = useState<string | null>(null);
  const [tailError, setTailError] = useState<string | null>(null);
  const [tailscaleIssue, setTailscaleIssue] = useState<"missing" | "stopped" | null>(null);
  const [tailscaleLogin, setTailscaleLogin] = useState<
    | { phase: "idle" }
    | { phase: "busy" }
    | { phase: "waiting"; url: string }
    | { phase: "error"; message: string }
  >({ phase: "idle" });
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
    setTailscaleIssue(null);
    setError(null);
    const [list, tail] = await Promise.allSettled([
      runOperation<{ root: string; computers: SavedComputer[] }>(target, "computer-list"),
      runOperation<{ peers: Peer[] }>(target, "computer-peers"),
    ]);
    if (current !== refreshGeneration.current) return;
    if (list.status === "fulfilled" && list.value.ok) {
      setComputers(list.value.computers);
      updateScope(active.environmentId, {
        computersRoot: list.value.root,
        projectPaths: Object.fromEntries(list.value.computers.flatMap((computer) =>
          (computer.projects ?? []).map((project) => [project.dir, project.remotePath]),
        )),
      });
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
      setTailscaleIssue(null);
    } else {
      setPeers([]);
      const failure = tail.status === "fulfilled" && !tail.value.ok ? tail.value : null;
      if (failure?.error === "tailscale-missing" || failure?.error === "tailscale-stopped") {
        setTailscaleIssue(failure.error === "tailscale-missing" ? "missing" : "stopped");
        setTailError(null);
      } else {
        setTailscaleIssue(null);
        setTailError(failure ? failure.message : "无法读取服务器上的 Tailscale 状态");
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

  const watchTailnet = useStableCallback((current: number) => {
    function poll() {
      window.setTimeout(() => {
        void (async () => {
          if (current !== generation.current || !target) return;
          try {
            const result = await runOperation<{ peers: Peer[] }>(target, "computer-peers");
            if (current !== generation.current) return;
            if (result.ok) {
              void refresh();
              return;
            }
          } catch {
            // keep polling while the dialog stays open
          }
          if (current === generation.current) poll();
        })();
      }, 3000);
    }
    poll();
  });
  const startTailscaleLogin = useStableCallback(() => {
    if (!target || pending) return;
    const current = ++generation.current;
    setTailscaleLogin({ phase: "busy" });
    const attempt = async (): Promise<void> => {
      if (current !== generation.current) return;
      let result: ComputerResult<{ state?: string; url?: string }>;
      try {
        result = await runOperation<{ state?: string; url?: string }>(
          target,
          "computer-tailscale-login",
        );
      } catch {
        if (current === generation.current)
          setTailscaleLogin({ phase: "error", message: "无法在服务器上启动 Tailscale 登录" });
        return;
      }
      if (current !== generation.current) return;
      if (!result.ok) {
        setTailscaleLogin({ phase: "error", message: result.message });
        return;
      }
      const url =
        typeof result.url === "string" && /^https:\/\/login\.tailscale\.com\//.test(result.url)
          ? result.url
          : null;
      if (result.state === "needs-login" && url) {
        setTailscaleLogin({ phase: "waiting", url });
        void window.desktopBridge?.openExternal(url);
        watchTailnet(current);
        return;
      }
      if (result.state === "running") {
        void refresh();
        return;
      }
      window.setTimeout(() => void attempt(), 3000);
    };
    void attempt();
  });
  const close = (next: boolean) => {
    if (!next) {
      generation.current++;
      refreshGeneration.current++;
      setPending(null);
      setForm(null);
      setPassword("");
      setError(null);
      setErrorRow(null);
      setTailscaleIssue(null);
      setTailscaleLogin({ phase: "idle" });
      if (active) updateScope(active.environmentId, { onboarded: true });
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
      selected: { slug: result.slug, dir: result.dir, label, host, username: user, os: peer.os === "windows" ? "windows" : os },
    });
    try {
      const root = result.dir.replace(/\/+$/u, "");
      const project = readProjects()
        .filter((entry) =>
          entry.environmentId === active.environmentId &&
          !entry.archivedAt &&
          entry.workspaceRoot.startsWith(`${root}/`),
        )
        .toSorted((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))[0];
      if (project) {
        useUiStateStore.getState().setSidebarProjectScopeKeys([]);
        if (!(await openThread(scopeProjectRef(active.environmentId, project.id)))) {
          throw new Error("工作区尚未就绪，请重试。");
        }
      } else {
        requestAddProject(active.environmentId);
      }
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
          <DialogTitle>连接你的电脑</DialogTitle>
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
              {tailscaleIssue ? (
                <div className="space-y-2 rounded-md border p-3">
                  <p className="text-sm font-medium">第一步：在服务器上登录 Tailscale</p>
                  <p className="text-xs text-muted-foreground">
                    请使用与你电脑相同的 Tailscale 账号登录，登录后这里会列出同一网络里的设备
                  </p>
                  {tailscaleLogin.phase === "waiting" ? (
                    <div className="space-y-2">
                      <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Spinner size="sm" />
                        等待登录完成…
                      </p>
                      <button
                        type="button"
                        className="block max-w-full truncate font-mono text-xs text-primary underline"
                        onClick={() =>
                          void window.desktopBridge?.openExternal(tailscaleLogin.url)
                        }
                      >
                        {tailscaleLogin.url}
                      </button>
                      <Button size="sm" variant="secondary" onClick={() => void refresh()}>
                        我已登录，刷新
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {tailscaleLogin.phase === "busy" ? (
                        <p className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Spinner size="sm" />
                          正在服务器上安装/启动 Tailscale…
                        </p>
                      ) : null}
                      {tailscaleLogin.phase === "error" ? (
                        <p role="alert" className="text-xs text-destructive">
                          {tailscaleLogin.message}
                        </p>
                      ) : null}
                      <Button
                        size="sm"
                        disabled={tailscaleLogin.phase === "busy"}
                        onClick={() => startTailscaleLogin()}
                      >
                        登录 Tailscale
                      </Button>
                    </div>
                  )}
                </div>
              ) : tailError ? (
                <p className="text-sm text-muted-foreground">{tailError}</p>
              ) : null}
              {!tailError && !tailscaleIssue && !loading && !visiblePeers.length ? (
                <p className="text-sm text-muted-foreground">
                  在你的电脑上安装 Tailscale，并用同一个账号登录，然后点右上角刷新。
                </p>
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
          <div className="flex justify-end">
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => close(false)}
            >
              稍后再说
            </button>
          </div>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
