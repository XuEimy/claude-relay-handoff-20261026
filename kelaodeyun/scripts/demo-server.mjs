// User-facing local demonstration. Uses a separate DB and never calls payment providers.
import { start } from "../server.mjs";
import { seedDemoModels } from "./seed-demo-models.mjs";
if (process.env.NODE_ENV === "production")
  throw Error("Demo server cannot run in production");
const payments = {
  providers: [
    { id: "alipay", name: "支付宝", enabled: true },
    { id: "wechat", name: "微信支付", enabled: true },
  ],
  create: async () => ({ demo: true }),
  query: async (order) => ({
    id: order.id,
    provider: order.provider,
    amount: order.amount,
    transaction: "DEMO-" + order.id,
  }),
  notify: () => {
    throw Error("Demo has no payment callbacks");
  },
};
seedDemoModels();
await start(
  {
    NODE_ENV: "development",
    HOST: "127.0.0.1",
    PORT: "4176",
    DATABASE_PATH: "data/demo.db",
    REGISTRATION_OPEN: "true",
  },
  {
    demo: true,
    payments,
    fetcher: async (_url, { signal }) => {
      const encoder = new TextEncoder();
      let stopped = false;
      const answer =
        "这是 kelaodeyun 的演示回复，未调用真实模型。\n\n### 你已经走通的流程\n1. 注册并登录自己的账户。\n2. 通过兑换码或模拟在线支付充值。\n3. 选择模型，发送问题并查看逐字回复。\n4. 在「账户与用量」核对 token 和费用。\n\n**对话已保存在你的账户下，可以随时回来继续。**";
      return new Response(
        new ReadableStream({
          async start(c) {
            const send = (d) => {
              if (!stopped)
                c.enqueue(
                  encoder.encode("data: " + JSON.stringify(d) + "\n\n"),
                );
            };
            signal.addEventListener(
              "abort",
              () => {
                stopped = true;
                try {
                  c.error(Error("stopped"));
                } catch {}
              },
              { once: true },
            );
            send({
              type: "message_start",
              message: { usage: { input_tokens: 120, output_tokens: 0 } },
            });
            for (const text of answer.match(/.{1,8}|\n/g)) {
              await new Promise((r) => setTimeout(r, 70));
              if (stopped) return;
              send({
                type: "content_block_delta",
                delta: { type: "text_delta", text },
              });
            }
            send({ type: "message_delta", usage: { output_tokens: 180 } });
            send({ type: "message_stop" });
            c.close();
          },
          cancel() {
            stopped = true;
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    },
  },
);
