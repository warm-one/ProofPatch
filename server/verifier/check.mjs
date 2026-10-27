import { UserFacingError } from "../errors.mjs";
import {
  buildOracleFromFailure,
  buildOracleFromTestId,
  describeFailure,
} from "./discover.mjs";
import { verifyPatch } from "./index.mjs";
import { preparePatchFromWorktree } from "./patchSource.mjs";
import { resolvePython, runSuite } from "./pytestRunner.mjs";
import { createWorkspace, disposeWorkspace, resolveCommit } from "./sandbox.mjs";

/**
 * 零配置主路径。
 *
 * 用户只需要在一个 Git 项目里执行 `proofpatch check`：
 * 1. 自动找到基线里已经失败的测试
 * 2. 用它作为验收契约（问一次确认）
 * 3. 用工作区改动作为候选
 * 4. 跑完整证明并给出人话结论
 *
 * 这里刻意不隐藏任何一步：发现、确认、执行都会通过 report 回调暴露给界面，
 * 让用户看到"工具在做什么"，而不是等一个不知道是否会出现的结论。
 */
export async function runCheck({
  repoPath = process.cwd(),
  baseRef = "HEAD",
  patchPath,
  testId,
  repeats = 3,
  python,
  timeoutMs = 120_000,
  assumeYes = false,
  confirm,
  report = () => {},
}) {
  const pythonInfo = await resolvePython(python);
  const baseCommit = await resolveCommit(repoPath, baseRef);

  report({ type: "discovering", baseCommit });

  // --- 1. 在独立副本里跑一遍套件，找出基线已存在的失败 ---
  const workspace = await createWorkspace({
    repoPath,
    commit: baseCommit,
    label: "discover",
  });

  let suite;
  try {
    suite = await runSuite({
      pythonExecutable: pythonInfo.executable,
      cwd: workspace.treePath,
      timeoutMs,
    });
  } finally {
    await disposeWorkspace(workspace);
  }

  if (suite.notATestProject) {
    throw new UserFacingError(
      [
        "这个目录里没有找到可运行的 pytest 测试。",
        "",
        "ProofPatch 目前只验证 Python 项目，且要求项目里已有测试。",
        "如果你在做新功能、还没有测试，请先写一个能表达期望行为的测试。",
      ].join("\n"),
      400,
      "NO_TEST_PROJECT",
    );
  }

  if (suite.failures.length === 0 && !testId) {
    throw new UserFacingError(
      [
        "基线里没有失败的测试，因此没有可证明的修复。",
        "",
        "这正是 fail-to-pass 的前提：验收契约必须来自一个「当前确实在失败」的行为。",
        "如果你要验证的是其他测试，用 --test 指定，例如：",
        "  proofpatch check --test tests/test_cart.py::test_most_expensive_on_empty_cart_returns_none",
      ].join("\n"),
      400,
      "NO_BASELINE_FAILURE",
    );
  }

  // --- 2. 选定目标并推导契约 ---
  const explicit = Boolean(testId);
  const chosen = explicit
    ? { nodeId: testId, kind: "fail", message: "" }
    : suite.failures.find((failure) => failure.kind === "fail") ?? suite.failures[0];

  const additionalFailures = suite.failures.filter(
    (failure) => failure.nodeId !== chosen.nodeId,
  );

  const built = explicit
    ? buildOracleFromTestId({ testId })
    : buildOracleFromFailure({ failure: chosen });

  report({
    type: "discovered",
    chosen,
    description: describeFailure(chosen),
    additionalFailures,
    explicit,
    oracleDigest: built.digest,
    suite,
  });

  // --- 3. 冻结前的人工确认 ---
  if (!assumeYes && confirm) {
    const accepted = await confirm({
      chosen,
      description: describeFailure(chosen),
      oracleDigest: built.digest,
    });
    if (!accepted) {
      return { cancelled: true, suite, oracle: built, baseCommit };
    }
  }

  // --- 4. 准备候选补丁 ---
  const temporary = patchPath ? null : await preparePatchFromWorktree({ repoPath, baseRef });

  try {
    const patchInfo = patchPath
      ? { patchPath, source: "file", changedFiles: [] }
      : temporary;

    report({
      type: "patch-ready",
      source: patchInfo.source,
      changedFiles: patchInfo.changedFiles,
    });

    // --- 5. 执行完整证明 ---
    const result = await verifyPatch({
      repoPath,
      baseRef,
      patchPath: patchInfo.patchPath,
      oracle: built,
      repeats,
      python: pythonInfo.executable,
      timeoutMs,
    });

    return {
      ...result,
      oracle: built,
      chosen,
      additionalFailures,
      suite,
      patchInfo,
      pythonInfo,
      baseCommit,
    };
  } finally {
    if (temporary?.dispose) await temporary.dispose();
  }
}
