"use client";

import {
  Radar,
  RadarChart as RechartsRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";

interface Metric {
  name: string;
  value: number;
}

interface RadarChartProps {
  data: Metric[];
  className?: string;
}

/**
 * 战斗系统评分雷达图组件
 */
export function RadarChart({ data, className }: RadarChartProps) {
  const chartData = data.map((item) => ({
    subject: item.name,
    score: item.value,
    fullMark: 100,
  }));

  return (
    <div className={cn("w-full h-72", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsRadarChart data={chartData} cx="50%" cy="50%" outerRadius="75%">
          {/* 极坐标网格 */}
          <PolarGrid
            stroke="#2a475e"
            strokeDasharray="3 3"
          />

          {/* 角度轴 - 显示标签 */}
          <PolarAngleAxis
            dataKey="subject"
            tick={{
              fill: "#8f98a0",
              fontSize: 13,
              fontWeight: 500,
            }}
          />

          {/* 半径轴 - 显示刻度 */}
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{
              fill: "#5c6c7a",
              fontSize: 10,
            }}
            tickCount={5}
            stroke="#2a475e"
          />

          <Radar
            name="战斗系统评分"
            dataKey="score"
            stroke="#66c0f4"
            strokeWidth={2}
            fill="#66c0f4"
            fillOpacity={0.25}
            dot={{
              r: 4,
              fill: "#66c0f4",
              stroke: "#0f1923",
              strokeWidth: 2,
            }}
          />
        </RechartsRadarChart>
      </ResponsiveContainer>
    </div>
  );
}
