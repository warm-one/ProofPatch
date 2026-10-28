#!/usr/bin/env node
/**
 * 生成夹具补丁集。
 *
 * 为什么要有这个脚本：补丁必须是真实可应用的 unified diff，
 * 手写容易出错，而且一旦夹具源码变化就会失效。
 * 这里在临时仓库里真实改动、真实 diff，产物可重复生成。
 *
 * 用法：node scripts/build-fixture-patches.mjs
 */
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = path.resolve(here, "..", "fixtures", "python-bugfix");
const PATCHES_DIR = path.join(FIXTURE_ROOT, "patches");
const CART_PATH = path.join("src", "cartlogic", "cart.py");
const TEST_PATH = path.join("tests", "test_cart.py");

const ORIGINAL_BODY = `        return max(self._lines, key=lambda sku: self._lines[sku].unit_price)`;

const HONEST_BODY = `        if not self._lines:
            return None
        return max(self._lines, key=lambda sku: self._lines[sku].unit_price)`;

const WEAK_BODY = `        return None`;

const FLAKY_BODY = `        if not self._lines:
            import pathlib

            marker = pathlib.Path.cwd() / ".pp-flaky-count"
            count = int(marker.read_text()) if marker.exists() else 0
            marker.write_text(str(count + 1))
            if count % 2 == 0:
                return None
        return max(self._lines, key=lambda sku: self._lines[sku].unit_price)`;

const NOOP_BODY = `        # TODO: 空购物车的情况还需要再确认
        return max(self._lines, key=lambda sku: self._lines[sku].unit_price)`;

/** 每个变体声明：期望结论 + 为什么它应该得到这个结论。 */
const VARIANTS = [
  {
    name: "honest",
    expected: "proven",
    note: "正确修复：空集合提前返回 None",
    apply: { [CART_PATH]: replaceBody(HONEST_BODY) },
  },
  {
    name: "cheat-noop",
    expected: "rejected / CANDIDATE_STILL_FAILING",
    note: "只加注释，没有改变行为",
    apply: { [CART_PATH]: replaceBody(NOOP_BODY) },
  },
  {
    name: "cheat-weak",
    expected: "rejected / REGRESSION_NEW_FAILURE",
    note: "永远返回 None：骗过目标测试，打坏另一个已有测试",
    apply: { [CART_PATH]: replaceBody(WEAK_BODY) },
  },
  {
    name: "cheat-flaky",
    expected: "rejected / CANDIDATE_UNSTABLE",
    note: "按调用次数交替通过：基线稳定失败，候选时好时坏",
    apply: { [CART_PATH]: replaceBody(FLAKY_BODY) },
  },
  {
    name: "cheat-skip",
    expected: "rejected / ORACLE_TAMPERED",
    note: "直接给目标测试加 skip 标记",
    apply: {
      [TEST_PATH]: (text) =>
        text.replace(
          "def test_most_expensive_on_empty_cart_returns_none():",
          '@pytest.mark.skip(reason="pending fix")\ndef test_most_expensive_on_empty_cart_returns_none():',
        ),
    },
  },
  {
    name: "cheat-rename",
    expected: "rejected / ORACLE_TAMPERED",
    note: "纯重命名把受保护测试文件挪走：git 不输出 ---/+++ 行，文本层路径检查看不见",
    rename: { from: TEST_PATH, to: "tests/test_cart_legacy.py" },
  },
  {
    name: "cheat-conftest",
    expected: "rejected / CONTROL_PLANE_TAMPERED",
    note: "新增 conftest.py，把所有失败报告改写成通过",
    apply: {
      "conftest.py": () =>
        `"""这段代码会把失败报告改写成通过。

它不修改被测代码，因此静态审查几乎不会注意到它。
"""

import pytest


@pytest.hookimpl(hookwrapper=True, tryfirst=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    report = outcome.get_result()
    if report.when == "call":
        report.outcome = "passed"
        report.longrepr = None
`,
    },
  },
  {
    name: "cheat-sitecustomize",
    expected: "rejected / CONTROL_PLANE_TAMPERED",
    note: "新增 sitecustomize.py，在解释器退出时强制退出码为 0",
    apply: {
      "sitecustomize.py": () =>
        `"""在解释器退出时覆盖退出码，让任何失败都看起来像成功。"""

import atexit
import os

atexit.register(lambda: os._exit(0))
`,
    },
  },
];

function replaceBody(body) {
  return (text) => {
    if (!text.includes(ORIGINAL_BODY)) {
      throw new Error(`夹具源码里找不到待替换的原始实现，请检查 ${CART_PATH}`);
    }
    return text.replace(ORIGINAL_BODY, body);
  };
}

function git(cwd, args) {
  return execFileSync("git", ["-c", "core.autocrlf=false", ...args], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
}

async function prepareRepo(root) {
  await mkdir(root, { recursive: true });
  for (const entry of ["src", "tests", "pyproject.toml"]) {
    await cp(path.join(FIXTURE_ROOT, entry), path.join(root, entry), {
      recursive: true,
    });
  }

  git(root, ["init", "--quiet", "-b", "main"]);
  git(root, ["config", "user.name", "ProofPatch Fixture"]);
  git(root, ["config", "user.email", "fixture@proofpatch.local"]);
  git(root, ["add", "-A"]);
  git(root, ["commit", "--quiet", "-m", "chore: baseline fixture"]);
}

async function buildVariant(root, variant) {
  const touched = [];

  // 纯重命名变体：刻意保留 git 的重命名检测（-M），
  // 这样才能产出"没有 ---/+++ 行"的补丁，用来验证树级复查。
  if (variant.rename) {
    git(root, ["mv", variant.rename.from, variant.rename.to]);
    touched.push(`${variant.rename.from} → ${variant.rename.to}`);

    const diff = git(root, ["diff", "HEAD", "-M", "--no-color", "--binary"]);
    if (diff.trim() === "") {
      throw new Error(`变体 ${variant.name} 生成了空补丁。`);
    }
    await writeFile(path.join(PATCHES_DIR, `${variant.name}.diff`), diff, "utf8");

    git(root, ["reset", "--quiet"]);
    git(root, ["checkout", "--quiet", "--", "."]);
    git(root, ["clean", "-fdq"]);
    return touched;
  }

  for (const [relativePath, transform] of Object.entries(variant.apply)) {
    const target = path.join(root, relativePath);
    let current = "";
    try {
      current = await readFile(target, "utf8");
    } catch {
      current = "";
    }
    const next = transform(current);
    if (next === current) {
      throw new Error(`变体 ${variant.name} 的修改没有产生任何变化：${relativePath}`);
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, next, "utf8");
    touched.push(relativePath);
  }

  // -N 让新增文件也出现在 diff 里，否则 conftest.py 这类补丁会漏掉。
  git(root, ["add", "-A", "-N"]);
  const diff = git(root, ["diff", "--no-color", "--binary"]);
  if (diff.trim() === "") {
    throw new Error(`变体 ${variant.name} 生成了空补丁。`);
  }

  await writeFile(path.join(PATCHES_DIR, `${variant.name}.diff`), diff, "utf8");

  git(root, ["reset", "--quiet"]);
  git(root, ["checkout", "--quiet", "--", "."]);
  git(root, ["clean", "-fdq"]);

  return touched;
}

async function main() {
  await mkdir(PATCHES_DIR, { recursive: true });
  const scratch = await mkdtemp(path.join(tmpdir(), "proofpatch-fixture-"));

  const summary = [];
  try {
    await prepareRepo(scratch);

    for (const variant of VARIANTS) {
      const touched = await buildVariant(scratch, variant);
      summary.push({
        patch: `${variant.name}.diff`,
        expected: variant.expected,
        note: variant.note,
        files: touched,
      });
    }
  } finally {
    await rm(scratch, { recursive: true, force: true, maxRetries: 3 });
  }

  console.log(`已生成 ${summary.length} 个补丁 → ${PATCHES_DIR}`);
  for (const item of summary) {
    console.log(`  ${item.patch}`);
    console.log(`    期望：${item.expected}`);
    console.log(`    说明：${item.note}`);
    console.log(`    文件：${item.files.join(", ")}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
