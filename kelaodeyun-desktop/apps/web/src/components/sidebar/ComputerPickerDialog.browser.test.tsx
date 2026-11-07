import { EnvironmentId, type DesktopSshFileOperation } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render, stubGlobal } from "../../../test/render";
import { ComputerPickerDialog } from "./ComputerPickerDialog";
import { useComputerScopeStore } from "./computerScopeStore";
import { useActiveSshEnvironment } from "./useActiveSshEnvironment";
import { useEnterEnvironmentWorkspace } from "./useEnterEnvironmentWorkspace";

vi.mock("./useActiveSshEnvironment", () => ({ useActiveSshEnvironment: vi.fn() }));
vi.mock("./useEnterEnvironmentWorkspace", () => ({ useEnterEnvironmentWorkspace: vi.fn() }));
const mocks = vi.hoisted(() => ({
  projects: [] as Array<{ id: string; environmentId: string; workspaceRoot: string; archivedAt: null; updatedAt: string; createdAt: string }>,
  openThread: vi.fn(async () => true),
}));
vi.mock("../../state/entities", () => ({ readProjects: () => mocks.projects }));
vi.mock("../../hooks/useHandleNewThread", () => ({ useNewThreadHandler: () => mocks.openThread }));

it.each([
  { known: false, expectedUser: "root", probeOk: false, hasProject: false },
  { known: true, expectedUser: "saved-user", probeOk: false, hasProject: false },
  { known: false, expectedUser: "root", probeOk: true, hasProject: false },
  { known: true, expectedUser: "saved-user", probeOk: true, hasProject: true },
])(
  "probes first (known: $known, probe succeeds: $probeOk)",
  async ({ known, expectedUser, probeOk, hasProject }) => {
    const target = { alias: "server", hostname: "server.tail", username: "me", port: null };
    const server = {
      environmentId: EnvironmentId.make("server"),
      label: "我的服务器",
      connection: { phase: "connected" },
      serverConfig: { cwd: "/home/me" },
      entry: { profile: Option.some({ _tag: "SshConnectionProfile", target }) },
    };
    vi.mocked(useActiveSshEnvironment).mockReturnValue(server as never);
    const enter = vi.fn(async () => undefined);
    vi.mocked(useEnterEnvironmentWorkspace).mockReturnValue(enter);
    mocks.projects = hasProject ? [
      { id: "root", environmentId: "server", workspaceRoot: "/home/me/computers/box", archivedAt: null, createdAt: "2026-01-01", updatedAt: "2026-12-01" },
      { id: "older", environmentId: "server", workspaceRoot: "/home/me/computers/box/old", archivedAt: null, createdAt: "2026-01-01", updatedAt: "2026-02-01" },
      { id: "latest", environmentId: "server", workspaceRoot: "/home/me/computers/box/new", archivedAt: null, createdAt: "2026-01-01", updatedAt: "2026-03-01" },
    ] : [];
    mocks.openThread.mockClear();
    useComputerScopeStore.setState({ byEnvironmentId: {}, addProjectEnvironmentId: null });
    const calls: DesktopSshFileOperation[] = [];
    using _bridge = stubGlobal("desktopBridge", {
      sshFileOperation: async (input: DesktopSshFileOperation) => {
        calls.push(input);
        switch (input.operation) {
          case "computer-list":
            return JSON.stringify({
              ok: true,
              root: "/home/me/computers",
              computers: known
                ? [
                    {
                      host: "box.tail",
                      username: "saved-user",
                      label: "box",
                      os: "linux",
                      slug: "box",
                      dir: "/home/me/computers/box",
                    },
                  ]
                : [],
            });
          case "computer-peers":
            return JSON.stringify({
              ok: true,
              peers: [
                {
                  id: "self",
                  hostName: "server",
                  dnsName: "server.tail",
                  ips: [],
                  os: "linux",
                  online: true,
                  self: true,
                },
                {
                  id: "box",
                  hostName: "box",
                  dnsName: "box.tail",
                  ips: ["100.1.1.1"],
                  os: "linux",
                  online: true,
                  self: false,
                },
              ],
            });
          case "computer-probe":
            return JSON.stringify(
              probeOk
                ? { ok: true, os: "linux" }
                : { ok: false, error: "auth", message: "需要验证" },
            );
          case "computer-install-key":
            return JSON.stringify({ ok: true, os: "linux" });
          case "computer-prepare":
            return JSON.stringify({
              ok: true,
              root: "/home/me/computers",
              dir: "/home/me/computers/box",
              slug: "box",
            });
          default:
            throw new Error("unexpected operation");
        }
      },
    });
    const close = vi.fn();
    await using screen = await render(<ComputerPickerDialog open onOpenChange={close} />);
    await expect.element(screen.getByText("box.tail")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /box\.tail/ }));
    await vi.waitFor(() =>
      expect(calls.some((input) => input.operation === "computer-probe")).toBe(true),
    );
    expect(calls.find((input) => input.operation === "computer-probe")?.computer).toMatchObject({
      host: "box.tail",
      username: expectedUser,
    });
    expect(
      calls.find((input) => input.operation === "computer-probe")?.computer?.password,
    ).toBeUndefined();
    if (probeOk) {
      await vi.waitFor(() => expect(close).toHaveBeenCalledWith(false));
      await expect.element(screen.getByLabelText("密码")).not.toBeInTheDocument();
      expect(calls.some((input) => input.operation === "computer-install-key")).toBe(false);
      expect(enter).not.toHaveBeenCalled();
      if (hasProject) {
        expect(mocks.openThread).toHaveBeenCalledWith({ environmentId: "server", projectId: "latest" });
        expect(useComputerScopeStore.getState().addProjectEnvironmentId).toBeNull();
      } else {
        expect(useComputerScopeStore.getState().addProjectEnvironmentId).toBe("server");
      }
      return;
    }
    await expect.element(screen.getByLabelText("密码")).toBeVisible();
    await expect.element(screen.getByLabelText("用户名")).toHaveValue(expectedUser);
    await userEvent.clear(screen.getByLabelText("用户名"));
    await userEvent.type(screen.getByLabelText("用户名"), "alice");
    await userEvent.type(screen.getByLabelText("密码"), "test-password");
    await userEvent.click(screen.getByRole("button", { name: "连接" }));
    await vi.waitFor(() => expect(close).toHaveBeenCalledWith(false));
    expect(enter).not.toHaveBeenCalled();
    expect(useComputerScopeStore.getState().addProjectEnvironmentId).toBe("server");
    expect(
      calls.find((input) => input.operation === "computer-install-key")?.computer,
    ).toMatchObject({
      username: "alice",
      password: "test-password",
    });
    expect(useComputerScopeStore.getState().byEnvironmentId.server?.selected).toMatchObject({
      host: "box.tail",
      username: "alice",
      dir: "/home/me/computers/box",
    });
    expect(useComputerScopeStore.getState().byEnvironmentId.server?.onboarded).toBe(true);
  },
);

it("logs into tailscale on the server, opens the auth url, then lists peers", async () => {
  const target = { alias: "server", hostname: "server.tail", username: "me", port: null };
  const server = {
    environmentId: EnvironmentId.make("server"),
    label: "我的服务器",
    connection: { phase: "connected" },
    serverConfig: { cwd: "/home/me" },
    entry: { profile: Option.some({ _tag: "SshConnectionProfile", target }) },
  };
  vi.mocked(useActiveSshEnvironment).mockReturnValue(server as never);
  vi.mocked(useEnterEnvironmentWorkspace).mockReturnValue(vi.fn(async () => undefined));
  useComputerScopeStore.setState({ byEnvironmentId: {}, addProjectEnvironmentId: null });
  const peer = {
    id: "box",
    hostName: "box",
    dnsName: "box.tail",
    ips: ["100.1.1.1"],
    os: "linux",
    online: true,
    self: false,
  };
  let peersOk = false;
  const openExternal = vi.fn(async () => true);
  using _bridge = stubGlobal("desktopBridge", {
    openExternal,
    sshFileOperation: async (input: DesktopSshFileOperation) => {
      switch (input.operation) {
        case "computer-list":
          return JSON.stringify({ ok: true, root: "/home/me/computers", computers: [] });
        case "computer-peers":
          return JSON.stringify(
            peersOk
              ? { ok: true, peers: [peer] }
              : {
                  ok: false,
                  error: "tailscale-stopped",
                  message: "服务器上的 Tailscale 未连接",
                  state: "Stopped",
                },
          );
        case "computer-tailscale-login":
          return JSON.stringify({
            ok: true,
            state: "needs-login",
            url: "https://login.tailscale.com/a/abc123",
          });
        default:
          throw new Error("unexpected operation");
      }
    },
  });
  const close = vi.fn();
  await using screen = await render(<ComputerPickerDialog open onOpenChange={close} />);
  await expect.element(screen.getByText("第一步：在服务器上登录 Tailscale")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "登录 Tailscale" }));
  await vi.waitFor(() =>
    expect(openExternal).toHaveBeenCalledWith("https://login.tailscale.com/a/abc123"),
  );
  await expect.element(screen.getByText("等待登录完成…")).toBeVisible();
  peersOk = true;
  await userEvent.click(screen.getByRole("button", { name: "我已登录，刷新" }));
  await expect.element(screen.getByText("box.tail")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "稍后再说" }));
  await vi.waitFor(() => expect(close).toHaveBeenCalledWith(false));
  expect(useComputerScopeStore.getState().byEnvironmentId.server?.onboarded).toBe(true);
});
