import { describe, expect, it } from "vite-plus/test";
import { resolveCloudSidebarTarget } from "./cloudSidebarState";

describe("cloud sidebar target retention", () => {
  const previous = { project: "previous" };
  const next = { project: "next" };
  it.each([
    ["unresolved", null, previous],
    ["cloud", { kind: "cloud", target: next }, next],
    ["non-cloud", { kind: "non-cloud" }, null],
  ] as const)("%s", (_name, update, expected) => {
    expect(resolveCloudSidebarTarget(previous, update)).toEqual(expected);
  });
  it("does not restore a cloud target after switching to a non-cloud target", () => {
    const cleared = resolveCloudSidebarTarget(previous, { kind: "non-cloud" });
    expect(resolveCloudSidebarTarget(cleared, null)).toBeNull();
  });
});
