#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { UserFacingError } from "../server/errors.mjs";
import { runCheck } from "../server/verifier/check.mjs";
import { verifyPatch } from "../server/verifier/index.mjs";
import { replayReceipt } from "../server/verifier/replay.mjs";
import {
  formatReceiptSummary,
  verifyReceipt,
  VERDICT_EXIT_CODE,
} from "../server/verifier/receipt.mjs";

const HELP = `ProofPatch — 独立执行证据层

最常用：
  proofpatch check

  在当前 Git 项目里自动找出"正在失败的测试"，用它作为验收契约，
  验证你的改动是否真的让这个失败消失，且没有打坏别的测试。

命令：
  proofpatch check          零配置验证当前项目的工作区改动
  proofpatch verify         使用已有契约文件验证指定补丁
  proofpatch replay         拿到别人的回执，自己重跑一遍比对结论
  proofpatch verify-receipt 离线校验一份回执是否被篡改

replay 选项：
  --repo <目录>        回执对应的仓库（必填）
  --patch <文件>       当初那一份补丁（必填，摘要必须与回执一致）
  --python <可执行文件> 指定解释器
  --json              输出对比结果 JSON

check 选项：
  --repo <目录>        被测项目，默认当前目录
  --base <ref>         基线修订，默认 HEAD
  --patch <文件>       验证指定补丁，默认使用工作区改动
  --test <节点ID>      指定目标测试（基线没有失败时使用）
  --repeats <次数>     每个阶段的重复次数，1-9，默认 3
  --python <可执行文件> 指定解释器，需已安装 pytest
  --timeout <秒>       单次执行超时，默认 120
  --strict            严格模式：证据覆盖不足时不给证明结论
  --yes               跳过契约确认（CI 用）
  --out <文件>         回执输出路径，默认 ./proofpatch-receipt.json
  --json              仅输出回执 JSON

退出码：
  0  证明成立（proven）
  1  拒绝（rejected）
  2  无法判定（inconclusive）
  64 参数或环境错误
  70 内部错误
`;

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code) => (text) =>
  useColor ? `\u001b[${code}m${text}\u001b[0m` : String(text);
const green = paint("32");
const red = paint("31");
const yellow = paint("33");
const dim = paint("2");
const bold = paint("1");

const MARK = {
  proven: green("✓"),
  rejected: red("✗"),
  inconclusive: yellow("?"),
};

const VERDICT_LABEL = {
  proven: "PROVEN    证明成立",
  rejected: "REJECTED  拒绝",
  inconclusive: "INCONCLUSIVE  无法判定",
};


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

function summarizeTrials(trials, phase) {
  const picked = trials.filter((trial) => trial.phase === phase);
  const counts = { pass: 0, fail: 0, error: 0, missing: 0, timeout: 0, skipped: 0 };
  for (const trial of picked) {
    counts[trial.outcome] = (counts[trial.outcome] ?? 0) + 1;
  }
  return { total: picked.length, counts };
}

function stepLine(mark, label, detail) {
  return `  ${mark} ${label}  ${dim(detail)}`;
}

const OK = green("✓");
const BAD = red("✗");
const SKIP = dim("·");

/**
 * 把回执翻译成四步人话。
 * 用户不需要知道原因码，只需要看到"哪一步没过去"。
 */
function renderCheckSteps(receipt) {
  const base = summarizeTrials(receipt.trials, "baseline");
  const cand = summarizeTrials(receipt.trials, "candidate");
  const code = receipt.reason.code;
  const lines = [];

  const blockedEarly =
    code === "ORACLE_TAMPERED" || code === "CONTROL_PLANE_TAMPERED";

  if (blockedEarly || base.total === 0) {
    lines.push(stepLine(SKIP, "基线复现", "未执行：补丁在执行前已被拒绝"));
  } else if (code.startsWith("BASELINE_")) {
    lines.push(stepLine(BAD, "基线复现", `${base.counts.fail}/${base.total} 失败，契约不成立`));
  } else {
    lines.push(stepLine(OK, "基线复现", `${base.counts.fail}/${base.total} 稳定失败`));
  }

  if (blockedEarly) {
    const reason =
      code === "ORACLE_TAMPERED"
        ? "补丁修改了验收测试文件，已拒绝"
        : "补丁修改了测试控制面配置，已拒绝";
    lines.push(stepLine(BAD, "应用补丁", reason));
  } else if (code === "PATCH_APPLY_FAILED") {
    lines.push(stepLine(BAD, "应用补丁", "补丁无法干净应用到基线"));
  } else {
    lines.push(stepLine(OK, "应用补丁", `独立副本 ${receipt.subject.patchedTree}`));
  }

  if (blockedEarly || cand.total === 0) {
    lines.push(stepLine(SKIP, "候选验证", "未执行"));
  } else if (cand.counts.pass === cand.total) {
    lines.push(stepLine(OK, "候选验证", `${cand.total}/${cand.total} 稳定通过`));
  } else if (cand.counts.pass > 0) {
    lines.push(
      stepLine(BAD, "候选验证", `${cand.counts.pass}/${cand.total} 通过，结果不稳定`),
    );
  } else {
    lines.push(stepLine(BAD, "候选验证", "目标测试仍未通过"));
  }

  const regression = receipt.regression;
  if (regression.status === "clean") {
    lines.push(
      stepLine(OK, "回归检查", `${regression.scope.join("、")} 无新增失败`),
    );
  } else if (regression.status === "pre-existing-errors") {
    const count = (regression.preExistingErrors ?? []).length;
    lines.push(
      stepLine(
        yellow("⚠"),
        "回归检查",
        `${regression.scope.join("、")} 无新增失败；基线已有 ${count} 项执行错误未变化`,
      ),
    );
  } else if (regression.status === "new-failures") {
    const sample = regression.newFailures.slice(0, 2).join("、");
    const more =
      regression.newFailures.length > 2
        ? ` 等 ${regression.newFailures.length} 项`
        : "";
    lines.push(stepLine(BAD, "回归检查", `新增失败：${sample}${more}`));
  } else if (regression.status === "error") {
    lines.push(stepLine(yellow("?"), "回归检查", "范围内测试无法正常执行"));
  } else {
    lines.push(stepLine(SKIP, "回归检查", "未配置回归范围"));
  }

  return lines;
}

async function askConfirm(prompt) {
  if (!process.stdin.isTTY) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(prompt)).trim().toLowerCase();
    return answer === "" || answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

async function commandCheck(flags) {
  const repoPath = typeof flags.repo === "string" ? flags.repo : process.cwd();
  const baseRef = typeof flags.base === "string" ? flags.base : "HEAD";
  const outPath =
    typeof flags.out === "string" ? flags.out : ".proofpatch/receipt.json";

  const repeats = flags.repeats === undefined ? 3 : Number(flags.repeats);
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 9) {
    throw new UserFacingError("--repeats 必须是 1 到 9 之间的整数。");
  }

  const timeoutSeconds = flags.timeout === undefined ? 120 : Number(flags.timeout);
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
    throw new UserFacingError("--timeout 必须是大于 0 的秒数。");
  }

  const quiet = Boolean(flags.json);
  // 契约冻结是一个需要人点头的动作。管道 / CI 里没有 TTY 时，
  // 默认"自动同意"等于没人看过这份契约就签字，宁可报错。
  if (!flags.yes && !process.stdin.isTTY) {
    throw new UserFacingError(
      "当前是非交互环境，请显式加 --yes 表示你接受自动推导的验收契约。",
      400,
      "CONFIRM_REQUIRED",
    );
  }

  const say = (...args) => {
    if (!quiet) console.log(...args);
  };

  say("");
  say(bold("ProofPatch"));
  say(dim(`  ${path.resolve(repoPath)}`));

  const result = await runCheck({
    repoPath,
    baseRef,
    patchPath: typeof flags.patch === "string" ? flags.patch : undefined,
    testId: typeof flags.test === "string" ? flags.test : undefined,
    repeats,
    python: typeof flags.python === "string" ? flags.python : undefined,
    timeoutMs: Math.round(timeoutSeconds * 1000),
    strict: Boolean(flags.strict),
    assumeYes: Boolean(flags.yes),
    onProgress: (event) => {
      const label = event.phase === "baseline" ? "基线" : "候选";
      const outcome =
        {
          pass: "通过",
          fail: "失败",
          error: "错误",
          missing: "未收集到",
          timeout: "超时",
        }[event.outcome] ?? event.outcome;
      say(dim(`    ${label} ${event.repeat}/${event.total}  ${outcome}  ${event.durationMs}ms`));
    },
    confirm: async () => {
      say("");
      return askConfirm("  把这个失败作为验收契约？[Y/n] ");
    },
    report: (event) => {
      if (event.type === "discovering") {
        say("");
        say(dim("  正在查找基线失败…"));
      }
      if (event.type === "discovered") {
        // 无论是否需要确认，都要让用户看到"工具拿什么当契约"。
        say("");
        if (event.explicit) {
          say(`  使用指定测试：${bold(event.description.readableName)}`);
          say(`    ${dim(event.chosen.nodeId)}`);
        } else {
          say(`  发现基线失败：${bold(event.description.readableName)}`);
          if (event.description.message) {
            say(`    ${dim(event.description.message)}`);
          }
          say(`    ${dim(event.chosen.nodeId)}`);
          if (event.additionalFailures.length > 0) {
            say(
              dim(
                `  另有 ${event.additionalFailures.length} 个基线失败未纳入本次契约，可用 --test 指定。`,
              ),
            );
          }
        }
        say(dim(`  契约已冻结 ${event.oracleDigest.slice(0, 22)}…`));
      }
      if (event.type === "patch-ready") {
        const detail =
          event.source === "worktree"
            ? `工作区改动，${event.changedFiles.length} 个文件`
            : "指定补丁文件";
        say("");
        say(dim(`  候选：${detail}`));
        say(dim(`  正在验证（每阶段 ${repeats} 次）…`));
      }
    },
  });

  if (result.cancelled) {
    say("");
    say(yellow("  已取消。没有执行任何验证，也没有写入回执。"));
    return 2;
  }

  const { receipt, validation, exitCode } = result;
  const absoluteOut = path.resolve(outPath);
  // 回执写进独立目录，避免在用户项目根目录堆文件。
  await mkdir(path.dirname(absoluteOut), { recursive: true });
  await writeFile(absoluteOut, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");

  if (quiet) {
    console.log(JSON.stringify(receipt, null, 2));
    return validation.valid ? exitCode : 70;
  }

  say("");
  for (const line of renderCheckSteps(receipt)) say(line);

  if (receipt.reason.code === "STRICT_COVERAGE_INSUFFICIENT") {
    say("");
    say(yellow("  严格模式：四步都通过，但证据覆盖不足，因此不给出证明结论。"));
  }

  say("");
  say(`  结论  ${MARK[receipt.verdict]} ${bold(VERDICT_LABEL[receipt.verdict])}`);
  say(`        ${receipt.reason.message}`);
  if (receipt.reason.detail && receipt.verdict !== "proven") {
    say(`        ${dim(receipt.reason.detail)}`);
  }

  say("");
  say(dim(`  回执  ${absoluteOut}`));
  say(dim(`  校验  proofpatch verify-receipt "${absoluteOut}"`));

  if (receipt.unproven.length > 0) {
    say("");
    say(dim("  这次没有证明的部分："));
    for (const item of receipt.unproven) say(dim(`    · ${item}`));
  }

  say("");
  if (!validation.valid) {
    console.error("回执内容校验失败，按内部错误处理。");
    return 70;
  }

  return exitCode;
}

async function commandVerify(flags) {
  const repoPath = requireFlag(flags, "repo");
  const patchPath = requireFlag(flags, "patch");
  const oraclePath = requireFlag(flags, "oracle");
  const baseRef = typeof flags.base === "string" ? flags.base : "HEAD";
  const outPath =
    typeof flags.out === "string" ? flags.out : ".proofpatch/receipt.json";

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
  await mkdir(path.dirname(absoluteOut), { recursive: true });
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

async function commandReplay(positional, flags) {
  const receiptPath = positional[0];
  if (!receiptPath) {
    throw new UserFacingError(
      "用法：proofpatch replay <receipt.json> --repo <目录> --patch <补丁>",
    );
  }
  const repoPath = typeof flags.repo === "string" ? flags.repo : null;
  const patchPath = typeof flags.patch === "string" ? flags.patch : null;
  if (!repoPath) {
    throw new UserFacingError("缺少 --repo：请指定这份回执对应的仓库目录。");
  }
  if (!patchPath) {
    throw new UserFacingError("缺少 --patch：请提供当初那一份补丁。");
  }

  const result = await replayReceipt({
    receiptPath,
    repoPath,
    patchPath,
    python: typeof flags.python === "string" ? flags.python : undefined,
  });

  if (flags.json) {
    console.log(
      JSON.stringify(
        {
          receiptId: result.original.receiptId,
          consistent: result.consistent,
          environmentChanged: result.environmentChanged,
          differences: result.differences,
          original: {
            verdict: result.original.verdict,
            reason: result.original.reason?.code,
          },
          replayed: {
            verdict: result.replayed.verdict,
            reason: result.replayed.reason?.code,
          },
        },
        null,
        2,
      ),
    );
    return result.exitCode;
  }

  console.log("");
  console.log(bold(`重放 ${result.original.receiptId}`));
  console.log("");
  console.log(`  回执完整性   ${green("✓ 未被篡改")}`);
  console.log(
    `  补丁一致     ${green(`✓ ${String(result.original.subject?.patch?.digest ?? "").slice(0, 20)}…`)}`,
  );
  console.log(
    `  环境         ${
      result.environmentChanged
        ? yellow("⚠ 指纹不同，结论可能无法复现")
        : green("✓ 指纹相同")
    }`,
  );
  console.log("");
  console.log(
    `  原结论    ${String(result.original.verdict).toUpperCase()}  ${dim(String(result.original.reason?.code))}`,
  );
  console.log(
    `  重放结论  ${String(result.replayed.verdict).toUpperCase()}  ${dim(String(result.replayed.reason?.code))}`,
  );
  console.log("");
  if (result.consistent) {
    console.log(`  结果  ${green("✓ 一致")}`);
  } else {
    console.log(`  结果  ${red("✗ 不一致")}`);
    for (const line of result.differences) console.log(dim(`    - ${line}`));
  }
  console.log("");
  return result.exitCode;
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

  if (command === "check") return commandCheck(flags);
  if (command === "verify") return commandVerify(flags);
  if (command === "replay") return commandReplay(positional, flags);
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
