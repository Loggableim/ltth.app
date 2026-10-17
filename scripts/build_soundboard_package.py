#!/usr/bin/env python3
"""Build a deterministic Soundboard Store ZIP from an immutable Git commit."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path, PurePosixPath


PLUGIN_PATH = "app/plugins/soundboard"
PLUGIN_ID = "soundboard"
ZIP_TIME = (2000, 1, 1, 0, 0, 0)
SHA1_RE = re.compile(r"^[0-9a-f]{40}$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
COMMIT_RE = re.compile(r"^[0-9a-fA-F]{40}$")
VERSION_RE = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+$")
DEFAULT_KEY_RE = re.compile(
    r"(?im)^\s*(?:const|let|var)\s+DEFAULT_GIPHY_API_KEY\s*=\s*([^;\r\n]+)"
)


class PackageBuildError(ValueError):
    """Raised when source provenance or package integrity is not safe."""


def run_git(repo: Path, *args: str) -> bytes:
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        detail = result.stderr.decode("utf-8", "replace").strip()
        raise PackageBuildError(f"git {' '.join(args[:2])} failed: {detail}")
    return result.stdout


def validate_relative_path(value: str) -> str:
    if not isinstance(value, str) or not value or "\0" in value or "\\" in value:
        raise PackageBuildError("source path is empty or malformed")
    path = PurePosixPath(value)
    if path.is_absolute() or any(part in ("", ".", "..") for part in value.split("/")):
        raise PackageBuildError(f"unsafe source path: {value!r}")
    if path.as_posix() != value:
        raise PackageBuildError(f"non-canonical source path: {value!r}")
    return value


def verify_git_blob(oid: str, data: bytes) -> None:
    if not SHA1_RE.fullmatch(oid):
        raise PackageBuildError("Git tree contains a malformed blob object ID")
    header = f"blob {len(data)}\0".encode("ascii")
    actual = hashlib.sha1(header + data).hexdigest()
    if actual != oid:
        raise PackageBuildError("Git blob bytes do not match the tree object ID")


def resolve_source_commit(repo: Path, requested: str) -> tuple[str, str]:
    if not COMMIT_RE.fullmatch(requested):
        raise PackageBuildError("source commit must be a full 40-character commit SHA")
    root = Path(
        run_git(repo, "rev-parse", "--show-toplevel").decode("utf-8").strip()
    ).resolve()
    if root != repo.resolve():
        raise PackageBuildError("repository root does not match the requested checkout")

    commit = run_git(repo, "rev-parse", "--verify", f"{requested.lower()}^{{commit}}")
    commit_sha = commit.decode("ascii").strip()
    if commit_sha.lower() != requested.lower():
        raise PackageBuildError("source commit does not resolve to the requested commit")
    head_sha = run_git(repo, "rev-parse", "--verify", "HEAD^{commit}").decode("ascii").strip()
    if not SHA1_RE.fullmatch(head_sha):
        raise PackageBuildError("checkout HEAD is ambiguous or malformed")
    ancestry = subprocess.run(
        ["git", "-C", str(repo), "merge-base", "--is-ancestor", commit_sha, head_sha],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if ancestry.returncode != 0:
        raise PackageBuildError("source commit is not an ancestor of the current checkout")

    dirty = run_git(
        repo,
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
        "--",
        PLUGIN_PATH,
    )
    if dirty.strip():
        raise PackageBuildError("Soundboard source working tree is dirty")

    tree = run_git(repo, "rev-parse", f"{commit_sha}:{PLUGIN_PATH}").decode("ascii").strip()
    if not SHA1_RE.fullmatch(tree):
        raise PackageBuildError("Soundboard source tree is missing or malformed")
    if run_git(repo, "cat-file", "-t", tree).decode("ascii").strip() != "tree":
        raise PackageBuildError("Soundboard source object is not a Git tree")
    return commit_sha.lower(), tree.lower()


def read_committed_files(repo: Path, commit_sha: str) -> dict[str, tuple[bytes, int]]:
    records = run_git(
        repo,
        "ls-tree",
        "-r",
        "-z",
        "--full-tree",
        commit_sha,
        "--",
        PLUGIN_PATH,
    )
    prefix = PLUGIN_PATH + "/"
    files: dict[str, tuple[bytes, int]] = {}
    for record in records.split(b"\0"):
        if not record:
            continue
        try:
            metadata, raw_path = record.split(b"\t", 1)
            mode_raw, object_type, oid_raw = metadata.split(b" ", 2)
            full_path = raw_path.decode("utf-8", "strict")
            mode = int(mode_raw, 8)
            oid = oid_raw.decode("ascii")
        except (ValueError, UnicodeDecodeError) as exc:
            raise PackageBuildError("Git tree contains a malformed entry") from exc
        if object_type != b"blob" or mode not in (0o100644, 0o100755):
            raise PackageBuildError("Soundboard tree contains a non-regular file")
        if not full_path.startswith(prefix):
            raise PackageBuildError("Git tree entry escaped the Soundboard source directory")
        relative = validate_relative_path(full_path[len(prefix):])
        if relative.casefold() in {item.casefold() for item in files}:
            raise PackageBuildError("Soundboard tree contains a case-insensitive path collision")
        data = run_git(repo, "cat-file", "blob", oid)
        verify_git_blob(oid, data)
        files[relative] = (data, mode)
    if "plugin.json" not in files:
        raise PackageBuildError("committed Soundboard tree has no root plugin.json")
    return files


def _unique_json_object(pairs: list[tuple[str, object]]) -> dict:
    value: dict = {}
    for key, item in pairs:
        if key in value:
            raise PackageBuildError(f"duplicate plugin.json field: {key}")
        value[key] = item
    return value


def transform_plugin_manifest(
    files: dict[str, tuple[bytes, int]], package_version: str
) -> tuple[dict[str, tuple[bytes, int]], str]:
    if not VERSION_RE.fullmatch(package_version):
        raise PackageBuildError("package version must be numeric X.Y.Z")
    raw_manifest, mode = files["plugin.json"]
    try:
        manifest = json.loads(
            raw_manifest.decode("utf-8-sig"),
            object_pairs_hook=_unique_json_object,
        )
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise PackageBuildError("plugin.json is not valid UTF-8 JSON") from exc
    if not isinstance(manifest, dict) or manifest.get("id") != PLUGIN_ID:
        raise PackageBuildError("root plugin.json does not identify Soundboard")
    old_version = manifest.get("version")
    if not isinstance(old_version, str) or not VERSION_RE.fullmatch(old_version):
        raise PackageBuildError("source plugin.json has no valid numeric version")
    if tuple(map(int, package_version.split("."))) <= tuple(map(int, old_version.split("."))):
        raise PackageBuildError("package version must be greater than the source manifest version")

    for key in ("apiKey", "defaultApiKey", "giphyApiKey", "defaultGiphyApiKey"):
        value = manifest.get(key)
        if value is not None:
            raise PackageBuildError(f"plugin.json API key field must be absent or null: {key}")

    updated = dict(manifest)
    updated["version"] = package_version
    encoded = (json.dumps(updated, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    result = dict(files)
    result["plugin.json"] = (encoded, mode)
    return result, old_version


def verify_no_bundled_giphy_default(files: dict[str, tuple[bytes, int]]) -> None:
    source = files.get("main.js")
    if source is None:
        return
    text = source[0].decode("utf-8", "replace")
    matches = DEFAULT_KEY_RE.findall(text)
    if any(value.strip() != "null" for value in matches):
        raise PackageBuildError("Soundboard main.js contains a non-empty GIPHY API default")


def _manifest_bytes(source_bytes: bytes) -> dict:
    try:
        value = json.loads(source_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise PackageBuildError("package sidecar is not valid UTF-8 JSON") from exc
    if not isinstance(value, dict):
        raise PackageBuildError("package sidecar must be a JSON object")
    return value


def make_archive(files: dict[str, tuple[bytes, int]]) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(
        output,
        "w",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=9,
        strict_timestamps=True,
    ) as archive:
        for name in sorted(files, key=lambda item: item.encode("utf-8")):
            relative = validate_relative_path(name)
            data, source_mode = files[name]
            info = zipfile.ZipInfo(relative, date_time=ZIP_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = source_mode << 16
            info.extra = b""
            info.comment = b""
            archive.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    return output.getvalue()


def make_sidecar(
    archive_bytes: bytes,
    files: dict[str, tuple[bytes, int]],
    original_files: dict[str, tuple[bytes, int]],
    commit_sha: str,
    tree_sha: str,
    package_version: str,
) -> bytes:
    entries = []
    for name in sorted(files, key=lambda item: item.encode("utf-8")):
        content = files[name][0]
        source_content = original_files[name][0]
        entries.append({
            "path": name,
            "bytes": len(content),
            "sha256": hashlib.sha256(content).hexdigest(),
            "sourceSha256": hashlib.sha256(source_content).hexdigest(),
            "mode": files[name][1],
        })
    document = {
        "schemaVersion": 1,
        "pluginId": PLUGIN_ID,
        "sourceCommit": commit_sha,
        "sourceTree": tree_sha,
        "packageVersion": package_version,
        "sha256": hashlib.sha256(archive_bytes).hexdigest(),
        "byteSize": len(archive_bytes),
        "files": entries,
    }
    return (json.dumps(document, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def verify_package_bytes(archive_bytes: bytes, sidecar_bytes: bytes) -> dict:
    sidecar = _manifest_bytes(sidecar_bytes)
    if set(sidecar) != {
        "schemaVersion", "pluginId", "sourceCommit", "sourceTree",
        "packageVersion", "sha256", "byteSize", "files",
    }:
        raise PackageBuildError("package sidecar fields do not match the schema")
    if sidecar.get("schemaVersion") != 1 or sidecar.get("pluginId") != PLUGIN_ID:
        raise PackageBuildError("package sidecar identity or schema is invalid")
    if not COMMIT_RE.fullmatch(str(sidecar.get("sourceCommit", ""))):
        raise PackageBuildError("package sidecar sourceCommit is invalid")
    if not SHA1_RE.fullmatch(str(sidecar.get("sourceTree", ""))):
        raise PackageBuildError("package sidecar sourceTree is invalid")
    if not VERSION_RE.fullmatch(str(sidecar.get("packageVersion", ""))):
        raise PackageBuildError("package sidecar packageVersion is invalid")
    if not SHA256_RE.fullmatch(str(sidecar.get("sha256", ""))):
        raise PackageBuildError("package sidecar SHA-256 is invalid")
    if sidecar.get("byteSize") != len(archive_bytes):
        raise PackageBuildError("package ZIP byte size differs from sidecar")
    if hashlib.sha256(archive_bytes).hexdigest() != sidecar["sha256"]:
        raise PackageBuildError("package ZIP SHA-256 differs from sidecar")

    entries = sidecar.get("files")
    if not isinstance(entries, list):
        raise PackageBuildError("package sidecar file list is invalid")
    expected: dict[str, dict] = {}
    for item in entries:
        if not isinstance(item, dict) or set(item) != {
            "path", "bytes", "sha256", "sourceSha256", "mode",
        }:
            raise PackageBuildError("package sidecar file entry is malformed")
        name = validate_relative_path(item.get("path"))
        if name in expected:
            raise PackageBuildError("package sidecar contains duplicate paths")
        if (type(item.get("bytes")) is not int or item["bytes"] < 0
                or not SHA256_RE.fullmatch(str(item.get("sha256", "")))
                or not SHA256_RE.fullmatch(str(item.get("sourceSha256", "")))
                or item.get("mode") not in (0o100644, 0o100755)):
            raise PackageBuildError("package sidecar file size or hash is invalid")
        expected[name] = item

    try:
        with zipfile.ZipFile(io.BytesIO(archive_bytes), "r") as archive:
            if archive.testzip() is not None:
                raise PackageBuildError("package ZIP CRC check failed")
            infos = archive.infolist()
            names = [info.filename for info in infos]
            if len(names) != len(set(names)) or set(names) != set(expected):
                raise PackageBuildError("package ZIP entries differ from sidecar file list")
            for info in infos:
                validate_relative_path(info.filename)
                if info.date_time != ZIP_TIME or info.create_system != 3:
                    raise PackageBuildError("package ZIP timestamp/platform metadata is not deterministic")
                if info.compress_type != zipfile.ZIP_DEFLATED:
                    raise PackageBuildError("package ZIP compression method is not deterministic")
                if info.external_attr >> 16 != expected[info.filename]["mode"]:
                    raise PackageBuildError("package ZIP permissions differ from sidecar")
                content = archive.read(info)
                item = expected[info.filename]
                if len(content) != item["bytes"] or hashlib.sha256(content).hexdigest() != item["sha256"]:
                    raise PackageBuildError(f"package file bytes differ from sidecar: {info.filename}")
            manifest = json.loads(archive.read("plugin.json").decode("utf-8"))
            if manifest.get("id") != PLUGIN_ID or manifest.get("version") != sidecar["packageVersion"]:
                raise PackageBuildError("packaged plugin.json identity/version differs from sidecar")
    except (OSError, zipfile.BadZipFile, KeyError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        if isinstance(exc, PackageBuildError):
            raise
        raise PackageBuildError("package ZIP or plugin.json is invalid") from exc
    return sidecar


def _canonical_output_path(path: Path) -> Path:
    """Resolve the parent directory while keeping the final component unresolved.

    Resolving the final component would follow a pre-existing symlink and could
    make an apparently new output overwrite a file outside the requested path.
    """
    absolute = Path(os.path.abspath(path))
    return absolute.parent.resolve() / absolute.name


def _write_staged_file(destination: Path, contents: bytes) -> Path:
    """Write and fsync a same-directory temporary file for atomic publication."""
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{destination.name}.",
        suffix=".tmp",
        dir=destination.parent,
    )
    temporary_path = Path(temporary_name)
    open_descriptor = descriptor
    try:
        with os.fdopen(descriptor, "wb") as handle:
            open_descriptor = None
            handle.write(contents)
            handle.flush()
            os.fsync(handle.fileno())
        return temporary_path
    except BaseException:
        if open_descriptor is not None:
            try:
                os.close(open_descriptor)
            except OSError:
                pass
        try:
            temporary_path.unlink()
        except OSError:
            pass
        raise


def _remove_if_same_file(path: Path, staged_path: Path) -> None:
    """Rollback only a published hard link that still points to our staged file."""
    try:
        if os.path.samefile(path, staged_path):
            path.unlink()
    except OSError:
        pass


def _publish_staged_file(staged_path: Path, destination: Path) -> None:
    """Create the final name atomically and exclusively; never replace a target."""
    try:
        os.link(staged_path, destination)
    except OSError as exc:
        if os.path.lexists(destination):
            raise PackageBuildError(f"output appeared before publication: {destination.name}") from exc
        raise


def build_package(
    repo: Path,
    source_commit: str,
    package_version: str,
    zip_path: Path,
    sidecar_path: Path,
) -> dict:
    repo = repo.resolve()
    commit_sha, tree_sha = resolve_source_commit(repo, source_commit)
    original_files = read_committed_files(repo, commit_sha)
    packaged_files, _ = transform_plugin_manifest(original_files, package_version)
    verify_no_bundled_giphy_default(packaged_files)
    archive_bytes = make_archive(packaged_files)
    sidecar_bytes = make_sidecar(
        archive_bytes,
        packaged_files,
        original_files,
        commit_sha,
        tree_sha,
        package_version,
    )
    sidecar = verify_package_bytes(archive_bytes, sidecar_bytes)

    zip_path = _canonical_output_path(zip_path)
    sidecar_path = _canonical_output_path(sidecar_path)
    if os.path.normcase(str(zip_path)) == os.path.normcase(str(sidecar_path)):
        raise PackageBuildError("output ZIP and sidecar must be different paths")
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    sidecar_path.parent.mkdir(parents=True, exist_ok=True)
    if os.path.lexists(zip_path) or os.path.lexists(sidecar_path):
        raise PackageBuildError("output ZIP or sidecar already exists")

    staged_zip = None
    staged_sidecar = None
    published = []
    try:
        staged_zip = _write_staged_file(zip_path, archive_bytes)
        staged_sidecar = _write_staged_file(sidecar_path, sidecar_bytes)
        staged_zip_bytes = staged_zip.read_bytes()
        staged_sidecar_bytes = staged_sidecar.read_bytes()
        if staged_zip_bytes != archive_bytes or staged_sidecar_bytes != sidecar_bytes:
            raise PackageBuildError("staged output bytes differ from verified package bytes")
        verify_package_bytes(staged_zip_bytes, staged_sidecar_bytes)

        _publish_staged_file(staged_zip, zip_path)
        published.append((zip_path, staged_zip))
        _publish_staged_file(staged_sidecar, sidecar_path)
        published.append((sidecar_path, staged_sidecar))

        final_zip_bytes = zip_path.read_bytes()
        final_sidecar_bytes = sidecar_path.read_bytes()
        if final_zip_bytes != archive_bytes or final_sidecar_bytes != sidecar_bytes:
            raise PackageBuildError("published output bytes differ from verified package bytes")
        sidecar = verify_package_bytes(final_zip_bytes, final_sidecar_bytes)
        return sidecar
    except BaseException:
        for destination, staged_path in reversed(published):
            _remove_if_same_file(destination, staged_path)
        raise
    finally:
        for staged_path in (staged_zip, staged_sidecar):
            if staged_path is not None:
                try:
                    staged_path.unlink()
                except OSError:
                    pass


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", type=Path, default=Path.cwd())
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--package-version", required=True)
    parser.add_argument("--output-zip", type=Path, required=True)
    parser.add_argument("--output-sidecar", type=Path, required=True)
    args = parser.parse_args()
    try:
        result = build_package(
            args.repository,
            args.source_commit,
            args.package_version,
            args.output_zip,
            args.output_sidecar,
        )
    except (OSError, PackageBuildError, ValueError) as exc:
        print(f"Soundboard package build failed: {exc}", file=sys.stderr)
        return 1
    print(
        f"Built Soundboard {result['packageVersion']} from "
        f"{result['sourceCommit']} ({result['sourceTree']}); "
        f"{result['byteSize']} bytes, SHA-256 {result['sha256']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
