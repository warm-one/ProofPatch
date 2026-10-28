import { readFile } from "node:fs/promises";
import path from "node:path";
import { UserFacingError } from "../errors.mjs";
import { digestOf, digestOfText } from "./digest.mjs";
import { loadOracle, detectOracleTampering } from "./oracle.mjs";
import {
  ISOLATION_PROFILE,
  applyPatch,
  computeDependencyDigest,
  computeTreeDigest,
  createWorkspace,
  disposeWorkspace,
  extractPatchPaths,
  isolationDescriptor,
  listChangedPaths,
  resolveCommit,
} from "./sandbox.mjs";
import {
  collectTests,
  normalizeNodeId,
  resolvePython,
  runRegression,
  runTargetTest,
} from "./pytestRunner.mjs";
import {
  assessCoverageGaps,
  buildUnprovenList,
  computeNewErrors,
  computeNewFailures,
  decideVerdict,
} from "./verdict.mjs";
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
 *
 * 但"拦得宽"和"拦得准"是两件事：
 * - conftest / sitecustomize 会被 Python 或 pytest 从各级目录加载，任何位置都要拦；
 * - pytest.ini / tox.ini / pyproject.toml / setup.cfg 只有仓库根目录那份才生效，
 *   monorepo 子包与文档示例里的同名文件与测试无关，拦了就是误杀诚实补丁。
 */
const CONTROL_PLANE_ANYWHERE = [
  /(^|\/)conftest\.py$/,
  /(^|\/)sitecustomize\.py$/,
  /(^|\/)usercustomize\.py$/,
];

const CONTROL_PLANE_ROOT_ONLY = [
  /^pytest\.ini$/,
  /^tox\.ini$/,
  /^pyproject\.toml$/,
  /^setup\.cfg$/,
];

export function detectControlPlaneChanges(changedPaths) {
  const hits = changedPaths
    .map((entry) => entry.replaceAll("\\", "/"))
    .filter(
      (entry) =>
        CONTROL_PLANE_ANYWHERE.some((pattern) => pattern.test(entry)) ||
        CONTROL_PLANE_ROOT_ONLY.some((pattern) => pattern.test(entry)),
    );
  return { tampered: hits.length > 0, paths: hits };
}

function buildEnvironment({ pythonInfo, repeats, timeoutMs, dependencyInfo }) {
  const platform = `${process.platform}-${process.arch}`;
  return {
    fingerprint: digestOf({
      python: pythonInfo.pythonVersion,
      pytest: pythonInfo.pytestVersion,
      platform,
      node: process.version,
      isolation: ISOLATION_PROFILE.backend,
      // 依赖也是环境的一部分：只有解释器版本不足以解释结论差异。
      dependencies: dependencyInfo?.digest ?? "none",
    }),
    python: {
      executable: pythonInfo.executable,
      version: pythonInfo.pythonVersion,
    },
    pytest: pythonInfo.pytestVersion,
    platform,
    node: process.version,
    isolation: isolationDescriptor(),
    dependencies: dependencyInfo ?? { digest: null, files: [] },
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
  // 严格模式：PROVEN 之前先检查证据覆盖，覆盖不足就降级为 inconclusive。
  strict = false,
  // 调用方若已解析过基线（check 流程），直接传进来，避免解析两次导致基线漂移。
  commit,
}) {
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 9) {
    throw new UserFacingError("repeats 必须是 1 到 9 之间的整数。");
  }

  // 契约可以来自文件，也可以来自调用方已推导好的对象（check 命令的自动推导路径）。
  const resolvedOracle = providedOracle
    ? providedOracle
    : await loadOracle(oraclePath);
  const { oracle, digest: oracleDigest, protectedPaths } = resolvedOracle;
  const baseCommit = commit ?? (await resolveCommit(repoPath, baseRef));

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
  const dependencyInfo = await computeDependencyDigest(repoPath, baseCommit);
  const environment = buildEnvironment({
    pythonInfo,
    repeats,
    timeoutMs,
    dependencyInfo,
  });

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
  // 严格模式下用来判断回归是否覆盖了全部测试文件。
  let allTestFiles = [];
  // 文本层拦不住的改动（例如纯重命名）靠这里兜底：以 git apply 之后的真实树为准。
  let treeTampering = null;

  try {
    // --- 候选先行：先应用补丁，再决定这一次是否值得执行任何测试 ---
    try {
      await applyPatch(candidateWorkspace, patchPath);
      patchedTree = await computeTreeDigest(candidateWorkspace);
      // 真实改动以 Git 树为准，而不是相信补丁里声明的路径。
      changedPaths = await listChangedPaths(candidateWorkspace, baseCommit);
      patchApplied = true;
    } catch (error) {
      patchError = error instanceof Error ? error.message : "补丁应用失败";
    }

    // 树级复查：git apply 写出的路径才是事实。
    // 纯重命名补丁没有 ---/+++ 行，文本解析看到的是空数组，只有这一层能抓住。
    if (patchApplied) {
      const treeOracle = detectOracleTampering(changedPaths, protectedPaths);
      const treeControl = detectControlPlaneChanges(changedPaths);
      if (treeOracle.tampered || treeControl.tampered) {
        treeTampering = {
          oracle: {
            tampered: treeOracle.tampered,
            paths: [...new Set([...oracleTampering.paths, ...treeOracle.paths])],
          },
          controlPlane: {
            tampered: treeControl.tampered,
            paths: [...new Set([...controlPlane.paths, ...treeControl.paths])],
          },
        };
      }
    }

    if (!patchApplied) {
      baselineTrials.push(skippedTrial("baseline", "补丁无法应用，未执行任何测试"));
    } else if (treeTampering) {
      baselineTrials.push(
        skippedTrial("baseline", "补丁在应用后的树检查中被拒绝，未执行任何测试"),
      );
    } else {
      // --- 基线：同一 Oracle 契约下的失败复现 ---
      for (let index = 0; index < repeats; index += 1) {
        for (const target of oracle.targets) {
          const result = await runTargetTest({
            pythonExecutable: pythonInfo.executable,
            cwd: baselineWorkspace.treePath,
            testId: target.testId,
            timeoutMs,
          });
          baselineTrials.push({
            phase: "baseline",
            repeat: index + 1,
            testId: target.testId,
            ...result,
          });
        }
      }

      baselineRegression = await runRegression({
        pythonExecutable: pythonInfo.executable,
        cwd: baselineWorkspace.treePath,
        scope: oracle.regression.scope,
        timeoutMs,
      });

      // --- 候选执行 ---
      for (let index = 0; index < repeats; index += 1) {
        for (const target of oracle.targets) {
          const result = await runTargetTest({
            pythonExecutable: pythonInfo.executable,
            cwd: candidateWorkspace.treePath,
            testId: target.testId,
            timeoutMs,
          });
          candidateTrials.push({
            phase: "candidate",
            repeat: index + 1,
            testId: target.testId,
            ...result,
          });
        }
      }

      candidateRegression = await runRegression({
        pythonExecutable: pythonInfo.executable,
        cwd: candidateWorkspace.treePath,
        scope: oracle.regression.scope,
        timeoutMs,
      });

      if (strict) {
        // 收集项目里全部测试文件，用来判断回归范围是否只覆盖了一小块。
        const collected = await collectTests({
          pythonExecutable: pythonInfo.executable,
          cwd: baselineWorkspace.treePath,
          timeoutMs,
        });
        allTestFiles = [
          ...new Set(collected.nodeIds.map((id) => id.split("::")[0])),
        ];
      }
    }
  } finally {
    await disposeWorkspace(baselineWorkspace);
    await disposeWorkspace(candidateWorkspace);
  }

  const effectiveTampering = treeTampering ?? { oracle: oracleTampering, controlPlane };

  const decision = decideVerdict({
    baselineTrials,
    candidateTrials,
    baselineRegression,
    candidateRegression,
    tampering: effectiveTampering,
    patchApplied,
  });

  // 严格模式只在"本来要判 PROVEN"时介入：
  // 拒绝本身已经是负面结论，无需再加保守。
  let finalDecision = decision;
  let coverageGaps = [];
  if (strict && decision.verdict === "proven") {
    coverageGaps = assessCoverageGaps({
      oracle,
      regressionScope: oracle.regression.scope,
      allTestFiles,
    });
    if (coverageGaps.length > 0) {
      finalDecision = {
        verdict: "inconclusive",
        code: "STRICT_COVERAGE_INSUFFICIENT",
        message: REASON_CODES.STRICT_COVERAGE_INSUFFICIENT.title,
        detail: coverageGaps.join("；"),
      };
    }
  }

  const newFailures = computeNewFailures(baselineRegression, candidateRegression);
  const newErrors = computeNewErrors(baselineRegression, candidateRegression);
  const baselineErrored = new Set(
    (baselineRegression?.errored ?? []).map(normalizeNodeId),
  );
  const preExistingErrors = (candidateRegression?.errored ?? []).filter((node) =>
    baselineErrored.has(normalizeNodeId(node)),
  );

  const regressionStatus = (() => {
    if (!patchApplied || treeTampering) return "not-run";
    if (oracle.regression.scope.length === 0) return "not-run";
    if (newErrors.length > 0) return "error";
    if (preExistingErrors.length > 0) return "pre-existing-errors";
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
    preExistingRegressionErrors: preExistingErrors.length,
  });

  if (!patchApplied) {
    unproven.unshift(`补丁未能应用：${patchError ?? "未知原因"}`);
  }
  if (treeTampering) {
    unproven.unshift(
      "补丁在应用后的树检查中被发现修改了受保护测试文件或测试控制面，未执行任何测试。",
    );
  }
  if (decision.code === "BASELINE_NOT_FAILING") {
    unproven.unshift("基线目标测试本来就通过，本次没有可证明的修复。");
  }
  if (coverageGaps.length > 0) {
    unproven.unshift(
      ...coverageGaps.map((gap) => `严格模式下判定为证据不足：${gap}`),
    );
  }

  const receipt = attestReceipt({
    schema: "proofpatch.receipt/v1",
    receiptId: createReceiptId(),
    createdAt: new Date().toISOString(),
    verdict: finalDecision.verdict,
    reason: {
      code: finalDecision.code,
      message: finalDecision.message,
      detail: finalDecision.detail,
    },
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
      preExistingErrors,
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
    reasonTitle: REASON_CODES[finalDecision.code]?.title ?? finalDecision.message,
    coverageGaps,
  };
}
