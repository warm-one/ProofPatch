import { randomUUID } from "node:crypto";
import { inspectRepository } from "./git.mjs";
import { UserFacingError } from "./errors.mjs";
import {
  executeCommand,
  interruptSession,
  isSessionRunning,
} from "./runner.mjs";

function pad(value, length = 3) {
  return String(value).padStart(length, "0");
}

function localClock(date = new Date()) {
  return date.toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function cleanText(value, maxLength, fieldName) {
  if (typeof value !== "string") {
    throw new UserFacingError(`${fieldName}必须是文本。`);
  }
  const text = value.trim();
  if (!text) {
    throw new UserFacingError(`请填写${fieldName}。`);
  }
  if (text.length > maxLength) {
    throw new UserFacingError(`${fieldName}过长，最多 ${maxLength} 个字符。`);
  }
  return text;
}

function normalizeChecks(rawChecks) {
  if (!Array.isArray(rawChecks) || rawChecks.length === 0) {
    throw new UserFacingError("至少配置一项检查。");
  }
  if (rawChecks.length > 12) {
    throw new UserFacingError("第一版最多支持 12 项检查。");
  }

  return rawChecks.map((check, index) => {
    const title = cleanText(check?.title, 120, `第 ${index + 1} 项检查名称`);
    const command = cleanText(
      check?.command,
      500,
      `第 ${index + 1} 项检查命令`,
    );
    if (/[\u0000\r\n]/.test(command)) {
      throw new UserFacingError(
        `第 ${index + 1} 项检查只能包含单行命令。`,
      );
    }
    return { id: `AC-${pad(index + 1, 2)}`, title, command };
  });
}

function createCheck(check) {
  return {
    id: check.id,
    title: check.title,
    command: check.command,
    criterion: `在本地项目目录执行“${check.command}”，退出码为 0 才视为通过。`,
    status: "unverified",
    source: "human",
    codeLinks: [],
    evidenceIds: [],
    confirmation: { state: "pending" },
  };
}

function makeRunLog(id, text, tone = "info", at = localClock()) {
  return { id, at, tone, text };
}

function outputToLogLines(output) {
  const lines = output
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);
  if (lines.length <= 160) return lines;
  return [
    ...lines.slice(0, 60),
    `[省略 ${lines.length - 120} 行输出]`,
    ...lines.slice(-60),
  ];
}

function makeFailureMessage(error) {
  return error instanceof Error ? error.message : "未知执行错误";
}

export class WorkspaceService {
  constructor({ store, timeoutMs = 120_000 }) {
    this.store = store;
    this.timeoutMs = timeoutMs;
  }

  async inspect(projectPath, baseRef = "HEAD") {
    return inspectRepository(projectPath, baseRef);
  }

  async createSession(input) {
    if (input?.acknowledged !== true) {
      throw new UserFacingError(
        "请先确认你理解命令将在本地项目目录中执行。",
      );
    }

    const projectPath = cleanText(input?.projectPath, 1_000, "项目目录");
    const requirementTitle = cleanText(
      input?.requirementTitle,
      160,
      "需求标题",
    );
    const requirementSummary = cleanText(
      input?.requirementSummary,
      4_000,
      "需求说明",
    );
    const baseRef =
      typeof input?.baseRef === "string" && input.baseRef.trim()
        ? input.baseRef.trim()
        : "HEAD";
    const checksInput = normalizeChecks(input?.checks);
    const inspection = await inspectRepository(projectPath, baseRef);

    const now = new Date().toISOString();
    const session = {
      schemaVersion: 1,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      project: inspection.project,
      requirement: {
        id: "REQ-LOCAL",
        title: requirementTitle,
        summary: requirementSummary,
        inScope: checksInput.map((check) => check.title),
        outOfScope: [],
      },
      snapshot: inspection.snapshot,
      checks: checksInput.map(createCheck),
      evidence: [],
      runs: [],
      selectedAcceptanceId: checksInput[0].id,
    };

    await this.store.save(session);
    return session;
  }

  async getSession(sessionId) {
    const session = await this.store.get(sessionId);
    if (!session) {
      throw new UserFacingError("本地会话不存在。", 404, "SESSION_NOT_FOUND");
    }
    return await this.normalizeInterruptedRuns(session);
  }

  async listSessions() {
    return this.store.list();
  }

  async deleteSession(sessionId) {
    const session = await this.getSession(sessionId);
    if (isSessionRunning(session.id)) {
      throw new UserFacingError("请先中止正在运行的检查。", 409);
    }
    await this.store.remove(session.id);
    return { removed: true };
  }

  async normalizeInterruptedRuns(session) {
    if (isSessionRunning(session.id)) return session;

    let changed = false;
    const runs = (session.runs || []).map((run) => {
      if (run.status !== "running") return run;
      changed = true;
      return {
        ...run,
        status: "interrupted",
        finishedAt: run.finishedAt ?? new Date().toISOString(),
        caption: "服务中断，未产生新的有效证据。",
      };
    });

    if (!changed) return session;
    const updated = { ...session, runs, updatedAt: new Date().toISOString() };
    await this.store.save(updated);
    return updated;
  }

  async runCheck(sessionId, checkId) {
    const session = await this.getSession(sessionId);
    if (isSessionRunning(session.id)) {
      throw new UserFacingError(
        "这个会话已有检查正在执行，请等待结束或先中止。",
        409,
        "RUN_IN_PROGRESS",
      );
    }

    const check = session.checks.find((candidate) => candidate.id === checkId);
    if (!check) {
      throw new UserFacingError("检查项不存在。", 404, "CHECK_NOT_FOUND");
    }

    const runNumber = session.runs.length + 1;
    const runId = `RUN-${pad(runNumber)}`;
    const startedAt = new Date();
    const runningRun = {
      id: runId,
      snapshotId: "live",
      label: check.title,
      command: check.command,
      status: "running",
      startedAt: startedAt.toISOString(),
      acceptanceIds: [check.id],
      outcomes: {},
      logs: [
        makeRunLog(
          `${runId}-start`,
          `$ ${check.command}`,
          "command",
          localClock(startedAt),
        ),
      ],
      visibleLogCount: 1,
      evidenceToAdd: [],
      caption: "命令正在本地项目中执行。",
    };

    session.runs.push(runningRun);
    session.selectedAcceptanceId = check.id;
    session.updatedAt = new Date().toISOString();
    await this.store.save(session);

    let execution;
    try {
      execution = await executeCommand(
        session.id,
        check.command,
        session.project.path,
        this.timeoutMs,
      );
    } catch (error) {
      execution = {
        output: makeFailureMessage(error),
        exitCode: null,
        signal: null,
        timedOut: false,
        interrupted: false,
        durationMs: 0,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
      };
    }

    const interrupted = execution.interrupted;
    const passed =
      !interrupted && !execution.timedOut && execution.exitCode === 0;
    const outcome = passed ? "passed" : "failed";
    const outputText = execution.output.trim();
    const logLines = outputToLogLines(outputText);
    const logs = [
      makeRunLog(
        `${runId}-start`,
        `$ ${check.command}`,
        "command",
        localClock(new Date(execution.startedAt)),
      ),
    ];

    if (logLines.length === 0) {
      logs.push(
        makeRunLog(
          `${runId}-empty`,
          "命令执行完成，没有产生标准输出。",
          "info",
          localClock(new Date(execution.finishedAt)),
        ),
      );
    } else {
      logLines.forEach((line, index) => {
        logs.push(
          makeRunLog(
            `${runId}-out-${index + 1}`,
            line,
            "info",
            localClock(new Date(execution.finishedAt)),
          ),
        );
      });
    }

    if (interrupted) {
      logs.push(
        makeRunLog(
          `${runId}-end`,
          "检查被用户中止，未写入新证据。",
          "fail",
          localClock(new Date(execution.finishedAt)),
        ),
      );
    } else if (execution.timedOut) {
      logs.push(
        makeRunLog(
          `${runId}-end`,
          `检查超时（${Math.round(this.timeoutMs / 1000)} 秒），进程已终止。`,
          "fail",
          localClock(new Date(execution.finishedAt)),
        ),
      );
    } else if (passed) {
      logs.push(
        makeRunLog(
          `${runId}-end`,
          "命令退出码为 0，检查通过。仍需人工确认。",
          "pass",
          localClock(new Date(execution.finishedAt)),
        ),
      );
    } else {
      logs.push(
        makeRunLog(
          `${runId}-end`,
          `命令退出码为 ${execution.exitCode ?? "null"}，检查失败。`,
          "fail",
          localClock(new Date(execution.finishedAt)),
        ),
      );
    }

    const runIndex = session.runs.findIndex((run) => run.id === runId);
    session.runs[runIndex] = {
      ...runningRun,
      status: interrupted ? "interrupted" : "completed",
      finishedAt: execution.finishedAt,
      logs,
      visibleLogCount: logs.length,
      outcomes: interrupted ? {} : { [check.id]: outcome },
      caption: interrupted
        ? "检查被中止，没有产生新证据。"
        : passed
          ? `命令通过，退出码 0。${execution.durationMs}ms。`
          : execution.timedOut
            ? "命令超时，视为失败。"
            : `命令失败，退出码 ${execution.exitCode ?? "null"}。`,
    };

    if (!interrupted) {
      const evidenceId = `LOG-${pad(session.evidence.length + 1)}`;
      const evidence = {
        id: evidenceId,
        kind: "test-log",
        title: `${check.title} · 命令证据`,
        description: `真实命令“${check.command}”的终端输出，退出码 ${execution.exitCode ?? "null"}。`,
        runId,
        snapshotId: "live",
        acceptanceIds: [check.id],
        capturedAt: execution.finishedAt,
        scopePaths: [],
        fingerprint: session.snapshot.fingerprint,
        content: [
          `$ ${check.command}`,
          `cwd: ${session.project.path}`,
          `started: ${execution.startedAt}`,
          `finished: ${execution.finishedAt}`,
          `duration: ${execution.durationMs}ms`,
          "",
          outputText || "(no output)",
          "",
          `[exit code ${execution.exitCode ?? "null"}]`,
        ].join("\n"),
        isDemo: false,
      };

      session.evidence.push(evidence);
      check.status = outcome;
      check.confirmation = { state: "pending" };
      check.evidenceIds.push(evidenceId);
      session.selectedAcceptanceId = check.id;
    }

    session.updatedAt = new Date().toISOString();
    await this.store.save(session);
    return session;
  }

  async interrupt(sessionId) {
    const session = await this.getSession(sessionId);
    const interrupted = interruptSession(session.id);
    if (!interrupted) {
      throw new UserFacingError(
        "当前没有可中止的检查。",
        409,
        "NO_ACTIVE_RUN",
      );
    }
    return { interrupted: true, sessionId: session.id };
  }

  async confirm(sessionId, checkId) {
    const session = await this.getSession(sessionId);
    if (isSessionRunning(session.id)) {
      throw new UserFacingError("请等待当前检查结束。", 409);
    }

    const check = session.checks.find((candidate) => candidate.id === checkId);
    if (!check) {
      throw new UserFacingError("检查项不存在。", 404, "CHECK_NOT_FOUND");
    }
    if (check.status !== "passed") {
      throw new UserFacingError("只有通过的检查才能人工确认。");
    }

    const hasCurrentEvidence = session.evidence.some(
      (evidence) =>
        check.evidenceIds.includes(evidence.id) &&
        evidence.fingerprint === session.snapshot.fingerprint,
    );
    if (!hasCurrentEvidence) {
      throw new UserFacingError("当前没有与该快照匹配的有效证据。");
    }

    check.confirmation = {
      state: "confirmed",
      confirmedAt: new Date().toISOString(),
      confirmedBy: "本地交付负责人",
    };
    session.updatedAt = new Date().toISOString();
    await this.store.save(session);
    return session;
  }

  async refresh(sessionId) {
    const session = await this.getSession(sessionId);
    if (isSessionRunning(session.id)) {
      throw new UserFacingError("请等待当前检查结束。", 409);
    }

    const inspection = await this.inspect(
      session.project.path,
      session.project.baseRef,
    );
    const previousFingerprint = session.snapshot?.fingerprint;
    const nextFingerprint = inspection.snapshot?.fingerprint;
    const invalidated =
      Boolean(previousFingerprint) &&
      previousFingerprint !== nextFingerprint;

    session.project = inspection.project;
    session.snapshot = inspection.snapshot;
    if (invalidated) {
      session.checks = session.checks.map((check) => ({
        ...check,
        status: "unverified",
        confirmation: { state: "pending" },
      }));
    }
    session.updatedAt = new Date().toISOString();
    await this.store.save(session);
    return { session, invalidated };
  }
}
