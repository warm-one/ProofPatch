import {
  ArrowLeft,
  FileDiff,
  Image as ImageIcon,
  ListChecks,
  ScrollText,
  TerminalSquare,
} from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { BrandMark } from "../ui/BrandMark";
import { DemoLabel } from "../ui/DemoLabel";
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
        <DemoLabel tone="line" />
      </div>

      <div className="workspace-sidebar__case">
        <span className="workspace-sidebar__case-label mono">CURRENT CASE</span>
        <strong>storefront-web</strong>
        <span>暗色模式交付验收</span>
        <span className="mono">REQ-012 · 5 项</span>
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
        <div className="workspace-sidebar__notice">
          <span className="workspace-sidebar__notice-dot" />
          <div>
            <strong>本地演示模式</strong>
            <p>不连接仓库，不执行真实测试。</p>
          </div>
        </div>
        <Link className="workspace-sidebar__back" onClick={onNavigate} to="/">
          <ArrowLeft aria-hidden="true" size={14} />
          返回产品首页
        </Link>
      </div>
    </div>
  );
}
