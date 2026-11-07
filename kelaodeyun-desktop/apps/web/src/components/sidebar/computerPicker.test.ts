import { describe, expect, it } from "vite-plus/test";
import { projectInComputerScope } from "./computerPicker";

describe("projectInComputerScope", () => {
  it("separates server projects from the selected computer's subtree", () => {
    const selected = {
      slug: "box",
      dir: "/home/a/computers/box",
      label: "Box",
      host: "box",
      username: "root",
    };
    expect(projectInComputerScope("/home/a/project", { computersRoot: null, selected: null })).toBe(
      true,
    );
    expect(
      projectInComputerScope("/home/a/computers/box/app", {
        computersRoot: "/home/a/computers",
        selected: null,
      }),
    ).toBe(false);
    expect(
      projectInComputerScope("/home/a/computers-other", {
        computersRoot: "/home/a/computers/",
        selected: null,
      }),
    ).toBe(true);
    expect(
      projectInComputerScope(selected.dir, { computersRoot: "/home/a/computers", selected }),
    ).toBe(true);
    expect(
      projectInComputerScope(`${selected.dir}/project`, {
        computersRoot: "/home/a/computers",
        selected,
      }),
    ).toBe(true);
    expect(
      projectInComputerScope(`${selected.dir}2/project`, {
        computersRoot: "/home/a/computers",
        selected,
      }),
    ).toBe(false);
  });
});
