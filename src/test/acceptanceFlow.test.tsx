import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { WorkspaceLayout } from "../components/workspace/WorkspaceLayout";
import AcceptancePage from "../pages/AcceptancePage";
import RequirementsPage from "../pages/RequirementsPage";
import { WorkspaceProvider } from "../state/WorkspaceContext";

function renderWorkspace() {
  return render(
    <MemoryRouter
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      initialEntries={["/workspace/acceptance"]}
    >
      <Routes>
        <Route
          path="/workspace"
          element={
            <WorkspaceProvider>
              <WorkspaceLayout />
            </WorkspaceProvider>
          }
        >
          <Route path="acceptance" element={<AcceptancePage />} />
          <Route path="requirements" element={<RequirementsPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("acceptance workflow", () => {
  it(
    "replays the fixed snapshot and requires a human signature",
    async () => {
      const user = userEvent.setup();
      renderWorkspace();

      expect(
        screen.getByText("2 项未决 · 不可交付"),
      ).toBeInTheDocument();

      await user.click(
        screen.getByRole("button", { name: /载入修复后演示快照/ }),
      );

      const runButton = await screen.findByRole("button", {
        name: /运行本项演示检查/,
      });
      expect(screen.getAllByText(/历史证据 · 已被当前补丁影响/).length).toBeGreaterThan(0);

      await user.click(runButton);

      const confirmButton = await screen.findByRole(
        "button",
        { name: /确认验收并签署/ },
        { timeout: 5000 },
      );
      expect(confirmButton).toBeEnabled();

      await user.click(confirmButton);
      expect(await screen.findByText("证据链已闭合")).toBeInTheDocument();
      expect(screen.getByText(/由 交付负责人 于/)).toBeInTheDocument();
    },
    10_000,
  );
});
