import { readFile } from "node:fs/promises";
import path from "node:path";
import { UserFacingError } from "../errors.mjs";
import { digestOf, digestOfText } from "./digest.mjs";
import { loadOracle, detectOracleTampering } from "./oracle.mjs";
import {
  ISOLATION_PROFILE,
  applyPatch,
  computeTreeDigest,
  createWorkspace,
  disposeWorkspace,
  extractPatchPaths,
  isolationDescriptor,
  listChangedPaths,
  resolveCommit,
} from "./sandbox.mjs";
import { resolvePython, runRegression, runTargetTest } from "./pytestRunner.mjs";
import { buildUnprovenList, computeNewFailures, decideVerdict } from "./verdict.mjs";
import {
  attestReceipt,
  createReceiptId,
  REASON_CODES,
  verifyReceipt,
  VERDICT_EXIT_CODE,
} from "./receipt.mjs";

/**
 * 测试控制面文件。
 * 改这些文件等于改"测试如何被解释"，而不是改被测代码，
 * 因此一律视为绕过验证，而不是普通代码变更。
 */
const CONTROL_PLANE_PATTERNS = [
  /(^|\/)conftest\.py$/,
  /(^|\/)sitecustomize\.py$/,
  /(^|\/)usercustomize\.py$/,
  /(^|\/)pytest\.ini$/,
  /(^|\/)tox\.ini$/,
  /(^|\/)pyproject\.toml$/,
  /(^|\/)setup\.cfg$/,
];

function detectControlPlaneChanges(changedPaths) {
  const hits = changedPaths
    .map((entry) => entry.replaceAll("\\", "/"))
    .filter((entry) => CONTROL_PLANE_PATTERNS.some((pattern) => pattern.test(entry)));
  return { tampered: hits.length > 0, paths: hits };
}

function buildEnvironment({ pythonInfo, repeats, timeoutMs }) {
  const platform = `${process.platform}-${process.arch}`;
  return {
    fingerprint: digestOf({
      python: pythonInfo.pythonVersion,
      pytest: pythonInfo.pytestVersion,
      platform,
      node: process.version,
      isolation: ISOLATION_PROFILE.backend,
    }),
    python: {
      executable: pythonInfo.executable,
      version: pythonInfo.pythonVersion,
    },
    pytest: pythonInfo.pytestVersion,
    platform,
    node: process.version,
    isolation: isolationDescriptor(),
    sampling: { repeats, timeoutMs },
  };
}

/**
 * 用一次"未执行"记录占位，避免篡改场景下产出空 trials 而让回执结构不合法。
 * 这条记录本身就是证据：它说明检测发生在执行之前。
 */
function skippedTrial(phase, summaryLine) {
  return {
    phase,
    repeat: 0,
    outcome: "skipped",
    exitCode: null,
    durationMs: 0,
    summaryLine,
    outputDigest: digestOfText(""),
    outputTail: "",
  };
}

/**
 * 主流程：对一个候选补丁执行完整证明。
 *
 * 关键设计：
 * - 基线与候选是**两个互不共享状态的克隆**，不是"打完补丁再回滚"。
 * - 篡改检查发生在执行之前，不给可疑补丁任何运行机会。
 * - 结论由 decideVerdict 这个纯函数给出，此处不做任何"看起来对"的判断。
 */
export async function verifyPatch({
  repoPath,
  baseRef = "HEAD",
  patchPath,
  oraclePath,
  oracle: providedOracle,
  repeats = 3,
  python,
  timeoutMs = 120_000,
}) {
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 9) {
    throw new UserFacingError("repeats 必须是 1 到 9 之间的整数。");
  }

  // 契约可以来自文件，也可以来自调用方已推导好的对象（check 命令的自动推导路径）。
  const resolvedOracle = providedOracle
    ? providedOracle
    : await loadOracle(oraclePath);
  const { oracle, digest: oracleDigest, protectedPaths } = resolvedOracle;
  const baseCommit = await resolveCommit(repoPath, baseRef);

  let patchText;
  try {
    patchText = await readFile(patchPath, "utf8");
  } catch {
    throw new UserFacingError(`无法读取补丁文件：${patchPath}`, 404, "PATCH_NOT_FOUND");
  }
  if (patchText.trim() === "") {
    throw new UserFacingError("补丁文件为空。", 400, "PATCH_EMPTY");
  }

  const patchDigest = digestOfText(patchText);
  const declaredPaths = extractPatchPaths(patchText);

  // 执行前的控制面检查：命中即终止，不启动任何进程。
  const oracleTampering = detectOracleTampering(declaredPaths, protectedPaths);
  const controlPlane = detectControlPlaneChanges(declaredPaths);

  const pythonInfo = await resolvePython(python);
  const environment = buildEnvironment({ pythonInfo, repeats, timeoutMs });

  const repoLabel = path.basename(path.resolve(repoPath));
  const headCommit = await resolveCommit(repoPath, "HEAD");

  // --- 短路：补丁触碰受保护文件 ---
  if (oracleTampering.tampered || controlPlane.tampered) {
    const decision = decideVerdict({
      baselineTrials: [skippedTrial("baseline", "补丁触发控制面拦截，未执行任何测试")],
      candidateTrials: [],
      baselineRegression: null,
      candidateRegression: null,
      tampering: { oracle: oracleTampering, controlPlane },
      patchApplied: true,
    });

    const receipt = attestReceipt({
      schema: "proofpatch.receipt/v1",
      receiptId: createReceiptId(),
      createdAt: new Date().toISOString(),
      verdict: decision.verdict,
      reason: { code: decision.code, message: decision.message, detail: decision.detail },
      claim: {
        oracleId: oracle.id,
        statement: `候选补丁修复「${oracle.statement}」`,
        scope: "single-target-test",
        isolationModel: "independent-clones",
      },
      subject: {
        repo: { label: repoLabel, headCommit },
        baseCommit,
        patch: { digest: patchDigest, declaredPaths },
        patchedTree: "git-tree:not-computed",
      },
      oracle: {
        id: oracle.id,
        digest: oracleDigest,
        owner: oracle.owner,
        frozenAt: oracle.frozenAt,
        statement: oracle.statement,
        ...(oracle.inferred ? { inferred: true } : {}),
        protectedPaths,
        targets: oracle.targets.map((target) => ({
          testId: target.testId,
          expect: target.expect,
          strength: target.strength,
          asserted: target.asserted,
          notAsserted: target.notAsserted,
        })),
      },
      environment,
      trials: [skippedTrial("baseline", "补丁触发控制面拦截，未执行任何测试")],
      regression: { scope: oracle.regression.scope, status: "not-run", newFailures: [] },
      unproven: ["补丁在通过控制面检查前即被拒绝，本次未产生任何执行事实。"],
      attestation: {},
    });

    return { receipt, validation: verifyReceipt(receipt), exitCode: VERDICT_EXIT_CODE[receipt.verdict] };
  }

  const baselineWorkspace = await createWorkspace({
    repoPath,
    commit: baseCommit,
    label: "baseline",
  });
  const candidateWorkspace = await createWorkspace({
    repoPath,
    commit: baseCommit,
    label: "candidate",
  });

  const baselineTrials = [];
  const candidateTrials = [];
  let baselineRegression = null;
  let candidateRegression = null;
  let patchedTree = "git-tree:not-computed";
  let patchApplied = false;
  let patchError = null;
  let changedPaths = declaredPaths;

  try {
    // --- 基线：同一 Oracle 契约下的失败复现 ---
    for (let index = 0; index < repeats; index += 1) {
      for (const target of oracle.targets) {
        const result = await runTargetTest({
          pythonExecutable: pythonInfo.executable,
          cwd: baselineWorkspace.treePath,
          testId: target.testId,
          timeoutMs,
        });
        baselineTrials.push({ phase: "baseline", repeat: index + 1, ...result });
      }
    }

    baselineRegression = await runRegression({
      pythonExecutable: pythonInfo.executable,
      cwd: baselineWorkspace.treePath,
      scope: oracle.regression.scope,
      timeoutMs,
    });

    // --- 候选：独立克隆 + 应用补丁 ---
    try {
      await applyPatch(candidateWorkspace, patchPath);
      patchedTree = await computeTreeDigest(candidateWorkspace);
      // 真实改动以 Git 树为准，而不是相信补丁里声明的路径。
      changedPaths = await listChangedPaths(candidateWorkspace, baseCommit);
      patchApplied = true;
    } catch (error) {
      patchError = error instanceof Error ? error.message : "补丁应用失败";
    }

    if (patchApplied) {
      for (let index = 0; index < repeats; index += 1) {
        for (const target of oracle.targets) {
          const result = await runTargetTest({
            pythonExecutable: pythonInfo.executable,
            cwd: candidateWorkspace.treePath,
            testId: target.testId,
            timeoutMs,
          });
          candidateTrials.push({ phase: "candidate", repeat: index + 1, ...result });
        }
      }

      candidateRegression = await runRegression({
        pythonExecutable: pythonInfo.executable,
        cwd: candidateWorkspace.treePath,
        scope: oracle.regression.scope,
        timeoutMs,
      });
    }
  } finally {
    await disposeWorkspace(baselineWorkspace);
    await disposeWorkspace(candidateWorkspace);
  }

  const decision = decideVerdict({
    baselineTrials,
    candidateTrials,
    baselineRegression,
    candidateRegression,
    tampering: { oracle: oracleTampering, controlPlane },
    patchApplied,
  });

  const newFailures = computeNewFailures(baselineRegression, candidateRegression);

  const regressionStatus = (() => {
    if (!patchApplied) return "not-run";
    if (oracle.regression.scope.length === 0) return "not-run";
    if (candidateRegression?.status === "error") return "error";
    if (newFailures.length > 0) return "new-failures";
    return "clean";
  })();

  const unproven = buildUnprovenList({
    oracle,
    regressionScope: oracle.regression.scope,
    regressionStatus,
    repeats,
    isolation: environment.isolation,
    hasSignature: false,
  });

  if (!patchApplied) {
    unproven.unshift(`补丁未能应用：${patchError ?? "未知原因"}`);
  }
  if (decision.code === "BASELINE_NOT_FAILING") {
    unproven.unshift("基线目标测试本来就通过，本次没有可证明的修复。");
  }

  const receipt = attestReceipt({
    schema: "proofpatch.receipt/v1",
    receiptId: createReceiptId(),
    createdAt: new Date().toISOString(),
    verdict: decision.verdict,
    reason: { code: decision.code, message: decision.message, detail: decision.detail },
    claim: {
      oracleId: oracle.id,
      statement: `候选补丁修复「${oracle.statement}」`,
      scope: "single-target-test",
      isolationModel: "independent-clones",
    },
    subject: {
      repo: { label: repoLabel, headCommit },
      baseCommit,
      patch: { digest: patchDigest, declaredPaths: changedPaths },
      patchedTree,
    },
    oracle: {
      id: oracle.id,
      digest: oracleDigest,
      owner: oracle.owner,
      frozenAt: oracle.frozenAt,
      statement: oracle.statement,
      protectedPaths,
      targets: oracle.targets.map((target) => ({
        testId: target.testId,
        expect: target.expect,
        strength: target.strength,
        asserted: target.asserted,
        notAsserted: target.notAsserted,
      })),
    },
    environment,
    trials: [...baselineTrials, ...candidateTrials],
    regression: {
      scope: oracle.regression.scope,
      status: regressionStatus,
      newFailures,
      baselineFailed: baselineRegression?.failed ?? [],
      candidateFailed: candidateRegression?.failed ?? [],
    },
    unproven,
    attestation: {},
  });

  return {
    receipt,
    validation: verifyReceipt(receipt),
    exitCode: VERDICT_EXIT_CODE[receipt.verdict],
    reasonTitle: REASON_CODES[decision.code]?.title ?? decision.message,
  };
}
