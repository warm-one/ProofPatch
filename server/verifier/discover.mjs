import { normalizeOracle } from "./oracle.mjs";

/**
 * 从"基线里已经失败的测试"推导验收契约。
 *
 * 这是整个产品易用性的关键：维护者不需要写 JSON，
 * 因为那个失败的测试本身就是这个 bug 的可执行定义。
 *
 * 但自动推导必须付出诚实的代价：
 * - 强度只标 L1，因为不知道断言覆盖到什么程度
 * - 标记 inferred，回执里必须写明"未经人工复核"
 * 否则"好用"就变成了"用降低严谨性换来的好用"。
 */

function slugFromTestName(testName) {
  const slug = testName
    .replace(/\[[^\]]*\]$/, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return slug.slice(0, 48) || "target";
}

/** 把 pytest 的节点 ID 拆成文件与测试名。 */
export function splitNodeId(nodeId) {
  const [file, ...rest] = nodeId.split("::");
  return { testFile: file, testName: rest.join("::") };
}

export function buildOracleFromFailure({ failure, frozenAt }) {
  const { testFile, testName } = splitNodeId(failure.nodeId);

  const raw = {
    schema: "proofpatch.oracle/v1",
    id: `auto-${slugFromTestName(testName)}`,
    statement: `基线测试 ${testName} 由失败转为通过`,
    owner: "auto-discovered",
    frozenAt: frozenAt ?? new Date().toISOString(),
    inferred: true,
    targets: [
      {
        testId: failure.nodeId,
        expect: "fail",
        strength: "L1",
        asserted: [
          failure.message
            ? `基线失败现象：${failure.message}`
            : "基线时该测试处于失败状态",
        ],
        notAsserted: [
          "该断言是否覆盖根因而非仅覆盖症状",
          "测试之外的行为变化",
        ],
      },
    ],
    regression: { scope: [testFile] },
    environment: { python: ">=3.10", runner: "pytest" },
    protecting: [testFile],
  };

  return normalizeOracle(raw, "auto-discovered");
}

/**
 * 用户明确指定目标测试时使用。
 * 语义仍然是"基线必须失败"：如果这个测试在基线上本来就通过，
 * 那么它不能用来证明任何修复，结论会是 inconclusive。
 */
export function buildOracleFromTestId({ testId, frozenAt }) {
  const { testFile, testName } = splitNodeId(testId);

  const raw = {
    schema: "proofpatch.oracle/v1",
    id: `auto-${slugFromTestName(testName)}`,
    statement: `指定测试 ${testName} 由失败转为通过`,
    owner: "user-specified",
    frozenAt: frozenAt ?? new Date().toISOString(),
    targets: [
      {
        testId,
        expect: "fail",
        strength: "L1",
        asserted: ["该测试在基线上失败，在候选上通过"],
        notAsserted: ["断言覆盖范围未经复核"],
      },
    ],
    regression: { scope: [testFile] },
    environment: { python: ">=3.10", runner: "pytest" },
    protecting: [testFile],
  };

  return normalizeOracle(raw, "user-specified");
}

/**
 * 生成人类可读的一句话说明，用于终端提示。
 * 刻意不用节点 ID 开头：维护者先看到"什么意思"，再看"哪个测试"。
 */
export function describeFailure(failure) {
  const { testName } = splitNodeId(failure.nodeId);
  const readableName = testName.replace(/^test_/, "").replaceAll("_", " ");
  const message = failure.message?.trim() ?? "";
  return {
    readableName,
    // 没有失败消息时留空，由调用方决定怎么表述；
    // 在这里编造"该测试在基线上失败"会在 --test 场景下说假话。
    message,
    nodeId: failure.nodeId,
  };
}
