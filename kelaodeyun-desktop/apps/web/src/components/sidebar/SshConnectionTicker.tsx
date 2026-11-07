import { useEffect, useRef, useState } from "react";
import type { SshConnectionLine } from "./useSshConnectionProgress";
import "./sshConnection.css";

export function SshConnectionTicker({ line }: { line: SshConnectionLine }) {
  const [current, setCurrent] = useState(line);
  const [previous, setPrevious] = useState<SshConnectionLine | null>(null);
  const displayedAt = useRef<number | null>(null);
  const visible = line.key === current.key ? line : current;

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- schedules native progress lines with a minimum visible dwell
  useEffect(() => {
    displayedAt.current ??= Date.now();
    if (line.key === current.key) {
      if (
        line.text !== current.text ||
        line.detail !== current.detail ||
        line.progress !== current.progress
      ) {
        // oxlint-disable-next-line react/set-state-in-effect -- preserves the latest visible content while the next step is waiting
        setCurrent(line);
      }
      return;
    }
    const delay = Math.max(0, 450 - (Date.now() - displayedAt.current));
    const timer = window.setTimeout(() => {
      setPrevious(current);
      setCurrent(line);
      displayedAt.current = Date.now();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [line, current]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex w-[min(80vw,24rem)] max-w-full flex-col items-center gap-2 text-center text-sm tabular-nums"
    >
      <div
        className="relative h-5 w-full overflow-hidden"
        style={{
          maskImage: "linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)",
        }}
      >
        {previous ? (
          <div
            key={`old-${current.key}`}
            aria-hidden="true"
            data-ssh-ticker="exit"
            className="absolute inset-0 truncate"
          >
            {previous.text}
            {previous.detail ? ` · ${previous.detail}` : null}
          </div>
        ) : null}
        <div
          key={current.key}
          data-ssh-ticker={previous ? "enter" : undefined}
          className="absolute inset-0 truncate"
        >
          {visible.text}
          {visible.detail ? ` · ${visible.detail}` : null}
        </div>
      </div>
      {visible.progress !== undefined ? (
        <div aria-hidden="true" className="h-0.5 w-40 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-foreground/60 transition-[width] duration-300 ease-out motion-reduce:transition-none"
            style={{ width: `${Math.max(0, Math.min(1, visible.progress)) * 100}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
