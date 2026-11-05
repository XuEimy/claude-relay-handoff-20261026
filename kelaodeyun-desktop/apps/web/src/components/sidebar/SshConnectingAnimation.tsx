import { useLayoutEffect, useRef, useState } from "react";
import "culori/css";
import { formatHex } from "culori/fn";
import DotGrid from "../react-bits/DotGrid";

export function SshConnectingAnimation() {
  const baseRef = useRef<HTMLSpanElement>(null);
  const activeRef = useRef<HTMLSpanElement>(null);
  const [colors, setColors] = useState<{ base: string; active: string } | null>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- WebGL needs resolved hex colors, including live theme edits to inherited CSS variables
  useLayoutEffect(() => {
    const base = baseRef.current;
    const active = activeRef.current;
    if (!base || !active) return;
    const refresh = () => {
      const nextBase = formatHex(getComputedStyle(base).color);
      const nextActive = formatHex(getComputedStyle(active).color);
      if (!nextBase || !nextActive) return;
      setColors((current) =>
        current?.base === nextBase && current.active === nextActive
          ? current
          : { base: nextBase, active: nextActive },
      );
    };
    refresh();
    const observer = new MutationObserver(refresh);
    for (
      let ancestor: HTMLElement | null = base.parentElement;
      ancestor;
      ancestor = ancestor.parentElement
    ) {
      observer.observe(ancestor, { attributes: true });
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="size-[min(72vw,360px)]" aria-hidden="true">
      <span
        ref={baseRef}
        className="hidden"
        style={{ color: "color-mix(in srgb, var(--foreground) 22%, var(--background))" }}
      />
      <span
        ref={activeRef}
        className="hidden"
        style={{ color: "color-mix(in srgb, var(--primary) 65%, var(--foreground))" }}
      />
      {colors ? (
        <DotGrid
          autoRipple
          shockRadius={260}
          dotSize={3}
          gap={16}
          baseColor={colors.base}
          activeColor={colors.active}
          proximity={90}
          strength={0.7}
          shockStrength={3}
          glow={0.3}
          fade={0.7}
          dpr={1.5}
        />
      ) : null}
    </div>
  );
}
