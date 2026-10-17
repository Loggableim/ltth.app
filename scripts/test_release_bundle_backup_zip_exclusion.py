import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_release_bundle as builder


class ReleaseBundleBackupZipExclusionTests(unittest.TestCase):
    def test_excludes_only_fixed_backup_zip_locations(self):
        excluded = [
            "test-backup-1791475958214.zip",
            r".jest-sandbox-temp\test-backup-1791475958214.zip",
        ]
        retained = [
            "runtime-pack.zip",
            "plugins/fireworks/assets/runtime-pack.zip",
            "plugins/fireworks/assets/test-backup-1791475958214.zip",
            ".jest-sandbox-temp/runtime-pack.zip",
            "test-backup-not-a-timestamp.zip",
            "test-backup-1791475958214.zip/inside.txt",
        ]
        for path in excluded:
            with self.subTest(path=path):
                self.assertTrue(builder.should_exclude_app_path(path))
        for path in retained:
            with self.subTest(path=path):
                self.assertFalse(builder.should_exclude_app_path(path))

    def test_bundle_omits_backups_and_keeps_legitimate_runtime_zip(self):
        with tempfile.TemporaryDirectory(prefix="ltth-release-fixture-") as temp:
            root = Path(temp)
            app = root / "app"
            (app / "config").mkdir(parents=True)
            (app / "plugins" / "fireworks" / "assets").mkdir(parents=True)
            (app / ".jest-sandbox-temp").mkdir()
            policy = {
                "schemaVersion": 1,
                "closedBeta": [],
                "publicRuntimeExcluded": [],
                "aliases": {},
                "publicAssetPathOwners": {},
            }
            (app / "config" / "plugin-release-policy.json").write_text(
                json.dumps(policy), encoding="utf-8"
            )
            (app / "plugins" / "fireworks" / "plugin.json").write_text(
                json.dumps({"id": "fireworks", "aliases": [], "replaces": []}),
                encoding="utf-8",
            )
            (app / "test-backup-1791475958214.zip").write_bytes(b"root backup")
            (app / ".jest-sandbox-temp" / "test-backup-1791475958225.zip").write_bytes(
                b"jest backup"
            )
            runtime_zip = app / "plugins" / "fireworks" / "assets" / "runtime-pack.zip"
            runtime_zip.write_bytes(b"legitimate runtime archive")
            named_runtime_zip = (
                app / "plugins" / "fireworks" / "assets" / "test-backup-1791475958232.zip"
            )
            named_runtime_zip.write_bytes(b"runtime asset with similar name")
            bundle = root / "candidate.zip"
            builder.build_bundle_zip(
                root, "9.9.9", bundle, enforce_committed_size_limit=False
            )
            with zipfile.ZipFile(bundle) as archive:
                names = set(archive.namelist())
            prefix = "ltth_9.9.9/app/"
            self.assertNotIn(prefix + "test-backup-1791475958214.zip", names)
            self.assertNotIn(
                prefix + ".jest-sandbox-temp/test-backup-1791475958225.zip", names
            )
            self.assertIn(
                prefix + "plugins/fireworks/assets/runtime-pack.zip", names
            )
            self.assertIn(
                prefix + "plugins/fireworks/assets/test-backup-1791475958232.zip", names
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)
