"""python3 eval/test/test_models.py"""

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "eval"))
import models  # noqa: E402


class ModelsTest(unittest.TestCase):
    def test_every_listed_model_is_valid(self):
        for model in json.loads(models.MODELS_PATH.read_text(encoding="utf-8")):
            with self.subTest(model=model):
                models.model_settings(model)

    def test_unlisted_model_fails(self):
        with self.assertRaises(SystemExit):
            models.model_settings("openrouter/x/unlisted")

    def test_extra_body(self):
        self.assertEqual(models.extra_body({"name": "a"}), {})
        self.assertEqual(
            models.extra_body({"name": "a", "provider": ["p/us"], "reasoning": True, "tool_choice": "required"}),
            {"provider": {"only": ["p/us"], "allow_fallbacks": False}, "reasoning": {"enabled": True}, "tool_choice": "required"},
        )


if __name__ == "__main__":
    unittest.main()
