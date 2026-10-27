import { Navigate, Route, Routes } from "react-router-dom";
import { MarketingLayout } from "../components/marketing/MarketingLayout";
import { WorkspaceLayout } from "../components/workspace/WorkspaceLayout";
import HomePage from "../pages/HomePage";
import AcceptancePage from "../pages/AcceptancePage";
import { NotFoundPage } from "../pages/NotFoundPage";
import RequirementsPage from "../pages/RequirementsPage";
import RunsPage from "../pages/RunsPage";
import EvidencePage from "../pages/EvidencePage";
import ReportPage from "../pages/ReportPage";
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
        <Route path="runs" element={<RunsPage />} />
        <Route path="evidence" element={<EvidencePage />} />
        <Route path="report" element={<ReportPage />} />
      </Route>
    </Routes>
  );
}
