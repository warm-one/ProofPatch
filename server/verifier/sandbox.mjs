import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { UserFacingError } from "../errors.mjs";
import { sha256Hex } from "./digest.mjs";

const execFileAsync = promisify(execFile);

/**
 * 一次性隔离工作区。
 *
 * 隔离等级刻意保持诚实：这一版是"进程级 + 独立工作树"，
 * 既不是安全沙箱，也没有独立虚拟环境——依赖来自宿主 Python。
 * 这两件事都必须写进 limitations，不能靠名字暗示"已经隔离好了"。
 */
export const ISOLATION_PROFILE = {
  level: "process",
  backend: "tempdir-clone",
  limitations: [
    "候选代码与宿主共用操作系统用户身份",
    "未创建独立虚拟环境，依赖来自宿主已安装的 Python 包",
    "未做网络命名空间隔离，测试仍可访问网络",
    "未做系统调用过滤，恶意代码可读取宿主可读文件",
    "未限制 CPU 与内存总量，只限制单次执行时长",
  ],
};

export function isolationDescriptor() {
  return {
    ...ISOLATION_PROFILE,
    limitations: [...ISOLATION_PROFILE.limitations],
  };
}

async function runGit(args, cwd) {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 32 * 1024 * 1024,
    });
    return stdout.trim();
  } catch (error) {
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? String(error.stderr).trim()
        : "";
    const detail = stderr || (error instanceof Error ? error.message : "git 执行失败");
    throw new UserFacingError(`Git 操作失败（git ${args.join(" ")}）：${detail}`);
  }
}

/**
 * 从仓库的指定 commit 克隆出一个全新工作区。
 * 每次验证都从零开始，而不是"应用补丁再回滚"，避免残留状态污染结论。
 */
export async function createWorkspace({ repoPath, commit, label }) {
  const root = await mkdtemp(path.join(tmpdir(), `proofpatch-${label}-`));
  const treePath = path.join(root, "work");

  try {
    await execFileAsync(
      "git",
      ["clone", "--no-hardlinks", "--quiet", "--no-checkout", repoPath, treePath],
      { windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
    );
    await execFileAsync(
      "git",
      ["checkout", "--quiet", "--detach", commit],
      { cwd: treePath, windowsHide: true },
    );
  } catch (error) {
    await rm(root, { recursive: true, force: true }).catch(() => {});
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? String(error.stderr).trim()
        : "";
    throw new UserFacingError(
      `无法创建隔离工作区：${stderr || (error instanceof Error ? error.message : "克隆失败")}`,
    );
  }

  return { root, treePath, label };
}

export async function disposeWorkspace(workspace) {
  if (!workspace?.root) return;
  try {
    await rm(workspace.root, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    // Windows 上偶发文件占用；残留临时目录不影响本次结论。
  }
}

/** 从 unified diff 文本里提取目标路径，用于应用前的越界检查。 */
export function extractPatchPaths(patchText) {
  const paths = new Set();
  for (const line of patchText.split(/\r?\n/)) {
    if (line.startsWith("+++ ") || line.startsWith("--- ")) {
      const raw = line.slice(4).trim();
      if (raw === "/dev/null") continue;
      const candidate = raw.replace(/^[ab]\//, "");
      if (candidate && !candidate.startsWith("/dev/")) {
        paths.add(path.posix.normalize(candidate));
      }
    }
  }
  return [...paths];
}

/**
 * 应用候选补丁。
 * 先在干净工作树上做纯应用，失败即视为"补丁不可用"，不尝试模糊匹配掩盖问题。
 */
export async function applyPatch(workspace, patchPath) {
  const patchText = await readFile(patchPath, "utf8");
  const declaredPaths = extractPatchPaths(patchText);

  const escaping = declaredPaths.filter(
    (entry) => entry.startsWith("../") || path.posix.isAbsolute(entry),
  );
  if (escaping.length > 0) {
    throw new UserFacingError(
      `补丁包含越界路径，已拒绝应用：${escaping.join(", ")}`,
      400,
      "PATCH_PATH_ESCAPE",
    );
  }

  const patchCopy = path.join(workspace.root, "candidate.patch");
  await writeFile(patchCopy, patchText, "utf8");

  try {
    await execFileAsync(
      "git",
      ["apply", "--whitespace=nowarn", "--recount", patchCopy],
      { cwd: workspace.treePath, windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
    );
  } catch (error) {
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? String(error.stderr).trim()
        : "";
    throw new UserFacingError(
      `候选补丁无法干净应用到基线：${stderr || "git apply 失败"}`,
      400,
      "PATCH_APPLY_FAILED",
    );
  }

  return { declaredPaths, patchText };
}

/** 计算工作树的 Git 树对象哈希，作为"候选代码身份"的可复核标识。 */
export async function computeTreeDigest(workspace) {
  await runGit(["add", "-A"], workspace.treePath);
  const tree = await runGit(["write-tree"], workspace.treePath);
  return `git-tree:${tree}`;
}

/**
 * 列出相对基线 commit 的实际改动路径（以已暂存内容为准）。
 *
 * 必须关掉重命名检测：git 默认会把"删除 + 新增"折叠成一条 rename 记录，
 * 此时 --name-only 只输出目标路径，被挪走的原路径会消失——
 * 而"原路径恰好是受保护测试文件"正是要抓的情况。
 */
export async function listChangedPaths(workspace, baseCommit) {
  const output = await runGit(
    ["diff", "--cached", "--name-only", "--no-renames", baseCommit],
    workspace.treePath,
  );
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

export async function resolveCommit(repoPath, ref) {
  const output = await runGit(["rev-parse", "--verify", `${ref}^{commit}`], repoPath);
  if (!/^[0-9a-f]{7,64}$/i.test(output)) {
    throw new UserFacingError(`无法把 ${ref} 解析为 commit。`);
  }
  return output;
}

/**
 * 会被 pytest / pip 读取的依赖声明文件（仅仓库根目录）。
 * 用来给"环境指纹"补上被测项目的依赖身份：
 * 只有 python/pytest 版本的指纹，无法解释两台机器为何得出不同结论。
 */
const DEPENDENCY_FILES = new Set([
  "pyproject.toml",
  "setup.py",
  "setup.cfg",
  "requirements.txt",
  "requirements-dev.txt",
  "poetry.lock",
  "Pipfile.lock",
  "uv.lock",
  "pdm.lock",
]);

export async function computeDependencyDigest(repoPath, commit) {
  let listing;
  try {
    listing = await runGit(["ls-tree", "--name-only", commit], repoPath);
  } catch {
    return { digest: null, files: [] };
  }

  const files = listing
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter((entry) => DEPENDENCY_FILES.has(entry));

  if (files.length === 0) return { digest: null, files: [] };

  const parts = [];
  for (const file of files) {
    try {
      const content = await runGit(["show", `${commit}:${file}`], repoPath);
      parts.push(`${file}\n${content}`);
    } catch {
      parts.push(`${file}\n<unreadable>`);
    }
  }

  return {
    digest: `sha256:${sha256Hex(parts.join("\n---\n"))}`,
    files,
  };
}
