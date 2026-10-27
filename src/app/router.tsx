import { Navigate, Route, Routes } from "react-router-dom";
import { MarketingLayout } from "../components/marketing/MarketingLayout";
import { WorkspaceLayout } from "../components/workspace/WorkspaceLayout";
import HomePage from "../pages/HomePage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { PlaceholderPage } from "../pages/PlaceholderPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<MarketingLayout />}>
        <Route index element={<HomePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route path="workspace" element={<WorkspaceLayout />}>
        <Route index element={<Navigate replace to="acceptance" />} />
        <Route
          path="requirements"
          element={
            <PlaceholderPage
              description="读需求、看变更，并把每一条验收范围落到具体代码。"
              index="01"
              label="Requirements & diff"
              title="需求与变更"
            />
          }
        />
        <Route
          path="acceptance"
          element={
            <PlaceholderPage
              description="将需求拆成可核验的条件，逐项查看证据与人工确认状态。"
              index="02"
              label="Acceptance matrix"
              title="验收矩阵"
            />
          }
        />
        <Route
          path="runs"
          element={
            <PlaceholderPage
              description="回放预置测试记录，检查运行事实、日志与证据归属。"
              index="03"
              label="Verification runs"
              title="检查运行"
            />
          }
        />
        <Route
          path="evidence"
          element={
            <PlaceholderPage
              description="浏览截图与日志附件，核对它们对应的运行和代码快照。"
              index="04"
              label="Evidence index"
              title="证据索引"
            />
          }
        />
        <Route
          path="report"
          element={
            <PlaceholderPage
              description="把当前证据装订成可打印、可复核的交付报告。"
              index="05"
              label="Delivery report"
              title="验收报告"
            />
          }
        />
      </Route>
    </Routes>
  );
}
