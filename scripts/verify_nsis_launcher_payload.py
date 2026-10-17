"""CLI for verify-only, stage-copy, and stage-verify of the NSIS launcher input.

Publisher/source identities are mandatory caller inputs. JSON in the payload or
stage is never used as a source of expected values. The local data-only payload
manifest proves consistency, not independent CI provenance.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import subprocess
import sys
from pathlib import Path
from typing import Callable

import launcher_publish_payload as publisher
import nsis_launcher_input_contract as launcher_contract


class VerificationError(ValueError):
    pass


RECEIPT_NAME = "nsis-launcher-stage.json"
STAGED_RELATIVE_PATH = "launcher/launcher.exe"
RECEIPT_FIELDS = {
    "schemaVersion", "version", "commitSha", "tag", "sourceRunId", "publisherRunId",
    "handoffCommitSha", "publisherSubject", "launcherSignerThumbprint", "bytes", "sha256", "path",
}
SHA1_RE = re.compile(r"^[0-9a-f]{40}$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
THUMBPRINT_RE = re.compile(r"^[0-9a-fA-F]{40}$")
RUN_RE = re.compile(r"^[1-9][0-9]*$")
VERSION_RE = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+$")


def _strict_json_bytes(raw: bytes, description: str) -> dict:
    def unique(pairs):
        result = {}
        folded = set()
        for key, value in pairs:
            normalized = key.casefold()
            if normalized in folded:
                raise VerificationError(f"{description} has duplicate/colliding keys")
            folded.add(normalized)
            result[key] = value
        return result

    try:
        parsed = json.loads(raw.decode("utf-8"), object_pairs_hook=unique,
                            parse_constant=lambda _value: (_ for _ in ()).throw(
                                VerificationError(f"{description} has a nonstandard number")))
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise VerificationError(f"{description} is not strict UTF-8 JSON") from exc
    if not isinstance(parsed, dict):
        raise VerificationError(f"{description} must be a JSON object")
    return parsed


def _require_regular_file(path: Path) -> os.stat_result:
    try:
        info = path.lstat()
    except OSError as exc:
        raise VerificationError("required stage file is missing or inaccessible") from exc
    if path.is_symlink() or getattr(info, "st_file_attributes", 0) & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400):
        raise VerificationError("reparse stage file is not allowed")
    if not stat.S_ISREG(info.st_mode):
        raise VerificationError("stage member must be a regular file")
    return info


def _is_reparse(path: Path, info=None) -> bool:
    try:
        current = info if info is not None else path.lstat()
    except OSError as exc:
        raise VerificationError("stage path cannot be inspected") from exc
    return path.is_symlink() or bool(
        getattr(current, "st_file_attributes", 0) & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400))


def _assert_stage_root(stage_root: str | Path) -> Path:
    root = Path(stage_root)
    if not root.is_absolute() or ".." in root.parts:
        raise VerificationError("StageRoot must be explicit, absolute, and traversal-free")
    root = Path(os.path.abspath(root))
    ancestor = root
    while True:
        try:
            info = ancestor.lstat()
        except OSError as exc:
            raise VerificationError("StageRoot or its ancestor is missing/inaccessible") from exc
        if (_is_reparse(ancestor, info) or
            not stat.S_ISDIR(info.st_mode)):
            raise VerificationError("StageRoot and all ancestors must be regular directories")
        if ancestor.parent == ancestor:
            break
        ancestor = ancestor.parent
    return root


def _assert_existing_stage_member(root: Path, relative: str) -> Path:
    candidate = root / relative
    try:
        if os.path.commonpath((str(root), str(candidate))) != str(root):
            raise VerificationError("stage member escapes StageRoot")
    except ValueError as exc:
        raise VerificationError("stage member is outside StageRoot") from exc
    cursor = candidate.parent
    while True:
        try:
            info = cursor.lstat()
        except OSError as exc:
            raise VerificationError("stage parent is missing or inaccessible") from exc
        if (_is_reparse(cursor, info) or
            not stat.S_ISDIR(info.st_mode)):
            raise VerificationError("stage parent must be a regular directory")
        if cursor == root:
            break
        if root not in cursor.parents:
            raise VerificationError("stage parent escapes StageRoot")
        cursor = cursor.parent
    _require_regular_file(candidate)
    return candidate


def _validate_expectations(*, version: str, commit_sha: str, tag: str,
                           source_run_id: str, publisher_run_id: str,
                           handoff_commit_sha: str, publisher_subject: str,
                           launcher_signer_thumbprint: str) -> dict:
    if not VERSION_RE.fullmatch(version) or not SHA1_RE.fullmatch(commit_sha):
        raise VerificationError("expected launcher version or source commit is malformed")
    if tag not in {f"v{version}", f"launcher-v{version}", f"launcher-beta-v{version}"}:
        raise VerificationError("expected tag does not correspond to the expected version")
    if not RUN_RE.fullmatch(str(source_run_id)) or not RUN_RE.fullmatch(str(publisher_run_id)):
        raise VerificationError("expected source/publisher run ID is malformed")
    if not SHA1_RE.fullmatch(handoff_commit_sha):
        raise VerificationError("expected handoff commit SHA is malformed")
    if not publisher_subject.strip() or "\x00" in publisher_subject:
        raise VerificationError("expected Authenticode publisher subject is required")
    if not THUMBPRINT_RE.fullmatch(launcher_signer_thumbprint):
        raise VerificationError("expected launcher signer thumbprint is malformed")
    return {
        "version": version,
        "commitSha": commit_sha.lower(),
        "tag": tag,
        "sourceRunId": str(source_run_id),
        "publisherRunId": str(publisher_run_id),
        "handoffCommitSha": handoff_commit_sha.lower(),
        "publisherSubject": publisher_subject,
        "launcherSignerThumbprint": launcher_signer_thumbprint.lower(),
    }


def _verify_signtool_timestamp(path: Path, signtool: Path, *, runner=subprocess.run) -> None:
    """Require Windows Authenticode policy verification and a timestamp."""
    try:
        result = runner([str(signtool), "verify", "/pa", "/all", "/tw", str(path)],
                        capture_output=True, text=True, check=False)
    except OSError as exc:
        raise VerificationError("SignTool Authenticode verification could not be started") from exc
    # SignTool uses 2 for warnings; a missing/untrusted timestamp must fail closed.
    if result.returncode != 0:
        raise VerificationError("SignTool did not verify the launcher signature and timestamp")


def _powershell_authenticode(path: Path, expected_thumbprint: str,
                             expected_publisher_subject: str, signtool: Path) -> dict:
    """Return trusted local Authenticode status; no payload values enter code."""
    if os.name != "nt":
        raise VerificationError("Windows Authenticode verification is only available on Windows")
    script = r'''
$ErrorActionPreference = 'Stop'
$signature = Get-AuthenticodeSignature -LiteralPath $env:LTTH_AUTHENTICODE_PATH
$timestamp = $signature.PSObject.Properties['TimeStamperCertificate']
$timestampValid = $null -ne $timestamp -and $null -ne $timestamp.Value
$subject = if ($null -ne $signature.SignerCertificate) { [string]$signature.SignerCertificate.Subject } else { '' }
$thumbprint = if ($null -ne $signature.SignerCertificate) { [string]$signature.SignerCertificate.Thumbprint } else { '' }
[pscustomobject]@{ status = [string]$signature.Status; thumbprint = $thumbprint.ToLowerInvariant(); publisher_subject = $subject; timestamp_valid = $timestampValid } | ConvertTo-Json -Compress
'''
    child_env = os.environ.copy()
    child_env["LTTH_AUTHENTICODE_PATH"] = str(path)
    try:
        result = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script],
                                env=child_env, capture_output=True, text=True, check=False)
    except OSError as exc:
        raise VerificationError("PowerShell Authenticode provider could not be started") from exc
    if result.returncode != 0:
        raise VerificationError("PowerShell Authenticode verification failed")
    proof = _strict_json_bytes(result.stdout.encode("utf-8"), "Authenticode result")
    if set(proof) != {"status", "thumbprint", "publisher_subject", "timestamp_valid"}:
        raise VerificationError("Authenticode provider returned an unexpected result")
    if proof["status"] == "Valid" and proof["timestamp_valid"] is True:
        _verify_signtool_timestamp(path, signtool)
    else:
        proof["timestamp_valid"] = False
    return proof


def _validate_payload(payload_dir: str | Path, expected: dict,
                      signature_provider: Callable[[Path, str, str], dict]) -> dict:
    root = Path(payload_dir)
    if not root.is_absolute() or ".." in root.parts:
        raise VerificationError("publisher payload directory must be absolute and traversal-free")

    def signature_verifier(path: Path, expected_thumbprint: str) -> dict:
        proof = signature_provider(path, expected_thumbprint, expected["publisherSubject"])
        if (not isinstance(proof, dict) or proof.get("publisher_subject") != expected["publisherSubject"]):
            raise VerificationError("launcher Authenticode publisher subject does not match expected publisher")
        return {
            "status": proof.get("status"),
            "thumbprint": str(proof.get("thumbprint", "")).lower(),
            "timestamp_valid": proof.get("timestamp_valid"),
        }

    try:
        result = launcher_contract.validate_payload(
            root,
            version=expected["version"],
            commit_sha=expected["commitSha"],
            tag=expected["tag"],
            source_run_id=expected["sourceRunId"],
            publisher_run_id=expected["publisherRunId"],
            handoff_commit_sha=expected["handoffCommitSha"],
            launcher_signer_thumbprint=expected["launcherSignerThumbprint"],
            signature_verifier=signature_verifier,
        )
    except (launcher_contract.LauncherInputError, publisher.PayloadError) as exc:
        raise VerificationError("launcher payload validation failed") from exc
    # The contract helper currently returns only this subset. Fill the rest from
    # external expected values, after validate_payload has checked them against
    # the payload manifest and release/provenance sidecars.
    return {**expected, "bytes": result["bytes"], "sha256": result["sha256"]}


def _expected_receipt(expected: dict) -> dict:
    return {"schemaVersion": 1, **expected, "bytes": expected["bytes"],
            "sha256": expected["sha256"], "path": STAGED_RELATIVE_PATH}


def verify_stage(stage_root: str | Path, expected: dict) -> Path:
    root = _assert_stage_root(stage_root)
    receipt_path = root / RECEIPT_NAME
    receipt_info = _require_regular_file(receipt_path)
    if receipt_info.st_size > 16384:
        raise VerificationError("launcher stage receipt is oversized")
    receipt = _strict_json_bytes(receipt_path.read_bytes(), "launcher stage receipt")
    if set(receipt) != RECEIPT_FIELDS or receipt != _expected_receipt(expected):
        raise VerificationError("launcher stage receipt does not match external release identity")
    launcher_path = _assert_existing_stage_member(root, STAGED_RELATIVE_PATH)
    launcher_info = _require_regular_file(launcher_path)
    digest = hashlib.sha256(launcher_path.read_bytes()).hexdigest()
    if launcher_info.st_size != expected["bytes"] or digest != expected["sha256"]:
        raise VerificationError("staged launcher size or SHA-256 does not match verified payload")
    return launcher_path


def _file_identity(path: Path) -> tuple[int, int]:
    info = _require_regular_file(path)
    return info.st_dev, info.st_ino


def _remove_own_file(path: Path, identity: tuple[int, int] | None) -> None:
    try:
        current = path.lstat()
    except FileNotFoundError:
        return
    except OSError as exc:
        raise VerificationError("stage cleanup path cannot be inspected") from exc
    if (path.is_symlink() or
        getattr(current, "st_file_attributes", 0) & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400) or
        not stat.S_ISREG(current.st_mode)):
        raise VerificationError("stage cleanup refused to remove a non-regular file")
    if identity is None:
        raise VerificationError("stage cleanup has no identity for the newly created file")
    if (current.st_dev, current.st_ino) != identity:
        raise VerificationError("stage cleanup refused to remove a replaced file")
    path.unlink()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--action", choices=("verify", "stage", "verify-stage"), required=True)
    parser.add_argument("--payload", type=Path, required=True)
    parser.add_argument("--stage", type=Path)
    parser.add_argument("--version", required=True)
    parser.add_argument("--commit-sha", required=True)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--source-run-id", required=True)
    parser.add_argument("--publisher-run-id", required=True)
    parser.add_argument("--handoff-commit-sha", required=True)
    parser.add_argument("--expected-publisher-subject", required=True)
    parser.add_argument("--launcher-signer-thumbprint", required=True)
    parser.add_argument("--signtool", type=Path, required=True,
                        help="explicit signtool.exe used for Authenticode and timestamp verification")
    return parser


def main(argv=None, *, signature_provider=None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.action in {"stage", "verify-stage"} and args.stage is None:
        parser.error("--stage is required for stage and verify-stage actions")
    if args.action == "verify" and args.stage is not None:
        parser.error("--stage is not accepted for verify action")
    try:
        expected = _validate_expectations(
            version=args.version, commit_sha=args.commit_sha, tag=args.tag,
            source_run_id=args.source_run_id, publisher_run_id=args.publisher_run_id,
            handoff_commit_sha=args.handoff_commit_sha,
            publisher_subject=args.expected_publisher_subject,
            launcher_signer_thumbprint=args.launcher_signer_thumbprint,
        )
        provider = signature_provider or (
            lambda path, thumbprint, subject: _powershell_authenticode(
                path, thumbprint, subject, args.signtool))
        verified = _validate_payload(args.payload, expected, provider)
        if args.action == "stage":
            launcher_path = launcher_contract.copy_verified_launcher(
                args.payload / "launcher.exe", _assert_stage_root(args.stage), verified,
                STAGED_RELATIVE_PATH)
            launcher_identity = _file_identity(launcher_path)
            receipt_path = _assert_stage_root(args.stage) / RECEIPT_NAME
            created_receipt = False
            receipt_identity = None
            try:
                with receipt_path.open("xb") as output:
                    created_receipt = True
                    file_info = os.fstat(output.fileno())
                    receipt_identity = (file_info.st_dev, file_info.st_ino)
                    output.write((json.dumps(_expected_receipt(verified), sort_keys=True,
                                             separators=(",", ":")) + "\n").encode("utf-8"))
                    output.flush()
                    os.fsync(output.fileno())
                verify_stage(args.stage, verified)
            except BaseException:
                cleanup_errors = []
                if created_receipt:
                    try:
                        _remove_own_file(receipt_path, receipt_identity)
                    except (OSError, VerificationError) as cleanup_error:
                        cleanup_errors.append(cleanup_error)
                try:
                    _remove_own_file(launcher_path, launcher_identity)
                except (OSError, VerificationError) as cleanup_error:
                    cleanup_errors.append(cleanup_error)
                if cleanup_errors:
                    raise VerificationError("stage copy failed and owned-file cleanup was incomplete") from cleanup_errors[0]
                raise
            print("PASS: verified launcher staged with exact release identity and SHA-256")
        elif args.action == "verify-stage":
            verify_stage(args.stage, verified)
            print("PASS: staged launcher receipt and bytes match verified payload")
        else:
            print("PASS: launcher payload identity, hashes, Authenticode publisher/signer and timestamp verified")
        return 0
    except (VerificationError, launcher_contract.LauncherInputError, publisher.PayloadError, OSError) as exc:
        print(f"Launcher payload verification failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
