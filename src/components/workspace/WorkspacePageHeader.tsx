import type { ReactNode } from "react";
import "./WorkspacePageHeader.css";

interface WorkspacePageHeaderProps {
  index: string;
  label: string;
  title: string;
  description: string;
  actions?: ReactNode;
}

export function WorkspacePageHeader({
  index,
  label,
  title,
  description,
  actions,
}: WorkspacePageHeaderProps) {
  return (
    <header className="workspace-page-header">
      <div className="workspace-page-header__copy">
        <div className="workspace-page-header__eyebrow">
          <span className="mono">{index}</span>
          <span className="workspace-page-header__rule" />
          <span className="eyebrow">{label}</span>
        </div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && (
        <div className="workspace-page-header__actions">{actions}</div>
      )}
    </header>
  );
}
