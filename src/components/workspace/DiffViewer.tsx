import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  GitBranch,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { DiffSnapshot } from "../../types/workspace";
import { useWorkspace } from "../../state/WorkspaceContext";
import { DataModeBadge } from "../ui/DataModeBadge";
import { getSnapshotTotals } from "../../state/selectors";
import "./DiffViewer.css";

interface DiffViewerProps {
  snapshot: DiffSnapshot;
}

export function DiffViewer({ snapshot }: DiffViewerProps) {
  const { state } = useWorkspace();
  const isLive = state.mode === "live";
  const [expandedPath, setExpandedPath] = useState(
    snapshot.files[0]?.path ?? "",
  );
  const totals = getSnapshotTotals(snapshot);

  useEffect(() => {
    setExpandedPath(snapshot.files[0]?.path ?? "");
  }, [snapshot.id, snapshot.files]);

  return (
    <section
      className="diff-viewer panel"
      aria-label={
        isLive ? "本地 Git 工作区差异" : "当前演示快照的预置代码差异"
      }
    >
      <header className="diff-viewer__header">
        <div>
          <span className="mono">CODE DIFF / SNAPSHOT</span>
          <strong>{snapshot.displayName}</strong>
        </div>
        <div className="diff-viewer__commit">
          <GitBranch aria-hidden="true" size={13} strokeWidth={1.5} />
          <span className="mono">{snapshot.commit}</span>
        </div>
      </header>

      <div className="diff-viewer__summary">
        <span className="mono">{snapshot.files.length} FILES</span>
        <span className="diff-viewer__add mono">+{totals.additions}</span>
        <span className="diff-viewer__remove mono">−{totals.deletions}</span>
        <span className="diff-viewer__created mono">{snapshot.createdAt}</span>
      </div>

      <div className="diff-viewer__files">
        {snapshot.files.length === 0 && (
          <div className="diff-viewer__empty">
            <span className="mono">NO TRACKED CHANGES</span>
            <p>
              {isLive
                ? "基线至今没有可读取的工作区差异。代码或未跟踪文件变化后，刷新快照再运行检查。"
                : "当前演示快照没有可展示的文件差异。"}
            </p>
          </div>
        )}
        {snapshot.files.map((file) => {
          const isExpanded = expandedPath === file.path;
          return (
            <button
              aria-controls={`diff-${snapshot.id}-${file.path}`}
              aria-expanded={isExpanded}
              className={`diff-file${isExpanded ? " is-expanded" : ""}`}
              key={file.path}
              onClick={() =>
                setExpandedPath((current) =>
                  current === file.path ? "" : file.path,
                )
              }
              type="button"
            >
              <span className="diff-file__chevron" aria-hidden="true">
                {isExpanded ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
              </span>
              <span className="diff-file__status mono">
                {file.status === "added"
                  ? "A"
                  : file.status === "deleted"
                    ? "D"
                    : "M"}
              </span>
              <FileCode2
                aria-hidden="true"
                className="diff-file__icon"
                size={14}
                strokeWidth={1.5}
              />
              <span className="diff-file__path mono">{file.path}</span>
              <span className="diff-file__counts mono">
                <span>+{file.additions}</span>
                <span>−{file.deletions}</span>
              </span>
            </button>
          );
        })}
      </div>

      {snapshot.files.map((file) => {
        if (file.path !== expandedPath) return null;
        return (
          <div
            className="diff-code"
            id={`diff-${snapshot.id}-${file.path}`}
            key={`code-${file.path}`}
          >
            <div className="diff-code__meta">
              <span className="mono">{file.path}</span>
              <span className="diff-code__links">
                {file.relatedAcceptanceIds.map((id) => (
                  <span className="mono" key={id}>
                    {id}
                  </span>
                ))}
              </span>
            </div>
            {file.hunks.map((hunk) => (
              <div className="diff-code__hunk" key={hunk.header}>
                <div className="diff-code__hunk-header mono">
                  {hunk.header}
                </div>
                {hunk.lines.map((line, index) => (
                  <div
                    className={`diff-line diff-line--${line.type}`}
                    key={`${line.type}-${line.oldNumber ?? "x"}-${line.newNumber ?? "x"}-${index}`}
                  >
                    <span className="diff-line__number mono">
                      {line.oldNumber ?? ""}
                    </span>
                    <span className="diff-line__number mono">
                      {line.newNumber ?? ""}
                    </span>
                    <span className="diff-line__sign mono" aria-hidden="true">
                      {line.type === "add"
                        ? "+"
                        : line.type === "remove"
                          ? "−"
                          : " "}
                    </span>
                    <code className="mono">{line.content || " "}</code>
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })}

      <footer className="diff-viewer__footer">
        <DataModeBadge mode={state.mode} />
        <span className="mono">
          {isLive
            ? "GIT DIFF / READ ONLY · UNTRACKED INCLUDED"
            : "DIFF VIEW / READ ONLY"}
        </span>
      </footer>
    </section>
  );
}
