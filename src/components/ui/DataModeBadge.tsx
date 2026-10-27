import type { WorkspaceMode } from "../../types/workspace";
import { DemoLabel } from "./DemoLabel";
import "./DataModeBadge.css";

interface DataModeBadgeProps {
  mode: WorkspaceMode;
  tone?: "quiet" | "line";
}

export function DataModeBadge({ mode, tone = "line" }: DataModeBadgeProps) {
  if (mode === "demo") {
    return <DemoLabel label="演示数据" tone={tone} />;
  }

  return (
    <span className={`local-mode-badge local-mode-badge--${tone}`}>
      <span aria-hidden="true" className="local-mode-badge__dot" />
      本地真实数据
    </span>
  );
}
