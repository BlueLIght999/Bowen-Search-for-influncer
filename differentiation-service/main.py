"""
博闻差异化分析微服务

封装两个 P0 算法框架：
  1. sentence-transformers — 语义嵌入计算角度独特性（uniquenessScore）
  2. BERTopic              — 主题聚类计算竞争密度（competitionScore）

启动方式：
  pip install -r requirements.txt
  uvicorn main:app --host 0.0.0.0 --port 8766

环境变量：
  DIFFERENTIATION_MODEL  — 可选，指定 sentence-transformers 模型名（默认 paraphrase-multilingual-MiniLM-L12-v2）
"""

from __future__ import annotations

import os
import logging
from typing import Optional

import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel

logger = logging.getLogger("differentiation-service")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Bowen Differentiation Service", version="0.2.0")

# ---------------------------------------------------------------------------
# ChromaDB 懒加载（向量存储）
# ---------------------------------------------------------------------------

_chroma_client = None
_collections: dict[str, object] = {}

CHROMA_PATH = os.getenv("BOWEN_CHROMA_PATH", os.path.join(os.path.dirname(__file__), "chroma_data"))


def get_chroma_client():
    global _chroma_client
    if _chroma_client is None:
        import chromadb
        logger.info("Initializing ChromaDB at %s", CHROMA_PATH)
        _chroma_client = chromadb.PersistentClient(path=CHROMA_PATH)
        logger.info("ChromaDB initialized.")
    return _chroma_client


def get_or_create_collection(name: str = "bowen-knowledge"):
    if name not in _collections:
        client = get_chroma_client()
        model = get_sentence_model()
        _collections[name] = client.get_or_create_collection(
            name=name,
            metadata={"hnsw:space": "cosine"}
        )
        # 存储当前维度信息
        _collections[f"{name}__dimension"] = model.get_sentence_embedding_dimension() if hasattr(model, "get_sentence_embedding_dimension") else 384
    return _collections[name]


def get_collection_dimension(name: str = "bowen-knowledge") -> int:
    return _collections.get(f"{name}__dimension", 384)

# ---------------------------------------------------------------------------
# 模型懒加载（首次请求时才加载，避免启动卡住）
# ---------------------------------------------------------------------------

_st_model = None
_bertopic_model = None

MODEL_NAME = os.getenv("DIFFERENTIATION_MODEL", "paraphrase-multilingual-MiniLM-L12-v2")


def get_sentence_model():
    global _st_model
    if _st_model is None:
        from sentence_transformers import SentenceTransformer
        logger.info("Loading sentence-transformers model: %s", MODEL_NAME)
        _st_model = SentenceTransformer(MODEL_NAME)
        logger.info("Model loaded.")
    return _st_model


# ---------------------------------------------------------------------------
# 请求/响应模型
# ---------------------------------------------------------------------------

class UniquenessRequest(BaseModel):
    """角度独特性评分请求"""
    candidateAngles: list[str]       # 候选选题角度（3 个差异化方向）
    referenceTexts: list[str] = []   # 已有爆款标题/描述（参照池）


class UniquenessResponse(BaseModel):
    scores: list[float]              # 每个候选角度的独特性评分 0-100
    source: str                      # "sentence-transformers" | "fallback"


class CompetitionRequest(BaseModel):
    """竞争密度评分请求"""
    query: str                       # 候选选题角度
    corpus: list[str]                # 同品类已有内容标题/描述列表


class CompetitionResponse(BaseModel):
    score: float                     # 竞争密度 0-100（越高越拥挤）
    topicId: int                     # 所属主题簇 ID（-1 表示噪声点）
    topicSize: int                   # 该主题簇的样本数
    corpusSize: int                  # 语料库总数
    source: str


class AnalyzeRequest(BaseModel):
    """综合差异化分析请求（上传视频后一步到位）"""
    transcript: str                  # 用户上传视频的转写文本或粘贴文案
    title: str = ""                  # 视频标题
    category: str = ""               # 品类
    hotspot: str = ""                # 热点
    candidateAngles: list[str] = []  # 候选角度（如为空则服务端自动生成）
    referenceTexts: list[str] = []   # 同品类参照池


class DirectionResult(BaseModel):
    title: str
    angle: str
    uniquenessScore: float
    competitionScore: float
    explosionStrategy: str
    filmingAdvice: str
    outline: list[str]


class AnalyzeResponse(BaseModel):
    summary: str
    hookPattern: str
    emotionalTrigger: str
    collectibleMoment: str
    directions: list[DirectionResult]
    source: str


# ---------------------------------------------------------------------------
# 端点 1：角度独特性评分（sentence-transformers）
# ---------------------------------------------------------------------------

@app.post("/uniqueness", response_model=UniquenessResponse)
def uniqueness(req: UniquenessRequest) -> UniquenessResponse:
    if not req.candidateAngles:
        return UniquenessResponse(scores=[], source="fallback")

    try:
        model = get_sentence_model()
        cand_emb = model.encode(req.candidateAngles, normalize_embeddings=True)

        if req.referenceTexts:
            ref_emb = model.encode(req.referenceTexts, normalize_embeddings=True)
            # 每个候选 vs 所有参照的最大余弦相似度 → 独特性 = 1 - max_sim
            sim_matrix = np.dot(cand_emb, ref_emb.T)
            max_sims = sim_matrix.max(axis=1)
            scores = [round(float(1 - s) * 100, 1) for s in max_sims]
        else:
            # 无参照池时，用候选之间的相互相似度惩罚（越雷同分越低）
            if len(cand_emb) > 1:
                pair_sim = np.dot(cand_emb, cand_emb.T)
                np.fill_diagonal(pair_sim, 0)
                avg_sim = pair_sim.mean(axis=1)
                scores = [round(float(1 - s) * 100, 1) for s in avg_sim]
            else:
                scores = [50.0] * len(req.candidateAngles)

        return UniquenessResponse(scores=scores, source="sentence-transformers")
    except Exception as e:
        logger.warning("uniqueness fallback: %s", e)
        # 回退：均匀分布的启发式评分
        base = 80.0
        step = 5.0
        scores = [round(max(30, base - i * step), 1) for i in range(len(req.candidateAngles))]
        return UniquenessResponse(scores=scores, source="fallback")


# ---------------------------------------------------------------------------
# 端点 2：竞争密度评分（BERTopic 主题聚类）
# ---------------------------------------------------------------------------

@app.post("/competition", response_model=CompetitionResponse)
def competition(req: CompetitionRequest) -> CompetitionResponse:
    corpus_size = len(req.corpus)

    if corpus_size < 3:
        # 语料太少无法聚类，用 TF-IDF 相似度回退
        try:
            model = get_sentence_model()
            all_texts = req.corpus + [req.query]
            embeddings = model.encode(all_texts, normalize_embeddings=True)
            query_emb = embeddings[-1:]
            corpus_emb = embeddings[:-1]
            sims = np.dot(query_emb, corpus_emb.T)[0]
            avg_sim = float(sims.mean())
            score = round(avg_sim * 100, 1)
            return CompetitionResponse(score=score, topicId=-1, topicSize=corpus_size, corpusSize=corpus_size, source="embedding-fallback")
        except Exception as e:
            logger.warning("competition fallback: %s", e)
            return CompetitionResponse(score=50.0, topicId=-1, topicSize=0, corpusSize=corpus_size, source="fallback")

    try:
        from bertopic import BERTopic
        from hdbscan import HDBSCAN
        from umap import UMAP

        # 用 sentence-transformers 嵌入 + HDBSCAN 聚类（BERTopic 核心流程）
        model = get_sentence_model()
        embeddings = model.encode(req.corpus, normalize_embeddings=True)

        # 小语料时降低 HDBSCAN 最小簇大小
        min_cluster_size = max(2, corpus_size // 5)
        hdbscan_model = HDBSCAN(min_cluster_size=min_cluster_size, prediction_data=True)
        umap_model = UMAP(n_neighbors=min(5, corpus_size - 1), n_components=2, metric="cosine")

        topic_model = BERTopic(
            embedding_model=model,
            hdbscan_model=hdbscan_model,
            umap_model=umap_model,
            language="chinese",
            calculate_probabilities=True,
        )
        topics, _ = topic_model.fit_transform(req.corpus, embeddings=embeddings)

        # 将 query 分配到最近的簇
        query_emb = model.encode([req.query], normalize_embeddings=True)
        query_topic, _ = topic_model.transform([req.query], embeddings=query_emb)
        query_topic_id = int(query_topic[0])

        # 计算竞争密度：query 所在簇的大小 / 总语料
        topic_sizes = {}
        for t in topics:
            topic_sizes[t] = topic_sizes.get(t, 0) + 1

        topic_size = topic_sizes.get(query_topic_id, 0)
        density = round(topic_size / corpus_size * 100, 1) if corpus_size > 0 else 50.0

        return CompetitionResponse(
            score=density,
            topicId=query_topic_id,
            topicSize=topic_size,
            corpusSize=corpus_size,
            source="bertopic",
        )
    except Exception as e:
        logger.warning("competition bertopic fallback: %s", e)
        # 回退：用 embedding 平均相似度
        try:
            model = get_sentence_model()
            all_texts = req.corpus + [req.query]
            embeddings = model.encode(all_texts, normalize_embeddings=True)
            query_emb = embeddings[-1:]
            corpus_emb = embeddings[:-1]
            sims = np.dot(query_emb, corpus_emb.T)[0]
            avg_sim = float(sims.mean())
            score = round(avg_sim * 100, 1)
            return CompetitionResponse(score=score, topicId=-1, topicSize=0, corpusSize=corpus_size, source="embedding-fallback")
        except Exception:
            return CompetitionResponse(score=50.0, topicId=-1, topicSize=0, corpusSize=corpus_size, source="fallback")


# ---------------------------------------------------------------------------
# 端点 3：综合分析（上传视频 → 差异化制作途径）
# ---------------------------------------------------------------------------

# 四种差异化策略模板
STRATEGIES = [
    {
        "key": "opposite-turn",
        "title_tpl": "别急着追{hotspot}，先看它让谁吃亏",
        "angle": "对立翻转：从机会叙事转向代价和误判",
        "explosion": "用反常识开头制造停留，用代价清单制造收藏。",
        "filming": "半身口播，左侧放热点关键词，右侧逐条弹出误区。",
        "outline": ["开头：一句反常识判断", "解释：为什么大众叙事只讲了一半", "案例：普通用户最容易踩的坑", "收束：3条判断标准"],
    },
    {
        "key": "audience-drilldown",
        "title_tpl": "{category}受众最该关心的不是工具，而是判断标准",
        "angle": "人群下钻：把热点翻译成目标用户的具体处境",
        "explosion": "让用户产生被点名感，降低泛热点同质化。",
        "filming": "桌面场景 + 屏幕录制，展示一个真实使用路径。",
        "outline": ["开头：点名目标用户", "问题：他们为什么会被热点误导", "演示：一个低成本判断流程", "结尾：给出可复制模板"],
    },
    {
        "key": "dimension-shift",
        "title_tpl": "用{hotspot}做一期收藏型清单",
        "angle": "维度升降：从观点争论降到方法清单",
        "explosion": "用清单结构提高保存动机，把评论问题变成下一期选题。",
        "filming": "正面口播 + 大字卡，每条清单控制在12字以内。",
        "outline": ["开头：承诺给出一张判断清单", "清单1：何时值得用", "清单2：何时必须交叉验证", "清单3：怎么避免信息误判", "评论引导：让用户留言自己的使用场景"],
    },
]


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    transcript_text = req.transcript or req.title or ""

    # 1. 生成候选角度
    candidates = req.candidateAngles
    if not candidates:
        candidates = [s["angle"] for s in STRATEGIES]

    # 2. 调独特性评分
    uniq_resp = uniqueness(UniquenessRequest(
        candidateAngles=candidates,
        referenceTexts=req.referenceTexts,
    ))

    # 3. 逐个角度调竞争密度
    directions: list[DirectionResult] = []
    for i, strategy in enumerate(STRATEGIES):
        title = strategy["title_tpl"].format(hotspot=req.hotspot or "热点", category=req.category or "目标")
        angle = strategy["angle"]

        comp_resp = competition(CompetitionRequest(
            query=angle,
            corpus=req.referenceTexts if req.referenceTexts else [req.title, transcript_text],
        ))

        directions.append(DirectionResult(
            title=title,
            angle=angle,
            uniquenessScore=uniq_resp.scores[i] if i < len(uniq_resp.scores) else 70.0,
            competitionScore=comp_resp.score,
            explosionStrategy=strategy["explosion"],
            filmingAdvice=strategy["filming"],
            outline=strategy["outline"],
        ))

    # 4. 简单文案分析
    has_question = "怎么" in transcript_text or "如何" in transcript_text
    has_contrast = "对比" in transcript_text or "替代" in transcript_text

    return AnalyzeResponse(
        summary=f"基于「{req.category}」品类和上传视频内容，博闻通过语义嵌入和主题聚类计算出 {len(directions)} 个差异化制作方向。",
        hookPattern="反常识/替代关系开头：先打破用户原有判断" if has_contrast else "问题压迫式开头：先指出用户正在遇到的困惑",
        emotionalTrigger="不确定感：用户担心自己跟不上变化，需要明确判断标准" if has_question else "机会感：用户希望找到更早、更省力的行动方式",
        collectibleMoment="收藏触发点放在结尾：给出3条判断标准或工具清单",
        directions=directions,
        source=uniq_resp.source,
    )


# ---------------------------------------------------------------------------
# 端点 4：文本嵌入（/embed）— 供 TypeScript EmbeddingPort 调用
# ---------------------------------------------------------------------------

class EmbedRequest(BaseModel):
    texts: list[str]


class EmbedResponse(BaseModel):
    vectors: list[list[float]]
    model: str
    dimension: int
    source: str


@app.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest) -> EmbedResponse:
    if not req.texts:
        return EmbedResponse(vectors=[], model=MODEL_NAME, dimension=384, source="empty")

    try:
        model = get_sentence_model()
        embeddings = model.encode(req.texts, normalize_embeddings=True)
        dim = embeddings.shape[1] if len(embeddings.shape) > 1 else 384
        vectors = embeddings.tolist() if hasattr(embeddings, "tolist") else [[float(x) for x in row] for row in embeddings]
        return EmbedResponse(
            vectors=vectors,
            model=MODEL_NAME,
            dimension=dim,
            source="sentence-transformers"
        )
    except Exception as e:
        logger.warning("embed fallback: %s", e)
        return EmbedResponse(vectors=[], model=MODEL_NAME, dimension=384, source="fallback")


# ---------------------------------------------------------------------------
# 端点 5-8：向量存储操作（/vector/*）— 供 TypeScript VectorStorePort 调用
# ---------------------------------------------------------------------------

class VectorEntryInput(BaseModel):
    id: str
    text: str
    metadata: dict = {}


class UpsertRequest(BaseModel):
    collection: str = "bowen-knowledge"
    entries: list[VectorEntryInput]


class UpsertResponse(BaseModel):
    upserted: int
    collection: str


class QueryRequest(BaseModel):
    collection: str = "bowen-knowledge"
    queryText: str
    topK: int = 5
    filter: Optional[dict] = None


class QueryResultItem(BaseModel):
    id: str
    score: float
    metadata: dict


class QueryResponse(BaseModel):
    results: list[QueryResultItem]


class DeleteRequest(BaseModel):
    collection: str = "bowen-knowledge"
    ids: list[str]


class DeleteResponse(BaseModel):
    deleted: int


@app.post("/vector/upsert", response_model=UpsertResponse)
def vector_upsert(req: UpsertRequest) -> UpsertResponse:
    if not req.entries:
        return UpsertResponse(upserted=0, collection=req.collection)

    try:
        collection = get_or_create_collection(req.collection)
        model = get_sentence_model()

        texts = [entry.text for entry in req.entries]
        embeddings = model.encode(texts, normalize_embeddings=True)
        embeddings_list = embeddings.tolist() if hasattr(embeddings, "tolist") else [[float(x) for x in row] for row in embeddings]

        ids = [entry.id for entry in req.entries]
        metadatas = [entry.metadata for entry in req.entries]

        collection.upsert(
            ids=ids,
            embeddings=embeddings_list,
            documents=texts,
            metadatas=metadatas
        )

        return UpsertResponse(upserted=len(req.entries), collection=req.collection)
    except Exception as e:
        logger.warning("vector upsert fallback: %s", e)
        return UpsertResponse(upserted=0, collection=req.collection)


@app.post("/vector/query", response_model=QueryResponse)
def vector_query(req: QueryRequest) -> QueryResponse:
    try:
        collection = get_or_create_collection(req.collection)
        model = get_sentence_model()

        query_emb = model.encode([req.queryText], normalize_embeddings=True)
        query_list = query_emb[0].tolist() if hasattr(query_emb[0], "tolist") else [float(x) for x in query_emb[0]]

        where_filter = None
        if req.filter:
            where_filter = {k: v for k, v in req.filter.items() if v is not None}

        results = collection.query(
            query_embeddings=[query_list],
            n_results=req.topK,
            where=where_filter
        )

        items: list[QueryResultItem] = []
        if results and results.get("ids"):
            ids = results["ids"][0]
            distances = results.get("distances", [[]])[0]
            metadatas = results.get("metadatas", [[]])[0]

            for i, entry_id in enumerate(ids):
                dist = distances[i] if i < len(distances) else 1.0
                # ChromaDB cosine distance: 0=identical, 2=opposite → 转换为相似度分数 0-1
                score = max(0.0, 1.0 - float(dist) / 2.0)
                meta = metadatas[i] if i < len(metadatas) else {}
                items.append(QueryResultItem(id=entry_id, score=round(score, 4), metadata=meta))

        return QueryResponse(results=items)
    except Exception as e:
        logger.warning("vector query fallback: %s", e)
        return QueryResponse(results=[])


@app.post("/vector/delete", response_model=DeleteResponse)
def vector_delete(req: DeleteRequest) -> DeleteResponse:
    if not req.ids:
        return DeleteResponse(deleted=0)

    try:
        collection = get_or_create_collection(req.collection)
        collection.delete(ids=req.ids)
        return DeleteResponse(deleted=len(req.ids))
    except Exception as e:
        logger.warning("vector delete fallback: %s", e)
        return DeleteResponse(deleted=0)


@app.get("/vector/health")
def vector_health(collection: str = "bowen-knowledge"):
    try:
        col = get_or_create_collection(collection)
        count = col.count()
        dim = get_collection_dimension(collection)
        return {"status": "ok", "collection": collection, "count": count, "dimension": dim}
    except Exception as e:
        logger.warning("vector health fallback: %s", e)
        return {"status": "unavailable", "collection": collection, "count": 0, "dimension": 0}


# ---------------------------------------------------------------------------
# 健康检查
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_NAME}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8766)
