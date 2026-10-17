"""Synthetic CLI fixtures; no Authenticode, build, install, or network calls."""
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import launcher_publish_payload as publisher
import nsis_launcher_input_contract as launcher_contract
import verify_nsis_launcher_payload as cli


class VerifyNsisLauncherPayloadTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="nsis-launcher-cli-fixture-", dir=Path(__file__).resolve().parent)
        self.root = Path(self.temp.name)
        self.payload = self.root / "payload"
        self.payload.mkdir()
        self.stage = self.root / "stage"
        self.stage.mkdir()
        self.external = self.root / "external"
        self.external.mkdir()
        self.sentinel = self.external / "preserve.bin"
        self.sentinel.write_bytes(b"EXTERNAL SYNTHETIC SENTINEL")
        self.exe = b"SYNTHETIC SIGNED LAUNCHER"
        self.sha = hashlib.sha256(self.exe).hexdigest()
        self.release = {"schema": 1, "component": "launcher.exe", "version": "1.2.3",
                        "tag": "launcher-beta-v1.2.3", "commitSha": "a" * 40,
                        "bytes": len(self.exe), "sha256": self.sha}
        self.provenance = {
            "schema": 2, "component": "launcher.exe", "sourceRunId": 6002,
            "sourceWorkflow": ".github/workflows/build-launcher.yml",
            "sourceEvent": "push", "sourceRef": "refs/tags/launcher-beta-v1.2.3",
            "sourceCommitSha": "a" * 40, "version": "1.2.3", "tag": "launcher-beta-v1.2.3",
            "toolchain": "go1.24.10", "target": "windows/amd64", "cgoEnabled": False,
            "moduleMode": "-mod=readonly", "buildFlags": ["-trimpath", "-buildvcs=false", "-ldflags", "-H windowsgui -s -w"],
            "candidateBytes": 123, "candidateSha256": "b" * 64, "candidateManifestSha256": "c" * 64,
            "signedBytes": len(self.exe), "signedSha256": self.sha,
            "expectedSignerThumbprint": "d" * 40, "signerThumbprint": "d" * 40,
            "timestampSignerThumbprint": "e" * 40,
        }
        self.write_sidecars()
        self.refresh_manifest()

    def tearDown(self):
        self.temp.cleanup()

    def write_sidecars(self):
        (self.payload / "launcher.exe").write_bytes(self.exe)
        (self.payload / "launcher-release.json").write_text(json.dumps(self.release), encoding="utf-8")
        (self.payload / "launcher-build-provenance.json").write_text(json.dumps(self.provenance), encoding="utf-8")

    def refresh_manifest(self):
        manifest = self.payload / publisher.MANIFEST_NAME
        manifest.unlink(missing_ok=True)
        publisher.create_manifest(self.payload, "Loggableim/ltth.app", "7001", "6002", "a" * 40,
                                  "e" * 40, "launcher-beta-v1.2.3")

    def signature_provider(self, _path, _thumbprint, _publisher):
        return {"status": "Valid", "thumbprint": "d" * 40,
                "publisher_subject": "CN=LTTH Synthetic Publisher", "timestamp_valid": True}

    def argv(self, action="verify", stage=None, **overrides):
        values = {"payload": self.payload, "stage": stage,
                  "version": "1.2.3", "commit-sha": "a" * 40, "tag": "launcher-beta-v1.2.3",
                  "source-run-id": "6002", "publisher-run-id": "7001", "handoff-commit-sha": "e" * 40,
                  "expected-publisher-subject": "CN=LTTH Synthetic Publisher",
                  "launcher-signer-thumbprint": "d" * 40,
                  "signtool": self.root / "synthetic signtool.exe"}
        values.update(overrides)
        args = ["--action", action]
        for key, value in values.items():
            if value is not None:
                args.extend((f"--{key}", str(value)))
        return args

    def run_cli(self, action="verify", stage=None, signature_provider=None, **overrides):
        return cli.main(self.argv(action, stage, **overrides),
                        signature_provider=signature_provider or self.signature_provider)

    def test_verify_only_accepts_match_without_writing_stage_or_payload(self):
        before = {item.name: item.read_bytes() for item in self.payload.iterdir()}
        self.assertEqual(self.run_cli(), 0)
        self.assertEqual({item.name: item.read_bytes() for item in self.payload.iterdir()}, before)
        self.assertEqual(list(self.stage.iterdir()), [])

    def test_stage_creates_exact_receipt_and_stage_verification_rechecks_all_identity(self):
        self.assertEqual(self.run_cli("stage", self.stage), 0)
        launcher = self.stage / "launcher/launcher.exe"
        self.assertEqual(launcher.read_bytes(), self.exe)
        receipt = json.loads((self.stage / cli.RECEIPT_NAME).read_text(encoding="utf-8"))
        self.assertEqual(receipt, {
            "schemaVersion": 1, "version": "1.2.3", "commitSha": "a" * 40,
            "tag": "launcher-beta-v1.2.3", "sourceRunId": "6002", "publisherRunId": "7001",
            "handoffCommitSha": "e" * 40, "publisherSubject": "CN=LTTH Synthetic Publisher",
            "launcherSignerThumbprint": "d" * 40, "bytes": len(self.exe), "sha256": self.sha,
            "path": "launcher/launcher.exe",
        })
        self.assertEqual(self.run_cli("verify-stage", self.stage), 0)
        self.assertEqual(self.sentinel.read_bytes(), b"EXTERNAL SYNTHETIC SENTINEL")

    def test_external_publisher_run_and_handoff_commit_are_required_and_matched(self):
        for key, value in (("publisher-run-id", "7002"), ("handoff-commit-sha", "f" * 40)):
            with self.subTest(key=key):
                self.assertEqual(self.run_cli(**{key: value}), 1)

    def test_expected_version_commit_tag_and_run_are_validated(self):
        for key, value in (("version", "9.9.9"), ("commit-sha", "f" * 40),
                           ("tag", "launcher-beta-v9.9.9"), ("source-run-id", "6003")):
            with self.subTest(key=key):
                self.assertEqual(self.run_cli(**{key: value}), 1)
        self.assertEqual(self.run_cli(version="1.2.3", tag="launcher-beta-v9.8.7"), 1)

    def test_publisher_subject_signer_and_timestamp_must_match(self):
        self.assertEqual(self.run_cli(**{"expected-publisher-subject": "CN=Wrong Publisher"}), 1)
        self.assertEqual(self.run_cli(**{"launcher-signer-thumbprint": "f" * 40}), 1)
        self.assertEqual(self.run_cli(signature_provider=lambda *_: {
            "status": "Valid", "thumbprint": "d" * 40,
            "publisher_subject": "CN=LTTH Synthetic Publisher", "timestamp_valid": False,
        }), 1)
        self.assertEqual(self.run_cli(signature_provider=lambda *_: {"status": "NotSigned"}), 1)

    def test_signtool_timestamp_gate_uses_required_authenticode_policy_and_fails_closed(self):
        launcher = self.payload / "launcher.exe"
        signtool = self.root / "synthetic signtool.exe"
        calls = []

        def success(argv, **kwargs):
            calls.append((argv, kwargs))
            return mock.Mock(returncode=0)

        cli._verify_signtool_timestamp(launcher, signtool, runner=success)
        self.assertEqual(calls[0][0], [str(signtool), "verify", "/pa", "/all", "/tw", str(launcher)])
        self.assertTrue(calls[0][1]["check"] is False)
        for status in (1, 2):
            with self.subTest(status=status), self.assertRaises(cli.VerificationError):
                cli._verify_signtool_timestamp(
                    launcher, signtool, runner=lambda *_args, **_kwargs: mock.Mock(returncode=status))

    def test_payload_sidecars_and_bytes_must_match_exact_external_values(self):
        self.release["version"] = "9.9.9"
        self.write_sidecars(); self.refresh_manifest()
        self.assertEqual(self.run_cli(), 1)
        self.release["version"] = "1.2.3"
        self.write_sidecars(); self.refresh_manifest()
        (self.payload / "launcher.exe").write_bytes(b"STALE EXE")
        self.refresh_manifest()
        self.assertEqual(self.run_cli(), 1)
        (self.payload / "launcher.exe").write_bytes(self.exe)
        self.refresh_manifest()
        (self.payload / "unexpected.bin").write_bytes(b"extra")
        self.assertEqual(self.run_cli(), 1)

    def test_missing_launcher_or_manifest_sidecar_fails_before_any_stage_write(self):
        for name in ("launcher.exe", "launcher-release.json", "launcher-build-provenance.json",
                     "publish-payload.manifest"):
            with self.subTest(name=name):
                self.write_sidecars(); self.refresh_manifest()
                target = self.payload / name
                original = target.read_bytes()
                target.unlink()
                self.assertEqual(self.run_cli("stage", self.stage), 1)
                self.assertEqual(list(self.stage.iterdir()), [])
                target.write_bytes(original)

    def test_stage_receipt_and_staged_hash_must_match_external_identity(self):
        self.assertEqual(self.run_cli("stage", self.stage), 0)
        receipt_path = self.stage / cli.RECEIPT_NAME
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        receipt["publisherRunId"] = "7002"
        receipt_path.write_text(json.dumps(receipt), encoding="utf-8")
        self.assertEqual(self.run_cli("verify-stage", self.stage), 1)
        receipt["publisherRunId"] = "7001"
        receipt_path.write_text(json.dumps(receipt), encoding="utf-8")
        (self.stage / "launcher/launcher.exe").write_bytes(b"stale stage exe")
        self.assertEqual(self.run_cli("verify-stage", self.stage), 1)

    def test_rejects_relative_stage_root_and_synthetic_junction_without_external_writes(self):
        self.assertEqual(self.run_cli("stage", Path("relative-stage")), 1)
        root = self.stage
        original = launcher_contract._is_reparse

        def synthetic_junction(path, info=None):
            return Path(path) == root or original(path, info)

        with mock.patch.object(launcher_contract, "_is_reparse", side_effect=synthetic_junction):
            self.assertEqual(self.run_cli("stage", root), 1)
        self.assertEqual(list(root.iterdir()), [])
        self.assertEqual(self.sentinel.read_bytes(), b"EXTERNAL SYNTHETIC SENTINEL")

    def test_existing_receipt_is_preserved_and_new_launcher_is_removed_on_receipt_collision(self):
        receipt_path = self.stage / cli.RECEIPT_NAME
        receipt_path.write_bytes(b"PREEXISTING RECEIPT")
        self.assertEqual(self.run_cli("stage", self.stage), 1)
        self.assertEqual(receipt_path.read_bytes(), b"PREEXISTING RECEIPT")
        self.assertFalse((self.stage / "launcher/launcher.exe").exists())

    def test_partial_receipt_write_failure_cleans_only_new_stage_files(self):
        target = self.stage / cli.RECEIPT_NAME
        original_open = Path.open

        class FailingWriter:
            def __enter__(self):
                self.stream = original_open(target, "xb")
                return self
            def write(self, data):
                self.stream.write(data[:5])
                raise OSError("synthetic receipt write failure")
            def flush(self):
                self.stream.flush()
            def fileno(self):
                return self.stream.fileno()
            def __exit__(self, *_args):
                self.stream.close()

        def patched_open(path, mode="r", *args, **kwargs):
            if Path(path) == target and mode == "xb":
                return FailingWriter()
            return original_open(path, mode, *args, **kwargs)

        with mock.patch.object(Path, "open", new=patched_open):
            self.assertEqual(self.run_cli("stage", self.stage), 1)
        self.assertFalse(target.exists())
        self.assertFalse((self.stage / "launcher/launcher.exe").exists())
        self.assertEqual(self.sentinel.read_bytes(), b"EXTERNAL SYNTHETIC SENTINEL")


if __name__ == "__main__":
    unittest.main()
