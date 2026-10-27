import "./BrandMark.css";

interface BrandMarkProps {
  compact?: boolean;
  subtitle?: string;
}

/**
 * ProofPatch 标识：两个错位方框与一条闭合线，表达“代码变更与证据对齐”。
 */
export function BrandMark({ compact = false, subtitle }: BrandMarkProps) {
  return (
    <span className="brand" aria-label="ProofPatch">
      <svg
        aria-hidden="true"
        className="brand__mark"
        viewBox="0 0 32 32"
        fill="none"
      >
        <rect x="4" y="4" width="16" height="16" stroke="currentColor" />
        <rect
          x="12"
          y="12"
          width="16"
          height="16"
          stroke="var(--text-primary)"
        />
        <path d="M20 4h8v8" stroke="currentColor" />
      </svg>
      {!compact && (
        <span className="brand__copy">
          <span className="brand__name">ProofPatch</span>
          {subtitle && <span className="brand__subtitle">{subtitle}</span>}
        </span>
      )}
    </span>
  );
}
