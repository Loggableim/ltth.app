#!/usr/bin/env python3
"""Verify a release-workflow runtime artifact and the final Pages bundle."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
import zipfile
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit

from build_pages_bundle import is_public_app_archive, is_public_package, load_release_policy


MANIFEST_FIELDS = {"schema", "component", "version", "tag", "commitSha", "sha256", "bytes"}
VERSION_RE = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+$")
COMMIT_RE = re.compile(r"^[0-9a-fA-F]{40}$")
SHA256_RE = re.compile(r"^[0-9a-fA-F]{64}$")
PLUGIN_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")


class PublicationError(ValueError):
    pass


def _load_object(path: Path, description: str) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as exc:
        raise PublicationError(f"{description} is missing or malformed: {path}") from exc
    if not isinstance(value, dict):
        raise PublicationError(f"{description} must be a JSON object")
    return value


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _version(version_file: Path) -> str:
    data = _load_object(version_file, "website version metadata")
    version = data.get("version")
    download_version = data.get("downloadVersion")
    if (not isinstance(version, str) or not VERSION_RE.fullmatch(version)
            or download_version != version):
        raise PublicationError("version.json version and downloadVersion must be the same numeric vX.Y.Z value")
    return version


def _public_plugin_allowlist() -> set[str]:
    path = Path(__file__).resolve().with_name("public-plugin-allowlist.json")
    policy = _load_object(path, "public plugin allowlist")
    if set(policy) != {"schemaVersion", "publicPluginIds"} or policy.get("schemaVersion") != 1:
        raise PublicationError("public plugin allowlist schema is unsupported")
    ids = policy.get("publicPluginIds")
    if (not isinstance(ids, list) or not ids
            or not all(isinstance(plugin_id, str) and PLUGIN_ID_RE.fullmatch(plugin_id) for plugin_id in ids)
            or len(set(ids)) != len(ids)):
        raise PublicationError("public plugin allowlist is empty, malformed, or duplicated")
    return set(ids)


def _validate_manifest(
    archive: Path,
    manifest_path: Path,
    version_file: Path,
    expected_release_commit_sha: str,
) -> dict:
    version = _version(version_file)
    expected_commit = expected_release_commit_sha.lower()
    if not COMMIT_RE.fullmatch(expected_commit):
        raise PublicationError("expected release commit SHA is malformed")

    manifest = _load_object(manifest_path, "runtime artifact manifest")
    if set(manifest) != MANIFEST_FIELDS:
        raise PublicationError("runtime artifact manifest has unknown or missing fields")
    if manifest.get("schema") != 1 or isinstance(manifest.get("schema"), bool):
        raise PublicationError("runtime artifact manifest schema is unsupported")
    if manifest.get("component") != "ltth_latest.zip":
        raise PublicationError("runtime artifact component mismatch")
    if manifest.get("version") != version or manifest.get("tag") != f"v{version}":
        raise PublicationError("runtime artifact version/tag does not match version.json")

    manifest_commit = manifest.get("commitSha")
    if not isinstance(manifest_commit, str) or not COMMIT_RE.fullmatch(manifest_commit):
        raise PublicationError("runtime artifact commitSha is malformed")
    if manifest_commit.lower() != expected_commit:
        raise PublicationError("runtime artifact commitSha does not match the successful release workflow commit")

    declared_bytes = manifest.get("bytes")
    if not isinstance(declared_bytes, int) or isinstance(declared_bytes, bool) or declared_bytes <= 0:
        raise PublicationError("runtime artifact byte count is invalid")
    if not archive.is_file() or archive.stat().st_size != declared_bytes:
        raise PublicationError("runtime artifact byte count mismatch")

    declared_hash = manifest.get("sha256")
    if not isinstance(declared_hash, str) or not SHA256_RE.fullmatch(declared_hash):
        raise PublicationError("runtime artifact SHA-256 is malformed")
    if _sha256(archive).lower() != declared_hash.lower():
        raise PublicationError("runtime artifact SHA-256 mismatch")
    try:
        with zipfile.ZipFile(archive) as archive_zip:
            bad_member = archive_zip.testzip()
    except (OSError, zipfile.BadZipFile) as exc:
        raise PublicationError("runtime artifact is not a readable ZIP") from exc
    if bad_member is not None:
        raise PublicationError(f"runtime ZIP integrity check failed at {bad_member}")
    return manifest


def verify_and_install_payload(
    artifact_dir: Path,
    version_file: Path,
    destination: Path,
    expected_release_commit_sha: str,
) -> dict:
    archive = artifact_dir / "ltth_latest.zip"
    manifest_path = artifact_dir / "ltth_latest.json"
    manifest = _validate_manifest(archive, manifest_path, version_file, expected_release_commit_sha)
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(archive, destination)
    if destination.stat().st_size != manifest["bytes"] or _sha256(destination) != manifest["sha256"].lower():
        raise PublicationError("staged runtime bytes differ from the verified workflow artifact")
    return manifest


def verify_pages_bundle(
    site_dir: Path,
    version_file: Path,
    manifest_path: Path,
    expected_release_commit_sha: str,
) -> dict:
    site_version_file = site_dir / "version.json"
    if _version(site_version_file) != _version(version_file):
        raise PublicationError("Pages bundle version markers differ from the release checkout")
    manifest = _validate_manifest(
        site_dir / "app" / "ltth_latest.zip",
        manifest_path,
        version_file,
        expected_release_commit_sha,
    )

    current_version_path = site_dir / "app" / "CURRENT_VERSION.txt"
    if not current_version_path.is_file() or current_version_path.read_text(encoding="utf-8-sig").strip() != manifest["version"]:
        raise PublicationError("Pages bundle CURRENT_VERSION does not match the runtime artifact")
    current_release = _load_object(site_dir / "app" / "CURRENT_RELEASE.json", "app CURRENT_RELEASE metadata")
    if current_release.get("version") != manifest["version"]:
        raise PublicationError("Pages bundle CURRENT_RELEASE does not match the runtime artifact")

    policy = load_release_policy()
    excluded_ids = {item.lower() for item in policy["closedBeta"]}
    excluded_ids.update(item.lower() for item in policy.get("publicRuntimeExcluded", []))
    excluded_ids.update(item.lower() for item in policy.get("aliases", {}))
    excluded_ids.add("chatango")
    public_assets = {
        f"public/{asset_path.lstrip('/')}".lower()
        for asset_path in policy.get("publicAssetPathOwners", {})
    }
    public_assets.add("public/js/chatango-theme-adapter.js")
    runtime_zip = site_dir / "app" / "ltth_latest.zip"
    if not is_public_app_archive(runtime_zip, excluded_ids, public_assets):
        raise PublicationError("Pages runtime ZIP fails the public distribution policy")

    store_path = site_dir / "plugin-store.json"
    store = _load_object(store_path, "Pages plugin-store catalog")
    plugins = store.get("plugins")
    if not isinstance(plugins, list):
        raise PublicationError("Pages plugin-store catalog must contain a plugins list")
    public_plugin_ids = _public_plugin_allowlist()
    blocked_allowlist_ids = public_plugin_ids & excluded_ids
    if blocked_allowlist_ids:
        raise PublicationError(f"public plugin allowlist includes closed-beta or retired IDs: {sorted(blocked_allowlist_ids)}")
    packages_dir = site_dir / "plugin-store" / "packages"
    expected_packages: dict[str, dict] = {}
    catalog_ids: set[str] = set()
    for plugin in plugins:
        if not isinstance(plugin, dict):
            raise PublicationError("Pages plugin-store entry is malformed")
        plugin_id = plugin.get("id")
        package_url = plugin.get("packageUrl")
        declared_hash = plugin.get("sha256")
        if not isinstance(plugin_id, str) or not PLUGIN_ID_RE.fullmatch(plugin_id):
            raise PublicationError(f"invalid plugin ID listed in Pages store: {plugin_id}")
        plugin_id = plugin_id.lower()
        if plugin_id in excluded_ids:
            raise PublicationError(f"closed-beta or retired plugin listed in Pages store: {plugin_id}")
        if plugin_id in catalog_ids:
            raise PublicationError(f"duplicate Pages Store plugin ID: {plugin_id}")
        catalog_ids.add(plugin_id)
        if not isinstance(package_url, str):
            raise PublicationError(f"Pages store package URL is invalid for {plugin_id}")
        parsed_package_url = urlsplit(package_url)
        filename = PurePosixPath(parsed_package_url.path).name
        if (parsed_package_url.scheme != "https" or parsed_package_url.netloc.lower() != "ltth.app"
                or parsed_package_url.query or parsed_package_url.fragment
                or parsed_package_url.path != f"/plugin-store/packages/{filename}"):
            raise PublicationError(f"Pages store package URL is not a canonical package URL for {plugin_id}")
        if not filename or filename.casefold() in expected_packages:
            raise PublicationError(f"Pages store package filename is missing or duplicated: {filename}")
        if not isinstance(declared_hash, str) or not SHA256_RE.fullmatch(declared_hash):
            raise PublicationError(f"Pages store package SHA-256 is invalid for {plugin_id}")
        expected_packages[filename.casefold()] = {
            "filename": filename,
            "sha256": declared_hash.lower(),
            "id": plugin_id,
        }

    if catalog_ids != public_plugin_ids:
        raise PublicationError(
            "Pages Store catalog does not match the canonical public plugin allowlist "
            f"(missing={sorted(public_plugin_ids - catalog_ids)}, extra={sorted(catalog_ids - public_plugin_ids)})"
        )

    actual_package_paths = (
        [path for path in packages_dir.rglob("*")
         if path.is_file() and path.suffix.casefold() == ".zip"]
        if packages_dir.is_dir() else []
    )
    actual_packages: dict[str, Path] = {}
    for path in sorted(actual_package_paths):
        key = path.name.casefold()
        if key in actual_packages:
            raise PublicationError(f"Pages Store contains duplicate case-insensitive ZIP filenames: {path.name}")
        actual_packages[key] = path
        if path.parent != packages_dir:
            raise PublicationError(f"Pages Store ZIP must be directly under the package directory: {path.name}")
    if set(actual_packages) != set(expected_packages):
        raise PublicationError("Pages Store ZIP set does not match the public catalog")
    expected_filenames = {package["filename"] for package in expected_packages.values()}
    actual_filenames = {path.name for path in actual_packages.values()}
    if actual_filenames != expected_filenames:
        raise PublicationError("Pages Store ZIP filenames do not exactly match the public catalog")
    for key, package in expected_packages.items():
        path = actual_packages[key]
        if _sha256(path).lower() != package["sha256"]:
            raise PublicationError(f"Pages Store package SHA-256 mismatch: {package['filename']}")
        try:
            with zipfile.ZipFile(path) as package_zip:
                if package_zip.testzip() is not None or not is_public_package(path, excluded_ids):
                    raise PublicationError(f"Pages Store package fails public distribution policy: {package['filename']}")
                manifests = [
                    name for name in package_zip.namelist()
                    if name == "plugin.json" or name.endswith("/plugin.json")
                ]
                if not manifests:
                    raise PublicationError(f"Pages Store package has no manifest: {package['filename']}")
                root_depth = min(name.count("/") for name in manifests)
                root_manifests = [name for name in manifests if name.count("/") == root_depth]
                if len(root_manifests) != 1:
                    raise PublicationError(f"Pages Store package has ambiguous root manifest: {package['filename']}")
                package_manifest = json.loads(package_zip.read(root_manifests[0]).decode("utf-8-sig"))
                if not isinstance(package_manifest, dict) or str(package_manifest.get("id", "")).lower() != package["id"]:
                    raise PublicationError(f"Pages Store package identity mismatch: {package['filename']}")
        except (OSError, zipfile.BadZipFile) as exc:
            raise PublicationError(f"Pages Store package is not a valid ZIP: {package['filename']}") from exc

    required_files = (
        "download.html",
        "downloads/launcher.exe",
        "install.js",
        "install.ps1",
        "install.sh",
        "uninstall.ps1",
        "uninstall.sh",
    )
    missing = [relative for relative in required_files if not (site_dir / relative).is_file()]
    if missing:
        raise PublicationError(f"Pages bundle is missing required public installer files: {missing}")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    artifact = subparsers.add_parser("verify-artifact", help="verify and stage the same-run runtime artifact")
    artifact.add_argument("--artifact-dir", type=Path, required=True)
    artifact.add_argument("--version-file", type=Path, required=True)
    artifact.add_argument("--destination", type=Path, required=True)
    artifact.add_argument("--expected-release-commit-sha", required=True)
    site = subparsers.add_parser("verify-pages-site", help="fail closed on a non-public Pages output bundle")
    site.add_argument("--site-dir", type=Path, required=True)
    site.add_argument("--version-file", type=Path, required=True)
    site.add_argument("--manifest", type=Path, required=True)
    site.add_argument("--expected-release-commit-sha", required=True)
    args = parser.parse_args()

    try:
        if args.command == "verify-artifact":
            manifest = verify_and_install_payload(
                args.artifact_dir,
                args.version_file,
                args.destination,
                args.expected_release_commit_sha,
            )
        else:
            manifest = verify_pages_bundle(
                args.site_dir,
                args.version_file,
                args.manifest,
                args.expected_release_commit_sha,
            )
    except (OSError, PublicationError, ValueError, KeyError, TypeError) as exc:
        print(f"Pages publication verification failed: {exc}", file=sys.stderr)
        return 1
    print(
        f"Verified Pages runtime v{manifest['version']} from commit {manifest['commitSha']}: "
        f"{manifest['bytes']} bytes, SHA-256 {manifest['sha256']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
