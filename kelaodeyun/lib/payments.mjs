import { randomBytes, sign, verify, createDecipheriv } from "node:crypto";
import { AlipaySdk } from "alipay-sdk";
import QRCode from "qrcode";
const pem = (s) => s?.replaceAll("\\n", "\n");
export function createPayments(env, fetcher = fetch) {
  const has = (keys) => keys.every((k) => env[k]);
  const origin = env.PUBLIC_ORIGIN;
  const aliReady = !!(
    origin?.startsWith("https://") &&
    has([
      "ALIPAY_APP_ID",
      "ALIPAY_PRIVATE_KEY",
      "ALIPAY_PUBLIC_KEY",
      "ALIPAY_SELLER_ID",
    ])
  );
  const wxReady = !!(
    origin?.startsWith("https://") &&
    has([
      "WECHAT_APP_ID",
      "WECHAT_MCH_ID",
      "WECHAT_SERIAL_NO",
      "WECHAT_PRIVATE_KEY",
      "WECHAT_PUBLIC_KEY",
      "WECHAT_PUBLIC_KEY_ID",
      "WECHAT_API_V3_KEY",
    ])
  );
  const ali = aliReady
    ? new AlipaySdk({
        appId: env.ALIPAY_APP_ID,
        privateKey: pem(env.ALIPAY_PRIVATE_KEY),
        alipayPublicKey: pem(env.ALIPAY_PUBLIC_KEY),
        signType: "RSA2",
        gateway:
          env.ALIPAY_SANDBOX === "true"
            ? "https://openapi-sandbox.dl.alipaydev.com/gateway.do"
            : "https://openapi.alipay.com/gateway.do",
        timeout: 15000,
      })
    : null;
  const providers = [
    { id: "alipay", name: "支付宝", enabled: aliReady },
    { id: "wechat", name: "微信支付", enabled: wxReady },
  ];
  function wxVerify(headers, raw) {
    const ts = headers.get("wechatpay-timestamp"),
      nonce = headers.get("wechatpay-nonce"),
      signature = headers.get("wechatpay-signature"),
      serial = headers.get("wechatpay-serial");
    if (
      serial !== env.WECHAT_PUBLIC_KEY_ID ||
      !/^\d+$/.test(ts || "") ||
      Math.abs(Date.now() / 1000 - Number(ts)) > 300 ||
      !nonce ||
      !signature
    )
      throw Error("invalid signature");
    if (
      !verify(
        "RSA-SHA256",
        Buffer.from(`${ts}\n${nonce}\n${raw}\n`),
        pem(env.WECHAT_PUBLIC_KEY),
        Buffer.from(signature, "base64"),
      )
    )
      throw Error("invalid signature");
  }
  async function wxCall(method, path, body) {
    const raw = body ? JSON.stringify(body) : "",
      timestamp = Math.floor(Date.now() / 1000),
      nonce = randomBytes(16).toString("hex");
    const sig = sign(
      "RSA-SHA256",
      Buffer.from(`${method}\n${path}\n${timestamp}\n${nonce}\n${raw}\n`),
      pem(env.WECHAT_PRIVATE_KEY),
    ).toString("base64");
    const response = await fetcher("https://api.mch.weixin.qq.com" + path, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Wechatpay-Serial": env.WECHAT_PUBLIC_KEY_ID,
        Authorization: `WECHATPAY2-SHA256-RSA2048 mchid="${env.WECHAT_MCH_ID}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${env.WECHAT_SERIAL_NO}",signature="${sig}"`,
      },
      ...(body ? { body: raw } : {}),
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    wxVerify(response.headers, text);
    if (!response.ok) throw Error("payment unavailable");
    return JSON.parse(text);
  }
  function aliEvent(data) {
    if (
      data.app_id !== env.ALIPAY_APP_ID ||
      data.seller_id !== env.ALIPAY_SELLER_ID
    )
      throw Error("merchant mismatch");
    if (!["TRADE_SUCCESS", "TRADE_FINISHED"].includes(data.trade_status))
      return null;
    if (!/^\d+(\.\d{1,2})?$/.test(data.total_amount))
      throw Error("amount invalid");
    return {
      id: data.out_trade_no,
      provider: "alipay",
      transaction: data.trade_no,
      amount: Math.round(Number(data.total_amount) * 100),
    };
  }
  function wxEvent(data) {
    if (data.appid !== env.WECHAT_APP_ID || data.mchid !== env.WECHAT_MCH_ID)
      throw Error("merchant mismatch");
    if (data.trade_state !== "SUCCESS") return null;
    if (
      data.amount?.currency !== "CNY" ||
      !Number.isSafeInteger(data.amount.total)
    )
      throw Error("amount invalid");
    return {
      id: data.out_trade_no,
      provider: "wechat",
      transaction: data.transaction_id,
      amount: data.amount.total,
    };
  }
  return {
    providers,
    async create(order, mobile = false) {
      if (!providers.find((p) => p.id === order.provider)?.enabled)
        throw Error("payment unavailable");
      if (order.provider === "alipay")
        return {
          url: ali.pageExecute(
            mobile ? "alipay.trade.wap.pay" : "alipay.trade.page.pay",
            "GET",
            {
              notifyUrl: origin + "/api/payments/alipay/notify",
              returnUrl: origin + "/billing",
              bizContent: {
                out_trade_no: order.id,
                total_amount: (order.amount / 100).toFixed(2),
                subject: "kelaodeyun 账户充值",
                product_code: mobile
                  ? "QUICK_WAP_WAY"
                  : "FAST_INSTANT_TRADE_PAY",
                timeout_express: "30m",
              },
            },
          ),
        };
      const data = await wxCall("POST", "/v3/pay/transactions/native", {
        appid: env.WECHAT_APP_ID,
        mchid: env.WECHAT_MCH_ID,
        description: "kelaodeyun 账户充值",
        out_trade_no: order.id,
        notify_url: origin + "/api/payments/wechat/notify",
        time_expire: new Date(Date.now() + 1800000).toISOString(),
        amount: { total: order.amount, currency: "CNY" },
      });
      if (!data.code_url?.startsWith("weixin://")) throw Error("invalid code");
      return {
        qr: await QRCode.toDataURL(data.code_url, { width: 280, margin: 2 }),
      };
    },
    async query(order) {
      if (order.provider === "alipay") {
        const d = await ali.exec(
          "alipay.trade.query",
          { bizContent: { outTradeNo: order.id } },
          { validateSign: true },
        );
        if (d.code !== "10000") return null;
        // Query responses are signed by the configured platform key and this app's request.
        return aliEvent({
          app_id: env.ALIPAY_APP_ID,
          seller_id: env.ALIPAY_SELLER_ID,
          trade_status: d.tradeStatus,
          out_trade_no: d.outTradeNo,
          total_amount: d.totalAmount,
          trade_no: d.tradeNo,
        });
      }
      return wxEvent(
        await wxCall(
          "GET",
          `/v3/pay/transactions/out-trade-no/${encodeURIComponent(order.id)}?mchid=${encodeURIComponent(env.WECHAT_MCH_ID)}`,
        ),
      );
    },
    notify(provider, raw, headers) {
      if (provider === "alipay" && ali) {
        const d = Object.fromEntries(new URLSearchParams(raw));
        if (d.sign_type !== "RSA2" || !ali.checkNotifySignV2(d))
          throw Error("invalid signature");
        return aliEvent(d);
      }
      if (provider === "wechat" && wxReady) {
        wxVerify(headers, raw);
        const envelope = JSON.parse(raw);
        if (envelope.event_type !== "TRANSACTION.SUCCESS") return null;
        const r = envelope.resource;
        if (r.algorithm !== "AEAD_AES_256_GCM") throw Error("invalid resource");
        const buf = Buffer.from(r.ciphertext, "base64");
        const cipher = createDecipheriv(
          "aes-256-gcm",
          Buffer.from(env.WECHAT_API_V3_KEY),
          r.nonce,
        );
        cipher.setAuthTag(buf.subarray(-16));
        cipher.setAAD(Buffer.from(r.associated_data || ""));
        return wxEvent(
          JSON.parse(
            Buffer.concat([
              cipher.update(buf.subarray(0, -16)),
              cipher.final(),
            ]).toString(),
          ),
        );
      }
      throw Error("payment unavailable");
    },
  };
}
