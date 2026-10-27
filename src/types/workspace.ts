export type AcceptanceStatus = "passed" | "failed" | "unverified";
export type SnapshotId = "before-fix" | "after-fix";
export type ConfirmationState = "pending" | "confirmed";
export type EvidenceKind = "test-log" | "browser-screenshot";
export type RunStatus = "running" | "completed" | "interrupted";
export type SuggestionState = "pending" | "adopted";
export type AcceptanceSource = "human" | "ai-suggestion";
export type ToastTone = "info" | "success" | "warning";

export interface Requirement {
  id: string;
  title: string;
  summary: string;
  inScope: string[];
  outOfScope: string[];
}

export interface CodeLink {
  filePath: string;
  lineStart: number;
  lineEnd: number;
  symbol: string;
}

export interface DiffLine {
  type: "context" | "add" | "remove";
  oldNumber?: number;
  newNumber?: number;
  content: string;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface DiffFile {
  path: string;
  status: "added" | "modified";
  additions: number;
  deletions: number;
  relatedAcceptanceIds: string[];
  hunks: DiffHunk[];
}

export interface DiffSnapshot {
  id: SnapshotId;
  label: string;
  displayName: string;
  commit: string;
  createdAt: string;
  summary: string;
  changedPaths: string[];
  files: DiffFile[];
}

export interface Confirmation {
  state: ConfirmationState;
  confirmedAt?: string;
  confirmedBy?: string;
}

export interface AcceptanceItem {
  id: string;
  title: string;
  criterion: string;
  status: AcceptanceStatus;
  source: AcceptanceSource;
  codeLinks: CodeLink[];
  evidenceIds: string[];
  confirmation: Confirmation;
}

export interface Evidence {
  id: string;
  kind: EvidenceKind;
  title: string;
  description: string;
  runId: string;
  snapshotId: SnapshotId;
  acceptanceIds: string[];
  capturedAt: string;
  scopePaths: string[];
  imageSrc?: string;
  content?: string;
  isDemo: true;
}

export interface RunLogLine {
  id: string;
  at: string;
  tone: "info" | "pass" | "fail" | "command";
  text: string;
}

export interface DemoRun {
  id: string;
  snapshotId: SnapshotId;
  label: string;
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  acceptanceIds: string[];
  outcomes: Record<string, AcceptanceStatus>;
  logs: RunLogLine[];
  visibleLogCount: number;
  evidenceToAdd: Evidence[];
  caption: string;
}

export interface AiSuggestion {
  id: string;
  title: string;
  criterion: string;
  rationale: string;
  state: SuggestionState;
  targetAcceptanceId?: string;
}

export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
}

export interface WorkspaceState {
  requirement: Requirement;
  snapshots: Record<SnapshotId, DiffSnapshot>;
  activeSnapshotId: SnapshotId;
  acceptanceItems: AcceptanceItem[];
  evidence: Evidence[];
  runs: DemoRun[];
  suggestions: AiSuggestion[];
  selectedAcceptanceId: string;
  activeRunId?: string;
  nextRunNumber: number;
  nextLogNumber: number;
  nextShotNumber: number;
  toast?: Toast;
}

export type WorkspaceAction =
  | { type: "SELECT_ACCEPTANCE"; acceptanceId: string }
  | { type: "SET_SNAPSHOT"; snapshotId: SnapshotId }
  | {
      type: "START_RUN";
      run: DemoRun;
      nextRunNumber: number;
      nextLogNumber: number;
      nextShotNumber: number;
    }
  | { type: "REVEAL_RUN_LOG"; runId: string }
  | { type: "COMPLETE_RUN"; runId: string }
  | { type: "INTERRUPT_RUN"; runId: string }
  | {
      type: "CONFIRM_ACCEPTANCE";
      acceptanceId: string;
      confirmedAt: string;
    }
  | {
      type: "ADOPT_SUGGESTION";
      suggestionId: string;
      acceptanceId: string;
    }
  | { type: "RESET_DEMO" }
  | { type: "SHOW_TOAST"; toast: Toast }
  | { type: "DISMISS_TOAST"; toastId: string };
