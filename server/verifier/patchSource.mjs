import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { UserFacingError } from "../errors.mjs";

const execFileAsync = promisify(execFile);

/**
 * 工具自己的产物目录。
 * 它必然出现在 git status 里，但永远不应该被当成"候选代码的一部分"，
 * 否则第一次运行之后，第二次运行就会被自己的回执挡住。
 */
const OWN_ARTIFACT_PREFIXES = [".proofpatch/", ".proofpatch"];

function isOwnArtifact(entry) {
  const normalized = entry.replaceAll("\\", "/");
  return OWN_ARTIFACT_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}

/**
 * 把"工作区当前改动"变成一份可验证的补丁。
 *
 * 为什么不直接用工作区：验证必须在独立副本上进行，
 * 否则测试过程会污染用户代码，而且候选与基线会共享状态。
 *
 * 未跟踪文件刻意不自动纳入：把 .env、构建产物、临时脚本混进补丁，
 * 会让"候选代码"的含义变得不可控。要求用户显式 git add 更安全。
 */
export async function preparePatchFromWorktree({ repoPath, baseRef = "HEAD" }) {
  let status;
  try {
    const result = await execFileAsync(
      "git",
      // 不覆盖 core.autocrlf：让 status / diff / apply 使用同一套行尾规则。
      // 强制 false 会让 autocrlf=true 的仓库把整文件误判为改动。
      ["status", "--porcelain"],
      { cwd: repoPath, encoding: "utf8", windowsHide: true },
    );
    status = result.stdout;
  } catch (error) {
    throw new UserFacingError(
      `无法读取工作区状态：${error instanceof Error ? error.message : "git 失败"}`,
    );
  }

  const lines = status
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .filter((line) => !isOwnArtifact(line.slice(3).trim()));

  const untracked = lines.filter((line) => line.startsWith("??"));

  if (untracked.length > 0) {
    const list = untracked
      .slice(0, 5)
      .map((line) => `  ${line.slice(3)}`)
      .join("\n");
    throw new UserFacingError(
      [
        "工作区有未跟踪文件，它们不会被纳入候选补丁：",
        list,
        untracked.length > 5 ? `  …共 ${untracked.length} 个` : "",
        "",
        "请先 git add 你想要验证的文件，或用 --patch 指定一份补丁。",
      ]
        .filter(Boolean)
        .join("\n"),
      400,
      "UNTRACKED_FILES",
    );
  }

  if (lines.length === 0) {
    throw new UserFacingError(
      "工作区相对基线没有任何改动。请先修改代码，或用 --patch 指定补丁文件。",
      400,
      "NO_CHANGES",
    );
  }

  let diff;
  try {
    const result = await execFileAsync(
      "git",
      // --no-renames：纯重命名在 diff 里没有 ---/+++ 行，会让路径检查看不见。
      // 展开成"删除+新增"后，受保护路径必然出现在补丁文本中。
      ["diff", "--no-renames", baseRef, "--binary", "--"],
      { cwd: repoPath, encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
    );
    diff = result.stdout;
  } catch (error) {
    throw new UserFacingError(
      `无法生成工作区补丁：${error instanceof Error ? error.message : "git diff 失败"}`,
    );
  }

  if (diff.trim() === "") {
    throw new UserFacingError(
      "工作区改动无法生成补丁，可能只包含被忽略的文件。",
      400,
      "EMPTY_DIFF",
    );
  }

  const scratch = await mkdtemp(path.join(tmpdir(), "pp-patch-"));
  const patchPath = path.join(scratch, "worktree.patch");
  await writeFile(patchPath, diff, "utf8");

  const changedFiles = lines
    .map((line) => line.slice(3).trim())
    .filter(Boolean);

  return {
    patchPath,
    source: "worktree",
    changedFiles,
    async dispose() {
      await rm(scratch, { recursive: true, force: true, maxRetries: 3 });
    },
  };
}
