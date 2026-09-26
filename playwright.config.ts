import { defineConfig } from "@playwright/test";

// End-to-end demo flow against the real stack (API + game server + web client).
// Uses the dev database from .env with SOLANA_MOCK=true. Run: pnpm test:e2e
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  workers: 1,
  use: {
    baseURL: "http://localhost:5173",
    viewport: { width: 1600, height: 900 },
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
      args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
    },
    screenshot: "only-on-failure",
  },
  webServer: [
    { command: "pnpm dev:api", url: "http://localhost:3000/health", reuseExistingServer: true, timeout: 60_000, env: { SOLANA_MOCK: "true", DEV_BOTS: "4" } },
    { command: "pnpm dev:game", url: "http://localhost:2567/health", reuseExistingServer: true, timeout: 60_000, env: { SOLANA_MOCK: "true", DEV_BOTS: "4" } },
    { command: "pnpm dev:web", url: "http://localhost:5173", reuseExistingServer: true, timeout: 60_000 },
  ],
});
