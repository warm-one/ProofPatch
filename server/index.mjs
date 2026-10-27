import { createApp } from "./app.mjs";
import { defaultDataDir, SessionStore } from "./store.mjs";
import { WorkspaceService } from "./workspaceService.mjs";

const port = Number(process.env.PROOFPATCH_PORT || 4321);
const host = process.env.PROOFPATCH_HOST || "127.0.0.1";
const dataDir = defaultDataDir();
const store = new SessionStore(dataDir);
await store.init();

const service = new WorkspaceService({
  store,
  timeoutMs: Number(process.env.PROOFPATCH_COMMAND_TIMEOUT_MS || 120_000),
});
const app = createApp({ service, store });

const server = app.listen(port, host, () => {
  console.log("");
  console.log("  ProofPatch local runtime");
  console.log(`  workspace: http://${host}:${port}/connect`);
  console.log(`  homepage:  http://${host}:${port}/`);
  console.log(`  local data: ${dataDir}`);
  console.log("");
});

server.on("error", (error) => {
  if (error && typeof error === "object" && "code" in error) {
    if (error.code === "EADDRINUSE") {
      console.error(
        `端口 ${port} 已被占用。关闭占用进程，或设置 PROOFPATCH_PORT 后重试。`,
      );
      process.exit(1);
    }
  }
  console.error(error);
  process.exit(1);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 2_000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
