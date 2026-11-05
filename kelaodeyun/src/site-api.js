export async function api(path, body, method) {
  const res = await fetch("/api" + path, {
    credentials: "same-origin",
    ...(body !== undefined
      ? {
          method: method || "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("服务暂时不可用，请稍后重试。");
  }
  if (!res.ok) {
    const error = new Error(data.error || "请求失败，请稍后重试。");
    error.status = res.status;
    throw error;
  }
  return data;
}
export const money = (value, digits = 2) =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format((value || 0) / 1e6);
export const yuan = (cents) => "¥" + ((cents || 0) / 100).toFixed(2);
export const dateTime = (value) =>
  value
    ? new Date(value).toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "—";
export const paymentName = (id) =>
  ({ alipay: "支付宝", wechat: "微信支付" })[id] || id;
export const statusName = (status) =>
  ({
    pending: "待支付",
    paid: "已到账",
    failed: "创建失败",
    complete: "已完成",
    streaming: "处理中",
    stopped: "已停止",
    interrupted: "已中断",
  })[status] || status;
export function safeNext(value) {
  return /^\/(account|billing|checkout|settings|admin)(?:[/?#]|$)/.test(
    value || "",
  )
    ? value
    : "/account";
}
