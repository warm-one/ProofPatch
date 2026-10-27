import { spawn } from "node:child_process";
import { UserFacingError } from "./errors.mjs";

const MAX_OUTPUT_CHARS = 300_000;
const activeRuns = new Map();

function stripAnsi(value) {
  return value.replace(
    // eslint-disable-next-line no-control-regex
    /\u001b\[[0-?]*[ -/]*[@-~]/g,
    "",
  );
}

function killProcessTree(child) {
  if (!child || !child.pid) return;

  if (process.platform === "win32") {
    const killer = spawn(
      "taskkill",
      ["/PID", String(child.pid), "/T", "/F"],
      { windowsHide: true, stdio: "ignore" },
    );
    killer.on("error", () => {
      child.kill();
    });
    return;
  }

  child.kill("SIGTERM");
  const timer = setTimeout(() => {
    try {
      child.kill("SIGKILL");
    } catch {
      // 进程可能已自行退出。
    }
  }, 1_500);
  timer.unref?.();
}

/**
 * 执行一次由用户确认过的本地命令。
 * 不读取凭据、不改写命令；输出只保存在用户本机的会话文件里。
 */
export function executeCommand(sessionId, command, cwd, timeoutMs = 120_000) {
  if (activeRuns.has(sessionId)) {
    throw new UserFacingError(
      "这个会话已有检查正在执行，请等待结束或先中止。",
      409,
      "RUN_IN_PROGRESS",
    );
  }

  const startedAt = new Date();
  const chunks = [];
  let outputLength = 0;
  let truncated = false;

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, {
        cwd,
        shell: true,
        windowsHide: true,
        env: {
          ...process.env,
          CI: "1",
          FORCE_COLOR: "0",
          NO_COLOR: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      resolve({
        output:
          error instanceof Error ? error.message : "命令无法启动",
        exitCode: null,
        signal: null,
        timedOut: false,
        interrupted: false,
        durationMs: 0,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
      });
      return;
    }

    const record = {
      child,
      interrupted: false,
      timedOut: false,
    };
    activeRuns.set(sessionId, record);

    const append = (data) => {
      if (outputLength >= MAX_OUTPUT_CHARS) {
        truncated = true;
        return;
      }
      const text = String(data);
      const remaining = MAX_OUTPUT_CHARS - outputLength;
      const sliced = text.slice(0, remaining);
      chunks.push(sliced);
      outputLength += sliced.length;
      if (sliced.length < text.length) truncated = true;
    };

    child.stdout?.on("data", append);
    child.stderr?.on("data", append);

    const timer = setTimeout(() => {
      record.timedOut = true;
      killProcessTree(child);
    }, timeoutMs);
    timer.unref?.();

    let settled = false;
    const finish = (exitCode, signal, errorMessage) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      activeRuns.delete(sessionId);

      let output = stripAnsi(chunks.join(""));
      if (truncated) {
        output += "\n\n[输出已截断，仅保留前 300000 个字符]";
      }
      if (errorMessage) {
        output += `\n\n[执行错误] ${errorMessage}`;
      }

      resolve({
        output,
        exitCode,
        signal,
        timedOut: record.timedOut,
        interrupted: record.interrupted,
        durationMs: Date.now() - startedAt.getTime(),
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
      });
    };

    child.on("error", (error) => finish(null, null, error.message));
    child.on("close", (code, signal) => finish(code, signal));
  });
}

export function isSessionRunning(sessionId) {
  return activeRuns.has(sessionId);
}

export function interruptSession(sessionId) {
  const active = activeRuns.get(sessionId);
  if (!active) return false;
  active.interrupted = true;
  killProcessTree(active.child);
  return true;
}
