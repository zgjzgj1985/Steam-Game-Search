/**
 * 获取游戏已保存的分析结果
 * GET /api/analysis/:gameId
 */

import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import { GameAnalysis } from "@/types/game";

const ANALYSES_FILE = path.join(process.cwd(), "public", "data", "analyses.json");

interface AnalysesStore {
  [gameId: string]: GameAnalysis;
}

function loadAnalyses(): AnalysesStore {
  try {
    if (!fs.existsSync(ANALYSES_FILE)) {
      return {};
    }
    const raw = fs.readFileSync(ANALYSES_FILE, "utf-8");
    return JSON.parse(raw) as AnalysesStore;
  } catch {
    return {};
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { gameId: string } }
) {
  try {
    const { gameId } = params;

    if (!gameId) {
      return NextResponse.json(
        { error: "缺少 gameId 参数" },
        { status: 400 }
      );
    }

    const store = loadAnalyses();
    const analysis = store[gameId];

    if (!analysis) {
      return NextResponse.json(
        { exists: false, analysis: null },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { exists: true, analysis },
      {
        headers: {
          "Cache-Control": "public, max-age=300, stale-while-revalidate=3600"
        }
      }
    );
  } catch (error) {
    console.error("获取分析结果失败:", error);
    return NextResponse.json(
      { error: "获取分析结果失败" },
      { status: 500 }
    );
  }
}
