export interface ComputerSelection {
  slug: string;
  dir: string;
  label: string;
  host: string;
  username: string;
}

export interface ComputerScope {
  computersRoot: string | null;
  selected: ComputerSelection | null;
}

export const defaultComputerScope: ComputerScope = { computersRoot: null, selected: null };

export function projectInComputerScope(workspaceRoot: string, state: ComputerScope): boolean {
  const inside = (path: string, root: string) => {
    const normalized = root.replace(/\/+$/u, "") || "/";
    return path === normalized || path.startsWith(normalized === "/" ? "/" : `${normalized}/`);
  };
  return state.selected
    ? inside(workspaceRoot, state.selected.dir)
    : state.computersRoot === null || !inside(workspaceRoot, state.computersRoot);
}
