import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import launcher_publish_payload as payload
from launcher_publish_payload import PayloadError, create_manifest, verify_manifest


class LauncherPublishPayloadTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="ltth-publish-payload-", dir=Path(__file__).resolve().parent)
        self.root = Path(self.temp.name)
        self.repository = "Loggableim/ltth.app"
        self.publisher_run_id = "7001"
        self.source_run_id = "6002"
        self.commit = "a" * 40
        self.handoff_commit = "b" * 40
        self.tag = "v1.2.3"
        for name, data in {
            "launcher.exe": b"signed-launcher-fixture",
            "launcher-release.json": json.dumps({"schema": 1, "component": "launcher.exe"}).encode(),
            "launcher-build-provenance.json": json.dumps({"sourceRunId": 6002}).encode(),
            "ltth_latest.zip": b"app-zip-fixture",
            "ltth_latest.json": json.dumps({"schema": 1, "component": "ltth_latest.zip"}).encode(),
        }.items():
            (self.root / name).write_bytes(data)

    def tearDown(self):
        self.temp.cleanup()

    def create(self):
        manifest = create_manifest(self.root, self.repository, self.publisher_run_id,
                                   self.source_run_id, self.commit, self.handoff_commit, self.tag)
        return manifest.read_text(encoding="ascii")

    def verify(self, content, **overrides):
        directory = overrides.pop("directory", self.root)
        args = {
            "repository": self.repository,
            "publisher_run_id": self.publisher_run_id,
            "source_run_id": self.source_run_id,
            "source_commit_sha": self.commit,
            "handoff_commit_sha": self.handoff_commit,
            "release_tag": self.tag,
        }
        args.update(overrides)
        return verify_manifest(directory, content, **args)

    def save_manifest(self, content):
        (self.root / payload.MANIFEST_NAME).write_text(content, encoding="ascii", newline="\n")

    def test_accepts_complete_same_run_app_payload(self):
        content = self.create()
        result = self.verify(content)
        self.assertEqual(set(result), {
            "launcher.exe", "launcher-release.json", "launcher-build-provenance.json",
            "ltth_latest.zip", "ltth_latest.json",
        })

    def test_accepts_launcher_only_payload_and_rejects_app_files(self):
        for name in ("ltth_latest.zip", "ltth_latest.json"):
            (self.root / name).unlink()
        self.tag = "launcher-beta-v1.2.3"
        content = self.create()
        self.assertEqual(len(self.verify(content)), 3)
        (self.root / "ltth_latest.zip").write_bytes(b"unexpected")
        with self.assertRaises(PayloadError):
            self.verify(content)

    def test_rejects_missing_or_unexpected_payload_entries(self):
        content = self.create()
        (self.root / "launcher.exe").unlink()
        with self.assertRaises(PayloadError):
            self.verify(content)

    def test_rejects_changed_bytes_or_missing_manifest_entry(self):
        content = self.create()
        (self.root / "launcher.exe").write_bytes(b"changed")
        with self.assertRaises(PayloadError):
            self.verify(content)
        with self.assertRaises(PayloadError):
            self.verify(content.replace("file=launcher.exe", "file=other.exe", 1))

    def test_rejects_run_repository_sha_and_tag_mismatch(self):
        content = self.create()
        for override in (
            {"publisher_run_id": "7002"},
            {"source_run_id": "6003"},
            {"repository": "attacker/ltth.app"},
            {"source_commit_sha": "b" * 40},
            {"handoff_commit_sha": "c" * 40},
            {"release_tag": "v9.9.9"},
        ):
            with self.subTest(override=override), self.assertRaises(PayloadError):
                self.verify(content, **override)

    def test_rejects_manifest_header_or_extra_file(self):
        content = self.create()
        with self.assertRaises(PayloadError):
            self.verify(content.replace("publisher_run_id=7001", "publisher_run_id=7002"))
        (self.root / "unexpected.txt").write_text("extra", encoding="ascii")
        with self.assertRaises(PayloadError):
            self.verify(content)

    def test_rejects_path_traversal_and_duplicate_asset_rows(self):
        traversal_root = self.root / ".." / self.root.name
        with self.assertRaises(PayloadError):
            create_manifest(traversal_root, self.repository, self.publisher_run_id,
                            self.source_run_id, self.commit, self.handoff_commit, self.tag)
        content = self.create()
        traversal = content.replace("file=launcher.exe\t", "file=../outside.exe\t", 1)
        self.save_manifest(traversal)
        with self.assertRaises(PayloadError):
            self.verify(traversal)
        duplicate = content.replace("file=launcher-release.json\t", "file=launcher.exe\t", 1)
        self.save_manifest(duplicate)
        with self.assertRaises(PayloadError):
            self.verify(duplicate)

    def test_rejects_case_variant_or_case_colliding_asset_names(self):
        with mock.patch.object(Path, "iterdir", return_value=[Path("launcher.exe"), Path("Launcher.exe")]):
            with self.assertRaises(PayloadError):
                create_manifest(self.root, self.repository, self.publisher_run_id,
                                self.source_run_id, self.commit, self.handoff_commit, self.tag)
        original = self.root / "launcher.exe"
        variant = self.root / "Launcher.exe"
        if os.path.normcase("A") == os.path.normcase("a"):
            original.rename(variant)
            try:
                with self.assertRaises(PayloadError):
                    create_manifest(self.root, self.repository, self.publisher_run_id,
                                    self.source_run_id, self.commit, self.handoff_commit, self.tag)
            finally:
                variant.rename(original)
        else:
            content = self.create()
            variant.write_bytes(b"case-collision")
            with self.assertRaises(PayloadError):
                self.verify(content)

    def test_rejects_empty_and_oversized_assets_without_unbounded_reads(self):
        launcher = self.root / "launcher.exe"
        launcher.write_bytes(b"")
        with self.assertRaises(PayloadError):
            create_manifest(self.root, self.repository, self.publisher_run_id,
                            self.source_run_id, self.commit, self.handoff_commit, self.tag)
        launcher.write_bytes(b"x" * 17)
        with mock.patch.object(payload, "MAX_ASSET_BYTES", 16):
            with self.assertRaises(PayloadError):
                create_manifest(self.root, self.repository, self.publisher_run_id,
                                self.source_run_id, self.commit, self.handoff_commit, self.tag)
        launcher.write_bytes(b"signed-launcher-fixture")
        content = self.create()
        with mock.patch.object(payload, "MAX_ASSET_BYTES", 16):
            with self.assertRaises(PayloadError):
                self.verify(content)
        launcher.write_bytes(b"")
        with self.assertRaises(PayloadError):
            self.verify(content)

    def test_rejects_oversized_json_and_manifest(self):
        content = self.create()
        (self.root / payload.MANIFEST_NAME).unlink()
        with mock.patch.object(payload, "MAX_JSON_ASSET_BYTES", 16):
            with self.assertRaises(PayloadError):
                create_manifest(self.root, self.repository, self.publisher_run_id,
                                self.source_run_id, self.commit, self.handoff_commit, self.tag)
        content = self.create()
        with mock.patch.object(payload, "MAX_JSON_ASSET_BYTES", 16):
            with self.assertRaises(PayloadError):
                self.verify(content)
        oversized = "x" * (payload.MAX_MANIFEST_BYTES + 1)
        self.save_manifest(oversized)
        with self.assertRaises(PayloadError):
            self.verify(oversized)

    def test_rejects_duplicate_case_colliding_and_nonstandard_json(self):
        manifest_path = self.root / "launcher-release.json"
        valid_payload = manifest_path.read_bytes()
        for bad_json in (
            b'{"schema":1,"schema":2}',
            b'{"outer":{"name":1,"Name":2}}',
            b'{"schema":NaN}',
            b'[]',
        ):
            manifest_path.write_bytes(bad_json)
            with self.subTest(payload=bad_json), self.assertRaises(PayloadError):
                create_manifest(self.root, self.repository, self.publisher_run_id,
                                self.source_run_id, self.commit, self.handoff_commit, self.tag)
        manifest_path.write_bytes(valid_payload)
        content = self.create()
        manifest_path.write_bytes(b'{"schema":1,"Schema":2}')
        rows = []
        for line in content.splitlines():
            if line.startswith("file=launcher-release.json\t"):
                data = manifest_path.read_bytes()
                line = f"file=launcher-release.json\t{len(data)}\t{hashlib.sha256(data).hexdigest()}"
            rows.append(line)
        tampered = "\n".join(rows) + "\n"
        self.save_manifest(tampered)
        with self.assertRaises(PayloadError):
            self.verify(tampered)
        manifest_path.write_bytes(valid_payload)

    def test_rejects_symlinked_file_and_root(self):
        original = self.root / "launcher.exe"
        content = self.create()
        linked_target = self.root.parent / f"{self.root.name}-launcher-target.exe"
        original_bytes = original.read_bytes()
        linked_target.write_bytes(original_bytes)
        original.unlink()
        try:
            os.symlink(linked_target, original)
        except (OSError, NotImplementedError) as exc:
            original.write_bytes(original_bytes)
            linked_target.unlink(missing_ok=True)
            self.skipTest(f"file symlink fixture unavailable: {type(exc).__name__}")
        try:
            with self.assertRaises(PayloadError):
                create_manifest(self.root, self.repository, self.publisher_run_id,
                                self.source_run_id, self.commit, self.handoff_commit, self.tag)
            with self.assertRaises(PayloadError):
                self.verify(content)
        finally:
            original.unlink(missing_ok=True)
            linked_target.unlink(missing_ok=True)
            original.write_bytes(original_bytes)

        root_link = self.root.parent / f"{self.root.name}-root-link"
        try:
            os.symlink(self.root, root_link, target_is_directory=True)
        except (OSError, NotImplementedError) as exc:
            self.skipTest(f"directory symlink fixture unavailable: {type(exc).__name__}")
        try:
            with self.assertRaises(PayloadError):
                create_manifest(root_link, self.repository, self.publisher_run_id,
                                self.source_run_id, self.commit, self.handoff_commit, self.tag)
            with self.assertRaises(PayloadError):
                self.verify(content, directory=root_link)
        finally:
            root_link.unlink(missing_ok=True)

    @unittest.skipUnless(sys.platform == "win32", "junction fixture is Windows-only")
    def test_rejects_junction_root(self):
        content = self.create()
        junction = self.root.parent / f"{self.root.name}-junction"
        powershell = shutil.which("pwsh.exe") or shutil.which("pwsh")
        if not powershell:
            self.skipTest("PowerShell Core is unavailable for the junction fixture")
        env = os.environ.copy()
        env["LTTH_JUNCTION_PATH"] = str(junction)
        env["LTTH_JUNCTION_TARGET"] = str(self.root)
        result = subprocess.run(
            [powershell, "-NoProfile", "-Command", "New-Item -ItemType Junction -Path $env:LTTH_JUNCTION_PATH -Target $env:LTTH_JUNCTION_TARGET | Out-Null"],
            capture_output=True, text=True, env=env,
        )
        if result.returncode != 0:
            detail = (result.stderr or result.stdout).strip()[:160]
            self.skipTest(f"junction fixture could not be created: {detail or result.returncode}")
        try:
            with self.assertRaises(PayloadError):
                create_manifest(junction, self.repository, self.publisher_run_id,
                                self.source_run_id, self.commit, self.handoff_commit, self.tag)
            with self.assertRaises(PayloadError):
                self.verify(content, directory=junction)
        finally:
            os.rmdir(junction)


if __name__ == "__main__":
    unittest.main()
