"""CPU-only fixtures for the NSIS launcher payload contract; no real signatures."""
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import launcher_publish_payload as publisher
import nsis_launcher_input_contract as contract


class LauncherInputContractTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="nsis-launcher-fixture-", dir=Path(__file__).resolve().parent)
        self.root = Path(self.temp.name) / "payload"
        self.root.mkdir()
        self.stage = Path(self.temp.name) / "stage"
        self.stage.mkdir()
        self.exe = b"SYNTHETIC SIGNED LAUNCHER FIXTURE"
        self.release = {"schema": 1, "component": "launcher.exe", "version": "1.2.3",
                        "tag": "launcher-beta-v1.2.3", "commitSha": "a" * 40,
                        "bytes": len(self.exe), "sha256": hashlib.sha256(self.exe).hexdigest()}
        self.provenance = {
            "schema": 2, "component": "launcher.exe", "sourceRunId": 6002,
            "sourceWorkflow": ".github/workflows/build-launcher.yml",
            "sourceEvent": "push", "sourceRef": "refs/tags/launcher-beta-v1.2.3",
            "sourceCommitSha": "a" * 40, "version": "1.2.3", "tag": "launcher-beta-v1.2.3",
            "toolchain": "go1.24.10", "target": "windows/amd64", "cgoEnabled": False,
            "moduleMode": "-mod=readonly", "buildFlags": ["-trimpath", "-buildvcs=false", "-ldflags", "-H windowsgui -s -w"],
            "candidateBytes": 123, "candidateSha256": "b" * 64, "candidateManifestSha256": "c" * 64,
            "signedBytes": len(self.exe), "signedSha256": hashlib.sha256(self.exe).hexdigest(),
            "expectedSignerThumbprint": "d" * 40, "signerThumbprint": "d" * 40,
            "timestampSignerThumbprint": "e" * 40,
        }
        self.write_files()
        self.refresh_manifest()

    def tearDown(self):
        self.temp.cleanup()

    def write_files(self):
        (self.root / "launcher.exe").write_bytes(self.exe)
        (self.root / "launcher-release.json").write_text(json.dumps(self.release), encoding="utf-8")
        (self.root / "launcher-build-provenance.json").write_text(json.dumps(self.provenance), encoding="utf-8")

    def refresh_manifest(self):
        path = self.root / publisher.MANIFEST_NAME
        path.unlink(missing_ok=True)
        publisher.create_manifest(self.root, "Loggableim/ltth.app", "7001", "6002", "a" * 40,
                                  "e" * 40, "launcher-beta-v1.2.3")

    def signature(self, _path, _signer):
        return {"status": "Valid", "thumbprint": "d" * 40, "timestamp_valid": True}

    def verify(self, **kwargs):
        args = {"version": "1.2.3", "commit_sha": "a" * 40, "tag": "launcher-beta-v1.2.3",
                "source_run_id": "6002", "publisher_run_id": "7001", "handoff_commit_sha": "e" * 40,
                "launcher_signer_thumbprint": "d" * 40,
                "signature_verifier": self.signature}
        args.update(kwargs)
        return contract.validate_payload(self.root, **args)

    def test_accepts_matching_publisher_payload_and_stages_exact_launcher(self):
        result = self.verify()
        self.assertEqual(result["sha256"], hashlib.sha256(self.exe).hexdigest())
        target = contract.copy_verified_launcher(self.root / "launcher.exe", self.stage, result)
        self.assertEqual(target.read_bytes(), self.exe)

    def test_rejects_publisher_run_and_handoff_commit_not_bound_externally(self):
        for key, value in (("publisher_run_id", "7002"), ("handoff_commit_sha", "f" * 40)):
            with self.subTest(key=key), self.assertRaises(contract.LauncherInputError):
                self.verify(**{key: value})

    def test_rejects_missing_sidecar_and_extra_payload_entry(self):
        (self.root / "launcher-release.json").unlink()
        with self.assertRaises(contract.LauncherInputError): self.verify()
        self.write_files(); self.refresh_manifest()
        (self.root / "unexpected.bin").write_bytes(b"synthetic")
        with self.assertRaises(contract.LauncherInputError): self.verify()

    def test_rejects_stale_bytes_even_if_publisher_inventory_is_refreshed(self):
        (self.root / "launcher.exe").write_bytes(b"STALE SYNTHETIC EXE")
        self.refresh_manifest()
        with self.assertRaises(contract.LauncherInputError): self.verify()

    def test_rejects_identity_and_run_mismatches(self):
        for key, value in (("version", "9.9.9"), ("commit_sha", "f" * 40),
                           ("tag", "launcher-beta-v9.9.9"), ("source_run_id", "6003")):
            with self.subTest(key=key), self.assertRaises(contract.LauncherInputError):
                self.verify(**{key: value})

    def test_rejects_provenance_and_signer_mismatches(self):
        self.provenance["signerThumbprint"] = "f" * 40
        self.write_files(); self.refresh_manifest()
        with self.assertRaises(contract.LauncherInputError): self.verify()
        self.provenance["signerThumbprint"] = "d" * 40
        self.write_files(); self.refresh_manifest()
        with self.assertRaises(contract.LauncherInputError): self.verify(signature_verifier=lambda *_: {"status": "NotSigned"})

    def test_rejects_schema_one_and_missing_schema_two_fields(self):
        original = dict(self.provenance)
        self.provenance["schema"] = 1
        self.write_files(); self.refresh_manifest()
        with self.assertRaises(contract.LauncherInputError): self.verify()

        for key in ("sourceWorkflow", "sourceEvent", "sourceRef", "timestampSignerThumbprint"):
            with self.subTest(missing=key):
                self.provenance = dict(original)
                self.provenance.pop(key)
                self.write_files(); self.refresh_manifest()
                with self.assertRaises(contract.LauncherInputError): self.verify()

    def test_rejects_invalid_values_for_each_schema_two_field(self):
        original = dict(self.provenance)
        invalid_fields = (
            ("sourceWorkflow", ["../untrusted-workflow.yml"]),
            ("sourceEvent", "pull_request"),
            ("sourceRef", "refs/tags/launcher-beta-v9.9.9"),
            ("timestampSignerThumbprint", "untrusted-thumbprint"),
        )
        for key, value in invalid_fields:
            with self.subTest(field=key):
                self.provenance = dict(original)
                self.provenance[key] = value
                self.write_files(); self.refresh_manifest()
                with self.assertRaises(contract.LauncherInputError): self.verify()

    def test_rejects_untrusted_provenance_changed_after_publisher_manifest_creation(self):
        self.provenance["sourceRef"] = "refs/tags/attacker-retargeted"
        self.write_files()
        with self.assertRaises(contract.LauncherInputError): self.verify()

    def test_rejects_signature_without_exact_signer_or_timestamp(self):
        for proof in ({"status": "Valid", "thumbprint": "f" * 40, "timestamp_valid": True},
                      {"status": "Valid", "thumbprint": "d" * 40, "timestamp_valid": False}):
            with self.subTest(proof=proof), self.assertRaises(contract.LauncherInputError):
                self.verify(signature_verifier=lambda *_args, value=proof: value)

    def test_rejects_post_validation_source_change_and_existing_stage_target(self):
        result = self.verify()
        source = self.root / "launcher.exe"
        source.write_bytes(b"changed after validation")
        target = self.stage / "launcher" / "launcher.exe"
        with self.assertRaises(contract.LauncherInputError):
            contract.copy_verified_launcher(source, self.stage, result)
        source.write_bytes(self.exe)
        target.parent.mkdir(parents=True)
        target.write_bytes(b"preserve")
        with self.assertRaises(contract.LauncherInputError):
            contract.copy_verified_launcher(source, self.stage, result)
        self.assertEqual(target.read_bytes(), b"preserve")

    def test_rejects_synthetic_junction_parent_without_touching_external_target(self):
        result = self.verify()
        junction = self.stage / "junction"
        junction.mkdir()
        outside = Path(self.temp.name) / "external"
        outside.mkdir()
        sentinel = outside / "keep.bin"
        sentinel.write_bytes(b"EXTERNAL FIXTURE SENTINEL")
        original = contract._is_reparse

        def synthetic_reparse(path, info=None):
            return Path(path) == junction or original(path, info)

        with mock.patch.object(contract, "_is_reparse", side_effect=synthetic_reparse):
            with self.assertRaises(contract.LauncherInputError):
                contract.copy_verified_launcher(self.root / "launcher.exe", self.stage, result,
                                                "junction/launcher.exe")
        self.assertEqual(sentinel.read_bytes(), b"EXTERNAL FIXTURE SENTINEL")
        self.assertFalse((junction / "launcher.exe").exists())

    def test_cleans_partial_stage_file_after_write_failure(self):
        result = self.verify()
        target = self.stage / "launcher" / "launcher.exe"
        original_open = Path.open

        class FailedWriter:
            def __enter__(self):
                self.stream = original_open(target, "xb")
                return self
            def write(self, data):
                self.stream.write(data[:3])
                raise OSError("synthetic write failure")
            def __exit__(self, *_args):
                self.stream.close()

        def patched_open(path, mode="r", *args, **kwargs):
            if Path(path) == target and mode == "xb":
                return FailedWriter()
            return original_open(path, mode, *args, **kwargs)

        with mock.patch.object(Path, "open", new=patched_open):
            with self.assertRaises(OSError):
                contract.copy_verified_launcher(self.root / "launcher.exe", self.stage, result)
        self.assertFalse(target.exists())
        self.assertTrue(self.stage.is_dir())


if __name__ == "__main__":
    unittest.main()
