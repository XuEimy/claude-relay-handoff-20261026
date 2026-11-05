import { storeFor } from "./utils.js";
export { Store } from "./store.js";
export { ProvisionServer, TeardownServer } from "./workflows.js";

export default {
  async fetch(request, env) {
    const response = new URL(request.url).pathname.startsWith("/api/") ? await storeFor(env).fetch(request) : await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "same-origin");
    headers.set("X-Frame-Options", "DENY");
    headers.set("Content-Security-Policy", "frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
};
