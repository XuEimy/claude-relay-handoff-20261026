# Claude 网页底座 · Chat / Cowork

2026-10-27 按“删了重建”重建频道层，沿用最初 `claude-reverse-20261026/app` 网页逆向源码的布局、字体与 SVG。官网和暂停的 SDK 不改。

## 当前入口

- `app/WebApp.jsx`：唯一的 Chat / Cowork 界面，两个频道共用消息流、输入框、模型菜单、附件选择和历史搜索。
- `app/session-store.mjs`：统一会话数据。`channel` 区分聊天与工作，后续消息追加到同一会话。
- `app/Framework.jsx`：项目、作品、自定义入口；没有虚构产物。
- `app/web-base.css`：最初网页样式，原始比例保留。
- `app/web-adapter.css`：必要的内容页样式，没有独立 Cowork 看板。
- `original`：最初网页源码与资产快照，SHA256 见 manifest。

原本独立的 Cowork 组件、桌面外壳、任务状态机、定时器、假文档和假授权已退出运行代码，存档于 `backups/before-work-channel-rebuild-20261027`。第三方原仓库仍只读保留，`/claude-ui` 只作原始源码陈列馆。

## 数据与执行边界

新存储为 `kelaodeyun.web.sessions.v2`。首次读取旧网页会话及 Cowork 的 prompt/notes；保留用户内容，不迁移模拟步骤、授权状态或演示文件。旧存储不删除。

SDK 仍暂停。发送只保存输入和所选文件名，不上传内容、不调用模型、不运行任务、不生成回复或产物。页面明确提示连接状态。临时对话不写入历史。

## 验证

```sh
node --test integrations/claude-web/app/session-store.test.mjs
npm run build
node integrations/open-claude-ui/verify.mjs
npm run test:sites
```

## 对话细节验证（2026-10-27）

输入框内切换 Chat/Cowork 保留当前消息与草稿；侧栏入口仍用于新建对话。打开已保存历史退出临时模式。搜索匹配标题与消息正文。存储写入失败时显示未保存提示。

验证：5 项 session-store 测试、完整构建和源文件校验通过；在已有日常 Chrome 标签页验证草稿切换、临时模式退出及正文搜索。SDK 保持暂停。
