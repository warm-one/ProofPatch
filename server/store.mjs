import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const SESSION_ID_PATTERN = /^[A-Za-z0-9-]{8,80}$/;

export function defaultDataDir() {
  return (
    process.env.PROOFPATCH_DATA_DIR ||
    path.join(os.homedir(), ".proofpatch")
  );
}

export class SessionStore {
  constructor(dataDir = defaultDataDir()) {
    this.dataDir = dataDir;
    this.sessionsDir = path.join(dataDir, "sessions");
  }

  async init() {
    await fs.mkdir(this.sessionsDir, { recursive: true });
  }

  filePath(sessionId) {
    if (!SESSION_ID_PATTERN.test(sessionId)) {
      throw new Error("Invalid session id");
    }
    return path.join(this.sessionsDir, `${sessionId}.json`);
  }

  async save(session) {
    await this.init();
    const target = this.filePath(session.id);
    const temp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify(session, null, 2), "utf8");
    await fs.rename(temp, target);
  }

  async get(sessionId) {
    try {
      const raw = await fs.readFile(this.filePath(sessionId), "utf8");
      return JSON.parse(raw);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error) {
        if (error.code === "ENOENT") return null;
      }
      throw error;
    }
  }

  async remove(sessionId) {
    try {
      await fs.unlink(this.filePath(sessionId));
      return true;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error) {
        if (error.code === "ENOENT") return false;
      }
      throw error;
    }
  }

  async list(limit = 8) {
    await this.init();
    const entries = await fs.readdir(this.sessionsDir, {
      withFileTypes: true,
    });
    const sessions = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const sessionId = entry.name.slice(0, -5);
      if (!SESSION_ID_PATTERN.test(sessionId)) continue;
      try {
        const session = await this.get(sessionId);
        if (!session) continue;
        sessions.push({
          id: session.id,
          projectName: session.project?.name ?? "local-project",
          projectPath: session.project?.path ?? "",
          requirementTitle: session.requirement?.title ?? "",
          updatedAt: session.updatedAt ?? session.createdAt,
          checkCount: session.checks?.length ?? 0,
        });
      } catch {
        // 损坏的本地会话不会阻止其他会话加载。
      }
    }

    return sessions
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, limit);
  }
}
