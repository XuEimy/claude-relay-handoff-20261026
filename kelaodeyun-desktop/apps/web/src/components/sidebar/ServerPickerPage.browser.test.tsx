import "~/index.css";
import * as Option from "effect/Option";
import type { EnvironmentPresentation } from "../../state/environments";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { ServerPickerPage } from "./ServerPickerPage";

const mocks = vi.hoisted(() => ({
  hosts: [] as Array<{
    id: string;
    label: string;
    hostname: string;
    port: number;
    username: string;
    authType: "key" | "password";
    source: "account" | "purchased";
  }>,
  suggestions: [] as Array<{
    alias: string;
    hostname: string;
    username: string | null;
    port: number | null;
    source: "ssh-config";
  }>,
  connect: vi.fn(),
  enabled: vi.fn(),
}));
vi.mock("../../hooks/useDesktopAccount", () => ({
  useAccountHosts: () => ({
    account: { status: "signed-in", user: { email: "user@example.com" } },
    hosts: mocks.hosts,
    error: null,
  }),
}));
vi.mock("../../state/query", () => ({ useEnvironmentQuery: () => ({ data: mocks.suggestions }) }));
vi.mock("../../state/desktopSshHosts", () => ({ desktopSshHostsStateAtom: {} }));
vi.mock("../../connection/catalog", () => ({ environmentCatalog: { setEnabled: "enabled" } }));
vi.mock("../../connection/onboarding", () => ({ connectSshEnvironment: "connect" }));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (command: string) => (command === "connect" ? mocks.connect : mocks.enabled),
}));
vi.mock("./useEnterEnvironmentWorkspace", () => ({ useEnterEnvironmentWorkspace: () => vi.fn() }));

function setup() {
  mocks.hosts = [];
  mocks.suggestions = [];
  mocks.connect.mockReset().mockResolvedValue({ _tag: "Success" });
  mocks.enabled.mockReset().mockResolvedValue({ _tag: "Success" });
  const target = { alias: "box", hostname: "box.example.com", username: "alice", port: 22 };
  const bridge = {
    resolveSshHost: vi.fn().mockResolvedValue(target),
    saveAccountSshHost: vi.fn().mockResolvedValue({}),
    signOutAccount: vi.fn(),
  };
  vi.stubGlobal("desktopBridge", bridge);
  return { bridge, target };
}

it("shows account and local servers with source-specific icons", async () => {
  setup();
  mocks.hosts = [
    {
      id: "one",
      label: "Purchased",
      hostname: "purchased.example.com",
      username: "root",
      port: 22,
      authType: "key",
      source: "purchased",
    },
    {
      id: "two",
      label: "Account",
      hostname: "account.example.com",
      username: "root",
      port: 22,
      authType: "key",
      source: "account",
    },
  ];
  const local = {
    environmentId: "local",
    label: "Local",
    entry: {
      enabled: false,
      profile: Option.some({
        _tag: "SshConnectionProfile",
        target: { alias: "local", hostname: "local", username: "me", port: null },
      }),
    },
    connection: { phase: "disconnected", error: null },
    serverConfig: null,
  } as unknown as EnvironmentPresentation;
  await using screen = await render(<ServerPickerPage servers={[local]} />);
  await expect.element(screen.getByText("Purchased")).toBeVisible();
  await expect.element(screen.getByText("Account")).toBeVisible();
  expect(screen.getByLabelText("mini").element()).toBeTruthy();
  expect(screen.getByLabelText("imac").element()).toBeTruthy();
  expect(screen.getByLabelText("macbook").element()).toBeTruthy();
});

it("opens the add panel when empty and saves an SSH config host before connecting", async () => {
  const { bridge, target } = setup();
  mocks.suggestions = [
    { alias: "box", hostname: "box.example.com", username: null, port: null, source: "ssh-config" },
  ];
  await using screen = await render(<ServerPickerPage servers={[]} />);
  await expect.element(screen.getByText("账户里还没有电脑，先添加一台。")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: /box/ }));
  await vi.waitFor(() => expect(mocks.connect).toHaveBeenCalledWith({ target, label: "box" }));
  expect(bridge.resolveSshHost).toHaveBeenCalledWith("box");
  expect(bridge.saveAccountSshHost).toHaveBeenCalledWith({ target, label: "box" });
  expect(bridge.saveAccountSshHost.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.connect.mock.invocationCallOrder[0]!,
  );
});

it("connects despite a save failure and reports a warning", async () => {
  const { bridge, target } = setup();
  bridge.saveAccountSshHost.mockRejectedValue(Error("offline"));
  mocks.suggestions = [
    { alias: "box", hostname: "box.example.com", username: null, port: null, source: "ssh-config" },
  ];
  await using screen = await render(<ServerPickerPage servers={[]} />);
  await userEvent.click(screen.getByRole("button", { name: /box/ }));
  await vi.waitFor(() => expect(mocks.connect).toHaveBeenCalledWith({ target, label: "box" }));
  await expect.element(screen.getByText("已连接，但未保存到账户：offline")).toBeVisible();
});

it("resolves a manual alias while preserving the explicitly entered user and port", async () => {
  const { bridge, target } = setup();
  await using screen = await render(<ServerPickerPage servers={[]} />);
  await userEvent.click(screen.getByRole("button", { name: "手动输入" }));
  await userEvent.type(screen.getByLabelText("主机"), "box");
  await userEvent.type(screen.getByLabelText("用户名"), "bob");
  await userEvent.type(screen.getByLabelText("端口"), "2200");
  await userEvent.click(screen.getByRole("button", { name: "连接并保存" }));
  const resolved = { ...target, username: "bob", port: 2200 };
  await vi.waitFor(() =>
    expect(mocks.connect).toHaveBeenCalledWith({ target: resolved, label: "box" }),
  );
  expect(bridge.resolveSshHost).toHaveBeenCalledWith("box");
  expect(bridge.saveAccountSshHost).toHaveBeenCalledWith({ target: resolved, label: "box" });
});
