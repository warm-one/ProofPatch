import { createInitialDemoState } from "../demo/initialData";
import type {
  AcceptanceItem,
  Toast,
  WorkspaceAction,
  WorkspaceState,
} from "../types/workspace";

function makeToast(message: string, tone: Toast["tone"] = "info"): Toast {
  return {
    id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    message,
    tone,
  };
}

function replaceRunLogVisibility(state: WorkspaceState, runId: string) {
  return state.runs.map((run) =>
    run.id === runId
      ? {
          ...run,
          visibleLogCount: Math.min(run.visibleLogCount + 1, run.logs.length),
        }
      : run,
  );
}

/**
 * 所有工作台事实集中在 reducer 中派生，避免矩阵、证据和报告各自维护一份状态。
 * 该 reducer 只处理预置演示数据，不执行任何命令或网络请求。
 */
export function workspaceReducer(
  state: WorkspaceState,
  action: WorkspaceAction,
): WorkspaceState {
  switch (action.type) {
    case "SELECT_ACCEPTANCE":
      return { ...state, selectedAcceptanceId: action.acceptanceId };

    case "SET_SNAPSHOT": {
      if (action.snapshotId === state.activeSnapshotId) return state;

      const nextSnapshot = state.snapshots[action.snapshotId];
      const affectedPaths = new Set(nextSnapshot.changedPaths);
      const affectedIds = new Set<string>();

      state.evidence.forEach((evidence) => {
        const intersects = evidence.scopePaths.some((path) =>
          affectedPaths.has(path),
        );
        if (!intersects) return;

        evidence.acceptanceIds.forEach((acceptanceId) => {
          const item = state.acceptanceItems.find(
            (candidate) => candidate.id === acceptanceId,
          );
          if (item?.evidenceIds.includes(evidence.id)) {
            affectedIds.add(acceptanceId);
          }
        });
      });

      const acceptanceItems = state.acceptanceItems.map((item) => {
        if (!affectedIds.has(item.id)) return item;
        return {
          ...item,
          status: "unverified" as const,
          confirmation: { state: "pending" as const },
        };
      });

      return {
        ...state,
        activeSnapshotId: action.snapshotId,
        acceptanceItems,
        toast: makeToast(
          "已载入修复快照。受影响的验收项回到未验证，旧证据仍保留在历史中。",
          "warning",
        ),
      };
    }

    case "START_RUN": {
      if (state.runs.some((run) => run.status === "running")) return state;

      return {
        ...state,
        runs: [...state.runs, action.run],
        activeRunId: action.run.id,
        nextRunNumber: action.nextRunNumber,
        nextLogNumber: action.nextLogNumber,
        nextShotNumber: action.nextShotNumber,
      };
    }

    case "REVEAL_RUN_LOG":
      return {
        ...state,
        runs: replaceRunLogVisibility(state, action.runId),
      };

    case "COMPLETE_RUN": {
      const run = state.runs.find((candidate) => candidate.id === action.runId);
      if (!run || run.status !== "running") return state;

      const finishedAt = new Date(
        Date.parse(run.startedAt) + 8_000,
      ).toISOString();
      const completedRun = {
        ...run,
        status: "completed" as const,
        finishedAt,
        visibleLogCount: run.logs.length,
      };
      const newEvidence = run.evidenceToAdd.filter(
        (evidence) =>
          !state.evidence.some((existing) => existing.id === evidence.id),
      );

      const acceptanceItems = state.acceptanceItems.map((item) => {
        const outcome = run.outcomes[item.id];
        if (!outcome) return item;

        const evidenceIds = Array.from(
          new Set([
            ...item.evidenceIds,
            ...newEvidence
              .filter((evidence) => evidence.acceptanceIds.includes(item.id))
              .map((evidence) => evidence.id),
          ]),
        );

        return {
          ...item,
          status: outcome,
          evidenceIds,
          confirmation: { state: "pending" as const },
        };
      });

      const hasFailure = Object.values(run.outcomes).includes("failed");

      return {
        ...state,
        runs: state.runs.map((candidate) =>
          candidate.id === action.runId ? completedRun : candidate,
        ),
        evidence: [...state.evidence, ...newEvidence],
        acceptanceItems,
        toast: makeToast(
          hasFailure
            ? `${run.id} 已结束：仍有检查失败，验收项不会自动通过。`
            : `${run.id} 已完成。证据仍待人工确认。`,
          hasFailure ? "warning" : "success",
        ),
      };
    }

    case "INTERRUPT_RUN": {
      const run = state.runs.find((candidate) => candidate.id === action.runId);
      if (!run || run.status !== "running") return state;

      return {
        ...state,
        runs: state.runs.map((candidate) =>
          candidate.id === action.runId
            ? {
                ...candidate,
                status: "interrupted",
                finishedAt: new Date().toISOString(),
              }
            : candidate,
        ),
        activeRunId: undefined,
        toast: makeToast(
          "演示回放已中断。没有产生新证据，相关验收项保持原状态。",
          "warning",
        ),
      };
    }

    case "CONFIRM_ACCEPTANCE": {
      const item = state.acceptanceItems.find(
        (candidate) => candidate.id === action.acceptanceId,
      );
      if (!item || item.status !== "passed") return state;

      return {
        ...state,
        acceptanceItems: state.acceptanceItems.map((candidate) =>
          candidate.id === action.acceptanceId
            ? {
                ...candidate,
                confirmation: {
                  state: "confirmed",
                  confirmedAt: action.confirmedAt,
                  confirmedBy: "交付负责人",
                },
              }
            : candidate,
        ),
        toast: makeToast(
          `${item.id} 已由人工确认。自动通过现在才成为可交付结论。`,
          "success",
        ),
      };
    }

    case "ADOPT_SUGGESTION": {
      const suggestion = state.suggestions.find(
        (candidate) => candidate.id === action.suggestionId,
      );
      if (!suggestion || suggestion.state === "adopted") return state;

      const acceptanceItem: AcceptanceItem = {
        id: action.acceptanceId,
        title: suggestion.title,
        criterion: suggestion.criterion,
        status: "unverified",
        source: "ai-suggestion",
        codeLinks: [],
        evidenceIds: [],
        confirmation: { state: "pending" },
      };

      return {
        ...state,
        acceptanceItems: [...state.acceptanceItems, acceptanceItem],
        suggestions: state.suggestions.map((candidate) =>
          candidate.id === action.suggestionId
            ? {
                ...candidate,
                state: "adopted",
                targetAcceptanceId: action.acceptanceId,
              }
            : candidate,
        ),
        selectedAcceptanceId: action.acceptanceId,
        toast: makeToast(
          `已采纳 AI 建议，新增 ${action.acceptanceId}。它仍需要运行检查并人工确认。`,
          "success",
        ),
      };
    }

    case "RESET_DEMO":
      return createInitialDemoState();

    case "SHOW_TOAST":
      return { ...state, toast: action.toast };

    case "DISMISS_TOAST":
      if (state.toast?.id !== action.toastId) return state;
      return { ...state, toast: undefined };

    default:
      return state;
  }
}
