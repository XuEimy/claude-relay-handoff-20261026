import { useSyncExternalStore } from "react";

let profile = { name: "用户", bio: "专注每一次创造。" };
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function useMockProfile() {
  return useSyncExternalStore(
    subscribe,
    () => profile,
    () => profile,
  );
}
export function updateMockProfile(next: typeof profile) {
  profile = { name: next.name.trim() || "用户", bio: next.bio.trim() };
  listeners.forEach((listener) => listener());
}
