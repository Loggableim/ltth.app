"""Validate and stage a run-bound launcher payload for NSIS.

This validates local payload consistency only. Expected release identity and
the Authenticode result must come from independent trusted inputs.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import stat
from pathlib import Path

import launcher_publish_payload as payload


class LauncherInputError(ValueError):
    pass


RELEASE_FIELDS = {"schema", "component", "version", "tag", "commitSha", "bytes", "sha256"}
PROVENANCE_FIELDS = {
    "schema", "component", "sourceRunId", "sourceWorkflow", "sourceEvent", "sourceRef",
    "sourceCommitSha", "version", "tag", "toolchain",
    "target", "cgoEnabled", "moduleMode", "buildFlags", "candidateBytes", "candidateSha256",
    "candidateManifestSha256", "signedBytes", "signedSha256", "expectedSignerThumbprint", "signerThumbprint",
    "timestampSignerThumbprint",
}
SOURCE_WORKFLOWS = {
    ".github/workflows/release.yml",
    ".github/workflows/build-launcher.yml",
}
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
HASH_RE = re.compile(r"^[0-9a-f]{64}$")
THUMBPRINT_RE = re.compile(r"^[0-9a-fA-F]{40}$")


def _json_object(path: Path) -> dict:
    def unique(pairs):
        result = {}
        seen = set()
        for key, value in pairs:
            folded = key.casefold()
            if folded in seen:
                raise LauncherInputError("launcher JSON has duplicate/colliding keys")
            seen.add(folded)
            result[key] = value
        return result

    try:
        value = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique,
                           parse_constant=lambda _value: (_ for _ in ()).throw(LauncherInputError("invalid JSON number")))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise LauncherInputError("launcher sidecar is unreadable JSON") from exc
    if not isinstance(value, dict):
        raise LauncherInputError("launcher sidecar must be an object")
    return value


def _require_fields(value: dict, expected: set[str], description: str) -> None:
    if set(value) != expected:
        raise LauncherInputError(f"{description} field set mismatch")


def _is_reparse(path: Path, info=None) -> bool:
    if path.is_symlink():
        return True
    try:
        current = info if info is not None else path.lstat()
    except OSError as exc:
        raise LauncherInputError("stage path cannot be inspected") from exc
    return bool(getattr(current, "st_file_attributes", 0) & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400))


def _assert_regular_directory(path: Path) -> None:
    try:
        info = path.lstat()
    except OSError as exc:
        raise LauncherInputError("stage root/ancestor is missing or inaccessible") from exc
    if _is_reparse(path, info) or not stat.S_ISDIR(info.st_mode):
        raise LauncherInputError("stage root/ancestor must be a regular directory")


def _stage_destination(stage_root: str | Path, relative_destination: str) -> tuple[Path, Path]:
    root = Path(stage_root)
    if not root.is_absolute() or ".." in root.parts:
        raise LauncherInputError("absolute traversal-free StageRoot is required")
    relative = Path(relative_destination)
    if relative.is_absolute() or not relative.parts or any(part in ("", ".", "..") for part in relative.parts):
        raise LauncherInputError("launcher destination must be a safe relative path")
    root = Path(os.path.abspath(root))
    destination = Path(os.path.abspath(root / relative))
    try:
        if os.path.commonpath((str(root), str(destination))) != str(root):
            raise LauncherInputError("launcher destination escapes StageRoot")
    except ValueError as exc:
        raise LauncherInputError("launcher destination is outside StageRoot") from exc

    # The existing root and every existing ancestor to the volume root must be
    # ordinary directories. This rejects junction-backed temp/stage paths too.
    ancestor = root
    while True:
        _assert_regular_directory(ancestor)
        if ancestor.parent == ancestor:
            break
        ancestor = ancestor.parent
    cursor = destination.parent
    missing = []
    while cursor != root:
        if cursor.exists() or cursor.is_symlink():
            _assert_regular_directory(cursor)
        else:
            missing.append(cursor)
        if cursor.parent == cursor or root not in cursor.parents:
            raise LauncherInputError("launcher parent escapes StageRoot")
        cursor = cursor.parent
    for directory in reversed(missing):
        try:
            directory.mkdir()
        except FileExistsError:
            pass
        _assert_regular_directory(directory)
    # Recheck immediately before creating the leaf to reject a swapped parent.
    cursor = destination.parent
    while True:
        _assert_regular_directory(cursor)
        if cursor == root:
            break
        cursor = cursor.parent
    return root, destination


def validate_payload(directory: str | Path, *, version: str, commit_sha: str, tag: str,
                     source_run_id: str, publisher_run_id: str, handoff_commit_sha: str,
                     launcher_signer_thumbprint: str,
                     signature_verifier) -> dict:
    """Validate exact payload, externally supplied identity, and injected signature proof.

    signature_verifier(path, expected_thumbprint) must independently verify a
    valid Authenticode signature, exact signer identity, and required timestamp.
    """
    root = Path(directory)
    if not root.is_absolute() or not re.fullmatch(r"[1-9][0-9]*", str(source_run_id)) or not re.fullmatch(r"[1-9][0-9]*", str(publisher_run_id)):
        raise LauncherInputError("absolute payload path and positive expected source/publisher runs are required")
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", str(version)) or not SHA_RE.fullmatch(str(commit_sha)):
        raise LauncherInputError("expected release version or commit is malformed")
    if (not payload.TAG_RE.fullmatch(str(tag)) or not SHA_RE.fullmatch(str(handoff_commit_sha)) or
        not THUMBPRINT_RE.fullmatch(str(launcher_signer_thumbprint)) or not callable(signature_verifier)):
        raise LauncherInputError("expected tag, handoff commit, launcher signer, or signature verifier is invalid")

    try:
        entries = list(root.iterdir())
        names = [entry.name for entry in entries]
        if len({name.casefold() for name in names}) != len(names):
            raise LauncherInputError("launcher payload has case-colliding entries")
        expected_names = sorted((*payload.LAUNCHER_FILES, payload.MANIFEST_NAME))
        if sorted(names) != expected_names:
            raise LauncherInputError("launcher payload has missing or unexpected entries")

        manifest_path = root / payload.MANIFEST_NAME
        manifest_content = manifest_path.read_text(encoding="ascii")
        headers = dict(line.split("=", 1) for line in manifest_content.splitlines()[:8] if "=" in line)
        if headers.get("publisher_run_id") != str(publisher_run_id) or headers.get("handoff_commit_sha") != str(handoff_commit_sha).lower():
            raise LauncherInputError("publisher run or handoff commit does not match independent expected identity")
        verified = payload.verify_manifest(
            root, manifest_content, "Loggableim/ltth.app", publisher_run_id,
            str(source_run_id), str(commit_sha), handoff_commit_sha, str(tag),
        )
        release = _json_object(root / "launcher-release.json")
        provenance = _json_object(root / "launcher-build-provenance.json")
        _require_fields(release, RELEASE_FIELDS, "launcher release manifest")
        _require_fields(provenance, PROVENANCE_FIELDS, "launcher provenance")

        launcher_size, launcher_hash = verified["launcher.exe"]
        expected_commit = str(commit_sha).lower()
        expected_signer = str(launcher_signer_thumbprint).lower()
        if (release["schema"] != 1 or release["component"] != "launcher.exe" or
            release["version"] != version or release["tag"] != tag or
            str(release["commitSha"]).lower() != expected_commit or
            release["bytes"] != launcher_size or release["sha256"] != launcher_hash):
            raise LauncherInputError("launcher release manifest does not match expected identity and bytes")
        if (not isinstance(provenance["schema"], int) or isinstance(provenance["schema"], bool) or
            provenance["schema"] != 2 or provenance["component"] != "launcher.exe" or
            str(provenance["sourceRunId"]) != str(source_run_id) or
            str(provenance["sourceCommitSha"]).lower() != expected_commit or
            provenance["version"] != version or provenance["tag"] != tag or
            provenance["signedBytes"] != launcher_size or provenance["signedSha256"] != launcher_hash or
            str(provenance["expectedSignerThumbprint"]).lower() != expected_signer or
            str(provenance["signerThumbprint"]).lower() != expected_signer):
            raise LauncherInputError("launcher provenance does not match expected identity, bytes, or signer")
        if (not SHA_RE.fullmatch(str(provenance["sourceCommitSha"]).lower()) or
            not HASH_RE.fullmatch(str(provenance["candidateSha256"])) or
            not HASH_RE.fullmatch(str(provenance["candidateManifestSha256"])) or
            int(provenance["candidateBytes"]) <= 0 or provenance["toolchain"] != "go1.24.10" or
            provenance["target"] != "windows/amd64" or provenance["cgoEnabled"] is not False or
            provenance["moduleMode"] != "-mod=readonly" or
            not THUMBPRINT_RE.fullmatch(str(provenance["timestampSignerThumbprint"]))):
            raise LauncherInputError("launcher provenance build or candidate fields are malformed")

        source_workflow = provenance["sourceWorkflow"]
        source_event = provenance["sourceEvent"]
        source_ref = provenance["sourceRef"]
        tag_ref = f"refs/tags/{tag}"
        if (not isinstance(source_workflow, str) or not isinstance(source_event, str) or
            not isinstance(source_ref, str) or source_workflow not in SOURCE_WORKFLOWS):
            raise LauncherInputError("launcher provenance source workflow is not allowed")
        if source_workflow == ".github/workflows/release.yml":
            source_identity_valid = source_event == "push" and source_ref == tag_ref
        else:
            source_identity_valid = (
                (source_event == "push" and source_ref == tag_ref) or
                (source_event == "workflow_dispatch" and source_ref == "refs/heads/main")
            )
        if not source_identity_valid:
            raise LauncherInputError("launcher provenance source workflow/event/ref combination is invalid")

        signature = signature_verifier(root / "launcher.exe", expected_signer)
        if not isinstance(signature, dict) or signature != {"status": "Valid", "thumbprint": expected_signer, "timestamp_valid": True}:
            raise LauncherInputError("launcher Authenticode proof is invalid or signer/timestamp mismatches")
        return {"version": version, "commitSha": expected_commit, "tag": tag,
                "sourceRunId": str(source_run_id), "bytes": launcher_size, "sha256": launcher_hash,
                "signerThumbprint": expected_signer}
    except payload.PayloadError as exc:
        raise LauncherInputError("publisher payload manifest verification failed") from exc


def copy_verified_launcher(source: str | Path, stage_root: str | Path, expected: dict,
                           relative_destination: str = "launcher/launcher.exe") -> Path:
    """Copy launcher bytes below a regular StageRoot and recheck before NSIS use."""
    src = Path(source)
    try:
        data = src.read_bytes()
    except OSError as exc:
        raise LauncherInputError("verified launcher could not be read") from exc
    if len(data) != expected["bytes"] or hashlib.sha256(data).hexdigest() != expected["sha256"]:
        raise LauncherInputError("launcher changed after validation")
    _root, dst = _stage_destination(stage_root, relative_destination)
    if dst.exists() or dst.is_symlink():
        raise LauncherInputError("launcher stage destination must be absent")
    created = False
    try:
        with dst.open("xb") as output:
            created = True
            output.write(data)
        staged = dst.read_bytes()
        if len(staged) != expected["bytes"] or hashlib.sha256(staged).hexdigest() != expected["sha256"]:
            raise LauncherInputError("staged launcher differs from verified payload")
        return dst
    except BaseException:
        if created:
            try:
                if dst.exists() and not _is_reparse(dst):
                    dst.unlink()
            except OSError as cleanup_error:
                raise LauncherInputError("failed launcher copy could not be cleaned up") from cleanup_error
        raise


if __name__ == "__main__":
    raise SystemExit("Import validate_payload from a trusted platform verifier; no implicit identity defaults are provided.")
