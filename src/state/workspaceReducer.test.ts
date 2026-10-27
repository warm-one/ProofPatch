import { describe, expect, it } from "vitest";
import { createInitialDemoState } from "../demo/initialData";
import { createDemoRun } from "../demo/runScripts";
import {
  getEvidenceRelation,
  getReportReadiness,
} from "./selectors";
import { workspaceReducer } from "./workspaceReducer";

function loadAfterFix() {
  const initial = createInitialDemoState();
  return workspaceReducer(initial, {
    type: "SET_SNAPSHOT",
    snapshotId: "after-fix",
  });
}

function completeContrastReplay() {
  const state = loadAfterFix();
  const target = state.acceptanceItems.find((item) => item.id === "AC-04");
  if (!target) throw new Error("AC-04 is missing from demo data");

  const draft = createDemoRun({
    target,
    snapshot: state.snapshots["after-fix"],
    runNumber: state.nextRunNumber,
    logNumber: state.nextLogNumber,
    shotNumber: state.nextShotNumber,
  });
  const running = workspaceReducer(state, {
    type: "START_RUN",
    run: draft.run,
    nextRunNumber: draft.nextRunNumber,
    nextLogNumber: draft.nextLogNumber,
    nextShotNumber: draft.nextShotNumber,
  });
  const completed = workspaceReducer(running, {
    type: "COMPLETE_RUN",
    runId: draft.run.id,
  });

  return { state, running, completed, draft };
}

describe("workspaceReducer", () => {
  it("starts from a coherent draft with a known blocker", () => {
    const state = createInitialDemoState();
    const readiness = getReportReadiness(state.acceptanceItems);

    expect(state.acceptanceItems).toHaveLength(5);
    expect(readiness.counts).toEqual({
      passed: 3,
      failed: 1,
      unverified: 1,
    });
    expect(readiness.deliverable).toBe(false);
    expect(state.selectedAcceptanceId).toBe("AC-04");
  });

  it("marks only evidence affected by the fix snapshot as stale", () => {
    const state = loadAfterFix();
    const ac04 = state.acceptanceItems.find((item) => item.id === "AC-04");

    expect(ac04?.status).toBe("unverified");
    expect(ac04?.confirmation.state).toBe("pending");
    expect(
      getEvidenceRelation(
        state.evidence.find((evidence) => evidence.id === "LOG-014")!,
        state.snapshots["after-fix"],
      ),
    ).toBe("stale");
    expect(
      getEvidenceRelation(
        state.evidence.find((evidence) => evidence.id === "SHOT-01")!,
        state.snapshots["after-fix"],
      ),
    ).toBe("carried");
  });

  it("adds evidence only when the run completes, never at start", () => {
    const { running, completed, draft } = completeContrastReplay();

    expect(running.evidence.some((item) => item.id === draft.run.evidenceToAdd[0].id)).toBe(false);
    expect(
      completed.evidence.some((item) => item.id === draft.run.evidenceToAdd[0].id),
    ).toBe(true);
    const ac04 = completed.acceptanceItems.find((item) => item.id === "AC-04");
    expect(ac04?.status).toBe("passed");
    expect(ac04?.confirmation.state).toBe("pending");
    expect(
      completed.runs.find((run) => run.id === draft.run.id)?.status,
    ).toBe("completed");
  });

  it("keeps manual confirmation separate from an automated pass", () => {
    const { completed } = completeContrastReplay();
    const confirmed = workspaceReducer(completed, {
      type: "CONFIRM_ACCEPTANCE",
      acceptanceId: "AC-04",
      confirmedAt: "2026-10-27T20:10:00+08:00",
    });
    const ac04 = confirmed.acceptanceItems.find((item) => item.id === "AC-04");

    expect(ac04?.confirmation.state).toBe("confirmed");
    expect(ac04?.confirmation.confirmedBy).toBe("交付负责人");
    expect(getReportReadiness(confirmed.acceptanceItems).deliverable).toBe(
      false,
    );
  });

  it("adds an AI suggestion only after explicit adoption", () => {
    const initial = createInitialDemoState();
    const before = initial.acceptanceItems.filter((item) =>
      item.id.startsWith("AC-06"),
    );
    const adopted = workspaceReducer(initial, {
      type: "ADOPT_SUGGESTION",
      suggestionId: "SUG-02",
      acceptanceId: "AC-06",
    });

    const item = adopted.acceptanceItems.find(
      (candidate) => candidate.id === "AC-06",
    );
    expect(before).toHaveLength(0);
    expect(item?.source).toBe("ai-suggestion");
    expect(item?.status).toBe("unverified");
    expect(
      adopted.suggestions.find((suggestion) => suggestion.id === "SUG-02")
        ?.state,
    ).toBe("adopted");
  });

  it("does not confirm a failed or unverified acceptance item", () => {
    const initial = createInitialDemoState();
    const unchanged = workspaceReducer(initial, {
      type: "CONFIRM_ACCEPTANCE",
      acceptanceId: "AC-04",
      confirmedAt: "2026-10-27T20:10:00+08:00",
    });

    expect(unchanged.acceptanceItems[3].confirmation.state).toBe("pending");
  });

  it("restores the complete initial scenario on reset", () => {
    const { completed } = completeContrastReplay();
    const reset = workspaceReducer(completed, { type: "RESET_DEMO" });
    const initial = createInitialDemoState();

    expect(reset.activeSnapshotId).toBe("before-fix");
    expect(reset.acceptanceItems).toEqual(initial.acceptanceItems);
    expect(reset.evidence).toEqual(initial.evidence);
    expect(reset.runs).toHaveLength(1);
  });
});
