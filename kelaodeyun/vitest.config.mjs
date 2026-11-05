import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  plugins: [cloudflareTest({
    main: "./worker/index.js",
    wrangler: { configPath: "./wrangler.jsonc" },
    miniflare: { bindings: {
      PUBLIC_ORIGIN: "http://localhost:8787",
      ADMIN_EMAILS: "admin@example.com",
      GOOGLE_CLIENT_ID: "test-client",
      GOOGLE_CLIENT_SECRET: "test-secret",
      STRIPE_SECRET_KEY: "sk_test_dummy",
      STRIPE_WEBHOOK_SECRET: "whsec_test",
      HOSTINGER_API_TOKEN: "test-token",
      HOSTINGER_TEMPLATE_ID: "123"
    } }
  })],
  test: { include: ["tests/workers.test.mjs"] }
});
