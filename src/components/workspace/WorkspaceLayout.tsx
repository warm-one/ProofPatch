import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { DemoLabel } from "../ui/DemoLabel";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import "./WorkspaceLayout.css";

export function WorkspaceLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

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
            <span className="mono">storefront-web</span>
            <span aria-hidden="true">/</span>
            <strong>暗色模式交付验收</strong>
          </div>

          <div className="workspace-topbar__meta">
            <span className="workspace-topbar__snapshot mono">
              SNAPSHOT / BEFORE-FIX
            </span>
            <DemoLabel tone="line" />
            <Link className="workspace-topbar__exit" to="/">
              返回官网
            </Link>
          </div>
        </header>

        <main className="workspace-content" id="workspace-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
