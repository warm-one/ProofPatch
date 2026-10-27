import { execFileSync } from "node:child_process";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyPatch } from "./index.mjs";
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
});
