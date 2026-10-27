import {
  ArrowRight,
  Check,
  CircleAlert,
  FileCode2,
  GitCompare,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { DiffSnapshot } from "../types/workspace";
import { WorkspacePageHeader } from "../components/workspace/WorkspacePageHeader";
import { RequirementDocument } from "../components/workspace/RequirementDocument";
import { DiffViewer } from "../components/workspace/DiffViewer";
import { SuggestionDrawer } from "../components/workspace/SuggestionDrawer";
import { useWorkspace } from "../state/WorkspaceContext";
import {
  getActiveSnapshot,
  getSnapshotTotals,
  getStatusCounts,
} from "../state/selectors";
import { useState } from "react";
import "./RequirementsPage.css";

/**
 * 需求与变更：把验收范围和当前代码快照放在同一视线内。
 */
export default function RequirementsPage() {
  const { state, isRunning, loadSnapshot } = useWorkspace();
  const activeSnapshot: DiffSnapshot = getActiveSnapshot(state);
  const totals = getSnapshotTotals(activeSnapshot);
  const counts = getStatusCounts(state.acceptanceItems);
  const pendingSuggestions = state.suggestions.filter(
    (suggestion) => suggestion.state === "pending",
  ).length;
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  return (
    <section className="requirements-page">
      <WorkspacePageHeader
        actions={
          <>
            {state.activeSnapshotId === "before-fix" ? (
              <button
                className="pp-button pp-button--primary"
                disabled={isRunning}
                onClick={() => loadSnapshot("after-fix")}
                title={
                  isRunning ? "请等待当前回放结束后再切换快照" : undefined
                }
                type="button"
              >
                <GitCompare aria-hidden="true" size={15} />
                载入修复后演示快照
              </button>
            ) : (
              <span className="requirements-page__snapshot-loaded">
                <Check aria-hidden="true" size={14} />
                修复快照已载入
              </span>
            )}
            <button
              className="pp-button pp-button--secondary"
              onClick={() => setSuggestionsOpen(true)}
              type="button"
            >
              <Sparkles aria-hidden="true" size={15} />
              AI 建议
              {pendingSuggestions > 0 && (
                <span className="requirements-page__suggestion-count">
                  {pendingSuggestions}
                </span>
              )}
            </button>
          </>
        }
        description="先确认这条需求需要证明什么，再检查代码改了什么。切换快照会保留旧证据，但让受影响的验收项回到未验证。"
        index="01"
        label="Requirements & diff"
        title="需求与变更"
      />

      {state.activeSnapshotId === "after-fix" && (
        <div className="requirements-page__snapshot-notice">
          <CircleAlert aria-hidden="true" size={15} strokeWidth={1.6} />
          <div>
            <strong>当前是修复快照，只修改了 tokens.css。</strong>
            <span>
              旧对比度证据仍在历史里，但已被标记为失效；只有重新检查后的证据才属于当前补丁。
            </span>
          </div>
          <Link to="/workspace/acceptance">
            查看受影响的 AC-04
            <ArrowRight aria-hidden="true" size={14} />
          </Link>
        </div>
      )}

      <div className="requirements-page__meta-row">
        <span className="mono">
          CASE / {state.requirement.id} / {activeSnapshot.label}
        </span>
        <span className="mono">
          {state.acceptanceItems.length} ACCEPTANCE ITEMS
        </span>
        <span className="mono">
          {counts.passed} PASSED / {counts.failed} FAILED /{" "}
          {counts.unverified} UNVERIFIED
        </span>
        <span className="mono">
          +{totals.additions} / −{totals.deletions} LINES
        </span>
      </div>

      <div className="requirements-page__grid">
        <RequirementDocument
          onOpenSuggestions={() => setSuggestionsOpen(true)}
          snapshot={activeSnapshot}
        />
        <DiffViewer snapshot={activeSnapshot} />
      </div>

      <div className="requirements-page__footer-note">
        <FileCode2 aria-hidden="true" size={15} strokeWidth={1.5} />
        <p>
          差异文件与行号均为预置演示内容，不读取真实仓库。证据失效判断依据当前补丁修改路径，而不是“看起来是否相关”。
        </p>
      </div>

      <SuggestionDrawer
        onClose={() => setSuggestionsOpen(false)}
        open={suggestionsOpen}
      />
    </section>
  );
}
