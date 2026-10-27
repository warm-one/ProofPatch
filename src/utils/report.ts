import {
  formatDemoTimestamp,
  getActiveSnapshot,
  getCurrentEvidence,
  getReportReadiness,
} from "../state/selectors";
import type { WorkspaceState } from "../types/workspace";

/**
 * 导出报告摘要时只汇总当前工作台事实，并始终携带演示声明。
 */
export function buildReportSummary(state: WorkspaceState) {
  const snapshot = getActiveSnapshot(state);
  const readiness = getReportReadiness(state.acceptanceItems);
  const reportState = readiness.deliverable ? "可交付" : "草稿 / 不可交付";

  const acceptanceLines = state.acceptanceItems.map((item) => {
    const evidence = getCurrentEvidence(item, state)
      .map((entry) => entry.id)
      .join(", ");
    const confirmation =
      item.confirmation.state === "confirmed"
        ? `已由${item.confirmation.confirmedBy ?? "交付负责人"}确认`
        : "待人工确认";

    return `- ${item.id} ${item.title}｜${item.status.toUpperCase()}｜证据：${evidence || "无有效证据"}｜${confirmation}`;
  });

  return [
    "PROOFPATCH / DELIVERY REPORT",
    `报告状态：${reportState}`,
    `项目：storefront-web`,
    `需求：${state.requirement.id} ${state.requirement.title}`,
    `快照：${snapshot.label} · ${snapshot.commit}`,
    `统计：${readiness.counts.passed} 通过 / ${readiness.counts.failed} 失败 / ${readiness.counts.unverified} 未验证 / ${readiness.pendingConfirmations} 待人工确认`,
    "",
    "验收记录：",
    ...acceptanceLines,
    "",
    `未决项：${readiness.counts.failed + readiness.counts.unverified + readiness.pendingConfirmations}`,
    `最近报告生成：${formatDemoTimestamp(new Date().toISOString())}`,
    "",
    "声明：本报告来自 ProofPatch 前端演示数据，不连接真实仓库，不执行真实测试。",
  ].join("\n");
}
