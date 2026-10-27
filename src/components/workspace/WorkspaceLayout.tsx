import { LoaderCircle, Menu, RefreshCw, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { getActiveSnapshot } from "../../state/selectors";
import { useWorkspace } from "../../state/WorkspaceContext";
import { BrandMark } from "../ui/BrandMark";
import { DataModeBadge } from "../ui/DataModeBadge";
import { ToastRegion } from "./ToastRegion";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import "./WorkspaceLayout.css";

export function WorkspaceLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const location = useLocation();
  const { state, isRunning, isRestoringLive, resetDemo, refreshLive } =
    useWorkspace();
  const activeSnapshot = getActiveSnapshot(state);
  const runningRun = state.runs.find((run) => run.status === "running");
  const isLive = state.mode === "live";

  const refreshWorkspace = async () => {
    setRefreshing(true);
    try {
      await refreshLive();
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!sidebarOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sidebarOpen]);

  if (isRestoringLive) {
    return (
      <div className="workspace-boot">
        <BrandMark subtitle="Local evidence runtime" />
        <span className="workspace-boot__spinner" aria-hidden="true">
          <LoaderCircle size={19} />
        </span>
        <p>正在恢复本地真实会话…</p>
        <Link to="/connect">连接设置</Link>
      </div>
    );
  }

  return (
    <div className="workspace-shell">
      <a className="skip-link" href="#workspace-content">
        跳到工作区内容
      </a>

      <button
        aria-label="关闭导航"
        className={`workspace-overlay${sidebarOpen ? " is-visible" : ""}`}
        onClick={() => setSidebarOpen(false)}
        tabIndex={sidebarOpen ? 0 : -1}
        type="button"
      />

      <aside
        aria-label="工作台侧栏"
        className={`workspace-rail${sidebarOpen ? " is-open" : ""}`}
        id="workspace-sidebar"
      >
        <WorkspaceSidebar onNavigate={() => setSidebarOpen(false)} />
      </aside>

      <div className="workspace-body">
        <header className="workspace-topbar">
          <button
            aria-controls="workspace-sidebar"
            aria-expanded={sidebarOpen}
            aria-label={sidebarOpen ? "关闭导航" : "打开导航"}
            className="workspace-topbar__menu pp-icon-button"
            onClick={() => setSidebarOpen((open) => !open)}
            type="button"
          >
            {sidebarOpen ? (
              <X aria-hidden="true" size={18} />
            ) : (
              <Menu aria-hidden="true" size={18} />
            )}
          </button>

          <div className="workspace-topbar__case">
            <span className="mono">{state.project.name}</span>
            <span aria-hidden="true">/</span>
            <strong>{state.requirement.title}</strong>
          </div>

          <div className="workspace-topbar__meta">
            {runningRun && (
              <span className="workspace-topbar__running mono">
                <span aria-hidden="true" />
                {runningRun.id} / {isLive ? "命令执行中" : "回放中"}
              </span>
            )}
            <span className="workspace-topbar__snapshot mono">
              SNAPSHOT / {activeSnapshot.label}
            </span>
            <DataModeBadge mode={state.mode} />
            {isLive ? (
              <button
                aria-label="刷新真实仓库快照"
                className="workspace-topbar__reset"
                disabled={isRunning || refreshing}
                onClick={() => void refreshWorkspace()}
                title="重新读取仓库差异并检查证据是否失效"
                type="button"
              >
                <RefreshCw
                  aria-hidden="true"
                  className={refreshing ? "is-spinning" : undefined}
                  size={14}
                />
                <span>{refreshing ? "刷新中" : "刷新"}</span>
              </button>
            ) : (
              <button
                aria-label="重置演示数据"
                className="workspace-topbar__reset"
                disabled={isRunning}
                onClick={resetDemo}
                title="重置演示"
                type="button"
              >
                <RotateCcw aria-hidden="true" size={14} />
                <span>重置</span>
              </button>
            )}
            <Link className="workspace-topbar__exit" to="/">
              返回官网
            </Link>
          </div>
        </header>

        <main className="workspace-content" id="workspace-content">
          <Outlet />
        </main>
        <ToastRegion />
      </div>
    </div>
  );
}
