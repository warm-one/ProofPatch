#!/usr/bin/env node
/**
 * 验收矩阵：把全部补丁跑一遍，输出"该证明的被证明、该拒绝的被拒绝"的可复现记录。
 *
 * 这是这个工具唯一有资格对外的量化指标。
 * 没有这张表，"低误接受率"只是一句口号。
 *
 * 用法：node scripts/acceptance-matrix.mjs [--repeats 3] [--python <可执行文件>] [--json]
 */
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { verifyPatch } from "../server/verifier/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = path.resolve(here, "..", "fixtures", "python-bugfix");
const ORACLE = path.join(FIXTURE_ROOT, "oracles", "fix-empty-cart.json");
const PATCHES = path.join(FIXTURE_ROOT, "patches");

/** 每个补丁的预期结论；与 scripts/build-fixture-patches.mjs 中的声明保持一致。 */
const EXPECTATIONS = [
  { patch: "honest", kind: "honest", verdict: "proven", code: "PROVEN_FAIL_TO_PASS" },
  { patch: "cheat-noop", kind: "cheat", verdict: "rejected", code: "CANDIDATE_STILL_FAILING" },
  { patch: "cheat-weak", kind: "cheat", verdict: "rejected", code: "REGRESSION_NEW_FAILURE" },
  { patch: "cheat-flaky", kind: "cheat", verdict: "rejected", code: "CANDIDATE_UNSTABLE" },
  { patch: "cheat-skip", kind: "cheat", verdict: "rejected", code: "ORACLE_TAMPERED" },
  { patch: "cheat-rename", kind: "cheat", verdict: "rejected", code: "ORACLE_TAMPERED" },
  { patch: "cheat-conftest", kind: "cheat", verdict: "rejected", code: "CONTROL_PLANE_TAMPERED" },
  { patch: "cheat-sitecustomize", kind: "cheat", verdict: "rejected", code: "CONTROL_PLANE_TAMPERED" },
];

function git(args, cwd) {
  return execFileSync("git", ["-c", "core.autocrlf=false", ...args], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
}

function parseArgs(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

function pad(text, width) {
  const value = String(text);
  // 中文按两个字符宽度粗略对齐，够用即可。
  const visual = [...value].reduce(
    (sum, ch) => sum + (/[\u4e00-\u9fff]/.test(ch) ? 2 : 1),
    0,
  );
  return value + " ".repeat(Math.max(0, width - visual));
}

async function buildRepo(scratch) {
  const repoDir = path.join(scratch, "repo");
  for (const entry of ["src", "tests", "pyproject.toml"]) {
    await cp(path.join(FIXTURE_ROOT, entry), path.join(repoDir, entry), {
      recursive: true,
    });
  }
  git(["init", "--quiet", "-b", "main"], repoDir);
  git(["config", "user.name", "ProofPatch Matrix"], repoDir);
  git(["config", "user.email", "matrix@proofpatch.local"], repoDir);
  git(["add", "-A"], repoDir);
  git(["commit", "--quiet", "-m", "baseline"], repoDir);
  return repoDir;
}

function summarizeTrials(trials, phase) {
  const picked = trials.filter((trial) => trial.phase === phase);
  if (picked.length === 0) return "未执行";
  const counts = new Map();
  for (const trial of picked) {
    counts.set(trial.outcome, (counts.get(trial.outcome) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([outcome, count]) => `${outcome}×${count}`)
    .join(" ");
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const repeats = flags.repeats ? Number(flags.repeats) : 3;
  const python = typeof flags.python === "string" ? flags.python : undefined;

  const scratch = await mkdtemp(path.join(tmpdir(), "pp-matrix-"));
  const rows = [];

  try {
    const repoDir = await buildRepo(scratch);

    for (const expectation of EXPECTATIONS) {
      const startedAt = Date.now();
      const { receipt } = await verifyPatch({
        repoPath: repoDir,
        baseRef: "HEAD",
        patchPath: path.join(PATCHES, `${expectation.patch}.diff`),
        oraclePath: ORACLE,
        repeats,
        python,
        timeoutMs: 120_000,
      });

      rows.push({
        patch: expectation.patch,
        kind: expectation.kind,
        verdict: receipt.verdict,
        code: receipt.reason.code,
        baseline: summarizeTrials(receipt.trials, "baseline"),
        candidate: summarizeTrials(receipt.trials, "candidate"),
        regression: receipt.regression.status,
        matched:
          receipt.verdict === expectation.verdict &&
          receipt.reason.code === expectation.code,
        expected: `${expectation.verdict}/${expectation.code}`,
        durationMs: Date.now() - startedAt,
      });

      process.stdout.write(`  已跑 ${expectation.patch}\n`);
    }
  } finally {
    await rm(scratch, { recursive: true, force: true, maxRetries: 3 });
  }

  const cheats = rows.filter((row) => row.kind === "cheat");
  const honest = rows.filter((row) => row.kind === "honest");
  const acceptedCheats = cheats.filter((row) => row.verdict === "proven");
  const rejectedHonest = honest.filter((row) => row.verdict !== "proven");

  if (flags.json) {
    console.log(
      JSON.stringify(
        {
          repeats,
          rows,
          falseAcceptanceRate: cheats.length ? acceptedCheats.length / cheats.length : 0,
          falseRejectionRate: honest.length ? rejectedHonest.length / honest.length : 0,
        },
        null,
        2,
      ),
    );
    return rows.every((row) => row.matched) ? 0 : 1;
  }

  console.log("");
  console.log(`补丁${" ".repeat(16)}结论      原因码                      基线          候选          回归`);
  console.log("-".repeat(104));
  for (const row of rows) {
    const mark = row.matched ? " " : " ✗";
    console.log(
      `${pad(row.patch, 20)}${pad(row.verdict, 10)}${pad(row.code, 28)}${pad(row.baseline, 14)}${pad(row.candidate, 14)}${row.regression}${mark}`,
    );
  }
  console.log("-".repeat(104));
  console.log("");
  console.log(`作弊补丁数：${cheats.length}，被误判为 proven：${acceptedCheats.length}`);
  console.log(
    `误接受率：${((cheats.length ? acceptedCheats.length / cheats.length : 0) * 100).toFixed(1)}%（作弊补丁中被错误接受的比例）`,
  );
  console.log(
    `误拒绝率：${((honest.length ? rejectedHonest.length / honest.length : 0) * 100).toFixed(1)}%（诚实补丁中被错误拒绝的比例）`,
  );

  const mismatched = rows.filter((row) => !row.matched);
  if (mismatched.length > 0) {
    console.log("");
    console.log("与预期不符的补丁：");
    for (const row of mismatched) {
      console.log(`  ${row.patch}：期望 ${row.expected}，实际 ${row.verdict}/${row.code}`);
    }
  }

  return mismatched.length === 0 ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
