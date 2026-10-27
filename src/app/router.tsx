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
import ConnectPage from "../pages/ConnectPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<MarketingLayout />}>
        <Route index element={<HomePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route path="connect" element={<ConnectPage />} />

      <Route path="workspace" element={<WorkspaceLayout />}>
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
