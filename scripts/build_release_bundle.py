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

This script creates:
  new_patch/ltth_<version>/ltth_<version>.zip
  new_patch/ltth_<version>/changelog.txt

The existing release script can then archive and publish those artifacts to
app/ltth_latest.zip plus the release metadata files.
"""

from __future__ import annotations

import argparse
import json
import sys
import zipfile
from datetime import datetime, timezone
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
    "archive/",
    "logs/",
    "node_modules/",
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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the LTTH release bundle.")
    parser.add_argument(
        "--version",
        help="Version to package. Defaults to version.json downloadVersion/version.",
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
    return value


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


def build_bundle_zip(repo_root: Path, version: str, zip_path: Path) -> None:
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
                archive.write(source, f"{root_prefix}/{relative_name}")

        add_app_tree(archive, app_root, root_prefix)
        add_directory_entry(archive, f"{root_prefix}/app/logs/")

    validate_bundle_size(zip_path)


def add_app_tree(archive: zipfile.ZipFile, app_root: Path, root_prefix: str) -> None:
    files = sorted(path for path in app_root.rglob("*") if path.is_file())
    for file_path in files:
        rel_path = file_path.relative_to(app_root).as_posix()
        if should_exclude_app_path(rel_path):
            continue
        archive.write(file_path, f"{root_prefix}/app/{rel_path}")


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
    info = zipfile.ZipInfo(archive_name, date_time=datetime.now(timezone.utc).timetuple()[:6])
    info.external_attr = 0o40755 << 16
    archive.writestr(info, b"")


def main() -> int:
    args = parse_args()
    repo_root = Path(__file__).resolve().parent.parent
    version, version_data = load_version_data(repo_root)
    if args.version:
        version = normalize_version(args.version)

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
    print(f"Timestamp:             {datetime.now(timezone.utc).isoformat()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
