import { createContext, use, type ReactNode } from "react";

const SidebarViewActive = createContext(true);
export function useSidebarViewActive() {
  return use(SidebarViewActive);
}

export function SidebarViewPanel({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <SidebarViewActive value={active}>
      <div hidden={!active} className={active ? "flex min-h-0 min-w-0 flex-1 flex-col" : "hidden"}>
        {children}
      </div>
    </SidebarViewActive>
  );
}
