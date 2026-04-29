"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

interface ExpandableSectionProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  variant?: "default" | "card" | "minimal";
  className?: string;
  accentColor?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  /** 是否显示展开/收起按钮 */
  collapsible?: boolean;
  /** 最多显示几行内容（折叠时） */
  maxCollapsedLines?: number;
}

export function ExpandableSection({
  title,
  subtitle,
  children,
  defaultExpanded = false,
  variant = "default",
  className,
  accentColor = "bg-primary",
  icon,
  badge,
  collapsible = true,
}: ExpandableSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div
      className={cn(
        "rounded-2xl transition-all duration-300",
        variant === "card" && "bg-white/[0.03] border border-white/5",
        variant === "minimal" && "",
        variant === "default" && "p-5",
        className
      )}
    >
      {/* 标题栏 */}
      <div
        className={cn(
          "flex items-center gap-3",
          collapsible && "cursor-pointer select-none"
        )}
        onClick={() => collapsible && setExpanded(!expanded)}
      >
        {/* 左侧强调线 */}
        <div className={cn("w-1 h-6 rounded-full shrink-0", accentColor)} />

        {/* 图标 */}
        {icon && (
          <div className="shrink-0">
            {icon}
          </div>
        )}

        {/* 标题和副标题 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-base font-semibold text-white">{title}</h4>
            {badge}
          </div>
          {subtitle && (
            <p className="text-xs text-white/40 mt-0.5">{subtitle}</p>
          )}
        </div>

        {/* 展开/收起按钮 */}
        {collapsible && (
          <button
            type="button"
            className={cn(
              "p-2 rounded-lg hover:bg-white/5 transition-all duration-200 shrink-0",
              expanded && "rotate-180"
            )}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            <ChevronDown className="w-4 h-4 text-white/50" />
          </button>
        )}
      </div>

      {/* 内容区 */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-300 ease-in-out",
          expanded ? "mt-5 max-h-[5000px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        {children}
      </div>

      {/* 收起状态下的预览 */}
      {!expanded && variant === "card" && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-1 h-1 rounded-full bg-white/30" />
            <div className="w-1 h-1 rounded-full bg-white/30" />
            <div className="w-1 h-1 rounded-full bg-white/30" />
            <span className="text-xs text-white/30 ml-1">
              {subtitle || "点击展开查看详情"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

interface ContentBlockProps {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "highlight" | "warning" | "success";
  padding?: "none" | "tight" | "normal" | "relaxed";
}

/**
 * 内容块容器
 * 提供统一的背景、边框、内边距样式
 */
export function ContentBlock({
  children,
  className,
  variant = "default",
  padding = "normal",
}: ContentBlockProps) {
  return (
    <div
      className={cn(
        "rounded-xl",
        variant === "default" && "bg-white/[0.02]",
        variant === "highlight" && "bg-violet-500/5 border border-violet-500/10",
        variant === "warning" && "bg-rose-500/5 border border-rose-500/10",
        variant === "success" && "bg-emerald-500/5 border border-emerald-500/10",
        padding === "none" && "p-0",
        padding === "tight" && "p-5",
        padding === "normal" && "p-6",
        padding === "relaxed" && "p-8",
        className
      )}
    >
      {children}
    </div>
  );
}

interface StatItemProps {
  label: string;
  value: string | number;
  description?: string;
  color?: string;
  className?: string;
}

/**
 * 统计数据项
 * 用于展示关键指标，带标签和可选描述
 */
export function StatItem({
  label,
  value,
  description,
  color = "bg-cyan-400",
  className,
}: StatItemProps) {
  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("w-2 h-2 rounded-full", color)} />
        <span className="text-xs text-white/40 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-sm font-medium text-white/80">{value}</p>
      {description && (
        <p className="text-xs text-white/30 mt-1">{description}</p>
      )}
    </div>
  );
}
