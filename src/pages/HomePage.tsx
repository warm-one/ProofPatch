import { ArrowRight, Layers3 } from "lucide-react";
import { Link } from "react-router-dom";
import { StatusBadge } from "../components/ui/StatusBadge";
import { DemoLabel } from "../components/ui/DemoLabel";
import "./HomePage.css";

/**
 * 官网首屏骨架。完整的问题叙事与交互证据链在后续阶段装配。
 */
export default function HomePage() {
  return (
    <section className="hero">
      <div className="hero__copy">
        <div className="hero__eyebrow">
          <span className="eyebrow">AI delivery, verified.</span>
          <span className="hero__eyebrow-line" />
          <span className="mono">REQ → EVIDENCE</span>
        </div>

        <h1>
          AI 写得快，
          <br />
          交付要有<span>证据。</span>
        </h1>

        <p className="hero__lede">
          ProofPatch 将需求、代码变更、测试日志与浏览器截图装订成一条可复核的验收证据链。
          <strong>AI 提供建议，工具记录事实，你确认最终交付。</strong>
        </p>

        <div className="hero__actions">
          <Link className="pp-button pp-button--primary" to="/workspace">
            打开交互演示
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
          <a className="pp-button pp-button--secondary" href="#evidence">
            查看证据如何闭合
          </a>
        </div>

        <p className="hero__disclaimer mono">
          预置数据 · 不连接仓库 · 不执行真实测试
        </p>
      </div>

      <div className="hero__artifact" aria-label="验收证据链预览">
        <figure className="evidence-board">
          <div className="evidence-board__top">
            <div>
              <span className="mono">CASE FILE / REQ-012</span>
              <h2>支持可持久化的暗色模式</h2>
            </div>
            <DemoLabel tone="line" />
          </div>

          <div className="evidence-board__diff">
            <Layers3 aria-hidden="true" size={15} strokeWidth={1.5} />
            <span className="mono">DIFF / 4 files</span>
            <span className="evidence-board__add mono">+86</span>
            <span className="evidence-board__remove mono">−21</span>
            <span className="evidence-board__commit mono">demo·a41c7f</span>
          </div>

          <div className="evidence-board__rows">
            <div className="evidence-board__row">
              <span className="mono">AC-01</span>
              <p>切换后应用暗色主题</p>
              <StatusBadge compact status="passed" />
              <span className="mono evidence-board__ref">SHOT-01</span>
            </div>
            <div className="evidence-board__row">
              <span className="mono">AC-02</span>
              <p>刷新后保持用户选择</p>
              <StatusBadge compact status="passed" />
              <span className="mono evidence-board__ref">LOG-08</span>
            </div>
            <div className="evidence-board__row is-selected">
              <span className="mono">AC-04</span>
              <p>设置页文字对比度达标</p>
              <StatusBadge compact status="failed" />
              <span className="mono evidence-board__ref">LOG-14</span>
            </div>
          </div>

          <figcaption className="evidence-board__seal">
            <div>
              <span className="mono">REPORT / DRAFT</span>
              <strong>1 个阻塞项 · 暂不可交付</strong>
            </div>
            <span className="mono">07:42:16</span>
          </figcaption>
        </figure>
        <span className="hero__artifact-note mono">
          点击工作台开始逐项核验 →
        </span>
      </div>
    </section>
  );
}
