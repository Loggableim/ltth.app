import copy
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import verify_launcher_source_run as verifier
from verify_launcher_source_run import SourceRunError, source_run_receipt, validate_source_run


class SourceRunValidationTests(unittest.TestCase):
    def setUp(self):
        self.run = {
            "id": 12345,
            "repository": {"full_name": "Loggableim/ltth.app"},
            "path": ".github/workflows/release.yml@refs/tags/v1.2.3",
            "workflow_id": 101,
            "event": "push",
            "head_branch": "v1.2.3",
            "head_sha": "a" * 40,
            "status": "completed",
            "conclusion": "success",
        }
        self.workflow_ids = {
            ".github/workflows/release.yml": 101,
            ".github/workflows/build-launcher.yml": 202,
        }

    def test_accepts_successful_canonical_release_run(self):
        result = validate_source_run(self.run, self.workflow_ids, "12345", "a" * 40)
        self.assertEqual(result["run_id"], 12345)
        self.assertEqual(result["workflow"], ".github/workflows/release.yml")
        self.assertEqual(result["commit_sha"], "a" * 40)

    def test_emits_exact_versioned_receipt_for_verified_run(self):
        selected = validate_source_run(self.run, self.workflow_ids, "12345", "a" * 40)
        self.assertEqual(source_run_receipt(selected), {
            "schema": 1,
            "repository": "Loggableim/ltth.app",
            "runId": 12345,
            "workflow": ".github/workflows/release.yml",
            "event": "push",
            "ref": "refs/tags/v1.2.3",
            "commitSha": "a" * 40,
        })

    def test_cli_writes_receipt_only_from_successfully_validated_run(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1]) as directory:
            receipt_path = Path(directory) / "source-run.json"
            output_path = Path(directory) / "github-output.txt"
            args = ["verify_launcher_source_run.py", "--repository", "Loggableim/ltth.app",
                    "--run-id", "12345", "--commit-sha", "a" * 40,
                    "--receipt-output", str(receipt_path)]
            with patch.object(sys, "argv", args), patch.dict(os.environ, {
                "GH_TOKEN": "synthetic-token", "GITHUB_OUTPUT": str(output_path)
            }), patch.object(verifier, "fetch_source_run", return_value=(self.run, self.workflow_ids)):
                self.assertEqual(verifier.main(), 0)
            self.assertEqual(json.loads(receipt_path.read_text(encoding="utf-8")), source_run_receipt(
                validate_source_run(self.run, self.workflow_ids, "12345", "a" * 40)
            ))
            self.assertIn("workflow=.github/workflows/release.yml", output_path.read_text(encoding="utf-8"))

    def test_accepts_launcher_dispatch_only_from_main(self):
        run = copy.deepcopy(self.run)
        run.update({
            "path": ".github/workflows/build-launcher.yml@refs/heads/main",
            "workflow_id": 202,
            "event": "workflow_dispatch",
            "head_branch": "main",
        })
        self.assertEqual(validate_source_run(run, self.workflow_ids, "12345", "a" * 40)["ref"], "refs/heads/main")

    def assert_rejected_after(self, update):
        run = copy.deepcopy(self.run)
        run.update(update)
        with self.assertRaises(SourceRunError):
            validate_source_run(run, self.workflow_ids, "12345", "a" * 40)

    def test_rejects_wrong_repository(self):
        self.assert_rejected_after({"repository": {"full_name": "attacker/ltth.app"}})

    def test_rejects_wrong_workflow_path_or_identity(self):
        self.assert_rejected_after({"path": ".github/workflows/other.yml@refs/tags/v1.2.3"})
        self.assert_rejected_after({"workflow_id": 999})

    def test_rejects_wrong_event_or_ref(self):
        self.assert_rejected_after({"event": "pull_request"})
        self.assert_rejected_after({"path": ".github/workflows/release.yml@refs/heads/main", "head_branch": "main"})

    def test_rejects_wrong_sha_or_conclusion(self):
        self.assert_rejected_after({"head_sha": "b" * 40})
        self.assert_rejected_after({"conclusion": "failure"})
        self.assert_rejected_after({"status": "in_progress", "conclusion": None})

    def test_rejects_wrong_or_malformed_run_id(self):
        run = copy.deepcopy(self.run)
        run["id"] = 12346
        with self.assertRaises(SourceRunError):
            validate_source_run(run, self.workflow_ids, "12345", "a" * 40)
        for malformed in ("0", "-1", "abc"):
            with self.assertRaises(SourceRunError):
                validate_source_run(self.run, self.workflow_ids, malformed, "a" * 40)


if __name__ == "__main__":
    unittest.main()
