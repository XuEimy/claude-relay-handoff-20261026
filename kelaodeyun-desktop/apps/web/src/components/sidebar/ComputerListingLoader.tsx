import { useEffect, useState } from "react";

const SKELETON_WIDTHS = [40, 52, 68, 48, 72] as const;

export function ComputerListingLoader({ label }: { label: string }) {
  const [phase, setPhase] = useState(0);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- timers advance the loading status copy while the loader is mounted
  useEffect(() => {
    const reading = window.setTimeout(() => setPhase(1), 1_200);
    const slow = window.setTimeout(() => setPhase(2), 5_000);
    return () => {
      window.clearTimeout(reading);
      window.clearTimeout(slow);
    };
  }, []);

  const message =
    phase === 0
      ? `正在连接「${label}」…`
      : phase === 1
        ? "正在读取文件夹…"
        : `「${label}」响应有点慢，还在等待…`;

  return (
    <div className="computer-listing-loader" role="status" aria-label="正在读取电脑目录">
      <div className="computer-listing-loader-status">
        <span className="computer-listing-loader-orb" aria-hidden="true" />
        <span className="computer-listing-loader-text" aria-live="polite">
          {message}
        </span>
      </div>
      <div className="computer-listing-loader-rows" aria-hidden="true">
        {SKELETON_WIDTHS.map((width) => (
          <div key={width} className="computer-listing-loader-row">
            <span className="computer-listing-loader-icon" />
            <span className="computer-listing-loader-bar" style={{ width: `${width}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
