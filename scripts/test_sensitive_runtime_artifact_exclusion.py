import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_release_bundle as builder


class SensitiveRuntimeArtifactExclusionTests(unittest.TestCase):
    def test_observed_temp_db_log_and_cache_paths_are_excluded(self):
        excluded = [
            ".jest-sandbox-temp/ltth-backup-DweDW5/plugins/quiz-show/data/quiz_show.db",
            ".jest-sandbox-temp/ltth-backup-FfBNBm/plugins/quiz-show/data/quiz_show.db-wal",
            ".jest-sandbox-temp/ltth-quiz-backup-IMx5Vg/target/user_configs/profile_a.db",
            ".jest-sandbox-temp/logs/app-2026-10-08.log",
            ".codex-test-temp/node-compile-cache/v24.16.0-x64-cf738c9d/000a1de6",
            ".jest-sandbox-temp/jest-cache/haste-map-fixture",
            ".jest-sandbox-temp/passive-receiver-cache/fixture.bin",
            ".jest-sandbox-temp/node-compile-cache/v24.16.0-x64-cf738c9d/000a1de6",
            ".runtime-test-temp/jest/jest-transform-cache-fixture/file",
            ".tmp/node-compile-cache/v24.16.0-x64-cf738c9d/000a1de6",
            ".tmp-dashboard-error-audit/jest/haste-map-fixture",
            ".tmp-superfan-jest-8f422d88ec3d478a9446fbe987610a69/cache/haste-map-fixture",
            ".tmp-superfan-jest-9e86a57bafe7431eb0311584fcd5975c/realpath-shim.cjs",
            "node-compile-cache/v24.16.0-x64-cf738c9d/000a1de6",
            ".jest-sandbox-temp/test-backup-1791475958214.zip",
        ]
        for path in excluded:
            with self.subTest(path=path):
                self.assertTrue(builder.should_exclude_app_path(path))

    def test_neighbor_paths_and_runtime_archives_remain_eligible(self):
        retained = [
            ".jest-sandbox-temp/keep/runtime.db",
            ".jest-sandbox-temp/keep/runtime.zip",
            ".codex-test-temp/keep/runtime-settings.json",
            ".tmp/keep/runtime-settings.json",
            ".tmp-dashboard-error-audit/keep/runtime-settings.json",
            ".tmp-superfan-jest-not-a-uuid/cache/file.bin",
            ".tmp-superfan-jest-8f422d88ec3d478a9446fbe987610a6/cache/file.bin",
            "plugins/fireworks/data/runtime.db",
            "plugins/fireworks/assets/runtime-pack.zip",
            "plugins/fireworks/assets/test-backup-1791475958214.zip",
        ]
        for path in retained:
            with self.subTest(path=path):
                self.assertFalse(builder.should_exclude_app_path(path))

    def test_synthetic_bundle_drops_temp_db_logs_and_caches_only(self):
        out = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory(prefix="fixture-", dir=out) as temp:
            root = Path(temp)
            app = root / "app"
            (app / "config").mkdir(parents=True)
            plugin = app / "plugins" / "fireworks"
            (plugin / "assets").mkdir(parents=True)
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
            (plugin / "plugin.json").write_text(
                json.dumps({"id": "fireworks", "aliases": [], "replaces": []}),
                encoding="utf-8",
            )
            files = {
                ".jest-sandbox-temp/ltth-backup-A1/plugins/quiz/data.db": b"synthetic database",
                ".jest-sandbox-temp/ltth-quiz-backup-B2/target/profile.db": b"synthetic database",
                ".jest-sandbox-temp/logs/audit.log": b"synthetic log",
                ".runtime-test-temp/jest/cache/file.bin": b"synthetic test cache",
                ".tmp-dashboard-error-audit/jest/cache/file.bin": b"synthetic audit cache",
                ".tmp-superfan-jest-8f422d88ec3d478a9446fbe987610a69/cache/file.bin": b"synthetic test cache",
                ".codex-test-temp/node-compile-cache/v24/test.bin": b"synthetic compile cache",
                "node-compile-cache/v24/test.bin": b"synthetic compile cache",
                ".jest-sandbox-temp/keep/runtime.db": b"synthetic runtime database",
                ".jest-sandbox-temp/keep/runtime.zip": b"synthetic runtime archive",
                "plugins/fireworks/data/runtime.db": b"synthetic runtime database",
                "plugins/fireworks/assets/runtime-pack.zip": b"synthetic runtime archive",
                "plugins/fireworks/assets/test-backup-12345.zip": b"synthetic runtime asset",
            }
            for rel, payload in files.items():
                p = app / Path(rel)
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_bytes(payload)
            bundle = root / "fixture.zip"
            builder.build_bundle_zip(root, "9.9.9", bundle, enforce_committed_size_limit=False)
            with zipfile.ZipFile(bundle) as archive:
                names = set(archive.namelist())
            prefix = "ltth_9.9.9/app/"
            for rel in files:
                if builder.should_exclude_app_path(rel):
                    self.assertNotIn(prefix + rel, names)
                else:
                    self.assertIn(prefix + rel, names)


if __name__ == "__main__":
    unittest.main(verbosity=2)

