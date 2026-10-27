import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./app/router";

export default function App() {
  return (
    <BrowserRouter
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
    >
      <AppRoutes />
    </BrowserRouter>
  );
}
