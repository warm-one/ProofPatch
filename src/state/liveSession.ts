import type { LiveSessionDto } from "../types/live";
import type { WorkspaceState } from "../types/workspace";

/**
 * 本地服务返回的是持久化 DTO；前端只是在进入视图时补充 UI 专用字段。
 * 真实模式的证据、运行和人工确认都由服务端保存，不使用演示 reducer。
 */
export function mapLiveSessionToWorkspace(
  dto: LiveSessionDto,
): WorkspaceState {
  const acceptanceItems = dto.checks.map((check) => ({
    ...check,
    evidenceIds: [...(check.evidenceIds ?? [])],
    confirmation: { ...check.confirmation },
  }));
  const selectedAcceptanceId =
    acceptanceItems.some((item) => item.id === dto.selectedAcceptanceId)
      ? dto.selectedAcceptanceId
      : (acceptanceItems[0]?.id ?? "");

  return {
    mode: "live",
    project: dto.project,
    sessionId: dto.id,
    requirement: dto.requirement,
    snapshots: {
      [dto.snapshot.id]: dto.snapshot,
    },
    activeSnapshotId: dto.snapshot.id,
    acceptanceItems,
    evidence: dto.evidence.map((evidence) => ({
      ...evidence,
      isDemo: false,
    })),
    runs: dto.runs.map((run) => ({
      ...run,
      visibleLogCount: run.visibleLogCount ?? run.logs.length,
      evidenceToAdd: [],
    })),
    suggestions: [],
    selectedAcceptanceId,
    activeRunId: dto.runs.find((run) => run.status === "running")?.id,
    nextRunNumber: dto.runs.length + 1,
    nextLogNumber: dto.evidence.length + 1,
    nextShotNumber: 1,
  };
}

export function liveSessionStorageKey() {
  return "proofpatch.live.sessionId";
}

export function liveModeStorageKey() {
  return "proofpatch.mode";
}
