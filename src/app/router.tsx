import { Route, Routes } from "react-router-dom";
import { MarketingLayout } from "../components/marketing/MarketingLayout";
import HomePage from "../pages/HomePage";
import { NotFoundPage } from "../pages/NotFoundPage";
import ReceiptPage from "../pages/ReceiptPage";

/**
 * 只有两类页面：产品介绍，和回执查看器。
 * 执行入口只有一个——CLI。Web 不承担执行职责，因此不需要后端。
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<MarketingLayout />}>
        <Route index element={<HomePage />} />
        <Route path="receipt" element={<ReceiptPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
