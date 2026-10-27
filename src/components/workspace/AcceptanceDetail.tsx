import {
  ArrowRight,
  Check,
  CircleCheck,
  Clock3,
  FileCode2,
  GitCompare,
  Image as ImageIcon,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  canConfirmAcceptance,
  formatDemoTimestamp,
  formatEvidenceKind,
  getActiveSnapshot,
  getEvidenceForItem,
  getEvidenceRelation,
  getEvidenceRelationLabel,
} from "../../state/selectors";
import { useWorkspace } from "../../state/WorkspaceContext";
import type { AcceptanceItem, Evidence } from "../../types/workspace";
import { DemoLabel } from "../ui/DemoLabel";
import { StatusBadge } from "../ui/StatusBadge";
import "./AcceptanceDetail.css";

interface AcceptanceDetailProps {
  item: AcceptanceItem;
}

export function AcceptanceDetail({ item }: AcceptanceDetailProps) {
  const {
    state,
    isRunning,
    loadSnapshot,
    startAcceptanceRun,
    interruptRun,
    confirmAcceptance,
  } = useWorkspace();
  const activeSnapshot = getActiveSnapshot(state);
  const allEvidence = getEvidenceForItem(item, state);
  const currentEvidence = allEvidence.filter(
    (evidence) =>
      getEvidenceRelation(evidence, activeSnapshot) !== "stale",
  );
  const historicalEvidence = allEvidence.filter(
    (evidence) =>
      getEvidenceRelation(evidence, activeSnapshot) === "stale",
  );
  const runningRun = state.runs.find(
    (run) => run.status === "running" && run.acceptanceIds.includes(item.id),
  );
  const latestRun = [...state.runs]
    .reverse()
    .find((run) => run.acceptanceIds.includes(item.id));
  const canConfirm = canConfirmAcceptance(item, state);
  const isBlockedByOtherRun = isRunning && !runningRun;

  const renderEvidence = (evidence: Evidence, stale = false) => {
    const relation = getEvidenceRelation(evidence, activeSnapshot);
    const Icon =
      evidence.kind === "browser-screenshot" ? ImageIcon : Clock3;

    return (
      <Link
        className={`acceptance-detail__evidence${stale ? " is-stale" : ""}`}
        key={evidence.id}
        to={`/workspace/evidence?focus=${evidence.id}`}
      >
        <Icon aria-hidden="true" size={14} strokeWidth={1.5} />
        <span className="acceptance-detail__evidence-copy">
          <span className="mono">
            {evidence.id} / {formatEvidenceKind(evidence)}
          </span>
          <strong>{evidence.title}</strong>
          <span className="acceptance-detail__evidence-meta mono">
            {evidence.runId} · {formatDemoTimestamp(evidence.capturedAt)}
          </span>
        </span>
        <span className="acceptance-detail__evidence-state mono">
          {getEvidenceRelationLabel(relation, evidence)}
          <ArrowRight aria-hidden="true" size={11} />
        </span>
      </Link>
    );
  };

  return (
    <aside className="acceptance-detail panel" aria-label={`${item.id} 验收详情`}>
      <header className="acceptance-detail__header">
        <div>
          <span className="mono">ACCEPTANCE / {item.id}</span>
          <span className="acceptance-detail__header-source">
            {item.source === "ai-suggestion" ? (
              <>
                <Sparkles aria-hidden="true" size={10} />
                AI 建议 · 已采纳
              </>
            ) : (
              "人工定义"
            )}
          </span>
        </div>
        <StatusBadge status={item.status} />
      </header>

      <div className="acceptance-detail__body">
        <h2>{item.title}</h2>
        <p className="acceptance-detail__criterion">{item.criterion}</p>

        <section className="acceptance-detail__section">
          <div className="acceptance-detail__section-head">
            <span className="mono">CODE LINKS</span>
            <span>{item.codeLinks.length} 处关联</span>
          </div>
          {item.codeLinks.length === 0 ? (
            <p className="acceptance-detail__empty-copy">
              尚无代码关联。AI 建议已转为可验证条件，但还没有证据能证明它被实现。
            </p>
          ) : (
            <div className="acceptance-detail__links">
              {item.codeLinks.map((link) => (
                <div
                  className="acceptance-detail__link"
                  key={`${link.filePath}-${link.lineStart}`}
                >
                  <FileCode2
                    aria-hidden="true"
                    size={13}
                    strokeWidth={1.5}
                  />
                  <div>
                    <span className="mono">{link.filePath}</span>
                    <small className="mono">
                      L{link.lineStart}–{link.lineEnd} · {link.symbol}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="acceptance-detail__section">
          <div className="acceptance-detail__section-head">
            <span className="mono">EVIDENCE</span>
            <span>{allEvidence.length} 份存档</span>
          </div>

          {currentEvidence.length > 0 && (
            <div className="acceptance-detail__evidence-list">
              {currentEvidence.map((evidence) => renderEvidence(evidence))}
            </div>
          )}

          {currentEvidence.length === 0 && (
            <div className="acceptance-detail__evidence-empty">
              <ShieldCheck aria-hidden="true" size={16} strokeWidth={1.5} />
              <p>
                当前快照没有有效证据。
                {historicalEvidence.length > 0
                  ? " 下方历史证据已被当前补丁影响，不能用于确认。"
                  : " 运行本项检查后，证据才会被记录。"}
              </p>
            </div>
          )}

          {historicalEvidence.length > 0 && (
            <div className="acceptance-detail__historical">
              <div className="acceptance-detail__historical-head">
                <span className="mono">HISTORICAL / NOT CURRENT</span>
                <span>{historicalEvidence.length} 份</span>
              </div>
              <div className="acceptance-detail__evidence-list">
                {historicalEvidence.map((evidence) =>
                  renderEvidence(evidence, true),
                )}
              </div>
            </div>
          )}
        </section>

        <section className="acceptance-detail__section acceptance-detail__history">
          <div className="acceptance-detail__section-head">
            <span className="mono">LATEST RUN</span>
            <Link to="/workspace/runs">所有运行</Link>
          </div>
          {latestRun ? (
            <div className="acceptance-detail__run-summary">
              <span className="mono">{latestRun.id}</span>
              <span>{latestRun.label}</span>
              <span className="mono">
                {latestRun.status === "completed"
                  ? "COMPLETED"
                  : latestRun.status === "running"
                    ? "RUNNING"
                    : "INTERRUPTED"}
              </span>
            </div>
          ) : (
            <p className="acceptance-detail__empty-copy">尚无运行记录。</p>
          )}
        </section>
      </div>

      <footer className="acceptance-detail__decision">
        <div className="acceptance-detail__decision-head">
          <span className="mono">DELIVERY DECISION</span>
          <DemoLabel label="演示回放" />
        </div>

        {runningRun ? (
          <div className="acceptance-detail__running" aria-live="polite">
            <div className="acceptance-detail__running-head">
              <span className="acceptance-detail__spinner" aria-hidden="true" />
              <span>
                正在回放 <strong className="mono">{runningRun.id}</strong>
              </span>
            </div>
            <div className="acceptance-detail__run-logs">
              {runningRun.logs
                .slice(0, runningRun.visibleLogCount)
                .slice(-3)
                .map((line) => (
                  <div
                    className={`acceptance-detail__run-line is-${line.tone}`}
                    key={line.id}
                  >
                    <span className="mono">{line.at}</span>
                    <p>{line.text}</p>
                  </div>
                ))}
            </div>
            <div className="acceptance-detail__running-actions">
              <Link to="/workspace/runs">
                查看完整日志
                <ArrowRight aria-hidden="true" size={12} />
              </Link>
              <button onClick={interruptRun} type="button">
                中止回放
              </button>
            </div>
          </div>
        ) : item.confirmation.state === "confirmed" ? (
          <div className="acceptance-detail__closure">
            <CircleCheck aria-hidden="true" size={23} strokeWidth={1.4} />
            <div>
              <strong>证据链已闭合</strong>
              <p>
                由 {item.confirmation.confirmedBy ?? "交付负责人"} 于{" "}
                {formatDemoTimestamp(item.confirmation.confirmedAt)}{" "}
                确认。自动结果与签字分别存档。
              </p>
            </div>
          </div>
        ) : item.status === "passed" ? (
          <>
            <div className="acceptance-detail__auto-result">
              <Check aria-hidden="true" size={16} strokeWidth={1.8} />
              <div>
                <strong>自动检查通过，等待人工确认</strong>
                <p>
                  请先检查证据是否属于当前快照。确认是本演示中的唯一人工签字动作。
                </p>
              </div>
            </div>
            <button
              className="pp-button pp-button--primary acceptance-detail__primary-action"
              disabled={!canConfirm || isBlockedByOtherRun}
              onClick={() => confirmAcceptance(item.id)}
              type="button"
            >
              <UserCheck aria-hidden="true" size={15} />
              确认验收并签署
            </button>
            {!canConfirm && (
              <p className="acceptance-detail__action-note">
                当前没有可用的有效证据，暂不能确认。
              </p>
            )}
          </>
        ) : item.status === "failed" && activeSnapshot.id === "before-fix" ? (
          <>
            <div className="acceptance-detail__blocking">
              <ShieldCheck aria-hidden="true" size={16} strokeWidth={1.5} />
              <div>
                <strong>失败项阻塞交付</strong>
                <p>
                  对比度检查未达标。载入修复快照后，旧证据会保留为历史，该项回到未验证。
                </p>
              </div>
            </div>
            <button
              className="pp-button pp-button--primary acceptance-detail__primary-action"
              disabled={isRunning}
              onClick={() => loadSnapshot("after-fix")}
              type="button"
            >
              <GitCompare aria-hidden="true" size={15} />
              载入修复后演示快照
            </button>
          </>
        ) : (
          <>
            <div className="acceptance-detail__unverified">
              <Clock3 aria-hidden="true" size={16} strokeWidth={1.5} />
              <div>
                <strong>尚无当前快照的有效证据</strong>
                <p>
                  运行预置回放会生成日志与截图，但结果只会记录为事实，不会自动确认交付。
                </p>
              </div>
            </div>
            <button
              className="pp-button pp-button--primary acceptance-detail__primary-action"
              disabled={isRunning}
              onClick={() => startAcceptanceRun(item.id)}
              type="button"
            >
              运行本项演示检查
              <ArrowRight aria-hidden="true" size={15} />
            </button>
            {isBlockedByOtherRun && (
              <p className="acceptance-detail__action-note">
                另一项检查正在回放，请等待结束或前往检查运行中止。
              </p>
            )}
          </>
        )}
      </footer>
    </aside>
  );
}
