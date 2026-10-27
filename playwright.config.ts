import { defineConfig } from "@playwright/test";

/**
 * 本地演示项目使用 Windows 自带的 Edge 运行端到端测试。
 * 其他环境可通过 PLAYWRIGHT_CHANNEL 指定已安装的 Chromium 渠道。
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
