# kelaodeyun

独立的网页模型聊天站。本地预览：<http://127.0.0.1:4174/>。

包含 Anthropic 官网视觉参考的品牌首页、注册登录、服务端会话历史、模型选择、流式 Markdown 回复、停止生成、余额/用量、兑换码、管理员充值、支付宝/微信支付适配与管理后台。

当前交付是本地功能版。未接入真实模型、支付商户、域名或公网部署；这些按用户要求后置。默认没有虚构模型或可用余额。首次进入聊天页会要求创建管理员。

## 本地运行

需要 Node.js 24（使用内置 SQLite）。

```sh
npm ci
npm run dev
```

默认监听本机 127.0.0.1:4174。数据库保存在 `data/kelaodeyun.db`；本地自动生成的渠道加密密钥在 `data/encryption.key`，均已排除于 Git。请将这两者一起安全备份，丢失密钥后原渠道凭据无法解密。

首次初始化管理员 → 管理后台添加授权渠道 → 添加实际支持的模型 ID 与人民币费率 → 给测试用户充值 → 开始对话。模型协议目前支持 Anthropic Messages；其他协议尚未适配。

## 验证

```sh
npm test
npm run build
npm run test:sites
```

服务端测试覆盖权限、CSRF、会话隔离、余额预留和结算、失败退款、停止/并发、兑换幂等、订单金额校验，以及支付宝 RSA2 / 微信 RSA+AES-GCM 通知校验。没有发起真实模型请求或支付。

`node scripts/qa-server.mjs` 仅供 UI 验收：使用独立的 `data/qa.db` 和带明确说明的固定回复，监听4175。禁止将该脚本作为上线入口。测试产生的账户、余额和模型不属于4174站点。

## 部署入口

```sh
npm run build
npm start
```

生产启动必须设置 HTTPS `PUBLIC_ORIGIN`、`DATA_ENCRYPTION_KEY`、`SETUP_TOKEN`。先在本地 `.env` 填写 `.env.example` 中的配置。初始化口令只在首个管理员创建时使用。已有本地数据迁移时，加密密钥必须延用 `data/encryption.key` 的值。

`Dockerfile` 和 `docs/Caddyfile.example` 是部署准备文件，尚未执行构建或部署。容器需要持久化 `/app/data`。可将主机端口绑定在127.0.0.1后由 HTTPS 反向代理访问。不要把 `.env`、密钥或数据库放入静态目录。

保留的 Sites scaffold 只负责前端静态构建，不能运行 Node/SQLite API。请部署 `server.mjs`，不能仅上传 `dist/client` 就宣称完整服务可用。

详见：
- [视觉规范与逆向记录](docs/视觉规范与逆向记录.md)
- [基础服务与支付接入](docs/基础服务与支付接入.md)
- [验证记录](design-qa.md)

## 面向用户的演示环境

`node scripts/demo-server.mjs` 启动4176独立演示站，支持显式模拟支付宝/微信到账和固定聊天回复，所有页面显示演示标记。模拟数据使用 `data/demo.db`；原站4174不受影响。完整操作记录见 [用户流程演示](docs/用户流程演示.md)。禁止使用演示脚本作为生产启动入口。
