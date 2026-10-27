import { spawnSync } from "node:child_process";

/**
 * 测试专用：找一个真正装了 pytest 的解释器。
 *
 * 开发机上的默认 `python` 通常没有 pytest，而 Anaconda 自带环境有。
 * 这里先看环境变量，再看本机常见安装位置，最后才退回 PATH。
 * CI 或换机器时应显式设置 PROOFPATCH_PYTHON，而不是依赖这些提示路径。
 */
const LOCAL_HINTS = [
  process.env.PROOFPATCH_PYTHON,
  // Anaconda 在这台开发机上装在 D:/ana；仅作为本地便利，不参与产品逻辑。
  "D:/ana/python.exe",
  "python",
  "python3",
  "py",
];

function probe(executable) {
  const result = spawnSync(
    executable,
    ["-c", "import pytest;print(pytest.__version__)"],
    { encoding: "utf8", windowsHide: true, timeout: 20_000 },
  );
  if (result.status !== 0) return null;
  const version = (result.stdout ?? "").trim().split(/\r?\n/).pop();
  return version ? { executable, pytestVersion: version } : null;
}

export function findTestPython() {
  for (const candidate of LOCAL_HINTS) {
    if (!candidate) continue;
    const found = probe(candidate);
    if (found) return found;
  }
  return null;
}

export const TEST_PYTHON = findTestPython();
