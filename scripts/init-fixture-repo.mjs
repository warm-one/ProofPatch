#!/usr/bin/env node
/**
 * 把夹具复制成一个真实的 Git 仓库，供 CLI 演示与手工验证使用。
 *
 * 为什么要单独建仓库：fixtures/python-bugfix 是被 Git 跟踪的源文件，
 * 它自己不能再嵌一个 .git（否则父仓库会把它当成 gitlink）。
 *
 * 用法：node scripts/init-fixture-repo.mjs [--out <目录>]
 */
import { execFileSync } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = path.resolve(here, "..", "fixtures", "python-bugfix");

function parseOut(argv) {
  const index = argv.indexOf("--out");
  if (index !== -1 && argv[index + 1]) return path.resolve(argv[index + 1]);
  return path.resolve(here, "..", "test-results", "fixture-repo");
}

function git(cwd, args) {
  return execFileSync("git", ["-c", "core.autocrlf=false", ...args], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
}

async function main() {
  const outDir = parseOut(process.argv.slice(2));

  await rm(outDir, { recursive: true, force: true, maxRetries: 3 });
  await mkdir(outDir, { recursive: true });

  // 只复制被测项目，不复制补丁与 Oracle：它们属于"合约侧"，不应进入被测仓库。
  for (const entry of ["src", "tests", "pyproject.toml"]) {
    await cp(path.join(FIXTURE_ROOT, entry), path.join(outDir, entry), {
      recursive: true,
    });
  }

  git(outDir, ["init", "--quiet", "-b", "main"]);
  git(outDir, ["config", "user.name", "ProofPatch Fixture"]);
  git(outDir, ["config", "user.email", "fixture@proofpatch.local"]);
  git(outDir, ["add", "-A"]);
  git(outDir, ["commit", "--quiet", "-m", "chore: baseline fixture"]);

  const head = git(outDir, ["rev-parse", "HEAD"]).trim();

  console.log("夹具仓库已就绪");
  console.log(`  路径：${outDir}`);
  console.log(`  基线：${head}`);
  console.log("");
  console.log("下一步：");
  console.log(
    `  node bin/proofpatch.mjs verify --repo "${outDir}" --patch fixtures/python-bugfix/patches/honest.diff --oracle fixtures/python-bugfix/oracles/fix-empty-cart.json --python "D:/ana/python.exe"`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
