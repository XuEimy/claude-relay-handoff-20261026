export const PROJECT_SESSION_INITIAL = 5;
export const PROJECT_SESSION_PAGE = 10;

export function paginateProjectSessions<T>(
  items: readonly T[],
  visibleCount: number,
  isActive: (item: T) => boolean,
): { visible: T[]; remaining: number } {
  const visible = items.slice(0, visibleCount);
  const active = items.slice(visibleCount).find(isActive);
  if (active !== undefined) visible.push(active);
  return { visible, remaining: items.length - visible.length };
}
