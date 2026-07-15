"""
博闻差异化服务 — 向量端点测试

测试 /embed, /vector/upsert, /vector/query, /vector/delete, /vector/health 端点。
使用 FastAPI TestClient，不需要启动真实服务。

运行方式：
  cd differentiation-service
  python -m pytest test_vector_endpoints.py -v
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock


@pytest.fixture
def client():
    """创建测试客户端，mock 掉模型加载"""
    with patch("main.get_sentence_model") as mock_model:
        mock_model.return_value = MagicMock()
        from main import app
        with TestClient(app) as c:
            yield c


@pytest.fixture
def client_with_model():
    """创建带 mock embedding 模型的测试客户端"""
    import numpy as np

    mock_model = MagicMock()
    mock_model.encode = MagicMock(side_effect=lambda texts, **kwargs: np.array([[0.1, 0.2, 0.3]] * len(texts)))

    with patch("main.get_sentence_model", return_value=mock_model):
        from main import app
        with TestClient(app) as c:
            yield c, mock_model


class TestEmbedEndpoint:
    """P0-#4: /embed 端点"""

    def test_embed_returns_vectors_for_input_texts(self, client_with_model):
        client, mock_model = client_with_model

        response = client.post("/embed", json={
            "texts": ["第一段文本", "第二段文本", "第三段文本"]
        })

        assert response.status_code == 200
        data = response.json()
        assert "vectors" in data
        assert "model" in data
        assert "dimension" in data
        assert len(data["vectors"]) == 3
        assert len(data["vectors"][0]) == 3

    def test_embed_empty_input_returns_empty_vectors(self, client_with_model):
        client, _ = client_with_model

        response = client.post("/embed", json={"texts": []})

        assert response.status_code == 200
        assert response.json()["vectors"] == []

    def test_embed_single_text_returns_single_vector(self, client_with_model):
        client, _ = client_with_model

        response = client.post("/embed", json={"texts": ["测试查询"]})

        assert response.status_code == 200
        data = response.json()
        assert len(data["vectors"]) == 1
        assert len(data["vectors"][0]) == 3

    def test_embed_returns_model_name_and_dimension(self, client_with_model):
        client, _ = client_with_model

        response = client.post("/embed", json={"texts": ["测试"]})

        assert response.status_code == 200
        data = response.json()
        assert data["model"] is not None
        assert data["dimension"] > 0

    def test_embed_model_failure_returns_fallback(self, client):
        """模型加载失败时返回 fallback 空向量"""
        with patch("main.get_sentence_model", side_effect=Exception("model unavailable")):
            response = client.post("/embed", json={"texts": ["测试"]})

            assert response.status_code == 200
            data = response.json()
            assert data["vectors"] == []
            assert data["source"] == "fallback"


class TestVectorUpsertEndpoint:
    """P0-#5: /vector/upsert 端点"""

    def test_upsert_stores_entries_and_returns_count(self, client_with_model):
        client, _ = client_with_model

        response = client.post("/vector/upsert", json={
            "collection": "bowen-knowledge",
            "entries": [
                {
                    "id": "hook-001",
                    "text": "反常识开头钩子策略",
                    "metadata": {
                        "title": "反常识开头",
                        "category": "通用",
                        "type": "hook_strategy"
                    }
                },
                {
                    "id": "script-001",
                    "text": "三段式递进脚本结构",
                    "metadata": {
                        "title": "三段式递进",
                        "category": "通用",
                        "type": "script_structure"
                    }
                }
            ]
        })

        assert response.status_code == 200
        data = response.json()
        assert data["upserted"] == 2
        assert data["collection"] == "bowen-knowledge"

    def test_upsert_empty_entries_returns_zero(self, client_with_model):
        client, _ = client_with_model

        response = client.post("/vector/upsert", json={
            "collection": "bowen-knowledge",
            "entries": []
        })

        assert response.status_code == 200
        assert response.json()["upserted"] == 0


class TestVectorQueryEndpoint:
    """P0-#5: /vector/query 端点"""

    def test_query_returns_results_with_id_score_metadata(self, client_with_model):
        client, _ = client_with_model

        # 先写入数据
        client.post("/vector/upsert", json={
            "collection": "bowen-knowledge",
            "entries": [
                {
                    "id": "hook-001",
                    "text": "反常识开头钩子",
                    "metadata": {"title": "反常识", "category": "通用", "type": "hook_strategy"}
                }
            ]
        })

        # 查询
        response = client.post("/vector/query", json={
            "collection": "bowen-knowledge",
            "queryText": "开场钩子策略",
            "topK": 5
        })

        assert response.status_code == 200
        data = response.json()
        assert "results" in data
        assert len(data["results"]) <= 5
        if len(data["results"]) > 0:
            result = data["results"][0]
            assert "id" in result
            assert "score" in result
            assert "metadata" in result

    def test_query_with_filter_by_dimension(self, client_with_model):
        client, _ = client_with_model

        client.post("/vector/upsert", json={
            "collection": "bowen-knowledge",
            "entries": [
                {
                    "id": "hook-001",
                    "text": "反常识开头钩子",
                    "metadata": {
                        "title": "反常识",
                        "category": "通用",
                        "type": "hook_strategy",
                        "dimension": "hookStrength"
                    }
                },
                {
                    "id": "script-001",
                    "text": "脚本结构",
                    "metadata": {
                        "title": "脚本",
                        "category": "通用",
                        "type": "script_structure",
                        "dimension": "scriptQuality"
                    }
                }
            ]
        })

        response = client.post("/vector/query", json={
            "collection": "bowen-knowledge",
            "queryText": "开头钩子",
            "topK": 5,
            "filter": {"dimension": "hookStrength"}
        })

        assert response.status_code == 200
        data = response.json()
        for result in data["results"]:
            assert result["metadata"].get("dimension") == "hookStrength"

    def test_query_empty_collection_returns_empty_results(self, client_with_model):
        client, _ = client_with_model

        response = client.post("/vector/query", json={
            "collection": "empty-collection",
            "queryText": "测试",
            "topK": 5
        })

        assert response.status_code == 200
        assert response.json()["results"] == []


class TestVectorDeleteEndpoint:
    """P0-#5: /vector/delete 端点"""

    def test_delete_removes_entries_by_id(self, client_with_model):
        client, _ = client_with_model

        # 写入
        client.post("/vector/upsert", json={
            "collection": "bowen-knowledge",
            "entries": [
                {"id": "del-001", "text": "待删除", "metadata": {"title": "del", "category": "通用", "type": "hook_strategy"}}
            ]
        })

        # 删除
        response = client.post("/vector/delete", json={
            "collection": "bowen-knowledge",
            "ids": ["del-001"]
        })

        assert response.status_code == 200
        assert response.json()["deleted"] == 1


class TestVectorHealthEndpoint:
    """P0-#5: /vector/health 端点"""

    def test_health_returns_collection_info(self, client_with_model):
        client, _ = client_with_model

        response = client.get("/vector/health?collection=bowen-knowledge")

        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert "count" in data
        assert "dimension" in data
