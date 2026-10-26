import DotGlobe from "./react-bits/DotGlobe.jsx";

export default function DigitalGlobe({ paused = false }) {
  return (
    <DotGlobe
      dotSize={3.8}
      gap={4.7}
      baseColor="#817867"
      activeColor="#af644b"
      proximity={110}
      strength={0.22}
      bounce={0.3}
      tension={0.08}
      returnDuration={1.2}
      shockRadius={230}
      shockStrength={1.1}
      swell={0.3}
      stretch={0}
      glow={0}
      intro={false}
      paused={paused}
      dpr={1.5}
      opacity={1}
    />
  );
}
