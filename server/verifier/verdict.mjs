import { describeStrength } from "./oracle.mjs";
import { normalizeNodeId } from "./pytestRunner.mjs";
import { REASON_CODES } from "./receipt.mjs";

/**
 * 判定器是纯函数：输入只有已观测到的事实，没有任何启发式、没有模型参与。
 * 这条边界必须硬性保持——一旦让"看起来像修好了"进入判定，产品就不再是证据层。
 *
 * 判定顺序刻意固定：先排除"没有资格判定"的情况，再谈通过与否。
 */

function summarizeTrials(trials) {
  const counts = { pass: 0, fail: 0, error: 0, missing: 0, timeout: 0 };
  for (const trial of trials) {
    counts[trial.outcome] = (counts[trial.outcome] ?? 0) + 1;
  }
  return counts;
}

/**
 * 按目标测试分组。
 *
 * 多目标契约下，"A 恒通过、B 恒失败"与"同一个测试时好时坏"是两种完全不同的诊断，
 * 聚合计数会把前者误报成后者，因此必须逐目标判定。
 * 没有 testId 的记录（旧回执、占位 trial）归入同一组，保持单目标行为不变。
 */
function groupByTarget(trials) {
  const groups = new Map();
  for (const trial of trials) {
    const key = trial.testId ?? "__all__";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(trial);
  }
  return groups;
}

function reason(code, detail) {
  const meta = describeReasonSafe(code);
  return { verdict: meta.verdict, code, message: meta.title, detail };
}

function describeReasonSafe(code) {
  return REASON_CODES[code] ?? { verdict: "inconclusive", title: "未定义的原因码" };
}

/**
 * 计算候选相对基线的"新增问题"。
 * 用集合差而不是数量比较：基线本来就红的测试不该算到候选头上。
 */
export function computeNewFailures(baselineRegression, candidateRegression) {
  if (!baselineRegression || !candidateRegression) return [];

  const known = new Set(
    [...(baselineRegression.failed ?? []), ...(baselineRegression.errored ?? [])].map(
      normalizeNodeId,
    ),
  );
  const current = [
    ...(candidateRegression.failed ?? []),
    ...(candidateRegression.errored ?? []),
  ];

  const fresh = current.filter((node) => !known.has(normalizeNodeId(node)));
  return [...new Set(fresh)].sort();
}

/**
 * 计算候选相对基线的"新增执行错误"。
 *
 * 为什么单独算：回归范围里可能本来就有一个坏掉的文件（导入失败、缺 fixture）。
 * 那种错误在基线就存在，与候选无关，不该让诚实补丁永远拿不到结论。
 * 只有"基线没有、候选才有"的错误才是候选引入的。
 */
export function computeNewErrors(baselineRegression, candidateRegression) {
  if (!baselineRegression || !candidateRegression) return [];

  const known = new Set((baselineRegression.errored ?? []).map(normalizeNodeId));
  const current = candidateRegression.errored ?? [];

  return [...new Set(current.filter((node) => !known.has(normalizeNodeId(node))))].sort();
}

/**
 * 主判定。
 *
 * @param {object} input
 * @param {Array} input.baselineTrials   基线阶段每次执行的结果
 * @param {Array} input.candidateTrials  候选阶段每次执行的结果
 * @param {object|null} input.baselineRegression 基线回归结果
 * @param {object|null} input.candidateRegression 候选回归结果
 * @param {object} input.tampering       { oracle: {tampered, paths}, controlPlane: {tampered, paths} }
 * @param {boolean} input.patchApplied   补丁是否成功应用
 */
export function decideVerdict({
  baselineTrials,
  candidateTrials,
  baselineRegression,
  candidateRegression,
  tampering,
  patchApplied,
}) {
  if (tampering?.oracle?.tampered) {
    return reason(
      "ORACLE_TAMPERED",
      `补丁修改了受保护测试文件：${tampering.oracle.paths.join(", ")}`,
    );
  }

  if (tampering?.controlPlane?.tampered) {
    return reason(
      "CONTROL_PLANE_TAMPERED",
      `补丁修改了测试控制面文件：${tampering.controlPlane.paths.join(", ")}`,
    );
  }

  if (!patchApplied) {
    return reason("PATCH_APPLY_FAILED", "补丁无法应用到基线工作树。");
  }

  const totalBaseline = baselineTrials.length;

  if (totalBaseline === 0) {
    return reason("BASELINE_ERROR", "基线阶段没有任何执行记录。");
  }

  // 逐目标判定基线：只要有一个目标不是"稳定失败"，这个契约就不成立。
  for (const [testId, trials] of groupByTarget(baselineTrials)) {
    const counts = summarizeTrials(trials);
    const total = trials.length;

    // error / missing / timeout 说明"失败"不是目标失败。
    if (counts.error > 0 || counts.missing > 0 || counts.timeout > 0) {
      return reason(
        "BASELINE_ERROR",
        `${testId} 出现 ${counts.missing} 次未收集到结果、${counts.error} 次执行错误、${counts.timeout} 次超时；这些都不构成"目标失败"。`,
      );
    }

    // 基线通过 = 这个 bug 根本不存在，或 Oracle 指错了地方。
    if (counts.pass === total) {
      return reason(
        "BASELINE_NOT_FAILING",
        `${testId} 在基线 ${total} 次执行中全部通过。`,
      );
    }

    // 基线时好时坏 = Oracle 本身不稳定，任何后续结论都不可信。
    if (counts.pass > 0) {
      return reason(
        "BASELINE_UNSTABLE",
        `${testId} 在基线 ${total} 次执行中 ${counts.pass} 次通过、${counts.fail} 次失败，该测试本身不稳定。`,
      );
    }
  }

  // 到这里每个目标都是"稳定失败"，责任边界转移到候选。
  const candidate = summarizeTrials(candidateTrials);
  const totalCandidate = candidateTrials.length;

  if (totalCandidate === 0) {
    return reason("CANDIDATE_STILL_FAILING", "候选阶段没有任何执行记录。");
  }

  const failingTargets = [...groupByTarget(candidateTrials)].filter(
    ([, trials]) => summarizeTrials(trials).pass !== trials.length,
  );

  if (failingTargets.length === 0) {
    const newFailures = computeNewFailures(baselineRegression, candidateRegression);
    const newErrors = computeNewErrors(baselineRegression, candidateRegression);
    // status 为 error 但一个错误节点都没解析出来：回归实际上没跑起来，
    // 无法与基线比较，不能当"无新增问题"放过。
    const candidateBrokenWithoutDetail =
      candidateRegression?.status === "error" &&
      (candidateRegression.errored ?? []).length === 0;

    // 只有"候选新增的"执行错误才阻断。基线就坏掉的文件与候选无关，
    // 它的存在会在 unproven 里如实说明，而不是把结论压成 inconclusive。
    if (newErrors.length > 0 || candidateBrokenWithoutDetail) {
      const detail =
        newErrors.length > 0
          ? `候选引入了 ${newErrors.length} 个新的执行错误：${newErrors
              .slice(0, 5)
              .join(", ")}`
          : "回归范围无法正常执行（没有解析到具体错误节点），无法判断是否引入新问题。";
      return reason("REGRESSION_ERROR", detail);
    }

    if (newFailures.length > 0) {
      return reason(
        "REGRESSION_NEW_FAILURE",
        `候选在回归范围内引入 ${newFailures.length} 个新增失败：${newFailures
          .slice(0, 5)
          .join(", ")}`,
      );
    }

    return reason(
      "PROVEN_FAIL_TO_PASS",
      `基线 ${totalBaseline} 次稳定失败，候选 ${totalCandidate} 次稳定通过。`,
    );
  }

  const unstableTarget = failingTargets.find(
    ([, trials]) => summarizeTrials(trials).pass > 0,
  );
  if (unstableTarget) {
    const [testId, trials] = unstableTarget;
    const counts = summarizeTrials(trials);
    return reason(
      "CANDIDATE_UNSTABLE",
      `${testId} 在候选 ${trials.length} 次中只有 ${counts.pass} 次通过；基线已证明该失败稳定存在。`,
    );
  }

  // 明细必须把 missing 单独写出来：退出码被篡改时，测试根本没跑完，
  // 只说 "fail 0 / error 0 / timeout 0" 会让人误以为全部通过。
  return reason(
    "CANDIDATE_STILL_FAILING",
    `候选 ${totalCandidate} 次执行中目标测试未通过（失败 ${candidate.fail} / 执行错误 ${candidate.error} / 超时 ${candidate.timeout} / 未收集到结果 ${candidate.missing}）。`,
  );
}

/**
 * 评估"证据覆盖"是否足以支撑一个 PROVEN 结论。
 *
 * 严格模式下用它决定要不要降级。这里刻意只统计**本次可以改善**的缺口：
 * 隔离等级、依赖重建、签名这些结构性限制永远存在，纳入就会让 strict 永远无法通过，
 * 那就失去了区分意义。
 */
const STRENGTH_RANK = { L0: 0, L1: 1, L2: 2, L3: 3 };

export function assessCoverageGaps({ oracle, regressionScope, allTestFiles }) {
  const gaps = [];

  if (oracle.inferred) {
    gaps.push("验收契约由基线失败自动推导，断言强度未经人工复核");
  }

  const weakest = oracle.targets.reduce(
    (min, target) => Math.min(min, STRENGTH_RANK[target.strength] ?? 0),
    3,
  );
  if (weakest < 3) {
    const labels = [...new Set(oracle.targets.map((t) => t.strength))].join("/");
    gaps.push(`Oracle 强度为 ${labels}，未达 L3（属性与边界）`);
  }

  const notAsserted = oracle.targets.flatMap((target) => target.notAsserted ?? []);
  if (notAsserted.length > 0) {
    gaps.push(`目标测试有 ${notAsserted.length} 项未断言的行为`);
  }

  if (allTestFiles && allTestFiles.length > 0) {
    const covered = new Set(regressionScope);
    const uncovered = allTestFiles.filter((file) => !covered.has(file));
    if (uncovered.length > 0) {
      gaps.push(
        `回归未覆盖 ${uncovered.length} 个测试文件：${uncovered.slice(0, 3).join("、")}${uncovered.length > 3 ? " 等" : ""}`,
      );
    }
  }

  return gaps;
}

/**
 * 生成"未证明边界"。
 * 这一段不是免责声明，而是结构化地告诉接收方：
 * 这份回执在什么范围内成立，超出哪里就不成立。
 */
export function buildUnprovenList({
  oracle,
  regressionScope,
  regressionStatus,
  repeats,
  isolation,
  hasSignature,
  preExistingRegressionErrors = 0,
}) {
  const items = [];

  if (oracle.inferred) {
    items.push(
      "验收契约由基线失败自动推导（强度 L1）：断言是否覆盖根因、而非仅覆盖症状，未经人工复核。",
    );
  }

  const strengths = [...new Set(oracle.targets.map((target) => target.strength))];
  for (const strength of strengths) {
    const meta = describeStrength(strength);
    items.push(`Oracle 强度 ${meta.label}：${meta.description}`);
  }

  const notAsserted = oracle.targets.flatMap((target) => target.notAsserted ?? []);
  if (notAsserted.length > 0) {
    items.push(`目标测试未断言的行为：${notAsserted.join("；")}`);
  }

  if (regressionStatus === "not-run" || regressionScope.length === 0) {
    items.push("未配置回归范围，本次未检测补丁是否破坏其他已有行为。");
  } else {
    items.push(
      `回归仅覆盖 ${regressionScope.join("、")}，未运行项目全量测试套件。`,
    );
  }

  if (preExistingRegressionErrors > 0) {
    items.push(
      `回归范围内有 ${preExistingRegressionErrors} 项基线即存在的执行错误（与候选无关、未变化），这些测试的行为本次未被覆盖。`,
    );
  }

  items.push(
    `基线每个阶段重复 ${repeats} 次；低频不稳定（低于 ${(100 / repeats).toFixed(1)}% 量级）仍可能未被发现。`,
  );

  if (isolation?.level === "process") {
    items.push(
      "执行隔离为进程级：候选代码以宿主用户身份运行，仍可访问网络与宿主可读文件，不构成安全沙箱。",
    );
  }

  items.push(
    "未按依赖清单重建环境：验证使用的是宿主已安装的依赖，与项目锁文件可能不一致。",
  );

  if (!hasSignature) {
    items.push(
      "回执仅包含内容哈希，未包含签名身份；可验证未被篡改，但不能证明由谁生成。",
    );
  }

  return items;
}
