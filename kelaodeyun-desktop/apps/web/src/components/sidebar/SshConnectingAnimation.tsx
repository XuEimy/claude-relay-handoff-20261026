import DotGrid from "../react-bits/DotGrid";

export function SshConnectingAnimation() {
  return (
    <div className="size-[min(72vw,360px)]" aria-hidden="true">
      <DotGrid
        autoRipple
        shockRadius={260}
        dotSize={3}
        gap={16}
        baseColor="#242424"
        activeColor="#f5f4ef"
        proximity={90}
        strength={0.7}
        shockStrength={3}
        glow={0.3}
        fade={0.7}
        dpr={1.5}
      />
    </div>
  );
}
