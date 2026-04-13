"use client";

import { useEffect, useRef } from "react";
import mermaid from "mermaid";

interface BattleFlowProps {
  type: "divinity" | "bg3" | "xcom" | "persona" | "default";
  className?: string;
}

export function BattleFlowChart({ type, className }: BattleFlowProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: "neutral",
      flowchart: {
        curve: "basis",
        padding: 20,
      },
    });

    const renderDiagram = async () => {
      if (containerRef.current) {
        const id = `mermaid-${Date.now()}`;
        const { svg } = await mermaid.render(id, getFlowchart(type));
        containerRef.current.innerHTML = svg;
      }
    };

    renderDiagram();
  }, [type]);

  return (
    <div className={className}>
      <div ref={containerRef} className="flex justify-center" />
    </div>
  );
}

function getFlowchart(type: BattleFlowProps["type"]): string {
  switch (type) {
    case "divinity":
      return `
        flowchart TD
          A[开始战斗] --> B{检定回合顺序}
          B -->|速度属性| C[角色1行动]
          C --> D[选择行动]
          D --> E{物理/魔法?}
          E -->|物理| F[物理护甲计算]
          E -->|魔法| G[魔法抗性计算]
          F --> H[应用伤害]
          G --> H
          H --> I{元素交互?}
          I -->|是| J[触发组合效果]
          I -->|否| K[应用状态效果]
          J --> L[结算]
          K --> L
          L --> M{回合结束?}
          M -->|否| C
          M -->|是| N[下一角色]
          N -->|还有角色| C
          N -->|全部结束| O[回合结束]
          O --> B
      `;

    case "bg3":
      return `
        flowchart TD
          A[战斗开始] --> B[投骰检定先攻]
          B --> C[决定行动顺序]
          C --> D[当前角色行动]
          D --> E[移动/动作/附赠动作]
          E --> F{攻击检定?}
          F -->|命中| G[伤害骰]
          F -->|未命中| H[攻击失败]
          G --> I{暴击检定?}
          I -->|是| J[双倍伤害骰]
          I -->|否| K[正常伤害]
          J --> L[应用效果]
          K --> L
          H --> M[回合结束]
          L --> M
          M --> N{还有角色?}
          N -->|是| D
          N -->|否| O[战斗轮结束]
          O --> B
      `;

    case "xcom":
      return `
        flowchart TD
          A[任务开始] --> B[部署士兵]
          B --> C[回合开始]
          C --> D[外星人行动阶段]
          D --> E{触发警报?}
          E -->|是| F[增援]
          E -->|否| G[继续]
          F --> G
          G --> H[玩家行动阶段]
          H --> I{消耗行动点数?}
          I -->|是| J[移动/攻击]
          I -->|使用| K[技能/物品]
          J --> L{还有AP?}
          L -->|是| J
          L -->|否| M[回合结束]
          K --> L
          M --> C
      `;

    case "persona":
      return `
        flowchart TD
          A[战斗开始] --> B[显示敌人]
          B --> C[回合开始]
          C --> D{玩家行动}
          D --> E[攻击/技能/物品/撤退]
          E --> F{攻击弱点?}
          F -->|是| G[1 More]
          F -->|否| H{击倒敌人?}
          G --> I[额外行动]
          I --> D
          H -->|是| J[全体突击]
          H -->|否| K[正常伤害结算]
          J --> L[恐惧敌人]
          K --> L
          L --> M{回合结束?}
          M -->|是| N[敌人行动]
          N --> O[敌人回合]
          O --> C
      `;

    default:
      return `
        flowchart TD
          A[战斗开始] --> B[回合开始]
          B --> C[选择角色]
          C --> D[选择行动]
          D --> E[选择目标]
          E --> F[执行行动]
          F --> G{触发效果?}
          G -->|是| H[应用效果]
          G -->|否| I[跳过]
          H --> I
          I --> J{回合结束?}
          J -->|否| C
          J -->|是| K[下一回合]
          K --> B
      `;
  }
}