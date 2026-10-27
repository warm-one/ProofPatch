import { CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { useEffect } from "react";
import { useWorkspace } from "../../state/WorkspaceContext";
import "./ToastRegion.css";

const toastIcons = {
  success: CircleCheck,
  info: Info,
  warning: TriangleAlert,
};

export function ToastRegion() {
  const { state, dismissToast } = useWorkspace();
  const toast = state.toast;

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(dismissToast, 4600);
    return () => window.clearTimeout(timeout);
  }, [dismissToast, toast]);

  const Icon = toast ? toastIcons[toast.tone] : Info;

  return (
    <div
      aria-live="polite"
      className="toast-region"
      role="status"
    >
      {toast && (
        <div className={`toast toast--${toast.tone}`} key={toast.id}>
          <Icon aria-hidden="true" size={16} strokeWidth={1.7} />
          <p>{toast.message}</p>
          <button
            aria-label="关闭提示"
            className="toast__close"
            onClick={dismissToast}
            type="button"
          >
            <X aria-hidden="true" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
