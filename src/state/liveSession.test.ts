import { describe, expect, it } from "vitest";
import { mapLiveSessionToWorkspace } from "./liveSession";
import { getCurrentEvidence, getEvidenceRelation } from "./selectors";
import type { LiveSessionDto } from "../types/live";
import type { Evidence } from "../types/workspace";

const evidence: Evidence = {
  id: "LOG-001",
  kind: "test-log",
  title: "构建输出",
  description: "真实命令输出",
  runId: "RUN-001",
  snapshotId: "live",
  acceptanceIds: ["AC-01"],
  capturedAt: "2026-10-27T13:00:00.000Z",
  scopePaths: [],
  fingerprint: "fingerprint-a",
  content: "build ok",
  isDemo: false,
};

function makeSession(): LiveSessionDto {
  return {
    schemaVersion: 1,
    id: "session-12345678",
    createdAt: "2026-10-27T12:59:00.000Z",
    updatedAt: "2026-10-27T13:01:00.000Z",
    project: {
      name: "notes-app",
      path: "D:/projects/notes-app",
      branch: "main",
      baseRef: "HEAD",
      headCommit: "abc1234",
      packageManager: "npm",
      scripts: { build: "node build.mjs" },
    },
    requirement: {
      id: "REQ-LOCAL",
      title: "真实交付",
      summary: "真实命令检查",
      inScope: ["项目构建"],
      outOfScope: [],
    },
    snapshot: {
      id: "live",
      label: "WORKING TREE",
      displayName: "工作区快照",
      commit: "abc1234",
      createdAt: "2026-10-27T12:59:00.000Z",
      summary: "main · 1 file",
      changedPaths: ["src/index.js"],
      files: [],
      fingerprint: "fingerprint-a",
    },
    checks: [
      {
        id: "AC-01",
        title: "项目构建",
        criterion: "命令退出码为 0",
        status: "passed",
        source: "human",
        command: "npm run build",
        codeLinks: [],
        evidenceIds: ["LOG-001"],
        confirmation: { state: "pending" },
      },
    ],
    evidence: [evidence],
    runs: [
      {
        id: "RUN-001",
        snapshotId: "live",
        label: "项目构建",
        command: "npm run build",
        status: "completed",
        startedAt: "2026-10-27T12:59:30.000Z",
        finishedAt: "2026-10-27T12:59:32.000Z",
        acceptanceIds: ["AC-01"],
        outcomes: { "AC-01": "passed" },
        logs: [],
        visibleLogCount: 0,
        evidenceToAdd: [],
        caption: "通过",
      },
    ],
    selectedAcceptanceId: "AC-01",
  };
}

describe("live session mapping", () => {
  it("maps real evidence without marking it as demo", () => {
    const state = mapLiveSessionToWorkspace(makeSession());

    expect(state.mode).toBe("live");
    expect(state.sessionId).toBe("session-12345678");
    expect(state.project.name).toBe("notes-app");
    expect(state.evidence[0].isDemo).toBe(false);
    expect(state.acceptanceItems[0].command).toBe("npm run build");
    expect(state.suggestions).toEqual([]);
  });

  it("marks evidence stale when the repository fingerprint changes", () => {
    const state = mapLiveSessionToWorkspace(makeSession());
    const snapshot = state.snapshots[state.activeSnapshotId];
    const updatedSnapshot = {
      ...snapshot,
      fingerprint: "fingerprint-b",
    };

    expect(getEvidenceRelation(state.evidence[0], snapshot)).toBe("current");
    expect(getEvidenceRelation(state.evidence[0], updatedSnapshot)).toBe(
      "stale",
    );
    expect(
      getCurrentEvidence(state.acceptanceItems[0], {
        ...state,
        snapshots: { live: updatedSnapshot },
      }),
    ).toHaveLength(0);
  });
});
