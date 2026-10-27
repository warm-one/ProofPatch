import { Navigate, Route, Routes } from "react-router-dom";
import { MarketingLayout } from "../components/marketing/MarketingLayout";
import { WorkspaceLayout } from "../components/workspace/WorkspaceLayout";
import HomePage from "../pages/HomePage";
import AcceptancePage from "../pages/AcceptancePage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { PlaceholderPage } from "../pages/PlaceholderPage";
import RequirementsPage from "../pages/RequirementsPage";
import { WorkspaceProvider } from "../state/WorkspaceContext";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<MarketingLayout />}>
        <Route index element={<HomePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route
        path="workspace"
        element={
          <WorkspaceProvider>
            <WorkspaceLayout />
          </WorkspaceProvider>
        }
      >
        <Route index element={<Navigate replace to="acceptance" />} />
        <Route path="requirements" element={<RequirementsPage />} />
        <Route path="acceptance" element={<AcceptancePage />} />
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
