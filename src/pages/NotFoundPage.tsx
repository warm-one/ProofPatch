import { ArrowLeft, Compass } from "lucide-react";
import { Link } from "react-router-dom";
import "./NotFoundPage.css";

export function NotFoundPage() {
  return (
    <section className="not-found">
      <span className="mono">404 / FILE NOT FOUND</span>
      <Compass aria-hidden="true" size={26} strokeWidth={1.4} />
      <h1>这页没有装进卷宗。</h1>
      <p>路径可能已变更，或该视图只存在于演示流程之外。</p>
      <div className="not-found__actions">
        <Link className="pp-button pp-button--primary" to="/workspace">
          进入交互工作台
        </Link>
        <Link className="pp-button pp-button--secondary" to="/">
          <ArrowLeft aria-hidden="true" size={15} />
          返回产品首页
        </Link>
      </div>
    </section>
  );
}
