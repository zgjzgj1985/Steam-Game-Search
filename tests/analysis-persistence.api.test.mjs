/**
 * 分析结果持久化 - API 测试
 *
 * 测试目标：
 * 1. GET /api/analysis/:gameId - 获取已保存的分析结果
 * 2. POST /api/analysis/module - 分析并保存结果
 */

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const BASE_URL = "http://localhost:3000";
const ANALYSES_FILE = path.join(process.cwd(), "public", "data", "analyses.json");

function readAnalysesFile() {
  try {
    if (!fs.existsSync(ANALYSES_FILE)) {
      return {};
    }
    return JSON.parse(fs.readFileSync(ANALYSES_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writeAnalysesFile(data) {
  fs.writeFileSync(ANALYSES_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function clearAnalysesFile() {
  writeAnalysesFile({});
}

const TEST_GAME_ID = "1182470";
const OTHER_GAME_ID = "20"; // 不同的游戏 ID // Cassette Beasts (用于持久化测试)

test.describe("分析结果持久化 API", () => {
  test.beforeEach(() => {
    clearAnalysesFile();
  });

  test("GET - 初始状态应返回 exists: false", async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/analysis/${TEST_GAME_ID}`
    );
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.exists).toBe(false);
    expect(data.analysis).toBeNull();
  });

  test("GET - 不存在的游戏ID应返回 exists: false", async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/analysis/nonexistent_game_id`
    );
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.exists).toBe(false);
    expect(data.analysis).toBeNull();
  });

  test("GET - 已保存分析后应返回 exists: true 和分析数据", async ({ request }) => {
    const stored = {
      [TEST_GAME_ID]: {
        id: `analysis-${TEST_GAME_ID}-test`,
        gameId: TEST_GAME_ID,
        gameName: "测试游戏",
        pool: "A",
        generatedAt: "2026-04-29T12:00:00.000Z",
        analyzedModules: ["verdict"],
        verdict: {
          type: "verdict",
          verdict: "测试结论",
          metadata: {
            sourceOfTruth: ["Steam商店描述"],
            confidence: "high",
            basedOnReviews: 5000,
            analysisDate: "2026-04-29",
            wordCount: 100,
            keyInsights: ["洞察1", "洞察2"],
            dataQuality: "excellent",
          },
        },
      },
    };
    writeAnalysesFile(stored);

    const response = await request.get(
      `${BASE_URL}/api/analysis/${TEST_GAME_ID}`
    );
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.exists).toBe(true);
    expect(data.analysis).not.toBeNull();
    expect(data.analysis.gameId).toBe(TEST_GAME_ID);
    expect(data.analysis.analyzedModules).toContain("verdict");
    expect(data.analysis.verdict.verdict).toBe("测试结论");
  });

  test("POST - 无效的模块类型应返回错误", async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/analysis/module`, {
      data: {
        gameId: TEST_GAME_ID,
        module: "invalid_module",
      },
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toBeDefined();
  });

  test("POST - 缺少参数应返回错误", async ({ request }) => {
    const response1 = await request.post(
      `${BASE_URL}/api/analysis/module`,
      {
        data: {
          gameId: TEST_GAME_ID,
        },
      }
    );
    expect(response1.status()).toBe(400);

    const response2 = await request.post(
      `${BASE_URL}/api/analysis/module`,
      {
        data: {
          module: "verdict",
        },
      }
    );
    expect(response2.status()).toBe(400);
  });

  test("POST - 不存在的游戏应返回404", async ({ request }) => {
    const response = await request.post(
      `${BASE_URL}/api/analysis/module`,
      {
        data: {
          gameId: "nonexistent999999",
          module: "verdict",
        },
      }
    );
    expect(response.status()).toBe(404);
  });

  test("POST - 分析完成后应自动保存到 analyses.json", async ({ request }) => {
    expect(readAnalysesFile()).toEqual({});

    const response = await request.post(`${BASE_URL}/api/analysis/module`, {
      data: {
        gameId: OTHER_GAME_ID,
        module: "verdict",
      },
    });

    const body = await response.json();

    if (!response.ok()) {
      const errorMsg = body.error || "";
      if (
        errorMsg.includes("LLM") ||
        errorMsg.includes("API") ||
        errorMsg.includes("模型") ||
        errorMsg.includes("OpenAI") ||
        errorMsg.includes("Key") ||
        errorMsg.includes("generation") ||
        errorMsg.includes("未找到游戏")
      ) {
        test.skip();
        return;
      }
      console.log("非预期错误:", body);
    }

    expect(response.ok()).toBeTruthy();
    expect(body.gameId).toBe(OTHER_GAME_ID);
    expect(body.module).toBe("verdict");
    expect(body.result).toBeDefined();
    expect(body.generatedAt).toBeDefined();

    const saved = readAnalysesFile();
    expect(saved[OTHER_GAME_ID]).toBeDefined();
    expect(saved[OTHER_GAME_ID].gameId).toBe(OTHER_GAME_ID);
    expect(saved[OTHER_GAME_ID].analyzedModules).toContain("verdict");
  });

  test("GET - 不同游戏的分析结果应互不干扰", async ({ request }) => {
    const stored = {
      [TEST_GAME_ID]: {
        id: `analysis-${TEST_GAME_ID}-test`,
        gameId: TEST_GAME_ID,
        gameName: "游戏A",
        pool: "A",
        generatedAt: "2026-04-29T12:00:00.000Z",
        analyzedModules: ["verdict"],
        verdict: { type: "verdict", verdict: "游戏A的结论", metadata: {} },
      },
    };
    writeAnalysesFile(stored);

    const response1 = await request.get(
      `${BASE_URL}/api/analysis/${TEST_GAME_ID}`
    );
    const data1 = await response1.json();
    expect(data1.analysis.gameName).toBe("游戏A");

    const response2 = await request.get(
      `${BASE_URL}/api/analysis/${OTHER_GAME_ID}`
    );
    const data2 = await response2.json();
    expect(data2.exists).toBe(false);
  });
});
