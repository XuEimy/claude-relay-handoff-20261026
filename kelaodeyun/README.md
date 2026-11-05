# kelaodeyun 网站

React + Vite 前端由 Cloudflare Workers 静态资源提供，`/api/*` 由单例 SQLite Durable Object 处理。Google 登录、Stripe 订阅付款、Hostinger VPS 开通与清理分别使用 OAuth、Checkout/Webhook 和 Workflows。服务器订阅结束后立即发起清理；Hostinger 的机器保留在运营账户中直至其已付费周期结束。上线前必须验证模板能正确安装操作系统与 SSH 公钥，并审查政策文本。

## 本地开发

安装依赖：`npm install`。复制 `.dev.vars.example` 到 `.dev.vars`，填写测试值并将 `PUBLIC_ORIGIN` 设置为 `http://localhost:5173`。分别运行 `npx wrangler dev --assets public` 和 `npm run dev`，访问 Vite 显示的地址；Vite 将 `/api` 代理到 Worker 8787 端口，无需构建前端。要直接通过 Worker 预览完整静态站点，先运行 `npm run build`，再运行 `npx wrangler dev`。测试运行 `npm test`；禁止使用生产 Stripe 或 Hostinger 凭据做本地测试。

## 配置

- Google Cloud 创建 OAuth Web 客户端，授权回调 `https://kelaodeyun.com/api/auth/google/callback` 和本地 `http://localhost:5173/api/auth/google/callback`。
- 套餐来自 Hostinger VPS 目录，价格为常规续费价乘以 `PRICE_MULTIPLIER`（默认 1.5，必须为有限且不小于 1 的数）。Stripe 产品 `kld_*` 在结账时自动创建。已有订阅保持购买时的价格；Hostinger 调价只影响新订单，不会自动调整已有 Stripe 订阅。
- Stripe webhook URL 为 `https://kelaodeyun.com/api/stripe/webhook`，订阅 `checkout.session.completed`、`checkout.session.expired`、`checkout.session.async_payment_succeeded`、`checkout.session.async_payment_failed`、`customer.subscription.updated`、`customer.subscription.deleted`、`invoice.payment_failed`。Webhook 端点 API 版本应与固定的 Stripe SDK 一致，即 `2026-09-30.endive`。在 Stripe dashboard 启用 Billing Portal，仅允许到期取消订阅、更新付款方式和查看账单历史；禁用套餐切换和数量修改，因为更改价格不会调整虚拟机配置。
- Hostinger 创建 API token，配置 VPS 模板 ID；如有需要配置安装后脚本 ID。Hostinger 购买使用账户默认付款方式。购买结果不确定时禁止盲目重试，应先在 hPanel 确认是否已经购买。
- `HOSTINGER_MODE` 默认为 `simulate`：付款后模拟开通，不向 Hostinger 购买服务器，测试服务器使用保留的文档 IP。只有设为 `live` 且 Stripe 密钥不以 `sk_test_` 或 `rk_test_` 开头时才会真实购买；Stripe 测试密钥始终强制模拟。数据中心列表在两种模式下均从 Hostinger 读取。模拟模式的清理不会调用 Hostinger，包括既有真实服务器；切换模式前须先处理真实服务器的清理与续费。
- `wrangler.jsonc` 的 vars：`PUBLIC_ORIGIN`、逗号分隔的 `ADMIN_EMAILS`、`HOSTINGER_MODE`、`PRICE_MULTIPLIER`、`HOSTINGER_TEMPLATE_ID`、可选 `HOSTINGER_POST_INSTALL_SCRIPT_ID`、`SUPPORT_EMAIL`、`PUBLIC_OPERATOR`。
- `ADMIN_EMAILS` 的变更在用户下次登录时生效；会话有效期为 7 天。
- 分别运行 `npx wrangler secret put GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`、`HOSTINGER_API_TOKEN`。不将真实值写入版本库。

## 上线

完成以上配置、校验 OAuth 与支付及 Hostinger 实际流程后运行 `npm run deploy`。本任务不执行部署。
