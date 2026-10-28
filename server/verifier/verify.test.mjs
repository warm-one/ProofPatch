import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCheck } from "./check.mjs";
import { verifyPatch } from "./index.mjs";
import { replayReceipt } from "./replay.mjs";
import { verifyReceipt } from "./receipt.mjs";
import { TEST_PYTHON } from "./testPython.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = path.resolve(here, "..", "..", "fixtures", "python-bugfix");
const ORACLE = path.join(FIXTURE_ROOT, "oracles", "fix-empty-cart.json");
const PATCHES = path.join(FIXTURE_ROOT, "patches");

function git(args, cwd) {
  return execFileSync("git", ["-c", "core.autocrlf=false", ...args], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
}

let scratch = null;
let repoDir = null;

beforeAll(async () => {
  scratch = await mkdtemp(path.join(tmpdir(), "pp-verify-"));
  repoDir = path.join(scratch, "repo");

  for (const entry of ["src", "tests", "pyproject.toml"]) {
    await cp(path.join(FIXTURE_ROOT, entry), path.join(repoDir, entry), {
      recursive: true,
    });
  }

  git(["init", "--quiet", "-b", "main"], repoDir);
  git(["config", "user.name", "ProofPatch Test"], repoDir);
  git(["config", "user.email", "test@proofpatch.local"], repoDir);
  git(["add", "-A"], repoDir);
  git(["commit", "--quiet", "-m", "baseline"], repoDir);
});

afterAll(async () => {
  if (scratch) await rm(scratch, { recursive: true, force: true, maxRetries: 3 });
});

function verify(patchName, overrides = {}) {
  return verifyPatch({
    repoPath: repoDir,
    baseRef: "HEAD",
    patchPath: path.join(PATCHES, `${patchName}.diff`),
    oraclePath: ORACLE,
    repeats: 2,
    python: TEST_PYTHON.executable,
    timeoutMs: 60_000,
    ...overrides,
  });
}

// 没有 pytest 环境时跳过端到端用例，而不是给出一个假的通过。
describe.skipIf(!TEST_PYTHON)("端到端证明流程", () => {
  it(
    "诚实补丁被证明，且回执自校验通过",
    async () => {
      const { receipt, validation, exitCode } = await verify("honest");

      expect(receipt.verdict).toBe("proven");
      expect(receipt.reason.code).toBe("PROVEN_FAIL_TO_PASS");
      expect(exitCode).toBe(0);
      expect(validation.valid).toBe(true);

      // 基线必须是真的失败，候选必须是真的通过。
      const baseline = receipt.trials.filter((t) => t.phase === "baseline");
      const candidate = receipt.trials.filter((t) => t.phase === "candidate");
      expect(baseline.length).toBe(2);
      expect(baseline.every((t) => t.outcome === "fail")).toBe(true);
      expect(candidate.every((t) => t.outcome === "pass")).toBe(true);

      expect(receipt.subject.patchedTree).toMatch(/^git-tree:[0-9a-f]{40,64}$/);
      expect(receipt.environment.isolation.level).toBe("process");
      // 隔离声明必须与实际实现一致：本版没有独立虚拟环境，就不能这么写。
      expect(receipt.environment.isolation.backend).toBe("tempdir-clone");
      expect(receipt.environment.isolation.limitations.join(" ")).toContain(
        "未创建独立虚拟环境",
      );
      // 环境指纹必须包含被测项目的依赖身份，否则同指纹不同环境无法解释。
      expect(receipt.environment.dependencies.files).toContain("pyproject.toml");
      expect(receipt.environment.dependencies.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(receipt.unproven.join(" ")).toContain("未按依赖清单重建环境");
      expect(receipt.unproven.length).toBeGreaterThan(0);
    },
    180_000,
  );

  it(
    "只加注释的补丁不会被当成修复",
    async () => {
      const { receipt, exitCode } = await verify("cheat-noop");
      expect(receipt.verdict).toBe("rejected");
      expect(receipt.reason.code).toBe("CANDIDATE_STILL_FAILING");
      expect(exitCode).toBe(1);
    },
    180_000,
  );

  it(
    "骗过目标测试但打坏其他测试的补丁被回归拦下",
    async () => {
      const { receipt, exitCode } = await verify("cheat-weak");

      expect(receipt.verdict).toBe("rejected");
      expect(receipt.reason.code).toBe("REGRESSION_NEW_FAILURE");
      expect(exitCode).toBe(1);

      // 关键事实：它的目标测试确实"通过"了，只有回归能揭示问题。
      const candidate = receipt.trials.filter((t) => t.phase === "candidate");
      expect(candidate.every((t) => t.outcome === "pass")).toBe(true);
      expect(receipt.regression.newFailures.length).toBeGreaterThan(0);
    },
    180_000,
  );

  it(
    "修改受保护测试文件的补丁在执行前就被拒绝",
    async () => {
      const { receipt, exitCode } = await verify("cheat-skip");

      expect(receipt.verdict).toBe("rejected");
      expect(receipt.reason.code).toBe("ORACLE_TAMPERED");
      expect(exitCode).toBe(1);

      // 短路应当发生在任何测试执行之前。
      expect(receipt.trials.every((t) => t.outcome === "skipped")).toBe(true);
    },
    180_000,
  );

  it(
    "修改测试控制面的补丁在执行前就被拒绝",
    async () => {
      const { receipt } = await verify("cheat-conftest");
      expect(receipt.reason.code).toBe("CONTROL_PLANE_TAMPERED");
      expect(receipt.trials.every((t) => t.outcome === "skipped")).toBe(true);
      // 短路回执没有树哈希，用的是显式哨兵值；它仍然必须能通过自校验。
      expect(receipt.subject.patchedTree).toBe("git-tree:not-computed");
      expect(verifyReceipt(receipt).valid).toBe(true);
    },
    180_000,
  );

  it(
    "纯重命名挪走受保护测试文件，在应用后按真实树拦下",
    async () => {
      // 这类补丁没有 ---/+++ 行，文本层路径检查看到的是空数组，
      // 只有"以 git apply 之后的真实树为准"这一层能抓住。
      const { receipt } = await verify("cheat-rename");

      expect(receipt.verdict).toBe("rejected");
      expect(receipt.reason.code).toBe("ORACLE_TAMPERED");
      // 一个进程都不该启动：候选阶段没有任何 trial。
      expect(receipt.trials.filter((t) => t.phase === "candidate")).toHaveLength(0);
      // 回执里要能看到真实改动路径（被挪走的原路径）。
      expect(receipt.subject.patch.declaredPaths).toContain("tests/test_cart.py");
    },
    180_000,
  );

  it(
    "验证过程不修改被测仓库",
    async () => {
      const before = git(["status", "--porcelain"], repoDir);
      await verify("honest");
      const after = git(["status", "--porcelain"], repoDir);
      expect(after).toBe(before);
      expect(after.trim()).toBe("");
    },
    180_000,
  );

  it(
    "回执内容被改动后自校验失败",
    async () => {
      const { receipt } = await verify("honest");
      const tampered = {
        ...receipt,
        verdict: "rejected",
      };
      const result = verifyReceipt(tampered);
      expect(result.valid).toBe(false);
    },
    180_000,
  );

  it(
    "回执可以被独立重放，且重放结论与原回执一致",
    async () => {
      const { receipt } = await verify("honest");
      const receiptPath = path.join(scratch, "replay-receipt.json");
      await writeFile(receiptPath, JSON.stringify(receipt, null, 2), "utf8");

      const result = await replayReceipt({
        receiptPath,
        repoPath: repoDir,
        patchPath: path.join(PATCHES, "honest.diff"),
        python: TEST_PYTHON.executable,
        timeoutMs: 60_000,
      });

      expect(result.consistent).toBe(true);
      expect(result.differences).toEqual([]);
      expect(result.replayed.verdict).toBe(receipt.verdict);
      expect(result.replayed.subject.patchedTree).toBe(receipt.subject.patchedTree);
    },
    180_000,
  );

  it(
    "拿另一份补丁重放会被拒绝",
    async () => {
      const { receipt } = await verify("honest");
      const receiptPath = path.join(scratch, "replay-mismatch.json");
      await writeFile(receiptPath, JSON.stringify(receipt, null, 2), "utf8");

      await expect(
        replayReceipt({
          receiptPath,
          repoPath: repoDir,
          patchPath: path.join(PATCHES, "cheat-noop.diff"),
          python: TEST_PYTHON.executable,
        }),
      ).rejects.toThrow(/不是同一份/);
    },
    180_000,
  );

  it(
    "基线只有执行错误时，发现阶段直接拒绝而不是冻结注定无解的契约",
    async () => {
      const brokenRepo = path.join(scratch, "broken-repo");
      await mkdir(path.join(brokenRepo, "tests"), { recursive: true });
      await writeFile(
        path.join(brokenRepo, "tests", "test_broken.py"),
        "def test_needs_missing_fixture(missing_fixture):\n    assert True\n",
        "utf8",
      );
      git(["init", "--quiet", "-b", "main"], brokenRepo);
      git(["config", "user.name", "ProofPatch Test"], brokenRepo);
      git(["config", "user.email", "test@proofpatch.local"], brokenRepo);
      git(["add", "-A"], brokenRepo);
      git(["commit", "--quiet", "-m", "broken"], brokenRepo);

      await expect(
        runCheck({
          repoPath: brokenRepo,
          repeats: 1,
          python: TEST_PYTHON.executable,
          assumeYes: true,
          timeoutMs: 60_000,
        }),
      ).rejects.toThrow(/只有执行错误/);
    },
    180_000,
  );
});
