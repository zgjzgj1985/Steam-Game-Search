const CATEGORIES = [
  {
    id: "mechanics",
    name: "战斗机制",
    description: "回合系统、技能选择、元素克制、状态效果",
  },
  {
    id: "strategy",
    name: "策略深度",
    description: "站位系统、协同配合、反制手段、重玩性",
  },
  {
    id: "innovation",
    name: "创新亮点",
    description: "特色机制、差异化设计、突破性玩法",
  },
];

export function AnalysisCategories() {
  return (
    <div className="grid gap-4 md:grid-cols-3 md:gap-5">
      {CATEGORIES.map((category) => (
        <div
          key={category.id}
          className="group relative cursor-default rounded border border-[#2a475e]/90 bg-gradient-to-b from-[#1e2a38] to-[#1b2838] px-7 py-8 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-[border-color,box-shadow] duration-200 hover:border-[#66c0f4]/45 hover:shadow-[0_0_24px_rgba(102,192,244,0.06),inset_0_1px_0_rgba(255,255,255,0.05)]"
        >
          <div
            className="pointer-events-none absolute left-0 top-0 h-full w-0.5 rounded-l bg-[#66c0f4] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            aria-hidden
          />
          <h3 className="mb-3 text-lg font-semibold tracking-tight text-[#66c0f4]">
            {category.name}
          </h3>
          <p className="text-sm leading-relaxed text-[#8f98a0]">{category.description}</p>
        </div>
      ))}
    </div>
  );
}