import type { EnvironmentId } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { resolveStorage } from "../../lib/storage";
import { defaultComputerScope, type ComputerScope } from "./computerPicker";

export const useComputerScopeStore = create<{
  byEnvironmentId: Record<string, ComputerScope>;
  update: (environmentId: EnvironmentId, change: Partial<ComputerScope>) => void;
  addProjectEnvironmentId: EnvironmentId | null;
  requestAddProject: (environmentId: EnvironmentId | null) => void;
}>()(
  persist(
    (set) => ({
      byEnvironmentId: {},
      addProjectEnvironmentId: null,
      requestAddProject: (environmentId) => set({ addProjectEnvironmentId: environmentId }),
      update: (environmentId, change) =>
        set((state) => ({
          byEnvironmentId: {
            ...state.byEnvironmentId,
            [environmentId]: {
              ...(state.byEnvironmentId[environmentId] ?? defaultComputerScope),
              ...change,
            },
          },
        })),
    }),
    {
      name: "kelaodeyun-computer-scopes",
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ byEnvironmentId: state.byEnvironmentId }),
    },
  ),
);
