import { useState } from "react";
import { useAccountHosts } from "../../hooks/useDesktopAccount";
import { Button } from "../ui/button";
import { SettingsSection } from "./settingsLayout";

export function AccountServersSettings() {
  const { account, hosts, error, refresh } = useAccountHosts(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  if (!window.desktopBridge || account.status !== "signed-in") return null;
  return (
    <SettingsSection id="account-servers" title="账户服务器">
      {error || removeError ? (
        <p className="text-sm text-destructive">{error || removeError}</p>
      ) : null}
      {hosts.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无账户服务器</p>
      ) : (
        hosts.map((host) => (
          <div key={host.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm">
                {host.label} {host.source === "purchased" ? "· 已购买" : ""}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {host.username}@{host.hostname}:{host.port}
              </div>
            </div>
            {host.source === "account" ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy !== null}
                onClick={() => {
                  setBusy(host.id);
                  setRemoveError(null);
                  void window
                    .desktopBridge!.deleteAccountHost(host.id)
                    .then(refresh)
                    .catch((cause) =>
                      setRemoveError(cause instanceof Error ? cause.message : "移除失败"),
                    )
                    .finally(() => setBusy(null));
                }}
              >
                {busy === host.id ? "移除中…" : "从账户移除"}
              </Button>
            ) : null}
          </div>
        ))
      )}
    </SettingsSection>
  );
}
