import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { UserFacingError } from "./errors.mjs";

const execFileAsync = promisify(execFile);
const MAX_DIFF_CHARS = 1_500_000;
const MAX_FILES = 100;
const MAX_HUNK_LINES = 1_200;
const MAX_UNTRACKED_FILE_BYTES = 300_000;

async function runGit(args, cwd, options = {}) {
  const { maxBuffer = 12 * 1024 * 1024, timeout = 25_000 } = options;
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer,
      timeout,
      windowsHide: true,
    });
    return stdout;
  } catch (error) {
    const stderr =
      typeof error === "object" && error && "stderr" in error
        ? String(error.stderr).trim()
        : "";
    throw new UserFacingError(
      stderr || "无法执行 Git 命令，请确认已安装 Git 且目录可访问。",
      400,
      "GIT_COMMAND_FAILED",
    );
  }
}

function validateBaseRef(baseRef) {
  const value = String(baseRef || "HEAD").trim();
  if (!value || value.length > 160) {
    throw new UserFacingError("基线引用为空或过长。");
  }
  if (
    value.startsWith("-") ||
    !/^[A-Za-z0-9._/@{}~^:-]+$/.test(value) ||
    value.includes("..")
  ) {
    throw new UserFacingError("基线引用包含不支持的字符。");
  }
  return value;
}

function normalizeDiffPath(rawPath) {
  if (!rawPath || rawPath === "/dev/null") return null;
  let value = String(rawPath).trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1);
  }
  if (value.startsWith("a/") || value.startsWith("b/")) {
    return value.slice(2);
  }
  return value;
}

function parseHunkHeader(header) {
  const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(header);
  if (!match) return null;
  return {
    oldLine: Number(match[1]),
    newLine: Number(match[3]),
  };
}

function parseUnifiedDiff(rawDiff, statusByPath, numstatByPath) {
  const files = [];
  const chunks = rawDiff.split(/^diff --git /m).slice(1);

  for (const chunk of chunks.slice(0, MAX_FILES)) {
    const block = `diff --git ${chunk}`;
    const lines = block.split(/\r?\n/);
    let filePath = null;
    let nextStatus = null;

    for (const line of lines) {
      if (line.startsWith("+++ ")) {
        filePath = normalizeDiffPath(line.slice(4)) ?? filePath;
      } else if (line.startsWith("--- ") && !filePath) {
        filePath = normalizeDiffPath(line.slice(4));
      } else if (line.startsWith("new file mode")) {
        nextStatus = "added";
      } else if (line.startsWith("deleted file mode")) {
        nextStatus = "deleted";
      }
    }

    if (!filePath) continue;

    const hunks = [];
    let currentHunk = null;
    let lineCount = 0;

    for (const line of lines) {
      if (line.startsWith("@@")) {
        const parsedHeader = parseHunkHeader(line);
        if (!parsedHeader) continue;
        currentHunk = {
          header: line,
          lines: [],
          oldLine: parsedHeader.oldLine,
          newLine: parsedHeader.newLine,
        };
        hunks.push(currentHunk);
        continue;
      }

      if (!currentHunk || lineCount >= MAX_HUNK_LINES) continue;
      const prefix = line[0];
      if (prefix === "+" && !line.startsWith("+++")) {
        currentHunk.lines.push({
          type: "add",
          newNumber: currentHunk.newLine,
          content: line.slice(1),
        });
        currentHunk.newLine += 1;
        lineCount += 1;
      } else if (prefix === "-" && !line.startsWith("---")) {
        currentHunk.lines.push({
          type: "remove",
          oldNumber: currentHunk.oldLine,
          content: line.slice(1),
        });
        currentHunk.oldLine += 1;
        lineCount += 1;
      } else if (prefix === " ") {
        currentHunk.lines.push({
          type: "context",
          oldNumber: currentHunk.oldLine,
          newNumber: currentHunk.newLine,
          content: line.slice(1),
        });
        currentHunk.oldLine += 1;
        currentHunk.newLine += 1;
        lineCount += 1;
      }
    }

    const counts = numstatByPath.get(filePath) ?? {
      additions: 0,
      deletions: 0,
    };
    files.push({
      path: filePath,
      status: nextStatus ?? statusByPath.get(filePath) ?? "modified",
      additions: counts.additions,
      deletions: counts.deletions,
      relatedAcceptanceIds: [],
      hunks,
    });
  }

  return files;
}

async function readPackageInfo(rootPath) {
  const packagePath = path.join(rootPath, "package.json");
  try {
    const content = await fs.readFile(packagePath, "utf8");
    const parsed = JSON.parse(content);
    const scripts =
      parsed && typeof parsed.scripts === "object" && parsed.scripts
        ? Object.fromEntries(
            Object.entries(parsed.scripts)
              .filter(([, value]) => typeof value === "string")
              .slice(0, 40),
          )
        : {};

    let packageManager = "npm";
    for (const [file, manager] of [
      ["pnpm-lock.yaml", "pnpm"],
      ["yarn.lock", "yarn"],
      ["bun.lockb", "bun"],
      ["bun.lock", "bun"],
    ]) {
      try {
        await fs.access(path.join(rootPath, file));
        packageManager = manager;
        break;
      } catch {
        // 继续检查下一个锁文件。
      }
    }

    return {
      name: typeof parsed.name === "string" ? parsed.name : null,
      scripts,
      packageManager,
    };
  } catch {
    return { name: null, scripts: {}, packageManager: "npm" };
  }
}

function buildCommandSuggestions(scripts, packageManager) {
  const labels = {
    build: "项目构建",
    test: "运行测试",
    lint: "代码检查",
    typecheck: "类型检查",
    check: "综合检查",
  };
  const priorities = [
    "build",
    "test",
    "lint",
    "typecheck",
    "check",
  ];
  const keys = [
    ...priorities.filter((key) => key in scripts),
    ...Object.keys(scripts).filter((key) => !priorities.includes(key)),
  ].slice(0, 6);

  return keys.map((key) => ({
    title: labels[key] ?? `运行 ${key}`,
    command: `${packageManager} run ${key}`,
    script: key,
  }));
}

async function collectUntracked(rootPath) {
  const output = await runGit(
    ["ls-files", "--others", "--exclude-standard", "-z"],
    rootPath,
  );
  const paths = output.split("\0").filter(Boolean).slice(0, 30);
  const untracked = [];
  const fingerprintParts = [];

  for (const relativePath of paths) {
    const absolutePath = path.join(rootPath, relativePath);
    try {
      const stats = await fs.stat(absolutePath);
      if (!stats.isFile()) continue;
      if (stats.size > MAX_UNTRACKED_FILE_BYTES) {
        untracked.push({
          path: relativePath,
          status: "added",
          additions: 0,
          deletions: 0,
          relatedAcceptanceIds: [],
          hunks: [],
        });
        fingerprintParts.push(`${relativePath}:large:${stats.size}`);
        continue;
      }

      const buffer = await fs.readFile(absolutePath);
      const content = buffer.toString("utf8");
      const binary = content.includes("\u0000");
      const contentLines = binary
        ? []
        : content.split(/\r?\n/).slice(0, 200);
      untracked.push({
        path: relativePath,
        status: "added",
        additions: binary ? 0 : contentLines.length,
        deletions: 0,
        relatedAcceptanceIds: [],
        hunks: binary
          ? []
          : [
              {
                header: `@@ -0,0 +1,${contentLines.length} @@`,
                lines: contentLines.map((line, index) => ({
                  type: "add",
                  newNumber: index + 1,
                  content: line,
                })),
              },
            ],
      });
      fingerprintParts.push(`${relativePath}:${buffer.toString("base64")}`);
    } catch {
      // 单个文件不可读时跳过，不影响仓库检查和其余 diff。
    }
  }

  return { files: untracked, fingerprintParts };
}

export async function inspectRepository(inputPath, requestedBaseRef = "HEAD") {
  if (typeof inputPath !== "string" || !inputPath.trim()) {
    throw new UserFacingError("请填写本地项目目录。");
  }

  const rawPath = inputPath
    .trim()
    .replace(/^"(.*)"$/, "$1")
    .replace(/^'(.*)'$/, "$1")
    .trim();
  if (!path.isAbsolute(rawPath)) {
    throw new UserFacingError("请填写本地项目的绝对路径。");
  }

  const requestedPath = path.resolve(rawPath);
  let realPath;
  try {
    realPath = await fs.realpath(requestedPath);
    const stats = await fs.stat(realPath);
    if (!stats.isDirectory()) {
      throw new Error("not a directory");
    }
  } catch {
    throw new UserFacingError("项目目录不存在或不可访问。");
  }

  let rootPath;
  try {
    const rootOutput = await runGit(
      ["rev-parse", "--show-toplevel"],
      realPath,
    );
    rootPath = await fs.realpath(rootOutput.trim());
  } catch {
    throw new UserFacingError("所选目录不是 Git 仓库。请选择一个已初始化的项目。");
  }

  const baseRef = validateBaseRef(requestedBaseRef);
  try {
    await runGit(
      ["rev-parse", "--verify", "--quiet", `${baseRef}^{commit}`],
      rootPath,
    );
  } catch {
    throw new UserFacingError(`基线引用 “${baseRef}” 不是有效提交。`);
  }

  const [branchRaw, commitRaw, rawDiff, nameStatusRaw, numstatRaw, packageInfo] =
    await Promise.all([
      runGit(["rev-parse", "--abbrev-ref", "HEAD"], rootPath).catch(
        () => "HEAD",
      ),
      runGit(["rev-parse", "--short", "HEAD"], rootPath).catch(() => "UNBORN"),
      runGit(
        [
          "diff",
          "--no-color",
          "--no-ext-diff",
          "--unified=3",
          "--no-renames",
          baseRef,
          "--",
        ],
        rootPath,
        { maxBuffer: 20 * 1024 * 1024 },
      ),
      runGit(
        ["diff", "--name-status", "--no-renames", baseRef, "--"],
        rootPath,
      ),
      runGit(["diff", "--numstat", "--no-renames", baseRef, "--"], rootPath),
      readPackageInfo(rootPath),
    ]);

  const statusByPath = new Map();
  for (const line of nameStatusRaw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [status, ...parts] = line.split("\t");
    const filePath = parts.join("\t");
    if (!filePath) continue;
    const normalized =
      status.startsWith("A")
        ? "added"
        : status.startsWith("D")
          ? "deleted"
          : "modified";
    statusByPath.set(filePath, normalized);
  }

  const numstatByPath = new Map();
  for (const line of numstatRaw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [additions, deletions, ...parts] = line.split("\t");
    const filePath = parts.join("\t");
    if (!filePath) continue;
    numstatByPath.set(filePath, {
      additions: Number(additions) || 0,
      deletions: Number(deletions) || 0,
    });
  }

  const boundedDiff = rawDiff.slice(0, MAX_DIFF_CHARS);
  const trackedFiles = parseUnifiedDiff(
    boundedDiff,
    statusByPath,
    numstatByPath,
  );
  const untracked = await collectUntracked(rootPath);
  const files = [...trackedFiles, ...untracked.files].slice(0, MAX_FILES);

  const fingerprint = createHash("sha1")
    .update(`base:${baseRef}\nhead:${commitRaw.trim()}\nbranch:${branchRaw.trim()}\n`)
    .update(boundedDiff)
    .update(untracked.fingerprintParts.join("\n"))
    .digest("hex");

  const projectName =
    packageInfo.name || path.basename(rootPath) || "local-project";
  const branch = branchRaw.trim() || "HEAD";
  const commit = commitRaw.trim() || "UNBORN";
  const changedPaths = files.map((file) => file.path);

  return {
    project: {
      name: projectName,
      path: rootPath,
      branch,
      baseRef,
      headCommit: commit,
      packageManager: packageInfo.packageManager,
      scripts: packageInfo.scripts,
      commandSuggestions: buildCommandSuggestions(
        packageInfo.scripts,
        packageInfo.packageManager,
      ),
    },
    snapshot: {
      id: "live",
      label: "WORKING TREE",
      displayName: "工作区快照",
      commit,
      createdAt: new Date().toISOString(),
      summary: `${branch} · ${files.length} 个文件相对 ${baseRef} 有差异`,
      changedPaths,
      files,
      fingerprint,
    },
    changedFileCount: files.length,
    truncated: rawDiff.length > MAX_DIFF_CHARS,
  };
}
