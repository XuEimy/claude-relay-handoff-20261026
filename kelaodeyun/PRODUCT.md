# Product

<!-- impeccable:product-schema 1 -->

## Platform
web

## Product Purpose
kelaodeyun 官网介绍桌面 App，并提供网站账户、余额充值与账单服务。用户明确要求保留首页各内容栏目，以当前视觉完善用户可访问的子页面。

## Capabilities and Constraints
- 本次付款业务经用户确认：现有账户余额充值、付款和账单流程，不是 App 授权或订阅购买。
- 已有邮箱密码登录、注册、兑换码、支付宝和微信支付适配、订单与用量查询、修改密码功能。
- 渠道是否可用由服务端配置决定；目前默认环境未开通真实支付。
- App 安装包和下载地址尚未提供，下载页显示准备中。
- 桌面 App 以 macOS 为优先平台，连接用户自有 Linux x86_64 SSH 环境及远端 Claude CLI。
- 网站账户余额与桌面端的计费关联尚未确认，不宣传已打通。
- 不删除首页栏目，不恢复网页聊天入口，不虚构费率、支付成功、安装包或商业条款。

## Brand Commitments
继承用户已确定的暖白纸色、深炭色、陶土色、中文衬线标题、克制的线条与留白。登录入口位于顶部最右侧。

## Evidence on Hand
src/App.jsx、src/styles.css、src/gateway-hero.css、lib/api.mjs、lib/payments.mjs 和上级开发交接.md。
