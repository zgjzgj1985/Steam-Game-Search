"use client";

import { cn } from "@/lib/utils";

interface RichTextProps {
  text: string;
  className?: string;
  /** 最小段落字符数阈值，低于此值的段落会被视为副文本 */
  shortThreshold?: number;
  /** 每段最大字符数，超过此值会自动拆分 */
  maxParagraphLength?: number;
}

/**
 * 智能文本渲染器
 *
 * 核心功能：
 * - 自动按句子分割长文本（中文优先使用中文标点）
 * - 每段控制在合适长度（默认150-200字符）
 * - 长段落显示更多行高，行间距更宽松
 * - 短段落（如一句话描述）紧凑排列
 */
export function RichText({
  text,
  className,
  shortThreshold = 50,
  maxParagraphLength = 180,
}: RichTextProps) {
  if (!text) return null;

  // 预处理：统一换行符并清理
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  // 智能段落分割
  const paragraphs: string[] = [];

  // 策略1：先按双换行符分割（标准段落分隔）
  const segments = normalized.split(/\n{2,}/);

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    // 策略2：按自然句子分割
    // 中文句子分隔符：。！？；——
    // 英文句子分隔符：.!?;
    const sentenceSplit = trimmed.split(/(?<=[。！？；——.!?;])\s*/);

    let currentParagraph = "";

    for (const sentence of sentenceSplit) {
      const s = sentence.trim();
      if (!s) continue;

      // 如果当前句子本身就超过最大长度，需要进一步拆分
      if (s.length > maxParagraphLength) {
        // 先保存当前段落
        if (currentParagraph.trim()) {
          paragraphs.push(currentParagraph.trim());
          currentParagraph = "";
        }
        // 将长句子拆分成多个小段落
        const subParagraphs = splitLongSentence(s, maxParagraphLength);
        paragraphs.push(...subParagraphs);
        continue;
      }

      // 如果加上当前句子不会超过限制，直接添加
      if (currentParagraph.length + s.length <= maxParagraphLength) {
        currentParagraph += (currentParagraph ? " " : "") + s;
      } else {
        // 当前段落已满，保存并开始新段落
        if (currentParagraph.trim()) {
          paragraphs.push(currentParagraph.trim());
        }
        currentParagraph = s;
      }
    }

    // 保存最后一个段落
    if (currentParagraph.trim()) {
      paragraphs.push(currentParagraph.trim());
    }
  }

  // 如果没有段落（文本很短），直接使用原文本
  if (paragraphs.length === 0 && normalized) {
    paragraphs.push(normalized);
  }

  return (
    <div className={cn("space-y-5", className)}>
      {paragraphs.map((para, index) => {
        const isShort = para.length < shortThreshold;
        const isFirst = index === 0;

        return (
          <p
            key={index}
            className={cn(
              "leading-relaxed",
              // 第一个段落使用标准样式
              isFirst && [
                "text-sm text-white/70",
              ],
              // 非首段的长段落
              !isFirst && !isShort && [
                "text-sm text-white/60",
              ],
              // 短段落更紧凑
              isShort && !isFirst && [
                "text-sm text-white/50",
              ]
            )}
          >
            {para}
          </p>
        );
      })}
    </div>
  );
}

/**
 * 将长句子拆分成多个较短的小段落
 */
function splitLongSentence(sentence: string, maxLength: number): string[] {
  const result: string[] = [];

  // 对于很长的句子，尝试按逗号、顿号等再次分割
  // 中文逗号：， 顿号：、 冒号：：
  const subParts = sentence.split(/(?<=[，、：；])/);

  let current = "";

  for (const part of subParts) {
    const p = part.trim();
    if (!p) continue;

    // 如果当前部分加上新部分不会太长
    if (current.length + p.length <= maxLength) {
      current += (current ? " " : "") + p;
    } else {
      // 保存当前段落，开始新的
      if (current.trim()) {
        result.push(current.trim());
      }
      // 如果单个部分仍然超过限制，按字符数硬拆分
      if (p.length > maxLength) {
        const chunks = splitByCharCount(p, maxLength);
        result.push(...chunks.slice(0, -1));
        current = chunks[chunks.length - 1] || "";
      } else {
        current = p;
      }
    }
  }

  if (current.trim()) {
    result.push(current.trim());
  }

  return result;
}

/**
 * 按字符数硬拆分字符串
 */
function splitByCharCount(str: string, maxLength: number): string[] {
  const result: string[] = [];
  let start = 0;

  while (start < str.length) {
    result.push(str.slice(start, start + maxLength));
    start += maxLength;
  }

  return result;
}

interface RichTextInlineProps {
  text: string;
  className?: string;
}

/**
 * 内联文本渲染器（单段落，无间距）
 * 适用于表格单元格、徽章描述等短文本场景
 */
export function RichTextInline({ text, className }: RichTextInlineProps) {
  if (!text) return null;

  // 处理换行：保留换行但不做段落分隔
  const processed = text
    .replace(/\r\n/g, " ")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (
    <span className={cn("text-sm text-white/60", className)}>
      {processed}
    </span>
  );
}
