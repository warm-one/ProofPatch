import "./DemoLabel.css";

interface DemoLabelProps {
  label?: string;
  tone?: "quiet" | "line";
}

export function DemoLabel({
  label = "演示数据",
  tone = "quiet",
}: DemoLabelProps) {
  return (
    <span className={`demo-label demo-label--${tone}`}>
      <span aria-hidden="true" className="demo-label__dot" />
      {label}
    </span>
  );
}
