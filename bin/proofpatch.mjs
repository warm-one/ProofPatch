#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { UserFacingError } from "../server/errors.mjs";
import { verifyPatch } from "../server/verifier/index.mjs";
import {
  formatReceiptSummary,
  verifyReceipt,
  VERDICT_EXIT_CODE,
} from "../server/verifier/receipt.mjs";

const HELP = `ProofPatch — 独立执行证据层

用法：
  proofpatch verify --repo <目录> --patch <补丁> --oracle <契约> [选项]
  proofpatch verify-receipt <回执.json>
  proofpatch --help

verify 选项：
  --repo <目录>        被测 Git 仓库的本地路径（必填）
  --base <ref>         基线修订，默认 HEAD
  --patch <文件>       候选补丁（unified diff，必填）
  --oracle <文件>      验收契约 JSON（必填）
  --repeats <次数>     每个阶段的重复次数，1-9，默认 3
  --python <可执行文件> 指定解释器，需已安装 pytest
  --timeout <秒>       单次执行超时，默认 120
  --out <文件>         回执输出路径，默认 ./proofpatch-receipt.json
  --json              仅输出回执 JSON，不打印摘要

退出码：
  0  证明成立（proven）
  1  拒绝（rejected）
  2  无法判定（inconclusive）
  64 参数或环境错误
  70 内部错误
`;

function parseArgs(argv) {
  const positional = [];
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const body = arg.slice(2);
    const eq = body.indexOf("=");
    if (eq !== -1) {
      flags[body.slice(0, eq)] = body.slice(eq + 1);
      continue;
    }
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[body] = next;
      index += 1;
    } else {
      flags[body] = true;
    }
  }

  return { positional, flags };
}

function requireFlag(flags, name) {
  const value = flags[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new UserFacingError(`缺少必需参数 --${name}，用 --help 查看用法。`);
  }
  return value.trim();
}

function printTrials(receipt) {
  const baseline = receipt.trials.filter((trial) => trial.phase === "baseline");
  const candidate = receipt.trials.filter((trial) => trial.phase === "candidate");

  const render = (trials) => {
    if (trials.length === 0) return "  （未执行）";
    return trials
      .map(
        (trial) =>
          `  第 ${trial.repeat} 次  ${trial.outcome.padEnd(8)} 退出码 ${String(trial.exitCode ?? "-")}  ${trial.durationMs}ms`,
      )
      .join("\n");
  };

  console.log("");
  console.log("基线执行：");
  console.log(render(baseline));
  console.log("候选执行：");
  console.log(render(candidate));
}

async function commandVerify(flags) {
  const repoPath = requireFlag(flags, "repo");
  const patchPath = requireFlag(flags, "patch");
  const oraclePath = requireFlag(flags, "oracle");
  const baseRef = typeof flags.base === "string" ? flags.base : "HEAD";
  const outPath = typeof flags.out === "string" ? flags.out : "proofpatch-receipt.json";

  const repeats = flags.repeats === undefined ? 3 : Number(flags.repeats);
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 9) {
    throw new UserFacingError("--repeats 必须是 1 到 9 之间的整数。");
  }

  const timeoutSeconds = flags.timeout === undefined ? 120 : Number(flags.timeout);
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
    throw new UserFacingError("--timeout 必须是大于 0 的秒数。");
  }

  const { receipt, validation, exitCode } = await verifyPatch({
    repoPath,
    baseRef,
    patchPath,
    oraclePath,
    repeats,
    python: typeof flags.python === "string" ? flags.python : undefined,
    timeoutMs: Math.round(timeoutSeconds * 1000),
  });

  const absoluteOut = path.resolve(outPath);
  await writeFile(absoluteOut, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");

  if (flags.json) {
    console.log(JSON.stringify(receipt, null, 2));
  } else {
    console.log("");
    console.log(formatReceiptSummary(receipt));
    printTrials(receipt);
    console.log("");
    console.log(`回归：${receipt.regression.status}（范围 ${receipt.regression.scope.join("、") || "未配置"}）`);
    console.log(`回执自校验：${validation.valid ? "通过" : `失败 — ${validation.problems.join("; ")}`}`);
    console.log(`回执已写入：${absoluteOut}`);
  }

  // 回执自身不合法时不得给出"通过"的退出码，否则 CI 会被骗过。
  if (!validation.valid) {
    console.error("回执内容校验失败，按内部错误处理。");
    return 70;
  }

  return exitCode;
}

async function commandVerifyReceipt(positional) {
  const target = positional[0];
  if (!target) {
    throw new UserFacingError("请提供回执文件路径。");
  }

  const text = await readFile(path.resolve(target), "utf8");
  let receipt;
  try {
    receipt = JSON.parse(text);
  } catch {
    throw new UserFacingError("回执不是合法 JSON。");
  }

  const result = verifyReceipt(receipt);
  console.log(`回执：${receipt.receiptId ?? "未知"}`);
  console.log(`结论：${String(receipt.verdict ?? "未知").toUpperCase()}`);
  console.log(`内容校验：${result.valid ? "通过（未被篡改）" : "失败"}`);
  if (!result.valid) {
    for (const problem of result.problems) console.log(`  - ${problem}`);
  }
  console.log("");
  console.log("注意：内容校验只证明回执与自身哈希一致，不代表结论在别的环境中必然重现。");
  return result.valid ? 0 : 1;
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP);
    return 0;
  }

  const { positional, flags } = parseArgs(argv);
  const command = positional.shift();

  if (command === "verify") return commandVerify(flags);
  if (command === "verify-receipt") return commandVerifyReceipt(positional);

  console.log(HELP);
  return 64;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    if (error instanceof UserFacingError) {
      console.error(`错误：${error.message}`);
      process.exitCode = 64;
      return;
    }
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 70;
  });
