---
id: differentiation-criteria-001
title: 选题角度重合度判定
type: hook_strategy
dimension: differentiation
category: 通用
tags: [差异化, 选题, 重合度, 同质化, 竞争密度]
source: local-markdown
version: "1.0.0"
---

## 判定标准

- 搜索同品类 Top 20 内容标题，计算与候选角度的关键词重合度
- 重合度 < 30%：差异化高（uniquenessScore 80+）
- 重合度 30-60%：差异化中（uniquenessScore 50-70）
- 重合度 > 60%：差异化低（uniquenessScore < 40），需换角度
- 可识别差异的最小阈值：至少存在 1 个竞品完全没有覆盖的子话题

## 正例

品类"AI工具评测"下 20 个标题都讲"怎么用"，候选角度"怎么判断AI在骗你"重合度仅 15%，差异化高

## 反例

候选角度"AI工具推荐"与已有 16 个标题重合度 80%，差异化极低

## 评分映射

- uniquenessScore >= 80：differentiation +20
- uniquenessScore 50-79：differentiation +10
- uniquenessScore < 50：differentiation -15
- 竞争密度 > 70%：differentiation 额外 -10

## 适用场景

- 选题阶段：在生成候选方向后做重合度检查
- 评估阶段：对已完成内容评估其差异化程度
- 对标分析：与竞品做差异点提取
