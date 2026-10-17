"""Real Windows read-lock lifetime; synthetic bytes/child, never NSIS/signing."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest

import prepare_nsis_public_stage as stage


@unittest.skipUnless(os.name == "nt", "Windows sharing semantics required")
class LauncherReadLockIntegration(unittest.TestCase):
    def test_diagnostic_parent_rename_with_leaf_handles(self):
        self._diagnostic_parent_rename()

    def test_diagnostic_next_owned_temp_ancestor_rename_with_leaf_handles(self):
        # This is a local filesystem observation, not a general ancestor/Junction guarantee.
        self._diagnostic_parent_rename(next_ancestor=True)

    def _diagnostic_parent_rename(self, next_ancestor=False):
        """One namespace probe; accepts either OS result without claiming containment."""
        with tempfile.TemporaryDirectory(prefix="nsis-parent-diagnostic-") as temporary:
            root = Path(temporary)
            destination = root / "owned-temp-ancestor/stage" if next_ancestor else root / "stage"
            rename_target = destination.parent if next_ancestor else destination
            (destination / "launcher").mkdir(parents=True)
            paths = [destination / "nsis-launcher-stage.json", destination / "launcher/launcher.exe"]
            for path in paths:
                path.write_bytes(b"SYNTHETIC ORIGINAL BYTES")
            moved = root / "stage-renamed"
            ready, release, result = (root / name for name in ("ready", "release", "result"))
            child = root / "fake_reader.py"
            child.write_text(
                "import sys,time,json\nfrom pathlib import Path\n"
                "paths=[Path(x) for x in sys.argv[1:3]]\n"
                "before=[p.read_bytes().hex() for p in paths]\n"
                "Path(sys.argv[3]).write_text('ready')\n"
                "deadline=time.monotonic()+8\n"
                "while not Path(sys.argv[4]).exists():\n"
                " if time.monotonic()>deadline: raise RuntimeError('timeout')\n"
                " time.sleep(.01)\n"
                "try: after=[p.read_bytes().hex() for p in paths]\n"
                "except OSError:\n"
                " Path(sys.argv[5]).write_text('ABORT_MISSING_BOUND_PATH');sys.exit(23)\n"
                "Path(sys.argv[5]).write_text(json.dumps([before,after]))\n", encoding="utf-8")
            renamed = False
            process = None
            try:
                with stage.read_locks(paths):
                    process = subprocess.Popen([sys.executable, "-B", str(child), *map(str, paths),
                                                str(ready), str(release), str(result)])
                    deadline = time.monotonic() + 5
                    while not ready.exists():
                        if process.poll() is not None or time.monotonic() > deadline:
                            self.fail("Diagnostic child missed handshake")
                        time.sleep(.01)
                    try:
                        rename_target.rename(moved)  # exactly one own namespace attempt per diagnostic
                        renamed = True
                    except OSError as error:
                        print(f"DIAGNOSTIC {'next ancestor' if next_ancestor else 'stage'} rename denied: winerror={getattr(error, 'winerror', None)}")
                    release.write_text("continue", encoding="utf-8")
                    code = process.wait(timeout=5)
                    if renamed:
                        self.assertFalse(destination.exists())
                        self.assertEqual(code, 23)
                        self.assertEqual(result.read_text(), "ABORT_MISSING_BOUND_PATH")
                        print("DIAGNOSTIC parent rename succeeded; fake consumer aborted, no replacement path created")
                    else:
                        self.assertEqual(code, 0)
                        before, after = json.loads(result.read_text())
                        self.assertEqual(before, after)
            finally:
                if process is not None and process.poll() is None:
                    process.terminate()
                    process.wait(timeout=5)
                # Restore only after handles close, even following an assertion/error.
                if renamed and moved.exists() and not rename_target.exists():
                    moved.rename(rename_target)
            for path in paths:
                self.assertEqual(path.read_bytes(), b"SYNTHETIC ORIGINAL BYTES")
            rename_target.rename(moved)  # unlocked control proves this fixture is renameable
            moved.rename(rename_target)

    def test_receipt_and_launcher_locked_through_child_then_released(self):
        for child_exit in (0, 7):
            with self.subTest(child_exit=child_exit), tempfile.TemporaryDirectory(prefix="nsis-lock-only-") as temporary:
                root = Path(temporary)
                repo = root / "repo"
                app = repo / "app"
                (app / "config").mkdir(parents=True)
                canonical = Path(__file__).resolve().parents[1] / "app/config/plugin-release-policy.json"
                (app / "config/plugin-release-policy.json").write_bytes(canonical.read_bytes())
                for name, content in {"package.json": b'{"version":"9.8.7"}', "package-lock.json": b'{}',
                                      "server.js": b'// synthetic', "launch.js": b'// synthetic',
                                      ".env.example": b'API_KEY=__SYNTHETIC_PLACEHOLDER__\n'}.items():
                    (app / name).write_bytes(content)
                destination = root / "stage"
                stage.prepare(repo, destination)
                launcher = destination / "launcher/launcher.exe"
                launcher.parent.mkdir()
                launcher.write_bytes(b"SYNTHETIC TEXT NOT A PE EXECUTABLE")
                receipt = destination / "nsis-launcher-stage.json"
                receipt.write_text('{"fixture":"synthetic, no signature proof"}', encoding="utf-8")
                original = {path: path.read_bytes() for path in (receipt, launcher)}
                script = root / "unused-installer.nsi"
                script.write_text("; never compiled", encoding="utf-8")
                child = root / "fake_consumer.py"
                ready, release, result = (root / name for name in ("ready", "release", "result"))
                child.write_text(
                    "import sys,time,json,hashlib\nfrom pathlib import Path\n"
                    "paths=[Path(x) for x in sys.argv[1:3]]\n"
                    "before=[hashlib.sha256(p.read_bytes()).hexdigest() for p in paths]\n"
                    "Path(sys.argv[3]).write_text('ready')\n"
                    "deadline=time.monotonic()+8\n"
                    "while not Path(sys.argv[4]).exists():\n"
                    " if time.monotonic()>deadline: raise RuntimeError('handshake timeout')\n"
                    " time.sleep(.01)\n"
                    "after=[hashlib.sha256(p.read_bytes()).hexdigest() for p in paths]\n"
                    "Path(sys.argv[5]).write_text(json.dumps([before,after]))\n"
                    "sys.exit(int(sys.argv[6]))\n", encoding="utf-8")
                calls = []

                def runner(argv, **kwargs):
                    calls.append(argv)
                    if "verify-stage" in argv:
                        # Only signature verification is synthetic; actual compile locks and
                        # APP verification remain production functions, not mocked.
                        self.assertEqual({p: p.read_bytes() for p in original}, original)
                        return subprocess.CompletedProcess(argv, 0)
                    self.assertIn("/DLAUNCHER_EXE=" + str(launcher), argv)
                    process = subprocess.Popen([sys.executable, "-B", str(child), str(receipt), str(launcher),
                                                str(ready), str(release), str(result), str(child_exit)])
                    try:
                        deadline = time.monotonic() + 5
                        while not ready.exists():
                            if process.poll() is not None or time.monotonic() > deadline:
                                self.fail("Fake consumer did not reach handshake")
                            time.sleep(.01)
                        for path in original:
                            for operation in (lambda p: p.write_bytes(b"tamper"),
                                              lambda p: p.unlink(),
                                              lambda p: p.rename(p.with_name(p.name + ".moved"))):
                                with self.assertRaises(OSError):
                                    operation(path)
                            self.assertEqual(path.read_bytes(), original[path])
                        release.write_text("continue", encoding="utf-8")
                        code = process.wait(timeout=5)
                        expected = [hashlib.sha256(original[p]).hexdigest() for p in (receipt, launcher)]
                        self.assertEqual(json.loads(result.read_text()), [expected, expected])
                        return subprocess.CompletedProcess(argv, code)
                    finally:
                        if process.poll() is None:
                            process.terminate()
                            process.wait(timeout=5)

                def invoke():
                    stage.compile_stage(repo, destination, script, ["never-a-compiler"],
                                        launcher_verify_args=["--fixture-only"], runner=runner)

                if child_exit:
                    with self.assertRaisesRegex(ValueError, "NSIS child failed"):
                        invoke()
                else:
                    invoke()
                self.assertEqual(len(calls), 2)
                for path, content in original.items():
                    self.assertEqual(path.read_bytes(), content)
                    path.write_bytes(content)  # write handle now available
                    moved = path.with_name(path.name + ".released")
                    path.rename(moved)
                    moved.rename(path)
                    path.unlink()  # delete handle now available; only synthetic owned files
                    path.write_bytes(content)


if __name__ == "__main__":
    unittest.main()
