"use client";

import type { AnalysisNarrative } from "@/types/game";
import { AlertTriangle, ListOrdered, Quote } from "lucide-react";
import { cn } from "@/lib/utils";

interface AnalysisNarrativeBlockProps {
  narrative: AnalysisNarrative;
  className?: string;
}

/**
 * LLM 可读性主内容：结论、总述、要点、局限性（结构化卡片之前展示）
 */
export function AnalysisNarrativeBlock({ narrative, className }: AnalysisNarrativeBlockProps) {
  const paragraphs = narrative.summary
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <section
      className={cn(
        "border-b border-[#2a475e]/50 bg-gradient-to-b from-[#0f1923] to-[#0a1219]",
        className
      )}
    >
      <div className="container mx-auto max-w-4xl px-6 py-10">
        <p className="mb-2 text-xs font-medium uppercase tracking-widest text-[#66c0f4]/80">
          LLM 战斗解读
        </p>

        {/* 一句话结论 */}
        <div className="relative mb-8 rounded-xl border border-[#66c0f4]/25 bg-[#1b2838]/60 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <Quote className="absolute right-5 top-5 h-10 w-10 text-[#66c0f4]/15" aria-hidden />
          <h2 className="pr-12 text-xl font-semibold leading-snug text-white md:text-2xl">
            {narrative.verdict}
          </h2>
        </div>

        {/* 总述段落 */}
        {paragraphs.length > 0 ? (
          <div className="space-y-4 text-base leading-relaxed text-white/85">
            {paragraphs.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        ) : (
          <p className="text-sm text-white/50">暂无总述段落。</p>
        )}

        {/* 要点列表 */}
        {narrative.keyTakeaways.length > 0 && (
          <div className="mt-10 rounded-xl border border-[#2a475e]/40 bg-[#1b2838]/40 p-5">
            <div className="mb-4 flex items-center gap-2 text-white">
              <ListOrdered className="h-5 w-5 text-[#66c0f4]" />
              <h3 className="text-lg font-semibold">核心要点</h3>
            </div>
            <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-white/80 marker:text-[#66c0f4]">
              {narrative.keyTakeaways.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ol>
          </div>
        )}

        {/* 局限性 */}
        {narrative.dataCaveat && (
          <div className="mt-8 flex gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm leading-relaxed text-amber-100/90">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400/90" aria-hidden />
            <p>{narrative.dataCaveat}</p>
          </div>
        )}
      </div>
    </section>
  );
}
