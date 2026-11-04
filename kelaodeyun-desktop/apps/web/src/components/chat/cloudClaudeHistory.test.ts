import { describe, expect, it } from "vite-plus/test";
import { cloudClaudeTimelineEntries, mergeCloudClaudeHistory } from "./cloudClaudeHistory";

describe("native Claude timeline integration", () => {
  it("uses ordinary user and assistant entries with stable IDs and real timestamps", () => {
    const messages = [
      { id: "user", role: "user" as const, text: "继续", createdAt: "2026-11-01T00:00:00Z" },
      {
        id: "assistant",
        role: "assistant" as const,
        text: "**好的**",
        createdAt: "2026-11-01T00:00:01Z",
      },
    ];
    const entries = cloudClaudeTimelineEntries([...messages, messages[0]!]);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      kind: "message",
      id: "claude-history:user",
      createdAt: "2026-11-01T00:00:00.000Z",
      message: { role: "user", streaming: false },
    });
    expect(entries[1]).toMatchObject({ message: { role: "assistant", text: "**好的**" } });
  });
  it("drops undated CLI snapshot duplicates without removing repeated dated turns", () => {
    const entries = cloudClaudeTimelineEntries([
      { id: "snapshot", role: "user", text: "继续" },
      { id: "original", role: "user", text: "继续", createdAt: "2026-11-01T00:00:00Z" },
      { id: "repeat", role: "user", text: "继续", createdAt: "2026-11-01T00:01:00Z" },
    ]);
    expect(entries.map((entry) => entry.id)).toEqual([
      "claude-history:original",
      "claude-history:repeat",
    ]);
  });
  it("keeps older repeated prompts but uses authoritative app rows for subsequent turns", () => {
    const history = cloudClaudeTimelineEntries([
      { id: "old", role: "user", text: "继续", createdAt: "2026-11-01T00:00:00Z" },
      { id: "new", role: "user", text: "继续", createdAt: "2026-11-01T00:00:31Z" },
      { id: "reply", role: "assistant", text: "好的", createdAt: "2026-11-01T00:00:32Z" },
    ]);
    const live = cloudClaudeTimelineEntries([
      { id: "app", role: "user", text: "继续", createdAt: "2026-11-01T00:00:30Z" },
    ]);
    expect(mergeCloudClaudeHistory(history, live).map((entry) => entry.id)).toEqual([
      "claude-history:old",
      "claude-history:app",
    ]);
    expect(mergeCloudClaudeHistory(history, [])).toEqual(history);
    expect(mergeCloudClaudeHistory([], live)).toBe(live);
  });
});
