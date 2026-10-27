import type {
  CreateLiveSessionInput,
  LiveSessionDto,
  RepositoryInspection,
  SessionSummary,
} from "../types/live";

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
}

export class LocalServerError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 0, code = "LOCAL_SERVER_ERROR") {
    super(message);
    this.name = "LocalServerError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs?: number,
): Promise<T> {
  const controller = new AbortController();
  const timer =
    typeof timeoutMs === "number"
      ? window.setTimeout(() => controller.abort(), timeoutMs)
      : undefined;

  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers ?? {}),
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new LocalServerError("本地服务响应超时。", 0, "TIMEOUT");
    }
    throw new LocalServerError(
      "无法连接 ProofPatch 本地服务。请从终端运行 npm run app。",
      0,
      "SERVER_UNAVAILABLE",
    );
  } finally {
    if (timer) window.clearTimeout(timer);
  }

  let payload: ApiEnvelope<T>;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new LocalServerError(
      "本地服务返回了无法识别的响应。请确认通过 npm run app 打开应用。",
      response.status,
      "INVALID_RESPONSE",
    );
  }

  if (!response.ok || !payload.ok || payload.data === undefined) {
    throw new LocalServerError(
      payload.error?.message ?? "本地服务请求失败。",
      response.status,
      payload.error?.code ?? "REQUEST_FAILED",
    );
  }

  return payload.data;
}

export async function checkLocalServer(): Promise<boolean> {
  try {
    await request<{ app: string; version: string }>(
      "/api/health",
      {},
      1_800,
    );
    return true;
  } catch {
    return false;
  }
}

export function inspectProject(
  projectPath: string,
  baseRef = "HEAD",
): Promise<RepositoryInspection> {
  return request<RepositoryInspection>("/api/inspect", {
    method: "POST",
    body: JSON.stringify({ projectPath, baseRef }),
  });
}

export async function createLiveSession(
  input: CreateLiveSessionInput,
): Promise<LiveSessionDto> {
  const result = await request<{ session: LiveSessionDto }>("/api/sessions", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.session;
}

export async function getLiveSession(
  sessionId: string,
): Promise<LiveSessionDto> {
  const result = await request<{ session: LiveSessionDto }>(
    `/api/sessions/${encodeURIComponent(sessionId)}`,
  );
  return result.session;
}

export async function listLiveSessions(): Promise<SessionSummary[]> {
  const result = await request<{ sessions: SessionSummary[] }>(
    "/api/sessions",
  );
  return result.sessions;
}

export async function runLiveCheck(
  sessionId: string,
  checkId: string,
): Promise<LiveSessionDto> {
  const result = await request<{ session: LiveSessionDto }>(
    `/api/sessions/${encodeURIComponent(sessionId)}/checks/${encodeURIComponent(checkId)}/run`,
    { method: "POST" },
  );
  return result.session;
}

export async function interruptLiveSession(
  sessionId: string,
): Promise<{ interrupted: boolean }> {
  return request<{ interrupted: boolean }>(
    `/api/sessions/${encodeURIComponent(sessionId)}/interrupt`,
    { method: "POST" },
  );
}

export async function confirmLiveCheck(
  sessionId: string,
  checkId: string,
): Promise<LiveSessionDto> {
  const result = await request<{ session: LiveSessionDto }>(
    `/api/sessions/${encodeURIComponent(sessionId)}/checks/${encodeURIComponent(checkId)}/confirm`,
    { method: "POST" },
  );
  return result.session;
}

export async function refreshLiveSession(
  sessionId: string,
): Promise<{ session: LiveSessionDto; invalidated: boolean }> {
  return request<{ session: LiveSessionDto; invalidated: boolean }>(
    `/api/sessions/${encodeURIComponent(sessionId)}/refresh`,
    { method: "POST" },
  );
}

export async function deleteLiveSession(
  sessionId: string,
): Promise<{ removed: boolean }> {
  return request<{ removed: boolean }>(
    `/api/sessions/${encodeURIComponent(sessionId)}`,
    { method: "DELETE" },
  );
}
