import { MessageId } from "@t3tools/contracts";
import type { TimelineEntry } from "../../session-logic";

export interface CloudClaudeMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt?: string | null;
}

export function cloudClaudeTimelineEntries(
  messages: readonly CloudClaudeMessage[],
): TimelineEntry[] {
  const seen = new Set<string>();
  const timestampOf = (message: CloudClaudeMessage) =>
    message.createdAt ? Date.parse(message.createdAt) : NaN;
  return messages.flatMap((message, index) => {
    const timestamp = timestampOf(message);
    // Some CLI snapshots repeat a timestamped message without its original metadata.
    if (
      !Number.isFinite(timestamp) &&
      messages.some(
        (other) =>
          other.role === message.role &&
          other.text === message.text &&
          Number.isFinite(timestampOf(other)),
      )
    )
      return [];
    if (seen.has(message.id)) return [];
    seen.add(message.id);
    const nearest =
      messages.slice(index + 1).find((other) => Number.isFinite(timestampOf(other))) ??
      messages
        .slice(0, index)
        .reverse()
        .find((other) => Number.isFinite(timestampOf(other)));
    const createdAt = Number.isFinite(timestamp)
      ? new Date(timestamp).toISOString()
      : (nearest?.createdAt ?? "");
    const id = MessageId.make(`claude-history:${message.id}`);
    return [
      {
        id,
        kind: "message" as const,
        createdAt,
        message: {
          id,
          role: message.role,
          text: message.text,
          runId: null,
          streaming: false,
          createdAt,
          updatedAt: createdAt,
        },
      },
    ];
  });
}

export function mergeCloudClaudeHistory(
  history: readonly TimelineEntry[],
  live: readonly TimelineEntry[],
): readonly TimelineEntry[] {
  if (history.length === 0) return live;
  const firstLive = live.find((entry) => entry.kind === "message");
  if (!firstLive || firstLive.kind !== "message") return [...history, ...live];
  // CLI transcripts also contain turns sent by this app; keep those authoritative live rows once.
  const firstLiveTime = Date.parse(firstLive.createdAt);
  const beforeLive = history.filter((entry) => Date.parse(entry.createdAt) < firstLiveTime);
  return [...beforeLive, ...live];
}
