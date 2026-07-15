from __future__ import annotations

import sys
import unittest
from types import ModuleType
from unittest.mock import patch

import app


class PaddleOcrServiceTest(unittest.TestCase):
    def tearDown(self) -> None:
        app._ocr_engine = None

    def test_windows_safe_engine_defaults_disable_mkldnn(self) -> None:
        captured: dict[str, object] = {}

        class FakePaddleOCR:
            def __init__(self, **kwargs: object) -> None:
                captured.update(kwargs)

        fake_module = ModuleType("paddleocr")
        fake_module.PaddleOCR = FakePaddleOCR  # type: ignore[attr-defined]

        with patch.dict(sys.modules, {"paddleocr": fake_module}):
            app.get_ocr_engine()

        self.assertEqual(captured["engine"], "paddle_static")
        self.assertFalse(captured["enable_mkldnn"])

    def test_v3_results_are_converted_to_text_and_confidence(self) -> None:
        result = {
            "res": {
                "rec_texts": ["身份反转", "下一集揭晓"],
                "rec_scores": [0.97, 0.88],
            }
        }

        self.assertEqual(
            app.parse_v3_results([result]),
            [("身份反转", 0.97), ("下一集揭晓", 0.88)],
        )


if __name__ == "__main__":
    unittest.main()
