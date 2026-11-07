import type { DesktopAccountHost, DesktopAccountState } from "@t3tools/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

const SIGNED_OUT: DesktopAccountState = { status: "signed-out" };

export function useDesktopAccount() {
  return useDesktopAccountStatus() ?? SIGNED_OUT;
}

export function useDesktopAccountStatus() {
  const [state, setState] = useState<DesktopAccountState | null>(null);
  const bridge = window.desktopBridge;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- listens to account changes from the desktop main process
  useEffect(() => {
    if (!bridge?.onAccountState || !bridge.getAccountState) return;
    let alive = true,
      changed = false;
    const unsubscribe = bridge.onAccountState((next) => {
      changed = true;
      if (alive) setState(next);
    });
    void bridge
      .getAccountState()
      .then((next) => {
        if (alive && !changed) setState(next);
      })
      .catch(() => {
        if (alive && !changed) setState({ status: "signed-out" });
      });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [bridge]);
  return state;
}

export function useAccountHosts(active: boolean) {
  const bridge = window.desktopBridge;
  const account = useDesktopAccount();
  const [hosts, setHosts] = useState<readonly DesktopAccountHost[]>([]);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++requestId.current;
    if (!bridge || account.status !== "signed-in" || !active) {
      setHosts([]);
      setError(null);
      return;
    }
    try {
      const next = await bridge.listAccountHosts();
      if (current === requestId.current) {
        setHosts(next);
        setError(null);
      }
    } catch (cause) {
      if (current === requestId.current)
        setError(cause instanceof Error ? cause.message : "无法加载账户服务器");
    }
  }, [bridge, account, active]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- refreshes account hosts when the dialog or account changes
  useEffect(() => {
    void refresh();
    return () => {
      requestId.current++;
    };
  }, [refresh]);
  return { account, hosts, error, refresh };
}
