import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  plugins: [cloudflareTest({
    main: "./worker/index.js",
    wrangler: { configPath: "./tests/wrangler.jsonc" },
    miniflare: { bindings: {
      PUBLIC_ORIGIN: "http://localhost:8787",
      ADMIN_EMAILS: "admin@example.com",
      GOOGLE_CLIENT_ID: "test-client",
      GOOGLE_CLIENT_SECRET: "test-secret",
      STRIPE_SECRET_KEY: "sk_live_dummy",
      STRIPE_WEBHOOK_SECRET: "whsec_test",
      CREDENTIALS_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      CONTABO_CLIENT_ID: "test-client",
      CONTABO_CLIENT_SECRET: "test-secret",
      CONTABO_API_USER: "test-user",
      CONTABO_API_PASSWORD: "test-password",
      CONTABO_MODE: "live",
      CONTABO_IMAGE_ID: "afecbb85-e2fc-46f0-9684-b46b1faf00bb"
    } }
  })],
  test: { include: ["tests/workers.test.mjs"] }
});
