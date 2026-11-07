import { describe, expect, it } from "vite-plus/test";
import { paginateProjectSessions } from "./projectSessionPage";

describe("project session pagination", () => {
  it.each([
    [3, 5, -1, 3, 0],
    [8, 5, -1, 5, 3],
    [20, 5, -1, 5, 15],
    [20, 15, -1, 15, 5],
    [20, 25, -1, 20, 0],
    [20, 5, 12, 6, 14],
  ])(
    "shows %s items with a limit of %s and active index %s",
    (count, limit, active, shown, remaining) => {
      const items = Array.from({ length: count }, (_, index) => index);
      const result = paginateProjectSessions(items, limit, (item) => item === active);
      expect(result.visible).toEqual(
        active >= limit && active < count
          ? [...items.slice(0, limit), active]
          : items.slice(0, limit),
      );
      expect(result.visible).toHaveLength(shown);
      expect(result.remaining).toBe(remaining);
    },
  );
});
