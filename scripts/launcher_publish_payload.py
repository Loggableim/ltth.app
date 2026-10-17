#!/usr/bin/env python3
"""Create and validate the data-only manifest for the publisher handoff artifact."""

from __future__ import annotations

import hashlib
import json
import os
import re
import stat
import sys
from pathlib import Path


MANIFEST_NAME = "publish-payload.manifest"
APP_FILES = ("launcher.exe", "launcher-release.json", "launcher-build-provenance.json", "ltth_latest.zip", "ltth_latest.json")
LAUNCHER_FILES = APP_FILES[:3]
JSON_FILES = frozenset(("launcher-release.json", "launcher-build-provenance.json", "ltth_latest.json"))
MAX_ASSET_BYTES = 95 * 1024 * 1024
MAX_JSON_ASSET_BYTES = 1024 * 1024
MAX_MANIFEST_BYTES = 8192
TAG_RE = re.compile(r"^(?:v|launcher-v|launcher-beta-v)[0-9]+\.[0-9]+\.[0-9]+$")
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
RUN_RE = re.compile(r"^[1-9][0-9]*$")


class PayloadError(ValueError):
    pass


def _is_reparse_point(path: Path, info=None) -> bool:
    if path.is_symlink():
        return True
    try:
        file_info = info if info is not None else path.lstat()
    except OSError as exc:
        raise PayloadError("payload path cannot be inspected") from exc
    attributes = getattr(file_info, "st_file_attributes", 0)
    reparse_attribute = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
    if attributes & reparse_attribute:
        return True
    is_junction = getattr(os.path, "isjunction", None)
    return bool(is_junction and is_junction(path))


def _require_real_directory(root: Path) -> None:
    if not root.is_absolute() or ".." in root.parts:
        raise PayloadError("payload directory must be absolute and traversal-free")
    try:
        info = root.lstat()
    except OSError as exc:
        raise PayloadError("payload directory cannot be inspected") from exc
    if _is_reparse_point(root, info) or not stat.S_ISDIR(info.st_mode):
        raise PayloadError("payload directory must be a real directory")


def _require_regular_file(path: Path):
    try:
        info = path.lstat()
    except OSError as exc:
        raise PayloadError("payload member cannot be inspected") from exc
    if _is_reparse_point(path, info) or not stat.S_ISREG(info.st_mode):
        raise PayloadError("payload member is not a regular file")
    return info


def _asset_limit(name: str) -> int:
    return MAX_JSON_ASSET_BYTES if name in JSON_FILES else MAX_ASSET_BYTES


def _sha256_file(path: Path, maximum: int) -> tuple[int, str]:
    before = _require_regular_file(path)
    if before.st_size <= 0 or before.st_size > maximum:
        raise PayloadError("payload member is empty or exceeds the size limit")
    digest = hashlib.sha256()
    total = 0
    try:
        with path.open("rb") as stream:
            opened = os.fstat(stream.fileno())
            if not stat.S_ISREG(opened.st_mode) or _is_reparse_point(path, opened):
                raise PayloadError("payload member changed to a non-regular file")
            if before.st_ino and opened.st_ino and (before.st_dev, before.st_ino) != (opened.st_dev, opened.st_ino):
                raise PayloadError("payload member changed before it was opened")
            while True:
                chunk = stream.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > maximum:
                    raise PayloadError("payload member exceeds the size limit")
                digest.update(chunk)
    except OSError as exc:
        raise PayloadError("payload member could not be read") from exc
    after = _require_regular_file(path)
    if before.st_ino and after.st_ino and (before.st_dev, before.st_ino) != (after.st_dev, after.st_ino):
        raise PayloadError("payload member changed while it was read")
    if total != before.st_size or total != after.st_size:
        raise PayloadError("payload member size changed while it was read")
    return total, digest.hexdigest()


def _unique_json_object(pairs):
    result = {}
    folded = set()
    for key, value in pairs:
        case_key = key.casefold()
        if case_key in folded:
            raise PayloadError("JSON payload contains duplicate or case-colliding object keys")
        folded.add(case_key)
        result[key] = value
    return result


def _reject_json_constant(_value):
    raise PayloadError("JSON payload contains a non-standard numeric constant")


def _validate_json_asset(path: Path, name: str, size: int) -> None:
    if name not in JSON_FILES:
        return
    if size > MAX_JSON_ASSET_BYTES:
        raise PayloadError("JSON payload exceeds the size limit")
    try:
        with path.open("rb") as stream:
            raw = stream.read(MAX_JSON_ASSET_BYTES + 1)
        if len(raw) > MAX_JSON_ASSET_BYTES:
            raise PayloadError("JSON payload exceeds the size limit")
        parsed = json.loads(raw.decode("utf-8"), object_pairs_hook=_unique_json_object, parse_constant=_reject_json_constant)
    except PayloadError:
        raise
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise PayloadError("JSON payload is not strict UTF-8 JSON") from exc
    if not isinstance(parsed, dict):
        raise PayloadError("JSON payload must contain a top-level object")


def expected_files(release_tag: str) -> tuple[str, ...]:
    if not isinstance(release_tag, str) or not TAG_RE.fullmatch(release_tag):
        raise PayloadError("release tag is malformed")
    return APP_FILES if release_tag.startswith("v") else LAUNCHER_FILES


def _validate_metadata(repository: str, publisher_run_id: str, source_run_id: str, source_commit_sha: str, handoff_commit_sha: str, release_tag: str) -> tuple[str, ...]:
    if repository != "Loggableim/ltth.app":
        raise PayloadError("repository is not canonical")
    if not RUN_RE.fullmatch(publisher_run_id) or not RUN_RE.fullmatch(source_run_id):
        raise PayloadError("run ID is malformed")
    if not SHA_RE.fullmatch(source_commit_sha):
        raise PayloadError("source commit SHA is malformed")
    if not isinstance(handoff_commit_sha, str) or not re.fullmatch(r"^[0-9a-fA-F]{40}$", handoff_commit_sha):
        raise PayloadError("handoff commit SHA is malformed")
    return expected_files(release_tag)


def create_manifest(directory: str | Path, repository: str, publisher_run_id: str, source_run_id: str, source_commit_sha: str, handoff_commit_sha: str, release_tag: str) -> Path:
    root = Path(directory)
    _require_real_directory(root)
    files = _validate_metadata(repository, publisher_run_id, source_run_id, source_commit_sha, handoff_commit_sha, release_tag)
    entries = list(root.iterdir())
    actual_names = [item.name for item in entries]
    if len({name.casefold() for name in actual_names}) != len(actual_names):
        raise PayloadError("staged payload contains case-colliding names")
    actual = sorted(actual_names)
    expected = sorted(files)
    if actual != expected:
        raise PayloadError("staged payload file set is incomplete or contains unexpected entries")
    lines = [
        "format=ltth-publish-payload-v1",
        f"repository={repository}",
        f"publisher_run_id={publisher_run_id}",
        f"source_run_id={source_run_id}",
        f"source_commit_sha={source_commit_sha.lower()}",
        f"handoff_commit_sha={handoff_commit_sha.lower()}",
        f"release_tag={release_tag}",
        f"file_count={len(files)}",
    ]
    for name in files:
        path = root / name
        size, sha256 = _sha256_file(path, _asset_limit(name))
        _validate_json_asset(path, name, size)
        lines.append(f"file={name}\t{size}\t{sha256}")
    manifest = root / MANIFEST_NAME
    try:
        with manifest.open("x", encoding="ascii", newline="\n") as stream:
            stream.write("\n".join(lines) + "\n")
    except FileExistsError as exc:
        raise PayloadError("payload manifest already exists") from exc
    except OSError as exc:
        raise PayloadError("payload manifest could not be created") from exc
    return manifest


def verify_manifest(directory: str | Path, content: str, repository: str, publisher_run_id: str, source_run_id: str, source_commit_sha: str, handoff_commit_sha: str, release_tag: str) -> dict[str, tuple[int, str]]:
    root = Path(directory)
    _require_real_directory(root)
    files = _validate_metadata(repository, publisher_run_id, source_run_id, source_commit_sha, handoff_commit_sha, release_tag)
    manifest_path = root / MANIFEST_NAME
    manifest_info = _require_regular_file(manifest_path)
    if manifest_info.st_size > MAX_MANIFEST_BYTES or not isinstance(content, str) or len(content) > MAX_MANIFEST_BYTES:
        raise PayloadError("payload manifest is missing or oversized")
    try:
        with manifest_path.open("rb") as stream:
            manifest_bytes = stream.read(MAX_MANIFEST_BYTES + 1)
        if len(manifest_bytes) > MAX_MANIFEST_BYTES:
            raise PayloadError("payload manifest is oversized")
        decoded_content = manifest_bytes.decode("ascii")
    except PayloadError:
        raise
    except (OSError, UnicodeDecodeError) as exc:
        raise PayloadError("payload manifest is not readable ASCII") from exc
    if decoded_content != content:
        raise PayloadError("payload manifest bytes changed during verification")
    lines = content.splitlines()
    expected_headers = [
        "format=ltth-publish-payload-v1",
        f"repository={repository}",
        f"publisher_run_id={publisher_run_id}",
        f"source_run_id={source_run_id}",
        f"source_commit_sha={source_commit_sha.lower()}",
        f"handoff_commit_sha={handoff_commit_sha.lower()}",
        f"release_tag={release_tag}",
        f"file_count={len(files)}",
    ]
    if lines[:len(expected_headers)] != expected_headers or len(lines) != len(expected_headers) + len(files):
        raise PayloadError("payload manifest metadata or file list does not match the expected run")
    actual_names = [item.name for item in root.iterdir()]
    if len({name.casefold() for name in actual_names}) != len(actual_names):
        raise PayloadError("downloaded payload contains case-colliding names")
    if sorted(actual_names) != sorted((*files, MANIFEST_NAME)):
        raise PayloadError("downloaded payload contains missing or unexpected files")
    verified = {}
    for name, line in zip(files, lines[len(expected_headers):]):
        fields = line.split("\t")
        if len(fields) != 3 or fields[0] != f"file={name}" or not fields[1].isdigit() or not SHA256_RE.fullmatch(fields[2]):
            raise PayloadError("payload file entry is malformed or out of order")
        path = root / name
        size, sha256 = _sha256_file(path, _asset_limit(name))
        _validate_json_asset(path, name, size)
        if size != int(fields[1]) or sha256 != fields[2]:
            raise PayloadError("payload member size or digest does not match manifest")
        verified[name] = (size, fields[2])
    return verified


def main() -> int:
    try:
        create_manifest(
            os.environ["PAYLOAD_DIR"], os.environ["PAYLOAD_REPOSITORY"],
            os.environ["PUBLISHER_RUN_ID"], os.environ["SOURCE_RUN_ID"],
            os.environ["SOURCE_COMMIT_SHA"], os.environ["HANDOFF_COMMIT_SHA"], os.environ["RELEASE_TAG"],
        )
    except (KeyError, OSError, PayloadError) as exc:
        print(f"Publish payload manifest creation failed: {type(exc).__name__}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
