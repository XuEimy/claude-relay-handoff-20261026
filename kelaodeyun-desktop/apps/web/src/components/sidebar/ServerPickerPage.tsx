import { useEffect, useRef, useState } from "react";
import * as Option from "effect/Option";
import { ChevronRightIcon, PlusIcon } from "lucide-react";
import {
  accountHostMatchesTarget,
  accountHostSshTarget,
  type DesktopSshEnvironmentTarget,
} from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useNavigate } from "@tanstack/react-router";
import { useAccountHosts } from "../../hooks/useDesktopAccount";
import { environmentCatalog } from "../../connection/catalog";
import { connectSshEnvironment } from "../../connection/onboarding";
import { desktopSshHostsStateAtom } from "../../state/desktopSshHosts";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import type { EnvironmentPresentation } from "../../state/environments";
import {
  formatDesktopSshConnectionError,
  parseManualDesktopSshTarget,
} from "../settings/ConnectionsSettings.logic";
import { Button } from "../ui/button";
import { AnimatedHeight } from "../AnimatedHeight";
import { Input } from "../ui/input";
import { Spinner } from "../ui/spinner";
import { toastManager } from "../ui/toast";
import { MacIcon } from "./MacIcons";
import { unmatchedAccountHosts } from "./accountHosts";
import { useEnterEnvironmentWorkspace } from "./useEnterEnvironmentWorkspace";
import "./accountOnboarding.css";

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex w-full rounded-full bg-muted p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          className={`min-w-0 flex-1 rounded-full px-2 py-2 text-xs transition-colors motion-reduce:transition-none ${
            option.value === value
              ? "bg-background font-medium text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function IconStage({
  kind,
  connected = false,
  pending,
}: {
  kind: "mini" | "imac" | "macbook";
  connected?: boolean;
  pending?: boolean;
}) {
  return (
    <span
      data-mac-stage
      className="relative flex h-32 w-full items-center justify-center rounded-xl"
    >
      <MacIcon
        kind={kind}
        connected={connected}
        className={`h-[99px] w-[132px] ${pending ? "opacity-40" : ""}`}
      />
      {pending ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner size="lg" />
        </span>
      ) : null}
    </span>
  );
}

export function ServerPickerPage({ servers }: { servers: readonly EnvironmentPresentation[] }) {
  const bridge = window.desktopBridge;
  const navigate = useNavigate();
  const { account, hosts, error: hostsError } = useAccountHosts(true);
  const discover = useEnvironmentQuery(bridge ? desktopSshHostsStateAtom : null);
  const connect = useAtomCommand(connectSshEnvironment, { reportFailure: false });
  const setEnabled = useAtomCommand(environmentCatalog.setEnabled, { reportFailure: false });
  const enterWorkspace = useEnterEnvironmentWorkspace();
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<"config" | "manual">("config");
  const [auth, setAuth] = useState<"auto" | "key" | "password">("auto");
  const [keyPath, setKeyPath] = useState("");
  const [host, setHost] = useState("");
  const [username, setUsername] = useState("");
  const [port, setPort] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorItem, setErrorItem] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const targets = servers.flatMap((server) => {
    const profile = Option.getOrNull(server.entry.profile);
    return profile?._tag === "SshConnectionProfile" ? [profile.target] : [];
  });
  const accountOnly = unmatchedAccountHosts(hosts, targets);
  const empty = servers.length === 0 && accountOnly.length === 0;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- scrolls the newly opened panel into view
  useEffect(() => {
    if (expanded && !empty) {
      panelRef.current?.scrollIntoView({
        block: "nearest",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    }
  }, [expanded, empty]);
  const suggestions = (discover.data ?? []).filter(
    (item) =>
      item.source === "ssh-config" &&
      !targets.some((target) => target.alias === item.alias || target.hostname === item.hostname) &&
      !hosts.some((entry) => entry.hostname === item.hostname),
  );
  const saveAndConnect = async (
    target: DesktopSshEnvironmentTarget,
    label: string,
    mode: typeof auth,
  ) => {
    if (!bridge) return;
    let saveError: string | null = null;
    try {
      if (mode === "key") {
        if (!target.username) throw Error("请填写 SSH 用户名");
        await bridge.saveAccountHost({
          label,
          hostname: target.hostname,
          port: target.port,
          username: target.username,
          auth: { type: "key", privateKeyPath: keyPath },
        });
      } else {
        await bridge.saveAccountSshHost({
          target,
          label,
          ...(mode === "password" ? { password } : {}),
        });
      }
    } catch (cause) {
      saveError = cause instanceof Error ? cause.message : "保存失败";
    }
    const result = await connect({ target, label });
    if (result._tag === "Failure") throw squashAtomCommandFailure(result);
    if (saveError) {
      const message = `已连接，但未保存到账户：${saveError}`;
      setWarning(message);
      toastManager.add({ type: "warning", title: message });
    }
  };
  const run = async (id: string, action: () => Promise<void>) => {
    setPending(id);
    setError(null);
    setErrorItem(null);
    setWarning(null);
    try {
      await action();
    } catch (cause) {
      setError(formatDesktopSshConnectionError(cause));
      setErrorItem(id);
    } finally {
      setPending(null);
    }
  };
  const tileClass =
    "group relative flex min-h-[250px] flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-background p-4 text-center transition hover:-translate-y-0.5 hover:border-foreground/15 motion-reduce:transform-none motion-reduce:transition-none";
  return (
    <main
      data-account-onboarding
      className="scrollbar-gutter-both relative min-h-dvh overflow-y-auto bg-background px-6 pb-16 pt-24 text-foreground"
    >
      <div className="absolute inset-x-0 top-0 h-12 drag-region" />
      {account.status === "signed-in" ? (
        <div className="absolute right-6 top-5 flex items-center gap-2 rounded-full border border-border px-1.5 py-1 text-xs text-muted-foreground">
          {account.user.avatar ? (
            <img src={account.user.avatar} alt="" className="size-7 rounded-full object-cover" />
          ) : (
            <span className="flex size-7 items-center justify-center rounded-full bg-muted text-foreground">
              {account.user.email.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span>{account.user.email}</span>
          <button
            onClick={() => void bridge?.signOutAccount()}
            className="rounded-full px-2 py-1 hover:bg-muted hover:text-foreground"
          >
            退出
          </button>
        </div>
      ) : null}
      <section className="mx-auto max-w-[880px] space-y-8">
        <header className="space-y-3 text-center">
          <h1 data-picker-title className="font-serif tracking-tight">
            选择一台电脑
          </h1>
          <p className="text-sm text-muted-foreground">选择后即可使用远程对话、终端和文件。</p>
        </header>
        {hostsError ? (
          <p role="alert" className="text-sm text-destructive">
            {hostsError}
          </p>
        ) : null}
        {!empty ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {servers.map((server) => {
              const profile = Option.getOrNull(server.entry.profile);
              const target = profile?._tag === "SshConnectionProfile" ? profile.target : null;
              const accountHost = target
                ? hosts.find((entry) => accountHostMatchesTarget(entry, target))
                : undefined;
              const kind =
                accountHost?.source === "purchased" ? "mini" : accountHost ? "imac" : "macbook";
              const connected = server.connection.phase === "connected";
              const connecting =
                server.connection.phase === "connecting" ||
                server.connection.phase === "reconnecting";
              return (
                <div
                  key={server.environmentId}
                  data-server-tile
                  className={`${tileClass} ${pending === server.environmentId || connecting ? "ring-1 ring-foreground/20" : ""}`}
                >
                  <button
                    className="flex w-full flex-col items-center gap-2"
                    disabled={pending !== null}
                    onClick={() =>
                      void run(server.environmentId, async () => {
                        if (server.entry.enabled && connected) await enterWorkspace(server);
                        else {
                          const result = await setEnabled({
                            environmentId: server.environmentId,
                            enabled: true,
                          });
                          if (result._tag === "Failure") throw squashAtomCommandFailure(result);
                        }
                      })
                    }
                  >
                    <IconStage
                      kind={kind}
                      connected={connected}
                      pending={pending === server.environmentId || connecting}
                    />
                    <span data-server-label className="max-w-full truncate font-medium">
                      {server.label}
                    </span>
                    <span className="max-w-full truncate font-mono text-xs text-muted-foreground">
                      {target
                        ? `${target.username ?? ""}@${target.hostname}:${target.port ?? 22}`
                        : ""}
                    </span>
                    <span className="rounded-full border border-border px-2 py-0.5 text-2xs text-muted-foreground">
                      {connected || connecting ? (
                        <span
                          aria-hidden
                          className="mr-1 inline-block size-1.5 rounded-full bg-foreground"
                        />
                      ) : null}
                      {accountHost?.source === "purchased"
                        ? "已购买"
                        : accountHost
                          ? "账户"
                          : "本机配置"}
                      {connected ? " · 已连接" : connecting ? " · 连接中" : ""}
                    </span>
                  </button>
                  {server.entry.enabled ? (
                    <button
                      className="absolute right-3 top-3 rounded-full bg-muted/80 px-2.5 py-1 text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none"
                      onClick={() =>
                        void run(server.environmentId, async () => {
                          const result = await setEnabled({
                            environmentId: server.environmentId,
                            enabled: false,
                          });
                          if (result._tag === "Failure") throw squashAtomCommandFailure(result);
                        })
                      }
                    >
                      断开
                    </button>
                  ) : null}
                  {server.connection.error || (errorItem === server.environmentId && error) ? (
                    <p role="alert" className="text-xs text-destructive">
                      {server.connection.error || error}
                    </p>
                  ) : null}
                </div>
              );
            })}
            {accountOnly.map((item) => (
              <button
                key={item.id}
                data-server-tile
                className={`${tileClass} ${pending === item.id ? "ring-1 ring-foreground/20" : ""}`}
                disabled={pending !== null}
                onClick={() =>
                  void run(item.id, async () => {
                    const result = await connect({
                      target: accountHostSshTarget(item),
                      label: item.label,
                    });
                    if (result._tag === "Failure") throw squashAtomCommandFailure(result);
                  })
                }
              >
                <IconStage
                  kind={item.source === "purchased" ? "mini" : "imac"}
                  pending={pending === item.id}
                />
                <span data-server-label className="max-w-full truncate font-medium">
                  {item.label}
                </span>
                <span className="max-w-full truncate font-mono text-xs text-muted-foreground">
                  {item.username}@{item.hostname}:{item.port}
                </span>
                <span className="rounded-full border border-border px-2 py-0.5 text-2xs text-muted-foreground">
                  {item.source === "purchased" ? "已购买" : "账户"}
                </span>
                {errorItem === item.id && error ? (
                  <span role="alert" className="text-xs text-destructive">
                    {error}
                  </span>
                ) : null}
              </button>
            ))}
            <button
              data-server-tile
              className={`${tileClass} border-dashed text-muted-foreground`}
              onClick={() => setExpanded(!expanded)}
            >
              <span className="flex size-10 items-center justify-center rounded-full border border-border bg-muted/50">
                <PlusIcon className="size-5" />
              </span>
              <span className="text-sm">添加电脑</span>
            </button>
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            账户里还没有电脑，先添加一台。
          </p>
        )}
        <AnimatedHeight>
          {empty || expanded ? (
            <div
              ref={panelRef}
              className="mx-auto max-w-xl space-y-5 rounded-2xl border border-border p-6"
            >
              <Segmented
                label="添加方式"
                value={tab}
                onChange={setTab}
                options={[
                  { value: "config", label: "从 SSH 配置" },
                  { value: "manual", label: "手动输入" },
                ]}
              />
              {tab === "config" ? (
                suggestions.length ? (
                  <div className="space-y-2">
                    {suggestions.map((item) => (
                      <button
                        key={item.alias}
                        disabled={pending !== null}
                        className="flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted/60 motion-reduce:transition-none"
                        onClick={() =>
                          void run(item.alias, async () => {
                            if (!bridge) return;
                            const resolved = await bridge.resolveSshHost(item.alias);
                            await saveAndConnect(resolved, item.alias, "auto");
                          })
                        }
                      >
                        <MacIcon kind="macbook" size="sm" className="size-10" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{item.alias}</span>
                          <span className="block truncate font-mono text-xs text-muted-foreground">
                            {item.hostname}
                          </span>
                        </span>
                        {pending === item.alias ? (
                          <Spinner size="sm" />
                        ) : (
                          <ChevronRightIcon className="size-4 text-muted-foreground" />
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="py-5 text-center text-sm text-muted-foreground">
                    ~/.ssh/config 中没有找到主机
                  </p>
                )
              ) : (
                <div className="space-y-4">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">主机</span>
                    <Input
                      value={host}
                      onChange={(event) => setHost(event.target.value)}
                      placeholder="192.168.1.10 或 devbox"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">用户名</span>
                      <Input
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        placeholder="root"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">端口</span>
                      <Input
                        value={port}
                        onChange={(event) => setPort(event.target.value)}
                        placeholder="22"
                      />
                    </label>
                  </div>
                  <div className="space-y-2">
                    <Segmented
                      label="认证方式"
                      value={auth}
                      onChange={setAuth}
                      options={[
                        { value: "auto", label: "本机密钥（自动）" },
                        { value: "key", label: "选择私钥" },
                        { value: "password", label: "密码" },
                      ]}
                    />
                    <p className="px-1 text-xs text-muted-foreground">
                      {auth === "auto"
                        ? "将使用 ~/.ssh 中的私钥，并加密保存到你的账户"
                        : auth === "key"
                          ? "私钥将加密保存到你的账户"
                          : "密码将加密保存到你的账户"}
                    </p>
                  </div>
                  {auth === "key" ? (
                    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-border px-3 py-2">
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                        {keyPath || "尚未选择私钥"}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void bridge
                            ?.pickAccountPrivateKey()
                            .then((file) => {
                              if (file) setKeyPath(file.path);
                            })
                            .catch((cause: unknown) =>
                              setError(formatDesktopSshConnectionError(cause)),
                            )
                        }
                      >
                        {keyPath ? "更换" : "选择"}
                      </Button>
                    </div>
                  ) : null}
                  {auth === "password" ? (
                    <Input
                      aria-label="密码"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  ) : null}
                  <button
                    type="button"
                    className="h-10 w-full rounded-full bg-foreground px-6 text-sm font-medium text-background transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-foreground disabled:opacity-50 motion-reduce:transition-none"
                    disabled={pending !== null}
                    onClick={() =>
                      void run("manual", async () => {
                        const parsed = parseManualDesktopSshTarget({ host, username, port });
                        let target = parsed;
                        if (bridge) {
                          try {
                            const resolved = await bridge.resolveSshHost(parsed.alias);
                            target = {
                              ...resolved,
                              username: parsed.username ?? resolved.username,
                              port: parsed.port ?? resolved.port,
                            };
                          } catch {}
                        }
                        await saveAndConnect(target, parsed.alias, auth);
                      })
                    }
                  >
                    连接并保存
                  </button>
                </div>
              )}
              {error &&
              (errorItem === null ||
                errorItem === "manual" ||
                suggestions.some((item) => item.alias === errorItem)) ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              {warning ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {warning}
                </p>
              ) : null}
            </div>
          ) : error && errorItem === null ? (
            <p role="alert" className="text-center text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </AnimatedHeight>
        <div className="flex justify-center">
          <Button variant="ghost" onClick={() => void navigate({ to: "/settings/connections" })}>
            管理服务器
          </Button>
        </div>
      </section>
    </main>
  );
}
