import {
  ArrowRight,
  Check,
  Circle,
  Copy,
  FileCheck2,
  FileText,
  Printer,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { BrandMark } from "../components/ui/BrandMark";
import { DataModeBadge } from "../components/ui/DataModeBadge";
import { StatusBadge } from "../components/ui/StatusBadge";
import { WorkspacePageHeader } from "../components/workspace/WorkspacePageHeader";
import {
  formatDemoTimestamp,
  getActiveSnapshot,
  getConfirmedCount,
  getCurrentEvidence,
  getEvidenceRelation,
  getReportReadiness,
  getStatusCounts,
} from "../state/selectors";
import { useWorkspace } from "../state/WorkspaceContext";
import { copyText } from "../utils/clipboard";
import { buildReportSummary } from "../utils/report";
import "./ReportPage.css";

export default function ReportPage() {
  const { state, notify } = useWorkspace();
  const [copied, setCopied] = useState(false);
  const activeSnapshot = getActiveSnapshot(state);
  const counts = getStatusCounts(state.acceptanceItems);
  const confirmedCount = getConfirmedCount(state.acceptanceItems);
  const readiness = getReportReadiness(state.acceptanceItems);
  const generatedAt = new Date().toISOString();
  const isLive = state.mode === "live";
  const reportId = isLive
    ? `REPORT-LOCAL-${state.sessionId?.slice(0, 6).toUpperCase() ?? "SESSION"}`
    : `REPORT-${state.requirement.id.replace("REQ-", "")}-${activeSnapshot.label}`;
  const unresolvedItems = state.acceptanceItems.filter(
    (item) =>
      item.status !== "passed" ||
      item.confirmation.state !== "confirmed",
  );
  const confirmedItems = state.acceptanceItems.filter(
    (item) => item.confirmation.state === "confirmed",
  );
  const checks = [
    {
      label: "没有失败项",
      passed: counts.failed === 0,
      detail: `${counts.failed} 项失败`,
    },
    {
      label: "没有未验证项",
      passed: counts.unverified === 0,
      detail: `${counts.unverified} 项未验证`,
    },
    {
      label: "所有通过项均由人确认",
      passed:
        counts.passed > 0 &&
        counts.passed === confirmedCount &&
        counts.failed === 0 &&
        counts.unverified === 0,
      detail: `${confirmedCount} / ${state.acceptanceItems.length} 项已确认`,
    },
    {
      label: "通过项具有当前有效证据",
      passed: state.acceptanceItems
        .filter((item) => item.status === "passed")
        .every((item) => getCurrentEvidence(item, state).length > 0),
      detail: "按归属快照判断",
    },
  ];

  const copySummary = async () => {
    const success = await copyText(buildReportSummary(state));
    setCopied(success);
    notify(
      success
        ? "报告摘要已复制，可用于提交说明或提交记录。"
        : "剪贴板不可用，请手动选择报告内容。",
      success ? "success" : "warning",
    );
    if (success) window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <section className="report-page">
      <WorkspacePageHeader
        actions={
          <>
            <button
              className="pp-button pp-button--secondary"
              onClick={copySummary}
              type="button"
            >
              {copied ? (
                <Check aria-hidden="true" size={14} />
              ) : (
                <Copy aria-hidden="true" size={14} />
              )}
              {copied ? "已复制摘要" : "复制报告摘要"}
            </button>
            <button
              className="pp-button pp-button--primary"
              onClick={() => window.print()}
              type="button"
            >
              <Printer aria-hidden="true" size={14} />
              {readiness.deliverable ? "打印 / 保存 PDF" : "打印草稿 / PDF"}
            </button>
          </>
        }
        description="报告只汇总当前工作台的事实：需求、快照、验收状态、有效证据与人工签字。未决项保留在报告中，不会被排版掩盖。"
        index="05"
        label="Delivery record"
        title="验收报告"
      />

      <div
        className={`report-page__readiness${readiness.deliverable ? " is-deliverable" : ""}`}
      >
        <span className="report-page__readiness-icon">
          {readiness.deliverable ? (
            <ShieldCheck aria-hidden="true" size={18} strokeWidth={1.6} />
          ) : (
            <FileText aria-hidden="true" size={18} strokeWidth={1.6} />
          )}
        </span>
        <div>
          <strong>
            {readiness.deliverable
              ? "所有验收项已人工确认，可以交付"
              : "报告仍是草稿，当前不可交付"}
          </strong>
          <p>
            {readiness.deliverable
              ? "每项通过都关联到当前快照中的有效证据，并已记录人工确认。"
              : `${readiness.counts.failed} 项失败 · ${readiness.counts.unverified} 项未验证 · ${readiness.pendingConfirmations} 项待确认`}
          </p>
        </div>
        <span className="report-page__readiness-id mono">{reportId}</span>
        <DataModeBadge mode={state.mode} />
      </div>

      <div className="report-page__layout">
        <article className="report-document">
          <header className="report-document__masthead">
            <BrandMark subtitle="AI delivery, verified." />
            <div>
              <span className="mono">DELIVERY RECORD / PROOFPATCH</span>
              <span className="report-document__edition mono">2026 · 01</span>
            </div>
          </header>

          <div className="report-document__title">
            <div>
              <span className="mono">REPORT / {reportId}</span>
              <h1>
                {readiness.deliverable
                  ? "交付验收报告"
                  : "交付验收报告草稿"}
              </h1>
              <p>
                把需求、真实检查与交付责任装订在一起，让每个结论都能被复核。
              </p>
            </div>
            <span
              className={`report-document__stamp${readiness.deliverable ? " is-deliverable" : ""}`}
            >
              {readiness.deliverable ? "VERIFIED" : "DRAFT"}
              <small className="mono">
                {readiness.deliverable ? "READY TO DELIVER" : "NOT DELIVERABLE"}
              </small>
            </span>
          </div>

          <dl className="report-document__meta">
            <div>
              <dt className="mono">PROJECT</dt>
              <dd className="mono">{state.project.name}</dd>
            </div>
            <div>
              <dt className="mono">REQUIREMENT</dt>
              <dd className="mono">{state.requirement.id}</dd>
            </div>
            <div>
              <dt className="mono">SNAPSHOT</dt>
              <dd className="mono">{activeSnapshot.label}</dd>
            </div>
            <div>
              <dt className="mono">GENERATED</dt>
              <dd className="mono">{formatDemoTimestamp(generatedAt)}</dd>
            </div>
          </dl>

          <section className="report-document__section">
            <div className="report-document__section-head">
              <span className="mono">01 / REQUIREMENT</span>
              <span>需求与范围</span>
            </div>
            <h2>{state.requirement.title}</h2>
            <p>{state.requirement.summary}</p>
            <div className="report-document__scope">
              <div>
                <span className="mono">IN SCOPE</span>
                <ul>
                  {state.requirement.inScope.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <span className="mono">OUT OF SCOPE</span>
                <ul>
                  {state.requirement.outOfScope.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="report-document__section">
            <div className="report-document__section-head">
              <span className="mono">02 / RESULT SUMMARY</span>
              <span>{activeSnapshot.commit}</span>
            </div>
            <div className="report-document__summary">
              <div>
                <strong>{counts.passed}</strong>
                <span>通过</span>
                <small>工具结果</small>
              </div>
              <div className={counts.failed > 0 ? "is-risk" : undefined}>
                <strong>{counts.failed}</strong>
                <span>失败</span>
                <small>阻塞交付</small>
              </div>
              <div>
                <strong>{counts.unverified}</strong>
                <span>未验证</span>
                <small>没有当前证据</small>
              </div>
              <div>
                <strong>{confirmedCount}</strong>
                <span>已确认</span>
                <small>人工签字</small>
              </div>
            </div>
          </section>

          <section className="report-document__section">
            <div className="report-document__section-head">
              <span className="mono">03 / ACCEPTANCE RECORD</span>
              <span>{state.acceptanceItems.length} 项</span>
            </div>
            <div className="report-document__table">
              <div className="report-document__table-head" aria-hidden="true">
                <span>编号 / 验收项</span>
                <span>状态</span>
                <span>有效证据</span>
                <span>人工确认</span>
              </div>
              {state.acceptanceItems.map((item) => {
                const currentEvidence = getCurrentEvidence(item, state);
                return (
                  <div className="report-document__row" key={item.id}>
                    <div>
                      <span className="mono">{item.id}</span>
                      <strong>{item.title}</strong>
                      <small>
                        {item.codeLinks.length} 个代码关联 ·{" "}
                        {item.source === "ai-suggestion"
                          ? "AI 建议已采纳"
                          : "人工定义"}
                      </small>
                    </div>
                    <StatusBadge compact status={item.status} />
                    <span className="mono report-document__evidence-cell">
                      {currentEvidence.length > 0
                        ? currentEvidence.map((entry) => entry.id).join(" · ")
                        : "无有效证据"}
                    </span>
                    <span
                      className={`report-document__confirm${item.confirmation.state === "confirmed" ? " is-confirmed" : ""}`}
                    >
                      {item.confirmation.state === "confirmed" ? (
                        <>
                          <Check aria-hidden="true" size={12} />
                          已确认
                          <small className="mono">
                            {formatDemoTimestamp(item.confirmation.confirmedAt)}
                          </small>
                        </>
                      ) : (
                        "待确认"
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="report-document__section">
            <div className="report-document__section-head">
              <span className="mono">04 / EVIDENCE INDEX</span>
              <span>{state.evidence.length} 份存档</span>
            </div>
            <div className="report-document__evidence-index">
              {state.evidence.map((evidence) => {
                const relation = getEvidenceRelation(evidence, activeSnapshot);
                return (
                  <div
                    className={`report-document__evidence-item${relation === "stale" ? " is-stale" : ""}`}
                    key={evidence.id}
                  >
                    <span className="mono">{evidence.id}</span>
                    <strong>{evidence.title}</strong>
                    <span className="mono">{evidence.runId}</span>
                    <span>{evidence.acceptanceIds.join(" · ")}</span>
                    <em className="mono">
                      {relation === "current"
                        ? "当前"
                        : relation === "carried"
                          ? "沿用"
                          : "历史"}
                    </em>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="report-document__section">
            <div className="report-document__section-head">
              <span className="mono">05 / OPEN ITEMS &amp; SIGN-OFF</span>
              <span>{unresolvedItems.length} 项未决</span>
            </div>
            {unresolvedItems.length === 0 ? (
              <div className="report-document__clear">
                <FileCheck2 aria-hidden="true" size={17} strokeWidth={1.5} />
                <div>
                  <strong>本报告没有未决项</strong>
                  <p>
                    所有验收项均通过，并已由交付负责人逐项确认。可以生成交付摘要。
                  </p>
                </div>
              </div>
            ) : (
              <div className="report-document__open-items">
                {unresolvedItems.map((item) => (
                  <div key={item.id}>
                    <span className="mono">{item.id}</span>
                    <strong>{item.title}</strong>
                    <span>
                      {item.status === "failed"
                        ? "检查失败，需修复并重新验证"
                        : item.status === "unverified"
                          ? "当前快照没有有效证据"
                          : "自动通过，仍待人工确认"}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="report-document__signatures">
              <div>
                <span className="mono">CONFIRMED BY</span>
                <strong>
                  {confirmedCount > 0
                    ? `${confirmedItems.length} 项由交付负责人确认`
                    : "尚无人工确认"}
                </strong>
              </div>
              <div className="report-document__signature-line">
                <span>交付负责人签字</span>
                <span className="mono">
                  {readiness.deliverable ? "DELIVERED / 2026" : "PENDING"}
                </span>
              </div>
              <UserCheck aria-hidden="true" size={22} strokeWidth={1.2} />
            </div>
          </section>

          <footer className="report-document__footer">
            <div>
              <span className="mono">PROOFPATCH / EVIDENCE LEDGER</span>
              <p>
                {isLive
                  ? "本报告由 ProofPatch 本地运行时生成。命令在用户本机执行，终端输出与人工确认均保存在本机会话中。"
                  : "本报告由前端演示数据生成，不连接真实仓库，不执行真实测试，不代表真实审计结论。"}
              </p>
            </div>
            <span className="mono">
              {isLive
                ? "LOCAL EVIDENCE · HUMAN CONFIRMED"
                : "DEMO DATA · NOT A REAL AUDIT"}
            </span>
          </footer>
        </article>

        <aside className="report-controls panel">
          <header>
            <span className="mono">REPORT READINESS</span>
            <span className={readiness.deliverable ? "is-clear" : "is-draft"}>
              {readiness.deliverable ? "READY" : "DRAFT"}
            </span>
          </header>
          <div className="report-controls__body">
            <div className="report-controls__summary">
              <strong>
                {state.acceptanceItems.length - unresolvedItems.length} /{" "}
                {state.acceptanceItems.length}
              </strong>
              <span>验收项已闭合</span>
            </div>
            <ul className="report-controls__checks">
              {checks.map((check) => (
                <li className={check.passed ? "is-pass" : undefined} key={check.label}>
                  {check.passed ? (
                    <Check aria-hidden="true" size={13} strokeWidth={1.8} />
                  ) : (
                    <Circle aria-hidden="true" size={12} strokeWidth={1.6} />
                  )}
                  <div>
                    <strong>{check.label}</strong>
                    <span>{check.detail}</span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="report-controls__note">
              <ShieldCheck aria-hidden="true" size={15} strokeWidth={1.5} />
              <p>
                {isLive
                  ? "刷新仓库后，若代码指纹变化，之前的证据会保留为历史并失去交付效力；报告不会掩盖该变化。"
                  : "草稿可以打印，但报告封条会保留“不可交付”标识；只有全部关闭后才显示 VERIFIED。"}
              </p>
            </div>
            <Link className="report-controls__link" to="/workspace/acceptance">
              返回验收矩阵处理未决项
              <ArrowRight aria-hidden="true" size={13} />
            </Link>
          </div>
          <footer>
            <span className="mono">SNAPSHOT</span>
            <span>{activeSnapshot.label}</span>
          </footer>
        </aside>
      </div>
    </section>
  );
}
