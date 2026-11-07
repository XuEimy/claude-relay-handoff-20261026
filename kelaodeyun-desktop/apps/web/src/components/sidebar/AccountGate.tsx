import { useState, type ReactNode } from "react";
import { useDesktopAccountStatus } from "../../hooks/useDesktopAccount";
import { APP_BASE_NAME } from "../../branding";
import appIcon from "../../../../../assets/agent-cloud-os/app-icon-source.png";
import { Button } from "../ui/button";
import "./accountOnboarding.css";

export function AccountGate({ children }: { children: ReactNode }) {
  const account = useDesktopAccountStatus();
  const bridge = window.desktopBridge;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!bridge) return children;
  if (!account) return <main className="h-dvh bg-background" />;
  if (account.status === "signed-in") return children;
  return (
    <main
      data-account-onboarding
      data-account-login
      className="relative flex h-dvh items-center justify-center bg-background px-6 text-foreground"
    >
      <div className="absolute inset-x-0 top-0 h-12 drag-region" />
      <section className="relative flex max-w-md flex-col items-center gap-5 text-center">
        <img src={appIcon} className="mb-3 size-28" alt="" />
        <h1 className="font-serif text-3xl">登录 {APP_BASE_NAME}</h1>
        <p className="text-sm text-muted-foreground">登录后，你的服务器会跟随账户同步。</p>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {pending ? (
          <>
            <p className="text-sm text-muted-foreground">已在浏览器中打开，完成登录后自动返回…</p>
            <Button
              variant="ghost"
              onClick={() =>
                void bridge
                  .signOutAccount()
                  .catch((cause: unknown) =>
                    setError(cause instanceof Error ? cause.message : "取消登录失败"),
                  )
              }
            >
              取消
            </Button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="h-10 rounded-full bg-foreground px-6 text-sm font-medium text-background transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-foreground motion-reduce:transition-none"
              onClick={() => {
                setError(null);
                setPending(true);
                void bridge
                  .signInAccount()
                  .catch((cause: unknown) =>
                    setError(cause instanceof Error ? cause.message : "登录失败"),
                  )
                  .finally(() => setPending(false));
              }}
            >
              使用浏览器登录
            </button>
            <p className="text-xs text-muted-foreground">将在浏览器中完成登录</p>
          </>
        )}
      </section>
    </main>
  );
}
