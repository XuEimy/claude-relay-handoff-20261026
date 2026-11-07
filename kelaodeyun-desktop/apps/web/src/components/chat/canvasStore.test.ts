import { describe, expect, it } from "vite-plus/test";
import {
  createChatCanvasStore,
  resolveChatCanvasModel,
  type ChatCanvasMeasurements,
} from "./canvasStore";

const measurements = (width: number, height = 900): ChatCanvasMeasurements => ({
  width,
  height,
  padding: 48,
  maxChatWidth: 768,
  minChatWidth: 640,
  composerHeight: 180,
  timelineGutter: 0,
  findBar: null,
});

describe("chat canvas model", () => {
  it("keeps the chat centered without reserving a details card lane", () => {
    const model = resolveChatCanvasModel({ measurements: measurements(1108), preview: null });
    expect(model.layout.chat).toEqual({ left: 170, width: 768, insetStart: 0, insetEnd: 0 });
  });

  it("keeps state identity when a measurement repeats", () => {
    const store = createChatCanvasStore();
    store.getState().setMeasurements(measurements(1400));
    const before = store.getState();
    store.getState().setMeasurements(measurements(1400));
    expect(store.getState()).toBe(before);
  });
});
