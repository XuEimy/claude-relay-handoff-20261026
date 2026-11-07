import type { EnvironmentId } from "@t3tools/contracts";
import { create } from "zustand";

export interface CloudSidebarState {
  pinnedOpen: boolean;
  projectsOpen: boolean;
  recentOpen: boolean;
  expanded: Record<string, boolean>;
  visibleCounts: Record<string, number>;
}

export const defaultCloudSidebarState: CloudSidebarState = {
  pinnedOpen: true,
  projectsOpen: true,
  recentOpen: true,
  expanded: {},
  visibleCounts: {},
};

export const useCloudSidebarState = create<{
  byEnvironmentId: Record<string, CloudSidebarState>;
  update: (
    environmentId: EnvironmentId,
    update: (state: CloudSidebarState) => CloudSidebarState,
  ) => void;
}>((set) => ({
  byEnvironmentId: {},
  update: (environmentId, update) =>
    set((state) => ({
      byEnvironmentId: {
        ...state.byEnvironmentId,
        [environmentId]: update(state.byEnvironmentId[environmentId] ?? defaultCloudSidebarState),
      },
    })),
}));

export function resolveCloudSidebarTarget<T>(
  previous: T | null,
  next: { kind: "cloud"; target: T } | { kind: "non-cloud" } | null,
): T | null {
  return next === null ? previous : next.kind === "cloud" ? next.target : null;
}
