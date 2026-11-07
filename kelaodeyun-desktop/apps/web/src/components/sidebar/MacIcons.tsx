import { useId, type SVGProps } from "react";

export function MacIcon({
  kind,
  connected = false,
  size,
  ...props
}: SVGProps<SVGSVGElement> & {
  kind: "mini" | "imac" | "macbook";
  connected?: boolean;
  size?: "sm";
}) {
  const id = useId();
  const small = size === "sm";
  const tone = (amount: number) =>
    `color-mix(in srgb, var(--foreground) ${amount}%, var(--background))`;
  const light = connected ? `light-dark(${tone(14)}, ${tone(32)})` : tone(22);
  return (
    <svg
      {...props}
      viewBox="0 0 160 120"
      fill="none"
      strokeWidth="1.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ stroke: tone(60), ...props.style }}
      aria-label={kind}
    >
      <defs>
        <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="0" y2="1">
          <stop style={{ stopColor: tone(7) }} />
          <stop offset="1" style={{ stopColor: tone(18) }} />
        </linearGradient>
        <linearGradient id={`${id}-edge`} x1="0" y1="0" x2="0" y2="1">
          <stop style={{ stopColor: tone(18) }} />
          <stop offset="1" style={{ stopColor: tone(11) }} />
        </linearGradient>
        <radialGradient id={`${id}-wallpaper`} cx="25%" cy="20%" r="100%">
          <stop style={{ stopColor: light }} />
          <stop offset="1" style={{ stopColor: tone(8) }} />
        </radialGradient>
        <radialGradient id={`${id}-wallpaper-detail`} cx="86%" cy="90%" r="80%">
          <stop style={{ stopColor: tone(connected ? 28 : 20) }} />
          <stop offset="1" style={{ stopColor: tone(8), stopOpacity: 0 }} />
        </radialGradient>
        <filter id={`${id}-shadow`} x="-30%" y="-200%" width="160%" height="500%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
      {!small ? (
        <ellipse
          cx="80"
          cy="101"
          rx={kind === "macbook" ? "62" : "48"}
          ry="4"
          fill="currentColor"
          opacity="0.12"
          stroke="none"
          filter={`url(#${id}-shadow)`}
        />
      ) : null}
      {kind === "imac" ? (
        <>
          <path d="M73 76h14l3.5 17h-21z" fill={`url(#${id}-edge)`} />
          <path d="M67 96c0-2 3-3 6-3h14c3 0 6 1 6 3z" fill={`url(#${id}-metal)`} />
          <rect x="21" y="16" width="118" height="66" rx="5" fill={tone(65)} />
          <rect
            x="24.5"
            y="19.5"
            width="111"
            height="48"
            rx="1.5"
            fill={`url(#${id}-wallpaper)`}
            stroke="none"
          />
          {!small ? (
            <rect
              x="24.5"
              y="19.5"
              width="111"
              height="48"
              rx="1.5"
              fill={`url(#${id}-wallpaper-detail)`}
              stroke="none"
            />
          ) : null}
          <path d="M21 69h118v8a5 5 0 0 1-5 5H26a5 5 0 0 1-5-5z" fill={`url(#${id}-metal)`} />
          {connected ? (
            <circle
              cx="80"
              cy="18"
              r="1"
              fill="currentColor"
              stroke="none"
              style={{ filter: "drop-shadow(0 0 2px currentColor)" }}
            />
          ) : null}
        </>
      ) : kind === "macbook" ? (
        <>
          <path d="M28 19a5 5 0 0 1 5-5h94a5 5 0 0 1 5 5v64H28z" fill={tone(65)} />
          <rect
            x="31.5"
            y="17.5"
            width="97"
            height="62"
            rx="2"
            fill={`url(#${id}-wallpaper)`}
            stroke="none"
          />
          {!small ? (
            <rect
              x="31.5"
              y="17.5"
              width="97"
              height="62"
              rx="2"
              fill={`url(#${id}-wallpaper-detail)`}
              stroke="none"
            />
          ) : null}
          <path d="M73 17h14v2.5a2 2 0 0 1-2 2H75a2 2 0 0 1-2-2z" fill={tone(65)} stroke="none" />
          <path d="M17 83h126l-5 8H22z" fill={`url(#${id}-metal)`} />
          <path d="M22 91h116c-2 2-5 3-9 3H31c-4 0-7-1-9-3z" fill={`url(#${id}-edge)`} />
          <path d="M72 83c.5 2 2 3 4 3h8c2 0 3.5-1 4-3" />
          {connected ? (
            <circle
              cx="80"
              cy="19.5"
              r="1"
              fill="currentColor"
              stroke="none"
              style={{ filter: "drop-shadow(0 0 2px currentColor)" }}
            />
          ) : null}
        </>
      ) : (
        <>
          <path
            d="M22 57v18c0 4 3 7 7 8l79 12c4 1 7 0 10-2l20-13V62L112 76 31 65z"
            fill={`url(#${id}-edge)`}
          />
          <path
            d="M28 45 53 32c3-2 6-2 9-2l68 11c5 1 8 3 8 7v14c0 3-2 5-5 7l-19 11c-3 2-6 2-10 2L28 69c-4-1-6-3-6-7V54c0-4 2-7 6-9z"
            fill={`url(#${id}-metal)`}
          />
          <path d="M23 62c1 3 3 5 7 6l74 12c4 1 7 0 10-1l24-14" />
          <circle
            cx="105"
            cy="88"
            r={connected ? "1.8" : "1.1"}
            fill="currentColor"
            stroke="none"
            style={connected ? { filter: "drop-shadow(0 0 3px currentColor)" } : undefined}
          />
        </>
      )}
    </svg>
  );
}
