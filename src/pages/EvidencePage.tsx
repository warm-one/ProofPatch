import {
  ArrowRight,
  Image as ImageIcon,
  Images,
  TerminalSquare,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EvidenceDialog } from "../components/workspace/EvidenceDialog";
import { WorkspacePageHeader } from "../components/workspace/WorkspacePageHeader";
import { DataModeBadge } from "../components/ui/DataModeBadge";
import { EmptyState } from "../components/ui/EmptyState";
import {
  formatDemoTimestamp,
  getActiveSnapshot,
  getEvidenceRelation,
} from "../state/selectors";
import { useWorkspace } from "../state/WorkspaceContext";
import type { Evidence } from "../types/workspace";
import "./EvidencePage.css";

type EvidenceFilter = "all" | "screenshot" | "log";

const filters: Array<{ value: EvidenceFilter; label: string }> = [
  { value: "all", label: "全部证据" },
  { value: "screenshot", label: "浏览器截图" },
  { value: "log", label: "测试日志" },
];

function ImageEvidencePreview({ evidence }: { evidence: Evidence }) {
  const [failed, setFailed] = useState(false);

  if (!evidence.imageSrc || failed) {
    return (
      <div className="evidence-card__image-fallback">
        <Images aria-hidden="true" size={22} strokeWidth={1.3} />
        <span>预览暂不可用</span>
        <small>仍可在详情中核对证据元信息</small>
      </div>
    );
  }

  return (
    <div className="evidence-card__image">
      <img
        alt={evidence.title}
        loading="lazy"
        onError={() => setFailed(true)}
        src={evidence.imageSrc}
      />
      <span className="evidence-card__image-label mono">
        {evidence.isDemo ? "DEMO CAPTURE" : "LOCAL CAPTURE"}
      </span>
    </div>
  );
}

function LogEvidencePreview({ evidence }: { evidence: Evidence }) {
  const lines = evidence.content?.split("\n").slice(0, 7) ?? [];

  return (
    <div className="evidence-card__log">
      <span className="evidence-card__log-title mono">
        {evidence.isDemo ? "REPLAY OUTPUT / READ ONLY" : "COMMAND OUTPUT / LOCAL"}
      </span>
      <div>
        {lines.map((line, index) => (
          <span
            className={`mono${index === lines.length - 1 ? " is-result" : ""}`}
            key={`${line}-${index}`}
          >
            {line}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function EvidencePage() {
  const { state } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState<EvidenceFilter>("all");
  const [currentOnly, setCurrentOnly] = useState(false);
  const activeSnapshot = getActiveSnapshot(state);
  const focusId = searchParams.get("focus");

  const allEvidence = useMemo(
    () =>
      [...state.evidence].sort((a, b) =>
        b.capturedAt.localeCompare(a.capturedAt),
      ),
    [state.evidence],
  );

  const filteredEvidence = useMemo(
    () =>
      allEvidence.filter((evidence) => {
        const kindMatch =
          filter === "all" ||
          (filter === "screenshot" &&
            evidence.kind === "browser-screenshot") ||
          (filter === "log" && evidence.kind === "test-log");
        const scopeMatch =
          !currentOnly ||
          getEvidenceRelation(evidence, activeSnapshot) !== "stale";
        return kindMatch && scopeMatch;
      }),
    [activeSnapshot, allEvidence, currentOnly, filter],
  );

  const counts = {
    all: allEvidence.length,
    screenshot: allEvidence.filter(
      (evidence) => evidence.kind === "browser-screenshot",
    ).length,
    log: allEvidence.filter((evidence) => evidence.kind === "test-log").length,
    historical: allEvidence.filter(
      (evidence) => getEvidenceRelation(evidence, activeSnapshot) === "stale",
    ).length,
  };

  const activeEvidence = focusId
    ? allEvidence.find((evidence) => evidence.id === focusId)
    : undefined;

  const openEvidence = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("focus", id);
    setSearchParams(next, { replace: true });
  };

  const closeEvidence = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("focus");
    setSearchParams(next, { replace: true });
  };

  const selectRelativeEvidence = (offset: number) => {
    if (!activeEvidence) return;
    const currentIndex = allEvidence.findIndex(
      (evidence) => evidence.id === activeEvidence.id,
    );
    const nextIndex =
      (currentIndex + offset + allEvidence.length) % allEvidence.length;
    openEvidence(allEvidence[nextIndex].id);
  };

  return (
    <section className="evidence-page">
      <WorkspacePageHeader
        actions={
          <Link className="pp-button pp-button--secondary" to="/workspace/runs">
            查看运行记录
            <ArrowRight aria-hidden="true" size={14} />
          </Link>
        }
        description={
          state.mode === "live"
            ? "每份终端输出都归属于一次本机命令和当时的仓库指纹。代码变化后，旧证据仍保留，但失去当前交付效力。"
            : "证据不是附件列表：每份截图与日志都归属于一次运行和一个代码快照。当前补丁影响到的旧证据会留在历史中，但失去交付效力。"
        }
        index="04"
        label="Evidence index"
        title="证据索引"
      />

      <div className="evidence-page__snapshot-strip">
        <span className="mono">ACTIVE SNAPSHOT / {activeSnapshot.label}</span>
        <span>{activeSnapshot.summary}</span>
        <span className="mono">
          {counts.all} TOTAL · {counts.historical} HISTORICAL
        </span>
      </div>

      <div className="evidence-page__toolbar">
        <div
          aria-label="按证据类型筛选"
          className="evidence-page__filters"
          role="group"
        >
          {filters.map((option) => (
            <button
              aria-pressed={filter === option.value}
              className={filter === option.value ? "is-active" : undefined}
              key={option.value}
              onClick={() => setFilter(option.value)}
              type="button"
            >
              {option.value === "screenshot" && (
                <ImageIcon aria-hidden="true" size={12} strokeWidth={1.6} />
              )}
              {option.value === "log" && (
                <TerminalSquare
                  aria-hidden="true"
                  size={12}
                  strokeWidth={1.6}
                />
              )}
              {option.label}
              <span className="mono">{counts[option.value]}</span>
            </button>
          ))}
        </div>

        <div className="evidence-page__toolbar-right">
          <button
            aria-pressed={currentOnly}
            className={`evidence-page__scope${currentOnly ? " is-active" : ""}`}
            onClick={() => setCurrentOnly((value) => !value)}
            type="button"
          >
            <span aria-hidden="true" />
            只看当前快照
          </button>
          <DataModeBadge mode={state.mode} />
        </div>
      </div>

      {filteredEvidence.length === 0 ? (
        <div className="evidence-page__empty panel">
          <EmptyState
            description="当前筛选下没有证据。可以关闭“只看当前快照”，或查看其他类型的证据。"
            icon={<Images aria-hidden="true" size={22} strokeWidth={1.4} />}
            title="没有匹配的证据"
            action={
              <button
                className="pp-button pp-button--secondary"
                onClick={() => {
                  setFilter("all");
                  setCurrentOnly(false);
                }}
                type="button"
              >
                清除筛选
              </button>
            }
          />
        </div>
      ) : (
        <div className="evidence-grid">
          {filteredEvidence.map((evidence) => {
            const relation = getEvidenceRelation(evidence, activeSnapshot);
            const historical = relation === "stale";
            return (
              <Link
                aria-label={`打开证据 ${evidence.id} ${evidence.title}`}
                className={`evidence-card${historical ? " is-historical" : ""}`}
                key={evidence.id}
                to={`/workspace/evidence?focus=${evidence.id}`}
              >
                <header className="evidence-card__header">
                  <span className="mono">
                    {evidence.kind === "browser-screenshot" ? (
                      <ImageIcon aria-hidden="true" size={12} />
                    ) : (
                      <TerminalSquare aria-hidden="true" size={12} />
                    )}
                    {evidence.id} /{" "}
                    {evidence.kind === "browser-screenshot" ? "SHOT" : "LOG"}
                  </span>
                  <span
                    className={`evidence-card__relation is-${relation}`}
                  >
                    {historical
                      ? "历史证据"
                      : relation === "carried"
                        ? "沿用证据"
                        : "当前证据"}
                  </span>
                </header>

                {evidence.kind === "browser-screenshot" ? (
                  <ImageEvidencePreview evidence={evidence} />
                ) : (
                  <LogEvidencePreview evidence={evidence} />
                )}

                <footer className="evidence-card__footer">
                  <strong>{evidence.title}</strong>
                  <span className="mono">
                    {evidence.runId} · {formatDemoTimestamp(evidence.capturedAt)}
                  </span>
                  <span className="evidence-card__acceptances mono">
                    {evidence.acceptanceIds.join(" · ")}
                  </span>
                </footer>
              </Link>
            );
          })}
        </div>
      )}

      <footer className="evidence-page__footer">
        <span className="mono">EVIDENCE / APPEND ONLY</span>
        <span>
          {state.mode === "live"
            ? "证据与仓库指纹绑定；刷新快照不会删除历史，只会让不再匹配的记录失去交付效力。"
            : "新证据只会追加，不覆盖历史记录；证据失效通过“归属快照”判断，而不是删除文件。"}
        </span>
      </footer>

      {activeEvidence && (
        <EvidenceDialog
          activeEvidence={activeEvidence}
          evidence={allEvidence}
          onClose={closeEvidence}
          onSelectRelative={selectRelativeEvidence}
        />
      )}
    </section>
  );
}
