# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## 用户已确认的产品方向（2026-10-26）

- 品牌为 kelaodeyun，官网参考 Anthropic 的视觉规范，聊天页按 Claude 当前实际页面逐项复刻；不冒充官方。
- 提供网页聊天，用户直接在站内使用模型；需要账户、会话、余额用量、管理后台等基础服务。
- 面向中国大陆用户，人民币、北京时间、中文界面；充值同时需要兑换码、管理员充值、支付宝和微信在线支付。
- 域名、服务器、上游和商户凭据后置；不虚构真实接入，不默认部署。
- 只连接日常已打开的浏览器；验收使用隔离数据，不能把测试模型和余额混入默认站点。

## 聊天页纠正（2026-10-26）

- 用户明确要求“抄，一模一样的”，不接受自行重新设计的聊天页。以真实 Claude `/new` 和对话状态的截图、DOM 尺寸、原始字体/图标为准。
- 新对话和已有对话是两种输入框布局；后者为底部单行输入框，模型选择在下方。不得恢复大卡片消息、角色标签、顶端演示横幅或自创欢迎文案。
- 使用 `src/ClaudeChat.jsx` 与作用域 CSS；保留站点品牌、真实用户/模型/历史数据及必要的演示披露，不冒充官方。充值和管理员入口位于左下角账户菜单。
- 原实现保存在 `backups/chat-before-claude-fidelity-20261026/`；当前源站证据在 `evidence/claude-fidelity/`。禁止将源站账户的私人历史文本复制进演示数据。

## 官网首页定位（2026-10-26）

- 用户进一步指定官网主页为“中转站”。保留 Anthropic 官网的视觉风格，首页明确使用 kelaodeyun AI 模型中转站定位。
- 首页优先展示聊天入口、模型与费率、充值方式、使用步骤和常见问题。模型/价格/支付开放状态必须读取真实配置；不虚构已接入的模型品牌、稳定率、客户数量或接口能力。
- 当前服务范围是此前用户选择的网页聊天；开发者 API Key / 公共 API 调用入口未实现，不可宣传已开放。域名、生产部署、上游凭据和支付商户仍由用户后续配置。

## Hero 与页脚（2026-10-26）

- 用户指定 Hero 使用 React Bits 重做，核心表达为“云上克劳德”。当前采用官方 Light Rays JavaScript/CSS 组件，源码与许可证保存在 `src/components/react-bits/`，通过 props 调色和控制动画。
- 首页底部按用户提供的 Anthropic 截图：近黑色全宽背景，左侧品牌/版权，中间九组可展开导航，右侧服务说明和登录入口。使用本站真实链接，手机改为纵向布局。

## 卡片式内容与演示数据（2026-10-26）

- 用户否定模型价格表、大块充值介绍和长步骤列表，指定参考图三的圆角浅色卡片交互。第一排显示模型，第二排突出稳定和安全。
- 用户明确允许演示使用真实名称的 mock 数据，并要求不要堆叠“待接入”等小提示。隔离 demo.db 现使用 Claude Haiku / Sonnet / Opus 5.5 三个演示配置；名称与费率仅为本地展示及模拟结算数据，未接入实际模型。默认站点数据不变。
- 首排卡片支持费率展开、用量查询、带模型跳转；次排保障卡支持说明展开。稳定/安全文案围绕当前已有能力，不宣称已验证 100% 可用性或不存在安全风险。

## 图片与极简文案（2026-10-26）

- 用户要求生成有气质的卡片图片，采用五张统一的纸张/档案/几何拼贴：Haiku 飞鸟、Sonnet 海浪、Opus 螺旋、稳定桥梁、安全拱廊。原图在 `assets/generated/card-art/`，网页优化图在 `public/images/cards/`。
- 用户明确要求奥卡姆剃刀式精简：首页删除“可使用的模型”“每次对话，都值得安心”、Hero 的品牌小字/副标题/说明/英文装饰/演示重复提示、卡片分类标签、重复用量链接和末尾 CTA。
- 保留模型名称、简短区分说明、费率与聊天操作；稳定/安全说明折叠。FAQ、使用与充值说明折叠，保持链接和无障碍标签。首页演示横幅不再占据布局，账户及支付流程仍保留真实状态说明。

## 调研后 Hero 方向（2026-10-26）

- 用户要求继续设计前先学习 10 个中转站。已采集十个有效主要样本及补充/受限样本，见 `docs/十个中转站调研-20261026.md` 和 `evidence/relay-study-20261026/`。
- Hero 需要明确服务品类与中转关系，不能仅有“云上克劳德”品牌。采用接近整屏的左右布局：品牌和“Claude 中转服务”大字定位 + 可选模型的网关示意。
- 网关图表达“你的问题 → 云上克劳德 → Claude”，模型切换同步实际费率和聊天链接。只呈现已有网页聊天能力，不把未实现的公共 API Key 入口画成可用产品功能。

## 数字地球 Hero 与视觉统一（2026-10-26）

- 用户选择 AIHubMix 截图的布局：品牌靠左、导航靠右、居中标题与双按钮，下方三张等宽功能卡；替代此前左右分栏网关 Hero。
- 用户进一步指定数字化地球。找到 React Bits Pro Globe 作为参考；当前采用 MIT 开源 COBE 2.0.1，实现点阵地球、缓慢旋转与跨洲连线，并非复制付费组件源码。地理连线仅为概念视觉，不表示实际服务器部署。
- 用户要求风格颜色对齐之前：暖白纸色、炭黑主按钮、陶土色节点/连线/选中态、衬线大标题和浅米色圆角卡片。保持新布局，禁止恢复冷蓝科技配色。
- Hero 功能卡沿用本站已有账户、模型切换、人民币费率和用量功能，不虚构公共 API Key 能力；下方五张图片卡片与暗色页脚保留。

## 波点地球替换（2026-10-26，取代上述 COBE 方案）

- 用户认为实体地球不好看且有 bug，明确要求从 React Bits 找波点改造成地球。当前采用官方 Dot Grid 衍生的 DotGlobe，保留波点渲染与弹性响应，加入球面地图映射和缓慢旋转；COBE 已移除。
- 用户明确纠正“范围巨大”的意思是要求疯狂扩大，而非缩小。波点地球应铺满并溢出 Hero：桌面容器至少 1800px / 150vw，手机至少 1000px / 250vw，边界由 Hero 裁切。保持暖色、居中标题与三卡片布局。

## Hero 密度、居中与卡片动效（2026-10-26）

- 用户要求超大背景仍清楚可见：波点间距 12→4.7，直径 3.4→3.8，提高海洋弱点与整体对比度。保持超大地球；点阵数量设上限，后台页面暂停绘制，稳态跳过弹性计算。
- 标题、说明、双按钮、三项信息作为一个整体始终水平/垂直居中；三张功能卡也属于 Hero。桌面 Hero 采用纵向 flex，上部主信息居中、底部三卡齐排，正常桌面视窗完整容纳；手机卡片改为纵排。
- 三卡重设计：标题配陶土色图标、统一底部操作分隔线、分段模型选择、衬线价格。悬浮轻抬、箭头轻移、连线缓动、模型与费率变更淡入；尊重减少动态偏好，并随 Hero 暂停按钮暂停。
