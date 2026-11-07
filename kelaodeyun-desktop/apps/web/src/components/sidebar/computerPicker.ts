export interface ComputerSelection {
  slug: string;
  dir: string;
  label: string;
  host: string;
  username: string;
  os?: string;
}

export interface ComputerScope {
  computersRoot: string | null;
  selected: ComputerSelection | null;
  projectPaths?: Record<string, string>;
  onboarded?: boolean;
}

export const defaultComputerScope: ComputerScope = { computersRoot: null, selected: null };

export function pathInside(path: string, root: string): boolean {
  const normalized = root.replace(/\/+$/u, "") || "/";
  return path === normalized || path.startsWith(normalized === "/" ? "/" : `${normalized}/`);
}

export function projectInComputerScope(workspaceRoot: string, state: ComputerScope): boolean {
  return state.selected
    ? pathInside(workspaceRoot, state.selected.dir)
    : state.computersRoot === null || !pathInside(workspaceRoot, state.computersRoot);
}
