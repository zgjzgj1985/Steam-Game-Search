# 开发规范 - 中文简体优先

## 目标

本项目所有输出、注释、代码、文档必须使用**简体中文**（简体中文）。

## 具体要求

### 1. 代码注释与文档
- 所有代码注释必须使用简体中文
- README、文档、issue 说明必须使用简体中文
- 变量、函数、组件命名使用英文（符合项目惯例）

### 2. AI 思考过程
- 分析问题时必须使用简体中文思考
- 解释技术决策时必须使用简体中文
- 描述 bug 原因时必须使用简体中文

### 3. 用户交互输出
- 命令行输出必须使用简体中文
- 错误信息提示必须使用简体中文
- 提示信息必须使用简体中文

### 4. 提交信息（git commit message）
- 使用简体中文编写提交信息
- 格式建议：`[类型] 简短描述`

### 5. 示例

**正确示例：**
```
// 计算游戏评分，权重基于投票数量
function calculateWeightedScore(rawScore: number, votes: number): number {
  const weight = Math.log(votes + 1);
  return rawScore * weight;
}
```

**错误示例：**
```javascript
// Calculate the weighted score based on votes
function calculateScore(rawScore, votes) {
  // Use logarithmic weighting
  return rawScore * Math.log(votes + 1);
}
```

## 遵循原则

1. **语言一致性**：全程使用简体中文，保持语言风格统一
2. **清晰表达**：用简洁的中文描述技术概念
3. **避免混用**：不混用繁體中文、英文或其他语言