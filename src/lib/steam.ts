// Steam API Service
// 用于获取Steam游戏数据

const STEAM_STORE_API = "https://store.steampowered.com/api";

export interface SteamGame {
  appid: number;
  name: string;
  type: string;
  description: string;
  developers: string[];
  publishers: string[];
  genres: string[];
  tags: string[];
  release_date: string;
  price: number;
  metacritic_score: number | null;
  header_image: string;
  capsule_image: string;
}

export interface SteamReviewData {
  total_positive: number;
  total_negative: number;
  total_reviews: number;
  review_score: number;
  review_score_desc: string;
}

export class SteamService {
  private cache: Map<string, { data: unknown; expiry: number }> = new Map();
  private cacheTimeout = 1000 * 60 * 15; // 15分钟缓存

  // 速率限制：每个 Steam API 域名每秒最多 10 个请求
  private rateLimiters: Map<string, { tokens: number; lastRefill: number }> = new Map();
  private readonly RATE_LIMIT = 10; // 每秒请求数
  private readonly RATE_WINDOW = 1000; // 窗口大小（毫秒）

  private async throttle(domain: string): Promise<void> {
    const now = Date.now();
    const state = this.rateLimiters.get(domain) ?? { tokens: this.RATE_LIMIT, lastRefill: now };

    // 时间流逝后补充 token
    const elapsed = now - state.lastRefill;
    if (elapsed >= this.RATE_WINDOW) {
      state.tokens = this.RATE_LIMIT;
      state.lastRefill = now;
    }

    if (state.tokens <= 0) {
      // 等待下一个时间窗口
      const waitMs = this.RATE_WINDOW - elapsed;
      await new Promise((r) => setTimeout(r, waitMs));
      state.tokens = this.RATE_LIMIT;
      state.lastRefill = Date.now();
    }

    state.tokens--;
    this.rateLimiters.set(domain, state);
  }

  /**
   * 受限制的 fetch：速率限制 + 429 自动重试
   */
  private async fetchWithThrottle(
    url: string,
    options: RequestInit & { signal?: AbortSignal }
  ): Promise<Response> {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    await this.throttle(domain);

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch(url, options);
      if (response.status === 429) {
        // Steam API 限速，等待后重试
        const retryAfter = response.headers.get("Retry-After");
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : (attempt + 1) * 1000;
        await new Promise((r) => setTimeout(r, waitMs));
        lastError = new Error(`Steam API rate limited (429), retry ${attempt + 1}/3`);
        continue;
      }
      return response;
    }
    throw lastError ?? new Error(`Failed to fetch ${url} after 3 attempts`);
  }

  /**
   * SteamDB 有按类别分页的大型 AppList，比商店搜索更全。
   * 格式: GET https://steamdb.info/api/GetAppList/?branch=Public&origin=STEAMDATAVIEWER_SA
   * 返回 { Success: true, Data: { apps: [{ AppID, Name }] } }
   * 注意：该接口较大（约 10MB），且不直接支持按 genre 过滤，需要本地过滤或另用 SteamDB API。
   * 此处折中：拉 SteamDB 的 AppList 并从中按名称/开发者/标签模糊匹配。
   */
  async collectSteamDbAppList(maxCount = 20000): Promise<{ appid: number; name: string }[]> {
    const cacheKey = `steamdb_applist_${maxCount}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.data as { appid: number; name: string }[];
    }

    try {
      const response = await this.fetchWithThrottle(
        "https://steamdb.info/api/GetAppList/?branch=Public&origin=STEAMDATAVIEWER_SA",
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; turn-based-analyzer/1.0)",
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(30000),
        }
      );
      if (!response.ok) return [];
      const data = await response.json() as {
        Success?: boolean;
        Data?: { apps?: { AppID?: number; Name?: string }[] };
      };

      if (!data?.Success || !Array.isArray(data.Data?.apps)) return [];

      const out: { appid: number; name: string }[] = [];
      for (const app of data.Data!.apps!) {
        const id = app.AppID;
        const name = app.Name;
        if (typeof id !== "number" || typeof name !== "string") continue;
        out.push({ appid: id, name });
        if (out.length >= maxCount) break;
      }

      this.cache.set(cacheKey, { data: out, expiry: Date.now() + 1000 * 60 * 60 * 6 });
      return out;
    } catch {
      return [];
    }
  }

  /**
   * Steam 玩家数量排行（来自 SteamCharts）。
   * https://steamcharts.com/top/p.{page}，解析 HTML 获取当前玩家最多的 AppId。
   * 作为高质量候选补充：玩家多的游戏评价数通常也较多，过滤后命中率更高。
   */
  async collectTopAppsByPlayerCount(pages = 6): Promise<number[]> {
    const cacheKey = `steamcharts_top_${pages}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.data as number[];
    }

    const seen = new Set<number>();
    const out: number[] = [];

    for (let page = 1; page <= pages; page++) {
      try {
        const url = `https://steamcharts.com/top/p.${page}`;
        const resp = await this.fetchWithThrottle(url, {
          headers: {
            "User-Agent": "Mozilla/5.0",
          },
          signal: AbortSignal.timeout(15000),
        });
        if (!resp.ok) continue;
        const html = await resp.text();
        const matches = html.matchAll(/\/app\/(\d+)\//g);
        for (const m of matches) {
          const id = parseInt(m[1], 10);
          if (!Number.isFinite(id) || seen.has(id)) continue;
          seen.add(id);
          out.push(id);
        }
      } catch { /* 单页失败不影响整体 */ }
      if (out.length >= 2000) break;
    }

    this.cache.set(cacheKey, { data: out, expiry: Date.now() + 1000 * 60 * 60 * 2 });
    return out;
  }

  /**
   * SteamDB 类别页搜索：按 tag 过滤获取 AppId 列表。
   * https://steamdb.com/api/Tag/{tagId}/
   * 返回该 tag 下的应用列表（需配合 Tag 名称表使用）。
   */
  async collectBySteamDbTag(tagName: string): Promise<number[]> {
    try {
      const url = `https://steamdb.com/api/Tag/?tag=${encodeURIComponent(tagName)}`;
      const resp = await this.fetchWithThrottle(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(20000),
      });
      if (!resp.ok) return [];
      const data = await resp.json() as { apps?: { appid?: number }[] };
      if (!Array.isArray(data.apps)) return [];
      const out: number[] = [];
      for (const a of data.apps) {
        if (typeof a.appid === "number") out.push(a.appid);
      }
      return out;
    } catch {
      return [];
    }
  }

  /**
   * 批量并发抓取多个 SteamDB 标签，返回合并去重后的所有 appid。
   * 每个标签可能返回 1000~5000 条，远超 storesearch 的 50 条限制。
   * 缓存每个标签 1 小时，加速重复搜索。
   */
  async collectByMultipleSteamDbTags(tagNames: string[]): Promise<number[]> {
    const cacheKey = `steamdb_multi_tags_${tagNames.sort().join("|")}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.data as number[];
    }

    const CONCURRENCY = 6;
    const seen = new Set<number>();
    const out: number[] = [];

    for (let i = 0; i < tagNames.length; i += CONCURRENCY) {
      const slice = tagNames.slice(i, i + CONCURRENCY);
      const results = await Promise.all(slice.map((t) => this.collectBySteamDbTag(t)));
      for (const ids of results) {
        for (const id of ids) {
          if (seen.has(id)) continue;
          seen.add(id);
          out.push(id);
        }
      }
      if (i + CONCURRENCY < tagNames.length) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    this.cache.set(cacheKey, { data: out, expiry: Date.now() + 1000 * 60 * 60 });
    return out;
  }

  /**
   * 扩展关键词池：覆盖 Steam 官方标签、常见子类型、多语言同义词等。
   * 从约 50 词扩展到约 200 词，显著提升候选召回率。
   */
  ultraExpandedSearchTerms(): string[] {
    const pool: string[] = [
      // 基础回合制/策略类
      "回合制", "回合", "回合策略", "回合战术", "回合制策略", "回合制战术",
      "turn-based", "turn based", "turn-based strategy", "turn based strategy",
      "turn-based tactics", "turn based tactics", "turn based rpg", "turn-based rpg",
      "TBS", "TBT", "回合战略", "回合战棋",

      // 战棋/SRPG
      "战棋", "策略战棋", "战略角色扮演", "战略战棋",
      "SRPG", "sRPG", "tactical RPG", "tactical rpg", "tactics RPG",
      "grid tactics", "grid rpg", "grid tactics", "squad tactics",
      "XCOM-like", "fire emblem", "advance wars",

      // 策略类
      "策略", "战略", "strategy", "strategic",
      "tactics", "tactical", "wargame", "war game",
      "grand strategy", "Grand Strategy",
      "4X", "4x", "4x strategy",
      "SLG", "slg", "simultaneous turn",
      "回合策略游戏", "即时战术",

      // RPG 类
      "RPG", "rpg", "角色扮演", "角色扮演游戏",
      "JRPG", "jrpg", "日式RPG", "日式角色扮演", "anime RPG",
      "ARPG", "arpg",
      "MMORPG", "欧式角色扮演",

      // 卡牌/牌库构筑
      "卡牌", "卡牌游戏", "集换式", "集换式卡牌",
      "card", "card game", "cards",
      "deck", "deckbuilder", "deck builder", "deck-building", "deckbuilding",
      "deck building", "CCG", "TCG", "collectible card", "trading card",
      "牌组构筑", "牌库构筑", "卡牌构筑", "集换式卡牌游戏",
      "card battler", "card roguelike", "deckbuilding roguelike",
      "roguelike deck", "auto battler", "autobattler", "auto-battler",
      "自走棋", "chess roguelike",

      // 棋盘/桌游/数字桌游
      "board game", "boardgame", "棋盘游戏", "桌游", "桌面游戏",
      "tabletop", "digital board", "digital tabletop",
      "回合制桌游", "回合制棋盘",

      // 肉鸽/随机生成
      "roguelike", "Roguelike", "roguelite", "procedural tactics",
      "procedural roguelike", "随机地牢", "随机生成",

      // Steam 常用标签关键词
      "hex grid", "hex-based", "hex tactics", "六角格", "六角战棋",
      "tile-based", "格子战棋", "格子策略",
      "puzzle strategy", "解谜策略",
      "multiplayer strategy", "多人策略",
      "singleplayer", "单人游戏",
      "co-op strategy", "合作策略",
      "real-time tactics", "RTT",
      "回合制 RPG", "回合制角色扮演",
      "回合制冒险", "回合制卡牌",
      "回合制模拟", "回合制塔防",
      "turn-based adventure", "turn-based simulation",
      "turn-based tower defense", "回合制塔防",
      "turn-based roguelike", "回合制肉鸽",
      "回合制策略游戏", "回合制SLG",
      "strategy RPG", "strategy game",
      "military strategy", "军事策略",
      "city builder", "城市建造",
      "base building", "基地建设",
      "resource management", "资源管理",
      "tower defense", "塔防",
      "character collection", "角色收集",
      "gacha", "抽卡",
      "hero collector", "英雄收集",
      "dungeon crawler", "地城爬塔",
      "party-based RPG", "小队RPG",
      "party RPG", "组队角色扮演",
      "tactical combat", "战术战斗",
      "tactical challenge", "战术挑战",
      "stealth strategy", "潜行策略",
      "sci-fi strategy", "科幻策略",
      "fantasy strategy", "奇幻策略",
      "historical strategy", "历史策略",
      "medieval strategy", "中世纪策略",
      "space strategy", "太空策略",
      "cyberpunk strategy", "赛博朋克策略",
      "anime strategy", "动漫策略",
      "pixel strategy", "像素策略",
      "indie strategy", "独立策略",
      "indie RPG", "独立RPG",
      "indie card game", "独立卡牌",
      "indie turn-based", "独立回合制",
      "free to play", "免费",
      "pay to win free",

      // 额外扩展：常用变体与组合
      "battle of wits", "智战",
      "放置回合", "放置策略",
      "idle strategy", "放置类",
      "incremental strategy",
      "darkest dungeon style",
      "civilization-like", "文明类",
      "civ-like", "文明风格",
      "diplomacy", "外交",
      "empire building", "帝国建设",
      "kingdom builder", "王国建设",
      "dungeon management", "地城管理",
      "dungeon keeper", "地城守护者",
      "management sim", "经营模拟",
      "business sim", "商业模拟",
      "tycoon", "大亨",
      "logistics", "物流",
      "transportation", "运输",
      "trains", "火车",
      "factory", "工厂",
      "automation", "自动化",
      "crafting", "合成", "制作",
      "survival", "生存",
      "zombie survival", "僵尸生存",
      "post-apocalyptic", "末世",
      "colony sim", "殖民地模拟",
      "space colony", "太空殖民",
      "mars", "火星",
      "moon", "月球",
      "planet", "星球",
      "terraforming", "地形改造",
      "animal crossing style",
      "farming sim", "农场模拟",
      "agricultural", "农业",
      "ranch", "牧场",
      "fishing", "钓鱼",
      "cooking", "烹饪",
      "restaurant", "餐厅",
      "food", "食物",
      "pet", "宠物",
      "cat", "猫",
      "dog", "狗",
      "creature", "生物",
      "monster", "怪物",
      "monster collector", "怪物收集",
      "monster tamer", "驯兽师",
      "pokemon style",
      "creature collection", "生物收集",
      "dragon", "龙",
      "mythology", "神话",
      "folklore", "民间传说",
      "anime", "动漫",
      "manga", "漫画",
      "visual novel", "视觉小说",
      "dating sim", "恋爱模拟",
      "otome", "乙女",
      "horror", "恐怖",
      "psychological", "心理",
      "story-rich", "剧情丰富",
      "narrative", "叙事",
      "choice-driven", "选择驱动",
      "time travel", "时间旅行",
      "time management", "时间管理",
      "puzzle", "解谜", "益智",
      "match-3", "三消",
      "match three", "三连消",
      "word game", "文字游戏",
      "trivia", "知识问答",
      "quiz", "问答",
      "educational", "教育",
      "kids", "儿童",
      "family", "家庭",
      "party game", "派对游戏",
      "local multiplayer", "本地多人",
      "online multiplayer", "在线多人",
      "asynchronous", "异步",
      "hotseat", "热座",
      "pass and play", "传递游玩",
    ];

    return Array.from(new Set(pool));
  }

  private async fetchWithCache<T>(url: string): Promise<T> {
    const cached = this.cache.get(url);
    if (cached && cached.expiry > Date.now()) {
      return cached.data as T;
    }

    const response = await this.fetchWithThrottle(url, {});
    if (!response.ok) {
      throw new Error(`Steam API error: ${response.status}`);
    }

    const data = await response.json();
    this.cache.set(url, { data, expiry: Date.now() + this.cacheTimeout });
    return data;
  }

  /**
   * 单区域商店详情（用于合并多语言或单独展示）。
   */
  async getAppDetailsLocale(
    appId: string,
    cc: string,
    l: string
  ): Promise<SteamGame | null> {
    try {
      const url = `${STEAM_STORE_API}/appdetails?appids=${appId}&cc=${cc}&l=${l}`;
      const response = await this.fetchWithThrottle(url, {});
      const data = await response.json();

      if (!data[appId]?.success) {
        return null;
      }

      const app = data[appId].data;
      const categoryLabels: string[] = Array.isArray(app.categories)
        ? app.categories
            .map((c: { description?: string }) => c.description)
            .filter((s: string | undefined): s is string => Boolean(s))
        : [];
      const shortDesc = app.short_description || "";
      const longDesc = app.about_the_game || "";
      const description =
        [shortDesc, longDesc].filter(Boolean).join(" ").trim() ||
        shortDesc ||
        longDesc;
      return {
        appid: app.steam_appid,
        name: app.name,
        type: app.type,
        description,
        developers: app.developers || [],
        publishers: app.publishers || [],
        genres: app.genres?.map((g: { description: string }) => g.description) || [],
        tags: categoryLabels,
        release_date: app.release_date?.date || null,
        price: app.price_overview?.final_price || 0,
        metacritic_score: app.metacritic?.score || null,
        header_image: app.header_image || "",
        capsule_image: app.capsule_image || "",
      };
    } catch (error) {
      console.error("Failed to fetch app details:", error);
      return null;
    }
  }

  async getAppDetails(appId: string): Promise<SteamGame | null> {
    return this.getAppDetailsLocale(appId, "cn", "schinese");
  }

  /**
   * 搜索过滤用：合并国服 + 美服英文的类型与简介。
   * 大量 TBS 在中文页不写「回合」，英文页有 turn-based，仅拉中文会漏检。
   */
  async getAppDetailsForSearch(appId: string): Promise<SteamGame | null> {
    const [cn, en] = await Promise.all([
      this.getAppDetailsLocale(appId, "cn", "schinese"),
      this.getAppDetailsLocale(appId, "us", "english"),
    ]);
    const primary = cn ?? en;
    if (!primary) return null;
    if (!en || en.appid !== primary.appid) return primary;
    const genres = [...new Set([...primary.genres, ...en.genres])];
    const tags = [...new Set([...primary.tags, ...en.tags])];
    const mergedDesc = [primary.description, en.description]
      .map((d) => d?.trim())
      .filter((d): d is string => Boolean(d))
      .join("\n\n");
    return {
      ...primary,
      genres,
      tags,
      description: mergedDesc || primary.description,
    };
  }

  /**
   * Steam 官方 JSON 搜索（单区域）。HTML 搜索页在无 Cookie 时常被重定向。
   */
  private async storeSearchOneTermLocale(
    term: string,
    limit: number,
    cc: string,
    lang: string
  ): Promise<SteamGame[]> {
    const t = term.trim();
    if (!t) return [];

    try {
      const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(t)}&cc=${cc}&l=${lang}`;
      const response = await this.fetchWithThrottle(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/json",
        },
      });
      if (!response.ok) return [];

      const data = (await response.json()) as {
        items?: { type: string; id: number; name: string }[];
      };
      const items = data.items || [];

      return items
        .filter((item) => item.type === "app")
        .slice(0, Math.min(limit, 50))
        .map((item) => ({
          appid: item.id,
          name: item.name,
          type: "game",
          description: "",
          developers: [],
          publishers: [],
          genres: [],
          tags: [],
          release_date: "",
          price: 0,
          metacritic_score: null,
          header_image: "",
          capsule_image: "",
        }));
    } catch (error) {
      console.error("storeSearchOneTermLocale failed:", error);
      return [];
    }
  }

  /**
   * 同一关键词在中英商店各搜一遍并合并去重，召回明显高于单次 storesearch。
   */
  async storeSearchOneTerm(term: string, limit: number): Promise<SteamGame[]> {
    const cap = Math.min(limit, 50);
    const [cn, en] = await Promise.all([
      this.storeSearchOneTermLocale(term, cap, "cn", "schinese"),
      this.storeSearchOneTermLocale(term, cap, "us", "english"),
    ]);
    const seen = new Set<number>();
    const out: SteamGame[] = [];
    for (const g of [...cn, ...en]) {
      if (seen.has(g.appid)) continue;
      seen.add(g.appid);
      out.push(g);
      if (out.length >= cap) break;
    }
    return out;
  }

  /**
   * SteamSpy 按品类「近期热门」拉 AppId（与关键词搜索互补，不依赖商店排序）。
   * 文档: https://steamspy.com/api/  request=top100in2&genre=slug
   */
  async collectSteamSpyCandidateIds(maxTotal = 1600): Promise<number[]> {
    const slugs = [
      "turn-based",
      "turn based",
      "strategy",
      "tactical",
      "tactics",
      "rpg",
      "card game",
      "card-game",
      "roguelike",
      "simulation",
      "adventure",
      "indie",
    ];
    const seen = new Set<number>();
    const out: number[] = [];

    for (const genre of slugs) {
      if (out.length >= maxTotal) break;
      try {
        const url = `https://steamspy.com/api.php?request=top100in2&genre=${encodeURIComponent(genre)}`;
        const response = await this.fetchWithThrottle(url, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        });
        if (!response.ok) continue;
        const data = (await response.json()) as Record<
          string,
          { appid?: number }
        >;
        if (!data || typeof data !== "object") continue;
        for (const [key, raw] of Object.entries(data)) {
          let id: number | undefined;
          if (
            raw &&
            typeof raw === "object" &&
            typeof (raw as { appid?: number }).appid === "number"
          ) {
            id = (raw as { appid: number }).appid;
          } else {
            const parsed = parseInt(key, 10);
            if (Number.isFinite(parsed)) id = parsed;
          }
          if (
            id === undefined ||
            !Number.isFinite(id) ||
            id <= 0 ||
            seen.has(id)
          ) {
            continue;
          }
          seen.add(id);
          out.push(id);
          if (out.length >= maxTotal) break;
        }
      } catch {
        /* SteamSpy 不可用时跳过 */
      }
      await new Promise((r) => setTimeout(r, 180));
    }

    return out;
  }

  /**
   * 为筛选里的「类型」补充检索词。storesearch 单次条数有限，且「策略」等中文词易排到小游戏，
   * 需叠英文/相关词才能覆盖高评价大作。
   */
  expandGenreSearchTerms(genreFilters: string[]): string[] {
    const extra: Record<string, readonly string[]> = {
      策略: ["strategy", "strategic", "战棋", "4X", "4x", "tactical", "RTS", "grand strategy"],
      回合制: ["turn-based", "turn based", "回合", "TB", "TBS", "tactical RPG"],
      SRPG: ["SRPG", "战略角色扮演", "战棋"],
      JRPG: ["JRPG", "japanese RPG"],
      RPG: ["RPG", "角色扮演"],
      卡牌: ["card", "deck", "deckbuilder", "deck-building", "CCG", "TCG", "集换式"],
    };
    const out: string[] = [];
    for (const g of genreFilters) {
      out.push(g);
      const more = extra[g];
      if (more) out.push(...more);
    }
    return Array.from(new Set(out.filter(Boolean)));
  }

  /** 多选类型时的组合检索词，命中与单类型不同的结果集 */
  combinedGenreTerms(genreFilters: string[]): string[] {
    const has = (s: string) => genreFilters.includes(s);
    const out: string[] = [];
    if (has("卡牌")) {
      out.push("deck builder", "deckbuilding", "card battler", "roguelike deck");
    }
    if (has("回合制") && has("卡牌")) {
      out.push("deckbuilding roguelike", "card strategy");
    }
    if (has("回合制")) {
      out.push("turn based tactics", "turn-based tactics");
    }
    if (has("策略") && has("回合制")) {
      out.push("tactics", "wargame");
    }
    if (has("SRPG") || (has("策略") && has("回合制"))) {
      out.push("grid tactics", "squad tactics");
    }
    if (has("JRPG")) {
      out.push("日式RPG", "anime RPG");
    }
    return Array.from(new Set(out));
  }

  /**
   * 仅当同时勾选「策略+回合制」时并入：专门扩大 Steam 商店关键词召回（与 fullExpanded 去重合并）。
   */
  strategyTurnBasedDiscoveryTerms(): string[] {
    return [
      "turn-based strategy",
      "turn based strategy",
      "turn-based tactics",
      "turn based tactics",
      "tactical RPG",
      "tactical",
      "hex grid",
      "hex-based",
      "grid-based",
      "wargame",
      "4X",
      "4x",
      "回合",
      "回合策略",
      "回合战术",
      "回合战棋",
      "战棋",
      "战略战棋",
      "战略角色扮演",
      "slg",
      "autobattler",
      "auto battler",
      "board game",
      "tabletop",
      "digital board",
      "roguelike tactics",
      "procedural tactics",
    ];
  }

  /**
   * 无输入时，始终用所有类型的并集扩展词 + 默认探索词。
   * 作用：保证每次搜索的候选池一致，切换筛选条件不会导致之前的结果消失。
   */
  fullExpandedSearchTerms(): string[] {
    const base: string[] = [
      "回合制",
      "回合",
      "回合策略",
      "turn-based",
      "turn based",
      "strategy",
      "strategic",
      "SRPG",
      "JRPG",
      "RPG",
      "战棋",
      "4X",
      "4x",
      "card",
      "card game",
      "deck",
      "deckbuilder",
      "deck building",
      "deck-building",
      "deckbuilding",
      "tactical RPG",
      "TBS",
      "TB",
      "CCG",
      "TCG",
      "棋类",
      "卡牌",
      "集换式卡牌",
      "集换式",
      "牌组构筑",
      "战略",
      "战略角色扮演",
      "tactics",
      "wargame",
      "grid tactics",
      "squad tactics",
      "grand strategy",
      "slg",
      "digital card",
      "trading card",
      "collectible card",
      "roguelike deck",
      "deckbuilding roguelike",
      "card battler",
      "board game",
      "tabletop",
    ];
    return Array.from(new Set(base));
  }

  /**
   * 多关键词分别搜索后按「轮询」合并：每个词都能贡献结果，避免排在前面的词占满 totalCap、
   * 导致 card/deck 等词完全进不了候选池（这正是「策略+卡牌+回合」只出几条的主因之一）。
   */
  async searchGamesFromTerms(
    terms: string[],
    perTermLimit: number,
    totalCap: number
  ): Promise<SteamGame[]> {
    if (terms.length === 0 || totalCap <= 0) return [];

    const CONCURRENCY = 10;
    const batches: SteamGame[][] = [];
    for (let i = 0; i < terms.length; i += CONCURRENCY) {
      const slice = terms.slice(i, i + CONCURRENCY);
      const part = await Promise.all(
        slice.map((t) => this.storeSearchOneTerm(t, perTermLimit))
      );
      batches.push(...part);
    }

    const indices = new Array(batches.length).fill(0);
    const seen = new Set<number>();
    const out: SteamGame[] = [];

    while (out.length < totalCap) {
      let addedRound = 0;
      for (let ti = 0; ti < batches.length; ti++) {
        const batch = batches[ti];
        while (indices[ti] < batch.length) {
          const g = batch[indices[ti]++];
          if (seen.has(g.appid)) continue;
          seen.add(g.appid);
          out.push(g);
          addedRound++;
          break;
        }
      }
      if (addedRound === 0) break;
    }

    return out;
  }

  /** 兼容旧调用：空格拆成多词分别搜，再合并。 */
  async searchGames(query: string, limit = 20): Promise<SteamGame[]> {
    const terms = query.trim().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];
    const perTerm = Math.max(10, Math.ceil((limit * 2) / terms.length));
    return this.searchGamesFromTerms(terms, perTerm, limit * 2);
  }

  async getGameReviews(appId: string): Promise<SteamReviewData | null> {
    try {
      const url = `https://store.steampowered.com/appreviews/${appId}?json=1&language=all&purchase_type=all`;
      const data = await this.fetchWithCache<{
        success: number;
        query_summary: {
          total_reviews: number;
          total_positive: number;
          total_negative: number;
          review_score: number;
          review_score_desc: string;
        };
      }>(url);

      if (data.success !== 1) {
        return null;
      }

      return {
        total_positive: data.query_summary.total_positive,
        total_negative: data.query_summary.total_negative,
        total_reviews: data.query_summary.total_reviews,
        review_score: data.query_summary.review_score,
        review_score_desc: data.query_summary.review_score_desc,
      };
    } catch (error) {
      console.error("Failed to fetch reviews:", error);
      return null;
    }
  }

  async getTopTurnBasedGames(limit = 50): Promise<SteamGame[]> {
    try {
      const url = `https://steamspy.com/api.php?request=top100in2&genre=turn-based`;
      const response = await this.fetchWithThrottle(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (!response.ok) throw new Error("SteamSpy unavailable");
      const data = await response.json();

      const games: SteamGame[] = [];
      const entries = Object.values(data as Record<string, { appid: number; name: string }>);
      for (const entry of entries.slice(0, limit)) {
        const detail = await this.getAppDetails(entry.appid.toString());
        if (detail) games.push(detail);
      }
      return games;
    } catch {
      return [];
    }
  }

  getGameScreenshots(appId: string, count = 6): string[] {
    return Array.from({ length: count }, (_, i) => 
      `https://steamcdn-a.akamaihd.net/steam/apps/${appId}/ss_${i + 1}.jpg`
    );
  }
}

export const steamService = new SteamService();