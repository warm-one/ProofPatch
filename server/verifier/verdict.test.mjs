import { describe, expect, it } from "vitest";
import { decideVerdict, computeNewFailures } from "./verdict.mjs";
import { canonicalize, digestOf } from "./digest.mjs";
import { normalizeOracle } from "./oracle.mjs";
import { detectControlPlaneChanges } from "./index.mjs";
import { attestReceipt, verifyReceipt, RECEIPT_SCHEMA } from "./receipt.mjs";

function trial(outcome, phase = "baseline", repeat = 1) {
  return {
    phase,
    repeat,
    outcome,
    exitCode: outcome === "pass" ? 0 : 1,
    durationMs: 12,
  };
}

const cleanTampering = {
  oracle: { tampered: false, paths: [] },
  controlPlane: { tampered: false, paths: [] },
};

function decide(overrides = {}) {
  return decideVerdict({
    baselineTrials: [trial("fail", "baseline", 1)],
    candidateTrials: [trial("pass", "candidate", 1)],
    baselineRegression: { status: "ok", failed: [], errored: [] },
    candidateRegression: { status: "ok", failed: [], errored: [] },
    tampering: cleanTampering,
    patchApplied: true,
    ...overrides,
  });
}

describe("canonicalize", () => {
  it("键顺序不影响哈希", () => {
    expect(digestOf({ a: 1, b: 2 })).toBe(digestOf({ b: 2, a: 1 }));
  });

  it("数组顺序会影响哈希", () => {
    expect(digestOf([1, 2])).not.toBe(digestOf([2, 1]));
  });

  it("undefined 字段等价于不存在", () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe(canonicalize({ a: 1 }));
  });
});

describe("decideVerdict 责任边界", () => {
  it("补丁篡改受保护测试文件时优先拒绝", () => {
    const result = decide({
      tampering: { oracle: { tampered: true, paths: ["tests/test_cart.py"] }, controlPlane: cleanTampering.controlPlane },
    });
    expect(result.code).toBe("ORACLE_TAMPERED");
    expect(result.verdict).toBe("rejected");
  });

  it("补丁修改测试控制面时拒绝", () => {
    const result = decide({
      tampering: {
        oracle: cleanTampering.oracle,
        controlPlane: { tampered: true, paths: ["conftest.py"] },
      },
    });
    expect(result.code).toBe("CONTROL_PLANE_TAMPERED");
    expect(result.verdict).toBe("rejected");
  });

  it("补丁无法应用时拒绝", () => {
    expect(decide({ patchApplied: false }).code).toBe("PATCH_APPLY_FAILED");
  });

  it("基线本来就通过时不能判定为证明", () => {
    const result = decide({
      baselineTrials: [trial("pass", "baseline", 1), trial("pass", "baseline", 2)],
    });
    expect(result.code).toBe("BASELINE_NOT_FAILING");
    expect(result.verdict).toBe("inconclusive");
  });

  it("基线时好时坏时判定为无法判定，而不是拒绝", () => {
    const result = decide({
      baselineTrials: [trial("pass", "baseline", 1), trial("fail", "baseline", 2)],
    });
    expect(result.code).toBe("BASELINE_UNSTABLE");
    expect(result.verdict).toBe("inconclusive");
  });

  it("基线测试不存在时不能算作复现了失败", () => {
    const result = decide({
      baselineTrials: [trial("missing", "baseline", 1)],
    });
    expect(result.code).toBe("BASELINE_ERROR");
    expect(result.verdict).toBe("inconclusive");
  });

  it("基线稳定失败且候选稳定通过时给出证明", () => {
    const result = decide();
    expect(result.code).toBe("PROVEN_FAIL_TO_PASS");
    expect(result.verdict).toBe("proven");
  });

  it("基线失败稳定但候选时好时坏时拒绝", () => {
    const result = decide({
      candidateTrials: [trial("pass", "candidate", 1), trial("fail", "candidate", 2)],
    });
    expect(result.code).toBe("CANDIDATE_UNSTABLE");
    expect(result.verdict).toBe("rejected");
  });

  it("候选仍然失败时拒绝", () => {
    const result = decide({
      candidateTrials: [trial("fail", "candidate", 1)],
    });
    expect(result.code).toBe("CANDIDATE_STILL_FAILING");
  });

  it("回归出现新增失败时拒绝", () => {
    const result = decide({
      baselineRegression: {
        status: "ok",
        failed: ["tests/test_cart.py::test_most_expensive_on_empty_cart_returns_none"],
        errored: [],
      },
      candidateRegression: {
        status: "ok",
        failed: ["tests/test_cart.py::test_most_expensive_returns_highest_priced_sku"],
        errored: [],
      },
    });
    expect(result.code).toBe("REGRESSION_NEW_FAILURE");
    expect(result.verdict).toBe("rejected");
  });

  it("回归无法执行时判定为无法判定", () => {
    const result = decide({
      candidateRegression: { status: "error", failed: [], errored: [] },
    });
    expect(result.code).toBe("REGRESSION_ERROR");
    expect(result.verdict).toBe("inconclusive");
  });

  it("回归范围里基线已有的执行错误，不阻断诚实补丁", () => {
    const shared = ["tests/test_broken.py::test_needs_missing_fixture"];
    const result = decide({
      baselineRegression: { status: "error", failed: [], errored: shared },
      candidateRegression: { status: "error", failed: [], errored: shared },
    });
    expect(result.code).toBe("PROVEN_FAIL_TO_PASS");
  });

  it("候选新增的执行错误仍然阻断", () => {
    const result = decide({
      baselineRegression: { status: "error", failed: [], errored: ["tests/a.py::test_old"] },
      candidateRegression: {
        status: "error",
        failed: [],
        errored: ["tests/a.py::test_old", "tests/b.py::test_new"],
      },
    });
    expect(result.code).toBe("REGRESSION_ERROR");
    expect(result.verdict).toBe("inconclusive");
  });

  it("候选全部未收集到结果时，明细必须写出该计数", () => {
    // 对应退出码被篡改的场景：结论正确，但明细不能看起来像"全过了"。
    const result = decide({
      candidateTrials: [
        trial("missing", "candidate", 1),
        trial("missing", "candidate", 2),
        trial("missing", "candidate", 3),
      ],
    });
    expect(result.code).toBe("CANDIDATE_STILL_FAILING");
    expect(result.detail).toContain("未收集到结果 3");
  });

  it("多目标时，一个恒过、一个恒败不能被判成不稳定", () => {
    const withTarget = (phase, outcome, testId, repeat) => ({
      phase,
      repeat,
      testId,
      outcome,
      exitCode: outcome === "pass" ? 0 : 1,
      durationMs: 1,
    });

    const result = decide({
      baselineTrials: [
        withTarget("baseline", "pass", "tests/a.py::test_a", 1),
        withTarget("baseline", "pass", "tests/a.py::test_a", 2),
        withTarget("baseline", "fail", "tests/b.py::test_b", 1),
        withTarget("baseline", "fail", "tests/b.py::test_b", 2),
      ],
    });

    expect(result.code).toBe("BASELINE_NOT_FAILING");
    expect(result.detail).toContain("tests/a.py::test_a");
  });
});

describe("控制面文件判定", () => {
  it("子包与文档示例里的同名配置不算测试控制面", () => {
    expect(detectControlPlaneChanges(["packages/web/pyproject.toml"]).tampered).toBe(false);
    expect(detectControlPlaneChanges(["docs/examples/setup.cfg"]).tampered).toBe(false);
    expect(detectControlPlaneChanges(["services/api/tox.ini"]).tampered).toBe(false);
  });

  it("根目录配置与任意位置的 conftest 仍然拦截", () => {
    expect(detectControlPlaneChanges(["pyproject.toml"]).tampered).toBe(true);
    expect(detectControlPlaneChanges(["setup.cfg"]).tampered).toBe(true);
    expect(detectControlPlaneChanges(["tests/conftest.py"]).tampered).toBe(true);
    expect(detectControlPlaneChanges(["sitecustomize.py"]).tampered).toBe(true);
  });
});

describe("computeNewFailures", () => {
  it("基线本来就红的测试不算候选的新增失败", () => {
    const baseline = {
      failed: ["tests/a.py::test_old", "tests/a.py::test_target"],
      errored: [],
    };
    const candidate = {
      failed: ["tests/a.py::test_old"],
      errored: [],
    };
    expect(computeNewFailures(baseline, candidate)).toEqual([]);
  });

  it("忽略参数化后缀，按同一测试比较", () => {
    const baseline = { failed: [], errored: [] };
    const candidate = { failed: ["tests/a.py::test_x[case-1]"], errored: [] };
    expect(computeNewFailures(baseline, candidate)).toEqual(["tests/a.py::test_x[case-1]"]);
  });
});

describe("Oracle 校验", () => {
  const base = {
    schema: "proofpatch.oracle/v1",
    id: "demo",
    statement: "空集合不崩溃",
    frozenAt: "2026-01-01T00:00:00Z",
    targets: [
      {
        testId: "tests/test_cart.py::test_most_expensive_on_empty_cart_returns_none",
        expect: "fail",
        strength: "L2",
      },
    ],
  };

  it("接受合法契约并推导受保护路径", () => {
    const { digest, protectedPaths } = normalizeOracle(base);
    expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(protectedPaths).toContain("tests/test_cart.py");
  });

  it("拒绝未知强度等级", () => {
    expect(() =>
      normalizeOracle({
        ...base,
        targets: [{ ...base.targets[0], strength: "L9" }],
      }),
    ).toThrow(/strength/);
  });

  it("拒绝越界的 protecting 路径", () => {
    expect(() => normalizeOracle({ ...base, protecting: ["../outside.py"] })).toThrow(
      /跳出仓库/,
    );
  });

  it("拒绝非单节点测试 ID", () => {
    expect(() =>
      normalizeOracle({
        ...base,
        targets: [{ ...base.targets[0], testId: "tests/test_cart.py" }],
      }),
    ).toThrow(/节点 ID/);
  });
});

describe("回执自校验", () => {
  const receipt = attestReceipt({
    schema: RECEIPT_SCHEMA,
    receiptId: "pp-20261027-0000-abcdef",
    createdAt: "2026-10-27T00:00:00.000Z",
    verdict: "proven",
    reason: { code: "PROVEN_FAIL_TO_PASS", message: "基线稳定失败" },
    claim: { oracleId: "demo", statement: "修复空集合崩溃" },
    subject: {
      baseCommit: "a".repeat(40),
      patch: { digest: `sha256:${"b".repeat(64)}`, declaredPaths: ["src/x.py"] },
      patchedTree: `git-tree:${"c".repeat(40)}`,
    },
    oracle: {
      id: "demo",
      digest: `sha256:${"d".repeat(64)}`,
      statement: "修复空集合崩溃",
      protectedPaths: ["tests/test_cart.py"],
      targets: [
        { testId: "tests/test_cart.py::t", expect: "fail", strength: "L2" },
      ],
    },
    environment: {
      fingerprint: "sha256:f00",
      python: { executable: "python", version: "3.11.0" },
      pytest: "8.0.0",
      platform: "win32-x64",
      isolation: { level: "process", backend: "tempdir", limitations: ["共用宿主用户"] },
    },
    trials: [trial("fail", "baseline", 1), trial("pass", "candidate", 1)],
    regression: { scope: ["tests/test_cart.py"], status: "clean", newFailures: [] },
    unproven: ["未运行全量测试"],
    attestation: {},
  });

  it("生成后自身校验通过", () => {
    expect(verifyReceipt(receipt).valid).toBe(true);
  });

  it("篡改 verdict 后校验失败", () => {
    const tampered = { ...receipt, verdict: "rejected" };
    const result = verifyReceipt(tampered);
    expect(result.valid).toBe(false);
    expect(result.problems.some((p) => p.includes("哈希不匹配"))).toBe(true);
  });

  it("篡改 trials 后校验失败", () => {
    const tampered = {
      ...receipt,
      trials: [{ ...receipt.trials[0], outcome: "pass" }],
    };
    expect(verifyReceipt(tampered).valid).toBe(false);
  });

  it("原因码与结论不一致时校验失败", () => {
    const inconsistent = attestReceipt({
      ...receipt,
      verdict: "proven",
      reason: { code: "ORACLE_TAMPERED", message: "x" },
      attestation: undefined,
    });
    const result = verifyReceipt(inconsistent);
    expect(result.valid).toBe(false);
    expect(result.problems.some((p) => p.includes("应导致"))).toBe(true);
  });
});
