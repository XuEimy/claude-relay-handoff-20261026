import { expect, it, vi } from "vite-plus/test";
import { render } from "../../../test/render";
import InteractiveAnswerPreview from "./InteractiveAnswerPreview";

it("runs React state locally while isolating the parent and blocking network access", async () => {
  const reports: Array<{ count: number; isolated: boolean; networkBlocked: boolean }> = [];
  const receive = (event: MessageEvent) => {
    if (event.data?.probe === "local-preview") reports.push(event.data);
  };
  window.addEventListener("message", receive);
  try {
    await using screen = await render(
      <InteractiveAnswerPreview
        theme="light"
        code={`
import React, { useState, useEffect } from "react";
export default function App() {
  const [count, setCount] = useState<number>(0);
  useEffect(() => {
    let isolated = false;
    try { void parent.document.body; } catch { isolated = true; }
    fetch("https://example.com/preview-probe").then(
      () => parent.postMessage({probe:"local-preview",count,isolated,networkBlocked:false}, "*"),
      () => parent.postMessage({probe:"local-preview",count,isolated,networkBlocked:true}, "*")
    );
    if (count === 0) document.querySelector("button").click();
  }, [count]);
  return <button onClick={() => setCount(count + 1)}>{count} {"</script><p>literal text</p>"}</button>;
}`}
      />,
    );
    await vi.waitFor(() =>
      expect(reports).toContainEqual({
        probe: "local-preview",
        count: 1,
        isolated: true,
        networkBlocked: true,
      }),
    );
    const frame = screen.container.querySelector("iframe")!;
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.hasAttribute("src")).toBe(false);
    expect(frame.srcdoc).not.toContain("<script src=");
  } finally {
    window.removeEventListener("message", receive);
  }
});

it("shows malformed source as an error without mounting an executable frame", async () => {
  await using screen = await render(
    <InteractiveAnswerPreview theme="dark" code="export default function (" />,
  );
  await expect.element(screen.getByRole("alert")).toBeVisible();
  expect(screen.container.querySelector("iframe")).toBeNull();
});
