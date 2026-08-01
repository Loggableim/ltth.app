#!/usr/bin/env python3
"""
Build the LTTH release bundle used by the Windows ZIP bootstrap.

The output matches the historical install package layout:

  ltth_<version>/
    CHANGELOG.md
    LICENSE
    launcher.exe
    main.js
    package-lock.json
    package.json
    playwright.config.js
    app/
      ...

In legacy committed-bundle mode this script creates:
  new_patch/ltth_<version>/ltth_<version>.zip
  new_patch/ltth_<version>/changelog.txt

Release-asset mode creates immutable workflow artifacts without modifying the
repository:
  <release-assets-dir>/ltth_latest.zip
  <release-assets-dir>/ltth_latest.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path


ROOT_TOP_LEVEL_FILES = [
    "CHANGELOG.md",
    "LICENSE",
    "launcher.exe",
    "main.js",
    "package-lock.json",
    "package.json",
    "playwright.config.js",
]

APP_EXCLUDED_PREFIXES = (
    ".playwright-cli/",
    "archive/",
    "logs/",
    "node_modules/",
    "output/",
    "test/",
)

APP_EXCLUDED_EXACT = {
    "CURRENT_RELEASE.json",
    "CURRENT_VERSION.txt",
    "ltth_latest.zip",
}

TALKING_HEADS_RGS_PREFIX = "plugins/talking-heads/assets/asset-packs/rgs/"
TALKING_HEADS_RGS_RUNTIME_FRAMES = {
    "idle_0.png",
    "idle_3.png",
}
TALKING_HEADS_BOBA_PREFIX = "plugins/talking-heads/assets/asset-packs/boba/animals/"
MAX_RELEASE_BUNDLE_BYTES = 95 * 1024 * 1024
FIXED_ZIP_DATETIME = (2000, 1, 1, 0, 0, 0)
RELEASE_ASSET_ZIP_NAME = "ltth_latest.zip"
RELEASE_ASSET_MANIFEST_NAME = "ltth_latest.json"
SEMANTIC_VERSION_PATTERN = re.compile(r"[0-9]+\.[0-9]+\.[0-9]+")
STREAM_MONSTERS_RELEASES = {
    "1.4.1": {
        "plugin_version": "1.11.1",
        "manifest_id": "streamalchemy",
        "source_path": "app/plugins/streamalchemy/plugin.json",
        "package_id": "streamalchemy",
        "requires_alias": False,
    },
    "1.4.2": {
        "plugin_version": "1.12.0",
        "manifest_id": "stream-monsters",
        "source_path": "app/plugins/stream-monsters/plugin.json",
        "package_id": "stream-monsters",
        "requires_alias": True,
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the LTTH release bundle.")
    parser.add_argument(
        "--version",
        help="Version to package. Defaults to version.json downloadVersion/version.",
    )
    parser.add_argument(
        "--release-assets-dir",
        help="Write an unrestricted immutable release ZIP and manifest to this directory.",
    )
    parser.add_argument(
        "--commit-sha",
        help="Full Git commit SHA recorded in release-asset metadata.",
    )
    parser.add_argument(
        "--validate-release-metadata",
        action="store_true",
        help="Validate release metadata and exit without building an archive.",
    )
    return parser.parse_args()


def load_version_data(repo_root: Path) -> tuple[str, dict]:
    version_file = repo_root / "version.json"
    if not version_file.exists():
        raise FileNotFoundError(f"Missing version metadata: {version_file}")

    data = json.loads(version_file.read_text(encoding="utf-8"))
    version = str(data.get("downloadVersion") or data.get("version") or "").strip()
    if version.startswith("v"):
        version = version[1:]

    if not version:
        raise ValueError("version.json does not contain a usable version.")

    return version, data


def normalize_version(version: str) -> str:
    value = str(version or "").strip()
    if value.startswith("v"):
        value = value[1:]
    if not value:
        raise ValueError("Version must not be empty.")
    if not SEMANTIC_VERSION_PATTERN.fullmatch(value):
        raise ValueError(f"Version must use X.Y.Z numeric form, got {value!r}.")
    return value


def normalize_commit_sha(commit_sha: str) -> str:
    value = str(commit_sha or "").strip().lower()
    if not re.fullmatch(r"[0-9a-f]{40}", value):
        raise ValueError("Commit SHA must contain exactly 40 hexadecimal characters.")
    return value


def read_json_object(file_path: Path) -> dict:
    if not file_path.is_file():
        raise FileNotFoundError(f"Missing release metadata: {file_path}")
    data = json.loads(file_path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{file_path.name} must contain a JSON object.")
    return data


def require_version(
    data: dict,
    field: str,
    expected_version: str,
    source_name: str,
) -> None:
    actual = str(data.get(field) or "").strip()
    if actual != expected_version:
        raise ValueError(
            f"{source_name} {field} must be {expected_version}; got {actual or '<missing>'}."
        )


def validate_stream_monsters_release(
    repo_root: Path,
    ltth_version: str,
) -> None:
    release = STREAM_MONSTERS_RELEASES.get(ltth_version)
    if not release:
        return
    expected_plugin_version = release["plugin_version"]
    manifest_id = release["manifest_id"]
    source_path = release["source_path"]
    package_id = release["package_id"]

    plugin_manifest = read_json_object(repo_root / source_path)
    if plugin_manifest.get("id") != manifest_id:
        raise ValueError(
            f"Stream Monsters plugin manifest must use id {manifest_id}."
        )
    if plugin_manifest.get("name") != "Stream Monsters":
        raise ValueError("Stream Monsters plugin manifest must use the current product name.")
    require_version(
        plugin_manifest,
        "version",
        expected_plugin_version,
        source_path,
    )

    store = read_json_object(repo_root / "plugin-store.json")
    plugins = store.get("plugins")
    if not isinstance(plugins, list):
        raise ValueError("plugin-store.json plugins must be an array.")
    matches = [
        entry for entry in plugins
        if isinstance(entry, dict) and entry.get("id") == manifest_id
    ]
    if len(matches) != 1:
        raise ValueError(
            f"plugin-store.json must contain exactly one {manifest_id} entry."
        )
    store_entry = matches[0]
    actual_store_version = str(store_entry.get("version") or "").strip()
    if actual_store_version != expected_plugin_version:
        raise ValueError(
            f"plugin-store.json {manifest_id}.version must be "
            f"{expected_plugin_version} for LTTH {ltth_version}; "
            f"got {actual_store_version or '<missing>'}."
        )
    expected_package_url = (
        "https://ltth.app/plugin-store/packages/"
        f"{package_id}-{expected_plugin_version}.zip"
    )
    if store_entry.get("packageUrl") != expected_package_url:
        raise ValueError(
            f"plugin-store.json {manifest_id}.packageUrl must be "
            f"{expected_package_url}."
        )
    expected_channel = (
        "stable"
        if plugin_manifest.get("devStatus") == "stable"
        else "open-beta"
    )
    if store_entry.get("channel") != expected_channel:
        raise ValueError(
            f"plugin-store.json {manifest_id}.channel must be "
            f"{expected_channel}."
        )
    if store_entry.get("minLtthVersion") != ltth_version:
        raise ValueError(
            f"plugin-store.json {manifest_id}.minLtthVersion must be "
            f"{ltth_version}."
        )
    localized_name = store_entry.get("name")
    if not isinstance(localized_name, dict) or any(
        localized_name.get(locale) != "Stream Monsters"
        for locale in ("de", "en", "es", "fr")
    ):
        raise ValueError(
            f"plugin-store.json {manifest_id}.name must be Stream Monsters "
            "in de/en/es/fr."
        )
    if release["requires_alias"] and (
        "streamalchemy" not in (store_entry.get("aliases") or [])
        or "streamalchemy" not in (store_entry.get("replaces") or [])
    ):
        raise ValueError(
            f"plugin-store.json {manifest_id} aliases/replaces must reserve "
            "streamalchemy."
        )

    package_path = (
        repo_root
        / "plugin-store"
        / "packages"
        / f"{package_id}-{expected_plugin_version}.zip"
    )
    if not package_path.is_file():
        raise FileNotFoundError(
            f"Missing Stream Monsters store package: {package_path}"
        )
    expected_hash = str(store_entry.get("sha256") or "").strip().lower()
    if not re.fullmatch(r"[0-9a-f]{64}", expected_hash):
        raise ValueError(
            f"plugin-store.json {manifest_id}.sha256 must contain 64 "
            "lowercase hexadecimal characters."
        )
    actual_hash = sha256_file(package_path)
    if actual_hash != expected_hash:
        raise ValueError(
            "Stream Monsters store package SHA-256 does not match "
            "plugin-store.json."
        )


def validate_release_metadata(
    repo_root: Path,
    requested_version: str | None = None,
) -> str:
    version_data = read_json_object(repo_root / "version.json")
    metadata_version = normalize_version(version_data.get("version"))
    download_version = normalize_version(version_data.get("downloadVersion"))
    if download_version != metadata_version:
        raise ValueError(
            "version.json downloadVersion must match version.json version "
            f"{metadata_version}; got {download_version}."
        )

    if requested_version is not None:
        requested = normalize_version(requested_version)
        if requested != metadata_version:
            raise ValueError(
                f"Requested release version {requested} does not match "
                f"version.json version {metadata_version}."
            )

    root_package = read_json_object(repo_root / "package.json")
    app_package = read_json_object(repo_root / "app" / "package.json")
    app_lock = read_json_object(repo_root / "app" / "package-lock.json")
    require_version(root_package, "version", metadata_version, "package.json")
    require_version(app_package, "version", metadata_version, "app/package.json")
    require_version(app_lock, "version", metadata_version, "app/package-lock.json")

    lock_packages = app_lock.get("packages")
    lock_root = lock_packages.get("") if isinstance(lock_packages, dict) else None
    if not isinstance(lock_root, dict):
        raise ValueError(
            'app/package-lock.json must contain a packages[""] root entry.'
        )
    lock_root_version = str(lock_root.get("version") or "").strip()
    if lock_root_version != metadata_version:
        raise ValueError(
            'app/package-lock.json packages[""].version must be '
            f"{metadata_version}; got {lock_root_version or '<missing>'}."
        )

    validate_stream_monsters_release(repo_root, metadata_version)
    return metadata_version


def build_changelog_text(version: str, version_data: dict) -> str:
    changelog = version_data.get("changelog") or {}
    entry = changelog.get(version) or {}
    changes = entry.get("changes") or []
    summary = str(version_data.get("downloadNote") or "").strip()

    lines: list[str] = [f"LTTH Version {version} Release Notes", ""]
    if summary:
        lines.append(summary)
        lines.append("")

    if changes:
        for change in changes:
            lines.append(f"- {change}")
    else:
        lines.append("- No changelog entry available.")

    lines.append("")
    return "\n".join(lines)


def build_bundle_zip(
    repo_root: Path,
    version: str,
    zip_path: Path,
    *,
    enforce_committed_size_limit: bool = True,
) -> None:
    root_prefix = f"ltth_{version}"
    app_root = repo_root / "app"
    if not app_root.exists():
        raise FileNotFoundError(f"Missing app directory: {app_root}")

    if zip_path.exists():
        zip_path.unlink()

    zip_path.parent.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for relative_name in ROOT_TOP_LEVEL_FILES:
            source = repo_root / relative_name
            if source.is_file():
                add_file_entry(archive, source, f"{root_prefix}/{relative_name}")

        add_app_tree(archive, app_root, root_prefix)
        add_directory_entry(archive, f"{root_prefix}/app/logs/")

    if enforce_committed_size_limit:
        validate_bundle_size(zip_path)


def add_app_tree(archive: zipfile.ZipFile, app_root: Path, root_prefix: str) -> None:
    files = sorted(path for path in app_root.rglob("*") if path.is_file())
    for file_path in files:
        rel_path = file_path.relative_to(app_root).as_posix()
        if should_exclude_app_path(rel_path):
            continue
        add_file_entry(archive, file_path, f"{root_prefix}/app/{rel_path}")


def should_exclude_app_path(relative_path: str) -> bool:
    normalized = relative_path.replace("\\", "/")
    if normalized in APP_EXCLUDED_EXACT:
        return True
    if "node_modules" in normalized.split("/"):
        return True
    if normalized.startswith(TALKING_HEADS_BOBA_PREFIX) and "/Ready-To-Use/" in normalized:
        # The runtime composes Boba avatars from Layers/ and boba/extras.
        # Ready-To-Use contains duplicate flattened reference renders.
        return True
    if normalized.startswith(TALKING_HEADS_RGS_PREFIX):
        rgs_relative = normalized[len(TALKING_HEADS_RGS_PREFIX):]
        filename = rgs_relative.rsplit("/", 1)[-1]
        if filename.lower().endswith(".png"):
            # Talking Heads composes its five runtime sprites only from the
            # neutral and blink layers. The other RGS animation frames are
            # editable source material and would push the committed installer
            # ZIP beyond GitHub's 100 MiB blob limit.
            return filename not in TALKING_HEADS_RGS_RUNTIME_FRAMES
    return any(normalized == prefix.rstrip("/") or normalized.startswith(prefix) for prefix in APP_EXCLUDED_PREFIXES)


def validate_bundle_size(zip_path: Path) -> None:
    size = zip_path.stat().st_size
    if size > MAX_RELEASE_BUNDLE_BYTES:
        raise ValueError(
            f"Release bundle is {size / 1024 / 1024:.2f} MiB; "
            f"the committed ZIP must stay below {MAX_RELEASE_BUNDLE_BYTES / 1024 / 1024:.0f} MiB."
        )


def add_directory_entry(archive: zipfile.ZipFile, archive_name: str) -> None:
    if not archive_name.endswith("/"):
        archive_name += "/"
    info = zipfile.ZipInfo(archive_name, date_time=FIXED_ZIP_DATETIME)
    info.compress_type = zipfile.ZIP_STORED
    info.external_attr = 0o40755 << 16
    archive.writestr(info, b"")


def add_file_entry(archive: zipfile.ZipFile, source_path: Path, archive_name: str) -> None:
    info = zipfile.ZipInfo(archive_name, date_time=FIXED_ZIP_DATETIME)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o100644 << 16
    archive.writestr(
        info,
        source_path.read_bytes(),
        compress_type=zipfile.ZIP_DEFLATED,
        compresslevel=9,
    )


def sha256_file(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_release_assets(
    repo_root: Path,
    version: str,
    output_dir: Path,
    commit_sha: str,
) -> tuple[Path, Path]:
    normalized_version = normalize_version(version)
    normalized_commit = normalize_commit_sha(commit_sha)
    output_dir.mkdir(parents=True, exist_ok=True)
    zip_path = output_dir / RELEASE_ASSET_ZIP_NAME
    manifest_path = output_dir / RELEASE_ASSET_MANIFEST_NAME

    build_bundle_zip(
        repo_root,
        normalized_version,
        zip_path,
        enforce_committed_size_limit=False,
    )
    manifest = {
        "schema": 1,
        "component": RELEASE_ASSET_ZIP_NAME,
        "version": normalized_version,
        "tag": f"v{normalized_version}",
        "commitSha": normalized_commit,
        "sha256": sha256_file(zip_path),
        "bytes": zip_path.stat().st_size,
    }
    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return zip_path, manifest_path


def main() -> int:
    args = parse_args()
    repo_root = Path(__file__).resolve().parent.parent
    version, version_data = load_version_data(repo_root)
    version = validate_release_metadata(repo_root, args.version)

    if args.validate_release_metadata:
        if args.release_assets_dir or args.commit_sha:
            raise ValueError(
                "--validate-release-metadata cannot be combined with "
                "--release-assets-dir or --commit-sha."
            )
        print(f"Release metadata valid for LTTH {version}.")
        return 0

    if args.release_assets_dir:
        if not args.commit_sha:
            raise ValueError("--commit-sha is required with --release-assets-dir.")
        output_dir = Path(args.release_assets_dir).resolve()
        zip_path, manifest_path = build_release_assets(
            repo_root,
            version,
            output_dir,
            args.commit_sha,
        )
        print(f"Built release asset:    {zip_path}")
        print(f"Built asset manifest:   {manifest_path}")
        print(f"Version:                {version}")
        print(f"Commit:                 {normalize_commit_sha(args.commit_sha)}")
        print(f"Bundle size:            {zip_path.stat().st_size / 1024 / 1024:.2f} MiB")
        print(f"SHA-256:                {sha256_file(zip_path)}")
        return 0

    if args.commit_sha:
        raise ValueError("--commit-sha requires --release-assets-dir.")

    version_dir = repo_root / "new_patch" / f"ltth_{version}"
    zip_path = version_dir / f"ltth_{version}.zip"
    changelog_path = version_dir / "changelog.txt"

    version_dir.mkdir(parents=True, exist_ok=True)
    build_bundle_zip(repo_root, version, zip_path)
    changelog_path.write_text(build_changelog_text(version, version_data), encoding="utf-8")

    print(f"Built release bundle: {zip_path}")
    print(f"Built changelog:       {changelog_path}")
    print(f"Version:               {version}")
    print(f"Bundle size:           {zip_path.stat().st_size / 1024 / 1024:.2f} MiB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
