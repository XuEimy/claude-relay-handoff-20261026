import { StrictMode } from "react";
import { expect, it, vi } from "vite-plus/test";
import { render } from "../../../test/render";
import { SshConnectingAnimation } from "./SshConnectingAnimation";

vi.mock("../react-bits/DotGrid", () => ({
  default: ({ baseColor, activeColor }: { baseColor: string; activeColor: string }) => (
    <div data-animation-colors={`${baseColor},${activeColor}`} />
  ),
}));

it.each([
  ["dark", "#000000", "#ffffff", "#383838,#ffffff"],
  ["light", "#ffffff", "#000000", "#c7c7c7,#000000"],
])(
  "resolves %s theme colors for the WebGL animation",
  async (_, background, foreground, expected) => {
    await using screen = await render(
      <div
        style={
          {
            "--background": background,
            "--foreground": foreground,
            "--primary": foreground,
          } as React.CSSProperties
        }
      >
        <SshConnectingAnimation />
      </div>,
    );
    expect(
      screen.container
        .querySelector("[data-animation-colors]")
        ?.getAttribute("data-animation-colors"),
    ).toBe(expected);
  },
);

it("updates a mounted animation when inherited custom theme colors change", async () => {
  await using screen = await render(
    <StrictMode>
      <div
        data-theme-host
        style={
          {
            "--background": "oklch(1 0 0)",
            "--foreground": "oklch(0 0 0)",
            "--primary": "#000000",
          } as React.CSSProperties
        }
      >
        <SshConnectingAnimation />
      </div>
    </StrictMode>,
  );
  const host = screen.container.querySelector<HTMLElement>("[data-theme-host]")!;
  const colors = () =>
    screen.container
      .querySelector("[data-animation-colors]")
      ?.getAttribute("data-animation-colors");
  expect(colors()).toBe("#c7c7c7,#000000");
  host.style.setProperty("--primary", "#ff0000");
  await expect.poll(colors).toBe("#c7c7c7,#a60000");
  host.style.setProperty("--background", "#000000");
  host.style.setProperty("--foreground", "#ffffff");
  await expect.poll(colors).toBe("#383838,#ff5959");
});
