import express from "express";
import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { toErrorResponse, UserFacingError } from "./errors.mjs";

const APP_VERSION = "0.2.0";
const localOrigin = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;
const asyncHandler = (handler) => (request, response, next) => {
  Promise.resolve(handler(request, response, next)).catch(next);
};

export function createApp({ service, store, staticDir }) {
  const app = express();
  app.disable("x-powered-by");

  app.use((request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    if (request.path.startsWith("/api/")) {
      const origin = request.headers.origin;
      if (origin && !localOrigin.test(origin)) {
        response.status(403).json({
          ok: false,
          error: {
            code: "ORIGIN_NOT_ALLOWED",
            message: "仅允许本机页面访问 ProofPatch 本地服务。",
          },
        });
        return;
      }
      response.setHeader("Cache-Control", "no-store");
    }
    next();
  });

  app.use(express.json({ limit: "256kb" }));

  app.get("/api/health", (_request, response) => {
    response.json({
      ok: true,
      data: {
        app: "proofpatch",
        version: APP_VERSION,
        protocolVersion: 1,
        mode: "local",
        capabilities: ["git", "commands", "local-evidence"],
      },
    });
  });

  app.get(
    "/api/sessions",
    asyncHandler(async (_request, response) => {
      const sessions = await service.listSessions();
      response.json({ ok: true, data: { sessions } });
    }),
  );

  app.post(
    "/api/inspect",
    asyncHandler(async (request, response) => {
      const inspection = await service.inspect(
        request.body?.projectPath,
        request.body?.baseRef || "HEAD",
      );
      response.json({ ok: true, data: inspection });
    }),
  );

  app.post(
    "/api/sessions",
    asyncHandler(async (request, response) => {
      const session = await service.createSession(request.body || {});
      response.status(201).json({ ok: true, data: { session } });
    }),
  );

  app.get(
    "/api/sessions/:sessionId",
    asyncHandler(async (request, response) => {
      const session = await service.getSession(request.params.sessionId);
      response.json({ ok: true, data: { session } });
    }),
  );

  app.post(
    "/api/sessions/:sessionId/checks/:checkId/run",
    asyncHandler(async (request, response) => {
      const session = await service.runCheck(
        request.params.sessionId,
        request.params.checkId,
      );
      response.json({ ok: true, data: { session } });
    }),
  );

  app.post(
    "/api/sessions/:sessionId/interrupt",
    asyncHandler(async (request, response) => {
      const result = await service.interrupt(request.params.sessionId);
      response.json({ ok: true, data: result });
    }),
  );

  app.post(
    "/api/sessions/:sessionId/checks/:checkId/confirm",
    asyncHandler(async (request, response) => {
      const session = await service.confirm(
        request.params.sessionId,
        request.params.checkId,
      );
      response.json({ ok: true, data: { session } });
    }),
  );

  app.post(
    "/api/sessions/:sessionId/refresh",
    asyncHandler(async (request, response) => {
      const result = await service.refresh(request.params.sessionId);
      response.json({
        ok: true,
        data: {
          session: result.session,
          invalidated: result.invalidated,
        },
      });
    }),
  );

  app.delete(
    "/api/sessions/:sessionId",
    asyncHandler(async (request, response) => {
      const result = await service.deleteSession(request.params.sessionId);
      response.json({ ok: true, data: result });
    }),
  );

  app.use("/api", (_request, response) => {
    response.status(404).json({
      ok: false,
      error: { code: "NOT_FOUND", message: "本地 API 路由不存在。" },
    });
  });

  const resolvedStaticDir =
    staticDir ??
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../dist",
    );

  app.use(express.static(resolvedStaticDir, { index: "index.html" }));

  app.get("*", asyncHandler(async (_request, response, next) => {
    const indexPath = path.join(resolvedStaticDir, "index.html");
    try {
      await fs.access(indexPath);
      response.sendFile(indexPath);
    } catch {
      if (resolvedStaticDir && (await fs.stat(resolvedStaticDir).catch(() => null))) {
        next();
        return;
      }
      response
        .status(503)
        .type("text/plain")
        .send(
          "ProofPatch 前端尚未构建。请运行 npm run app，或同时启动 Vite 与本地服务。",
        );
    }
  }));

  app.use((_request, response) => {
    response.status(404).json({
      ok: false,
      error: { code: "NOT_FOUND", message: "请求的资源不存在。" },
    });
  });

  app.use((error, _request, response, _next) => {
    const { status, body } = toErrorResponse(error);
    if (error instanceof SyntaxError && "body" in error) {
      response.status(400).json({
        ok: false,
        error: { code: "INVALID_JSON", message: "请求体不是有效 JSON。" },
      });
      return;
    }
    if (!(error instanceof UserFacingError) && status >= 500) {
      console.error("[ProofPatch]", error);
    }
    response.status(status).json(body);
  });

  return app;
}
