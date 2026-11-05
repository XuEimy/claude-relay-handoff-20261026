import { SidebarErrorDialog } from "./SidebarErrorDialog";
import { useEffect, useState } from "react";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { SidebarViewPanel } from "./SidebarViewPanel";
import "~/index.css";

it("keeps loaded content, folder expansion, search and scroll position across switches", async () => {
  const load = vi.fn();
  function Content({ name }: { name: string }) {
    const [query, setQuery] = useState("");
    const [expanded, setExpanded] = useState(false);
    useEffect(() => {
      load(name);
    }, [name]);
    return (
      <div data-scroll={name} style={{ height: 100, overflow: "auto" }}>
        <input
          aria-label={`${name} search`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
          {name} folder
        </button>
        {expanded ? <p>{name} contents</p> : null}
        <div style={{ height: 500 }} />
      </div>
    );
  }
  function Sidebar() {
    const [view, setView] = useState("chat");
    return (
      <>
        <button onClick={() => setView("chat")}>Show chat</button>
        <button onClick={() => setView("files")}>Show files</button>
        <SidebarViewPanel active={view === "chat"}>
          <Content name="chat" />
        </SidebarViewPanel>
        <SidebarViewPanel active={view === "files"}>
          <Content name="files" />
        </SidebarViewPanel>
      </>
    );
  }
  await using screen = await render(<Sidebar />);
  await userEvent.type(page.getByRole("textbox", { name: "chat search" }), "history");
  await userEvent.click(page.getByRole("button", { name: "Show files" }));
  await expect.element(page.getByRole("textbox", { name: "chat search" })).not.toBeInTheDocument();
  await userEvent.type(page.getByRole("textbox", { name: "files search" }), "src");
  await userEvent.click(page.getByRole("button", { name: "files folder" }));
  const scroller = screen.container.querySelector<HTMLElement>('[data-scroll="files"]')!;
  scroller.scrollTop = 80;
  await userEvent.click(page.getByRole("button", { name: "Show chat" }));
  await expect.element(page.getByRole("textbox", { name: "chat search" })).toHaveValue("history");
  await userEvent.click(page.getByRole("button", { name: "Show files" }));
  await expect.element(page.getByRole("textbox", { name: "files search" })).toHaveValue("src");
  await expect
    .element(page.getByRole("button", { name: "files folder" }))
    .toHaveAttribute("aria-expanded", "true");
  expect(scroller.scrollTop).toBe(80);
  expect(load.mock.calls).toEqual([["chat"], ["files"]]);
});

it("only shows error dialogs for the visible panel and keeps acknowledged errors dismissed", async () => {
  await using screen = await render(
    <SidebarViewPanel active={false}>
      <SidebarErrorDialog message="下载失败" />
    </SidebarViewPanel>,
  );
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  await screen.rerender(
    <SidebarViewPanel active>
      <SidebarErrorDialog message="下载失败" />
    </SidebarViewPanel>,
  );
  await expect.element(page.getByRole("dialog")).toBeVisible();
  await userEvent.click(page.getByRole("button", { name: "知道了" }));
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  await screen.rerender(
    <SidebarViewPanel active={false}>
      <SidebarErrorDialog message="下载失败" />
    </SidebarViewPanel>,
  );
  await screen.rerender(
    <SidebarViewPanel active>
      <SidebarErrorDialog message="下载失败" />
    </SidebarViewPanel>,
  );
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
});
