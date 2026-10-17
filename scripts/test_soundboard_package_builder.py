"""Synthetic tests for the deterministic Soundboard package producer."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest import mock

import build_soundboard_package as builder


class SoundboardPackageBuilderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="ltth-soundboard-package-")
        self.root = Path(self.temporary.name) / "repo"
        self.plugin = self.root / "app" / "plugins" / "soundboard"
        self.plugin.mkdir(parents=True)
        self._git("init", "-q")
        self._git("config", "user.name", "Synthetic Test")
        self._git("config", "user.email", "synthetic@example.invalid")
        self._git("config", "core.autocrlf", "false")
        (self.plugin / "plugin.json").write_text(
            json.dumps({
                "id": "soundboard",
                "name": "Soundboard",
                "version": "1.0.0",
                "entry": "main.js",
                "logo": "/soundboard-logo.png",
            }, indent=2) + "\n",
            encoding="utf-8",
        )
        (self.plugin / "main.js").write_text(
            "const DEFAULT_GIPHY_API_KEY = null;\nmodule.exports = {};\n",
            encoding="utf-8",
        )
        (self.plugin / "assets").mkdir()
        (self.plugin / "assets" / "sample.bin").write_bytes(b"\x00\xff\x10binary\x00")
        (self.plugin / "README.md").write_text("Synthetic package\n", encoding="utf-8")
        self._git("add", "app/plugins/soundboard")
        self._git("commit", "-qm", "synthetic soundboard source")
        self.commit = self._git("rev-parse", "HEAD").decode("ascii").strip()

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def _git(self, *args: str) -> bytes:
        result = subprocess.run(
            ["git", "-C", str(self.root), *args],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        if result.returncode != 0:
            self.fail(result.stderr.decode("utf-8", "replace"))
        return result.stdout

    def _build(self, target: Path, version: str = "1.0.1") -> tuple[Path, Path]:
        zip_path = target / "soundboard-1.0.1.zip"
        sidecar_path = target / "soundboard-1.0.1.manifest.json"
        builder.build_package(self.root, self.commit, version, zip_path, sidecar_path)
        return zip_path, sidecar_path

    def test_builds_from_commit_and_changes_only_manifest_version(self) -> None:
        target = Path(self.temporary.name) / "out"
        zip_path, sidecar_path = self._build(target)
        sidecar = json.loads(sidecar_path.read_text(encoding="utf-8"))
        self.assertEqual(sidecar["sourceCommit"], self.commit)
        self.assertEqual(sidecar["sourceTree"], self._git(
            "rev-parse", f"{self.commit}:app/plugins/soundboard"
        ).decode("ascii").strip())
        self.assertEqual(sidecar["packageVersion"], "1.0.1")
        with zipfile.ZipFile(zip_path) as archive:
            names = archive.namelist()
            self.assertEqual(names, sorted(names, key=lambda item: item.encode("utf-8")))
            self.assertEqual(len(names), 4)
            for info in archive.infolist():
                self.assertEqual(info.date_time, builder.ZIP_TIME)
                self.assertEqual(info.create_system, 3)
                self.assertEqual(info.external_attr >> 16, 0o100644)
            packaged = json.loads(archive.read("plugin.json"))
            source = json.loads((self.plugin / "plugin.json").read_text(encoding="utf-8"))
            self.assertEqual(packaged["version"], "1.0.1")
            packaged["version"] = source["version"]
            self.assertEqual(packaged, source)
            self.assertEqual(archive.read("assets/sample.bin"), b"\x00\xff\x10binary\x00")
        self.assertEqual(builder.verify_package_bytes(zip_path.read_bytes(), sidecar_path.read_bytes())["sha256"], sidecar["sha256"])

    def test_two_builds_are_byte_identical(self) -> None:
        first_zip, first_sidecar = self._build(Path(self.temporary.name) / "first")
        second_zip, second_sidecar = self._build(Path(self.temporary.name) / "second")
        self.assertEqual(first_zip.read_bytes(), second_zip.read_bytes())
        self.assertEqual(first_sidecar.read_bytes(), second_sidecar.read_bytes())

    def test_existing_outputs_are_preserved_byte_for_byte(self) -> None:
        target = Path(self.temporary.name) / "existing"
        target.mkdir()
        zip_path = target / "soundboard-1.0.1.zip"
        sidecar_path = target / "soundboard-1.0.1.manifest.json"
        for existing_path, existing_bytes in (
            (zip_path, b"existing ZIP bytes\x00\xff"),
            (sidecar_path, b"existing sidecar bytes\n"),
        ):
            with self.subTest(path=existing_path.name):
                existing_path.write_bytes(existing_bytes)
                with self.assertRaisesRegex(builder.PackageBuildError, "already exists"):
                    builder.build_package(self.root, self.commit, "1.0.1", zip_path, sidecar_path)
                self.assertEqual(existing_path.read_bytes(), existing_bytes)
                existing_path.unlink()
        self.assertEqual(list(target.iterdir()), [])

    def test_sidecar_staging_failure_cleans_temporary_zip_and_keeps_outputs_absent(self) -> None:
        target = Path(self.temporary.name) / "stage-write-failure"
        original_write = builder._write_staged_file
        calls = []

        def fail_second_write(destination: Path, contents: bytes) -> Path:
            calls.append(destination)
            if len(calls) == 2:
                raise OSError("synthetic sidecar write failure")
            return original_write(destination, contents)

        with mock.patch.object(builder, "_write_staged_file", side_effect=fail_second_write):
            with self.assertRaisesRegex(OSError, "sidecar write failure"):
                self._build(target)

        self.assertEqual(len(calls), 2)
        self.assertEqual(list(target.iterdir()), [])

    def test_staged_verification_failure_cleans_both_temporaries(self) -> None:
        target = Path(self.temporary.name) / "verify-stage-failure"
        original_verify = builder.verify_package_bytes
        calls = []

        def fail_staged_verification(archive_bytes: bytes, sidecar_bytes: bytes) -> dict:
            calls.append(None)
            if len(calls) == 2:
                raise builder.PackageBuildError("synthetic staged verification failure")
            return original_verify(archive_bytes, sidecar_bytes)

        with mock.patch.object(builder, "verify_package_bytes", side_effect=fail_staged_verification):
            with self.assertRaisesRegex(builder.PackageBuildError, "staged verification failure"):
                self._build(target)

        self.assertEqual(len(calls), 2)
        self.assertEqual(list(target.iterdir()), [])

    def test_racing_sidecar_target_is_preserved_and_published_zip_is_rolled_back(self) -> None:
        target = Path(self.temporary.name) / "racing-sidecar"
        zip_path = target / "soundboard-1.0.1.zip"
        sidecar_path = target / "soundboard-1.0.1.manifest.json"
        competing_bytes = b"concurrent sidecar bytes\x00"
        original_publish = builder._publish_staged_file

        def create_competing_sidecar(staged_path: Path, destination: Path) -> None:
            if destination == sidecar_path:
                destination.write_bytes(competing_bytes)
            original_publish(staged_path, destination)

        with mock.patch.object(builder, "_publish_staged_file", side_effect=create_competing_sidecar):
            with self.assertRaisesRegex(builder.PackageBuildError, "appeared before publication"):
                self._build(target)

        self.assertFalse(zip_path.exists())
        self.assertEqual(sidecar_path.read_bytes(), competing_bytes)
        self.assertEqual(list(target.glob("*.tmp")), [])

    def test_symlink_output_is_rejected_without_touching_its_target(self) -> None:
        target = Path(self.temporary.name) / "symlink-output"
        target.mkdir()
        sentinel = Path(self.temporary.name) / "outside-sentinel.bin"
        sentinel_bytes = b"outside file must remain untouched"
        sentinel.write_bytes(sentinel_bytes)
        zip_path = target / "soundboard-1.0.1.zip"
        sidecar_path = target / "soundboard-1.0.1.manifest.json"
        try:
            zip_path.symlink_to(sentinel)
        except (NotImplementedError, OSError) as exc:
            self.skipTest(f"symlink creation is unavailable: {exc}")

        with self.assertRaisesRegex(builder.PackageBuildError, "already exists"):
            builder.build_package(self.root, self.commit, "1.0.1", zip_path, sidecar_path)

        self.assertTrue(zip_path.is_symlink())
        self.assertEqual(sentinel.read_bytes(), sentinel_bytes)
        self.assertFalse(sidecar_path.exists())
        self.assertEqual(list(target.iterdir()), [zip_path])

    def test_final_verification_failure_rolls_back_both_published_links(self) -> None:
        target = Path(self.temporary.name) / "verify-final-failure"
        original_verify = builder.verify_package_bytes
        calls = []

        def fail_final_verification(archive_bytes: bytes, sidecar_bytes: bytes) -> dict:
            calls.append(None)
            if len(calls) == 3:
                raise builder.PackageBuildError("synthetic final verification failure")
            return original_verify(archive_bytes, sidecar_bytes)

        with mock.patch.object(builder, "verify_package_bytes", side_effect=fail_final_verification):
            with self.assertRaisesRegex(builder.PackageBuildError, "final verification failure"):
                self._build(target)

        self.assertEqual(len(calls), 3)
        self.assertEqual(list(target.iterdir()), [])

    def test_rejects_dirty_source_tree(self) -> None:
        (self.plugin / "main.js").write_text("dirty\n", encoding="utf-8")
        with self.assertRaisesRegex(builder.PackageBuildError, "working tree is dirty"):
            self._build(Path(self.temporary.name) / "dirty")

    def test_rejects_path_traversal_and_absolute_names(self) -> None:
        for value in ("../escape", "folder/../../escape", "/absolute", "folder\\escape"):
            with self.subTest(path=value), self.assertRaises(builder.PackageBuildError):
                builder.validate_relative_path(value)

    def test_rejects_binary_blob_mismatch(self) -> None:
        correct = b"\x00\xffbinary"
        oid = hashlib.sha1(b"blob " + str(len(correct)).encode("ascii") + b"\0" + correct).hexdigest()
        builder.verify_git_blob(oid, correct)
        with self.assertRaisesRegex(builder.PackageBuildError, "blob bytes do not match"):
            builder.verify_git_blob(oid, b"\x00\xffchanged")

    def test_rejects_tampered_package_binary_against_sidecar(self) -> None:
        zip_path, sidecar_path = self._build(Path(self.temporary.name) / "tamper")
        damaged = Path(self.temporary.name) / "damaged.zip"
        with zipfile.ZipFile(zip_path) as source, zipfile.ZipFile(damaged, "w") as target:
            for info in source.infolist():
                data = source.read(info.filename)
                if info.filename == "assets/sample.bin":
                    data = b"\x00\xffmismatched-binary\x00"
                target.writestr(info, data, compress_type=info.compress_type, compresslevel=9)
        with self.assertRaises(builder.PackageBuildError):
            builder.verify_package_bytes(damaged.read_bytes(), sidecar_path.read_bytes())

    def test_rejects_non_null_giphy_default(self) -> None:
        files = {
            "main.js": (b"const DEFAULT_GIPHY_API_KEY = 'not-empty';\n", 0o100644),
            "plugin.json": (b'{"id":"soundboard","version":"1.0.0"}\n', 0o100644),
        }
        with self.assertRaisesRegex(builder.PackageBuildError, "non-empty GIPHY API default"):
            builder.verify_no_bundled_giphy_default(files)

    def test_rejects_non_null_manifest_api_key(self) -> None:
        files = {
            "main.js": (b"const DEFAULT_GIPHY_API_KEY = null;\n", 0o100644),
            "plugin.json": (
                b'{"id":"soundboard","version":"1.0.0","apiKey":"placeholder"}\n',
                0o100644,
            ),
        }
        with self.assertRaisesRegex(builder.PackageBuildError, "must be absent or null"):
            builder.transform_plugin_manifest(files, "1.0.1")


if __name__ == "__main__":
    unittest.main()
