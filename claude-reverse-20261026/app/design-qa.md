# Design QA — Claude /new

final result: passed

范围：新建聊天主画面、桌面模型菜单、手机主画面和本地演示主流程。此结论不代表整个 Claude 网站已复刻，不包含真实服务联调或外围子页面。

## 对照证据

- Source visual truth：`../evidence/source-desktop.jpg`、`../evidence/source-mobile.jpg`、`../evidence/model-menu.jpg`。
- Implementation：`../evidence/local-desktop-v2.jpg`、`../evidence/local-mobile-final.jpg`、`../evidence/local-model-menu-final.jpg`。
- 桌面 CSS/截图尺寸：1363×786；手机：390×844；devicePixelRatio 1。最终对照均使用对应同尺寸输入，不以第一轮尺寸不一致的截图作精确比较。
- 状态：浅色模式，Free，新建空会话；桌面模型菜单单独对照。侧栏使用示例/本地会话，因此文字和滚动条长度不作一一一致判定。
- Full-view comparison：原站与本地截图在同一次图像输入中对照，检查总体比例、输入框、问候、侧栏、留白与手机布局。
- Focused comparison：同一输入中的模型菜单位于截图可读范围；单独检查宽度、右侧锚点、文字层级、分组、升级 badge。手机输入栏按 390px 原始截图逐项对照，控件可读，无需进一步放大。

## 修复记录

1. P2：第一轮本地视口与原站不一致，且标题字距、字体光学参数不符。设置对应视口，应用原始可变字体及 `opsz:48`、去掉错误字距。证据：local-desktop-v2.jpg。
2. P2：模型菜单过窄、锚点偏右、底部可能裁切。宽度改为 416px，右边缘对齐模型区，调整行高和说明文字。证据：local-model-menu-final.jpg。
3. P2：手机模型控制栏水平间距偏移、标题换行不一致。修正按钮宽度和手机标题换行，给图标 radio 添加明确 aria-label。证据：local-mobile-final.jpg；菜单边界实测 x28/y360/w336/h337，未溢出 390×844 视口。
4. P2：浏览器扩展在 body 后添加内容，聚焦导致 body 滚动 8px。应用根容器固定到视口，并使用 overflow:clip。再次对照 model-menu-final，标题和输入框恢复正确纵向位置。
5. 功能修复：停止生成时保存部分回复。延长本地模拟逐字输出节奏后实测停止按钮，回复停止且历史中出现对应会话。

## 五项保真检查

- 字体：使用本地原站 anthropic-sans / anthropic-serif 和 Anthropicons；标题字号、光学大小和导航层级已校准。
- 间距：侧栏 288px，输入框 640px×约103px，移动端靠底部；菜单不被截断。侧栏密度与主内容对齐通过。
- 颜色：背景 #fcfcfb、正文 #0b0b0b、次文字 #52514e，与采集 token 对应；输入区边框、圆角和阴影已比对。
- 图片/资产：Spark、incognito、voice 直接使用原站 SVG；图标使用原站字体。没有用绘制的图形替代品牌资产。
- 文案：主界面、模型与菜单文案对应采集版本；历史以示例内容替换。对话页明确标为 Local demo，并说明未连接 Claude 服务。

## 浏览器功能检查

通过：

- 初始页面桌面/手机渲染、空输入 placeholder。
- 侧栏收起、展开和分隔线方向键调宽（288→298→288）。
- Sonnet→Haiku 模型切换；Medium→High 强度切换。
- Web search 开关 true→false。
- Cowork 提示和 Later 返回。
- 输入后出现发送按钮；本地流式输出、结束状态、停止状态。
- 本地会话保存、New 返回初始页、搜索定位已保存会话。
- 移动端模型菜单处于视口内，页面没有横向溢出。
- `npm run build` 成功。

浏览器日志检查：获取到的 error/warn 来自 Chrome 扩展（沉浸式翻译网络错误、Zotero 连接错误）。此次读取未发现本地应用代码报错；不是全时段零错误保证。

## 明确测试缺口与范围限制

- 自动选择本地附件被 ChatGPT Chrome 扩展的 “Allow access to file URLs” 权限阻止，文件 chooser 已能触发，但 setFiles 未完成；没有修改扩展权限。附件选取/移除的端到端测试仍未确认。
- Cowork 提示只还原文案与按钮，原站的介绍视频未复制；其后台执行、语音、Skills、连接器及更多模型功能未实现。
- 对话页为说明性本地演示，不是根据真实回复页全量采集后的像素级复刻。
- 真实 Claude 请求、Cookie/CSRF/设备校验、上传和 SSE 实际返回没有本轮网络证据。
- 未覆盖全部键盘组合、屏幕阅读器和所有浏览器。

## P3 后续精修

模型菜单分隔线、选中标记及部分控件位置尚有少量像素差异；侧栏可见历史内容和滚动条长度随示例数据不同。它们不阻塞当前新建页演示。
