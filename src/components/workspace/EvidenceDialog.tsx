import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Image as ImageIcon,
  TerminalSquare,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  formatDemoTimestamp,
  formatEvidenceKind,
  getActiveSnapshot,
  getEvidenceRelation,
  getEvidenceRelationLabel,
} from "../../state/selectors";
import { useWorkspace } from "../../state/WorkspaceContext";
import type { Evidence } from "../../types/workspace";
import { copyText } from "../../utils/clipboard";
import { DemoLabel } from "../ui/DemoLabel";
import "./EvidenceDialog.css";

interface EvidenceDialogProps {
  evidence: Evidence[];
  activeEvidence: Evidence;
  onClose: () => void;
  onSelectRelative: (offset: number) => void;
}

export function EvidenceDialog({
  evidence,
  activeEvidence,
  onClose,
  onSelectRelative,
}: EvidenceDialogProps) {
  const { state, selectAcceptance, notify } = useWorkspace();
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const onSelectRelativeRef = useRef(onSelectRelative);
  const [imageFailed, setImageFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const activeSnapshot = getActiveSnapshot(state);
  const relation = getEvidenceRelation(activeEvidence, activeSnapshot);

  onCloseRef.current = onClose;
  onSelectRelativeRef.current = onSelectRelative;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onSelectRelativeRef.current(-1);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        onSelectRelativeRef.current(1);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  useEffect(() => {
    setImageFailed(false);
    setCopied(false);
  }, [activeEvidence.id]);

  const currentIndex = evidence.findIndex(
    (entry) => entry.id === activeEvidence.id,
  );

  const copyEvidence = async () => {
    const text =
      activeEvidence.kind === "test-log"
        ? activeEvidence.content ?? activeEvidence.description
        : `${activeEvidence.id}\n${activeEvidence.title}\n${activeEvidence.description}\n${activeEvidence.imageSrc ?? ""}`;
    const success = await copyText(
      `PROOFPATCH / ${activeEvidence.id}\n${text}\n\n演示证据，不包含真实执行结果。`,
    );
    setCopied(success);
    notify(
      success
        ? "证据内容已复制。"
        : "剪贴板不可用，请手动选择需要的内容。",
      success ? "success" : "warning",
    );
    if (success) {
      window.setTimeout(() => setCopied(false), 1600);
    }
  };

  const openAcceptance = (acceptanceId: string) => {
    selectAcceptance(acceptanceId);
    onClose();
    navigate("/workspace/acceptance");
  };

  return (
    <div className="evidence-dialog-layer">
      <button
        aria-label="关闭证据详情"
        className="evidence-dialog-backdrop"
        onClick={onClose}
        type="button"
      />
      <div
        aria-labelledby="evidence-dialog-title"
        aria-modal="true"
        className="evidence-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header className="evidence-dialog__header">
          <div>
            <span className="mono">
              {activeEvidence.kind === "browser-screenshot" ? (
                <ImageIcon aria-hidden="true" size={12} />
              ) : (
                <TerminalSquare aria-hidden="true" size={12} />
              )}
              {activeEvidence.id} / {formatEvidenceKind(activeEvidence)}
            </span>
            <h2 id="evidence-dialog-title">{activeEvidence.title}</h2>
          </div>
          <button
            aria-label="关闭证据详情"
            className="pp-icon-button"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </header>

        <div className="evidence-dialog__body">
          <div className="evidence-dialog__visual">
            {activeEvidence.kind === "browser-screenshot" ? (
              activeEvidence.imageSrc && !imageFailed ? (
                <img
                  alt={activeEvidence.title}
                  onError={() => setImageFailed(true)}
                  src={activeEvidence.imageSrc}
                />
              ) : (
                <div className="evidence-dialog__image-fallback">
                  <ImageIcon aria-hidden="true" size={28} strokeWidth={1.3} />
                  <strong>截图预览不可用</strong>
                  <p>证据元信息仍可核对；演示中不会伪造缺失的图片。</p>
                </div>
              )
            ) : (
              <div className="evidence-dialog__log-viewer">
                <div className="evidence-dialog__log-head">
                  <span className="mono">PRE-SCRIPTED OUTPUT</span>
                  <button
                    className="evidence-dialog__copy"
                    onClick={copyEvidence}
                    type="button"
                  >
                    {copied ? (
                      <Check aria-hidden="true" size={12} />
                    ) : (
                      <Copy aria-hidden="true" size={12} />
                    )}
                    {copied ? "已复制" : "复制"}
                  </button>
                </div>
                <pre>{activeEvidence.content}</pre>
              </div>
            )}
            <div className="evidence-dialog__caption">
              <span
                className={`evidence-dialog__relation is-${relation}`}
              >
                {getEvidenceRelationLabel(relation, activeEvidence)}
              </span>
              <p>{activeEvidence.description}</p>
            </div>
          </div>

          <aside className="evidence-dialog__meta">
            <div className="evidence-dialog__meta-top">
              <DemoLabel tone="line" />
              <span
                className={`evidence-dialog__relation is-${relation}`}
              >
                {relation === "current"
                  ? "当前有效"
                  : relation === "carried"
                    ? "沿用有效"
                    : "历史失效"}
              </span>
            </div>

            <dl>
              <div>
                <dt className="mono">EVIDENCE ID</dt>
                <dd className="mono">{activeEvidence.id}</dd>
              </div>
              <div>
                <dt className="mono">CAPTURED</dt>
                <dd className="mono">
                  {formatDemoTimestamp(activeEvidence.capturedAt)}
                </dd>
              </div>
              <div>
                <dt className="mono">RUN</dt>
                <dd className="mono">{activeEvidence.runId}</dd>
              </div>
              <div>
                <dt className="mono">SNAPSHOT</dt>
                <dd className="mono">
                  {activeEvidence.snapshotId === "before-fix"
                    ? "实现快照"
                    : "修复快照"}
                </dd>
              </div>
            </dl>

            <section>
              <span className="mono">ACCEPTANCE</span>
              <div className="evidence-dialog__acceptances">
                {activeEvidence.acceptanceIds.map((acceptanceId) => (
                  <button
                    key={acceptanceId}
                    onClick={() => openAcceptance(acceptanceId)}
                    type="button"
                  >
                    {acceptanceId}
                    <ArrowRight aria-hidden="true" size={10} />
                  </button>
                ))}
              </div>
            </section>

            <section>
              <span className="mono">SCOPE PATHS</span>
              <ul className="evidence-dialog__paths">
                {activeEvidence.scopePaths.map((path) => (
                  <li className="mono" key={path}>
                    {path}
                  </li>
                ))}
              </ul>
            </section>

            <div className="evidence-dialog__meta-actions">
              <button onClick={copyEvidence} type="button">
                <Copy aria-hidden="true" size={12} />
                复制证据摘要
              </button>
              <Link onClick={onClose} to="/workspace/runs">
                查看所属运行
                <ArrowRight aria-hidden="true" size={11} />
              </Link>
            </div>
          </aside>
        </div>

        <footer className="evidence-dialog__footer">
          <button
            disabled={evidence.length <= 1}
            onClick={() => onSelectRelative(-1)}
            type="button"
          >
            <ArrowLeft aria-hidden="true" size={13} />
            上一份
          </button>
          <span className="mono">
            {String(currentIndex + 1).padStart(2, "0")} /{" "}
            {String(evidence.length).padStart(2, "0")}
          </span>
          <button
            disabled={evidence.length <= 1}
            onClick={() => onSelectRelative(1)}
            type="button"
          >
            下一份
            <ArrowRight aria-hidden="true" size={13} />
          </button>
        </footer>
      </div>
    </div>
  );
}
