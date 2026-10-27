import { Check, Minus, ShieldCheck, Sparkles } from "lucide-react";
import { useWorkspace } from "../../state/WorkspaceContext";
import { getUnresolvedCount } from "../../state/selectors";
import type { DiffSnapshot } from "../../types/workspace";
import "./RequirementDocument.css";

interface RequirementDocumentProps {
  snapshot: DiffSnapshot;
  onOpenSuggestions: () => void;
}

export function RequirementDocument({
  snapshot,
  onOpenSuggestions,
}: RequirementDocumentProps) {
  const { state } = useWorkspace();
  const requirement = state.requirement;
  const unresolved = getUnresolvedCount(state.acceptanceItems);

  return (
    <article className="requirement-document panel">
      <header className="requirement-document__header">
        <div className="mono">
          <span>{requirement.id}</span>
          <span className="requirement-document__rule" />
          <span>ACCEPTANCE CASE</span>
        </div>
        <span className="requirement-document__frozen">
          <ShieldCheck aria-hidden="true" size={13} strokeWidth={1.6} />
          已冻结
        </span>
      </header>

      <div className="requirement-document__body">
        <span className="eyebrow">Requirement</span>
        <h2>{requirement.title}</h2>
        <p className="requirement-document__summary">{requirement.summary}</p>

        <section className="requirement-document__scope">
          <div className="requirement-document__section-label">
            <span className="mono">IN SCOPE</span>
            <span>{requirement.inScope.length} 项</span>
          </div>
          <ul>
            {requirement.inScope.map((item) => (
              <li key={item}>
                <Check aria-hidden="true" size={13} strokeWidth={1.8} />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="requirement-document__scope requirement-document__scope--out">
          <div className="requirement-document__section-label">
            <span className="mono">OUT OF SCOPE</span>
            <span>本轮不验证</span>
          </div>
          <ul>
            {requirement.outOfScope.map((item) => (
              <li key={item}>
                <Minus aria-hidden="true" size={13} strokeWidth={1.8} />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <aside className="requirement-document__suggestion">
          <Sparkles aria-hidden="true" size={16} strokeWidth={1.5} />
          <div>
            <strong>AI 发现了 1 条尚未采纳的边界建议</strong>
            <p>建议只有经人采纳并补充证据后，才会进入验收矩阵。</p>
          </div>
          <button onClick={onOpenSuggestions} type="button">
            查看建议
          </button>
        </aside>
      </div>

      <footer className="requirement-document__footer">
        <dl>
          <div>
            <dt className="mono">SNAPSHOT</dt>
            <dd>{snapshot.displayName}</dd>
          </div>
          <div>
            <dt className="mono">ACCEPTANCE</dt>
            <dd>{state.acceptanceItems.length} 项</dd>
          </div>
          <div>
            <dt className="mono">EVIDENCE</dt>
            <dd>{state.evidence.length} 份</dd>
          </div>
          <div>
            <dt className="mono">UNRESOLVED</dt>
            <dd className={unresolved > 0 ? "is-risk" : undefined}>
              {unresolved} 项
            </dd>
          </div>
        </dl>
        <span className="requirement-document__demo mono">
          预置需求 · 非真实客户文档
        </span>
      </footer>
    </article>
  );
}
