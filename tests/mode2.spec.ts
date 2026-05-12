import { test, expect } from "@playwright/test";

test.describe("模式2页面功能测试", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/mode2");
  });

  test("模式2页面加载正常，无控制台错误", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });
    await page.waitForLoadState("networkidle");
    expect(errors).toHaveLength(0);
  });

  test("页面核心元素存在", async ({ page }) => {
    await expect(page.getByText("三池筛选系统说明")).toBeVisible();
    await expect(page.getByRole("heading", { name: "A池 - 神作参考池" })).toBeVisible();
  });
});
