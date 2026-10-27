// @vitest-environment node

import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.mjs";
import { SessionStore } from "./store.mjs";
import { WorkspaceService } from "./workspaceService.mjs";

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function write(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

async function request(baseUrl, route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
  });
  const payload = await response.json();
  return { response, payload };
}

describe("ProofPatch local workspace API", () => {
  let fixtureDir;
  let dataDir;
  let server;
  let baseUrl;
  let store;

  beforeEach(async () => {
    fixtureDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "proofpatch-fixture-"),
    );
    dataDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "proofpatch-data-"),
    );

    git(fixtureDir, ["init", "-q", "-b", "main"]);
    await write(
      path.join(fixtureDir, "package.json"),
      JSON.stringify(
        {
          name: "fixture-storefront",
          scripts: {
            build: "node build.mjs",
            test: "node check-fail.mjs",
          },
        },
        null,
        2,
      ),
    );
    await write(
      path.join(fixtureDir, "build.mjs"),
      "console.log('fixture build ok');\n",
    );
    await write(
      path.join(fixtureDir, "check-fail.mjs"),
      "console.error('fixture test failed');\nprocess.exit(1);\n",
    );
    await write(
      path.join(fixtureDir, "src/index.js"),
      "export const theme = 'light';\n",
    );
    git(fixtureDir, ["add", "."]);
    git(fixtureDir, [
      "-c",
      "user.name=ProofPatch Test",
      "-c",
      "user.email=proofpatch@example.test",
      "commit",
      "-m",
      "initial",
    ]);

    await write(
      path.join(fixtureDir, "src/index.js"),
      "export const theme = 'dark';\nexport const persisted = true;\n",
    );
    await write(
      path.join(fixtureDir, "notes.txt"),
      "untracked acceptance note\n",
    );

    store = new SessionStore(dataDir);
    await store.init();
    const service = new WorkspaceService({ store, timeoutMs: 10_000 });
    const app = createApp({
      service,
      store,
      staticDir: path.join(dataDir, "no-static"),
    });
    server = await new Promise((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(fixtureDir, { recursive: true, force: true });
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("inspects a real Git worktree including untracked files", async () => {
    const { response, payload } = await request(baseUrl, "/api/inspect", {
      method: "POST",
      body: JSON.stringify({
        projectPath: `"${fixtureDir}"`,
        baseRef: "HEAD",
      }),
    });

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.project.name).toBe("fixture-storefront");
    expect(payload.data.project.commandSuggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ command: "npm run build" }),
      ]),
    );

    const changedPaths = payload.data.snapshot.files.map((file) => file.path);
    expect(changedPaths).toContain("src/index.js");
    expect(changedPaths).toContain("notes.txt");
    expect(payload.data.snapshot.fingerprint).toMatch(/^[a-f0-9]{40}$/);
  });

  it("creates a session only after command execution is acknowledged", async () => {
    const basePayload = {
      projectPath: fixtureDir,
      baseRef: "HEAD",
      requirementTitle: "商店外观交付",
      requirementSummary: "工作区改动需要通过构建与测试检查。",
      checks: [
        { title: "项目构建", command: "node build.mjs" },
        { title: "失败检查", command: "node check-fail.mjs" },
      ],
    };

    const rejected = await request(baseUrl, "/api/sessions", {
      method: "POST",
      body: JSON.stringify({ ...basePayload, acknowledged: false }),
    });
    expect(rejected.response.status).toBe(400);

    const created = await request(baseUrl, "/api/sessions", {
      method: "POST",
      body: JSON.stringify({ ...basePayload, acknowledged: true }),
    });
    expect(created.response.status).toBe(201);
    expect(created.payload.data.session.checks).toHaveLength(2);
    expect(created.payload.data.session.checks[0]).toMatchObject({
      id: "AC-01",
      status: "unverified",
      command: "node build.mjs",
    });
  });

  it("runs real commands, records output, and requires confirmation", async () => {
    const created = await request(baseUrl, "/api/sessions", {
      method: "POST",
      body: JSON.stringify({
        projectPath: fixtureDir,
        baseRef: "HEAD",
        requirementTitle: "真实构建",
        requirementSummary: "构建命令必须返回零退出码。",
        checks: [
          { title: "项目构建", command: "node build.mjs" },
          { title: "失败检查", command: "node check-fail.mjs" },
        ],
        acknowledged: true,
      }),
    });
    const sessionId = created.payload.data.session.id;

    const passed = await request(
      baseUrl,
      `/api/sessions/${sessionId}/checks/AC-01/run`,
      { method: "POST" },
    );
    expect(passed.response.status).toBe(200);
    expect(passed.payload.data.session.checks[0].status).toBe("passed");
    expect(passed.payload.data.session.checks[0].confirmation.state).toBe(
      "pending",
    );
    expect(passed.payload.data.session.runs[0]).toMatchObject({
      status: "completed",
      command: "node build.mjs",
    });
    const evidence = passed.payload.data.session.evidence[0];
    expect(evidence.isDemo).toBe(false);
    expect(evidence.content).toContain("fixture build ok");
    expect(evidence.fingerprint).toBe(
      passed.payload.data.session.snapshot.fingerprint,
    );

    const failed = await request(
      baseUrl,
      `/api/sessions/${sessionId}/checks/AC-02/run`,
      { method: "POST" },
    );
    expect(failed.payload.data.session.checks[1].status).toBe("failed");
    expect(failed.payload.data.session.runs[1].caption).toContain("失败");

    const confirmed = await request(
      baseUrl,
      `/api/sessions/${sessionId}/checks/AC-01/confirm`,
      { method: "POST" },
    );
    expect(confirmed.payload.data.session.checks[0].confirmation.state).toBe(
      "confirmed",
    );
    expect(
      confirmed.payload.data.session.checks[0].confirmation.confirmedBy,
    ).toBe("本地交付负责人");
  });

  it("invalidates evidence when the repository fingerprint changes", async () => {
    const created = await request(baseUrl, "/api/sessions", {
      method: "POST",
      body: JSON.stringify({
        projectPath: fixtureDir,
        baseRef: "HEAD",
        requirementTitle: "快照失效测试",
        requirementSummary: "代码变化后，之前的证据不能继续用于交付。",
        checks: [{ title: "项目构建", command: "node build.mjs" }],
        acknowledged: true,
      }),
    });
    const sessionId = created.payload.data.session.id;

    await request(
      baseUrl,
      `/api/sessions/${sessionId}/checks/AC-01/run`,
      { method: "POST" },
    );
    await request(
      baseUrl,
      `/api/sessions/${sessionId}/checks/AC-01/confirm`,
      { method: "POST" },
    );
    const before = await request(
      baseUrl,
      `/api/sessions/${sessionId}`,
    );
    const previousFingerprint = before.payload.data.session.snapshot.fingerprint;

    await write(
      path.join(fixtureDir, "src/index.js"),
      "export const theme = 'dark';\nexport const changedAgain = true;\n",
    );
    const refreshed = await request(
      baseUrl,
      `/api/sessions/${sessionId}/refresh`,
      { method: "POST" },
    );

    expect(refreshed.payload.data.invalidated).toBe(true);
    expect(
      refreshed.payload.data.session.snapshot.fingerprint,
    ).not.toBe(previousFingerprint);
    expect(refreshed.payload.data.session.checks[0].status).toBe(
      "unverified",
    );
    expect(
      refreshed.payload.data.session.checks[0].confirmation.state,
    ).toBe("pending");
    expect(refreshed.payload.data.session.evidence).toHaveLength(1);
  });
});
