import { useCallback, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CircleAlert,
  FileJson2,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import type { ProofReceipt, ReceiptTrial, TrialOutcome } from "../types/receipt";
import "./ReceiptPage.css";

/**
 * 回执查看器。
 *
 * 它不做任何执行，也不连接后端：读取一份 receipt.json，把证据摊开，
 * 并在浏览器里用与 CLI 相同的规范化算法重算一次内容哈希。
 * 也就是说，"这份回执有没有被改过"这个判断不依赖任何服务端。
 */

const VERDICT_LABEL: Record<ProofReceipt["verdict"], string> = {
  proven: "PROVEN",
  rejected: "REJECTED",
  inconclusive: "INCONCLUSIVE",
};

const VERDICT_TITLE: Record<ProofReceipt["verdict"], string> = {
  proven: "证明成立",
  rejected: "拒绝",
  inconclusive: "无法判定",
};

const OUTCOME_LABEL: Record<TrialOutcome, string> = {
  pass: "通过",
  fail: "失败",
  error: "错误",
  missing: "未收集到",
  timeout: "超时",
  skipped: "未执行",
};

/** 与 server/verifier/digest.mjs 完全一致的规范化序列化。 */
function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return "null";

  const type = typeof value;
  if (type === "number") {
    if (!Number.isFinite(value as number)) {
      throw new TypeError("规范化序列化不接受非有限数。");
    }
    return JSON.stringify(value);
  }
  if (type === "string" || type === "boolean") return JSON.stringify(value);

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  if (type === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
      .join(",")}}`;
  }

  throw new TypeError(`规范化序列化遇到不支持的类型：${type}`);
}

async function recomputeDigest(receipt: ProofReceipt): Promise<string> {
  const body: Record<string, unknown> = { ...receipt };
  delete body.attestation;
  const bytes = new TextEncoder().encode(canonicalize(body));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hex}`;
}

function summarize(trials: ReceiptTrial[]) {
  const counts: Record<string, number> = {};
  for (const trial of trials) {
    counts[trial.outcome] = (counts[trial.outcome] ?? 0) + 1;
  }
  return { total: trials.length, counts };
}

const OK = "✓";
const BAD = "✗";
const SKIP = "·";

/** 把回执翻译成四步人话，和 CLI 的输出保持同一套语言。 */
function buildSteps(receipt: ProofReceipt) {
  const baseline = summarize(receipt.trials.filter((t) => t.phase === "baseline"));
  const candidate = summarize(receipt.trials.filter((t) => t.phase === "candidate"));
  const code = receipt.reason.code;
  const blockedEarly =
    code === "ORACLE_TAMPERED" || code === "CONTROL_PLANE_TAMPERED";
  const steps: Array<{ mark: string; tone: string; label: string; detail: string }> = [];

  if (blockedEarly || baseline.total === 0) {
    steps.push({
      mark: SKIP,
      tone: "muted",
      label: "基线复现",
      detail: "未执行：补丁在执行前已被拒绝",
    });
  } else if (code.startsWith("BASELINE_")) {
    steps.push({
      mark: BAD,
      tone: "bad",
      label: "基线复现",
      detail: `${baseline.counts.fail ?? 0}/${baseline.total} 失败，契约不成立`,
    });
  } else {
    steps.push({
      mark: OK,
      tone: "good",
      label: "基线复现",
      detail: `${baseline.counts.fail ?? 0}/${baseline.total} 稳定失败`,
    });
  }

  if (blockedEarly) {
    steps.push({
      mark: BAD,
      tone: "bad",
      label: "应用补丁",
      detail:
        code === "ORACLE_TAMPERED"
          ? "补丁修改了验收测试文件，已拒绝"
          : "补丁修改了测试控制面配置，已拒绝",
    });
  } else if (code === "PATCH_APPLY_FAILED") {
    steps.push({
      mark: BAD,
      tone: "bad",
      label: "应用补丁",
      detail: "补丁无法干净应用到基线",
    });
  } else {
    steps.push({
      mark: OK,
      tone: "good",
      label: "应用补丁",
      detail: `独立副本 ${receipt.subject.patchedTree.slice(0, 22)}…`,
    });
  }

  if (blockedEarly || candidate.total === 0) {
    steps.push({ mark: SKIP, tone: "muted", label: "候选验证", detail: "未执行" });
  } else if ((candidate.counts.pass ?? 0) === candidate.total) {
    steps.push({
      mark: OK,
      tone: "good",
      label: "候选验证",
      detail: `${candidate.total}/${candidate.total} 稳定通过`,
    });
  } else if ((candidate.counts.pass ?? 0) > 0) {
    steps.push({
      mark: BAD,
      tone: "bad",
      label: "候选验证",
      detail: `${candidate.counts.pass}/${candidate.total} 通过，结果不稳定`,
    });
  } else {
    steps.push({
      mark: BAD,
      tone: "bad",
      label: "候选验证",
      detail: "目标测试未通过",
    });
  }

  const regression = receipt.regression;
  if (regression.status === "clean") {
    steps.push({
      mark: OK,
      tone: "good",
      label: "回归检查",
      detail: `${regression.scope.join("、") || "范围内"} 无新增失败`,
    });
  } else if (regression.status === "new-failures") {
    steps.push({
      mark: BAD,
      tone: "bad",
      label: "回归检查",
      detail: `新增 ${regression.newFailures.length} 个失败`,
    });
  } else if (regression.status === "pre-existing-errors") {
    steps.push({
      mark: "⚠",
      tone: "warn",
      label: "回归检查",
      detail: `无新增失败；基线已有 ${regression.preExistingErrors?.length ?? 0} 项执行错误未变化`,
    });
  } else if (regression.status === "error") {
    steps.push({
      mark: "?",
      tone: "warn",
      label: "回归检查",
      detail: "范围内测试无法正常执行",
    });
  } else {
    steps.push({ mark: SKIP, tone: "muted", label: "回归检查", detail: "未配置回归范围" });
  }

  return steps;
}

export default function ReceiptPage() {
  const [receipt, setReceipt] = useState<ProofReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hashState, setHashState] = useState<"idle" | "checking" | "ok" | "mismatch">(
    "idle",
  );
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const acceptText = useCallback(async (text: string) => {
    setError(null);
    setHashState("checking");
    try {
      const parsed = JSON.parse(text) as ProofReceipt;
      if (!parsed?.schema?.startsWith("proofpatch.receipt/")) {
        throw new Error("这不是一份 ProofPatch 回执（schema 不匹配）。");
      }
      setReceipt(parsed);
      const fresh = await recomputeDigest(parsed);
      setHashState(fresh === parsed.attestation?.digest ? "ok" : "mismatch");
    } catch (cause) {
      setReceipt(null);
      setHashState("idle");
      setError(cause instanceof Error ? cause.message : "无法读取这份文件。");
    }
  }, []);

  const onFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      await acceptText(await file.text());
    },
    [acceptText],
  );

  const loadSample = useCallback(async () => {
    try {
      const response = await fetch("/demo/sample-receipt.json");
      if (!response.ok) throw new Error("示例回执读取失败。");
      await acceptText(await response.text());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "示例回执读取失败。");
    }
  }, [acceptText]);

  const steps = useMemo(() => (receipt ? buildSteps(receipt) : []), [receipt]);

  return (
    <div className="receipt-page" id="receipt-main">
      <header className="receipt-page__head">
        <span className="eyebrow">Delivery receipt</span>
        <h1>验收回执查看器</h1>
        <p>
          读取一份 <span className="mono">receipt.json</span>，看它到底证明了什么、
          没证明什么。哈希在你自己的浏览器里重算，不依赖任何服务端。
        </p>

        <div className="receipt-page__actions">
          <button
            className="pp-button pp-button--primary"
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            <Upload aria-hidden="true" size={15} />
            选择回执文件
          </button>
          <button className="pp-button pp-button--secondary" onClick={loadSample} type="button">
            <FileJson2 aria-hidden="true" size={15} />
            加载示例回执
          </button>
          <input
            ref={inputRef}
            accept=".json,application/json"
            hidden
            onChange={(event) => {
              void onFile(event.target.files?.[0]);
              event.target.value = "";
            }}
            type="file"
          />
        </div>

        <div
          className={`receipt-page__dropzone${dragging ? " is-dragging" : ""}`}
          onDragLeave={() => setDragging(false)}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void onFile(event.dataTransfer.files?.[0]);
          }}
        >
          也可以把 receipt.json 直接拖到这里
        </div>
      </header>

      {error && (
        <div className="receipt-alert is-bad" role="alert">
          <CircleAlert aria-hidden="true" size={16} />
          <span>{error}</span>
        </div>
      )}

      {receipt && (
        <>
          <section className={`receipt-verdict is-${receipt.verdict}`}>
            <div className="receipt-verdict__main">
              <span className="receipt-verdict__code mono">
                {VERDICT_LABEL[receipt.verdict]}
              </span>
              <strong>{VERDICT_TITLE[receipt.verdict]}</strong>
              <p>{receipt.reason.message}</p>
              {receipt.reason.detail && (
                <p className="receipt-verdict__detail">{receipt.reason.detail}</p>
              )}
            </div>
            <dl className="receipt-verdict__meta">
              <div>
                <dt className="mono">RECEIPT</dt>
                <dd className="mono">{receipt.receiptId}</dd>
              </div>
              <div>
                <dt className="mono">CREATED</dt>
                <dd className="mono">{receipt.createdAt}</dd>
              </div>
              <div>
                <dt className="mono">BASE COMMIT</dt>
                <dd className="mono">{receipt.subject.baseCommit.slice(0, 12)}</dd>
              </div>
              <div>
                <dt className="mono">REASON</dt>
                <dd className="mono">{receipt.reason.code}</dd>
              </div>
            </dl>
          </section>

          <section className="receipt-panel">
            <h2>四步验证</h2>
            <ol className="receipt-steps">
              {steps.map((step) => (
                <li className={`receipt-step is-${step.tone}`} key={step.label}>
                  <span className="receipt-step__mark">{step.mark}</span>
                  <span className="receipt-step__label">{step.label}</span>
                  <span className="receipt-step__detail mono">{step.detail}</span>
                </li>
              ))}
            </ol>
          </section>

          <div className="receipt-grid">
            <section className="receipt-panel">
              <h2>验收契约</h2>
              <dl className="receipt-kv">
                <div>
                  <dt>契约说明</dt>
                  <dd>{receipt.oracle.statement}</dd>
                </div>
                <div>
                  <dt>强度</dt>
                  <dd className="mono">
                    {receipt.oracle.targets.map((t) => t.strength).join(" / ")}
                    {receipt.oracle.inferred ? " · 自动推导" : ""}
                  </dd>
                </div>
                <div>
                  <dt>目标测试</dt>
                  <dd className="mono">{receipt.oracle.targets.map((t) => t.testId).join("、")}</dd>
                </div>
                <div>
                  <dt>受保护路径</dt>
                  <dd className="mono">{receipt.oracle.protectedPaths.join("、")}</dd>
                </div>
                <div>
                  <dt>契约摘要</dt>
                  <dd className="mono">{receipt.oracle.digest.slice(0, 26)}…</dd>
                </div>
              </dl>
            </section>

            <section className="receipt-panel">
              <h2>执行环境</h2>
              <dl className="receipt-kv">
                <div>
                  <dt>Python</dt>
                  <dd className="mono">
                    {receipt.environment.python.version} · {receipt.environment.pytest}
                  </dd>
                </div>
                <div>
                  <dt>平台</dt>
                  <dd className="mono">{receipt.environment.platform}</dd>
                </div>
                <div>
                  <dt>隔离</dt>
                  <dd>
                    <span className="mono">{receipt.environment.isolation.level}</span>
                    {" · "}
                    {receipt.environment.isolation.backend}
                  </dd>
                </div>
                <div>
                  <dt>依赖清单</dt>
                  <dd className="mono">
                    {receipt.environment.dependencies?.files?.join("、") || "未声明"}
                  </dd>
                </div>
                <div>
                  <dt>环境指纹</dt>
                  <dd className="mono">{receipt.environment.fingerprint.slice(0, 26)}…</dd>
                </div>
              </dl>
            </section>
          </div>

          <section className="receipt-panel">
            <h2>执行记录</h2>
            <table className="receipt-trials">
              <thead>
                <tr>
                  <th scope="col">阶段</th>
                  <th scope="col">第几次</th>
                  <th scope="col">结果</th>
                  <th scope="col">退出码</th>
                  <th scope="col">耗时</th>
                  <th scope="col">摘要</th>
                </tr>
              </thead>
              <tbody>
                {receipt.trials.map((trial, index) => (
                  <tr className={`is-${trial.outcome}`} key={`${trial.phase}-${trial.repeat}-${index}`}>
                    <td>{trial.phase === "baseline" ? "基线" : "候选"}</td>
                    <td className="mono">{trial.repeat || "—"}</td>
                    <td>
                      <span className={`receipt-outcome is-${trial.outcome}`}>
                        {OUTCOME_LABEL[trial.outcome]}
                      </span>
                    </td>
                    <td className="mono">{trial.exitCode ?? "—"}</td>
                    <td className="mono">{trial.durationMs}ms</td>
                    <td className="receipt-trials__summary">{trial.summaryLine || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="receipt-panel">
            <h2>回归检查</h2>
            <p className="receipt-regression__head">
              范围：{receipt.regression.scope.join("、") || "未配置"}
              {" · "}
              状态：<span className="mono">{receipt.regression.status}</span>
            </p>
            {receipt.regression.newFailures.length > 0 && (
              <ul className="receipt-list is-bad">
                {receipt.regression.newFailures.map((node) => (
                  <li key={node}>
                    <X aria-hidden="true" size={13} />
                    <span className="mono">{node}</span>
                  </li>
                ))}
              </ul>
            )}
            {receipt.regression.newFailures.length === 0 && (
              <p className="receipt-regression__clean">
                <Check aria-hidden="true" size={14} /> 没有新增失败
              </p>
            )}
          </section>

          <section className="receipt-panel">
            <h2>
              <AlertTriangle aria-hidden="true" size={15} />
              这次没有证明的部分
            </h2>
            <ul className="receipt-list">
              {receipt.unproven.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className={`receipt-panel receipt-attest is-${hashState}`}>
            <h2>
              <ShieldCheck aria-hidden="true" size={15} />
              内容完整性
            </h2>
            <p>
              {hashState === "checking" && "正在浏览器内重算内容哈希…"}
              {hashState === "ok" &&
                "哈希一致：这份回执的内容与它声明的摘要相同，未被改动。"}
              {hashState === "mismatch" &&
                "哈希不一致：内容被改动过，这份回执不能作为证据使用。"}
            </p>
            <dl className="receipt-kv">
              <div>
                <dt>回执声明</dt>
                <dd className="mono">{receipt.attestation?.digest?.slice(0, 40)}…</dd>
              </div>
              <div>
                <dt>覆盖范围</dt>
                <dd>{receipt.attestation?.covers || "除 attestation 字段外的全部内容"}</dd>
              </div>
              <div>
                <dt>不证明什么</dt>
                <dd>{receipt.attestation?.doesNotProve || "未包含签名身份。"}</dd>
              </div>
            </dl>
          </section>
        </>
      )}

      {!receipt && !error && (
        <div className="receipt-empty">
          <FileJson2 aria-hidden="true" size={34} strokeWidth={1.2} />
          <strong>还没有加载回执</strong>
          <p>
            点“加载示例回执”看一份真实被拒绝的验证记录，或把你自己的{" "}
            <span className="mono">.proofpatch/receipt.json</span> 拖进来。
          </p>
        </div>
      )}
    </div>
  );
}
