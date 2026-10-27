import {
  ArrowLeft,
  ArrowRight,
  FileDiff,
  Image as ImageIcon,
  ListChecks,
  ScrollText,
  TerminalSquare,
} from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import {
  getActiveSnapshot,
  getStatusCounts,
  getUnresolvedCount,
} from "../../state/selectors";
import { useWorkspace } from "../../state/WorkspaceContext";
import { BrandMark } from "../ui/BrandMark";
import { DataModeBadge } from "../ui/DataModeBadge";
import "./WorkspaceSidebar.css";

const workspaceNavigation = [
  {
    label: "需求与变更",
    path: "/workspace/requirements",
    icon: FileDiff,
    index: "01",
  },
  {
    label: "验收矩阵",
    path: "/workspace/acceptance",
    icon: ListChecks,
    index: "02",
  },
  {
    label: "检查运行",
    path: "/workspace/runs",
    icon: TerminalSquare,
    index: "03",
  },
  {
    label: "证据索引",
    path: "/workspace/evidence",
    icon: ImageIcon,
    index: "04",
  },
  {
    label: "验收报告",
    path: "/workspace/report",
    icon: ScrollText,
    index: "05",
  },
];

interface WorkspaceSidebarProps {
  onNavigate?: () => void;
}

export function WorkspaceSidebar({ onNavigate }: WorkspaceSidebarProps) {
  const { state } = useWorkspace();
  const snapshot = getActiveSnapshot(state);
  const counts = getStatusCounts(state.acceptanceItems);
  const unresolved = getUnresolvedCount(state.acceptanceItems);
  const passedWithoutUnresolved = counts.passed > 0 && unresolved === 0;

  return (
    <div className="workspace-sidebar">
      <div className="workspace-sidebar__top">
        <Link
          aria-label="ProofPatch 首页"
          className="workspace-sidebar__brand"
          to="/"
        >
          <BrandMark subtitle="Evidence workspace" />
        </Link>
        <DataModeBadge mode={state.mode} />
      </div>

      <div className="workspace-sidebar__case">
        <span className="workspace-sidebar__case-label mono">CURRENT CASE</span>
        <strong>{state.project.name}</strong>
        <span>{state.requirement.title}</span>
        <span className="mono">
          {state.requirement.id} · {snapshot.displayName} ·{" "}
          {state.acceptanceItems.length} 项
        </span>
        <span className="workspace-sidebar__case-status">
          <span
            className={`workspace-sidebar__case-dot${passedWithoutUnresolved ? " is-clear" : ""}`}
          />
          {passedWithoutUnresolved ? "全部已确认" : `${unresolved} 项未决`}
        </span>
      </div>

      <nav aria-label="工作台导航" className="workspace-sidebar__nav">
        <span className="workspace-sidebar__nav-label mono">交付卷宗</span>
        {workspaceNavigation.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              className={({ isActive }) =>
                `workspace-sidebar__link${isActive ? " is-active" : ""}`
              }
              key={item.path}
              onClick={onNavigate}
              to={item.path}
            >
              <span className="workspace-sidebar__index mono">
                {item.index}
              </span>
              <Icon aria-hidden="true" size={16} strokeWidth={1.6} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="workspace-sidebar__bottom">
        <div
          className={`workspace-sidebar__notice${state.mode === "live" ? " is-live" : ""}`}
        >
          <span className="workspace-sidebar__notice-dot" />
          <div>
            <strong>
              {state.mode === "live" ? "本地真实模式" : "本地演示模式"}
            </strong>
            <p>
              {state.mode === "live"
                ? "命令在本机执行，证据已持久化。"
                : "不连接仓库，不执行真实测试。"}
            </p>
          </div>
        </div>
        <Link
          className="workspace-sidebar__connect"
          onClick={onNavigate}
          to="/connect"
        >
          {state.mode === "live" ? "管理本地连接" : "连接本地项目"}
          <ArrowRight aria-hidden="true" size={13} />
        </Link>
        <Link className="workspace-sidebar__back" onClick={onNavigate} to="/">
          <ArrowLeft aria-hidden="true" size={14} />
          返回产品首页
        </Link>
      </div>
    </div>
  );
}
