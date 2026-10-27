import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  checkLocalServer,
  confirmLiveCheck,
  createLiveSession,
  getLiveSession,
  interruptLiveSession,
  refreshLiveSession,
  runLiveCheck,
} from "../api/localServer";
import { createInitialDemoState } from "../demo/initialData";
import { createDemoRun } from "../demo/runScripts";
import { useDemoRun } from "../hooks/useDemoRun";
import type {
  CreateLiveSessionInput,
  LiveSessionDto,
} from "../types/live";
import type {
  DemoRun,
  SnapshotId,
  Toast,
  ToastTone,
  WorkspaceState,
} from "../types/workspace";
import {
  canConfirmAcceptance,
  getNextAcceptanceId,
  getRunningRun,
  isRunActive,
} from "./selectors";
import {
  liveModeStorageKey,
  liveSessionStorageKey,
  mapLiveSessionToWorkspace,
} from "./liveSession";
import { workspaceReducer } from "./workspaceReducer";

type ServerStatus = "checking" | "available" | "unavailable";

interface WorkspaceContextValue {
  state: WorkspaceState;
  isRunning: boolean;
  isRestoringLive: boolean;
  serverStatus: ServerStatus;
  activeSessionId?: string;
  selectAcceptance: (acceptanceId: string) => void;
  loadSnapshot: (snapshotId: SnapshotId) => void;
  startAcceptanceRun: (acceptanceId: string) => Promise<void>;
  interruptRun: () => void;
  confirmAcceptance: (acceptanceId: string) => Promise<void>;
  adoptSuggestion: (suggestionId: string) => void;
  resetDemo: () => void;
  connectProject: (input: CreateLiveSessionInput) => Promise<LiveSessionDto>;
  openLiveSession: (sessionId: string) => Promise<void>;
  disconnectLive: () => void;
  refreshLive: () => Promise<boolean>;
  refreshServerStatus: () => Promise<boolean>;
  notify: (message: string, tone?: ToastTone) => void;
  dismissToast: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function makeToast(message: string, tone: ToastTone = "info"): Toast {
  return {
    id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    message,
    tone,
  };
}

function savePreference(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // 本地存储被禁用时应静默退化，不影响当前会话操作。
  }
}

function readPreference(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "本地服务请求失败。";
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [demoState, demoDispatch] = useReducer(
    workspaceReducer,
    undefined,
    createInitialDemoState,
  );
  const [liveState, setLiveState] = useState<WorkspaceState | null>(null);
  const [serverStatus, setServerStatus] =
    useState<ServerStatus>("checking");
  const [isRestoringLive, setIsRestoringLive] = useState(
    () =>
      readPreference(liveModeStorageKey()) === "live" &&
      Boolean(readPreference(liveSessionStorageKey())),
  );
  const liveStateRef = useRef<WorkspaceState | null>(null);

  liveStateRef.current = liveState;
  useDemoRun(demoState, demoDispatch);

  const state = liveState ?? demoState;
  const hasRunningLive = Boolean(
    liveState?.runs.some((run) => run.status === "running"),
  );

  const refreshServerStatus = useCallback(async () => {
    const available = await checkLocalServer();
    setServerStatus(available ? "available" : "unavailable");
    return available;
  }, []);

  useEffect(() => {
    if (import.meta.env.MODE === "test") {
      setServerStatus("unavailable");
      setIsRestoringLive(false);
      return;
    }

    let cancelled = false;
    const restore = async () => {
      const savedMode = readPreference(liveModeStorageKey());
      const savedSessionId = readPreference(liveSessionStorageKey());
      const shouldRestore =
        savedMode === "live" && Boolean(savedSessionId);

      if (!shouldRestore) setIsRestoringLive(false);

      const available = await refreshServerStatus();
      if (cancelled) return;
      if (!available) {
        setIsRestoringLive(false);
        return;
      }
      if (!shouldRestore || !savedSessionId) {
        setIsRestoringLive(false);
        return;
      }

      try {
        const session = await getLiveSession(savedSessionId);
        if (cancelled) return;
        setLiveState(mapLiveSessionToWorkspace(session));
      } catch {
        savePreference(liveModeStorageKey(), null);
        savePreference(liveSessionStorageKey(), null);
      } finally {
        if (!cancelled) setIsRestoringLive(false);
      }
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, [refreshServerStatus]);

  useEffect(() => {
    const sessionId = liveStateRef.current?.sessionId;
    if (!sessionId || !hasRunningLive) return;

    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const session = await getLiveSession(sessionId);
        if (cancelled) return;
        setLiveState((current) => {
          const mapped = mapLiveSessionToWorkspace(session);
          const selected = current?.selectedAcceptanceId;
          return {
            ...mapped,
            selectedAcceptanceId:
              selected &&
              mapped.acceptanceItems.some((item) => item.id === selected)
                ? selected
                : mapped.selectedAcceptanceId,
          };
        });
      } catch {
        // 本地服务可能暂时忙；保持当前运行状态并短暂重试。
      }
      if (!cancelled) {
        timer = window.setTimeout(poll, 1_500);
      }
    };

    timer = window.setTimeout(poll, 1_200);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [hasRunningLive, liveState?.sessionId]);

  const selectAcceptance = useCallback((acceptanceId: string) => {
    if (liveStateRef.current) {
      setLiveState((current) =>
        current ? { ...current, selectedAcceptanceId: acceptanceId } : current,
      );
      return;
    }
    demoDispatch({ type: "SELECT_ACCEPTANCE", acceptanceId });
  }, []);

  const loadSnapshot = useCallback(
    (snapshotId: SnapshotId) => {
      if (liveStateRef.current || isRunActive(demoState)) return;
      demoDispatch({ type: "SET_SNAPSHOT", snapshotId });
    },
    [demoState],
  );

  const notify = useCallback((message: string, tone: ToastTone = "info") => {
    const toast = makeToast(message, tone);
    if (liveStateRef.current) {
      setLiveState((current) => (current ? { ...current, toast } : current));
      return;
    }
    demoDispatch({ type: "SHOW_TOAST", toast });
  }, []);

  const startAcceptanceRun = useCallback(
    async (acceptanceId: string) => {
      const currentLive = liveStateRef.current;

      if (!currentLive) {
        if (isRunActive(demoState)) return;
        const target = demoState.acceptanceItems.find(
          (item) => item.id === acceptanceId,
        );
        if (!target) return;

        const draft = createDemoRun({
          target,
          snapshot: demoState.snapshots[demoState.activeSnapshotId],
          runNumber: demoState.nextRunNumber,
          logNumber: demoState.nextLogNumber,
          shotNumber: demoState.nextShotNumber,
        });

        demoDispatch({ type: "SELECT_ACCEPTANCE", acceptanceId });
        demoDispatch({
          type: "START_RUN",
          run: draft.run,
          nextRunNumber: draft.nextRunNumber,
          nextLogNumber: draft.nextLogNumber,
          nextShotNumber: draft.nextShotNumber,
        });
        return;
      }

      if (isRunActive(currentLive) || !currentLive.sessionId) return;
      const target = currentLive.acceptanceItems.find(
        (item) => item.id === acceptanceId,
      );
      if (!target || !target.command) {
        notify("该检查项没有可执行命令。", "warning");
        return;
      }

      const optimisticRun: DemoRun = {
        id: `RUN-PENDING-${Date.now()}`,
        snapshotId: currentLive.activeSnapshotId,
        label: target.title,
        command: target.command,
        status: "running",
        startedAt: new Date().toISOString(),
        acceptanceIds: [target.id],
        outcomes: {},
        logs: [
          {
            id: `run-pending-${Date.now()}`,
            at: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
            tone: "command",
            text: `$ ${target.command}`,
          },
        ],
        visibleLogCount: 1,
        evidenceToAdd: [],
        caption: "正在本地项目中执行真实命令。",
      };

      setLiveState({
        ...currentLive,
        selectedAcceptanceId: target.id,
        runs: [...currentLive.runs, optimisticRun],
        activeRunId: optimisticRun.id,
      });

      try {
        const session = await runLiveCheck(
          currentLive.sessionId,
          acceptanceId,
        );
        const mapped = mapLiveSessionToWorkspace(session);
        const updatedCheck = mapped.acceptanceItems.find(
          (item) => item.id === acceptanceId,
        );
        const latestRun = mapped.runs[mapped.runs.length - 1];
        const tone: ToastTone =
          updatedCheck?.status === "passed" ? "success" : "warning";
        setLiveState({
          ...mapped,
          toast: makeToast(
            updatedCheck?.status === "passed"
              ? `${latestRun?.id ?? "检查"} 已通过，等待人工确认。`
              : `${latestRun?.id ?? "检查"} 未通过，失败原因已写入证据。`,
            tone,
          ),
        });
      } catch (error) {
        try {
          const session = await getLiveSession(currentLive.sessionId);
          setLiveState({
            ...mapLiveSessionToWorkspace(session),
            toast: makeToast(errorMessage(error), "warning"),
          });
        } catch {
          setLiveState({
            ...currentLive,
            runs: currentLive.runs.filter(
              (run) => run.id !== optimisticRun.id,
            ),
            activeRunId: undefined,
            toast: makeToast(errorMessage(error), "warning"),
          });
        }
      }
    },
    [demoState, notify],
  );

  const interruptRun = useCallback(() => {
    const currentLive = liveStateRef.current;
    if (currentLive?.sessionId) {
      const running = getRunningRun(currentLive);
      if (!running) return;
      void interruptLiveSession(currentLive.sessionId)
        .then(() => {
          notify("已请求中止本地命令，等待进程退出。", "warning");
        })
        .catch((error) => {
          notify(errorMessage(error), "warning");
        });
      return;
    }

    const running = getRunningRun(demoState);
    if (!running) return;
    demoDispatch({ type: "INTERRUPT_RUN", runId: running.id });
  }, [demoState, notify]);

  const confirmAcceptance = useCallback(
    async (acceptanceId: string) => {
      const currentLive = liveStateRef.current;
      if (!currentLive) {
        const item = demoState.acceptanceItems.find(
          (candidate) => candidate.id === acceptanceId,
        );
        if (!item || !canConfirmAcceptance(item, demoState)) return;
        demoDispatch({
          type: "CONFIRM_ACCEPTANCE",
          acceptanceId,
          confirmedAt: new Date().toISOString(),
        });
        return;
      }

      if (!currentLive.sessionId) return;
      try {
        const session = await confirmLiveCheck(
          currentLive.sessionId,
          acceptanceId,
        );
        setLiveState({
          ...mapLiveSessionToWorkspace(session),
          toast: makeToast(
            `${acceptanceId} 已由本机负责人确认。自动结果现在才成为交付结论。`,
            "success",
          ),
        });
      } catch (error) {
        notify(errorMessage(error), "warning");
      }
    },
    [demoState, notify],
  );

  const adoptSuggestion = useCallback(
    (suggestionId: string) => {
      if (liveStateRef.current) return;
      const suggestion = demoState.suggestions.find(
        (candidate) => candidate.id === suggestionId,
      );
      if (!suggestion || suggestion.state === "adopted") return;

      demoDispatch({
        type: "ADOPT_SUGGESTION",
        suggestionId,
        acceptanceId: getNextAcceptanceId(demoState.acceptanceItems),
      });
    },
    [demoState],
  );

  const resetDemo = useCallback(() => {
    demoDispatch({ type: "RESET_DEMO" });
  }, []);

  const connectProject = useCallback(
    async (input: CreateLiveSessionInput) => {
      const session = await createLiveSession(input);
      setLiveState(mapLiveSessionToWorkspace(session));
      setServerStatus("available");
      savePreference(liveSessionStorageKey(), session.id);
      savePreference(liveModeStorageKey(), "live");
      return session;
    },
    [],
  );

  const openLiveSession = useCallback(async (sessionId: string) => {
    const session = await getLiveSession(sessionId);
    setLiveState(mapLiveSessionToWorkspace(session));
    setServerStatus("available");
    savePreference(liveSessionStorageKey(), session.id);
    savePreference(liveModeStorageKey(), "live");
  }, []);

  const disconnectLive = useCallback(() => {
    setLiveState(null);
    savePreference(liveModeStorageKey(), "demo");
  }, []);

  const refreshLive = useCallback(async () => {
    const currentLive = liveStateRef.current;
    if (!currentLive?.sessionId) return false;
    if (isRunActive(currentLive)) {
      notify("请等待当前检查结束再刷新仓库。", "warning");
      return false;
    }

    try {
      const result = await refreshLiveSession(currentLive.sessionId);
      setLiveState({
        ...mapLiveSessionToWorkspace(result.session),
        toast: makeToast(
          result.invalidated
            ? "仓库内容已变化。旧证据保留为历史，所有验收项回到未验证。"
            : "工作区快照已刷新，仓库内容没有变化。",
          result.invalidated ? "warning" : "info",
        ),
      });
      return result.invalidated;
    } catch (error) {
      notify(errorMessage(error), "warning");
      return false;
    }
  }, [notify]);

  const dismissToast = useCallback(() => {
    if (liveStateRef.current) {
      setLiveState((current) =>
        current ? { ...current, toast: undefined } : current,
      );
      return;
    }
    if (!demoState.toast) return;
    demoDispatch({ type: "DISMISS_TOAST", toastId: demoState.toast.id });
  }, [demoState.toast]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      state,
      isRunning: isRunActive(state),
      isRestoringLive,
      serverStatus,
      activeSessionId: liveState?.sessionId,
      selectAcceptance,
      loadSnapshot,
      startAcceptanceRun,
      interruptRun,
      confirmAcceptance,
      adoptSuggestion,
      resetDemo,
      connectProject,
      openLiveSession,
      disconnectLive,
      refreshLive,
      refreshServerStatus,
      notify,
      dismissToast,
    }),
    [
      adoptSuggestion,
      confirmAcceptance,
      connectProject,
      disconnectLive,
      dismissToast,
      interruptRun,
      isRestoringLive,
      liveState?.sessionId,
      loadSnapshot,
      notify,
      openLiveSession,
      refreshLive,
      refreshServerStatus,
      resetDemo,
      selectAcceptance,
      serverStatus,
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
