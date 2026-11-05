import { useId } from "react";

export function SshConnectionBackdrop({ connected }: { connected: boolean }) {
  const id = useId().replaceAll(":", "");
  return (
    <div
      aria-hidden="true"
      data-ssh-part="backdrop"
      className="pointer-events-none absolute inset-x-0 top-0 z-0 h-20 overflow-hidden select-none"
    >
      <svg
        className="h-full w-full"
        viewBox="0 0 768 96"
        preserveAspectRatio="xMinYMin slice"
        fill="none"
      >
        <defs>
          <linearGradient
            id={`${id}-paper`}
            x1="0"
            y1="0"
            x2="300"
            y2="96"
            gradientUnits="userSpaceOnUse"
          >
            <stop data-ssh-part="paper-start" />
            <stop offset="1" data-ssh-part="paper-end" />
          </linearGradient>
          <radialGradient
            id={`${id}-glow`}
            cx="0"
            cy="0"
            r="1"
            gradientTransform="translate(205 12) scale(145 65)"
            gradientUnits="userSpaceOnUse"
          >
            <stop data-ssh-part="glow-color" stopOpacity=".48" />
            <stop offset="1" data-ssh-part="glow-color" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${id}-sweep`}>
            <stop stopColor="var(--foreground)" stopOpacity="0" />
            <stop offset=".5" stopColor="var(--foreground)" stopOpacity=".24" />
            <stop offset="1" stopColor="var(--foreground)" stopOpacity="0" />
          </linearGradient>
          <pattern id={`${id}-grid`} width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M24 0H0V24" data-ssh-part="grid-line" strokeWidth=".5" />
          </pattern>
        </defs>
        <rect width="768" height="96" fill={`url(#${id}-paper)`} />
        <rect data-ssh-part="backdrop-glow" width="768" height="96" fill={`url(#${id}-glow)`} />
        <rect width="768" height="96" fill={`url(#${id}-grid)`} />
        {connected ? (
          <rect data-ssh-part="connect-sweep" width="100" height="96" fill={`url(#${id}-sweep)`} />
        ) : null}
      </svg>
    </div>
  );
}
