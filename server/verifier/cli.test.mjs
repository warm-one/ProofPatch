import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attestReceipt, RECEIPT_SCHEMA } from "./receipt.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(here, "..", "..", "bin", "proofpatch.mjs");

let scratch = null;

function runCli(args) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 30_000,
  });
  return { code: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function sampleReceipt() {
  return attestReceipt({
    schema: RECEIPT_SCHEMA,
    receiptId: "pp-20261027-0000-abcdef",
    createdAt: "2026-10-27T00:00:00.000Z",
    verdict: "rejected",
    reason: { code: "ORACLE_TAMPERED", message: "补丁修改了受保护测试文件" },
    claim: { oracleId: "demo", statement: "修复空集合崩溃" },
    subject: {
      baseCommit: "a".repeat(40),
      patch: { digest: `sha256:${"b".repeat(64)}`, declaredPaths: ["tests/test_cart.py"] },
      patchedTree: "git-tree:not-computed",
    },
    oracle: {
      id: "demo",
      digest: `sha256:${"d".repeat(64)}`,
      statement: "修复空集合崩溃",
      protectedPaths: ["tests/test_cart.py"],
      targets: [{ testId: "tests/test_cart.py::t", expect: "fail", strength: "L2" }],
    },
    environment: {
      fingerprint: "sha256:f00",
      python: { executable: "python", version: "3.11.0" },
      pytest: "8.0.0",
      platform: "win32-x64",
      isolation: { level: "process", backend: "tempdir", limitations: ["共用宿主用户"] },
    },
    trials: [
      {
        phase: "baseline",
        repeat: 0,
        outcome: "skipped",
        exitCode: null,
        durationMs: 0,
      },
    ],
    regression: { scope: [], status: "not-run", newFailures: [] },
    unproven: ["未执行任何测试"],
    attestation: {},
  });
}

beforeAll(async () => {
  scratch = await mkdtemp(path.join(tmpdir(), "pp-cli-"));
});

afterAll(async () => {
  if (scratch) await rm(scratch, { recursive: true, force: true, maxRetries: 3 });
});

describe("CLI 退出码契约", () => {
  it("无参数时打印用法并以 0 退出", () => {
    const { code, stdout } = runCli([]);
    expect(code).toBe(0);
    expect(stdout).toContain("proofpatch verify");
  });

  it("校验未被篡改的回执时以 0 退出", async () => {
    const file = path.join(scratch, "valid.json");
    await writeFile(file, JSON.stringify(sampleReceipt(), null, 2), "utf8");

    const { code, stdout } = runCli(["verify-receipt", file]);
    expect(code).toBe(0);
    expect(stdout).toContain("内容校验：通过");
  });

  it("校验被篡改的回执时以 1 退出", async () => {
    const tampered = sampleReceipt();
    tampered.verdict = "proven";
    tampered.reason = { code: "PROVEN_FAIL_TO_PASS", message: "伪造" };

    const file = path.join(scratch, "forged.json");
    await writeFile(file, JSON.stringify(tampered, null, 2), "utf8");

    const { code, stdout } = runCli(["verify-receipt", file]);
    expect(code).toBe(1);
    expect(stdout).toContain("内容校验：失败");
  });

  it("缺少必需参数时以 64 退出", () => {
    const { code, stderr } = runCli(["verify", "--repo", "."]);
    expect(code).toBe(64);
    expect(stderr).toContain("--patch");
  });
});
