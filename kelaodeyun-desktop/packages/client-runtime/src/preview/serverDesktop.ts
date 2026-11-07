import {
  PREVIEW_DESKTOP_FAILED_CLOSE_CODE,
  PREVIEW_DESKTOP_PREPARING_CLOSE_CODE,
  PREVIEW_DESKTOP_WS_PATH,
  PREVIEW_STREAM_HOST_SETUP_CLOSE_CODE,
  type PreviewStreamHostSetup,
} from "@t3tools/contracts";

import { type DeviceHubAccess, withDeviceHubQuery } from "../device/hubAccess.ts";
import { decodeHostSetup, PREVIEW_STREAM_BASE_PATH } from "./serverBrowserStream.ts";

/** The desktop shares the preview stream's media access; only the route differs. */
export const previewDesktopUrl = (access: DeviceHubAccess): string => {
  const base = access.wsBase.endsWith(PREVIEW_STREAM_BASE_PATH)
    ? access.wsBase.slice(0, -PREVIEW_STREAM_BASE_PATH.length)
    : access.wsBase;
  return withDeviceHubQuery(`${base}${PREVIEW_DESKTOP_WS_PATH}`, access);
};

export type PreviewDesktopClose =
  | { readonly _tag: "hostSetup"; readonly setup: PreviewStreamHostSetup }
  | { readonly _tag: "preparing"; readonly detail: string }
  | { readonly _tag: "failed"; readonly message: string }
  | { readonly _tag: "unauthorized" }
  | { readonly _tag: "retry" };

export const previewDesktopClose = (
  event: { readonly code: number; readonly reason: string },
  opened: boolean,
): PreviewDesktopClose => {
  switch (event.code) {
    case PREVIEW_STREAM_HOST_SETUP_CLOSE_CODE:
      return { _tag: "hostSetup", setup: decodeHostSetup(event.reason) };
    case PREVIEW_DESKTOP_PREPARING_CLOSE_CODE:
      return { _tag: "preparing", detail: event.reason || "Starting the desktop…" };
    case PREVIEW_DESKTOP_FAILED_CLOSE_CODE:
      return { _tag: "failed", message: event.reason || "The desktop could not start." };
    case 1008:
    case 4401:
      return { _tag: "unauthorized" };
    default:
      // Rejected upgrades surface as 1006 before open for both cookies and tickets.
      return !opened && event.code === 1006 ? { _tag: "unauthorized" } : { _tag: "retry" };
  }
};
