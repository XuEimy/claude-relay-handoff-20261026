export const MAX_INTERACTIVE_ANSWER_LENGTH = 100_000;

export function isInteractiveAnswerLanguage(language: string): boolean {
  return language === "ui4a/tsx";
}

export function interactiveAnswerCanRun(code: string, complete: boolean): boolean {
  return complete && code.trim().length > 0 && code.length <= MAX_INTERACTIVE_ANSWER_LENGTH;
}

export function interactiveAnswerFiles(code: string, theme: "light" | "dark") {
  return {
    "/App.tsx": code,
    "/index.tsx": `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
createRoot(document.getElementById("root")!).render(<App />);`,
    "/styles.css": `:root { color-scheme: ${theme}; font-family: ui-serif, Georgia, "Songti SC", serif; }
* { box-sizing: border-box; }
body { margin: 0; padding: 20px; background: ${theme === "dark" ? "#101010" : "#ffffff"}; color: ${theme === "dark" ? "#ededed" : "#171717"}; }
button, input, select { font: inherit; }
button, input[type=range], select { cursor: pointer; }
svg, canvas, img { max-width: 100%; }
:focus-visible { outline: 2px solid #6b8cff; outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }`,
  };
}
