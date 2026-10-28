import { readFile } from "node:fs/promises";
import { UserFacingError } from "../errors.mjs";
import { digestOfText } from "./digest.mjs";
import { verifyPatch } from "./index.mjs";
import { verifyReceipt } from "./receipt.mjs";

/**
 * 独立重放一份回执。
 *
 * 这是"可被第三方重新执行"的具体实现，也是这个项目区别于
 * "我说它过了"的地方：任何人拿到回执 + 同一个补丁 + 同一个仓库，
 * 都能自己跑一遍，看结论是否复现。
 *
 * 重放前的两道门槛：
 * 1. 回执自身必须通过内容哈希校验（防止拿着改过的回执来"证明"什么）；
 * 2. 补丁摘要必须与回执记录的一致（防止换成另一份补丁再来比结论）。
 */
export async function replayReceipt({
  receiptPath,
  repoPath,
  patchPath,
  python,
  timeoutMs,
}) {
  let receipt;
  try {
    receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  } catch (error) {
    throw new UserFacingError(
      `无法读取回执：${error instanceof Error ? error.message : "解析失败"}`,
      400,
      "RECEIPT_UNREADABLE",
    );
  }

  const validation = verifyReceipt(receipt);
  if (!validation.valid) {
    throw new UserFacingError(
      ["回执自身的完整性校验未通过，不能作为重放依据：", ...validation.problems.map((p) => `  - ${p}`)].join("\n"),
      400,
      "RECEIPT_INVALID",
    );
  }

  let patchText;
  try {
    patchText = await readFile(patchPath, "utf8");
  } catch {
    throw new UserFacingError(`无法读取补丁文件：${patchPath}`, 404, "PATCH_NOT_FOUND");
  }

  const actualPatchDigest = digestOfText(patchText);
  const recordedPatchDigest = receipt.subject?.patch?.digest;
  if (recordedPatchDigest && actualPatchDigest !== recordedPatchDigest) {
    throw new UserFacingError(
      [
        "提供的补丁与回执记录的不是同一份，拒绝重放。",
        `  回执记录：${recordedPatchDigest}`,
        `  实际补丁：${actualPatchDigest}`,
        "",
        "重放的意义是「同一个输入能否复现同一个结论」，换了输入就没有可比性。",
      ].join("\n"),
      400,
      "PATCH_MISMATCH",
    );
  }

  // 从回执重建契约快照：摘要沿用回执里的值，不重新推导，
  // 否则重算出的摘要与原始契约不同，比对就失去意义。
  const oracleSnapshot = {
    oracle: {
      id: receipt.oracle.id,
      statement: receipt.oracle.statement,
      owner: receipt.oracle.owner ?? "unknown",
      frozenAt: receipt.oracle.frozenAt ?? receipt.createdAt,
      targets: receipt.oracle.targets.map((target) => ({
        ...target,
        testFile: String(target.testId).split("::")[0],
      })),
      regression: {
        scope: receipt.regression?.scope ?? [],
        policy: "no-new-failures",
      },
      environment: { python: ">=3.10", runner: "pytest" },
      ...(receipt.oracle.inferred ? { inferred: true } : {}),
    },
    digest: receipt.oracle.digest,
    protectedPaths: receipt.oracle.protectedPaths ?? [],
  };

  const repeats = receipt.environment?.sampling?.repeats ?? 3;
  const effectiveTimeout =
    timeoutMs ?? receipt.environment?.sampling?.timeoutMs ?? 120_000;

  const { receipt: replayed } = await verifyPatch({
    repoPath,
    commit: receipt.subject.baseCommit,
    patchPath,
    oracle: oracleSnapshot,
    repeats,
    python,
    timeoutMs: effectiveTimeout,
  });

  const differences = [];
  if (replayed.verdict !== receipt.verdict) {
    differences.push(`结论不同：原 ${receipt.verdict} → 重放 ${replayed.verdict}`);
  }
  if (replayed.reason?.code !== receipt.reason?.code) {
    differences.push(
      `原因码不同：原 ${receipt.reason?.code} → 重放 ${replayed.reason?.code}`,
    );
  }
  if (replayed.subject?.patchedTree !== receipt.subject?.patchedTree) {
    differences.push(
      `候选树不同：原 ${receipt.subject?.patchedTree} → 重放 ${replayed.subject?.patchedTree}`,
    );
  }

  const environmentChanged =
    replayed.environment.fingerprint !== receipt.environment.fingerprint;

  return {
    original: receipt,
    replayed,
    consistent: differences.length === 0,
    differences,
    environmentChanged,
    exitCode: differences.length === 0 ? 0 : 1,
  };
}
