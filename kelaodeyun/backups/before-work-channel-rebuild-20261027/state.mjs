export function readChats() {
  try {
    const data = JSON.parse(
      localStorage.getItem("kelaodeyun.ui.chats.v1") || "[]",
    );
    return Array.isArray(data)
      ? data
          .filter(
            (c) =>
              typeof c.id === "string" &&
              typeof c.title === "string" &&
              Array.isArray(c.messages),
          )
          .map((c) => ({
            ...c,
            messages: c.messages.filter(
              (m) =>
                typeof m.id === "string" &&
                typeof m.text === "string" &&
                ["user", "assistant"].includes(m.role),
            ),
          }))
      : [];
  } catch {
    return [];
  }
}
export function newChat(text) {
  return {
    id: crypto.randomUUID(),
    title: text.trim().slice(0, 28) || "新对话",
    messages: [],
    pinned: false,
  };
}
export function demoReply(text, tools, attachments = 0) {
  if (tools)
    return "可以。我会先精简页面的标题与结构，再展示修改前后的差异。\n\n下面用 welcome.html 演示一次文件修改，你可以确认或拒绝。";
  if (attachments)
    return "附件已加入这段演示对话。目前展示的是示例附件，没有上传或分析真实文件。\n\n你可以继续描述想要整理的内容。";
  if (/你好|hello/i.test(text))
    return "你好。很高兴见到你！\n\n想从一个问题、一个想法，还是一段需要修改的文字开始？";
  return "我们可以从这里开始：\n\n先写下一句最想表达的话，再把它拆成清晰的目标与下一步。你可以把草稿贴过来，或者告诉我希望解决的问题。\n\n这是本地演示回复，当前尚未连接模型。";
}
export const FILE =
  '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>body{margin:0;padding:52px 30px;background:#faf9f5;color:#292824;font:16px system-ui}small{color:#c6613f}h1{font:40px Georgia,serif;line-height:1.3}p{color:#77756e;line-height:1.8}</style><small>云上克劳德</small><h1>让想法，<br>有个着落。</h1><p>从第一句话开始。</p></html>';
export const DIFF =
  "--- a/welcome.html\n+++ b/welcome.html\n@@ -1,4 +1,4 @@\n <main>\n-  <h1>欢迎来到我们的网站</h1>\n-  <p>我们为你提供丰富的智能功能。</p>\n+  <h1>让想法，有个着落。</h1>\n+  <p>从第一句话开始。</p>\n </main>";
