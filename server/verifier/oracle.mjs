import { readFile } from "node:fs/promises";
import path from "node:path";
import { UserFacingError } from "../errors.mjs";
import { digestOf } from "./digest.mjs";

/**
 * Oracle 是"验收契约"：它规定用什么测试、期望什么状态、断言强度到哪一级。
 * 关键约束：Oracle 必须先于候选补丁存在，且候选补丁不得修改 Oracle 引用的测试文件。
 * 没有这条约束，"通过"就退化为"改测试让测试过"。
 */

export const ORACLE_SCHEMA = "proofpatch.oracle/v1";

/**
 * Oracle 强度分级：说明这次验证到底证明了什么。
 * L0 只证明"不再崩溃"，最容易给出假绿；L3 才接近行为契约。
 */
export const ORACLE_STRENGTH = {
  L0: {
    label: "L0 仅不崩溃",
    description: "只断言进程退出码与异常类型，返回值正确性完全未证明。",
  },
  L1: {
    label: "L1 异常消失 + 形状",
    description: "断言不再抛出目标异常，并检查返回值类型或容器形状。",
  },
  L2: {
    label: "L2 精确值",
    description: "断言返回值或状态字段等于具体期望值。",
  },
  L3: {
    label: "L3 属性与边界",
    description: "断言不变量、边界条件与副作用，允许实现方式变化。",
  },
};

const VALID_EXPECT = new Set(["fail"]);
const VALID_STRENGTHS = new Set(Object.keys(ORACLE_STRENGTH));

function requireString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new UserFacingError(`Oracle 字段 ${field} 必须是非空字符串。`);
  }
  return value.trim();
}

function normalizePathEntry(entry, field) {
  const raw = requireString(entry, field).replaceAll("\\", "/");
  const normalized = path.posix.normalize(raw).replace(/^\.\//, "");
  if (normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
    throw new UserFacingError(
      `Oracle 字段 ${field} 不允许绝对路径或跳出仓库的路径：${raw}`,
    );
  }
  return normalized;
}

/**
 * 校验并规范化 Oracle 文档。
 * 任何字段缺失或取值非法都直接拒绝，避免"半个契约"产生半个结论。
 */
export function normalizeOracle(raw, sourceLabel = "oracle.json") {
  if (!raw || typeof raw !== "object") {
    throw new UserFacingError("Oracle 必须是一个 JSON 对象。");
  }
  if (raw.schema !== ORACLE_SCHEMA) {
    throw new UserFacingError(
      `Oracle schema 必须是 ${ORACLE_SCHEMA}，实际为 ${String(raw.schema)}。`,
    );
  }

  const id = requireString(raw.id, "id");
  const statement = requireString(raw.statement, "statement");
  const owner = requireString(raw.owner ?? "unassigned", "owner");
  const frozenAt = requireString(raw.frozenAt, "frozenAt");

  if (!Array.isArray(raw.targets) || raw.targets.length === 0) {
    throw new UserFacingError("Oracle 至少需要一个 targets 条目。");
  }
  if (raw.targets.length > 20) {
    throw new UserFacingError("Oracle 的 targets 不能超过 20 条。");
  }

  const targets = raw.targets.map((target, index) => {
    if (!target || typeof target !== "object") {
      throw new UserFacingError(`targets[${index}] 必须是对象。`);
    }
    const testId = requireString(target.testId, `targets[${index}].testId`);
    if (!testId.includes("::")) {
      throw new UserFacingError(
        `targets[${index}].testId 必须是 pytest 节点 ID（文件::测试名），实际为 ${testId}。`,
      );
    }
    const expect = requireString(
      target.expect ?? "fail",
      `targets[${index}].expect`,
    );
    if (!VALID_EXPECT.has(expect)) {
      throw new UserFacingError(
        `targets[${index}].expect 目前只支持 "fail"，实际为 ${expect}。`,
      );
    }
    const strength = requireString(
      target.strength ?? "L1",
      `targets[${index}].strength`,
    );
    if (!VALID_STRENGTHS.has(strength)) {
      throw new UserFacingError(
        `targets[${index}].strength 必须是 ${[...VALID_STRENGTHS].join(" / ")} 之一。`,
      );
    }
    const asserted = Array.isArray(target.asserted)
      ? target.asserted.map((entry, i) =>
          requireString(entry, `targets[${index}].asserted[${i}]`),
        )
      : [];
    const notAsserted = Array.isArray(target.notAsserted)
      ? target.notAsserted.map((entry, i) =>
          requireString(entry, `targets[${index}].notAsserted[${i}]`),
        )
      : [];

    return {
      testId,
      expect,
      strength,
      asserted,
      notAsserted,
      testFile: testId.split("::")[0],
    };
  });

  const regressionScope = Array.isArray(raw.regression?.scope)
    ? raw.regression.scope.map((entry, i) =>
        normalizePathEntry(entry, `regression.scope[${i}]`),
      )
    : [];

  const environment = raw.environment ?? {};
  const requiredPython = requireString(
    environment.python ?? ">=3.10",
    "environment.python",
  );
  const runner = requireString(environment.runner ?? "pytest", "environment.runner");
  if (runner !== "pytest") {
    throw new UserFacingError(
      `第一版只支持 pytest，environment.runner 实际为 ${runner}。`,
    );
  }

  const normalized = {
    schema: ORACLE_SCHEMA,
    id,
    statement,
    owner,
    frozenAt,
    targets,
    regression: {
      scope: regressionScope,
      policy: "no-new-failures",
    },
    environment: {
      python: requiredPython,
      runner,
    },
    source: sourceLabel,
  };

  // 只有自动推导的契约才带这个标记，避免改变手写契约的既有摘要。
  if (raw.inferred === true) {
    normalized.inferred = true;
  }

  // 受保护路径 = 所有目标测试文件 + 显式声明的 protecting 路径。
  const protectedPaths = new Set(targets.map((target) => target.testFile));
  if (Array.isArray(raw.protecting)) {
    for (const [index, entry] of raw.protecting.entries()) {
      protectedPaths.add(normalizePathEntry(entry, `protecting[${index}]`));
    }
  }

  return {
    oracle: normalized,
    digest: digestOf(normalized),
    protectedPaths: [...protectedPaths].sort(),
  };
}

export async function loadOracle(filePath) {
  let text;
  try {
    text = await readFile(filePath, "utf8");
  } catch {
    throw new UserFacingError(`无法读取 Oracle 文件：${filePath}`, 404, "ORACLE_NOT_FOUND");
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new UserFacingError(
      `Oracle 不是合法 JSON：${error instanceof Error ? error.message : "解析失败"}`,
    );
  }

  return normalizeOracle(parsed, path.basename(filePath));
}

/**
 * 控制面检查：候选补丁是否试图修改受保护的测试文件。
 * 这是"不可绕过"的最小实现——改了测试就失去验证资格，而不是"改完还能算过"。
 */
export function detectOracleTampering(changedPaths, protectedPaths) {
  const protectedSet = new Set(protectedPaths);
  const violations = changedPaths
    .map((entry) => entry.replaceAll("\\", "/"))
    .filter((entry) => protectedSet.has(entry));
  return { tampered: violations.length > 0, paths: violations };
}

export function describeStrength(strength) {
  return ORACLE_STRENGTH[strength] ?? ORACLE_STRENGTH.L1;
}
