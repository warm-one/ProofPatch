export type ReceiptVerdict = "proven" | "rejected" | "inconclusive";

export type TrialOutcome =
  | "pass"
  | "fail"
  | "error"
  | "missing"
  | "timeout"
  | "skipped";

export interface ReceiptTrial {
  phase: "baseline" | "candidate";
  repeat: number;
  testId?: string;
  outcome: TrialOutcome;
  exitCode: number | null;
  durationMs: number;
  summaryLine?: string;
}

export interface ReceiptOracleTarget {
  testId: string;
  expect: string;
  strength: string;
  asserted?: string[];
  notAsserted?: string[];
}

export interface ProofReceipt {
  schema: string;
  receiptId: string;
  createdAt: string;
  verdict: ReceiptVerdict;
  reason: { code: string; message: string; detail?: string };
  claim: {
    oracleId: string;
    statement: string;
    scope?: string;
    isolationModel?: string;
  };
  subject: {
    repo?: { label?: string; headCommit?: string };
    baseCommit: string;
    patch: { digest: string; declaredPaths: string[] };
    patchedTree: string;
  };
  oracle: {
    id: string;
    digest: string;
    owner?: string;
    frozenAt?: string;
    statement: string;
    inferred?: boolean;
    protectedPaths: string[];
    targets: ReceiptOracleTarget[];
  };
  environment: {
    fingerprint: string;
    python: { executable: string; version: string };
    pytest: string;
    platform: string;
    node?: string;
    isolation: { level: string; backend: string; limitations: string[] };
    dependencies?: { digest: string | null; files: string[] };
    sampling?: { repeats: number; timeoutMs: number };
  };
  trials: ReceiptTrial[];
  regression: {
    scope: string[];
    status: string;
    newFailures: string[];
    preExistingErrors?: string[];
    baselineFailed?: string[];
    candidateFailed?: string[];
  };
  unproven: string[];
  attestation: {
    kind: string;
    algorithm: string;
    digest: string;
    covers?: string;
    doesNotProve?: string;
  };
}
