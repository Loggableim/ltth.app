import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("chatango_assets_builder", ROOT / "scripts/build_pages_bundle.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class ChatangoAssetTests(unittest.TestCase):
    def test_path_deny_and_controls(self):
        for path in ["assets/plugin-logos/chatango.svg", "screenshots/fr/docs/plugins/chatango/open.png", "screenshots/features/plugin-chatango-dashboard.png", r"screenshots\de\features\CHATANGO.PNG"]:
            self.assertTrue(builder.is_retired_chatango_asset(path), path)
        for path in ["assets/plugin-logos/clarityhud.svg", "screenshots/features/chat.png", "screenshots/docs-capture-manifest.json", "assets/chatangology.png", "docs_archive/chatango.md"]:
            self.assertFalse(builder.is_retired_chatango_asset(path), path)

    def test_both_copy_functions_preserve_sources_and_controls(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            denied = root / "assets/plugin-logos/chatango.svg"
            control = root / "assets/plugin-logos/clarityhud.svg"
            denied.parent.mkdir(parents=True)
            denied.write_text("old", encoding="utf-8")
            control.write_text("keep", encoding="utf-8")
            with patch.object(builder, "REPO_ROOT", root):
                self.assertFalse(builder.copy_file(denied, root / "direct/chatango.svg"))
                self.assertTrue(builder.copy_file(control, root / "direct/clarityhud.svg"))
                self.assertEqual(builder.copy_tree(root / "assets", root / "stage/assets", set()), 1)
            self.assertFalse((root / "stage/assets/plugin-logos/chatango.svg").exists())
            self.assertEqual((root / "stage/assets/plugin-logos/clarityhud.svg").read_text(), "keep")
            self.assertTrue(denied.is_file())


if __name__ == "__main__":
    unittest.main()
