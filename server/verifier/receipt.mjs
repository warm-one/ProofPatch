import { digestOf, canonicalize } from "./digest.mjs";

/**
 * 证据回执是 ProofPatch 唯一的对外产物。
 * 设计原则：
 * 1. 回执必须自带结论与理由码，而不是让人去翻日志猜。
 * 2. 回执必须能被第三方独立校验（内容哈希）。
 * 3. 回执必须显式声明自己没证明什么（unproven），不做"全绿即安全"的暗示。
 * 4. 回执必须声明隔离等级，不能把进程级隔离说成沙箱。
 */

export const RECEIPT_SCHEMA = "proofpatch.receipt/v1";

export const VERDICT = {
  proven: "proven",
  rejected: "rejected",
  inconclusive: "inconclusive",
};

/** 退出码是给 CI 用的契约：0 才能合并。 */
export const VERDICT_EXIT_CODE = {
  proven: 0,
  rejected: 1,
  inconclusive: 2,
};

/**
 * 每个原因码都说明"是谁的问题"。
 * 这很重要：基线不成立不是候选的错，不能算 rejected。
 */
export const REASON_CODES = {
  PROVEN_FAIL_TO_PASS: {
    verdict: "proven",
    title: "基线稳定失败，候选稳定通过，且无新增回归",
  },
  ORACLE_TAMPERED: {
    verdict: "rejected",
    title: "补丁修改了 Oracle 引用的受保护测试文件",
  },
  CONTROL_PLANE_TAMPERED: {
    verdict: "rejected",
    title: "补丁修改了测试控制面配置（conftest / sitecustomize / pytest 配置）",
  },
  PATCH_APPLY_FAILED: {
    verdict: "rejected",
    title: "候选补丁无法干净应用到基线",
  },
  CANDIDATE_STILL_FAILING: {
    verdict: "rejected",
    title: "候选上目标测试仍然失败",
  },
  CANDIDATE_UNSTABLE: {
    verdict: "rejected",
    title: "基线已证明失败是稳定的，但候选有时通过有时失败",
  },
  REGRESSION_NEW_FAILURE: {
    verdict: "rejected",
    title: "候选引入了回归范围内的新增失败",
  },
  BASELINE_NOT_FAILING: {
    verdict: "inconclusive",
    title: "基线目标测试本来就通过，无法据此证明任何修复",
  },
  BASELINE_UNSTABLE: {
    verdict: "inconclusive",
    title: "基线目标测试结果不稳定，Oracle 本身不可信",
  },
  BASELINE_ERROR: {
    verdict: "inconclusive",
    title: "基线执行出现收集错误或测试不存在，不是目标失败",
  },
  REGRESSION_ERROR: {
    verdict: "inconclusive",
    title: "回归范围无法正常执行，无法判断是否引入新问题",
  },
};

export function describeReason(code) {
  return REASON_CODES[code] ?? { verdict: "inconclusive", title: "未定义的原因码" };
}

/** 回执编号只是可读标识，不承担唯一性证明；唯一性由内容哈希承担。 */
export function createReceiptId(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  const stamp = [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
  ].join("");
  const time = [pad(date.getUTCHours()), pad(date.getUTCMinutes())].join("");
  const random = Math.random().toString(16).slice(2, 8);
  return `pp-${stamp}-${time}-${random}`;
}

/**
 * 写入内容哈希。
 * kind 固定为 local-integrity-only：它只证明回执未被篡改，
 * 不证明"这份回执由谁生成"。升级为可归因需要 CI 身份 + 透明日志。
 */
export function attestReceipt(receipt) {
  const body = { ...receipt };
  delete body.attestation;
  return {
    ...body,
    attestation: {
      kind: "local-integrity-only",
      algorithm: "sha256",
      digest: digestOf(body),
      covers: "除 attestation 字段外的全部内容",
      doesNotProve:
        "未提供签名身份，因此不构成对生成者的不可否认证明；接收方需自行确认回执来源。",
    },
  };
}

/**
 * 独立校验一份回执。
 * 只依赖回执自身与规范化序列化，不访问仓库、不执行命令——
 * 因此任何人都能在离线状态下判断"这份回执有没有被改过"。
 */
export function verifyReceipt(receipt) {
  const problems = [];

  if (!receipt || typeof receipt !== "object") {
    return { valid: false, problems: ["回执不是 JSON 对象。"] };
  }
  if (receipt.schema !== RECEIPT_SCHEMA) {
    problems.push(`schema 不匹配：期望 ${RECEIPT_SCHEMA}。`);
  }

  const verdictValues = new Set(Object.values(VERDICT));
  if (!verdictValues.has(receipt.verdict)) {
    problems.push(`verdict 取值非法：${String(receipt.verdict)}。`);
  }

  const reason = receipt.reason?.code;
  if (!reason) {
    problems.push("缺少 reason.code。");
  } else if (REASON_CODES[reason]) {
    const expected = REASON_CODES[reason].verdict;
    if (expected !== receipt.verdict) {
      problems.push(
        `原因码 ${reason} 应导致 ${expected}，但回执声明为 ${String(receipt.verdict)}。`,
      );
    }
  } else {
    problems.push(`未知原因码：${reason}。`);
  }

  if (!Array.isArray(receipt.trials) || receipt.trials.length === 0) {
    problems.push("缺少 trials 记录。");
  }
  if (!receipt.attestation?.digest) {
    problems.push("缺少 attestation.digest。");
  } else {
    const body = { ...receipt };
    delete body.attestation;
    const recomputed = digestOf(body);
    if (recomputed !== receipt.attestation.digest) {
      problems.push(
        `内容哈希不匹配：回执声明 ${receipt.attestation.digest}，重算得到 ${recomputed}。`,
      );
    }
  }

  return { valid: problems.length === 0, problems };
}

/** 供外部工具用 JSON Schema 做结构校验；语义校验仍以 verifyReceipt 为准。 */
export const RECEIPT_JSON_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://proofpatch.dev/schema/receipt-v1.json",
  title: "ProofPatch Receipt v1",
  type: "object",
  required: [
    "schema",
    "receiptId",
    "createdAt",
    "verdict",
    "reason",
    "claim",
    "subject",
    "oracle",
    "environment",
    "trials",
    "regression",
    "unproven",
    "attestation",
  ],
  properties: {
    schema: { const: RECEIPT_SCHEMA },
    receiptId: { type: "string", pattern: "^pp-[0-9]{8}-[0-9]{4}-[0-9a-f]{6}$" },
    createdAt: { type: "string", format: "date-time" },
    verdict: { enum: Object.values(VERDICT) },
    reason: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        detail: { type: "string" },
      },
    },
    claim: {
      type: "object",
      required: ["oracleId", "statement"],
      properties: {
        oracleId: { type: "string" },
        statement: { type: "string" },
        scope: { type: "string" },
      },
    },
    subject: {
      type: "object",
      required: ["baseCommit", "patch", "patchedTree"],
      properties: {
        repo: {
          type: "object",
          properties: {
            label: { type: "string" },
            path: { type: "string" },
            headCommit: { type: "string" },
          },
        },
        baseCommit: { type: "string" },
        patch: {
          type: "object",
          required: ["digest", "declaredPaths"],
          properties: {
            digest: { type: "string", pattern: "^sha256:[0-9a-f]{64}$" },
            declaredPaths: { type: "array", items: { type: "string" } },
          },
        },
        patchedTree: { type: "string", pattern: "^git-tree:[0-9a-f]{40,64}$" },
      },
    },
    oracle: {
      type: "object",
      required: ["id", "digest", "statement", "targets", "protectedPaths"],
      properties: {
        id: { type: "string" },
        digest: { type: "string", pattern: "^sha256:[0-9a-f]{64}$" },
        owner: { type: "string" },
        frozenAt: { type: "string" },
        statement: { type: "string" },
        protectedPaths: { type: "array", items: { type: "string" } },
        targets: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["testId", "expect", "strength"],
            properties: {
              testId: { type: "string" },
              expect: { enum: ["fail"] },
              strength: { enum: ["L0", "L1", "L2", "L3"] },
              asserted: { type: "array", items: { type: "string" } },
              notAsserted: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    },
    environment: {
      type: "object",
      required: ["fingerprint", "python", "pytest", "platform", "isolation"],
      properties: {
        fingerprint: { type: "string" },
        python: {
          type: "object",
          properties: {
            executable: { type: "string" },
            version: { type: "string" },
          },
        },
        pytest: { type: "string" },
        platform: { type: "string" },
        node: { type: "string" },
        isolation: {
          type: "object",
          required: ["level", "backend", "limitations"],
          properties: {
            level: { enum: ["none", "process"] },
            backend: { type: "string" },
            limitations: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
    trials: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["phase", "repeat", "outcome", "exitCode", "durationMs"],
        properties: {
          phase: { enum: ["baseline", "candidate"] },
          repeat: { type: "integer", minimum: 0 },
          outcome: {
            enum: ["pass", "fail", "error", "missing", "timeout", "skipped"],
          },
          exitCode: { type: ["integer", "null"] },
          durationMs: { type: "number", minimum: 0 },
          summaryLine: { type: "string" },
          outputDigest: { type: "string" },
          outputTail: { type: "string" },
        },
      },
    },
    regression: {
      type: "object",
      required: ["status"],
      properties: {
        scope: { type: "array", items: { type: "string" } },
        status: { enum: ["clean", "new-failures", "not-run", "error"] },
        newFailures: { type: "array", items: { type: "string" } },
      },
    },
    unproven: { type: "array", items: { type: "string" } },
    attestation: {
      type: "object",
      required: ["kind", "algorithm", "digest"],
      properties: {
        kind: { const: "local-integrity-only" },
        algorithm: { const: "sha256" },
        digest: { type: "string", pattern: "^sha256:[0-9a-f]{64}$" },
        covers: { type: "string" },
        doesNotProve: { type: "string" },
      },
    },
  },
};

/** 回执转可读文本，用于 PR 评论或终端摘要。 */
export function formatReceiptSummary(receipt) {
  const lines = [
    `PROOFPATCH / ${receipt.verdict.toUpperCase()}`,
    `回执：${receipt.receiptId}`,
    `结论：${receipt.reason.message}`,
    `Oracle：${receipt.oracle.id}（${receipt.oracle.digest.slice(0, 18)}…）`,
    `基线：${receipt.subject.baseCommit.slice(0, 12)}`,
    `补丁：${receipt.subject.patch.digest.slice(0, 18)}…`,
    `候选树：${receipt.subject.patchedTree}`,
    `隔离：${receipt.environment.isolation.level} / ${receipt.environment.isolation.backend}`,
  ];

  if (receipt.unproven.length > 0) {
    lines.push("", "未证明的部分：");
    for (const item of receipt.unproven) lines.push(`- ${item}`);
  }

  return lines.join("\n");
}

/** 便于调试与测试：返回回执正文的规范化串。 */
export function canonicalReceiptBody(receipt) {
  const body = { ...receipt };
  delete body.attestation;
  return canonicalize(body);
}
