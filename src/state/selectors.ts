import type {
  AcceptanceItem,
  AcceptanceStatus,
  DiffSnapshot,
  Evidence,
  WorkspaceState,
} from "../types/workspace";

export type EvidenceRelation = "current" | "carried" | "stale";

export function getActiveSnapshot(state: WorkspaceState): DiffSnapshot {
  return state.snapshots[state.activeSnapshotId];
}

export function getSelectedAcceptance(
  state: WorkspaceState,
): AcceptanceItem | undefined {
  return state.acceptanceItems.find(
    (item) => item.id === state.selectedAcceptanceId,
  );
}

export function getEvidenceRelation(
  evidence: Evidence,
  snapshot: DiffSnapshot,
): EvidenceRelation {
  if (evidence.fingerprint && snapshot.fingerprint) {
    return evidence.fingerprint === snapshot.fingerprint
      ? "current"
      : "stale";
  }
  if (evidence.snapshotId === snapshot.id) return "current";

  const affected = evidence.scopePaths.some((path) =>
    snapshot.changedPaths.includes(path),
  );
  return affected ? "stale" : "carried";
}

export function getEvidenceRelationLabel(
  relation: EvidenceRelation,
  evidence: Evidence,
): string {
  if (relation === "current") return "当前快照";
  if (relation === "stale") return "历史证据 · 已被当前补丁影响";
  return `沿用自 ${evidence.snapshotId}`;
}

export function getCurrentEvidence(
  item: AcceptanceItem,
  state: WorkspaceState,
): Evidence[] {
  const snapshot = getActiveSnapshot(state);
  return item.evidenceIds
    .map((id) => state.evidence.find((evidence) => evidence.id === id))
    .filter(
      (evidence): evidence is Evidence =>
        Boolean(evidence) &&
        getEvidenceRelation(evidence as Evidence, snapshot) !== "stale",
    )
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

export function getEvidenceForItem(
  item: AcceptanceItem,
  state: WorkspaceState,
): Evidence[] {
  return item.evidenceIds
    .map((id) => state.evidence.find((evidence) => evidence.id === id))
    .filter((evidence): evidence is Evidence => Boolean(evidence))
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

export function getStatusCounts(items: AcceptanceItem[]) {
  return items.reduce<Record<AcceptanceStatus, number>>(
    (counts, item) => {
      counts[item.status] += 1;
      return counts;
    },
    { passed: 0, failed: 0, unverified: 0 },
  );
}

export function getConfirmedCount(items: AcceptanceItem[]) {
  return items.filter((item) => item.confirmation.state === "confirmed")
    .length;
}

export function getPendingConfirmationCount(items: AcceptanceItem[]) {
  return items.filter(
    (item) =>
      item.status === "passed" && item.confirmation.state === "pending",
  ).length;
}

export function getUnresolvedCount(items: AcceptanceItem[]) {
  const counts = getStatusCounts(items);
  return (
    counts.failed + counts.unverified + getPendingConfirmationCount(items)
  );
}

export function canConfirmAcceptance(
  item: AcceptanceItem,
  state: WorkspaceState,
) {
  return (
    item.status === "passed" &&
    item.confirmation.state === "pending" &&
    getCurrentEvidence(item, state).length > 0
  );
}

export function getReportReadiness(items: AcceptanceItem[]) {
  const counts = getStatusCounts(items);
  const deliverable =
    counts.failed === 0 &&
    counts.unverified === 0 &&
    items.every((item) => item.confirmation.state === "confirmed");

  return {
    counts,
    deliverable,
    pendingConfirmations: getPendingConfirmationCount(items),
  };
}

export function getNextAcceptanceId(items: AcceptanceItem[]) {
  const highest = items.reduce((max, item) => {
    const numeric = Number(item.id.replace(/\D/g, ""));
    return Number.isFinite(numeric) ? Math.max(max, numeric) : max;
  }, 0);

  return `AC-${String(highest + 1).padStart(2, "0")}`;
}

export function getRunById(state: WorkspaceState, runId?: string) {
  if (!runId) return undefined;
  return state.runs.find((run) => run.id === runId);
}

export function getRunningRun(state: WorkspaceState) {
  return state.runs.find((run) => run.status === "running");
}

export function getSnapshotTotals(snapshot: DiffSnapshot) {
  return snapshot.files.reduce(
    (totals, file) => ({
      additions: totals.additions + file.additions,
      deletions: totals.deletions + file.deletions,
    }),
    { additions: 0, deletions: 0 },
  );
}

export function formatDemoTimestamp(value?: string) {
  if (!value) return "—";

  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatEvidenceKind(evidence: Evidence) {
  return evidence.kind === "browser-screenshot" ? "浏览器截图" : "测试日志";
}

export function isRunActive(state: WorkspaceState) {
  return state.runs.some((run) => run.status === "running");
}
