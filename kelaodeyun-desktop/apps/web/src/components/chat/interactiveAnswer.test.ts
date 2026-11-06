import { describe, expect, it } from "vite-plus/test";
import {
  interactiveAnswerCanRun,
  isInteractiveAnswerLanguage,
  MAX_INTERACTIVE_ANSWER_LENGTH,
} from "./interactiveAnswer";

describe("interactive answer execution boundary", () => {
  it("only recognizes explicitly marked generated components", () => {
    expect(isInteractiveAnswerLanguage("ui4a/tsx")).toBe(true);
    for (const language of ["tsx", "jsx", "html", "javascript", "mermaid", "ui4a/tsx-extra"]) {
      expect(isInteractiveAnswerLanguage(language)).toBe(false);
    }
  });
  it("does not execute interrupted, empty or oversized source", () => {
    expect(interactiveAnswerCanRun("export default () => <div />", false)).toBe(false);
    expect(interactiveAnswerCanRun("  ", true)).toBe(false);
    expect(interactiveAnswerCanRun("x".repeat(MAX_INTERACTIVE_ANSWER_LENGTH + 1), true)).toBe(
      false,
    );
    expect(interactiveAnswerCanRun("export default () => <div />", true)).toBe(true);
  });
});
