# 博闻差异化分析微服务

封装两个 P0 开源算法框架，为博闻 MVP 提供真实差异化评分能力。

## 算法

| 框架 | 用途 | 端点 |
|------|------|------|
| **sentence-transformers** | 角度独特性评分（语义嵌入 + 余弦相似度） | `POST /uniqueness` |
| **BERTopic** | 竞争密度评分（主题聚类 + 簇密度） | `POST /competition` |
| 综合 | 上传视频 → 一步到位差异化分析 | `POST /analyze` |

## 启动

```bash
cd differentiation-service
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8766
```

首次启动会自动下载 `paraphrase-multilingual-MiniLM-L12-v2` 模型（~120MB），支持中文。

环境变量 `DIFFERENTIATION_MODEL` 可替换为更大的多语言模型。

## 端点示例

### POST /uniqueness

```json
{
  "candidateAngles": ["对立翻转：从机会叙事转向代价", "人群下钻：把热点翻译成具体处境"],
  "referenceTexts": ["AI搜索正在替代传统搜索", "普通人如何用AI工具提效"]
}
```

### POST /competition

```json
{
  "query": "对立翻转：从机会叙事转向代价",
  "corpus": ["标题1", "标题2", "..."]
}
```

### POST /analyze

```json
{
  "transcript": "视频转写文本...",
  "title": "视频标题",
  "category": "AI科技",
  "hotspot": "AI搜索",
  "referenceTexts": ["同品类爆款标题1", "标题2"]
}
```

## 回退机制

当模型加载失败或语料不足时，服务会自动降级：
- `/uniqueness` → 启发式均匀评分
- `/competition` → embedding 平均相似度 → 固定 50 分
- `/analyze` → 综合以上回退

博闻主应用也有 `LocalDifferentiationClient` 作为双重保险。
