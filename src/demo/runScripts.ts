import type {
  AcceptanceItem,
  AcceptanceStatus,
  DemoRun,
  DiffSnapshot,
  Evidence,
  RunLogLine,
} from "../types/workspace";

interface CreateDemoRunOptions {
  target: AcceptanceItem;
  snapshot: DiffSnapshot;
  runNumber: number;
  logNumber: number;
  shotNumber: number;
}

export interface DemoRunDraft {
  run: DemoRun;
  nextRunNumber: number;
  nextLogNumber: number;
  nextShotNumber: number;
}

function pad(value: number, length = 2) {
  return String(value).padStart(length, "0");
}

/**
 * 生成一次完全预置的“检查回放”。
 * 这里不会调用 Git、浏览器自动化或测试命令，只把模拟结果包装成可解释的时间线。
 */
export function createDemoRun({
  target,
  snapshot,
  runNumber,
  logNumber,
  shotNumber,
}: CreateDemoRunOptions): DemoRunDraft {
  const runId = `RUN-${pad(runNumber, 3)}`;
  const logId = `LOG-${pad(logNumber, 3)}`;
  const shotId = `SHOT-${pad(shotNumber)}`;
  const startMinuteTotal = 7 * 60 + 44 + (runNumber - 2) * 3;
  const startedAt = `${pad(Math.floor(startMinuteTotal / 60))}:${pad(startMinuteTotal % 60)}:12`;
  const timestamp = (offsetSeconds: number) => {
    const total = startMinuteTotal * 60 + 12 + offsetSeconds;
    return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
  };

  const isContrastCheck = target.id === "AC-04";
  const isSystemThemeCheck = target.id === "AC-05";
  const fails = isContrastCheck && snapshot.id === "before-fix";
  const outcome: AcceptanceStatus = fails ? "failed" : "passed";
  const scopePaths = Array.from(
    new Set(target.codeLinks.map((link) => link.filePath)),
  );
  const captureImage = isContrastCheck
    ? fails
      ? "/demo/contrast-before.svg"
      : "/demo/contrast-after.svg"
    : isSystemThemeCheck
      ? "/demo/system-theme.svg"
      : "/demo/theme-toggle.svg";

  const logs: RunLogLine[] = isContrastCheck
    ? [
        {
          id: `${runId}-01`,
          at: timestamp(0),
          tone: "info",
          text: `DEMO REPLAY / ${target.id} / ${snapshot.label}`,
        },
        {
          id: `${runId}-02`,
          at: timestamp(1),
          tone: "command",
          text: "load demo fixture: /settings · viewport 1440×900",
        },
        {
          id: `${runId}-03`,
          at: timestamp(3),
          tone: "info",
          text: "measure .settings-description foreground against surface",
        },
        {
          id: `${runId}-04`,
          at: timestamp(4),
          tone: fails ? "fail" : "pass",
          text: fails
            ? "contrast = 3.8:1 · required >= 4.5:1"
            : "contrast = 5.2:1 · required >= 4.5:1",
        },
        {
          id: `${runId}-05`,
          at: timestamp(5),
          tone: fails ? "fail" : "pass",
          text: fails
            ? `assertion failed · ${logId} + ${shotId} recorded`
            : `assertion passed · ${logId} + ${shotId} recorded`,
        },
        {
          id: `${runId}-06`,
          at: timestamp(7),
          tone: "info",
          text: `RUN completed · outcome ${outcome} · human confirmation pending`,
        },
      ]
    : isSystemThemeCheck
      ? [
          {
            id: `${runId}-01`,
            at: timestamp(0),
            tone: "info",
            text: `DEMO REPLAY / ${target.id} / ${snapshot.label}`,
          },
          {
            id: `${runId}-02`,
            at: timestamp(1),
            tone: "command",
            text: "simulate system color scheme: light → dark",
          },
          {
            id: `${runId}-03`,
            at: timestamp(3),
            tone: "pass",
            text: "no manual preference → document theme follows system",
          },
          {
            id: `${runId}-04`,
            at: timestamp(4),
            tone: "pass",
            text: `manual preference restored after system change · ${logId}`,
          },
          {
            id: `${runId}-05`,
            at: timestamp(6),
            tone: "info",
            text: `RUN completed · outcome passed · ${shotId} captured`,
          },
        ]
      : [
          {
            id: `${runId}-01`,
            at: timestamp(0),
            tone: "info",
            text: `DEMO REPLAY / ${target.id} / custom acceptance`,
          },
          {
            id: `${runId}-02`,
            at: timestamp(1),
            tone: "command",
            text: "load demo acceptance fixture",
          },
          {
            id: `${runId}-03`,
            at: timestamp(3),
            tone: "pass",
            text: `predefined condition satisfied · ${logId}`,
          },
          {
            id: `${runId}-04`,
            at: timestamp(5),
            tone: "info",
            text: `RUN completed · outcome passed · ${shotId} captured`,
          },
        ];

  const logEvidence: Evidence = {
    id: logId,
    kind: "test-log",
    title: isContrastCheck
      ? fails
        ? "对比度复测仍失败"
        : "对比度修复复测通过"
      : isSystemThemeCheck
        ? "系统主题行为检查"
        : "自定义验收项检查",
    description: fails
      ? "次要文字与背景的对比度仍为 3.8:1。工具保留失败事实，不提供“忽略并继续”。"
      : "预置回放检查通过。该结果需要人工确认后，才可进入可交付报告。",
    runId,
    snapshotId: snapshot.id,
    acceptanceIds: [target.id],
    capturedAt: `2026-10-27 ${timestamp(5)}`,
    scopePaths,
    content: logs.map((line) => `${line.at}  ${line.text}`).join("\n"),
    isDemo: true,
  };

  const screenshotEvidence: Evidence = {
    id: shotId,
    kind: "browser-screenshot",
    title: isContrastCheck
      ? fails
        ? "复测后的设置页对比度截图"
        : "修复后的设置页对比度截图"
      : isSystemThemeCheck
        ? "系统主题切换后的设置页"
        : "自定义验收项证据截图",
    description: "模拟浏览器截图，仅用于演示证据归属与快照失效逻辑。",
    runId,
    snapshotId: snapshot.id,
    acceptanceIds: [target.id],
    capturedAt: `2026-10-27 ${timestamp(7)}`,
    scopePaths,
    imageSrc: captureImage,
    isDemo: true,
  };

  return {
    run: {
      id: runId,
      snapshotId: snapshot.id,
      label: isContrastCheck
        ? "对比度复测"
        : isSystemThemeCheck
          ? "系统主题检查"
          : "自定义验收检查",
      status: "running",
      startedAt: `2026-10-27T${startedAt}+08:00`,
      acceptanceIds: [target.id],
      outcomes: { [target.id]: outcome },
      logs,
      visibleLogCount: 0,
      evidenceToAdd: [logEvidence, screenshotEvidence],
      caption: fails
        ? "回放结束：对比度仍然不足，验收项保持失败。"
        : "回放结束：预置检查通过，等待人工确认证据。",
    },
    nextRunNumber: runNumber + 1,
    nextLogNumber: logNumber + 1,
    nextShotNumber: shotNumber + 1,
  };
}
