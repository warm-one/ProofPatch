import {
  ChevronRight,
  CircleCheck,
  Search,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AcceptanceDetail } from "../components/workspace/AcceptanceDetail";
import { WorkspacePageHeader } from "../components/workspace/WorkspacePageHeader";
import { EmptyState } from "../components/ui/EmptyState";
import { StatusBadge } from "../components/ui/StatusBadge";
import {
  getActiveSnapshot,
  getEvidenceForItem,
  getEvidenceRelation,
  getPendingConfirmationCount,
  getStatusCounts,
  getUnresolvedCount,
} from "../state/selectors";
import { useWorkspace } from "../state/WorkspaceContext";
import type { AcceptanceStatus } from "../types/workspace";
import "./AcceptancePage.css";

type StatusFilter = "all" | AcceptanceStatus;

const filterOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "passed", label: "通过" },
  { value: "failed", label: "失败" },
  { value: "unverified", label: "未验证" },
];

export default function AcceptancePage() {
  const { state, selectAcceptance } = useWorkspace();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const activeSnapshot = getActiveSnapshot(state);
  const counts = getStatusCounts(state.acceptanceItems);
  const pendingConfirmations = getPendingConfirmationCount(
    state.acceptanceItems,
  );
  const unresolved = getUnresolvedCount(state.acceptanceItems);
  const selectedItem = state.acceptanceItems.find(
    (item) => item.id === state.selectedAcceptanceId,
  );

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return state.acceptanceItems.filter((item) => {
      const statusMatch = filter === "all" || item.status === filter;
      const queryMatch =
        normalizedQuery.length === 0 ||
        item.title.toLocaleLowerCase().includes(normalizedQuery) ||
        item.id.toLocaleLowerCase().includes(normalizedQuery) ||
        item.criterion.toLocaleLowerCase().includes(normalizedQuery);
      return statusMatch && queryMatch;
    });
  }, [filter, query, state.acceptanceItems]);

  return (
    <section className="acceptance-page">
      <WorkspacePageHeader
        actions={
          <div className="acceptance-page__summary">
            <span>
              <strong>{counts.passed}</strong> 通过
            </span>
            <span className={counts.failed > 0 ? "is-risk" : undefined}>
              <strong>{counts.failed}</strong> 失败
            </span>
            <span>
              <strong>{counts.unverified}</strong> 未验证
            </span>
            <span>
              <strong>{pendingConfirmations}</strong> 待确认
            </span>
            <Link to="/workspace/requirements">
              查看需求与变更
              <ChevronRight aria-hidden="true" size={13} />
            </Link>
          </div>
        }
        description="每个状态都必须能追溯到当前快照中的证据。自动检查通过只代表工具结果，人工确认才代表交付结论。"
        index="02"
        label="Acceptance matrix"
        title="验收矩阵"
      />

      <div className="acceptance-page__snapshot-line">
        <span className="mono">SNAPSHOT / {activeSnapshot.label}</span>
        <span>{activeSnapshot.summary}</span>
        {unresolved > 0 ? (
          <span className="acceptance-page__blocked mono">
            {unresolved} 项未决 · 不可交付
          </span>
        ) : (
          <span className="acceptance-page__clear mono">全部已确认 · 可生成报告</span>
        )}
      </div>

      <div className="acceptance-page__layout">
        <div className="acceptance-page__matrix panel">
          <div className="acceptance-toolbar">
            <div
              aria-label="按验收状态筛选"
              className="acceptance-toolbar__filters"
              role="group"
            >
              {filterOptions.map((option) => {
                const count =
                  option.value === "all"
                    ? state.acceptanceItems.length
                    : counts[option.value];
                return (
                  <button
                    aria-pressed={filter === option.value}
                    className={
                      filter === option.value ? "is-active" : undefined
                    }
                    key={option.value}
                    onClick={() => setFilter(option.value)}
                    type="button"
                  >
                    {option.label}
                    <span className="mono">{count}</span>
                  </button>
                );
              })}
            </div>

            <label className="acceptance-toolbar__search">
              <span className="sr-only">搜索验收项</span>
              <Search aria-hidden="true" size={14} strokeWidth={1.6} />
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="筛选验收项…"
                type="search"
                value={query}
              />
            </label>
          </div>

          <div className="acceptance-matrix__head" aria-hidden="true">
            <span>状态</span>
            <span>验收项</span>
            <span>代码关联</span>
            <span>最新证据</span>
            <span>人工确认</span>
            <span />
          </div>

          <div className="acceptance-matrix__rows">
            {filteredItems.length === 0 && (
              <EmptyState
                description="当前状态与搜索词没有匹配结果。清除筛选后可以继续查看完整验收矩阵。"
                icon={<Search aria-hidden="true" size={20} />}
                title="没有符合条件的验收项"
                action={
                  <button
                    className="pp-button pp-button--secondary"
                    onClick={() => {
                      setFilter("all");
                      setQuery("");
                    }}
                    type="button"
                  >
                    清除筛选
                  </button>
                }
              />
            )}

            {filteredItems.map((item) => {
              const evidence = getEvidenceForItem(item, state);
              const currentEvidence = evidence.filter(
                (entry) =>
                  getEvidenceRelation(entry, activeSnapshot) !== "stale",
              );
              const latestEvidence = currentEvidence[0];
              const historicalCount = evidence.length - currentEvidence.length;
              const selected = item.id === state.selectedAcceptanceId;

              return (
                <button
                  aria-label={`查看 ${item.id} ${item.title}`}
                  aria-pressed={selected}
                  className={`acceptance-matrix__row${selected ? " is-selected" : ""}`}
                  key={item.id}
                  onClick={() => selectAcceptance(item.id)}
                  type="button"
                >
                  <span className="acceptance-matrix__status">
                    <StatusBadge compact status={item.status} />
                  </span>

                  <span className="acceptance-matrix__identity">
                    <span className="acceptance-matrix__title-line">
                      <span className="mono">{item.id}</span>
                      <strong>{item.title}</strong>
                      {item.source === "ai-suggestion" && (
                        <span
                          className="acceptance-matrix__ai"
                          title="来源：AI 建议，已由人采纳"
                        >
                          <Sparkles aria-hidden="true" size={10} />
                          AI
                        </span>
                      )}
                    </span>
                    <span className="acceptance-matrix__mobile-meta mono">
                      {item.codeLinks.length} 个代码关联 ·{" "}
                      {latestEvidence
                        ? latestEvidence.id
                        : historicalCount > 0
                          ? `${historicalCount} 份历史证据`
                          : "无证据"}
                    </span>
                  </span>

                  <span className="acceptance-matrix__code mono">
                    {item.codeLinks.length > 0
                      ? `${item.codeLinks.length} FILES`
                      : "—"}
                  </span>

                  <span className="acceptance-matrix__evidence mono">
                    {latestEvidence ? (
                      latestEvidence.id
                    ) : historicalCount > 0 ? (
                      <em className="is-risk">{historicalCount} 历史</em>
                    ) : (
                      <em>无</em>
                    )}
                  </span>

                  <span className="acceptance-matrix__confirmation">
                    {item.confirmation.state === "confirmed" ? (
                      <>
                        <CircleCheck
                          aria-hidden="true"
                          size={13}
                          strokeWidth={1.7}
                        />
                        已确认
                      </>
                    ) : (
                      <>
                        <span className="acceptance-matrix__pending-dot" />
                        待确认
                      </>
                    )}
                  </span>

                  <ChevronRight
                    aria-hidden="true"
                    className="acceptance-matrix__chevron"
                    size={14}
                  />
                </button>
              );
            })}
          </div>

          <footer className="acceptance-matrix__footer">
            <span className="mono">
              SHOWING {filteredItems.length} / {state.acceptanceItems.length}
            </span>
            <span className="mono">EVIDENCE STATE ≠ HUMAN APPROVAL</span>
          </footer>
        </div>

        {selectedItem && <AcceptanceDetail item={selectedItem} />}
      </div>
    </section>
  );
}
