import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { preview } from "vite";

/**
 * 先启动 Vite 生产预览，再运行 Playwright。
 * 这样测试不依赖 Playwright 的 HTTP 探活，也不会受本机代理环境干扰。
 */
const server = await preview({
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
});

const playwrightCli = fileURLToPath(
  new URL("../node_modules/@playwright/test/cli.js", import.meta.url),
);

const exitCode = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [playwrightCli, "test"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: {
      ...process.env,
      NO_PROXY: "127.0.0.1,localhost",
      no_proxy: "127.0.0.1,localhost",
    },
    stdio: "inherit",
  });

  child.on("error", reject);
  child.on("close", (code) => resolve(code ?? 1));
});

await new Promise((resolve) => server.httpServer.close(resolve));
process.exit(exitCode);
