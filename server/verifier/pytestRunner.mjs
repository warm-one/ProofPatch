import { spawn } from "node:child_process";
import { UserFacingError } from "../errors.mjs";
import { digestOfText } from "./digest.mjs";

/**
 * pytest 执行层。
 *
 * 这里最重要的职责不是"跑命令"，而是把结果分类到四态：
 *   pass / fail / error / missing
 *
 * 为什么要分这么细：基线的"预期失败"必须是"测试断言失败"。
 * 如果测试节点不存在、导入报错、夹具错误也一律算"失败"，
 * 那么一个根本不存在的测试就能伪造"bug 已复现"，整个结论就废了。
 */

const DEFAULT_TIMEOUT_MS = 120_000;
const TAIL_CHARS = 4_000;

/** 这些环境变量会改变 pytest 行为，必须在受控执行里清空。 */
const SANITIZED_ENV_KEYS = [
  "PYTEST_ADDOPTS",
  "PYTEST_CURRENT_TEST",
  "PYTEST_PLUGINS",
  "PYTHONSTARTUP",
];

function buildEnv() {
  const env = { ...process.env };
  for (const key of SANITIZED_ENV_KEYS) delete env[key];
  return {
    ...env,
    CI: "1",
    FORCE_COLOR: "0",
    NO_COLOR: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONUNBUFFERED: "1",
  };
}

function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

/** 直接拉起可执行文件，不经过 shell：参数是我们构造的数组，不拼接字符串。 */
function runProcess(executable, args, { cwd, timeoutMs }) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const chunks = [];
    let timedOut = false;
    let settled = false;
    let child;

    try {
      child = spawn(executable, args, {
        cwd,
        env: buildEnv(),
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      resolve({
        exitCode: null,
        output: error instanceof Error ? error.message : "进程无法启动",
        durationMs: 0,
        timedOut: false,
        spawnFailed: true,
      });
      return;
    }

    child.stdout?.on("data", (data) => chunks.push(String(data)));
    child.stderr?.on("data", (data) => chunks.push(String(data)));

    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === "win32") {
        spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        }).on("error", () => child.kill());
      } else {
        child.kill("SIGKILL");
      }
    }, timeoutMs);

    const finish = (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode,
        output: stripAnsi(chunks.join("")),
        durationMs: Date.now() - startedAt,
        timedOut,
        spawnFailed: false,
      });
    };

    child.on("error", () => finish(null));
    child.on("close", (code) => finish(code));
  });
}

/**
 * 找一个真正装了 pytest 的 Python。
 * 顺序：显式指定 → 环境变量 → PATH 上的常见入口。
 * 逐个探测而不是假定第一个可用，因为 Windows 上 `python` 常常指向无关解释器。
 */
export async function resolvePython(preferred) {
  const candidates = [];
  if (preferred) candidates.push(preferred);
  if (process.env.PROOFPATCH_PYTHON) {
    candidates.push(process.env.PROOFPATCH_PYTHON);
  }
  candidates.push("python3", "python", "py");

  const attempts = [];

  for (const candidate of candidates) {
    const probe = await runProcess(
      candidate,
      [
        "-c",
        "import json,sys,pytest;print(json.dumps({'python':sys.version.split()[0],'pytest':pytest.__version__}))",
      ],
      { cwd: process.cwd(), timeoutMs: 20_000 },
    );

    if (probe.exitCode === 0) {
      try {
        const info = JSON.parse(probe.output.trim().split("\n").pop());
        return {
          executable: candidate,
          pythonVersion: String(info.python),
          pytestVersion: String(info.pytest),
        };
      } catch {
        attempts.push(`${candidate}: 输出无法解析`);
        continue;
      }
    }

    attempts.push(
      `${candidate}: 不可用或未安装 pytest${probe.timedOut ? "（探测超时）" : ""}`,
    );
  }

  throw new UserFacingError(
    [
      "找不到可用的 Python + pytest 环境。",
      "请用 --python 指定解释器，或设置环境变量 PROOFPATCH_PYTHON。",
      "",
      "已尝试：",
      ...attempts.map((line) => `- ${line}`),
    ].join("\n"),
    400,
    "PYTHON_UNAVAILABLE",
  );
}

/** 从输出尾部提取 pytest 的汇总行区域，避免正文里的 "failed" 造成误判。 */
function summaryRegion(output) {
  const lines = output.split(/\r?\n/).filter((line) => line.trim() !== "");
  return lines.slice(-12).join("\n");
}

function countInSummary(output, pattern) {
  const region = summaryRegion(output);
  const match = region.match(pattern);
  return match ? Number(match[1]) : 0;
}

/**
 * 把一次单目标执行归类。
 * missing 与 error 都必须与 fail 严格分开：
 * 只有 fail 才可能构成"基线复现了目标失败"。
 */
export function classifyTargetRun(result) {
  if (result.timedOut) return "timeout";
  if (result.spawnFailed) return "error";

  const output = result.output ?? "";
  const failed = countInSummary(output, /(\d+)\s+failed/);
  const errors = countInSummary(output, /(\d+)\s+errors?\b/);
  const passed = countInSummary(output, /(\d+)\s+passed/);
  const noTests = /no tests ran/i.test(summaryRegion(output));

  if (noTests || result.exitCode === 5) return "missing";
  if (result.exitCode === 0) return passed > 0 ? "pass" : "missing";
  if (errors > 0 && failed === 0) return "error";
  if (failed > 0 && errors === 0) return "fail";
  if (failed > 0 && errors > 0) return "error";
  if (result.exitCode === 1) return "fail";
  return "error";
}

/**
 * 跑单个目标测试节点。
 * 参数全部是数组元素，命令内容不经过 shell 解释。
 */
export async function runTargetTest({
  pythonExecutable,
  cwd,
  testId,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const result = await runProcess(
    pythonExecutable,
    [
      "-m",
      "pytest",
      testId,
      "-q",
      "--tb=line",
      "--no-header",
      "-p",
      "no:cacheprovider",
    ],
    { cwd, timeoutMs },
  );

  const outcome = classifyTargetRun(result);
  const summaryLine =
    result.output
      .split(/\r?\n/)
      .filter((line) => line.trim() !== "")
      .slice(-1)[0] ?? "";

  return {
    outcome,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    summaryLine: summaryLine.slice(0, 200),
    outputDigest: digestOfText(result.output),
    outputTail: result.output.slice(-TAIL_CHARS),
  };
}

/** 从回归输出里提取失败与错误的节点 ID，用于"是否引入新问题"的比对。 */
function extractProblemNodes(output) {
  const failed = [];
  const errored = [];

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("FAILED ")) {
      failed.push(trimmed.slice("FAILED ".length).split(" - ")[0].trim());
    } else if (trimmed.startsWith("ERROR ")) {
      errored.push(trimmed.slice("ERROR ".length).split(" - ")[0].trim());
    }
  }

  return { failed, errored };
}

/**
 * 跑回归范围。
 * 节点 ID 先做归一化（去掉参数化后缀），这样基线失败与候选失败能对齐比较。
 */
export async function runRegression({
  pythonExecutable,
  cwd,
  scope,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  if (!Array.isArray(scope) || scope.length === 0) {
    return { status: "not-run", failed: [], errored: [], outputTail: "" };
  }

  const result = await runProcess(
    pythonExecutable,
    [
      "-m",
      "pytest",
      ...scope,
      "-q",
      "--tb=no",
      "--no-header",
      "-p",
      "no:cacheprovider",
    ],
    { cwd, timeoutMs },
  );

  const { failed, errored } = extractProblemNodes(result.output);
  const collectionBroken =
    result.exitCode === 2 ||
    result.exitCode === 3 ||
    result.exitCode === 4 ||
    (result.exitCode === 5 && failed.length === 0 && errored.length === 0);

  return {
    status: collectionBroken ? "error" : "ok",
    exitCode: result.exitCode,
    failed,
    errored,
    outputTail: result.output.slice(-TAIL_CHARS),
    outputDigest: digestOfText(result.output),
    durationMs: result.durationMs,
  };
}

/** 归一化节点 ID：去掉 `[param]` 后缀，比较"同一批测试"而不是同一批参数。 */
export function normalizeNodeId(nodeId) {
  return nodeId.replace(/\[[^\]]*\]$/, "");
}
