#!/usr/bin/env python3
"""Build the static website bundle for GitHub Pages."""

from __future__ import annotations

import argparse
import json
import posixpath
import re
import shutil
import zipfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
PLUGIN_ID_PATTERN = re.compile(r"[a-z0-9][a-z0-9_-]{0,63}")

ROOT_FILES = [
    ".nojekyll",
    "CNAME",
    "app/CURRENT_RELEASE.json",
    "app/CURRENT_VERSION.txt",
    "app/ltth_latest.zip",
    "manifest.json",
    "plugin-store.json",
    "robots.txt",
    "sitemap.xml",
    "sw.js",
    "version.json",
    "install.js",
    "install.ps1",
    "install.sh",
    "uninstall.ps1",
    "uninstall.sh",
]

ROOT_DIRS = [
    "_partials",
    "assets",
    "css",
    "auth",
    "downloads",
    "docs",
    "features",
    "install",
    "js",
    "locales",
    "oauth",
    "plugin-store/packages",
    "screenshots",
    "streammonsters",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the LTTH Pages bundle.")
    parser.add_argument(
        "--output",
        required=True,
        help="Output directory for the staged website bundle.",
    )
    return parser.parse_args()


def is_retired_chatango_asset(relative_path: str) -> bool:
    parts = relative_path.replace("\\", "/").split("/")
    if not parts or parts[0].casefold() not in {"assets", "screenshots"}:
        return False
    return any(re.search(r"(?:^|[-_.])chatango(?:$|[-_.])", part, re.IGNORECASE) for part in parts[1:])


def copy_file(source: Path, destination: Path) -> bool:
    if not source.exists():
        return False
    if source.is_relative_to(REPO_ROOT) and is_retired_chatango_asset(source.relative_to(REPO_ROOT).as_posix()):
        return False
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    return True


def load_release_policy() -> tuple[set[str], set[str]]:
    policy = json.loads((REPO_ROOT / "app/config/plugin-release-policy.json").read_text(encoding="utf-8-sig"))
    ids = policy.get("closedBeta")
    aliases = policy.get("aliases", {})
    public_asset_path_owners = policy.get("publicAssetPathOwners", {})
    if (type(policy.get("schemaVersion")) is not int or policy.get("schemaVersion") != 1
            or set(policy) - {"schemaVersion", "closedBeta", "aliases", "publicAssetPathOwners"} or not isinstance(ids, list)
            or not all(isinstance(item, str) and PLUGIN_ID_PATTERN.fullmatch(item) for item in ids)
            or len(set(ids)) != len(ids) or not isinstance(aliases, dict)
            or not all(isinstance(key, str) and PLUGIN_ID_PATTERN.fullmatch(key)
                       and key not in ids and value in ids for key, value in aliases.items())
            or not isinstance(public_asset_path_owners, dict)
            or not all(isinstance(asset_path, str) and asset_path.startswith("/")
                       and not asset_path.startswith("//") and asset_path == asset_path.lower()
                       and "\\" not in asset_path and not any(char in asset_path for char in "%?#")
                       and posixpath.normpath(asset_path) == asset_path
                       and all(part not in {"", ".", ".."} for part in asset_path[1:].split("/"))
                       and isinstance(owner, str) and owner in ids
                       for asset_path, owner in public_asset_path_owners.items())
            or len({asset_path.lower() for asset_path in public_asset_path_owners}) != len(public_asset_path_owners)):
        raise ValueError("Invalid plugin release policy")
    return set(ids) | set(aliases), {item.lower() for item in public_asset_path_owners}


def is_public_package(path: Path, closed_beta: set[str]) -> bool:
    if any(path.name.startswith(plugin_id + "-") or path.stem == plugin_id for plugin_id in closed_beta):
        return False
    with zipfile.ZipFile(path) as archive:
        if any(part in closed_beta for name in archive.namelist()
               for part in name.replace("\\", "/").lower().split("/")[:-1]):
            return False
        manifests = [name for name in archive.namelist() if name == "plugin.json" or name.endswith("/plugin.json")]
        if not manifests:
            raise ValueError(f"Package has no plugin manifest: {path.name}")
        root_depth = min(name.count("/") for name in manifests)
        if sum(name.count("/") == root_depth for name in manifests) != 1:
            raise ValueError(f"Package has ambiguous root plugin manifests: {path.name}")
        for name in manifests:
            info = archive.getinfo(name)
            if info.file_size > 1024 * 1024:
                raise ValueError(f"Package manifest too large: {path.name}")
            manifest = json.loads(archive.read(info).decode("utf-8-sig"))
            if not isinstance(manifest.get("id"), str) or not PLUGIN_ID_PATTERN.fullmatch(manifest["id"]):
                raise ValueError(f"Package has an invalid plugin id: {path.name}")
            aliases = manifest.get("aliases", [])
            replaces = manifest.get("replaces", [])
            if not isinstance(aliases, list) or not isinstance(replaces, list):
                raise ValueError(f"Package has invalid plugin aliases: {path.name}")
            identities = [manifest["id"], *aliases, *replaces]
            if not all(isinstance(identity, str) and PLUGIN_ID_PATTERN.fullmatch(identity) for identity in identities):
                raise ValueError(f"Package has invalid plugin identities: {path.name}")
            if any(identity in closed_beta for identity in identities):
                return False
        return True


def is_public_app_archive(path: Path, closed_beta: set[str], excluded_public_assets: set[str]) -> bool:
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        markers = [name for name in names if name.endswith("/app/config/distribution-mode.json")]
        if len(markers) != 1:
            return False
        if archive.getinfo(markers[0]).file_size > 4096:
            return False
        if json.loads(archive.read(markers[0])) != {"channel": "public"}:
            return False
        for name in names:
            parts = name.replace("\\", "/").lower().split("/")
            if "app" in parts:
                app_parts = parts[parts.index("app") + 1:]
                if len(app_parts) > 1 and app_parts[0] == "public":
                    if "/" + "/".join(app_parts[1:]) in excluded_public_assets:
                        return False
            if "plugins" in parts and any(part in closed_beta for part in parts[parts.index("plugins") + 1:-1]):
                return False
            if any(parts[index:index + 2] == ["plugins", plugin_id]
                   for index in range(len(parts) - 1) for plugin_id in closed_beta):
                return False
            if "plugins" in parts and parts[-1] == "plugin.json":
                info = archive.getinfo(name)
                if info.file_size > 1024 * 1024:
                    return False
                manifest = json.loads(archive.read(info).decode("utf-8-sig"))
                if not isinstance(manifest, dict) or not isinstance(manifest.get("id"), str):
                    return False
                aliases = manifest.get("aliases", [])
                replaces = manifest.get("replaces", [])
                if not isinstance(aliases, list) or not isinstance(replaces, list):
                    return False
                identities = [manifest["id"], *aliases, *replaces]
                if not all(isinstance(identity, str) for identity in identities):
                    return False
                if any(identity in closed_beta for identity in identities):
                    return False
        return True


def copy_tree(source: Path, destination: Path, closed_beta: set[str]) -> int:
    if not source.exists():
        return 0

    copied = 0
    for path in sorted(source.rglob("*")):
        if not path.is_file():
            continue
        if source == REPO_ROOT / "plugin-store/packages" and path.suffix.lower() == ".zip":
            if not is_public_package(path, closed_beta):
                continue
        relative_path = path.relative_to(source)
        if path.is_relative_to(REPO_ROOT) and is_retired_chatango_asset(path.relative_to(REPO_ROOT).as_posix()):
            continue
        if source == REPO_ROOT / "streammonsters" and relative_path.as_posix() != "index.html":
            continue
        if source == REPO_ROOT / "docs" and relative_path.parts[0] == "coordination":
            continue
        target = destination / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
        copied += 1
    return copied


def build_bundle(output_dir: Path) -> None:
    closed_beta, excluded_public_assets = load_release_policy()
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    copied_files = 0
    copied_dirs = 0

    for file_name in ROOT_FILES:
        if file_name == "app/ltth_latest.zip" and (REPO_ROOT / file_name).exists():
            if not is_public_app_archive(REPO_ROOT / file_name, closed_beta, excluded_public_assets):
                print("Omitted legacy app download: public distribution policy not satisfied.")
                continue
        if copy_file(REPO_ROOT / file_name, output_dir / file_name):
            copied_files += 1

    for dir_name in ROOT_DIRS:
        source_dir = REPO_ROOT / dir_name
        target_dir = output_dir / dir_name
        copied = copy_tree(source_dir, target_dir, closed_beta)
        if copied:
            copied_dirs += 1
            copied_files += copied

    for html_file in sorted(REPO_ROOT.glob("*.html")):
        if copy_file(html_file, output_dir / html_file.name):
            copied_files += 1

    total_bytes = sum(
        path.stat().st_size for path in output_dir.rglob("*") if path.is_file()
    )
    print(f"Website bundle written to: {output_dir}")
    print(f"Copied files: {copied_files}")
    print(f"Copied directories: {copied_dirs}")
    print(f"Bundle size: {total_bytes / (1024 * 1024):.2f} MB")


def main() -> int:
    args = parse_args()
    output_dir = Path(args.output).resolve()
    build_bundle(output_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
