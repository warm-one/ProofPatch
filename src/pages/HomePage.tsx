import { HeroEvidenceChain } from "../components/marketing/HeroEvidenceChain";
import {
  ClosingSection,
  ProblemSection,
  ReportPreviewSection,
  ResponsibilitySection,
  WorkflowSection,
} from "../components/marketing/MarketingSections";

/**
 * 产品官网：首屏负责辨识度，后续 section 解释问题、流程、责任与交付物。
 */
export default function HomePage() {
  return (
    <>
      <HeroEvidenceChain />
      <ProblemSection />
      <WorkflowSection />
      <ResponsibilitySection />
      <ReportPreviewSection />
      <ClosingSection />
    </>
  );
}
