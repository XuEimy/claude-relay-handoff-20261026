import Anthropic from "@anthropic-ai/sdk";

// Server-only. Each channel pins its URL and encrypted credential rather than
// inheriting workstation credentials or a different environment's base URL.
export function createClaudeClient(channel, apiKey, env, fetcher) {
  return new Anthropic({
    apiKey,
    baseURL: channel.base_url.replace(/\/+$/, "").replace(/\/v1$/, ""),
    fetch: fetcher,
    timeout: 120000,
    maxRetries: 0,
    logLevel: "off",
    openTelemetry: false,
    defaultHeaders: {
      ...(env.ANTHROPIC_VERSION
        ? { "anthropic-version": env.ANTHROPIC_VERSION }
        : {}),
      ...(env.ANTHROPIC_WORKSPACE_ID
        ? { "anthropic-workspace-id": env.ANTHROPIC_WORKSPACE_ID }
        : {}),
    },
  });
}

// Never send SDK error bodies, request headers, or channel credentials to users.
export function claudeErrorMessage(error) {
  if (error instanceof Anthropic.APIConnectionTimeoutError)
    return "模型回复超时，已保存收到的内容，请稍后再试。";
  if (error instanceof Anthropic.APIError) {
    const type = error.error?.error?.type || error.error?.type;
    if (
      error.status === 429 ||
      error.status === 529 ||
      type === "overloaded_error"
    )
      return "模型服务繁忙，请稍后再试。";
    if (error.status === 401 || error.status === 403)
      return "模型渠道认证失败，请联系管理员检查接口配置。";
    if (error.status === 404)
      return "所选模型或接口地址不可用，请联系管理员检查配置。";
    if (error.status === 400 || error.status === 413)
      return "模型无法处理本次请求，请缩短对话或联系管理员检查模型配置。";
  }
  return "模型连接中断，已保存收到的回复，请稍后再试。";
}
