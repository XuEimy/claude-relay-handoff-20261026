import React, { useEffect } from "react";
import { PageShell, PageTitle, Message } from "./SitePages.jsx";
import { safeReturn } from "./VpsShared.jsx";
import "./vps-pages.css";

export { Billing } from "./VpsBilling.jsx";
export { Account } from "./VpsAccount.jsx";
export { Admin } from "./VpsAdmin.jsx";

const loginErrors = {
  state: "登录已过期，请重新尝试",
  identity: "无法验证该 Google 账户的邮箱",
  disabled: "账户已停用，请联系支持",
  configuration: "登录暂不可用，请稍后再试",
};

export function Login({ config }) {
  const params = new URLSearchParams(location.search);
  const next = safeReturn(params.get("return")), error = params.get("error");
  useEffect(() => { if (config.user) location.replace(next); }, [config.user, next]);
  if (config.user) return null;
  return <PageShell config={config}>
    <div className="vps-login-wrap">
      <section className="vps-login-card">
        <span className="brand-cloud vps-login-mark" aria-hidden="true" />
        <PageTitle title="登录 kelaodeyun" description="使用 Google 账户继续，登录后即可购买和管理云服务器。" />
        {error && <Message kind="error">{loginErrors[error] || "登录未完成，请重试"}</Message>}
        <a className="vps-google-button" href={"/api/auth/google/start?return=" + encodeURIComponent(next)}>
          <svg aria-hidden="true" viewBox="0 0 48 48" width="20" height="20"><path fill="#4285f4" d="M43.6 24.5c0-1.4-.1-2.7-.4-4H24v7.6h11a9.4 9.4 0 0 1-4.1 6.2v5h6.6c3.9-3.6 6.1-8.8 6.1-14.8z"/><path fill="#34a853" d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.6-5a12.3 12.3 0 0 1-18.3-6.5H5.8v5.1A20.4 20.4 0 0 0 24 44z"/><path fill="#fbbc05" d="M12.6 27.7a12.2 12.2 0 0 1 0-7.5v-5.1H5.8a20 20 0 0 0 0 17.7z"/><path fill="#ea4335" d="M24 12c3 0 5.6 1 7.7 3l5.9-5.9A19.8 19.8 0 0 0 5.8 15l6.8 5.1A12.1 12.1 0 0 1 24 12z"/></svg>
          使用 Google 继续
        </a>
        <p className="vps-login-terms">继续即表示你同意<a href="/terms">《服务说明》</a>和<a href="/privacy">《隐私说明》</a></p>
      </section>
    </div>
  </PageShell>;
}
