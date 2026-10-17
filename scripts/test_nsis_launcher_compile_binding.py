"""CPU-only launcher-to-NSIS binding tests; no compiler or signing tools run."""
import contextlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import prepare_nsis_public_stage as stage


class LauncherCompileBindingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="nsis-launcher-binding-",
                                                dir=Path(__file__).resolve().parent)
        self.root = Path(self.temp.name)
        temp_root_patch = mock.patch("tempfile.gettempdir", return_value=str(self.root))
        temp_root_patch.start()
        self.addCleanup(temp_root_patch.stop)
        self.repo = self.root / "repo"
        self.public_stage = self.root / "stage"
        self.app = self.public_stage / "app"
        self.app.mkdir(parents=True)
        self.script = self.root / "installer.nsi"
        self.script.write_text("; synthetic NSIS input", encoding="utf-8")
        (self.app / "server.js").write_bytes(b"synthetic app")
        inventory = {"server.js": "synthetic-hash"}
        (self.public_stage / "nsis-public-stage.json").write_text(json.dumps({"files": inventory}), encoding="utf-8")
        self.launcher_dir = self.public_stage / "launcher"
        self.launcher_dir.mkdir()
        self.launcher = self.launcher_dir / "launcher.exe"
        self.launcher.write_bytes(b"synthetic signed launcher")
        (self.public_stage / "nsis-launcher-stage.json").write_text("{}", encoding="utf-8")
        self.payload = self.root / "payload"
        self.payload.mkdir()
        self.signtool = self.root / "synthetic signtool.exe"
        self.local_launcher = self.root / "local launcher.exe"
        self.local_launcher.write_bytes(b"developer-only launcher")
        self.launcher_args = ["--payload", str(self.payload), "--version", "1.2.3",
            "--commit-sha", "a" * 40, "--tag", "launcher-v1.2.3", "--source-run-id", "11",
            "--publisher-run-id", "12", "--handoff-commit-sha", "b" * 40,
            "--expected-publisher-subject", "CN=Fixture", "--launcher-signer-thumbprint", "c" * 40,
            "--signtool", str(self.signtool)]

    def tearDown(self):
        self.temp.cleanup()

    def compile(self, *, release=True, verify_status=0):
        calls = []
        lock_groups = []

        def fake_runner(argv, **kwargs):
            calls.append((argv, kwargs))
            return mock.Mock(returncode=verify_status if len(calls) == 1 and release else 0)

        with mock.patch.object(stage, "verify"), mock.patch.object(
                stage, "files", return_value={"server.js": self.app / "server.js"}):
            stage.compile_stage(self.repo, self.public_stage, self.script, ["compiler-spy"],
                launcher_verify_args=self.launcher_args if release else None,
                developer_launcher=None if release else self.local_launcher,
                runner=fake_runner,
                lock_provider=lambda paths: (lock_groups.append([Path(p) for p in paths]) or
                                             contextlib.nullcontext()))
        return calls, lock_groups

    def test_release_verifies_stage_before_compiler_and_uses_only_staged_launcher(self):
        calls, lock_groups = self.compile()
        self.assertEqual(len(calls), 2)
        verify_args = calls[0][0]
        self.assertIn("verify-stage", verify_args)
        self.assertIn(str(self.signtool), verify_args)
        self.assertIn(str(self.public_stage), verify_args)
        compiler_args = calls[1][0]
        self.assertTrue(any(arg == "/DLAUNCHER_EXE=" + str(self.launcher) for arg in compiler_args))
        self.assertFalse(any("local launcher" in arg for arg in compiler_args))
        self.assertNotIn("/DDEVELOPER_BUILD=1", compiler_args)
        self.assertEqual(set(lock_groups[-1]), {self.public_stage / "nsis-launcher-stage.json", self.launcher})

    def test_release_drift_fails_before_compiler(self):
        calls = []

        def failing_verifier(argv, **kwargs):
            calls.append(argv)
            return mock.Mock(returncode=1)

        with mock.patch.object(stage, "verify"), mock.patch.object(
                stage, "files", return_value={"server.js": self.app / "server.js"}), \
                self.assertRaisesRegex(ValueError, "verify-stage"):
            stage.compile_stage(self.repo, self.public_stage, self.script, ["compiler-spy"],
                launcher_verify_args=self.launcher_args, runner=failing_verifier,
                lock_provider=lambda _paths: contextlib.nullcontext())
        self.assertEqual(len(calls), 1)
        self.assertFalse(any("compiler-spy" in call for call in calls))

    def test_missing_launcher_mode_and_simultaneous_modes_fail_closed(self):
        with self.assertRaisesRegex(ValueError, "Choose exactly one"):
            stage.compile_stage(self.repo, self.public_stage, self.script, ["compiler-spy"],
                lock_provider=lambda _paths: contextlib.nullcontext())
        with self.assertRaisesRegex(ValueError, "Choose exactly one"):
            stage.compile_stage(self.repo, self.public_stage, self.script, ["compiler-spy"],
                launcher_verify_args=self.launcher_args, developer_launcher=self.local_launcher,
                lock_provider=lambda _paths: contextlib.nullcontext())

    def test_developer_uses_only_explicit_local_launcher_and_marks_output(self):
        calls, lock_groups = self.compile(release=False)
        self.assertEqual(len(calls), 1)
        compiler_args = calls[0][0]
        self.assertIn("/DLAUNCHER_EXE=" + str(self.local_launcher), compiler_args)
        self.assertIn("/DDEVELOPER_BUILD=1", compiler_args)
        self.assertFalse(any("verify-stage" in arg for arg in compiler_args))
        self.assertEqual(lock_groups[-1], [self.local_launcher])

    def test_batch_and_nsis_bind_release_identity_and_dev_marker(self):
        repo = Path(__file__).resolve().parents[1]
        batch = (repo / "build-src/installer/build-installer.bat").read_text(encoding="utf-8")
        nsi = (repo / "build-src/installer/ltth-installer.nsi").read_text(encoding="utf-8")
        self.assertIn("--action stage", batch)
        self.assertIn("--launcher-publisher-run-id", batch)
        self.assertIn("--signtool", batch)
        self.assertIn("--developer-launcher", batch)
        self.assertIn('File "${LAUNCHER_EXE}"', nsi)
        self.assertIn("!ifndef LAUNCHER_EXE", nsi)
        self.assertIn("NOT-FOR-DISTRIBUTION", nsi)
        self.assertNotIn('File "${BUILD_DIR}\\launcher.exe"', nsi)


if __name__ == "__main__":
    unittest.main()
