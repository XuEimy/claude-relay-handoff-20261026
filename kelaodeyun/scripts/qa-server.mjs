// Isolated browser acceptance fixture. Never use this server for deployment.
import { start } from "../server.mjs";
const answer =
  "这是一条用于本地验收的固定回复，不来自真实模型。\n\n- 流式显示已连通\n- 会话会保存到独立测试数据库\n- 用量根据测试事件结算";
await start(
  {
    ...process.env,
    PORT: "4175",
    QA_MODE: "true",
    DATABASE_PATH: "data/qa.db",
  },
  {
    fetcher: async () => {
      const encoder = new TextEncoder();
      let cancelled = false;
      return new Response(
        new ReadableStream({
          async start(c) {
            const send = (d) => {
              if (!cancelled)
                c.enqueue(
                  encoder.encode("data: " + JSON.stringify(d) + "\n\n"),
                );
            };
            send({
              type: "message_start",
              message: { usage: { input_tokens: 25, output_tokens: 0 } },
            });
            for (const text of answer.match(/.{1,6}|\n/g)) {
              await new Promise((r) => setTimeout(r, 40));
              if (cancelled) return;
              send({
                type: "content_block_delta",
                delta: { type: "text_delta", text },
              });
            }
            send({ type: "message_delta", usage: { output_tokens: 35 } });
            send({ type: "message_stop" });
            c.close();
          },
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    },
  },
);
