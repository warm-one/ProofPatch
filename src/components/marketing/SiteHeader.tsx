import { ArrowUpRight, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
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
  const { pathname } = useLocation();
  // 首页点导航只滚动；其他页面（如回执查看器）需要带前缀跳回首页锚点。
  const sectionHref = (hash: string) => (pathname === "/" ? hash : `/${hash}`);

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
            <a key={item.href} href={sectionHref(item.href)}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="site-header__actions">
          <span className="site-header__demo">Receipt viewer</span>
          <Link className="pp-button pp-button--secondary" to="/receipt">
            查看验收回执
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
              href={sectionHref(item.href)}
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
              <span aria-hidden="true">↗</span>
            </a>
          ))}
          <Link
            className="pp-button pp-button--primary"
            onClick={() => setMenuOpen(false)}
            to="/receipt"
          >
            查看验收回执
            <ArrowUpRight aria-hidden="true" size={16} />
          </Link>
          <p>回执来自真实验证 · 哈希可在浏览器内重算</p>
        </nav>
      )}
    </header>
  );
}
