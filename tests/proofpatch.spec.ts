import { expect, test } from "@playwright/test";

test.describe("ProofPatch public experience", () => {
  test("explains the evidence chain and enters the demo", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /AI 写得快/,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /AC-04 设置页文字对比度达标/ }),
    ).toBeVisible();

    await page.getByRole("link", { name: "打开交互演示" }).click();
    await expect(page).toHaveURL(/\/workspace\/acceptance$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "验收矩阵" }),
    ).toBeVisible();
    await expect(page.getByText("2 项未决 · 不可交付")).toBeVisible();
  });

  test("runs the full failed-to-verified delivery path", async ({ page }) => {
    await page.goto("/workspace/acceptance");

    await page
      .getByRole("button", { name: /载入修复后演示快照/ })
      .click();
    await page
      .getByRole("button", { name: /运行本项演示检查/ })
      .click();
    await page
      .getByRole("button", { name: /确认验收并签署/ })
      .click({ timeout: 8_000 });
    await expect(page.getByText("证据链已闭合")).toBeVisible();

    await page.getByRole("button", { name: /查看 AC-05/ }).click();
    await page
      .getByRole("button", { name: /运行本项演示检查/ })
      .click();
    await page
      .getByRole("button", { name: /确认验收并签署/ })
      .click({ timeout: 8_000 });

    await page
      .locator(".workspace-sidebar__link")
      .filter({ hasText: "验收报告" })
      .click();
    await expect(page).toHaveURL(/\/workspace\/report$/);
    await expect(
      page.getByText("所有验收项已人工确认，可以交付"),
    ).toBeVisible();
    await expect(page.locator(".report-document__stamp")).toContainText(
      "VERIFIED",
    );
  });

  test("keeps key workspace views usable on a 390px screen", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/workspace/evidence");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    await page.getByRole("button", { name: "打开导航" }).click();
    await page
      .locator(".workspace-sidebar__link")
      .filter({ hasText: "检查运行" })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "检查运行" }),
    ).toBeVisible();
  });

  test("requires explicit adoption before an AI suggestion enters the matrix", async ({
    page,
  }) => {
    await page.goto("/workspace/requirements");

    await page.getByRole("button", { name: /AI 建议/ }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await expect(
      drawer.getByText("AI 只负责提出可能遗漏的验收边界"),
    ).toBeVisible();

    await drawer
      .getByRole("button", { name: /采纳并加入验收矩阵/ })
      .click();
    await expect(
      drawer.getByText(/已在矩阵中查看 AC-06/),
    ).toBeVisible();

    await page.keyboard.press("Escape");
    await page
      .locator(".workspace-sidebar__link")
      .filter({ hasText: "验收矩阵" })
      .click();
    await expect(
      page.getByRole("button", { name: /查看 AC-06/ }),
    ).toBeVisible();
  });
});
