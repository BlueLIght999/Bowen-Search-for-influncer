---
id: content-type-detection-001
title: 视频内容类型自动分类与密度评估策略
type: script_structure
dimension: scriptQuality
category: 通用
tags: [内容分类, 信息密度, 类型识别, 评分权重, 访谈, 教程, 口播, Vlog]
source: adapted-from-AI-Youtube-Shorts-Generator
version: "1.0.0"
---

## 策略来源

适配自 AI-Youtube-Shorts-Generator 的 detect_content_type() 函数，
原项目用 LLM 对视频转录文本做分类以调整评分权重。

## 内容类型分类

| 类型 | 中文对应 | 识别特征 | 推荐评分权重 |
|---|---|---|---|
| podcast | 播客/对谈 | 双人对话、长段发言、无明确教程结构 | 冲突+金句优先 |
| interview | 访谈 | 问答结构、追问、个人故事 | 钩子+故事高潮优先 |
| tutorial | 教程/干货 | 步骤化、操作演示、"第一步...第二步..." | 实用价值优先 |
| lecture | 讲座/知识分享 | 单人讲授、理论框架、逻辑递进 | 揭示时刻+实用价值优先 |
| commentary | 评论/观点 | 立场鲜明、评价对象明确、有论据 | 观点炸弹+冲突优先 |
| debate | 辩论/对抗 | 正反方对立、反驳、交锋 | 冲突+观点炸弹优先 |
| vlog | 生活记录 | 第一人称、日常场景、非结构化 | 情绪峰值+故事高潮优先 |
| other | 其他 | 无法归入以上类型 | 均衡权重 |

## 信息密度评估

| 密度 | 特征 | 对评分的影响 |
|---|---|---|
| low | 大量寒暄、闲聊、重复内容 | 降低脚本优秀度基线 -10 |
| medium | 正常信息密度，有铺垫有干货 | 基线不变 |
| high | 信息密集、几乎没有废话、每句都有价值 | 提高脚本优秀度基线 +10 |

## 分类 Prompt 模板

```
分析以下视频转录文本样本，判断内容类型。
选择一个: podcast(播客), interview(访谈), tutorial(教程), lecture(讲座), commentary(评论), debate(辩论), vlog(生活记录), other(其他)。
同时评估信息密度: low(低-大量填充闲聊), medium(中), high(高-信息密集)。
只返回 JSON: {"content_type": "...", "density": "..."}
```

## 适用场景

- 分析视频前先分类，再按类型选择评分权重
- 访谈视频蒸馏时，根据类型调整蒸馏 prompt 的侧重点
- 对教程类视频增加"实用价值"维度权重
- 对评论类视频增加"观点炸弹"维度权重
