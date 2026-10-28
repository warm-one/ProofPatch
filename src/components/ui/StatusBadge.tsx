import { CircleCheck, CircleDashed, TriangleAlert } from "lucide-react";
import "./StatusBadge.css";

/** 验收状态只有三种；不引入"通过但告警"这类模糊态。 */
export type AcceptanceStatus = "passed" | "failed" | "unverified";

const statusMeta: Record<
  AcceptanceStatus,
  { label: string; Icon: typeof CircleCheck }
> = {
  passed: { label: "通过", Icon: CircleCheck },
  failed: { label: "失败", Icon: TriangleAlert },
  unverified: { label: "未验证", Icon: CircleDashed },
};

interface StatusBadgeProps {
  status: AcceptanceStatus;
  compact?: boolean;
}

/**
 * 状态色只作为辅助；图标与文字保证状态不依赖颜色也能理解。
 */
export function StatusBadge({ status, compact = false }: StatusBadgeProps) {
  const { label, Icon } = statusMeta[status];

  return (
    <span
      className={`status-badge status-badge--${status}${compact ? " status-badge--compact" : ""}`}
    >
      <Icon aria-hidden="true" size={compact ? 13 : 14} strokeWidth={1.8} />
      <span>{label}</span>
    </span>
  );
}
