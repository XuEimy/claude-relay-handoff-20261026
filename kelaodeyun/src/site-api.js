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
