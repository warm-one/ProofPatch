import type {
  AcceptanceItem,
  DiffSnapshot,
  Evidence,
  Requirement,
  WorkspaceState,
} from "../types/workspace";

const requirement: Requirement = {
  id: "REQ-012",
  title: "支持可持久化的暗色模式",
  summary:
    "用户可以在主要界面切换暗色主题，偏好应在刷新后保留；设置页文字保持可读，主题切换支持键盘操作。",
  inScope: [
    "主页与设置页的暗色主题切换",
    "刷新后恢复用户偏好",
    "设置页正文与次要文字达到 4.5:1 对比度",
    "键盘操作与清晰的焦点状态",
  ],
  outOfScope: ["跨设备同步偏好", "自定义主题色板", "跟随日出日落自动切换"],
};

const beforeFixSnapshot: DiffSnapshot = {
  id: "before-fix",
  label: "BEFORE-FIX",
  displayName: "实现快照",
  commit: "demo·a41c7f",
  createdAt: "2026-10-27 07:38",
  summary: "暗色模式初版实现，包含 4 个文件；设置页对比度检查尚未通过。",
  changedPaths: [
    "src/theme/ThemeProvider.tsx",
    "src/components/ThemeToggle.tsx",
    "src/styles/tokens.css",
    "src/pages/SettingsPage.tsx",
  ],
  files: [
    {
      path: "src/theme/ThemeProvider.tsx",
      status: "modified",
      additions: 31,
      deletions: 4,
      relatedAcceptanceIds: ["AC-01", "AC-02", "AC-05"],
      hunks: [
        {
          header: "@@ -8,6 +8,28 @@ export function ThemeProvider()",
          lines: [
            {
              type: "context",
              oldNumber: 8,
              newNumber: 8,
              content: "export function ThemeProvider({ children }: Props) {",
            },
            {
              type: "remove",
              oldNumber: 9,
              content: "  const [theme, setTheme] = useState<Theme>(\"light\");",
            },
            {
              type: "add",
              newNumber: 9,
              content:
                "  const [theme, setTheme] = useState<Theme>(() => readStoredTheme());",
            },
            {
              type: "add",
              newNumber: 10,
              content: "",
            },
            {
              type: "add",
              newNumber: 11,
              content: "  useEffect(() => {",
            },
            {
              type: "add",
              newNumber: 12,
              content: "    document.documentElement.dataset.theme = theme;",
            },
            {
              type: "add",
              newNumber: 13,
              content: "    localStorage.setItem(\"theme\", theme);",
            },
            {
              type: "add",
              newNumber: 14,
              content: "  }, [theme]);",
            },
            {
              type: "context",
              oldNumber: 10,
              newNumber: 15,
              content: "",
            },
            {
              type: "context",
              oldNumber: 11,
              newNumber: 16,
              content: "  return (",
            },
          ],
        },
      ],
    },
    {
      path: "src/components/ThemeToggle.tsx",
      status: "modified",
      additions: 24,
      deletions: 2,
      relatedAcceptanceIds: ["AC-01", "AC-03"],
      hunks: [
        {
          header: "@@ -4,7 +4,25 @@ export function ThemeToggle()",
          lines: [
            {
              type: "context",
              oldNumber: 4,
              newNumber: 4,
              content: "export function ThemeToggle() {",
            },
            {
              type: "context",
              oldNumber: 5,
              newNumber: 5,
              content: "  const { theme, setTheme } = useTheme();",
            },
            {
              type: "remove",
              oldNumber: 6,
              content: "  return <button onClick={toggle}>Theme</button>;",
            },
            {
              type: "add",
              newNumber: 6,
              content: "  return (",
            },
            {
              type: "add",
              newNumber: 7,
              content: "    <button",
            },
            {
              type: "add",
              newNumber: 8,
              content: "      aria-label={theme === \"dark\" ? \"切换浅色主题\" : \"切换暗色主题\"}",
            },
            {
              type: "add",
              newNumber: 9,
              content: "      aria-pressed={theme === \"dark\"}",
            },
            {
              type: "add",
              newNumber: 10,
              content: "      className=\"theme-toggle\"",
            },
            {
              type: "add",
              newNumber: 11,
              content: "      onClick={() => setTheme(theme === \"dark\" ? \"light\" : \"dark\")}",
            },
            {
              type: "add",
              newNumber: 12,
              content: "    >",
            },
            {
              type: "add",
              newNumber: 13,
              content: "      <SunMoonIcon theme={theme} />",
            },
            {
              type: "add",
              newNumber: 14,
              content: "    </button>",
            },
            {
              type: "add",
              newNumber: 15,
              content: "  );",
            },
          ],
        },
      ],
    },
    {
      path: "src/styles/tokens.css",
      status: "modified",
      additions: 12,
      deletions: 8,
      relatedAcceptanceIds: ["AC-04"],
      hunks: [
        {
          header: "@@ -1,9 +1,20 @@",
          lines: [
            {
              type: "context",
              oldNumber: 1,
              newNumber: 1,
              content: ":root {",
            },
            {
              type: "add",
              newNumber: 2,
              content: "  --settings-surface: #111412;",
            },
            {
              type: "add",
              newNumber: 3,
              content: "  --settings-text-primary: #f0f4f1;",
            },
            {
              type: "add",
              newNumber: 4,
              content: "  --settings-text-muted: #7b847e;",
            },
            {
              type: "context",
              oldNumber: 2,
              newNumber: 5,
              content: "}",
            },
            {
              type: "add",
              newNumber: 6,
              content: "",
            },
            {
              type: "add",
              newNumber: 7,
              content: "[data-theme=\"dark\"] {",
            },
            {
              type: "add",
              newNumber: 8,
              content: "  color-scheme: dark;",
            },
            {
              type: "add",
              newNumber: 9,
              content: "  background: var(--settings-surface);",
            },
            {
              type: "add",
              newNumber: 10,
              content: "  color: var(--settings-text-primary);",
            },
            {
              type: "add",
              newNumber: 11,
              content: "}",
            },
          ],
        },
      ],
    },
    {
      path: "src/pages/SettingsPage.tsx",
      status: "modified",
      additions: 19,
      deletions: 7,
      relatedAcceptanceIds: ["AC-04"],
      hunks: [
        {
          header: "@@ -14,8 +14,20 @@ export function SettingsPage()",
          lines: [
            {
              type: "context",
              oldNumber: 14,
              newNumber: 14,
              content: "  return (",
            },
            {
              type: "context",
              oldNumber: 15,
              newNumber: 15,
              content: "    <section className=\"settings\">",
            },
            {
              type: "context",
              oldNumber: 16,
              newNumber: 16,
              content: "      <h1>外观设置</h1>",
            },
            {
              type: "remove",
              oldNumber: 17,
              content: "      <p>选择你偏好的主题。</p>",
            },
            {
              type: "add",
              newNumber: 17,
              content: "      <p className=\"settings-description\">",
            },
            {
              type: "add",
              newNumber: 18,
              content: "        选择你偏好的主题。该选择会保存在当前浏览器。",
            },
            {
              type: "add",
              newNumber: 19,
              content: "      </p>",
            },
            {
              type: "add",
              newNumber: 20,
              content: "      <ThemeToggle />",
            },
            {
              type: "context",
              oldNumber: 18,
              newNumber: 21,
              content: "    </section>",
            },
            {
              type: "context",
              oldNumber: 19,
              newNumber: 22,
              content: "  );",
            },
          ],
        },
      ],
    },
  ],
};

const afterFixSnapshot: DiffSnapshot = {
  id: "after-fix",
  label: "AFTER-FIX",
  displayName: "修复快照",
  commit: "demo·8e2b03",
  createdAt: "2026-10-27 07:43",
  summary:
    "仅修改 tokens.css 中的次要文字颜色。受影响的 AC-04 需要重新验证，其他证据沿用上一快照。",
  changedPaths: ["src/styles/tokens.css"],
  files: [
    {
      path: "src/styles/tokens.css",
      status: "modified",
      additions: 2,
      deletions: 1,
      relatedAcceptanceIds: ["AC-04"],
      hunks: [
        {
          header: "@@ -1,8 +1,9 @@",
          lines: [
            {
              type: "context",
              oldNumber: 1,
              newNumber: 1,
              content: ":root {",
            },
            {
              type: "context",
              oldNumber: 2,
              newNumber: 2,
              content: "  --settings-surface: #111412;",
            },
            {
              type: "context",
              oldNumber: 3,
              newNumber: 3,
              content: "  --settings-text-primary: #f0f4f1;",
            },
            {
              type: "remove",
              oldNumber: 4,
              content: "  --settings-text-muted: #7b847e;",
            },
            {
              type: "add",
              newNumber: 4,
              content: "  /* 提升次要文字与设置页背景的对比度 */",
            },
            {
              type: "add",
              newNumber: 5,
              content: "  --settings-text-muted: #aeb8b1;",
            },
            {
              type: "context",
              oldNumber: 5,
              newNumber: 6,
              content: "}",
            },
          ],
        },
      ],
    },
  ],
};

const initialAcceptanceItems: AcceptanceItem[] = [
  {
    id: "AC-01",
    title: "切换后应用暗色主题",
    criterion:
      "点击主题切换按钮后，当前页面应立即进入暗色主题，正文与主要控件保持可读。",
    status: "passed",
    source: "human",
    codeLinks: [
      {
        filePath: "src/components/ThemeToggle.tsx",
        lineStart: 6,
        lineEnd: 15,
        symbol: "ThemeToggle",
      },
      {
        filePath: "src/theme/ThemeProvider.tsx",
        lineStart: 9,
        lineEnd: 14,
        symbol: "useEffect(applyTheme)",
      },
    ],
    evidenceIds: ["SHOT-01"],
    confirmation: {
      state: "confirmed",
      confirmedAt: "2026-10-27T07:41:24+08:00",
      confirmedBy: "交付负责人",
    },
  },
  {
    id: "AC-02",
    title: "刷新后保持用户选择",
    criterion:
      "用户选择暗色主题后刷新页面，主题应从本地偏好恢复，且在首屏绘制后保持暗色。",
    status: "passed",
    source: "human",
    codeLinks: [
      {
        filePath: "src/theme/ThemeProvider.tsx",
        lineStart: 9,
        lineEnd: 14,
        symbol: "readStoredTheme / localStorage",
      },
    ],
    evidenceIds: ["LOG-008"],
    confirmation: {
      state: "confirmed",
      confirmedAt: "2026-10-27T07:41:36+08:00",
      confirmedBy: "交付负责人",
    },
  },
  {
    id: "AC-03",
    title: "支持键盘操作与可见焦点",
    criterion:
      "主题切换按钮可通过 Tab 聚焦，Enter 与 Space 均可触发，焦点轮廓清晰可见。",
    status: "passed",
    source: "human",
    codeLinks: [
      {
        filePath: "src/components/ThemeToggle.tsx",
        lineStart: 6,
        lineEnd: 15,
        symbol: "ThemeToggle / focus-visible",
      },
    ],
    evidenceIds: ["LOG-011"],
    confirmation: {
      state: "confirmed",
      confirmedAt: "2026-10-27T07:41:48+08:00",
      confirmedBy: "交付负责人",
    },
  },
  {
    id: "AC-04",
    title: "设置页文字对比度达标",
    criterion:
      "设置页次要文字与背景的对比度不低于 4.5:1，以满足 WCAG AA 正文可读性要求。",
    status: "failed",
    source: "human",
    codeLinks: [
      {
        filePath: "src/styles/tokens.css",
        lineStart: 4,
        lineEnd: 4,
        symbol: "--settings-text-muted",
      },
      {
        filePath: "src/pages/SettingsPage.tsx",
        lineStart: 17,
        lineEnd: 19,
        symbol: "settings-description",
      },
    ],
    evidenceIds: ["LOG-014", "SHOT-03"],
    confirmation: { state: "pending" },
  },
  {
    id: "AC-05",
    title: "系统主题变化时行为符合设定",
    criterion:
      "在用户尚未手动选择主题时，系统主题变化应更新页面；用户手动选择后，不被系统偏好覆盖。",
    status: "unverified",
    source: "ai-suggestion",
    codeLinks: [
      {
        filePath: "src/theme/ThemeProvider.tsx",
        lineStart: 9,
        lineEnd: 14,
        symbol: "matchMedia(prefers-color-scheme)",
      },
    ],
    evidenceIds: [],
    confirmation: { state: "pending" },
  },
];

const initialEvidence: Evidence[] = [
  {
    id: "SHOT-01",
    kind: "browser-screenshot",
    title: "暗色主题切换后的主页",
    description:
      "桌面视口 1440×900。切换后页面背景、卡片和控件进入暗色主题，未发现浅色残留。",
    runId: "RUN-001",
    snapshotId: "before-fix",
    acceptanceIds: ["AC-01"],
    capturedAt: "2026-10-27 07:39:38",
    scopePaths: ["src/components/ThemeToggle.tsx"],
    imageSrc: "/demo/theme-toggle.svg",
    isDemo: true,
  },
  {
    id: "LOG-008",
    kind: "test-log",
    title: "主题偏好持久化检查",
    description:
      "刷新页面后从本地偏好恢复主题。日志只记录演示回放产生的预置结果，没有执行真实浏览器命令。",
    runId: "RUN-001",
    snapshotId: "before-fix",
    acceptanceIds: ["AC-02"],
    capturedAt: "2026-10-27 07:40:18",
    scopePaths: ["src/theme/ThemeProvider.tsx"],
    content: [
      "DEMO REPLAY / persistence",
      "open http://localhost:5173/settings",
      'localStorage.setItem("theme", "dark")',
      "page.reload()",
      'html[data-theme] = "dark"',
      "RESULT: passed",
    ].join("\n"),
    isDemo: true,
  },
  {
    id: "LOG-011",
    kind: "test-log",
    title: "键盘操作与焦点检查",
    description:
      "Tab 聚焦主题按钮后使用 Enter 与 Space 切换主题，焦点轮廓在两种主题下均保持可见。",
    runId: "RUN-001",
    snapshotId: "before-fix",
    acceptanceIds: ["AC-03"],
    capturedAt: "2026-10-27 07:40:56",
    scopePaths: ["src/components/ThemeToggle.tsx"],
    content: [
      "DEMO REPLAY / keyboard",
      "press(Tab) → theme-toggle focused",
      "press(Enter) → theme=dark",
      "press(Space) → theme=light",
      ":focus-visible outline detected",
      "RESULT: passed",
    ].join("\n"),
    isDemo: true,
  },
  {
    id: "LOG-014",
    kind: "test-log",
    title: "设置页对比度检查",
    description:
      "次要文字 #7b847e 与设置页背景 #111412 的对比度实测为 3.8:1，低于 4.5:1 门槛。",
    runId: "RUN-001",
    snapshotId: "before-fix",
    acceptanceIds: ["AC-04"],
    capturedAt: "2026-10-27 07:42:10",
    scopePaths: ["src/styles/tokens.css"],
    content: [
      "DEMO REPLAY / contrast",
      "open http://localhost:5173/settings",
      "selector: .settings-description",
      "foreground: #7b847e",
      "background: #111412",
      "contrast ratio: 3.8:1",
      "required: >= 4.5:1",
      "RESULT: failed",
    ].join("\n"),
    isDemo: true,
  },
  {
    id: "SHOT-03",
    kind: "browser-screenshot",
    title: "设置页低对比度证据",
    description:
      "AC-04 失败时的设置页截图。次要说明文字与背景过于接近，形成交付阻塞项。",
    runId: "RUN-001",
    snapshotId: "before-fix",
    acceptanceIds: ["AC-04"],
    capturedAt: "2026-10-27 07:42:14",
    scopePaths: ["src/styles/tokens.css"],
    imageSrc: "/demo/contrast-before.svg",
    isDemo: true,
  },
];

const initialRunLogs = [
  {
    id: "log-001-01",
    at: "07:39:12",
    tone: "info" as const,
    text: "DEMO REPLAY / baseline checks / RUN-001",
  },
  {
    id: "log-001-02",
    at: "07:39:16",
    tone: "command" as const,
    text: "load fixture: storefront-web / before-fix",
  },
  {
    id: "log-001-03",
    at: "07:39:38",
    tone: "pass" as const,
    text: "AC-01 · dark theme applied · SHOT-01 captured",
  },
  {
    id: "log-001-04",
    at: "07:40:18",
    tone: "pass" as const,
    text: "AC-02 · stored theme restored after reload · LOG-008",
  },
  {
    id: "log-001-05",
    at: "07:40:56",
    tone: "pass" as const,
    text: "AC-03 · keyboard toggle and focus-visible passed · LOG-011",
  },
  {
    id: "log-001-06",
    at: "07:42:10",
    tone: "fail" as const,
    text: "AC-04 · contrast 3.8:1 < 4.5:1 · LOG-014 captured",
  },
  {
    id: "log-001-07",
    at: "07:42:16",
    tone: "info" as const,
    text: "RUN-001 completed · 1 blocking finding · report is draft",
  },
];

export function createInitialDemoState(): WorkspaceState {
  return {
    mode: "demo",
    project: {
      name: "storefront-web",
      path: "demo://storefront-web",
      branch: "demo",
      baseRef: "demo",
      headCommit: "a41c7f",
      packageManager: "npm",
    },
    requirement,
    snapshots: {
      "before-fix": beforeFixSnapshot,
      "after-fix": afterFixSnapshot,
    },
    activeSnapshotId: "before-fix",
    acceptanceItems: initialAcceptanceItems,
    evidence: initialEvidence,
    runs: [
      {
        id: "RUN-001",
        snapshotId: "before-fix",
        label: "基线检查",
        status: "completed",
        startedAt: "2026-10-27T07:39:12+08:00",
        finishedAt: "2026-10-27T07:42:16+08:00",
        acceptanceIds: ["AC-01", "AC-02", "AC-03", "AC-04"],
        outcomes: {
          "AC-01": "passed",
          "AC-02": "passed",
          "AC-03": "passed",
          "AC-04": "failed",
        },
        logs: initialRunLogs,
        visibleLogCount: initialRunLogs.length,
        evidenceToAdd: [],
        caption: "初版实现验收。3 项通过，对比度检查阻塞交付。",
      },
    ],
    suggestions: [
      {
        id: "SUG-01",
        title: "覆盖系统主题变化",
        criterion:
          "系统偏好变化时更新尚未手动选择主题的页面，并保留用户手动选择。",
        rationale:
          "需求中的“主要界面可读”并不等于只覆盖手动切换，系统偏好同样会改变呈现结果。",
        state: "adopted",
        targetAcceptanceId: "AC-05",
      },
      {
        id: "SUG-02",
        title: "减少动态效果时仍可切换",
        criterion:
          "在 prefers-reduced-motion: reduce 下切换主题，不依赖颜色过渡完成反馈。",
        rationale: "现有检查没有覆盖无障碍动态效果偏好，建议转为可验证条件。",
        state: "pending",
      },
    ],
    selectedAcceptanceId: "AC-04",
    nextRunNumber: 2,
    nextLogNumber: 15,
    nextShotNumber: 4,
  };
}
