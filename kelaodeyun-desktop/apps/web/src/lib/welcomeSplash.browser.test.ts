import { expect, it, vi } from "vite-plus/test";
import { gsap } from "gsap";
import { showWelcomeSplash } from "./welcomeSplash";

function openSplash(ready: Promise<unknown> = Promise.resolve()) {
  const root = document.createElement("div");
  root.id = "root";
  document.body.append(root);
  const dismiss = showWelcomeSplash(ready);
  return {
    root,
    [Symbol.dispose]() {
      dismiss();
      root.remove();
    },
  };
}

it("skips with Escape and restores the app's keyboard access", () => {
  using splash = openSplash(new Promise(() => {}));
  const { root } = splash;
  expect(root.inert).toBe(true);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(document.getElementById("welcome-splash")).toBeNull();
  expect(root.inert).toBe(false);
});

it("waits for startup after the drawing ends, then removes the overlay", async () => {
  let resolveReady!: () => void;
  using splash = openSplash(
    new Promise<void>((resolve) => {
      resolveReady = resolve;
    }),
  );
  expect(splash.root.inert).toBe(true);
  const timeline = gsap.globalTimeline.getChildren(false, false, true).at(-1)!;
  timeline.progress(1);
  expect(document.querySelector(".welcome-status")?.textContent).toBe("正在启动…");
  resolveReady();
  await expect.poll(() => document.getElementById("welcome-splash"), { timeout: 2_000 }).toBeNull();
});

it("does not hide startup failures behind the animation", async () => {
  using splash = openSplash(Promise.reject(new Error("Startup failed")));
  await expect.poll(() => document.getElementById("welcome-splash")).toBeNull();
  expect(splash.root.inert).toBe(false);
});

it("respects reduced motion without making the app inert", () => {
  using media = vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
  using splash = openSplash();
  const { root } = splash;
  expect(media).toHaveBeenCalled();
  expect(document.getElementById("welcome-splash")).toBeNull();
  expect(root.inert).toBe(false);
});

it("reveals fractional stroke lengths and connects handwriting to the tapered cloud", () => {
  using splash = openSplash(new Promise(() => {}));
  expect(splash.root.inert).toBe(true);
  const timeline = gsap.globalTimeline.getChildren(false, false, true).at(-1)!;
  timeline.time(1);
  const word = document.querySelector(".word-brush")!;
  const offset = Number(word.getAttribute("stroke-dashoffset"));
  expect(offset).toBeGreaterThan(0);
  expect(offset).toBeLessThan(1);
  timeline.time(2.7);
  const connector = Number(
    document.querySelector(".welcome-connector")!.getAttribute("stroke-dashoffset"),
  );
  expect(connector).toBeGreaterThan(0);
  expect(connector).toBeLessThan(1);
  timeline.time(3.5);
  const cloud = Number((document.querySelector(".cloud-brush") as SVGPathElement).dataset.progress);
  expect(cloud).toBeGreaterThan(0);
  expect(cloud).toBeLessThan(1);
  expect(document.querySelector(".welcome-cloud g")?.getAttribute("mask")).toBe(
    "url(#welcome-cloud-mask)",
  );
  expect(document.querySelector(".welcome-scene linearGradient")).toBeNull();
  expect(document.querySelector(".welcome-cloud g:nth-child(2)")?.getAttribute("mask")).toBe(
    "url(#welcome-cloud-right-mask)",
  );
  expect(document.querySelector(".cloud-right-brush")?.getAttribute("d")).toBe("");
});

it("hides erased round caps so no isolated tail remains beside the logo", () => {
  using splash = openSplash(new Promise(() => {}));
  expect(splash.root.inert).toBe(true);
  const timeline = gsap.globalTimeline.getChildren(false, false, true).at(-1)!;
  timeline.time(4);
  expect(getComputedStyle(document.querySelector(".welcome-word")!).visibility).toBe("hidden");
  expect(getComputedStyle(document.querySelector(".welcome-connector")!).visibility).toBe("hidden");
  expect(getComputedStyle(document.querySelector(".welcome-cloud")!).visibility).toBe("visible");
});
