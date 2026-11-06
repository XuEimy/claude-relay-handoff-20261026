import { expect, it, vi } from "vite-plus/test";
import { render } from "../../../test/render";
import { InteractiveAnswerBlock } from "./InteractiveAnswerBlock";

vi.mock(import("./InteractiveAnswerPreview"), () => ({
  default: () => <div data-testid="runtime">Runtime</div>,
}));

it("keeps interrupted code inert and mounts the preview only after its fence closes", async () => {
  const block = (complete: boolean, streaming: boolean) => (
    <InteractiveAnswerBlock
      code="export default () => <div />"
      title="尺子"
      theme="light"
      complete={complete}
      streaming={streaming}
    >
      <pre>Source</pre>
    </InteractiveAnswerBlock>
  );
  await using screen = await render(block(false, true));
  await expect.element(screen.getByTestId("runtime")).not.toBeInTheDocument();
  await screen.rerender(block(false, false));
  await expect.element(screen.getByText("生成未完成，可查看源码或继续对话。")).toBeVisible();
  await expect.element(screen.getByTestId("runtime")).not.toBeInTheDocument();
  await screen.rerender(block(true, false));
  await expect.element(screen.getByTestId("runtime")).toBeVisible();
  await screen.getByRole("button", { name: "代码", exact: true }).click();
  await expect.element(screen.getByText("Source")).toBeVisible();
  await expect.element(screen.getByTestId("runtime")).toBeInTheDocument();
  await screen.getByRole("button", { name: "暂停", exact: true }).click();
  await expect.element(screen.getByTestId("runtime")).not.toBeInTheDocument();
  await screen.getByRole("button", { name: "运行", exact: true }).click();
  await expect.element(screen.getByTestId("runtime")).toBeInTheDocument();
});
