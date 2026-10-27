import {
  ArrowRight,
  Bot,
  Check,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useWorkspace } from "../../state/WorkspaceContext";
import { DemoLabel } from "../ui/DemoLabel";
import "./SuggestionDrawer.css";

interface SuggestionDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function SuggestionDrawer({ open, onClose }: SuggestionDrawerProps) {
  const { state, isRunning, adoptSuggestion } = useWorkspace();
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab" || !drawerRef.current) return;

      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("aria-hidden"));

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
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="suggestion-layer">
      <button
        aria-label="关闭建议抽屉"
        className="suggestion-layer__backdrop"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-labelledby="suggestion-drawer-title"
        aria-modal="true"
        className="suggestion-drawer"
        ref={drawerRef}
        role="dialog"
      >
        <header className="suggestion-drawer__header">
          <div>
            <span className="mono">AI SUGGESTIONS / DEMO</span>
            <h2 id="suggestion-drawer-title">建议不是事实</h2>
          </div>
          <button
            aria-label="关闭建议抽屉"
            className="pp-icon-button"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </header>

        <div className="suggestion-drawer__intro">
          <Bot aria-hidden="true" size={18} strokeWidth={1.5} />
          <p>
            AI 只负责提出可能遗漏的验收边界。每条建议必须由你采纳、运行检查并人工确认，才可能成为交付结论。
          </p>
        </div>

        <div className="suggestion-drawer__list">
          {state.suggestions.map((suggestion, index) => {
            const adopted = suggestion.state === "adopted";
            return (
              <article
                className={`suggestion-card${adopted ? " is-adopted" : ""}`}
                key={suggestion.id}
              >
                <header>
                  <span className="mono">
                    SUG-{String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="suggestion-card__source">
                    <Sparkles aria-hidden="true" size={11} />
                    AI 建议
                  </span>
                  {adopted && (
                    <span className="suggestion-card__adopted">
                      <Check aria-hidden="true" size={11} />
                      已采纳
                    </span>
                  )}
                </header>
                <h3>{suggestion.title}</h3>
                <p>{suggestion.rationale}</p>
                <div className="suggestion-card__criterion">
                  <span className="mono">验收条件</span>
                  <p>{suggestion.criterion}</p>
                </div>
                <footer>
                  {adopted ? (
                    <Link
                      className="suggestion-card__link"
                      onClick={onClose}
                      to="/workspace/acceptance"
                    >
                      已在矩阵中查看 {suggestion.targetAcceptanceId}
                      <ArrowRight aria-hidden="true" size={13} />
                    </Link>
                  ) : (
                    <button
                      className="pp-button pp-button--secondary"
                      disabled={isRunning}
                      onClick={() => adoptSuggestion(suggestion.id)}
                      type="button"
                    >
                      <Check aria-hidden="true" size={13} />
                      采纳并加入验收矩阵
                    </button>
                  )}
                </footer>
              </article>
            );
          })}
        </div>

        <footer className="suggestion-drawer__footer">
          <div>
            <ShieldAlert aria-hidden="true" size={15} strokeWidth={1.5} />
            <p>
              建议来自前端预置数据，不调用真实模型；AI 无法直接修改状态、证据或人工确认记录。
            </p>
          </div>
          <DemoLabel tone="line" />
        </footer>
      </aside>
    </div>
  );
}
