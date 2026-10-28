import { Outlet } from "react-router-dom";
import { SiteHeader } from "./SiteHeader";
import { BrandMark } from "../ui/BrandMark";
import "./MarketingLayout.css";

export function MarketingLayout() {
  return (
    <div className="marketing-shell">
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <SiteHeader />
      <main id="main-content">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="site-footer__inner">
          <div className="site-footer__brand">
            <BrandMark subtitle="AI delivery, verified." />
            <p>把说完成，变成可复核的完成。</p>
          </div>
          <div className="site-footer__meta">
            <span>Front-end portfolio prototype</span>
            <span>Receipts shown here are real verification records.</span>
            <span className="mono">© 2026 ProofPatch</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
