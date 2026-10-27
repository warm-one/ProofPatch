import type {
  AcceptanceItem,
  DemoRun,
  DiffSnapshot,
  Evidence,
  ProjectInfo,
  Requirement,
} from "./workspace";

export interface CreateLiveSessionInput {
  projectPath: string;
  baseRef: string;
  requirementTitle: string;
  requirementSummary: string;
  checks: Array<{ title: string; command: string }>;
  acknowledged: boolean;
}

export interface LiveSessionDto {
  schemaVersion: number;
  id: string;
  createdAt: string;
  updatedAt: string;
  project: ProjectInfo;
  requirement: Requirement;
  snapshot: DiffSnapshot;
  checks: AcceptanceItem[];
  evidence: Evidence[];
  runs: DemoRun[];
  selectedAcceptanceId: string;
}

export interface RepositoryInspection {
  project: ProjectInfo;
  snapshot: DiffSnapshot;
  changedFileCount: number;
  truncated: boolean;
}

export interface SessionSummary {
  id: string;
  projectName: string;
  projectPath: string;
  requirementTitle: string;
  updatedAt: string;
  checkCount: number;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
}
