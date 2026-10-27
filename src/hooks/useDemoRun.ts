import { useEffect } from "react";
import type { WorkspaceAction, WorkspaceState } from "../types/workspace";
import { getRunningRun } from "../state/selectors";

/**
 * 用可清理的定时器推动一次预置回放。
 * 离开页面、重置或 StrictMode 重复挂载时，旧计时器都会停止，不会污染新运行。
 */
export function useDemoRun(
  state: WorkspaceState,
  dispatch: React.Dispatch<WorkspaceAction>,
) {
  const runningRun = getRunningRun(state);
  const runId = runningRun?.id;
  const visibleLogCount = runningRun?.visibleLogCount ?? 0;
  const totalLogCount = runningRun?.logs.length ?? 0;
  const complete = visibleLogCount >= totalLogCount;

  useEffect(() => {
    if (!runId) return;

    const timeout = window.setTimeout(
      () => {
        dispatch(
          complete
            ? { type: "COMPLETE_RUN", runId }
            : { type: "REVEAL_RUN_LOG", runId },
        );
      },
      complete ? 420 : 190,
    );

    return () => window.clearTimeout(timeout);
  }, [complete, dispatch, runId, totalLogCount, visibleLogCount]);

  return runningRun;
}
