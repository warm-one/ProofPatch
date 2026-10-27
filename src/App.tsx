import { useLayoutEffect } from "react";
import { BrowserRouter, useLocation } from "react-router-dom";
import { AppRoutes } from "./app/router";
import { WorkspaceProvider } from "./state/WorkspaceContext";

function ScrollToTop() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    const previous = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, 0);
    document.documentElement.style.scrollBehavior = previous;
  }, [pathname]);

  return null;
}

export default function App() {
  return (
    <BrowserRouter
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
    >
      <WorkspaceProvider>
        <ScrollToTop />
        <AppRoutes />
      </WorkspaceProvider>
    </BrowserRouter>
  );
}
