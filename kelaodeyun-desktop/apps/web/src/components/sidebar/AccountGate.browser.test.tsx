import "~/index.css";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { AccountGate } from "./AccountGate";

function setup(status: "signed-in" | "signed-out" | "web") {
  const signIn = vi.fn(() => new Promise(() => {}));
  vi.stubGlobal(
    "desktopBridge",
    status === "web"
      ? undefined
      : {
          getAccountState: vi
            .fn()
            .mockResolvedValue(
              status === "signed-in"
                ? { status, user: { email: "user@example.com", name: null, avatar: null } }
                : { status },
            ),
          onAccountState: vi.fn(() => () => {}),
          signInAccount: signIn,
          signOutAccount: vi.fn().mockResolvedValue(undefined),
        },
  );
  return { signIn };
}

it("requires browser login when signed out", async () => {
  const { signIn } = setup("signed-out");
  await using screen = await render(
    <AccountGate>
      <p>workspace</p>
    </AccountGate>,
  );
  await expect.element(screen.getByText("登录 Agent Cloud OS")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "使用浏览器登录" }));
  expect(signIn).toHaveBeenCalledOnce();
  await expect.element(screen.getByText("已在浏览器中打开，完成登录后自动返回…")).toBeVisible();
});

it("renders the workspace for signed-in desktop and plain web", async () => {
  setup("signed-in");
  await using screen = await render(
    <AccountGate>
      <p>workspace</p>
    </AccountGate>,
  );
  await expect.element(screen.getByText("workspace")).toBeVisible();
  setup("web");
  await screen.rerender(
    <AccountGate>
      <p>web workspace</p>
    </AccountGate>,
  );
  await expect.element(screen.getByText("web workspace")).toBeVisible();
});
