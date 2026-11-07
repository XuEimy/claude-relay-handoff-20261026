import { expect, it, vi } from "vite-plus/test";
import { act, fakeTimers, render } from "../../../test/render";
import { SshConnectionTicker } from "./SshConnectionTicker";

it("keeps the latest pending step, observes dwell, and updates progress in place", async () => {
  using _timers = fakeTimers();
  await using screen = await render(<SshConnectionTicker line={{ key: "first", text: "First" }} />);
  const current = () => screen.container.querySelector('[role="status"] > div')?.lastElementChild;

  await screen.rerender(<SshConnectionTicker line={{ key: "second", text: "Second" }} />);
  await screen.rerender(
    <SshConnectionTicker line={{ key: "upload", text: "Upload 0%", progress: 0 }} />,
  );
  await act(() => vi.advanceTimersByTime(449));
  expect(current()?.textContent).toBe("First");
  await act(() => vi.advanceTimersByTime(1));
  expect(current()?.textContent).toBe("Upload 0%");
  const element = current();
  await screen.rerender(
    <SshConnectionTicker line={{ key: "upload", text: "Upload 50%", progress: 0.5 }} />,
  );
  expect(current()).toBe(element);
  expect(current()?.textContent).toBe("Upload 50%");
  await screen.rerender(<SshConnectionTicker line={{ key: "ready", text: "Ready" }} />);
  await act(() => vi.advanceTimersByTime(449));
  expect(current()?.textContent).toBe("Upload 50%");
  await act(() => vi.advanceTimersByTime(1));
  expect(current()?.textContent).toBe("Ready");
});
