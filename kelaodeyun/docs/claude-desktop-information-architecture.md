# Claude 桌面版信息架构与本站复用清单

> 最新实现：已恢复最初 Claude 网页逆向源码作为视觉底座。聊天与 Cowork 共用原网页输入框，侧栏包含项目、作品、自定义；所有套餐和升级展示删除。下文保留桌面产品的研究归属，实际接入边界见 `integrations/claude-web/README.md`。SDK 仍暂停。

核对日期：2026-10-27。目标：使用 Caho1/open-claude-ui 源码构建云上克劳德的聊天与 Cowork 界面，沿用原有官网，暂停 SDK。

## 1. 证据与版本边界

- 已逐项读取本地完整仓库，固定提交 `c1f923ae0051a871941b98a0e2e3183a545e6a85`。组件源码、设计令牌、Tailwind 配置与动效预设是直接复用的基线。
- 官方目前同时存在双模式和逐步开放的统一模式：双模式在共享首页选择 Chat / Cowork；统一模式将短对话与长期任务放入一个入口，Code 仍独立。用户明确需要聊天与 Cowork，本站保留两项模式。
- 本机已启用应用清单和 `/Applications`、用户 Applications 常见路径中未找到 Claude.app。本次没有声称实测某个已登录 Max 桌面账户的全部菜单；精确菜单次序、灰度功能和权限相关入口以真实账户为准。
- 仓库是第三方组件实现，不是官方客户端业务源码。布局与组件可以直接复用；示例角色、写死的任务、模型列表以及无回调按钮需要站内数据适配。不能把这些示例推断成官方全部信息架构。

官方依据：[Chat 与 Cowork 的版本变化](https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude)、[Cowork 多端入口](https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile)、[Code 桌面参考](https://code.claude.com/docs/en/desktop)。

## 2. 产品结构：模式、内容、能力、账户是四个不同层次

下图是功能归属，非某个账户侧栏像素位置的逐字还原。

```text
Claude 桌面应用
├─ 工作入口
│  ├─ Chat：即时问答、写作、分析、内容生成
│  ├─ Cowork：执行多步骤任务、审阅过程、交付文件
│  └─ Code：独立代码工作区（本站当前不扩展）
├─ 内容组织
│  ├─ 最近会话 / 最近任务：返回已经开始的工作
│  ├─ Projects：共享文件、背景、指令和项目记忆
│  ├─ Artifacts：集中查找、打开和继续修改产物
│  └─ Scheduled：计划任务与历次运行
├─ Customize：能力配置
│  ├─ Skills：可重复的工作方法
│  ├─ Connectors：外部服务连接与权限
│  └─ Plugins：组合技能、命令与连接器
└─ 账户与设置
   ├─ 账户与套餐
   ├─ Usage：用量、额度及重置时间
   ├─ 个性化指令与记忆
   ├─ 能力、隐私与数据管理
   └─ 桌面偏好与帮助
```

账户的 Max 是套餐维度，不应该另起一个“Max 工作台”。Max 个人账户也不应凭空出现企业组织管理、成员审批与管理员策略菜单。官方 Max 有不同用量档位，界面应展示实际账户档位，而非写死“无限”。[Max 官方说明](https://support.claude.com/en/articles/11049741-what-is-the-max-plan)。

## 3. 外壳与左侧导航

| 区域 | 职责 | 交互与层级 |
|---|---|---|
| 品牌与折叠 | 识别产品、释放阅读宽度 | 折叠后保留恢复入口，不让会话内容丢失 |
| 模式选择 | 区分聊天与执行任务 | 共享视觉外壳、字体、模型控件；切换不会清空另一模式历史 |
| 新建入口 | 开始新的对话或任务 | 随当前模式显示“新对话 / 新任务” |
| 搜索 | 找回已有工作 | 名称及内容匹配，结果继续原会话 |
| 内容入口 | 项目、产物、计划任务、定制 | 根据实际实现和权限出现，避免无效入口占位 |
| 最近记录 | 返回当前工作 | 标题为主；只有任务才展示必要状态，不给每条聊天塞技术徽章 |
| 账户 | 用户身份、套餐、设置 | 固定底部；账单和用量收在账户里，不进入消息主栏 |

官方已经确认 Projects、Artifacts、Scheduled、Customize 的功能归属。不同版本会调整显示位置与合并方式，本表用于本站组织，不冒称官方每个版本布局完全一致。

## 4. Chat：页面和完整状态

### 新会话

中心只有问候语与 Composer；建议操作是入口，不是多排功能卡片。模型与思考选项属于输入区。附件已选时展示文件名、类型、删除操作；发送前明确材料是否只是示例。

### 进入对话

- 顶栏：会话名与会话级动作。
- 主栏：用户消息、助手回复、必要时展开的思考/工具过程。
- 底部：Composer 固定可达；长内容在消息区滚动。
- 右侧：只有打开产物时才展开，不预先摆空白面板。
- 回答操作：复制、反馈；额外操作按上下文出现。

### 必须覆盖的状态

| 状态 | 界面行为 |
|---|---|
| 空白 | 问候与输入框，发送空白被阻止 |
| 输入中文 | 合成输入回车不误发送；Shift+Enter 换行 |
| 正在回复 | 停止操作可达，重复发送受控 |
| 阅读历史 | 用户向上滚动后不被新输出强行拉到底部 |
| 已停止 | 保留已经生成的文本，能够继续 |
| 选择历史 | 恢复原会话内容与所选模型 |
| 需要工具授权 | 显示动作、对象、参数、允许与拒绝 |
| 打开产物 | 与对话并排显示，可关闭和调整宽度 |
| 刷新 | 已保存会话仍可找到 |
| 删除 | 明确确认，不能误删另一个会话 |

这些状态由仓库组件承担外观，由站内适配层承担会话持久化和动作关系。

## 5. Cowork：以任务与交付为中心

官方定义的 Cowork 流程为：理解任务、拟定方案、必要时拆分工作、执行、交付可预览和下载的输出；用户能够中途补充要求并审阅动作。它不等于固定显示四个“架构师/工程师”的 Agent 卡片。[官方 Cowork 使用说明](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork)。

### 任务首页

- 与聊天共用外壳和输入组件。
- 输入描述的是工作目标，例如整理资料或生成文档。
- 连接的材料与权限在需要时提供，不预先塞满技术配置。
- 最近任务能看出运行中、待确认、暂停和完成。

### 任务详情

| 内容 | 用户需要知道的事 | 展示原则 |
|---|---|---|
| 原始任务 | 我让它做什么 | 保留原要求，方便对照 |
| 工作步骤 | 现在做到哪里 | 简短状态；细节按需展开 |
| 工具调用 | 将操作什么 | 工具名、目标对象、必要参数 |
| 权限确认 | 是否允许继续 | 明确批准范围；拒绝有结果状态 |
| 补充要求 | 如何纠正方向 | 保存到当前任务，不另开任务丢上下文 |
| 运行过程 | 为什么停在这里 | 可查看已完成与待处理步骤 |
| 产出文件 | 最终交付是什么 | 文件名、预览、下载、继续修改 |

### 推荐任务状态模型

`未开始 → 进行中 → 待确认 → 完成`，并包含 `暂停 / 已拒绝 / 失败` 分支。这是本站实现的状态归纳，不声称是官方内部枚举名。

当前本站：使用源码 `CoworkAgentCanvas`，将写死的工程角色替换为演示任务的整理、分析、撰写、复核步骤；保留原版布局、状态和产物容器。任务在浏览器中演示，刷新时未完成的运行任务恢复为暂停，避免假装后台继续执行。

## 6. Projects、Artifacts、Scheduled、Customize 的关系

| 模块 | 管理对象 | 与聊天/Cowork 的关系 |
|---|---|---|
| Projects | 一项长期工作的文件、指令和背景 | 多次对话与任务共用上下文；不是单次任务 |
| Artifacts | 文档、设计、页面、图表等产物 | 从会话打开，也能从产物集合再次进入 |
| Scheduled | 重复执行的任务配置及运行记录 | 一条计划可产生多次任务运行 |
| Skills | 工作步骤、格式及领域方法 | 在有关任务中使用，不是新的会话模式 |
| Connectors | 外部服务及访问权限 | 决定 Claude 能访问什么数据/工具 |
| Plugins | 组合能力包 | 可以包含 Skills、命令和连接器 |

来源：[Projects](https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects)、[Artifacts](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them)、[Scheduled](https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork)、[Customize 统一目录](https://support.claude.com/en/articles/14328846-browse-skills-connectors-and-plugins-in-one-directory)。

上述完整模块是信息架构清单。本站本轮没有伪造已联网的插件商城、连接器授权或后台计划执行。

## 7. Max 与设置

Max 不是一个模型，也不是视觉主题。账户入口显示套餐，模型选择器显示模型，两者分开。用量页负责会话用量、周用量、重置时间与额外用量；不能把官网示例费率替换成虚构的官方额度。

已确认官方入口包含 Settings > Usage；个性化指令在新版 Settings > Your Claude，旧版可能在 Account；数据导出在 Privacy。没有访问实际账户的设置截图，不编造全部设置栏的精确排序。[用量管理](https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans)、[统一版个性化说明](https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude)、[数据导出](https://support.claude.com/en/articles/9450526-export-your-claude-data)。

本站当前 Max 标识属于本地界面演示，不代表授予官方套餐。账户与用量仍链接本站原有账户页面。

## 8. 源码直接复用表

| 页面能力 | 上游文件 | 本站适配 |
|---|---|---|
| 模式切换 | `SegmentedControl.tsx` | 绑定聊天/Cowork 状态 |
| 核心输入 | `ChatComposer.tsx` | 绑定本地会话，保留 IME、附件示例、模型菜单 |
| 对话消息 | `ChatMessageBubbles.tsx` | 本地逐字回复、复制、反馈、产物入口 |
| 按钮 | `CdsButton.tsx` | 直接复用按钮尺寸、变体与反馈 |
| 权限卡 | `McpToolDecisionCard.tsx` | 绑定允许/拒绝结果；明确只是本地演示 |
| Cowork | `CoworkAgentCanvas.tsx` | 构建时增加数据和动作回调，不覆盖上游源文件 |
| 分栏 | `ArtifactsSplitPaneResizer.tsx` | 绑定产物开合、窄屏全页展示 |
| 文件差异 | `StreamingDiffViewer.tsx` | 提供示例 diff，支持统一/分屏与复制 |
| 删除确认 | `ConfirmationDialog.tsx` | 绑定删除，增加宿主焦点约束 |
| 色彩与排版 | `cds-theme.css`、`tailwind.config.js` | 直接复用；应用内统一字体变量 |

固定上游文件保持原状并校验 SHA256。允许的业务和 SVG 修正集中在 `integrations/open-claude-ui/source-adapter.mjs`，构建时执行；上游升级时关键补丁不匹配则直接报错。

## 9. 图标与字体资产规范

- 图标族按仓库文档使用 Phosphor SVG，统一从 `chat/design-system/icons.tsx` 导入。
- 常规图标使用 `currentColor`，默认 regular；尺寸由 12/14/16/18/20/24 的用途决定。
- 原示例里的灯泡、赞踩、文件、工具、勾号等 emoji 在 JSX 构建阶段替换为 SVG，不用 emoji 字体替代，也不混用 3D 图片。
- 正文/UI：Inter；展示衬线：Newsreader；代码：JetBrains Mono。来自 Fontsource 的本地 WOFF2，保留字体许可证，不依赖运行时字体 CDN。
- 中文按仓库思路使用 PingFang SC / Microsoft YaHei 等系统回退，衬线标题使用 Songti SC 等回退。
- 字体分别绑定 `--ui-font-sans`、`--ui-font-serif`、`--ui-font-mono`，避免组件各自声明一组不一致的字体。

## 10. 本轮边界

已构建聊天与 Cowork 的本地前端：实际原组件 + 本地任务/会话状态 + SVG/字体资产。官网封面未改。SDK、真实模型、官方账号订阅、连接器、服务端文件执行和真实计划任务均未接入；没有把这些能力伪装成已经上线。
