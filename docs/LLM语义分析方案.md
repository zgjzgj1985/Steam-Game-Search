# 方案：增加 LLM 语义分析作为宝可梦Like最终判定层

## 当前状态

### 第一阶段：初筛流程完善（已完成）

在引入 LLM 语义分析之前，首先完善了初筛流程以确保数据完整性：

**已完成的工作：**

1. **补充缺失的标签关键词** - `src/config/pokemonLikeKeywords.json`
   - 新增标签：`Monster Breeder`, `Monster Raising`, `Creature Raising`, `Monster Ranching`, `Summoner`, `Summoning`
   - 新增描述关键词：`monster ranching`, `creature raising`, `raise your monsters`, `hatch and grow` 等

2. **扩展描述检测范围** - `src/app/api/mode2/filter/route.ts`
   - 将检测范围从 `short_description` 扩展到 `short_description + detailed_description`

3. **统一 CORE_TAGS 配置**
   - 将 CORE_TAGS 与 POKEMON_LIKE_TAGS 保持同步
   - 确保权重计算准确性

4. **添加单元测试验证**
   - 新增 9 个测试用例验证新标签的匹配逻辑
   - 所有 17 个测试通过

---

## 问题背景

当前流程只使用规则匹配来判断宝可梦Like：

```
标签/描述 → 关键词匹配 → 判定（可能误判）
```

典型误判案例：
- "gogh: Focus with Your Avatar" - 虚拟头像/工作空间游戏，被错误标记为宝可梦Like
- 其他"头像收集"、"物品收集"类游戏可能被"Creature Collector"等标签误判

## 解决方案

增加 LLM 语义分析作为**最终判定层**：

```
规则匹配(粗筛) → 候选游戏列表 → LLM 语义分析(精判) → 最终判定
```

### 优势
- 规则匹配快速过滤明显不相关的游戏
- LLM 分析确保高准确率，识别"生物收集"和"头像收集"的本质区别
- 利用现有 LLM 基础设施，改动成本低

### 挑战
- API 调用成本（但只对规则匹配命中的游戏调用，减少调用量）
- 预计算时需要额外处理

---

## 实施方案

### 方案 A：预计算时调用 LLM（推荐）

在预计算脚本 `scripts/precompute.py` 中，对规则匹配命中的游戏调用 LLM 进行二次确认。

**优点**：
- 查询时无额外延迟
- 结果可缓存

**缺点**：
- 预计算时间增加
- 需要 LLM API Key

### 方案 B：运行时按需调用

在 API 中对规则匹配命中的游戏调用 LLM，使用缓存。

**优点**：
- 实时性更强
- 可以动态调整判断标准

**缺点**：
- 首次查询有延迟
- API 响应时间不稳定

### 方案 C：混合方案（最佳）

1. 预计算时调用 LLM 生成"宝可梦Like置信度"分数
2. 运行时使用缓存结果，支持动态阈值调整

---

## 实现步骤（方案 C）

### 1. 新增 LLM 宝可梦Like判断 Prompt

在 `src/lib/llm.ts` 中添加新的 Prompt：

```typescript
pokemonLikeCheck: {
  system: `你是宝可梦Like游戏判断专家。请根据游戏信息判断它是否属于"宝可梦Like"游戏。

【宝可梦Like定义】
宝可梦Like游戏必须同时满足以下特征：
1. 有可收集的生物/怪物（不是物品、不是头像、不是装饰）
2. 有战斗/对战系统（不是纯粹的聊天或效率工具）
3. 生物有成长机制（进化、技能学习等）

【排除场景】
- 虚拟形象/头像定制工具
- 纯粹的效率工具/自律应用
- 物品/道具收集（不是生物）
- 聊天机器人/陪伴工具

【输出格式】
必须输出合法JSON：
{
  "isPokemonLike": true/false,
  "confidence": "high/medium/low",
  "reasoning": "判断理由（50-100字）",
  "keyIndicators": ["关键指标1", "关键指标2"]
}`,
  userTemplate: `游戏信息：
名称：{name}
标签：{tags}
描述：{description}
类型：{genres}

请判断这是否是宝可梦Like游戏。`,
}
```

### 2. 修改预计算脚本

在 `scripts/precompute.py` 中，对规则匹配命中的游戏调用 LLM：

```python
def check_pokemon_like_with_llm(game_data):
    """使用 LLM 二次确认宝可梦Like判断"""
    # 调用 LLM API
    # 返回置信度和判断理由
    pass

def precompute_game_pool():
    # 规则匹配
    is_pokemon_like = check_pokemon_like_rules(game_data)
    
    # 如果规则匹配命中，进行 LLM 二次确认
    if is_pokemon_like:
        llm_result = check_pokemon_like_with_llm(game_data)
        # 使用 LLM 结果覆盖规则匹配结果
        is_pokemon_like = llm_result["isPokemonLike"]
        confidence = llm_result["confidence"]
    else:
        confidence = "high"  # 规则匹配未命中，高置信度排除
```

### 3. 修改数据库结构

在 SQLite 中新增字段：

```sql
ALTER TABLE games_cache ADD COLUMN llm_pokemon_like_confidence TEXT;
ALTER TABLE games_cache ADD COLUMN llm_pokemon_like_reasoning TEXT;
```

### 4. 修改 API 逻辑

```typescript
// 在 rowToGameRecord 中使用预计算的 LLM 结果
isPokemonLike: row.is_pokemon_like === 1 
    && row.llm_pokemon_like_confidence !== "low",  // 排除低置信度
```

---

## 实施优先级

1. **P0**：新增 LLM Prompt（1-2小时）
2. **P1**：修改预计算脚本，集成 LLM 调用（2-3小时）
3. **P2**：修改数据库结构（1小时）
4. **P3**：修改 API 逻辑（1小时）

---

## 成本估算

假设：
- 规则匹配命中约 5% 的游戏
- 总游戏数约 100,000
- 需调用 LLM 的游戏约 5,000

使用 GPT-4o-mini：
- 每次调用约 500 tokens
- 成本约 $0.0005
- 总成本约 $2.5

成本可接受。
