"""Synthetic-only staging regressions; never execute installer/compiler."""
import hashlib
import json
import os
import sys
import shutil
import subprocess
from unittest import mock
from pathlib import Path
import tempfile
import unittest
import prepare_nsis_public_stage as stage

CANONICAL = Path(__file__).resolve().parents[1] / "app/config/plugin-release-policy.json"

class PublicStageTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="ltth-nsis-synthetic-")
        self.root = Path(self.temporary.name)
        self.repo = self.root / "repo"
        self.app = self.repo / "app"
        self.destination = self.root / "public-stage"
        self.write("config/plugin-release-policy.json", CANONICAL.read_bytes())
        for name, data in {"package.json": b'{"version":"9.8.7"}', "package-lock.json": b'{}',
                           "server.js": b'// synthetic', "launch.js": b'// synthetic',
                           ".env.example": b'API_KEY=__SYNTHETIC_PLACEHOLDER__\nPORT=3000\n',
                           "config/distribution-mode.json": b'{"channel":"developer"}',
                           "config/harmless.json": b'{"synthetic":true}',
                           "public/js/harmless.js": b'// synthetic'}.items():
            self.write(name, data)
    def tearDown(self):
        self.temporary.cleanup()
    def write(self, name, data):
        path = self.app / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    def snapshot(self):
        return {name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in stage.files(self.app).items()}
    def test_filters_canonical_ids_aliases_retired_assets_preserves_sources(self):
        policy = json.loads(CANONICAL.read_text(encoding="utf-8-sig"))
        blocked = policy["closedBeta"] + policy["publicRuntimeExcluded"] + list(policy["aliases"]) + ["chatango"]
        for index, plugin in enumerate(blocked):
            self.write(f"plugins/{plugin}/main.js", b'// private synthetic')
            self.write(f"plugins/renamed-{index}/plugin.json", json.dumps({"id":plugin}).encode())
        for path in list(policy["publicAssetPathOwners"]) + ["/js/chatango-theme-adapter.js"]:
            self.write("public" + path, b'// excluded synthetic')
        self.write("plugins/community-chat/plugin.json", b'{"id":"community-chat"}')
        before = self.snapshot()
        stage.prepare(self.repo, self.destination)
        actual = stage.files(self.destination / "app")
        self.assertEqual(set(name for name in actual if name.startswith("plugins/")), {"plugins/community-chat/plugin.json"})
        self.assertEqual(set(name for name in actual if name.startswith("public/")), {"public/js/harmless.js"})
        self.assertEqual(before, self.snapshot())
        self.assertEqual((self.destination / "app/config/plugin-release-policy.json").read_bytes(), CANONICAL.read_bytes())
        self.assertEqual(json.loads((self.destination / "app/config/distribution-mode.json").read_text()), {"channel":"public"})
        stage.verify(self.repo, self.destination)
    def test_env_pointer_excluded_template_and_harmless_files_retained(self):
        denied = [".env", ".ENV.local", "config/.env.example", "config/.env.production", ".config_path", "plugins/community/.CONFIG_PATH"]
        for name in denied: self.write(name, b'SYNTHETIC_PRIVATE=1')
        before = self.snapshot()
        stage.prepare(self.repo, self.destination)
        actual = stage.files(self.destination / "app")
        self.assertTrue(all(name not in actual for name in denied))
        self.assertIn("config/harmless.json", actual)
        self.assertEqual(actual[".env.example"].read_bytes(), (self.app / ".env.example").read_bytes())
        self.assertEqual(before, self.snapshot())
    def test_concrete_credential_template_fails_before_stage_write(self):
        self.write(".env.example", b'API_KEY=synthetic-but-not-placeholder-value\n')
        with self.assertRaises(ValueError): stage.prepare(self.repo, self.destination)
        self.assertFalse(self.destination.exists())
    def test_missing_required_file_fails_before_stage_write(self):
        (self.app / "server.js").unlink()
        with self.assertRaises(ValueError): stage.prepare(self.repo, self.destination)
        self.assertFalse(self.destination.exists())
    def test_stage_tampering_and_inventory_drift_blocked(self):
        stage.prepare(self.repo, self.destination)
        for name in ["plugins/CHATANGO/main.js", "public/js/CHATANGO-THEME-ADAPTER.JS", ".env", ".config_path"]:
            path = self.destination / "app" / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b'// synthetic tamper')
            with self.assertRaises(ValueError): stage.verify(self.repo, self.destination)
            path.unlink()
        path = self.destination / "app/server.js"
        path.write_bytes(b'// modified')
        with self.assertRaises(ValueError): stage.verify(self.repo, self.destination)
    def test_existing_or_non_temp_stage_not_touched(self):
        self.destination.mkdir()
        marker = self.destination / "keep.txt"; marker.write_bytes(b'preserve')
        with self.assertRaises(ValueError): stage.prepare(self.repo, self.destination)
        self.assertEqual(marker.read_bytes(), b'preserve')
        with self.assertRaises(ValueError): stage.safe_stage(Path(tempfile.gettempdir()))
        with self.assertRaises(ValueError): stage.safe_stage(Path('relative-stage'))
    def test_stage_inside_source_checkout_rejected(self):
        nested = self.repo / "public-stage"
        with self.assertRaises(ValueError): stage.prepare(self.repo, nested)
        self.assertFalse(nested.exists())
    def test_policy_drift_is_rejected(self):
        stage.prepare(self.repo, self.destination)
        target = self.destination / "app/config/plugin-release-policy.json"
        target.write_bytes(b'{"schemaVersion":1,"closedBeta":[],"aliases":{},"publicAssetPathOwners":{}}')
        with self.assertRaises(ValueError): stage.verify(self.repo, self.destination)
    @unittest.skipUnless(os.name == "nt", "Windows file-share contract")
    def test_locked_fake_compiler_blocks_concurrent_write_delete_and_ignores_added_files(self):
        stage.prepare(self.repo, self.destination)
        script = self.root / "synthetic.nsi"; script.write_text("; fake compiler input")
        report = self.root / "child-report.json"
        child = self.root / "fake-compiler.py"
        child.write_text("""import json, pathlib, sys
stage = pathlib.Path(sys.argv[1]); report = pathlib.Path(sys.argv[2])
original = stage / 'app/server.js'
result = {}
for operation in ['write', 'delete', 'rename']:
    try:
        if operation == 'write': original.write_bytes(b'changed')
        elif operation == 'delete': original.unlink()
        else: original.rename(stage / 'app/renamed.js')
        result[operation] = 'UNSAFE_SUCCESS'
    except OSError: result[operation] = 'blocked'
late = stage / 'app/late-unverified.js'; late.write_bytes(b'late')
include = stage / 'nsis-public-files.nsh'
result['lateIncluded'] = 'late-unverified.js' in include.read_text()
try:
    include.write_text('File raw-source')
    result['listWrite'] = 'UNSAFE_SUCCESS'
except OSError: result['listWrite'] = 'blocked'
result['readAllowed'] = original.read_bytes() == b'// synthetic'
report.write_text(json.dumps(result))
""")
        developer_launcher = self.root / "synthetic-developer-launcher.exe"
        developer_launcher.write_bytes(b"synthetic developer launcher")
        stage.compile_stage(self.repo, self.destination, script,
                            [sys.executable, "-B", str(child), str(self.destination), str(report)],
                            developer_launcher=developer_launcher)
        result = json.loads(report.read_text())
        self.assertEqual(result, {"write":"blocked", "delete":"blocked", "rename":"blocked",
                                  "lateIncluded":False, "listWrite":"blocked", "readAllowed":True})
        self.assertEqual((self.destination / 'app/server.js').read_bytes(), b'// synthetic')
        # Handles are released on exit; only synthetic data is changed here.
        (self.destination / 'app/server.js').write_bytes(b'after child exit')
    @unittest.skipUnless(os.name == "nt", "Windows file-share contract")
    def test_missing_hash_drift_and_existing_writer_fail_before_child(self):
        for kind in ["missing", "hash", "writer"]:
            with self.subTest(kind=kind):
                destination = self.root / ("stage-" + kind)
                stage.prepare(self.repo, destination)
                script = self.root / (kind + '.nsi'); script.write_text('; synthetic')
                target = destination / 'app/server.js'
                if kind == "missing": target.unlink()
                if kind == "hash": target.write_bytes(b'drift')
                with mock.patch.object(stage.subprocess, 'run') as run:
                    if kind == "writer":
                        with target.open('wb'):
                            with self.assertRaises((OSError, ValueError)):
                                stage.compile_stage(self.repo, destination, script, ['never-execute'])
                    else:
                        with self.assertRaises((OSError, ValueError)):
                            stage.compile_stage(self.repo, destination, script, ['never-execute'])
                    run.assert_not_called()
    @unittest.skipUnless(os.name == "nt", "Windows junction contract")
    def test_app_root_junction_outside_temp_rejected_without_child_or_data_change(self):
        stage.prepare(self.repo, self.destination)
        parent = Path(__file__).resolve().parents[1] / 'output'
        parent.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='nsis-junction-outside-temp-', dir=parent) as external:
            outside = Path(external) / 'byte-identical-app'
            self.assertNotIn(Path(tempfile.gettempdir()).resolve(), outside.resolve().parents)
            app = self.destination / 'app'
            shutil.copytree(app, outside)
            before = {name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in stage.files(outside).items()}
            source_before = self.snapshot()
            preserved = self.destination / 'original-app'
            app.rename(preserved)
            created = subprocess.run(['cmd.exe', '/d', '/c', 'mklink', '/J', str(app), str(outside)], capture_output=True)
            self.assertEqual(created.returncode, 0)
            try:
                with self.assertRaises(ValueError): stage.verify(self.repo, self.destination)
                script = self.root / 'junction.nsi'; script.write_text('; synthetic')
                with mock.patch.object(stage.subprocess, 'run') as run:
                    with self.assertRaises(ValueError): stage.compile_stage(self.repo, self.destination, script, ['never-execute'])
                    run.assert_not_called()
                after = {name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in stage.files(outside).items()}
                self.assertEqual(before, after)
                self.assertEqual(source_before, self.snapshot())
                self.assertFalse((self.destination / 'nsis-public-files.nsh').exists())
            finally:
                # Remove only the synthetic junction, never recursively its target.
                os.rmdir(app)
                preserved.rename(app)

    @unittest.skipUnless(os.name == "nt", "Windows file-share contract")
    def test_child_failure_releases_locks_and_preserves_stage(self):
        stage.prepare(self.repo, self.destination)
        script = self.root / 'failure.nsi'; script.write_text('; synthetic')
        with mock.patch.object(stage.subprocess, 'run', return_value=mock.Mock(returncode=7)):
            with self.assertRaises(ValueError): stage.compile_stage(self.repo, self.destination, script, ['fake'])
        target = self.destination / 'app/server.js'
        self.assertEqual(target.read_bytes(), b'// synthetic')
        target.write_bytes(b'lock released')

    def test_batch_and_nsi_have_no_raw_source_compile_fallback(self):
        repo = Path(__file__).resolve().parents[1]
        batch = (repo / "build-src/installer/build-installer.bat").read_text()
        nsi = (repo / "build-src/installer/ltth-installer.nsi").read_text()
        self.assertIn('--verify', batch)
        self.assertIn('--compiler "%NSIS_PATH%"', batch)
        self.assertLess(batch.index('--verify'), batch.index('--compiler "%NSIS_PATH%"'))
        self.assertNotIn('!define APP_DIR "../../app"', nsi)
        self.assertIn('!ifndef NSIS_PUBLIC_STAGE_VERIFIED', nsi)
        self.assertNotIn('${APP_DIR}\\*', nsi)
        self.assertIn('!include "${NSIS_PUBLIC_FILE_LIST}"', nsi)

if __name__ == "__main__": unittest.main()
