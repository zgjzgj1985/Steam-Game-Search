import { test, expect } from "@playwright/test";

test.describe("首页功能测试", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("首页加载正常，无控制台错误", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });
    await page.waitForLoadState("networkidle");
    expect(errors).toHaveLength(0);
  });

  test("搜索区块显示正常", async ({ page }) => {
    await expect(page.getByText("搜索回合制游戏")).toBeVisible();
    await expect(page.getByPlaceholder("搜索 Steam 游戏...")).toBeVisible();
  });

  test("底部信息显示正常", async ({ page }) => {
    await expect(page.getByText(/数据来源/)).toBeVisible();
  });
});
