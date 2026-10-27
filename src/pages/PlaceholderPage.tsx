import { Layers3 } from "lucide-react";
import { WorkspacePageHeader } from "../components/workspace/WorkspacePageHeader";
import { EmptyState } from "../components/ui/EmptyState";
import "./PlaceholderPage.css";

interface PlaceholderPageProps {
  index: string;
  label: string;
  title: string;
  description: string;
}

/**
 * 阶段占位视图：保留工作台布局与页面节奏，后续由真实功能视图替换。
 */
export function PlaceholderPage({
  index,
  label,
  title,
  description,
}: PlaceholderPageProps) {
  return (
    <section>
      <WorkspacePageHeader
        description={description}
        index={index}
        label={label}
        title={title}
      />
      <div className="placeholder-panel panel">
        <EmptyState
          description="当前阶段已完成工作台外壳与设计系统。下一阶段将在这里装配预置验收数据与完整交互。"
          icon={<Layers3 aria-hidden="true" size={20} strokeWidth={1.5} />}
          title="内容正在装订"
        />
      </div>
    </section>
  );
}
