import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { createInitialDemoState } from "../demo/initialData";
import { createDemoRun } from "../demo/runScripts";
import { canConfirmAcceptance, getNextAcceptanceId, getRunningRun, isRunActive } from "./selectors";
import { workspaceReducer } from "./workspaceReducer";
import { useDemoRun } from "../hooks/useDemoRun";
import type { SnapshotId, ToastTone, WorkspaceState } from "../types/workspace";

interface WorkspaceContextValue {
  state: WorkspaceState;
  isRunning: boolean;
  selectAcceptance: (acceptanceId: string) => void;
  loadSnapshot: (snapshotId: SnapshotId) => void;
  startAcceptanceRun: (acceptanceId: string) => void;
  interruptRun: () => void;
  confirmAcceptance: (acceptanceId: string) => void;
  adoptSuggestion: (suggestionId: string) => void;
  resetDemo: () => void;
  notify: (message: string, tone?: ToastTone) => void;
  dismissToast: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(
    workspaceReducer,
    undefined,
    createInitialDemoState,
  );

  useDemoRun(state, dispatch);

  const selectAcceptance = useCallback((acceptanceId: string) => {
    dispatch({ type: "SELECT_ACCEPTANCE", acceptanceId });
  }, []);

  const loadSnapshot = useCallback(
    (snapshotId: SnapshotId) => {
      if (isRunActive(state)) return;
      dispatch({ type: "SET_SNAPSHOT", snapshotId });
    },
    [state],
  );

  const startAcceptanceRun = useCallback(
    (acceptanceId: string) => {
      if (isRunActive(state)) return;

      const target = state.acceptanceItems.find(
        (item) => item.id === acceptanceId,
      );
      if (!target) return;

      const draft = createDemoRun({
        target,
        snapshot: state.snapshots[state.activeSnapshotId],
        runNumber: state.nextRunNumber,
        logNumber: state.nextLogNumber,
        shotNumber: state.nextShotNumber,
      });

      dispatch({ type: "SELECT_ACCEPTANCE", acceptanceId });
      dispatch({
        type: "START_RUN",
        run: draft.run,
        nextRunNumber: draft.nextRunNumber,
        nextLogNumber: draft.nextLogNumber,
        nextShotNumber: draft.nextShotNumber,
      });
    },
    [state],
  );

  const interruptRun = useCallback(() => {
    const running = getRunningRun(state);
    if (!running) return;
    dispatch({ type: "INTERRUPT_RUN", runId: running.id });
  }, [state]);

  const confirmAcceptance = useCallback(
    (acceptanceId: string) => {
      const item = state.acceptanceItems.find(
        (candidate) => candidate.id === acceptanceId,
      );
      if (!item || !canConfirmAcceptance(item, state)) return;

      dispatch({
        type: "CONFIRM_ACCEPTANCE",
        acceptanceId,
        confirmedAt: new Date().toISOString(),
      });
    },
    [state],
  );

  const adoptSuggestion = useCallback(
    (suggestionId: string) => {
      const suggestion = state.suggestions.find(
        (candidate) => candidate.id === suggestionId,
      );
      if (!suggestion || suggestion.state === "adopted") return;

      dispatch({
        type: "ADOPT_SUGGESTION",
        suggestionId,
        acceptanceId: getNextAcceptanceId(state.acceptanceItems),
      });
    },
    [state],
  );

  const resetDemo = useCallback(() => {
    dispatch({ type: "RESET_DEMO" });
  }, []);

  const notify = useCallback((message: string, tone: ToastTone = "info") => {
    dispatch({
      type: "SHOW_TOAST",
      toast: {
        id: `toast-${Date.now()}`,
        message,
        tone,
      },
    });
  }, []);

  const dismissToast = useCallback(() => {
    if (!state.toast) return;
    dispatch({ type: "DISMISS_TOAST", toastId: state.toast.id });
  }, [state.toast]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      state,
      isRunning: isRunActive(state),
      selectAcceptance,
      loadSnapshot,
      startAcceptanceRun,
      interruptRun,
      confirmAcceptance,
      adoptSuggestion,
      resetDemo,
      notify,
      dismissToast,
    }),
    [
      adoptSuggestion,
      confirmAcceptance,
      dismissToast,
      interruptRun,
      loadSnapshot,
      notify,
      resetDemo,
      selectAcceptance,
      startAcceptanceRun,
      state,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used inside WorkspaceProvider");
  }
  return context;
}
