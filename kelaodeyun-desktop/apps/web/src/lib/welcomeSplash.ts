import { gsap } from "gsap";
import welcomeSvg from "../../../../assets/agent-cloud-os/welcome.svg?raw";
import cloudSvg from "../../../../assets/agent-cloud-os/mark.svg?raw";
import { APP_BASE_NAME } from "../branding";
import "./welcomeSplash.css";

const welcomePath =
  "M24 81 C18 97 12 124 25 124 C37 124 47 99 53 82 C45 103 42 126 55 125 C73 124 87 95 84 80 C82 73 76 77 79 86 C84 101 94 104 104 95 C134 69 147 87 111 104 C97 112 108 131 130 121 C159 107 185 58 181 37 C176 15 143 90 151 115 C157 135 175 121 189 106 C207 85 226 79 226 91 C208 80 190 114 205 123 C221 133 238 111 247 100 C269 75 291 91 276 114 C258 140 237 120 247 100 C259 79 282 87 279 103 C278 117 290 117 303 99 C313 83 320 82 314 101 L305 124 C320 103 337 83 340 94 C341 101 329 119 331 125 C347 105 364 86 367 96 C369 107 351 125 365 126 C379 126 388 109 399 99 C427 77 440 94 405 109 C391 118 408 136 433 119 C447 109 455 111 465 114";

// These wide reveal paths are clipped by the original silhouette, preserving its tapered tips.
const cloudBrush = "M15 220 C35 150 85 65 180 45 C270 35 325 145 345 220";
function createTaperedReveal(
  overlay: HTMLElement,
  guideSelector: string,
  inkSelector: string,
  radius: number,
  nibLength: number,
) {
  const guide = overlay.querySelector<SVGPathElement>(guideSelector)!;
  const ink = overlay.querySelector<SVGPathElement>(inkSelector)!;
  const length = guide.getTotalLength();
  const count = Math.ceil(length / 7);
  const samples = Array.from({ length: count + 1 }, (_, index) => {
    const distance = (index / count) * length;
    const point = guide.getPointAtLength(distance);
    const before = guide.getPointAtLength(Math.max(0, distance - 1));
    const after = guide.getPointAtLength(Math.min(length, distance + 1));
    const tangent = Math.hypot(after.x - before.x, after.y - before.y) || 1;
    return {
      x: point.x,
      y: point.y,
      nx: -(after.y - before.y) / tangent,
      ny: (after.x - before.x) / tangent,
      distance,
    };
  });
  const progress = { value: 0 };
  const paint = () => {
    const head = progress.value * (length + nibLength);
    const left: string[] = [];
    const right: string[] = [];
    for (const point of samples) {
      if (point.distance > head) break;
      const pressure = Math.min(1, Math.max(0, (head - point.distance) / nibLength));
      const width = radius * pressure * pressure * (3 - 2 * pressure);
      left.push(
        `${(point.x + point.nx * width).toFixed(2)} ${(point.y + point.ny * width).toFixed(2)}`,
      );
      right.push(
        `${(point.x - point.nx * width).toFixed(2)} ${(point.y - point.ny * width).toFixed(2)}`,
      );
    }
    ink.setAttribute(
      "d",
      left.length > 1 ? `M${left.join(" L")} L${right.reverse().join(" L")} Z` : "",
    );
    ink.dataset.progress = String(progress.value);
  };
  paint();
  return { progress, paint };
}

let activeDismiss: (() => void) | undefined;

export function showWelcomeSplash(ready: Promise<unknown> = Promise.resolve()): () => void {
  activeDismiss?.();
  const existing = document.getElementById("welcome-splash");
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    existing?.remove();
    return () => {};
  }
  const overlay = existing ?? document.createElement("div");
  overlay.id = "welcome-splash";
  overlay.removeAttribute("aria-hidden");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", `欢迎使用 ${APP_BASE_NAME}`);
  const silhouettes = new DOMParser()
    .parseFromString(cloudSvg, "image/svg+xml")
    .querySelectorAll("path");
  const welcomeOutline = new DOMParser().parseFromString(welcomeSvg, "image/svg+xml")
    .documentElement.innerHTML;
  overlay.innerHTML = `
    <svg class="welcome-scene" viewBox="0 0 720 400" aria-hidden="true">
      <defs>
        <mask id="welcome-word-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="490" height="160">
          <path class="word-brush" d="${welcomePath}" fill="none" stroke="white" stroke-width="14" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>
        </mask>
        <mask id="welcome-cloud-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="360" height="280">
          <path class="cloud-guide" d="${cloudBrush}" fill="none" stroke="none"/>
          <path class="cloud-brush" fill="white"/>
        </mask>
      </defs>
      <g class="welcome-word" transform="translate(55 95) scale(1.25)" mask="url(#welcome-word-mask)">
        ${welcomeOutline}
      </g>
      <path class="welcome-connector" d="M636.25 237.5 C709 250 712 137 630 120 C550 104 470 134 432.7 186.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>
      <g class="welcome-cloud" transform="translate(207 95) scale(.85)">
        <g mask="url(#welcome-cloud-mask)" fill="currentColor">${silhouettes[0]!.outerHTML}</g>
      </g>
    </svg>
    <button class="welcome-skip" type="button">跳过 <kbd>Esc</kbd></button>
    <span class="welcome-status" role="status"></span>`;
  if (!existing) document.body.append(overlay);
  const root = document.getElementById("root");
  const previouslyInert = root?.inert ?? false;
  const previousFocus = document.activeElement;
  if (root) root.inert = true;
  const skip = overlay.querySelector<HTMLButtonElement>("button")!;
  const status = overlay.querySelector<HTMLElement>(".welcome-status")!;
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  let disposed = false;
  let appReady = false;
  let animationDone = false;
  let exitStarted = false;
  let exitTween: gsap.core.Tween | undefined;
  const timeline = gsap.timeline({ paused: true });
  const dismiss = () => {
    if (disposed) return;
    disposed = true;
    timeline.kill();
    exitTween?.kill();
    clearTimeout(timeout);
    document.removeEventListener("keydown", onKey, true);
    media.removeEventListener("change", dismiss);
    overlay.remove();
    if (root) root.inert = previouslyInert;
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    if (activeDismiss === dismiss) activeDismiss = undefined;
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    dismiss();
  };
  const revealApp = () => {
    if (disposed || exitStarted || !appReady || !animationDone) return;
    exitStarted = true;
    exitTween = gsap.to(overlay, {
      opacity: 0,
      duration: 0.45,
      ease: "power2.inOut",
      onComplete: dismiss,
    });
  };
  const timeout = window.setTimeout(dismiss, 12_000);
  activeDismiss = dismiss;
  skip.addEventListener("click", dismiss, { once: true });
  document.addEventListener("keydown", onKey, true);
  media.addEventListener("change", dismiss, { once: true });
  skip.focus({ preventScroll: true });
  void ready.then(() => {
    appReady = true;
    revealApp();
  }, dismiss);
  const wordBrush = overlay.querySelector(".word-brush")!;
  const connector = overlay.querySelector(".welcome-connector")!;
  const brush = createTaperedReveal(overlay, ".cloud-guide", ".cloud-brush", 140, 180);
  // Animate SVG attributes so CSSPlugin cannot round normalized dash lengths to whole pixels.
  timeline
    .to(wordBrush, { attr: { "stroke-dashoffset": 0 }, duration: 2, ease: "none" }, 0.1)
    .to(connector, { attr: { "stroke-dashoffset": 0 }, duration: 0.7, ease: "none" }, 2.3)
    .to(wordBrush, { attr: { "stroke-dashoffset": -1 }, duration: 0.85, ease: "none" }, 2.5)
    .to(brush.progress, { value: 1, duration: 1.7, ease: "none", onUpdate: brush.paint }, 2.97)
    .to(connector, { attr: { "stroke-dashoffset": -1 }, duration: 0.75, ease: "none" }, 3.1)
    .set(overlay.querySelector(".welcome-word"), { visibility: "hidden" }, 3.36)
    .set(connector, { visibility: "hidden" }, 3.86)
    .call(
      () => {
        animationDone = true;
        if (!appReady) status.textContent = "正在启动…";
        revealApp();
      },
      [],
      5.95,
    )
    .play();
  return dismiss;
}
