# kelaodeyun 网站

React + Vite 前端由 Cloudflare Workers 静态资源提供，`/api/*` 由单例 SQLite Durable Object 处理。Google 登录、Stripe 订阅付款、Contabo VPS 开通与清理分别使用 OAuth、Checkout/Webhook 和 Workflows。服务器订阅结束后立即发起清理；Contabo 取消在合同结束时生效，期间仍继续计费。上线前必须验证镜像能正确安装操作系统并启用 root 密码登录，并审查政策文本。

## 本地开发

安装依赖：`npm install`。复制 `.dev.vars.example` 到 `.dev.vars`，填写测试值并将 `PUBLIC_ORIGIN` 设置为 `http://localhost:5173`。分别运行 `npx wrangler dev --assets public` 和 `npm run dev`，访问 Vite 显示的地址；Vite 将 `/api` 代理到 Worker 8787 端口，无需构建前端。要直接通过 Worker 预览完整静态站点，先运行 `npm run build`，再运行 `npx wrangler dev`。测试运行 `npm test`；禁止使用生产 Stripe 或 Contabo 凭据做本地测试。

## App 账户接口

Worker 提供 `GET /api/app/authorize`、`POST /api/app/token`（PKCE 一次性授权码），以及 `/api/app/me`、`/api/app/hosts`、`/api/app/hosts/:id/secret`、`/api/app/logout`；账户主机可通过 POST/DELETE 管理，凭据读取仅限 App Bearer 会话。`POST /api/account/app-sessions/revoke` 撤销所有 App 会话。正式与开发回调分别使用 `kelaodeyun://app/account/callback` 和 `kelaodeyun-dev://app/account/callback`。桌面端通过 `KELAODEYUN_ACCOUNT_ORIGIN` 指定账户站点，默认 `https://kelaodeyun.com`。

## 配置

- Google Cloud 创建 OAuth Web 客户端，授权回调 `https://kelaodeyun.com/api/auth/google/callback` 和本地 `http://localhost:5173/api/auth/google/callback`。
- 购买页两步：先选套餐（显示起价），下一页顶部显示首期总价及续费价。地区卡片仅显示所选周期的附加费；选择后更新顶部明细，总价已包含附加费，底部付款。
- 基础月价和地区费从 Contabo `/v1/products` 读取；按返回的 `priceItem.key` 查询官网 `/en-us/catalog/product?preview=false&productId=...`，取 `periods[].discount.USD`（整个首期的折扣额）及 `periods[].setup.USD`（真正的开通费，省略表示无开通费）。两个接口未公开文档，可能变更；基础美元价必须匹配，缺少周期或美元折扣数据时停止报价，不回退到猜测价格。缓存一小时。
- 金额先转换为美分；续费价为 `ceil((月价 + 每月地区费) × 月数 × PRICE_MULTIPLIER)`，首期服务费为 `ceil(((月价 + 每月地区费) × 月数 − 首期折扣) × PRICE_MULTIPLIER)`，首期总额再加 `ceil(开通费 × PRICE_MULTIPLIER)`。折扣仅用于基础套餐首期，地区费保持全额。`PRICE_MULTIPLIER` 默认 1.5。Stripe 使用续费价和只适用第一张账单、限定套餐产品的固定金额优惠券，开通费为独立一次性行项目。已有订阅保持购买时价格。
- 2026-11-06 核验：官网 `ProductPricing.VpUp57TR.js` 从月价减去 `period.discount / period.length`，将 `period.setup` 另行加收。Cloud VPS 6 美元月价为 9，12/24 月折扣分别为 16.20/43.20，无开通费；`/v1/products` 错将这两个折扣值放进 `setupFees`。官网优惠文案为 “for the first {selectedTerm} months”，因此不能将优惠当作永久续费价。这是目录报价核验，尚非真实 API 购买的扣款验收。
- Stripe webhook URL 为 `https://kelaodeyun.com/api/stripe/webhook`；事件和固定 API 版本 `2026-09-30.endive` 由 `scripts/configure-stripe.mjs` 管理，包含 `invoice.paid`、失败和需验证事件。Checkout 使用银行卡订阅自动扣款。Portal 仅支持付款方式与账单；关闭自动续费通过本站的所有者接口，先持久化取消意图，再通知 Stripe 和 Contabo，避免遗漏供应商取消。
- 当前已接入 WNT 的 Stripe 测试环境，仍为模拟服务器。测试授权密钥于 2027-02-04 到期，正式收费前必须改用持久正式密钥。隔离联调已验证真实 Stripe 测试时钟跨年扣款、签名回调及到期清理，年付首期 $137.70、次年 $162.00，临时测试客户、订阅与时钟已删除。API `2026-09-30.endive` 使用 `allowed_payment_method_types`，不再接受 `payment_method_types`。
- 用独立测试账号/沙箱验证付款与续费。把该账号的持久 Secret Key 写入 `.dev.vars` 的 `STRIPE_SECRET_KEY`，运行 `node scripts/configure-stripe.mjs` 先读取账号与现有配置。确认目标后运行 `node scripts/configure-stripe.mjs --apply --upload`，创建或更新本站专用 Webhook/Portal，回读并将三项 Stripe 设置上传到 Worker。脚本不修改其他项目的 Portal、不删除 Webhook、不打印密钥；已有端点的签名密钥缺失时须从 Stripe 填入。CLI 临时登录密钥会过期，不作为生产凭据。
- 续费到账以当前 Stripe 订阅的已付发票服务区间为准，保存 `paid_through`；`current_period_end` 或 `active` 本身不是到账证据。每五分钟最多核对 50 条订阅，重试取消与补齐丢失回调。付款失败且已付款期限结束时取消 Stripe 订阅并清理服务器，不额外提供欠费宽限期；无法确定已付款期限时提示管理员，不猜测删除时间。
- Contabo 的公开实例 API 未提供撤销取消接口，因此取消意图保持不变，Stripe 端恢复续费会被重新关闭；如需恢复，必须由运营方核对供应商状态。供应商取消先查询、再请求、再回读；错误显示在后台并定时重试。终止后到达的新付款不会重新开通，后台提示核对退款。此流程仍需实测 Contabo 的合同截止与取消生效时间，不能保证供应商不会因已经进入新账期而额外计费。
- Contabo 使用 OAuth 密码授权，需配置 API 客户端 ID、客户端密钥、API 用户名和密码，以及 VPS 镜像 UUID。购买结果不确定时禁止盲目重试，应先在 Contabo 控制台确认是否已经购买。
- 开通时系统生成 root 密码并用 `CREDENTIALS_KEY` 加密保存，服务器就绪后仅账户本人可查看和复制。使用 `openssl rand -base64 32` 生成密钥，通过 `wrangler secret put CREDENTIALS_KEY` 配置并妥善保管；更换密钥会使已保存的密码无法读取。
- `CONTABO_MODE` 默认为 `simulate`：仅接受 Stripe 测试付款，测试服务器使用保留的文档 IP。模拟模式搭配正式 Stripe 密钥时 Checkout 返回 503，避免收真钱却交付模拟服务器。只有设为 `live` 且使用 Stripe 正式密钥时才会真实购买；Stripe 测试密钥始终强制模拟。模拟模式的清理不会调用 Contabo，包括既有真实服务器；切换模式前须先处理真实服务器的清理与续费。
- 迁移前已有的旧服务商服务器需人工清理、取消续费；系统不会将旧服务商的实例 ID 当作 Contabo ID 操作。
- `wrangler.jsonc` 的 vars：`PUBLIC_ORIGIN`、逗号分隔的 `ADMIN_EMAILS`、`CONTABO_MODE`、`PRICE_MULTIPLIER`、`CONTABO_IMAGE_ID`、`SUPPORT_EMAIL`、`PUBLIC_OPERATOR`。
- `ADMIN_EMAILS` 的变更在用户下次登录时生效；会话有效期为 7 天。
- 分别运行 `npx wrangler secret put GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`、`CONTABO_CLIENT_ID`、`CONTABO_CLIENT_SECRET`、`CONTABO_API_USER`、`CONTABO_API_PASSWORD`、`CREDENTIALS_KEY`。不将真实值写入版本库。

## 上线

完成配置、校验 OAuth 与支付后运行 `npm run deploy`。启用 Contabo `live` 前仍须核对真实订单成本、root 登录、重装数据清除和取消生效时间。
