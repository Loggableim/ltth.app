"""Synthetic coverage for the legacy manual release retirement gate."""

from contextlib import redirect_stdout
import io
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock
import zipfile

# Support both direct execution and unittest module discovery from the repo root.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from release_from_new_patch import ReleaseManager


class NewPatchRetirementTests(unittest.TestCase):
    def test_chatango_plugin_zip_fails_before_deploy(self):
        with tempfile.TemporaryDirectory(prefix="ltth-retired-new-patch-") as temp_dir:
            repo_root = Path(temp_dir)
            patch_dir = repo_root / "new_patch" / "ltth_9.9.9"
            patch_dir.mkdir(parents=True)
            zip_path = patch_dir / "ltth_9.9.9.zip"
            changelog = patch_dir / "changelog.txt"
            changelog.write_text("synthetic changelog", encoding="utf-8")

            with zipfile.ZipFile(zip_path, "w") as archive:
                archive.writestr(
                    "ltth_9.9.9/app/plugins/chatango/plugin.json",
                    '{"id":"chatango","name":"Synthetic Chatango","entry":"main.js"}',
                )
                archive.writestr(
                    "ltth_9.9.9/app/plugins/chatango/main.js",
                    "module.exports = {};",
                )

            manager = ReleaseManager(repo_root)
            manager.deploy_new_version = Mock(side_effect=AssertionError("deploy must not run"))

            output = io.StringIO()
            with redirect_stdout(output):
                result = manager.run_release()

            self.assertFalse(result)
            self.assertIn("ZIP contains a closed-beta or retired app plugin", output.getvalue())
            manager.deploy_new_version.assert_not_called()
            self.assertFalse((repo_root / "app" / "ltth_latest.zip").exists())


if __name__ == "__main__":
    unittest.main()
