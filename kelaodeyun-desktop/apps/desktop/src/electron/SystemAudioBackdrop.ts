import { desktopCapturer, type BrowserWindow, type Session, type WebContents } from "electron";

const allowed = new WeakMap<Session, Set<WebContents>>();

/** Only a direct gesture in our main app can request the loopback audio stream. */
export function registerSystemAudioBackdrop(window: BrowserWindow): void {
  const session = window.webContents.session;
  let windows = allowed.get(session);
  if (!windows) {
    windows = new Set();
    allowed.set(session, windows);
    const registered = windows;
    session.setDisplayMediaRequestHandler((request, callback) => {
      const frame = request.frame;
      const trusted = frame && [...registered].some((contents) => !contents.isDestroyed() && contents.mainFrame === frame) &&
        /^agentcloudos(?:-dev)?:\/\/app(?:\/|$)/.test(frame.url);
      if (!trusted || !request.userGesture || !request.audioRequested) { callback({}); return; }
      void desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 0, height: 0 } })
        .then((sources) => {
          // Revalidate after the OS permission prompt, since the user may have navigated away.
          if (!sources[0] || ![...registered].some((contents) => !contents.isDestroyed() && contents.mainFrame === frame) || !/^agentcloudos(?:-dev)?:\/\/app(?:\/|$)/.test(frame.url)) { callback({}); return; }
          callback({ video: sources[0], audio: "loopback" });
        }).catch(() => callback({}));
    });
  }
  const registeredWindows = windows;
  registeredWindows.add(window.webContents);
  const contents = window.webContents;
  contents.once("destroyed", () => registeredWindows.delete(contents));
}
