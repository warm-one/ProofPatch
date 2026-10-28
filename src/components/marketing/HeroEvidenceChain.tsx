import {
  ArrowRight,
  FileText,
  Image as ImageIcon,
  TerminalSquare,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { DemoLabel } from "../ui/DemoLabel";
import { StatusBadge, type AcceptanceStatus } from "../ui/StatusBadge";
import "./HeroEvidenceChain.css";

interface HeroCheck {
  id: string;
  label: string;
  status: AcceptanceStatus;
  evidenceRef: string;
  evidenceKind: "截图" | "日志";
  detail: string;
  log: string;
}

const heroChecks: HeroCheck[] = [
  {
    id: "AC-01",
    label: "切换后应用暗色主题",
    status: "passed",
    evidenceRef: "SHOT-01",
    evidenceKind: "截图",
    detail:
      "桌面视口截图已保存。切换后页面背景、正文与控件均进入暗色主题，未发现残留的浅色面板。",
    log: "viewport 1440×900 · theme=dark · captured",
  },
  {
    id: "AC-02",
    label: "刷新后保持用户选择",
    status: "passed",
    evidenceRef: "LOG-08",
    evidenceKind: "日志",
    detail:
      "刷新后从本地偏好恢复主题，页面首帧即为暗色。证据归属于当前 before-fix 快照。",
    log: 'localStorage.theme = "dark" → html[data-theme="dark"]',
  },
  {
    id: "AC-04",
    label: "设置页文字对比度达标",
    status: "failed",
    evidenceRef: "LOG-14",
    evidenceKind: "日志",
    detail:
      "设置页次要文字的实测对比度不足。该失败项会阻塞交付，直到样式修复并在新快照中重新验证。",
    log: "Expected contrast >= 4.5, received 3.8",
  },
];

/**
 * 首屏证据链：用真实可点击的 DOM 展示“验收项—证据—报告状态”的关系。
 */
export function HeroEvidenceChain() {
  const [activeId, setActiveId] = useState("AC-04");
  const activeCheck =
    heroChecks.find((check) => check.id === activeId) ?? heroChecks[2];

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
          <Link className="pp-button pp-button--primary" to="/receipt">
            看一份真实回执
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
          <a className="pp-button pp-button--secondary" href="#evidence">
            查看证据如何闭合
          </a>
        </div>

        <p className="hero__disclaimer mono">
          回执来自一次真实的本地验证 · 哈希可在你的浏览器里重算
        </p>
      </div>

      <div className="hero__artifact">
        <figure className="evidence-board" aria-label="验收证据链交互预览">
          <div className="evidence-board__top">
            <div>
              <span className="mono">CASE FILE / REQ-012</span>
              <h2>支持可持久化的暗色模式</h2>
            </div>
            <DemoLabel tone="line" />
          </div>

          <div className="evidence-board__diff">
            <FileText aria-hidden="true" size={15} strokeWidth={1.5} />
            <span className="mono">DIFF / 4 files</span>
            <span className="evidence-board__add mono">+86</span>
            <span className="evidence-board__remove mono">−21</span>
            <span className="evidence-board__commit mono">demo·a41c7f</span>
          </div>

          <div className="evidence-board__rows">
            {heroChecks.map((check) => {
              const selected = activeId === check.id;
              return (
                <button
                  aria-pressed={selected}
                  className={`evidence-board__row${selected ? " is-selected" : ""}${check.status === "failed" ? " is-risk" : ""}`}
                  key={check.id}
                  onClick={() => setActiveId(check.id)}
                  type="button"
                >
                  <span className="mono">{check.id}</span>
                  <p>{check.label}</p>
                  <StatusBadge compact status={check.status} />
                  <span className="mono evidence-board__ref">
                    {check.evidenceRef}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            aria-live="polite"
            className="evidence-board__inspect"
            key={activeCheck.id}
          >
            <div className="evidence-board__inspect-top">
              <span className="mono">
                {activeCheck.evidenceKind === "截图" ? (
                  <ImageIcon aria-hidden="true" size={12} />
                ) : (
                  <TerminalSquare aria-hidden="true" size={12} />
                )}
                EVIDENCE VIEW
              </span>
              <span className="mono">{activeCheck.evidenceRef}</span>
            </div>
            <p>{activeCheck.detail}</p>
            <code className="mono">
              <span aria-hidden="true">›</span> {activeCheck.log}
            </code>
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
          选择任一验收项，查看它对应的证据 →
        </span>
      </div>
    </section>
  );
}
