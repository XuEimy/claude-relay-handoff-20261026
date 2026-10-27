# 原仓库与网页构建

上游 Caho1/open-claude-ui 固定提交 `c1f923ae0051a871941b98a0e2e3183a545e6a85`，77 个文件及 MIT 许可原样保留在 vendor/open-claude-ui。

`build.mjs` 生成原组件陈列馆 `/claude-ui`，并调用 `build-chat.mjs` 构建实际网页 `/claude-chat/index.html`。网页入口现在是 `integrations/claude-web/app/WebApp.jsx`，不再加载旧桌面外壳、任务看板、假授权与模拟文件。实际结构和验证方法见 `integrations/claude-web/README.md`。

本目录仅保留构建、完整性检查、SVG 图标和字体库。旧应用实现已移入 backups/before-work-channel-rebuild-20261027。vendor 原文件没有修改。
