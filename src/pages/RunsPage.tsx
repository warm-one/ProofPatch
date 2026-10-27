import {
  ArrowRight,
  Check,
  Clock3,
  Copy,
  Square,
  TerminalSquare,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DemoLabel } from "../components/ui/DemoLabel";
import { WorkspacePageHeader } from "../components/workspace/WorkspacePageHeader";
import {
  formatDemoTimestamp,
  getActiveSnapshot,
} from "../state/selectors";
import { useWorkspace } from "../state/WorkspaceContext";
import type { DemoRun, RunStatus } from "../types/workspace";
import { copyText } from "../utils/clipboard";
import "./RunsPage.css";

const runStatusLabels: Record<RunStatus, string> = {
  running: "运行中",
  completed: "已完成",
  interrupted: "已中断",
};

function RunStatusIcon({ status }: { status: RunStatus }) {
  if (status === "running") {
    return <span aria-hidden="true" className="run-status-spinner" />;
  }
  if (status === "completed") {
    return <Check aria-hidden="true" size={12} strokeWidth={2} />;
  }
  return <Square aria-hidden="true" size={9} fill="currentColor" />;
}

function countRunOutcomes(run: DemoRun) {
  const values = Object.values(run.outcomes);
  return {
    passed: values.filter((value) => value === "passed").length,
    failed: values.filter((value) => value === "failed").length,
  };
}

export default function RunsPage() {
  const { state, isRunning, selectAcceptance, interruptRun, notify } =
    useWorkspace();
  const navigate = useNavigate();
  const activeSnapshot = getActiveSnapshot(state);
  const [selectedRunId, setSelectedRunId] = useState(
    () => state.runs[state.runs.length - 1]?.id,
  );
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  useEffect(() => {
    if (!state.runs.some((run) => run.id === selectedRunId)) {
      setSelectedRunId(state.runs[state.runs.length - 1]?.id);
    }
  }, [selectedRunId, state.runs]);

  const selectedRun =
    state.runs.find((run) => run.id === selectedRunId) ??
    state.runs[state.runs.length - 1];

  const runEvidence = useMemo(
    () =>
      selectedRun
        ? state.evidence.filter(
            (evidence) => evidence.runId === selectedRun.id,
          )
        : [],
    [selectedRun, state.evidence],
  );

  const copyRunLogs = async () => {
    if (!selectedRun) return;

    const visibleLogs = selectedRun.logs
      .slice(0, selectedRun.visibleLogCount)
      .map((line) => `${line.at}  [${line.tone.toUpperCase()}]  ${line.text}`)
      .join("\n");
    const copied = await copyText(
      `PROOFPATCH / ${selectedRun.id} / DEMO REPLAY\n${visibleLogs}\n\n演示数据，不包含真实命令执行结果。`,
    );
    setCopyState(copied ? "copied" : "failed");
    notify(
      copied
        ? "运行日志已复制。"
        : "剪贴板不可用，请在日志区域手动选择文本复制。",
      copied ? "success" : "warning",
    );
    window.setTimeout(() => setCopyState("idle"), 1800);
  };

  const openAcceptance = (acceptanceId: string) => {
    selectAcceptance(acceptanceId);
    navigate("/workspace/acceptance");
  };

  if (!selectedRun) {
    return null;
  }

  const selectedStatusCounts = countRunOutcomes(selectedRun);
  const visibleLogs = selectedRun.logs.slice(
    0,
    selectedRun.visibleLogCount,
  );

  return (
    <section className="runs-page">
      <WorkspacePageHeader
        actions={
          <Link className="pp-button pp-button--secondary" to="/workspace/acceptance">
            查看验收矩阵
            <ArrowRight aria-hidden="true" size={14} />
          </Link>
        }
        description="检查运行只记录可复核的事实：预置时间线、退出结果与对应证据。运行结束不代表交付完成，人工确认仍在验收矩阵中完成。"
        index="03"
        label="Verification runs"
        title="检查运行"
      />

      <div className="runs-page__strip">
        <span className="mono">REPLAY MODE / NO REAL COMMANDS</span>
        <span>所有日志按固定脚本回放，不会访问仓库、模型或本地进程。</span>
        {isRunning && (
          <span className="runs-page__live mono">
            回放进行中
            <span aria-hidden="true" />
          </span>
        )}
      </div>

      <div className="runs-page__layout">
        <aside className="run-history panel" aria-label="运行历史">
          <header className="run-history__header">
            <div>
              <span className="mono">RUN HISTORY</span>
              <strong>{state.runs.length} 次预置回放</strong>
            </div>
            <TerminalSquare aria-hidden="true" size={16} strokeWidth={1.4} />
          </header>
          <div className="run-history__list">
            {[...state.runs].reverse().map((run) => {
              const counts = countRunOutcomes(run);
              const selected = run.id === selectedRun.id;
              return (
                <button
                  aria-current={selected ? "true" : undefined}
                  aria-label={`查看运行 ${run.id} ${run.label}`}
                  className={`run-history__item${selected ? " is-selected" : ""}`}
                  key={run.id}
                  onClick={() => setSelectedRunId(run.id)}
                  type="button"
                >
                  <span className="run-history__top">
                    <span className={`run-status run-status--${run.status}`}>
                      <RunStatusIcon status={run.status} />
                      {runStatusLabels[run.status]}
                    </span>
                    <span className="mono">{run.id}</span>
                  </span>
                  <strong>{run.label}</strong>
                  <span className="run-history__meta mono">
                    {run.snapshotId === "before-fix"
                      ? "实现快照"
                      : "修复快照"}{" "}
                    · {formatDemoTimestamp(run.startedAt)}
                  </span>
                  <span className="run-history__outcomes">
                    <span className="is-pass mono">{counts.passed} PASS</span>
                    {counts.failed > 0 && (
                      <span className="is-fail mono">
                        {counts.failed} FAIL
                      </span>
                    )}
                    <span className="run-history__evidence mono">
                      {state.evidence.filter(
                        (evidence) => evidence.runId === run.id,
                      ).length || 0}{" "}
                      EVIDENCE
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <footer className="run-history__footer">
            <span className="mono">HISTORY PRESERVED</span>
            <span>失败与中断也会留存</span>
          </footer>
        </aside>

        <article className="run-detail panel">
          <header className="run-detail__header">
            <div>
              <span className="mono">RUN / {selectedRun.id}</span>
              <h2>{selectedRun.label}</h2>
              <p>{selectedRun.caption}</p>
            </div>
            <div className="run-detail__header-state">
              <span className={`run-status run-status--${selectedRun.status}`}>
                <RunStatusIcon status={selectedRun.status} />
                {runStatusLabels[selectedRun.status]}
              </span>
              <DemoLabel tone="line" />
            </div>
          </header>

          <dl className="run-detail__meta">
            <div>
              <dt className="mono">SNAPSHOT</dt>
              <dd>{selectedRun.snapshotId === "before-fix" ? "实现快照" : "修复快照"}</dd>
            </div>
            <div>
              <dt className="mono">STARTED</dt>
              <dd className="mono">
                {formatDemoTimestamp(selectedRun.startedAt)}
              </dd>
            </div>
            <div>
              <dt className="mono">FINISHED</dt>
              <dd className="mono">
                {formatDemoTimestamp(selectedRun.finishedAt)}
              </dd>
            </div>
            <div>
              <dt className="mono">OUTCOME</dt>
              <dd className="run-detail__meta-outcome">
                {selectedStatusCounts.passed} PASS
                {selectedStatusCounts.failed > 0 && (
                  <span className="is-risk">
                    {selectedStatusCounts.failed} FAIL
                  </span>
                )}
              </dd>
            </div>
          </dl>

          <section className="run-detail__section">
            <div className="run-detail__section-head">
              <span className="mono">LINKED ACCEPTANCE</span>
              <span>{selectedRun.acceptanceIds.length} 项</span>
            </div>
            <div className="run-detail__acceptances">
              {selectedRun.acceptanceIds.map((id) => {
                const item = state.acceptanceItems.find(
                  (candidate) => candidate.id === id,
                );
                if (!item) return null;
                return (
                  <button
                    key={id}
                    onClick={() => openAcceptance(id)}
                    type="button"
                  >
                    <span className="mono">{id}</span>
                    <span>{item.title}</span>
                    <em
                      className={`run-detail__outcome is-${selectedRun.outcomes[id] ?? "unverified"}`}
                    >
                      {selectedRun.outcomes[id] ?? "unverified"}
                    </em>
                    <ArrowRight aria-hidden="true" size={12} />
                  </button>
                );
              })}
            </div>
          </section>

          <section className="run-detail__log-section">
            <header className="run-detail__log-head">
              <div>
                <span className="mono">EXECUTION LOG</span>
                <span className="run-detail__log-count mono">
                  {visibleLogs.length}/{selectedRun.logs.length} LINES
                </span>
              </div>
              <div>
                {selectedRun.status === "running" && (
                  <button
                    className="run-detail__interrupt"
                    onClick={interruptRun}
                    type="button"
                  >
                    <Square aria-hidden="true" size={9} fill="currentColor" />
                    中止回放
                  </button>
                )}
                <button
                  className="run-detail__copy"
                  disabled={visibleLogs.length === 0}
                  onClick={copyRunLogs}
                  type="button"
                >
                  {copyState === "copied" ? (
                    <Check aria-hidden="true" size={13} />
                  ) : (
                    <Copy aria-hidden="true" size={13} />
                  )}
                  {copyState === "copied" ? "已复制" : "复制日志"}
                </button>
              </div>
            </header>

            <div
              aria-live={
                selectedRun.status === "running" ? "polite" : undefined
              }
              className="run-log"
            >
              {visibleLogs.length === 0 && (
                <div className="run-log__waiting">
                  <span
                    aria-hidden="true"
                    className="run-status-spinner is-large"
                  />
                  正在等待预置时间线…
                </div>
              )}
              {visibleLogs.map((line, index) => (
                <div
                  className={`run-log__line is-${line.tone}`}
                  key={line.id}
                >
                  <span className="run-log__index mono">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="run-log__time mono">{line.at}</span>
                  <span className="run-log__tone mono">
                    {line.tone === "command"
                      ? "CMD"
                      : line.tone.toUpperCase()}
                  </span>
                  <p>{line.text}</p>
                </div>
              ))}
              {selectedRun.status === "running" && (
                <div className="run-log__cursor" aria-hidden="true" />
              )}
            </div>
          </section>

          <section className="run-detail__section run-detail__evidence">
            <div className="run-detail__section-head">
              <span className="mono">GENERATED EVIDENCE</span>
              <span>{runEvidence.length} 份</span>
            </div>
            {selectedRun.status === "running" && (
              <p className="run-detail__evidence-empty">
                回放结束后，截图与日志才会写入证据索引。
              </p>
            )}
            {selectedRun.status === "interrupted" && (
              <p className="run-detail__evidence-empty is-risk">
                回放被中断，没有产生新证据。相关验收项保持未验证。
              </p>
            )}
            {selectedRun.status === "completed" &&
              runEvidence.length === 0 && (
                <p className="run-detail__evidence-empty">
                  本次基线回放引用了已有证据，未新增独立附件。
                </p>
              )}
            {runEvidence.length > 0 && (
              <div className="run-detail__evidence-list">
                {runEvidence.map((evidence) => (
                  <Link
                    key={evidence.id}
                    to={`/workspace/evidence?focus=${evidence.id}`}
                  >
                    <span className="mono">{evidence.id}</span>
                    <span>{evidence.title}</span>
                    <span className="mono">
                      {evidence.kind === "browser-screenshot"
                        ? "SCREENSHOT"
                        : "LOG"}
                    </span>
                    <ArrowRight aria-hidden="true" size={12} />
                  </Link>
                ))}
              </div>
            )}
          </section>

          <footer className="run-detail__footer">
            <span>
              <Clock3 aria-hidden="true" size={13} strokeWidth={1.5} />
              预置时间线，无真实执行
            </span>
            <span className="mono">
              SNAPSHOT / {activeSnapshot.label}
            </span>
          </footer>
        </article>
      </div>
    </section>
  );
}
