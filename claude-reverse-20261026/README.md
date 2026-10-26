# Claude 页面还原与逆向分析

- 本地预览：http://127.0.0.1:4173/
- 源码：`app/src/App.jsx`、`app/src/styles.css`
- 技术报告：`逆向分析.md`
- 验证记录：`app/design-qa.md`
- 原始证据：`evidence/`

## 运行

```sh
cd app
npm install
npm run dev -- --host 127.0.0.1 --port 4173 --strictPort
```

```sh
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

还原范围为 /new 主界面。模拟消息保存在当前浏览器 localStorage，没有 Claude API 连接。模型/强度/搜索开关为本地状态，外围功能需要原站服务。历史列表使用示例内容。语音不申请麦克风权限，文件附件只读取本地文件名。

发布包仅作为静态分析证据保存；本地应用运行独立实现。桌面与手机截图及代码定位均有保留。证据目录可能含原站截图中显示的账户名、历史标题，不应与纯演示源码一并公开分发。
