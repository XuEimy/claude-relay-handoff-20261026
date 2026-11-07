import { createStore } from "zustand";
import { resolveChatCanvasLayout, type ChatCanvasPreview } from "./chatCanvasLayout";

interface CanvasEdges {
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
}

export interface ChatCanvasMeasurements {
  readonly width: number;
  readonly height: number;
  readonly padding: number;
  readonly maxChatWidth: number;
  readonly minChatWidth: number;
  readonly composerHeight: number;
  readonly timelineGutter: number;
  /** The find bar's box in canvas coordinates while it is shown. */
  readonly findBar: CanvasEdges | null;
}

interface ChatCanvasStoreState {
  readonly measurements: ChatCanvasMeasurements;
  readonly setMeasurements: (next: ChatCanvasMeasurements) => void;
}

const INITIAL_MEASUREMENTS: ChatCanvasMeasurements = {
  width: 0,
  height: 0,
  padding: 48,
  maxChatWidth: 768,
  minChatWidth: 640,
  composerHeight: 0,
  timelineGutter: 0,
  findBar: null,
};

const sameEdges = (a: CanvasEdges | null, b: CanvasEdges | null) =>
  a === b ||
  (a !== null && b !== null && a.left === b.left && a.right === b.right && a.bottom === b.bottom);

const sameMeasurements = (a: ChatCanvasMeasurements, b: ChatCanvasMeasurements) =>
  a.width === b.width &&
  a.height === b.height &&
  a.padding === b.padding &&
  a.maxChatWidth === b.maxChatWidth &&
  a.minChatWidth === b.minChatWidth &&
  a.composerHeight === b.composerHeight &&
  a.timelineGutter === b.timelineGutter &&
  sameEdges(a.findBar, b.findBar);

export const createChatCanvasStore = () =>
  createStore<ChatCanvasStoreState>()((set) => ({
    measurements: INITIAL_MEASUREMENTS,
    setMeasurements: (next) =>
      set((state) => (sameMeasurements(state.measurements, next) ? state : { measurements: next })),
  }));

export type ChatCanvasStore = ReturnType<typeof createChatCanvasStore>;

export function resolveChatCanvasModel({
  measurements,
  preview,
}: {
  measurements: ChatCanvasMeasurements;
  preview: ChatCanvasPreview | null;
}) {
  const container = { width: measurements.width, height: measurements.height };
  const { findBar } = measurements;
  const layout = resolveChatCanvasLayout({
    container,
    preview,
    padding: measurements.padding,
    maxChatWidth: measurements.maxChatWidth,
    minChatWidth: measurements.minChatWidth,
    composerHeight: measurements.composerHeight,
    findBar,
  });
  return { container, layout };
}
