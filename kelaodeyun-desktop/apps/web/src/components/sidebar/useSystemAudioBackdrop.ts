import { useEffect, useRef, useState } from "react";

/** Audio stays in this renderer and is never connected to the speakers. */
export function useSystemAudioBackdrop(isElectron: boolean) {
  const [enabled, setEnabled] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- owns automatic system audio capture and releases it when the desktop header unmounts
  useEffect(() => {
    if (!isElectron || !navigator.mediaDevices?.getDisplayMedia) return;
    let disposed = false;
    let busy = false;
    let release: (() => void) | null = null;
    const start = async () => {
      if (disposed || busy || release) return;
      busy = true;
      let stream: MediaStream | null = null;
      let context: AudioContext | null = null;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const audio = stream.getAudioTracks()[0];
        if (!audio || audio.readyState !== "live")
          throw new Error(
            "没有获取到系统声音。请允许系统音频录制，并确认已重启 App 以启用声音律动。",
          );
        stream.getVideoTracks().forEach((track) => track.stop());
        context = new AudioContext();
        const source = context.createMediaStreamSource(new MediaStream([audio]));
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.8;
        source.connect(analyser);
        await context.resume();
        if (disposed) {
          source.disconnect();
          stream.getTracks().forEach((track) => track.stop());
          await context.close();
          return;
        }
        const samples = new Uint8Array(analyser.frequencyBinCount);
        const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
        let frame = 0;
        let level = 0;
        const draw = () => {
          analyser.getByteFrequencyData(samples);
          const bass = samples.slice(1, 12).reduce((sum, value) => sum + value, 0) / (11 * 255);
          const target = document.hidden || motion.matches ? 0 : Math.max(0, bass - 0.04);
          level += (target - level) * (target > level ? 0.3 : 0.08);
          root.current?.style.setProperty("--audio-lift", `${(level * 7).toFixed(2)}px`);
          root.current?.style.setProperty("--audio-scale", `${1 + level * 0.18}`);
          root.current?.style.setProperty("--audio-brightness", `${1 + level * 0.16}`);
          frame = requestAnimationFrame(draw);
        };
        const ownedStream = stream;
        const ownedContext = context;
        const ended = () => {
          release?.();
          release = null;
          setEnabled(false);
        };
        audio.addEventListener("ended", ended);
        release = () => {
          cancelAnimationFrame(frame);
          audio.removeEventListener("ended", ended);
          source.disconnect();
          ownedStream.getTracks().forEach((track) => track.stop());
          void ownedContext.close();
          root.current?.style.removeProperty("--audio-lift");
          root.current?.style.removeProperty("--audio-scale");
          root.current?.style.removeProperty("--audio-brightness");
        };
        draw();
        setEnabled(true);
      } catch {
        stream?.getTracks().forEach((track) => track.stop());
        if (context && context.state !== "closed") void context.close();
        // Unsupported capture or denied permission keeps the normal backdrop.
        // Never interrupt startup with an error dialog for this decorative effect.
      } finally {
        busy = false;
      }
    };
    // Defer capture so React's development effect replay does not open two requests.
    const startup = window.setTimeout(() => void start(), 0);
    // Some runtimes require user activation: retry on the first ordinary interaction.
    const activate = () => void start();
    window.addEventListener("pointerdown", activate, { once: true });
    return () => {
      disposed = true;
      window.clearTimeout(startup);
      window.removeEventListener("pointerdown", activate);
      release?.();
    };
  }, [isElectron]);
  return { root, enabled };
}
