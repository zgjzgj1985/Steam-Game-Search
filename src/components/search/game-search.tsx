"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Search, Filter, X, ChevronLeft, ChevronRight, Calendar, SlidersHorizontal, Sparkles } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { GameCard } from "@/components/search/game-card";
import { SearchFilters, Game } from "@/types/game";
import { format, addYears, subYears } from "date-fns";
import { zhCN } from "date-fns/locale";
import * as Popover from "@radix-ui/react-popover";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";

const GENRES = ["RPG", "JRPG", "SRPG", "策略", "卡牌", "回合制"];
const SORT_OPTIONS = [
  { value: "rating", label: "好评率" },
  { value: "reviews", label: "评价数" },
  { value: "date", label: "发售日期" },
  { value: "name", label: "名称" },
];

const QUICK_DATE_RANGES = [
  { label: "近1年", months: 12 },
  { label: "近3年", months: 36 },
  { label: "近5年", months: 60 },
  { label: "近10年", months: 120 },
  { label: "2015前", isBefore: "2015-01-01" },
  { label: "2010前", isBefore: "2010-01-01" },
];

/** 与接口参数语义对齐的稳定快照 */
function filtersSnapshot(f: SearchFilters): string {
  const genres = f.genres?.length
    ? [...f.genres].sort((a, b) => a.localeCompare(b, "zh-CN"))
    : [];
  return JSON.stringify({
    sortBy: f.sortBy ?? "reviews",
    sortOrder: f.sortOrder ?? "desc",
    minRating: f.minRating ?? 0,
    minReviews: f.minReviews ?? 0,
    genres,
    minReleaseDate: f.minReleaseDate ?? "",
    maxReleaseDate: f.maxReleaseDate ?? "",
    excludeTestVersions: f.excludeTestVersions ?? true,
  });
}

function getCurrentYear() {
  return new Date().getFullYear();
}

export function GameSearch() {
  const [query, setQuery] = useState("");
  const [showFilters, setShowFilters] = useState(true);
  const [filters, setFilters] = useState<SearchFilters>({
    sortBy: "reviews",
    sortOrder: "desc",
    minReviews: 0,
    excludeTestVersions: true,
  });
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<Game[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [searchNote, setSearchNote] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const PAGE_SIZE = 50;
  const lastAppliedFiltersRef = useRef<string>("");
  const searchSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const filtersKey = useMemo(() => filtersSnapshot(filters), [filters]);

  const runSearch = useCallback(async (targetPage: number) => {
    const q = query.trim();
    const hasGenre = (filters.genres?.length ?? 0) > 0;
    const hasMinRating = (filters.minRating ?? 0) > 0;
    const hasMinReviews = (filters.minReviews ?? 0) > 0;
    const hasDateRange = Boolean(filters.minReleaseDate || filters.maxReleaseDate);

    if (!q && !hasGenre && !hasMinRating && !hasMinReviews && !hasDateRange) {
      abortRef.current?.abort();
      abortRef.current = null;
      setIsSearching(false);
      setFeedback("请输入游戏名称，或展开筛选后设置条件再搜索");
      setSearchNote(null);
      setHasSearched(false);
      setResults([]);
      setTotalCount(0);
      setTotalPages(0);
      setPage(1);
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const seq = ++searchSeqRef.current;

    setFeedback(null);
    setSearchNote(null);
    setIsSearching(true);
    setHasSearched(true);
    setPage(targetPage);
    lastAppliedFiltersRef.current = filtersSnapshot(filters);

    const SEARCH_CLIENT_TIMEOUT_MS = 62_000;
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      if (searchSeqRef.current === seq && abortRef.current === ac) {
        timedOut = true;
        ac.abort();
      }
    }, SEARCH_CLIENT_TIMEOUT_MS);

    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (filters.minRating) params.set("minRating", filters.minRating.toString());
      if (filters.minReviews) params.set("minReviews", filters.minReviews.toString());
      if (filters.sortBy) params.set("sortBy", filters.sortBy);
      if (filters.sortOrder) params.set("sortOrder", filters.sortOrder);
      filters.genres?.forEach((g) => params.append("genre", g));
      if (filters.minReleaseDate) params.set("minReleaseDate", filters.minReleaseDate);
      if (filters.maxReleaseDate) params.set("maxReleaseDate", filters.maxReleaseDate);
      if (filters.excludeTestVersions !== undefined) {
        params.set("excludeTestVersions", String(filters.excludeTestVersions));
      }
      params.set("page", String(targetPage));
      params.set("pageSize", String(PAGE_SIZE));

      const response = await fetch(`/api/games/search?${params.toString()}`, {
        cache: "no-store",
        signal: ac.signal,
      });

      if (seq !== searchSeqRef.current) return;

      if (!response.ok) {
        setFeedback(`搜索失败（HTTP ${response.status}），请稍后重试`);
        setResults([]);
        setTotalCount(0);
        setTotalPages(0);
        return;
      }

      const data = await response.json();

      if (seq !== searchSeqRef.current) return;

      if (data.error) {
        setFeedback(data.error);
        setResults([]);
        setTotalCount(0);
        setTotalPages(0);
        return;
      }

      setResults(data.results || []);
      setTotalCount(typeof data.total === "number" ? data.total : 0);
      setTotalPages(typeof data.totalPages === "number" ? data.totalPages : 0);
      const baseNote =
        data.derivedFromFilters && data.query
          ? `未输入游戏名时：① 商店关键词多词轮询（中/英合并）；② SteamSpy 多品类热门 ID；③ 详情为中英合并文案后再筛。若同时选「策略+回合制」，命中「回合制策略 / turn-based tactics」等组合短语即视为满足该组合。每页最多 ${PAGE_SIZE} 条。`
          : null;
      if (data.incomplete) {
        setSearchNote(
          baseNote
            ? `${baseNote} 本次为在限时内返回，扫描未跑完，总数可能偏少；可输入具体游戏名缩小范围。`
            : "本次为在限时内返回，扫描未跑完，总数可能偏少；可输入具体游戏名或稍后再试。"
        );
      } else {
        setSearchNote(baseNote);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        if (seq !== searchSeqRef.current) return;
        if (timedOut) {
          setFeedback("搜索超过约 1 分钟仍无响应，已自动中止。若常出现请检查网络或输入游戏名缩小范围。");
          setResults([]);
          setTotalCount(0);
          setTotalPages(0);
        }
        return;
      }
      console.error("Search failed:", error);
      if (seq !== searchSeqRef.current) return;
      setFeedback("网络错误，请检查连接后重试");
      setResults([]);
      setTotalCount(0);
      setTotalPages(0);
    } finally {
      window.clearTimeout(timeoutId);
      if (seq === searchSeqRef.current) {
        setIsSearching(false);
        abortRef.current = null;
      }
    }
  }, [query, filters]);

  const handleSearch = () => runSearch(1);

  useEffect(() => {
    if (!hasSearched) return;
    if (filtersKey === lastAppliedFiltersRef.current) return;
    const t = window.setTimeout(() => {
      void runSearch(1);
    }, 350);
    return () => window.clearTimeout(t);
  }, [filtersKey, hasSearched, runSearch]);

  const toggleGenre = (genre: string) => {
    setFilters((prev) => ({
      ...prev,
      genres: prev.genres?.includes(genre)
        ? prev.genres.filter((g) => g !== genre)
        : [...(prev.genres || []), genre],
    }));
  };

  const clearFilters = () => {
    setFilters({
      sortBy: "reviews",
      sortOrder: "desc",
      minReviews: 0,
      minReleaseDate: undefined,
      maxReleaseDate: undefined,
      excludeTestVersions: true,
    });
  };

  const applyQuickDateRange = (range: { months?: number; isBefore?: string }) => {
    if (range.months) {
      const maxDate = format(new Date(), "yyyy-MM-dd");
      const minDate = format(subYears(new Date(), range.months / 12), "yyyy-MM-dd");
      setFilters((prev) => ({ ...prev, minReleaseDate: minDate, maxReleaseDate: maxDate }));
    } else if (range.isBefore) {
      setFilters((prev) => ({ ...prev, minReleaseDate: undefined, maxReleaseDate: range.isBefore }));
    }
  };

  const activeDateRangeLabel = useMemo(() => {
    if (filters.minReleaseDate && filters.maxReleaseDate) {
      return `${filters.minReleaseDate} ~ ${filters.maxReleaseDate}`;
    }
    if (filters.minReleaseDate) {
      return `${filters.minReleaseDate} 至今`;
    }
    if (filters.maxReleaseDate) {
      return `~ ${filters.maxReleaseDate}`;
    }
    return null;
  }, [filters.minReleaseDate, filters.maxReleaseDate]);

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl">
      {/* 搜索框 - 现代化设计 */}
      <div className="relative mb-6 w-full min-w-0">
        <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-stretch">
          <div className="relative min-w-0 flex-1 group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="w-5 h-5 text-muted-foreground/70 group-focus-within:text-primary transition-colors" />
            </div>
            <Input
              type="text"
              placeholder="搜索 Steam 游戏..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-12 h-14 text-lg bg-card border-2 focus:border-primary rounded-xl shadow-sm transition-all"
            />
          </div>
          <Button
            onClick={handleSearch}
            disabled={isSearching}
            className="h-14 w-full shrink-0 px-8 sm:w-auto bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 rounded-xl shadow-lg shadow-primary/20 font-medium"
          >
            {isSearching ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                搜索中...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                搜索
              </span>
            )}
          </Button>
        </div>
      </div>

      {feedback && (
        <div className="mb-4 p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive">
          {feedback}
        </div>
      )}

      {searchNote && (
        <div className="mb-4 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
          {searchNote}
        </div>
      )}

      {/* 筛选面板 - 卡片式设计 */}
      {showFilters && (
        <div className="bg-card border rounded-2xl p-5 mb-6 shadow-sm">
          {/* 头部 */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <SlidersHorizontal className="w-4 h-4 text-primary" />
              </div>
              <h3 className="font-semibold">高级筛选</h3>
            </div>
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4 mr-1" />
              重置
            </Button>
          </div>

          {/* 筛选条件网格 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 类型筛选 */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-muted-foreground">游戏类型</label>
              <div className="flex flex-wrap gap-2">
                {GENRES.map((genre) => (
                  <button
                    key={genre}
                    onClick={() => toggleGenre(genre)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      filters.genres?.includes(genre)
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {genre}
                  </button>
                ))}
              </div>
              {/* 测试版开关 */}
              <div className="flex items-center justify-between pt-2">
                <span className="text-sm font-medium">隐藏测试版游戏</span>
                <button
                  role="switch"
                  aria-checked={filters.excludeTestVersions !== false}
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      excludeTestVersions: prev.excludeTestVersions === false ? true : false,
                    }))
                  }
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    filters.excludeTestVersions !== false ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                      filters.excludeTestVersions !== false ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* 排序与日期 */}
            <div className="space-y-4">
              <div className="space-y-3">
                <label className="text-sm font-medium text-muted-foreground">排序方式</label>
                <div className="flex gap-2">
                  {SORT_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setFilters((prev) => ({ ...prev, sortBy: option.value as SearchFilters["sortBy"] }))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        filters.sortBy === option.value
                          ? "bg-primary text-primary-foreground shadow-md"
                          : "bg-muted/50 hover:bg-muted text-muted-foreground"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 日期范围与数值滑块 */}
            <div className="space-y-4">
              {/* 日期范围 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-muted-foreground">上线日期</label>
                  {(filters.minReleaseDate || filters.maxReleaseDate) && (
                    <button
                      onClick={() => setFilters((prev) => ({ ...prev, minReleaseDate: undefined, maxReleaseDate: undefined }))}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                    >
                      <X className="w-3 h-3" />
                      清空
                    </button>
                  )}
                </div>
                
                {/* 快捷选项 */}
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_DATE_RANGES.map((range) => (
                    <button
                      key={range.label}
                      onClick={() => applyQuickDateRange(range)}
                      className="px-2.5 py-1 rounded-md text-xs font-medium bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {range.label}
                    </button>
                  ))}
                </div>

                {/* 自定义日期选择 */}
                <div className="flex gap-2 items-center">
                  <Popover.Root>
                    <Popover.Trigger asChild>
                      <button className="flex-1 min-w-0 px-3 py-2 rounded-lg border bg-background text-sm text-left truncate hover:bg-accent/50 transition-colors">
                        <span className="text-muted-foreground mr-1">从</span>
                        <span className={filters.minReleaseDate ? "text-foreground" : "text-muted-foreground"}>
                          {filters.minReleaseDate || "不限"}
                        </span>
                      </button>
                    </Popover.Trigger>
                    <Popover.Portal>
                      <Popover.Content className="z-50 bg-background border rounded-xl shadow-xl p-4" align="start">
                        <DayPicker
                          mode="single"
                          selected={filters.minReleaseDate ? new Date(filters.minReleaseDate) : undefined}
                          onSelect={(date) => {
                            setFilters((prev) => ({
                              ...prev,
                              minReleaseDate: date ? format(date, "yyyy-MM-dd") : undefined,
                            }));
                          }}
                          locale={zhCN}
                          disabled={{ after: new Date() }}
                          fromYear={2000}
                          toDate={new Date()}
                        />
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover.Root>

                  <span className="text-muted-foreground">-</span>

                  <Popover.Root>
                    <Popover.Trigger asChild>
                      <button className="flex-1 min-w-0 px-3 py-2 rounded-lg border bg-background text-sm text-left truncate hover:bg-accent/50 transition-colors">
                        <span className="text-muted-foreground mr-1">至</span>
                        <span className={filters.maxReleaseDate ? "text-foreground" : "text-muted-foreground"}>
                          {filters.maxReleaseDate || "不限"}
                        </span>
                      </button>
                    </Popover.Trigger>
                    <Popover.Portal>
                      <Popover.Content className="z-50 bg-background border rounded-xl shadow-xl p-4" align="start">
                        <DayPicker
                          mode="single"
                          selected={filters.maxReleaseDate ? new Date(filters.maxReleaseDate) : undefined}
                          onSelect={(date) => {
                            setFilters((prev) => ({
                              ...prev,
                              maxReleaseDate: date ? format(date, "yyyy-MM-dd") : undefined,
                            }));
                          }}
                          locale={zhCN}
                          disabled={{ after: new Date() }}
                          fromYear={2000}
                          toDate={new Date()}
                        />
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover.Root>
                </div>

                {activeDateRangeLabel && (
                  <div className="flex items-center gap-2 text-xs text-primary">
                    <Calendar className="w-3 h-3" />
                    <span>{activeDateRangeLabel}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 数值滑块区域 */}
          <div className="mt-6 pt-6 border-t grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* 好评率滑块 */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-muted-foreground">最低好评率</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={filters.minRating ?? 0}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                      setFilters((prev) => ({ ...prev, minRating: val }));
                    }}
                    className="w-16 h-8 px-2 text-center text-sm font-semibold bg-muted/50 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <span className="text-sm font-semibold text-primary">%</span>
                </div>
              </div>
              <div className="relative pt-1">
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-primary/60 to-primary transition-all duration-75"
                    style={{ width: `${filters.minRating ?? 0}%` }}
                  />
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step={1}
                  value={filters.minRating ?? 0}
                  onChange={(e) => setFilters((prev) => ({ ...prev, minRating: parseInt(e.target.value) }))}
                  className="absolute -top-1 inset-0 w-full h-5 opacity-0 cursor-pointer"
                />
                {/* 滑块轨道覆盖层 */}
                <div 
                  className="absolute -top-1 left-0 h-5 pointer-events-none"
                  style={{ width: `${filters.minRating ?? 0}%` }}
                >
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-5 h-5 bg-white border-2 border-primary rounded-full shadow-lg" />
                </div>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0%</span>
                <span>25%</span>
                <span>50%</span>
                <span>75%</span>
                <span>100%</span>
              </div>
            </div>

            {/* 评价数滑块 */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-muted-foreground">最低评价数</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="10000"
                    step="10"
                    value={filters.minReviews ?? 0}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(10000, parseInt(e.target.value) || 0));
                      setFilters((prev) => ({ ...prev, minReviews: val }));
                    }}
                    className="w-24 h-8 px-2 text-center text-sm font-semibold bg-muted/50 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
              {/* 快捷预设 */}
              <div className="flex flex-wrap gap-2">
                {[0, 100, 500, 1000, 2000, 5000].map((val) => (
                  <button
                    key={val}
                    onClick={() => setFilters((prev) => ({ ...prev, minReviews: val }))}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                      filters.minReviews === val
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {val === 0 ? "不限" : val.toLocaleString()}
                  </button>
                ))}
              </div>
              <div className="relative pt-1">
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-primary/60 to-primary transition-all duration-75"
                    style={{ width: `${Math.min(((filters.minReviews ?? 0) / 10000) * 100, 100)}%` }}
                  />
                </div>
                <input
                  type="range"
                  min="0"
                  max="10000"
                  step={10}
                  value={filters.minReviews ?? 0}
                  onChange={(e) => setFilters((prev) => ({ ...prev, minReviews: parseInt(e.target.value) }))}
                  className="absolute -top-1 inset-0 w-full h-5 opacity-0 cursor-pointer"
                />
                {/* 滑块轨道覆盖层 */}
                <div 
                  className="absolute -top-1 left-0 h-5 pointer-events-none"
                  style={{ width: `${Math.min(((filters.minReviews ?? 0) / 10000) * 100, 100)}%` }}
                >
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-5 h-5 bg-white border-2 border-primary rounded-full shadow-lg" />
                </div>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0</span>
                <span>2,500</span>
                <span>5,000</span>
                <span>7,500</span>
                <span>10,000+</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 搜索结果 */}
      {hasSearched && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold">
              搜索结果
              {totalCount > 0 && (
                <span className="text-base font-normal text-muted-foreground ml-2">
                  （{totalCount.toLocaleString()} 个）
                </span>
              )}
            </h3>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  第 {page} / {totalPages} 页
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={isSearching || page <= 1}
                  onClick={() => runSearch(page - 1)}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={isSearching || page >= totalPages}
                  onClick={() => runSearch(page + 1)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          {isSearching && (
            <div className="mb-4 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
              正在更新列表...
            </div>
          )}

          {results.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {results.map((game) => (
                <GameCard key={game.id} game={game} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                <Search className="w-8 h-8" />
              </div>
              <p className="text-lg">未找到匹配的游戏</p>
              <p className="text-sm mt-1">请尝试其他关键词或放宽筛选条件</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
