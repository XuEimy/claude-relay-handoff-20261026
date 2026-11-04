import { useEffect, useRef } from "react";

export function useSshConnectionCelebration(connected: boolean) {
  const previous = useRef(false);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- plays an external canvas effect only when a live SSH connection becomes ready
  useEffect(() => {
    const arrived = connected && !previous.current;
    previous.current = connected;
    if (!arrived || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cancelled = false;
    void import("canvas-confetti")
      .then(({ default: confetti }) => {
        if (cancelled) return;
        for (const side of [0, 1]) {
          void confetti({
            particleCount: 55,
            angle: side === 0 ? 55 : 125,
            spread: 55,
            startVelocity: 48,
            gravity: 1,
            ticks: 170,
            origin: { x: side, y: 0.6 },
            shapes: ["square"],
            scalar: 0.85,
            disableForReducedMotion: true,
            zIndex: 200,
          });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [connected]);
}
