import { cn } from "@/lib/utils";

/**
 * 分析页面加载骨架屏
 * 在 LLM 生成分析结果时展示，给用户即时的视觉反馈
 */
export default function Loading() {
  return (
    <div className="min-h-screen bg-[#0f1923]">
      {/* 返回按钮骨架 */}
      <div className="container mx-auto px-4 py-4">
        <div className="h-10 w-28 rounded-lg bg-[#1b2838]/50 animate-pulse" />
      </div>

      {/* Hero 区域骨架 */}
      <div className="relative h-[400px] bg-[#1b2838]">
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f1923] via-[#0f1923]/60 to-transparent" />
        <div className="absolute left-10 bottom-10">
          <div className="w-36 h-52 rounded-lg bg-[#2a475e]/50 animate-pulse" />
        </div>
        <div className="absolute left-[200px] bottom-10 right-10 space-y-4">
          <div className="h-10 w-64 rounded-lg bg-[#2a475e]/50 animate-pulse" />
          <div className="flex gap-2">
            <div className="h-6 w-16 rounded-full bg-[#2a475e]/50 animate-pulse" />
            <div className="h-6 w-20 rounded-full bg-[#2a475e]/50 animate-pulse" />
          </div>
        </div>
      </div>

      {/* 数据指标条骨架 */}
      <div className="bg-[#0f1923] border-t border-[#2a475e]/50">
        <div className="container mx-auto px-6 py-4">
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 rounded-lg bg-[#1b2838]/50 animate-pulse" />
            ))}
          </div>
        </div>
      </div>

      {/* 内容区域骨架 */}
      <div className="bg-[#0f1923]">
        <div className="container mx-auto px-6 py-10 max-w-4xl space-y-6">
          {/* 结论卡片骨架 */}
          <div className="h-32 rounded-xl bg-[#1b2838]/50 animate-pulse" />

          {/* 分析文本骨架 */}
          <div className="space-y-3">
            <div className="h-4 w-full rounded bg-[#1b2838]/50 animate-pulse" />
            <div className="h-4 w-5/6 rounded bg-[#1b2838]/50 animate-pulse" />
            <div className="h-4 w-4/6 rounded bg-[#1b2838]/50 animate-pulse" />
          </div>
        </div>
      </div>

      {/* 评分区域骨架 */}
      <div className="bg-[#0f1923] border-t border-[#2a475e]/50">
        <div className="container mx-auto px-6 py-8">
          <div className="grid lg:grid-cols-5 gap-8 items-center">
            <div className="lg:col-span-2 flex items-center gap-6">
              <div className="w-40 h-40 rounded-full bg-[#1b2838]/50 animate-pulse" />
              <div className="space-y-2">
                <div className="h-8 w-20 rounded bg-[#2a475e]/50 animate-pulse" />
                <div className="h-4 w-24 rounded bg-[#2a475e]/50 animate-pulse" />
              </div>
            </div>
            <div className="lg:col-span-3 grid grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-24 rounded-xl bg-[#1b2838]/50 animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 加载提示 */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2">
        <div className="flex items-center gap-3 px-6 py-3 rounded-full bg-[#1b2838]/90 border border-[#66c0f4]/30 backdrop-blur-sm">
          <div className="w-5 h-5 border-2 border-[#66c0f4]/30 border-t-[#66c0f4] rounded-full animate-spin" />
          <span className="text-sm text-white/80">正在生成游戏分析...</span>
        </div>
      </div>
    </div>
  );
}
