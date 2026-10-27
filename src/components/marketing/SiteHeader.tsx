import { ArrowUpRight, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useWorkspace } from "../../state/WorkspaceContext";
import { BrandMark } from "../ui/BrandMark";
import "./SiteHeader.css";

const navigation = [
  { label: "工作方式", href: "#workflow" },
  { label: "证据链", href: "#evidence" },
  { label: "责任边界", href: "#responsibility" },
  { label: "验收报告", href: "#report" },
];

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { state, serverStatus } = useWorkspace();
  const isLive = state.mode === "live";
  const workspaceLabel = isLive ? "打开真实工作区" : "进入工作台";

  useEffect(() => {
    if (!menuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen]);

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link
          aria-label="ProofPatch 首页"
          className="site-header__brand"
          to="/"
        >
          <BrandMark />
        </Link>

        <nav aria-label="主导航" className="site-header__nav">
          {navigation.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="site-header__actions">
          {serverStatus === "available" && (
            <Link className="site-header__local" to="/connect">
              连接本地项目
            </Link>
          )}
          <span className="site-header__demo">Interactive demo</span>
          <Link className="pp-button pp-button--secondary" to="/workspace">
            {workspaceLabel}
            <ArrowUpRight aria-hidden="true" size={15} strokeWidth={1.8} />
          </Link>
        </div>

        <button
          aria-controls="mobile-navigation"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "关闭导航" : "打开导航"}
          className="site-header__menu pp-icon-button"
          onClick={() => setMenuOpen((open) => !open)}
          type="button"
        >
          {menuOpen ? (
            <X aria-hidden="true" size={18} />
          ) : (
            <Menu aria-hidden="true" size={18} />
          )}
        </button>
      </div>

      {menuOpen && (
        <nav
          aria-label="移动端导航"
          className="site-header__mobile"
          id="mobile-navigation"
        >
          {navigation.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
              <span aria-hidden="true">↗</span>
            </a>
          ))}
          <Link
            className="pp-button pp-button--primary"
            onClick={() => setMenuOpen(false)}
            to="/workspace"
          >
            {workspaceLabel}
            <ArrowUpRight aria-hidden="true" size={16} />
          </Link>
          {serverStatus === "available" && (
            <Link
              className="site-header__mobile-local"
              onClick={() => setMenuOpen(false)}
              to="/connect"
            >
              连接本地项目
            </Link>
          )}
          <p>
            {isLive
              ? "本地真实数据 · 命令在本机执行"
              : "预置数据 · 不连接仓库 · 不执行真实测试"}
          </p>
        </nav>
      )}
    </header>
  );
}
