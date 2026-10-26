# 2026-10-26：Claude 聊天复刻与中转站官网

## 用户要求与实现边界

用户要求聊天页按 Claude 当前实页复刻，而非重新设计；随后明确官网主页应为模型中转站。官网沿用原 Anthropic 参考风格，改为 kelaodeyun 独立中转站定位。此前首页及聊天版本保留在 `backups/chat-before-claude-fidelity-20261026/`。

聊天保留站内品牌、真实用户、历史记录、模型配置及演示披露。没有把 Claude 源站账户的历史内容复制进本地数据。功能范围仍是网页聊天；开发者 API Key 和公共 API 接口没有实现，首页 FAQ 已注明。

## 视觉来源与截图

通过用户已打开的日常 Chrome 扩展复用原配置；未启动额外浏览器进程、无头浏览器或临时配置。新建采集标签页仍属于同一日常配置。临时视口覆盖已复位。

- 源站：`https://claude.ai/new` 及账户中已有对话；读取界面，不发送新的真实 Claude 消息。
- 桌面基准：1363 × 842 CSS px，截图 1x；另有最初 1363 × 786 原站图。
- 手机基准：390 × 844 CSS px，截图 1x。
- `evidence/claude-fidelity/source-desktop-new-matched.jpg`：桌面新对话。
- `evidence/claude-fidelity/source-conversation.jpg`：桌面对话基准。
- `evidence/claude-fidelity/source-mobile-new-stable.jpg`：手机新对话。
- `evidence/claude-fidelity/local-desktop-new-final.jpg`：本地新对话。
- `evidence/claude-fidelity/local-desktop-conversation.jpg`：本地实际演示回复。
- `evidence/claude-fidelity/local-mobile-new.jpg`、`local-mobile-conversation.jpg`：手机状态。
- `evidence/claude-fidelity/home-desktop.jpg`、`home-desktop-pricing.jpg`、`home-mobile.jpg`：中转站官网。

源站与本地截图已在同一轮视觉检查中并列查看。个别中间截图捕获了侧栏动画或不一致视口，不作为最终验收依据。

## 聊天视觉检查

| 项目 | 源站 | 本地 |
| --- | --- | --- |
| 桌面侧栏 | 288 px | 288 px，支持拖动调整 |
| 顶栏 | 44 px | 44 px |
| 新对话输入框 | 656 × 103 px；1363×842 下 x497.5/y351 | 同尺寸、同坐标 |
| 对话输入框 | 768 × 44 px；x441.5/y758 | 同尺寸、同坐标 |
| 标题 | Anthropic Serif，38 px / 47.5 px，330 | 使用同源本地字体 |
| 回复正文 | Anthropic Serif，15 px / 24 px | 使用同源本地字体 |
| 导航与编辑器 | Anthropic Sans | 使用同源本地字体 |
| 图标 | Anthropicons-FizzyLake | 当前源站字体 cbd211904-aBcJK-nx.woff2 |
| 手机新输入框 | 约 338 × 80 px | 338 × 80 px，x26/y724 |

已修正：原版字体与新版图标、侧栏密度、两种输入布局、右侧用户气泡、无角色标签的助手正文、回复操作栏、模型选择位置；演示披露从聊天页顶端横幅收进账户菜单和对话底栏。

不是字面上所有像素和功能完全一致：品牌、昵称、历史条目、模型名和演示说明使用本站真实内容。项目/Artifacts/Code/Cowork/语音/附件/隐身等扩展入口展示未接入提示；分享目前只能复制文本。点赞反馈仅当页标记；Retry 将上一问题放回输入框等待发送。这些不应宣称已拥有 Claude 对应功能。

## 官网检查

- 明确的 AI 模型中转站首屏，聊天和模型价格入口。
- 模型列表、人民币输入/输出费率、支付开放状态由 `/api/config` 获取。
- 模型搜索及无结果清空操作已点击验证。
- 模型行链接带 model 参数，聊天页验证配置白名单后选中；不存在的 ID 回退到可用配置。
- 支付宝、微信、兑换码、账单查询入口及四步指南。
- 演示模型、模拟充值和未接入真实模型状态分别说明，不虚构真实模型品牌或生产可用性。
- 390 px 页面无横向溢出；价格表在自身容器内滚动。手机导航展开、选择锚点后收起已检查。
- 模型搜索图标被原全局 label 样式影响的问题已修正为横向排列。

## 行为与构建验证

- 本地演示发送“你好，测试新的聊天页面。”成功：流式回复、历史持久化、用量记录 120 输入 / 180 输出、测试费用 ¥0.0066。
- 手机侧栏、历史搜索、搜索结果重开对话通过。
- 模型菜单选择、账户菜单跳转充值页通过。
- 管理员账户菜单可见管理后台，点击能打开管理页。
- 原默认站点 4174 未配置模型时显示待开放，支付宝/微信不显示已开通。
- `npm test`：11/11 通过（本轮前端改造期间）。
- `npm run build`：最终构建通过。
- `npm run test:sites`：最终 4/4 通过。

结论：本地桌面/手机聊天主体视觉、已有聊天账单链路和中转站首页通过本轮检查。未发布生产；真实上游、商户、域名和服务器仍未配置，不能以演示结果声称真实支付或真实模型调用已完成。

# 追加验收：中转站调研、Hero、图文卡片与删减（2026-10-26）

## 参考与调整依据

- 用户页脚截图：`codex-clipboard-3d0645b1-028e-43fe-b2c8-b0dcd4cee413.png`，1880×641，深色三栏与折叠导航。
- 用户卡片截图：`codex-clipboard-73c737dd-c685-4e6c-bb45-63bbea439c3f.png`，1819×1214。后续指令明确改为三模型 + 稳定/安全两卡，生成图片，并删除不必要文字。配图为新增授权内容，不能按原截图的无图模型卡宣称像素完全一致。
- 已完成十站公开页面学习，逐站首屏、DOM 与说明在 `docs/十个中转站调研-20261026.md`、`evidence/relay-study-20261026/`；对照画板为同目录 `十站首屏对照.html`。
- 调研前没有继续修改 Hero；十个有效样本均完成读取、截图和查看后才开始新的 Hero 实现。DMXAPI、API易 .com 的空白主区未纳入有效十站，API易 .net 证书错误未绕过。

## 视觉与图片

- 五张 1536×1024 生成原图已逐张查看，统一的纸张拼贴风格：飞鸟、海浪、螺旋、桥梁、拱廊。
- 原图保存在 `assets/generated/card-art/`，网页 JPEG 在 `public/images/cards/`，每张约 636–797 KB。五张实际加载均 complete=true、naturalWidth=1536。
- 桌面模型三列、保障两列；手机改为单列。圆角、卡片留白和操作行沿用用户图三结构；首排不再放分类标签和段落式标题。
- 模型卡最终截图：`evidence/claude-fidelity/footer-hero/cards-final-desktop.jpg`、`cards-final-mobile.jpg`。源图和实现图已放入同次视觉输入比较。
- Hero：`evidence/relay-study-20261026/hero-after-study-desktop.jpg`（1363×842），`hero-after-study-mobile.jpg`（390×844）。1363×842 下 Hero 高 742 CSS px。左右布局在手机变为上下布局，无横向溢出。
- 网关展示本站实际网页中转路径及可选模型，不展示未实现的公共 API Key 按钮或伪造的吞吐量、用户量、SLA。
- React Bits Light Rays 官方 JS/CSS 源码及许可证随项目保留，参数定制；不是用静态图片冒充动态组件。

## 文字与状态

- 删除用户点名的三个小标题 / 重复提示，以及 Hero 英文标签、副标题、长说明、卡片分类、重复记录入口和末尾 CTA。
- Hero 追加的大字“Claude 中转服务”是用户再次要求中转站感后补充的品类定位；费率只呈现计费决策所需信息。
- 折叠保留费率、保障说明、FAQ、充值和使用指南。无障碍标签、版权及法律入口保留。
- 删减记录见 `docs/首页文案精简.md`。范围是官网，不宣称审阅或删减了整个后台和支付系统。

## 交互与检查

- 模型费率原生展开后显示 Haiku 输入 ¥8 / 输出 ¥40（演示配置）。
- Hero 选择 Opus 后，显示费率 ¥40 / ¥200；“开始使用”跳转 `/chat?model=demo-opus`，聊天模型确为 Claude Opus 5.5。
- 模型卡进入 Sonnet / Haiku 已在实际浏览器验证。站点的模拟模型配置在隔离 demo.db 内，原默认站点仍不包含它们。
- 手机 390×844 无横向溢出；网关完整显示并保留可触达的模型按钮。
- 最后一次浏览器日志未见应用错误；浏览器扩展错误单独排除，不当作本站功能错误。
- 最终 `npm run build` 通过；`npm run test:sites` 4/4 通过。API 后端本轮未改动；此前 11 项通过的记录仍是此前测试，不表述为本轮新跑。

## 修正记录

1. 旧稿只是品牌海报，用户认为没有中转站感。改为品类定位 + 实际模型选择 + 中转路径。
2. 旧稿卡片文字太多、缺少视觉。改为五张生成配图，信息收进操作和展开项。
3. 中间手机截图在视口切换时出现空白，已通过稳定后的 DOM 和重新截图复核，最终手机证据正常。
4. 旧截图中浏览器扩展的悬停浮层不属于本站；最终页面不以扩展浮层作为设计内容。

final result: passed

## React Bits 波点地球与超大范围修订（2026-10-26）

- 来源：React Bits 官方 Dot Grid JS/CSS；`DotGlobe.jsx` 增加球面地图投影和经度旋转，保留原波点渲染、鼠标弹性与暂停控制。地图本地加载。COBE 依赖已删除。
- 新排版沿用用户选择的 AIHubMix 居中 Hero 与三功能卡；配色恢复暖白、炭黑、陶土色，标题为衬线字体。
- 中间版本已在原日常 Chrome 查看点阵效果；曾捕获旧版本热更新 removeChild 错误，最新超大范围版本尚未完成浏览器复验，不能宣称错误已消失。
- 用户明确要求“疯狂扩大”，最终桌面地球 `max(1800px, 150vw)`，手机 `max(1000px, 250vw)`，由 Hero 裁切；此前缩小处理已撤回。
- 最终源码构建成功，Sites 包装测试 4/4 通过。
- 最终浏览器复验受阻：原 Chrome Eimy 扩展连接 ID 9 消失；现有标签导航超时。未另开浏览器绕过。缩放、移动端最终截图和新版本控制台复验待原连接恢复。

final result: pending browser verification

## Hero 首屏、密度与交互卡片最终复验（2026-10-26）

- 原 Chrome Eimy 扩展重新连接为 ID 13，继续复用同一日常配置；未启动独立浏览器。
- 波点增强：间距 4.7px、直径 3.8px；陆地/海洋双层可见度，保持超大球面。暖白、炭黑、陶土配色不变。
- 桌面 1293×786：Hero 从 y=76 至 y=786；三卡从 y=534 至 y=758，完整纳入首屏。主信息在卡片上方区域居中，最末修订已将上下 padding 改为对称。
- 手机 390×844：三卡列宽 339px，纵向排列，无横向溢出；主信息包围盒中心与区域中心均为 (187.5,308)。菜单正常打开与关闭。
- Opus 切换同步输入 ¥40、输出 ¥200 和开始使用链接 `/chat?model=demo-opus`；暂停按钮令卡片连续动效 animation-play-state 为 paused。减少动态 CSS 会禁用卡片动画与悬浮位移。
- 当前浏览器控制台 errors=[]。旧版 removeChild 错误在本次新预览中未复现。
- 证据：`evidence/relay-study-20261026/hero-motion-cards-desktop.jpg`、`hero-motion-cards-mobile.jpg`。
- 最终 `npm run build` 成功，`npm run test:sites` 4/4 通过；本次没有修改后端或重跑 API 测试。

final result: passed (Hero desktop/mobile, model/rate links, motion controls)
