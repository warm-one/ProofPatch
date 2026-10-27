import {
  ArrowLeft,
  ArrowRight,
  Check,
  FolderGit2,
  GitBranch,
  ListChecks,
  LoaderCircle,
  Plus,
  RefreshCw,
  Server,
  ShieldAlert,
  TerminalSquare,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  inspectProject,
  listLiveSessions,
} from "../api/localServer";
import { BrandMark } from "../components/ui/BrandMark";
import { useWorkspace } from "../state/WorkspaceContext";
import type {
  RepositoryInspection,
  SessionSummary,
} from "../types/live";
import "./ConnectPage.css";

interface DraftCheck {
  key: string;
  title: string;
  command: string;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "请求失败，请稍后重试。";
}

function pathFromMemory() {
  try {
    return window.localStorage.getItem("proofpatch.lastProject") ?? "";
  } catch {
    return "";
  }
}

export default function ConnectPage() {
  const {
    state,
    serverStatus,
    activeSessionId,
    connectProject,
    openLiveSession,
    disconnectLive,
    refreshServerStatus,
  } = useWorkspace();
  const navigate = useNavigate();
  const nextCheckKey = useRef(1);
  const [projectPath, setProjectPath] = useState(pathFromMemory);
  const [baseRef, setBaseRef] = useState("HEAD");
  const [requirementTitle, setRequirementTitle] = useState("");
  const [requirementSummary, setRequirementSummary] = useState("");
  const [checks, setChecks] = useState<DraftCheck[]>([]);
  const [inspection, setInspection] =
    useState<RepositoryInspection | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentSessions, setRecentSessions] = useState<SessionSummary[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);

  const newCheck = useCallback((title = "", command = ""): DraftCheck => {
    const key = `check-${nextCheckKey.current}`;
    nextCheckKey.current += 1;
    return { key, title, command };
  }, []);

  const loadRecentSessions = useCallback(async () => {
    setRecentLoading(true);
    try {
      const sessions = await listLiveSessions();
      setRecentSessions(sessions);
    } catch {
      setRecentSessions([]);
    } finally {
      setRecentLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshServerStatus();
  }, [refreshServerStatus]);

  useEffect(() => {
    if (serverStatus === "available") void loadRecentSessions();
  }, [loadRecentSessions, serverStatus]);

  useEffect(() => {
    if (state.mode !== "live") return;
    setProjectPath((current) => current || state.project.path);
    setBaseRef((current) => current || state.project.baseRef);
    setRequirementTitle((current) => current || state.requirement.title);
    setRequirementSummary((current) => current || state.requirement.summary);
  }, [
    state.mode,
    state.project.baseRef,
    state.project.path,
    state.requirement.summary,
    state.requirement.title,
  ]);

  const updateCheck = (
    key: string,
    field: "title" | "command",
    value: string,
  ) => {
    setChecks((current) =>
      current.map((check) =>
        check.key === key ? { ...check, [field]: value } : check,
      ),
    );
  };

  const addCheck = (title = "", command = "") => {
    setChecks((current) => [...current, newCheck(title, command)]);
  };

  const addSuggestedCheck = (title: string, command: string) => {
    setChecks((current) => {
      if (current.some((check) => check.command === command)) return current;
      return [...current, newCheck(title, command)];
    });
  };

  const inspect = async () => {
    setError(null);
    if (!projectPath.trim()) {
      setError("请先填写本地 Git 项目的绝对路径。");
      return;
    }

    setInspecting(true);
    try {
      const result = await inspectProject(projectPath.trim(), baseRef.trim() || "HEAD");
      setInspection(result);
      setProjectPath(result.project.path);
      setBaseRef(result.project.baseRef);
      try {
        window.localStorage.setItem(
          "proofpatch.lastProject",
          result.project.path,
        );
      } catch {
        // 内存字段仍可用于本次连接。
      }

      setRequirementTitle(
        (current) => current || `${result.project.name} 交付验收`,
      );
      setRequirementSummary(
        (current) =>
          current ||
          `${result.project.branch} 分支的本地改动需要通过配置检查，并在人工核对终端证据后确认交付。`,
      );

      if (checks.length === 0) {
        const suggestion = result.project.commandSuggestions?.[0];
        if (suggestion) {
          setChecks([
            newCheck(suggestion.title, suggestion.command),
          ]);
        } else {
          setChecks([newCheck("项目检查", "")]);
        }
      }
    } catch (inspectionError) {
      setInspection(null);
      setError(errorText(inspectionError));
    } finally {
      setInspecting(false);
    }
  };

  const connect = async () => {
    setError(null);
    if (!inspection) {
      setError("请先检查并确认本地仓库。");
      return;
    }
    if (!requirementTitle.trim() || !requirementSummary.trim()) {
      setError("请填写需求标题与需求说明。");
      return;
    }
    const validChecks = checks.filter(
      (check) => check.title.trim() && check.command.trim(),
    );
    if (validChecks.length !== checks.length || validChecks.length === 0) {
      setError("每一项检查都需要名称与命令，且至少保留一项。");
      return;
    }
    if (!acknowledged) {
      setError("请勾选“我理解命令将在本地执行”后再继续。");
      return;
    }

    setConnecting(true);
    try {
      await connectProject({
        projectPath: inspection.project.path,
        baseRef: inspection.project.baseRef,
        requirementTitle: requirementTitle.trim(),
        requirementSummary: requirementSummary.trim(),
        checks: validChecks.map((check) => ({
          title: check.title.trim(),
          command: check.command.trim(),
        })),
        acknowledged: true,
      });
      navigate("/workspace/acceptance");
    } catch (connectError) {
      setError(errorText(connectError));
    } finally {
      setConnecting(false);
    }
  };

  const resumeSession = async (sessionId: string) => {
    setError(null);
    try {
      await openLiveSession(sessionId);
      navigate("/workspace/acceptance");
    } catch (openError) {
      setError(errorText(openError));
    }
  };

  const currentLive = state.mode === "live";
  const serverReady = serverStatus === "available";
  const changedFiles = inspection?.snapshot.files ?? [];
  const suggestions = inspection?.project.commandSuggestions ?? [];

  return (
    <div className="connect-shell">
      <a className="skip-link" href="#connect-main">
        跳到主要内容
      </a>
      <header className="connect-header">
        <Link aria-label="ProofPatch 首页" to="/">
          <BrandMark subtitle="Local evidence runtime" />
        </Link>
        <div className="connect-header__actions">
          <span className="connect-header__mode mono">
            <span aria-hidden="true" />
            本地真实模式
          </span>
          <Link to="/">返回官网</Link>
          <Link className="pp-button pp-button--secondary" to="/workspace">
            打开工作台
            <ArrowRight aria-hidden="true" size={14} />
          </Link>
        </div>
      </header>

      <main className="connect-main" id="connect-main">
        <section className="connect-hero">
          <span className="eyebrow">Local runtime / git + real commands</span>
          <h1>
            把本地项目接进来，
            <br />
            跑一次真实验收。
          </h1>
          <p>
            ProofPatch 会读取真实 Git 变更，在你确认的目录里执行检查命令，保存终端输出，并要求人工确认后才生成可交付报告。
          </p>
          <div className="connect-hero__safety">
            <ShieldAlert aria-hidden="true" size={15} strokeWidth={1.5} />
            <span>
              服务只监听本机。命令由你填写，执行前需要显式确认；不会上传源码。
            </span>
          </div>
        </section>

        {currentLive && (
          <section className="connect-live-banner">
            <div>
              <span className="mono">ACTIVE LIVE WORKSPACE</span>
              <strong>
                {state.project.name} · {state.requirement.title}
              </strong>
              <p>
                当前连接的是真实本地会话。重新连接会创建一份新会话，不会覆盖当前记录。
              </p>
            </div>
            <div>
              <button
                className="pp-button pp-button--secondary"
                onClick={() => navigate("/workspace/acceptance")}
                type="button"
              >
                继续工作
                <ArrowRight aria-hidden="true" size={14} />
              </button>
              <button
                className="pp-button pp-button--ghost"
                onClick={() => {
                  disconnectLive();
                  navigate("/workspace/acceptance");
                }}
                type="button"
              >
                断开并切回演示
              </button>
            </div>
          </section>
        )}

        {serverStatus !== "available" && (
          <section className="connect-server-warning" aria-live="polite">
            <Server aria-hidden="true" size={20} strokeWidth={1.5} />
            <div>
              <strong>
                {serverStatus === "checking"
                  ? "正在检查本地服务…"
                  : "本地服务尚未连接"}
              </strong>
              <p>
                {serverStatus === "checking"
                  ? "正在确认本机 Git 与命令执行能力。"
                  : "真实模式需要一个本机 Node 服务。请在 ProofPatch 目录运行下面的命令，然后用它打印出的地址打开页面。"}
              </p>
              {serverStatus === "unavailable" && (
                <code className="mono">npm run app</code>
              )}
            </div>
            <button
              className="pp-button pp-button--secondary"
              disabled={serverStatus === "checking"}
              onClick={() => void refreshServerStatus()}
              type="button"
            >
              <RefreshCw aria-hidden="true" size={13} />
              重新检查
            </button>
          </section>
        )}

        {error && (
          <div className="connect-error" role="alert">
            <ShieldAlert aria-hidden="true" size={15} />
            <p>{error}</p>
          </div>
        )}

        <div className="connect-layout">
          <div className="connect-form">
            <section className="connect-step panel">
              <header>
                <span className="mono">01 / REPOSITORY</span>
                <FolderGit2 aria-hidden="true" size={17} strokeWidth={1.5} />
              </header>
              <div className="connect-step__body">
                <h2>选择本地 Git 项目</h2>
                <p>
                  填入绝对路径。ProofPatch
                  本身只读取仓库状态与 diff；后续命令是否修改文件，取决于你配置的命令。
                </p>

                <label className="connect-field">
                  <span>项目目录</span>
                  <input
                    disabled={!serverReady || inspecting}
                    onChange={(event) => setProjectPath(event.target.value)}
                    placeholder="D:\projects\my-app"
                    spellCheck={false}
                    type="text"
                    value={projectPath}
                  />
                </label>

                <div className="connect-inline-fields">
                  <label className="connect-field">
                    <span>比较基线</span>
                    <input
                      disabled={!serverReady || inspecting}
                      onChange={(event) => setBaseRef(event.target.value)}
                      placeholder="HEAD"
                      spellCheck={false}
                      type="text"
                      value={baseRef}
                    />
                    <small>读取该提交到当前工作区之间的差异。</small>
                  </label>
                  <button
                    className="pp-button pp-button--primary connect-inspect"
                    disabled={!serverReady || inspecting || !projectPath.trim()}
                    onClick={() => void inspect()}
                    type="button"
                  >
                    {inspecting ? (
                      <LoaderCircle
                        aria-hidden="true"
                        className="is-spinning"
                        size={15}
                      />
                    ) : (
                      <GitBranch aria-hidden="true" size={15} />
                    )}
                    {inspecting ? "读取仓库…" : "检查仓库"}
                  </button>
                </div>

                {inspection && (
                  <div className="connect-repository">
                    <div className="connect-repository__title">
                      <div>
                        <strong>{inspection.project.name}</strong>
                        <span className="mono">
                          {inspection.project.branch} /{" "}
                          {inspection.project.headCommit}
                        </span>
                      </div>
                      <span className="connect-repository__count">
                        {inspection.changedFileCount} 个文件变更
                      </span>
                    </div>
                    <p className="mono connect-repository__path">
                      {inspection.project.path}
                    </p>
                    {changedFiles.length > 0 ? (
                      <div className="connect-repository__files">
                        {changedFiles.slice(0, 5).map((file) => (
                          <div key={file.path}>
                            <span className="mono">
                              {file.status === "added"
                                ? "A"
                                : file.status === "deleted"
                                  ? "D"
                                  : "M"}
                            </span>
                            <span className="mono">{file.path}</span>
                            <span className="mono">
                              +{file.additions} −{file.deletions}
                            </span>
                          </div>
                        ))}
                        {changedFiles.length > 5 && (
                          <span className="connect-repository__more mono">
                            另有 {changedFiles.length - 5} 个文件
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="connect-repository__empty">
                        基线至今没有已跟踪文件差异。仍可创建验收，但“需求与变更”页会是空的。
                      </p>
                    )}
                    {inspection.truncated && (
                      <p className="connect-repository__empty">
                        差异过大，展示内容已截断；报告仍以当前工作区指纹判断证据有效性。
                      </p>
                    )}
                  </div>
                )}
              </div>
            </section>

            <section className="connect-step panel">
              <header>
                <span className="mono">02 / REQUIREMENT</span>
                <ListChecks aria-hidden="true" size={17} strokeWidth={1.5} />
              </header>
              <div className="connect-step__body">
                <h2>定义本次交付要证明什么</h2>
                <p>需求标题与检查项会进入验收矩阵和最终报告。</p>
                <label className="connect-field">
                  <span>需求标题</span>
                  <input
                    onChange={(event) =>
                      setRequirementTitle(event.target.value)
                    }
                    placeholder="例如：设置页外观改造"
                    type="text"
                    value={requirementTitle}
                  />
                </label>
                <label className="connect-field">
                  <span>需求说明</span>
                  <textarea
                    onChange={(event) =>
                      setRequirementSummary(event.target.value)
                    }
                    placeholder="说明本次改动需要满足的交付条件。"
                    rows={4}
                    value={requirementSummary}
                  />
                </label>
              </div>
            </section>

            <section className="connect-step panel">
              <header>
                <span className="mono">03 / CHECKS</span>
                <TerminalSquare aria-hidden="true" size={17} strokeWidth={1.5} />
              </header>
              <div className="connect-step__body">
                <h2>配置真实检查命令</h2>
                <p>
                  每条命令都在项目根目录执行，必须能自行结束；退出码 0
                  视为通过。失败、超时或中止会记录为事实，不会自动变成通过。
                </p>

                {suggestions.length > 0 && (
                  <div className="connect-suggestions">
                    <span className="mono">检测到的脚本</span>
                    <div>
                      {suggestions.map((suggestion) => {
                        const added = checks.some(
                          (check) => check.command === suggestion.command,
                        );
                        return (
                          <button
                            disabled={added}
                            key={`${suggestion.title}-${suggestion.command}`}
                            onClick={() =>
                              addSuggestedCheck(
                                suggestion.title,
                                suggestion.command,
                              )
                            }
                            type="button"
                          >
                            <Plus aria-hidden="true" size={11} />
                            <span>{suggestion.command}</span>
                            {added && <Check aria-hidden="true" size={11} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="connect-checks">
                  {checks.length === 0 && (
                    <p className="connect-checks__empty">
                      先检查仓库，ProofPatch 会从 package.json
                      提取可添加的脚本；也可以直接添加自定义命令。
                    </p>
                  )}
                  {checks.map((check, index) => (
                    <div className="connect-check-row" key={check.key}>
                      <span className="connect-check-row__index mono">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <label className="connect-field">
                          <span>检查名称</span>
                          <input
                            onChange={(event) =>
                              updateCheck(
                                check.key,
                                "title",
                                event.target.value,
                              )
                            }
                            placeholder="例如：项目构建"
                            type="text"
                            value={check.title}
                          />
                        </label>
                        <label className="connect-field">
                          <span>命令</span>
                          <input
                            onChange={(event) =>
                              updateCheck(
                                check.key,
                                "command",
                                event.target.value,
                              )
                            }
                            placeholder="npm run build"
                            spellCheck={false}
                            type="text"
                            value={check.command}
                          />
                        </label>
                      </div>
                      <button
                        aria-label={`移除第 ${index + 1} 项检查`}
                        className="connect-check-row__remove"
                        onClick={() =>
                          setChecks((current) =>
                            current.filter((item) => item.key !== check.key),
                          )
                        }
                        type="button"
                      >
                        <X aria-hidden="true" size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  className="connect-add-check"
                  onClick={() => addCheck("自定义检查", "")}
                  type="button"
                >
                  <Plus aria-hidden="true" size={13} />
                  添加检查项
                </button>

                <label className="connect-acknowledge">
                  <input
                    checked={acknowledged}
                    onChange={(event) =>
                      setAcknowledged(event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>
                    我理解这些命令会在{" "}
                    <strong>{inspection?.project.path ?? "所选项目目录"}</strong>{" "}
                    中由本机 shell 执行，并可能修改文件或访问网络。
                  </span>
                </label>

                <button
                  className="pp-button pp-button--primary connect-submit"
                  disabled={
                    !serverReady ||
                    !inspection ||
                    connecting ||
                    !acknowledged
                  }
                  onClick={() => void connect()}
                  type="button"
                >
                  {connecting ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="is-spinning"
                      size={16}
                    />
                  ) : (
                    <TerminalSquare aria-hidden="true" size={16} />
                  )}
                  {connecting ? "正在创建本地会话…" : "创建真实验收工作区"}
                  <ArrowRight aria-hidden="true" size={15} />
                </button>
              </div>
            </section>
          </div>

          <aside className="connect-aside">
            <section className="connect-aside__block">
              <span className="mono">LOCAL BY DEFAULT</span>
              <h2>数据留在本机</h2>
              <ul>
                <li>会话与命令日志保存在用户目录下的 <code>.proofpatch</code>。</li>
                <li>服务只监听 <code>127.0.0.1</code>，没有云数据库和账号体系。</li>
                <li>不调用 AI，不把仓库源文件上传到第三方。</li>
              </ul>
            </section>

            <section className="connect-aside__block">
              <span className="mono">RECENT SESSIONS</span>
              <h2>最近的真实会话</h2>
              {recentLoading && <p className="connect-aside__muted">正在读取…</p>}
              {!recentLoading && recentSessions.length === 0 && (
                <p className="connect-aside__muted">
                  还没有真实会话。连接项目后会出现在这里。
                </p>
              )}
              {!recentLoading && recentSessions.length > 0 && (
                <div className="connect-recent">
                  {recentSessions.slice(0, 4).map((session) => (
                    <button
                      className={
                        session.id === activeSessionId ? "is-current" : undefined
                      }
                      key={session.id}
                      onClick={() => void resumeSession(session.id)}
                      type="button"
                    >
                      <span className="mono">{session.projectName}</span>
                      <strong>{session.requirementTitle}</strong>
                      <span className="mono">
                        {session.checkCount} 项 ·{" "}
                        {new Date(session.updatedAt).toLocaleDateString("zh-CN")}
                      </span>
                      <ArrowRight aria-hidden="true" size={12} />
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="connect-aside__block connect-aside__limits">
              <span className="mono">CURRENT LIMITS</span>
              <h2>这一版能做什么</h2>
              <ul>
                <li>支持本机 Git 工作区与单行检查命令。</li>
                <li>需要人工确认，自动通过不等于可交付。</li>
                <li>浏览器截图、AI 建议和 CI 集成暂未接入真实数据。</li>
              </ul>
            </section>

            <Link className="connect-aside__back" to="/">
              <ArrowLeft aria-hidden="true" size={13} />
              返回产品首页
            </Link>
          </aside>
        </div>
      </main>

      <footer className="connect-footer">
        <span className="mono">PROOFPATCH / LOCAL RUNTIME</span>
        <span>真实 Git · 真实命令 · 人工签字</span>
      </footer>
    </div>
  );
}
