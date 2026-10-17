#!/usr/bin/env python3
"""Build the static website bundle for GitHub Pages."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import unicodedata
import zipfile
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit


REPO_ROOT = Path(__file__).resolve().parent.parent
PLUGIN_ID_PATTERN = re.compile(r"[a-z0-9][a-z0-9_-]{0,63}")
RETIRED_PLUGIN_IDS = {"chatango"}
CLOSED_BETA_FEATURE_ROUTES = {
    "features/animazingpal.html",
    "features/interactive-story.html",
    "features/plugin-music-bot.html",
    "features/osc-bridge.html",
    "features/plugin-stream-alchemy.html",
    "features/talking-heads.html",
    "features/emoji-rain.html",
}
CLOSED_BETA_ROUTE_ALIASES = {
    "streamalchemy",
    "stream-monsters",
}


def normalized_plugin_path_parts(value: str) -> list[str]:
    path = value.replace("\\", "/")
    if "://" in path:
        path = urlsplit(path).path
    else:
        path = path.split("#", 1)[0].split("?", 1)[0]
    normalized = unicodedata.normalize("NFKC", path)
    for _ in range(16):
        decoded = unicodedata.normalize("NFKC", unquote(normalized))
        if decoded == normalized:
            break
        normalized = decoded
    stack: list[str] = []
    for raw_part in normalized.replace("\\", "/").split("/"):
        part = raw_part.casefold()
        if not part or part == ".":
            continue
        if part == "..":
            if stack:
                stack.pop()
            continue
        stack.append(part)
    return stack


def is_internal_public_doc(relative_path: str) -> bool:
    """Return whether a docs path is internal planning or agent coordination."""
    parts = [part.casefold() for part in PurePosixPath(relative_path).parts]
    if parts and parts[0] in {"de", "en", "es", "fr"}:
        parts = parts[1:]
    return bool(parts and parts[0] in {"coordination", "plans", "specs", "superpowers"})

def is_excluded_public_route(relative_path: str, route_excluded_ids: set[str]) -> bool:
    normalized_parts = normalized_plugin_path_parts(relative_path)
    if not normalized_parts:
        return False
    normalized_path = "/".join(normalized_parts)
    if any(part in {"chatango", "plugin-chatango"} for part in normalized_parts):
        return True
    if normalized_path in CLOSED_BETA_FEATURE_ROUTES:
        return True
    if normalized_parts[0] == "features" and len(normalized_parts) > 1:
        feature_id = PurePosixPath(normalized_parts[-1]).stem
        feature_ids = {feature_id}
        if feature_id.startswith("plugin-"):
            feature_ids.add(feature_id[len("plugin-"):])
        if feature_ids & (route_excluded_ids | CLOSED_BETA_ROUTE_ALIASES):
            return True
    if normalized_path in {
        "streammonsters/index.html",
        "stream-monsters/index.html",
        "streamalchemy/index.html",
        "streamalchemy-theme-test.html",
        "streammonsters.html",
        "stream-monsters.html",
        "streamalchemy.html",
    }:
        return True
    if len(normalized_parts) >= 3 and normalized_parts[:2] == ["docs", "plugins"]:
        guide_id = PurePosixPath(normalized_parts[-1]).stem
        if guide_id in route_excluded_ids or guide_id in CLOSED_BETA_ROUTE_ALIASES:
            return True
    return False


def filter_public_sitemap(sitemap_path: Path, route_excluded_ids: set[str]) -> None:
    if not sitemap_path.is_file():
        return
    sitemap = sitemap_path.read_text(encoding="utf-8")
    url_block = re.compile(r"<url>.*?</url>", re.DOTALL)

    def keep_public_url(match: re.Match[str]) -> str:
        block = match.group(0)
        loc_match = re.search(r"<loc>(.*?)</loc>", block, re.DOTALL)
        if not loc_match:
            return block
        route_path = urlsplit(loc_match.group(1).strip()).path
        normalized_path = route_path.strip("/")
        if route_path.endswith("/"):
            normalized_path = f"{normalized_path}/index.html"
        if is_excluded_public_route(normalized_path, route_excluded_ids):
            return ""
        return block

    filtered_sitemap = url_block.sub(keep_public_url, sitemap)
    filtered_sitemap = re.sub(r"(?m)^[ \t]+$", "", filtered_sitemap)
    sitemap_path.write_text(filtered_sitemap, encoding="utf-8")
RETIRED_PUBLIC_ASSET_PATHS = {
    "plugin-logos/chatango.svg",
    "screenshots/chatango.png",
}
RETIRED_PUBLIC_DOC_FILENAMES = {
    "browser_console_warnings.md",
}
RETIRED_SCREENSHOT_DOC_PATHS = {
    "readme.md",
    "readme_screenshots.md",
    "docs-capture-manifest.json",
}
INTERNAL_INSTALL_TEST_PATHS = {
    "test/public-release-env-guard.tests.ps1",
}
RETIRED_PUBLIC_DOC_SUFFIXES = {
    "/superpowers/plans/2026-07-04-plugin-store-appstore-ui.md",
}

ROOT_FILES = [
    ".nojekyll",
    "CNAME",
    "app/CURRENT_RELEASE.json",
    "app/CURRENT_VERSION.txt",
    "app/ltth_latest.zip",
    "manifest.json",
    "plugin-store.json",
    "scripts/public-plugin-allowlist.json",
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


def copy_file(source: Path, destination: Path) -> bool:
    if not source.exists():
        return False
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    return True


def load_release_policy() -> dict:
    policy = json.loads((REPO_ROOT / "app/config/plugin-release-policy.json").read_text(encoding="utf-8-sig"))
    ids = policy.get("closedBeta")
    public_runtime_excluded = policy.get("publicRuntimeExcluded", [])
    aliases = policy.get("aliases", {})
    public_asset_owners = policy.get("publicAssetPathOwners")
    if (type(policy.get("schemaVersion")) is not int or policy.get("schemaVersion") != 1
            or set(policy) - {"schemaVersion", "closedBeta", "publicRuntimeExcluded", "aliases", "publicAssetPathOwners"} or not isinstance(ids, list)
            or not isinstance(public_runtime_excluded, list)
            or not all(isinstance(item, str) and PLUGIN_ID_PATTERN.fullmatch(item) for item in public_runtime_excluded)
            or len(set(public_runtime_excluded)) != len(public_runtime_excluded)
            or set(public_runtime_excluded) & set(ids)
            or not all(isinstance(item, str) and PLUGIN_ID_PATTERN.fullmatch(item) for item in ids)
            or len(set(ids)) != len(ids) or not isinstance(aliases, dict)
            or not all(isinstance(key, str) and PLUGIN_ID_PATTERN.fullmatch(key)
                       and key not in ids and value in ids for key, value in aliases.items())
            or not isinstance(public_asset_owners, dict)):
        raise ValueError("Invalid plugin release policy")
    for asset_path, owner in public_asset_owners.items():
        if (not isinstance(asset_path, str) or not asset_path.startswith("/") or asset_path.startswith("//")
                or asset_path != asset_path.lower() or any(char in asset_path for char in "\\%?#")
                or Path(asset_path).as_posix() != asset_path or not isinstance(owner, str)
                or owner not in ids):
            raise ValueError("Invalid public asset ownership mapping")
    return policy


def load_closed_beta_ids() -> set[str]:
    policy = load_release_policy()
    return set(policy["closedBeta"]) | set(policy.get("publicRuntimeExcluded", [])) | set(policy.get("aliases", {}))


def load_public_plugin_ids() -> set[str]:
    path = REPO_ROOT / "scripts" / "public-plugin-allowlist.json"
    policy = json.loads(path.read_text(encoding="utf-8-sig"))
    ids = policy.get("publicPluginIds") if isinstance(policy, dict) else None
    if (not isinstance(policy, dict) or set(policy) != {"schemaVersion", "publicPluginIds"}
            or type(policy.get("schemaVersion")) is not int or policy["schemaVersion"] != 1
            or not isinstance(ids, list) or not ids
            or not all(isinstance(plugin_id, str) and PLUGIN_ID_PATTERN.fullmatch(plugin_id) for plugin_id in ids)
            or len(set(ids)) != len(ids)):
        raise ValueError("Invalid public plugin allowlist")
    public_ids = set(ids)
    release_policy = load_release_policy()
    excluded_ids = (set(release_policy["closedBeta"])
                    | set(release_policy.get("publicRuntimeExcluded", []))
                    | set(release_policy.get("aliases", {}))
                    | RETIRED_PLUGIN_IDS)
    if public_ids & excluded_ids:
        raise ValueError("Public plugin allowlist contains a closed-beta or retired plugin ID")
    return public_ids


def filter_store_catalog(store_catalog: dict, public_plugin_ids: set[str]) -> dict:
    plugins = store_catalog.get("plugins") if isinstance(store_catalog, dict) else None
    if not isinstance(plugins, list) or any(not isinstance(plugin, dict) for plugin in plugins):
        raise ValueError("Plugin store catalog must contain a plugins list of objects")
    return {
        **store_catalog,
        "plugins": [plugin for plugin in plugins if plugin.get("id") in public_plugin_ids],
    }


def load_store_package_filenames(store_catalog: dict, public_plugin_ids: set[str]) -> set[str]:
    plugins = store_catalog.get("plugins") if isinstance(store_catalog, dict) else None
    if not isinstance(plugins, list):
        raise ValueError("Plugin store catalog must contain a plugins list")
    filenames: set[str] = set()
    filename_keys: set[str] = set()
    ids: set[str] = set()
    for plugin in plugins:
        if not isinstance(plugin, dict):
            raise ValueError("Plugin store catalog contains a malformed entry")
        plugin_id = plugin.get("id")
        if (not isinstance(plugin_id, str) or not PLUGIN_ID_PATTERN.fullmatch(plugin_id)
                or plugin_id not in public_plugin_ids or plugin_id in ids):
            raise ValueError("Plugin store catalog contains a duplicate or non-public plugin ID")
        ids.add(plugin_id)
        package_url = plugin.get("packageUrl")
        if not isinstance(package_url, str) or urlsplit(package_url).scheme != "https":
            raise ValueError("Plugin store packageUrl must be an HTTPS URL")
        filename = PurePosixPath(urlsplit(package_url).path).name
        if (not filename or not filename.lower().endswith(".zip")
                or not filename.casefold().startswith(f"{plugin_id}-")):
            raise ValueError(f"Plugin store packageUrl has no canonical ZIP filename: {package_url}")
        key = filename.casefold()
        if key in filename_keys:
            raise ValueError(f"Plugin store catalog contains a duplicate package filename: {filename}")
        filename_keys.add(key)
        filenames.add(filename)
    return filenames


def validate_store_package_paths(source: Path, allowed_store_packages: set[str]) -> None:
    if not source.exists():
        return

    allowed_by_key = {filename.casefold(): filename for filename in allowed_store_packages}
    seen: dict[str, Path] = {}
    for path in sorted(source.rglob("*")):
        if not path.is_file() or path.suffix.casefold() != ".zip":
            continue
        key = path.name.casefold()
        expected_name = allowed_by_key.get(key)
        if expected_name is None:
            continue
        if key in seen:
            raise ValueError(
                f"Duplicate case-insensitive public package ZIP filename: {seen[key]} and {path}"
            )
        seen[key] = path
        if path.name != expected_name:
            raise ValueError(f"Public package ZIP filename does not match the catalog: {path.name}")
        if path.parent != source:
            raise ValueError(f"Public package ZIP must be directly under the package directory: {path}")


def is_public_package(path: Path, closed_beta: set[str]) -> bool:
    normalized_name = normalized_plugin_path_parts(path.name)
    normalized_stem = normalized_name[-1].rsplit(".", 1)[0] if normalized_name else ""
    normalized_package_id = normalized_stem.split("-", 1)[0]
    if (any(path.name.startswith(plugin_id + "-") or path.stem == plugin_id for plugin_id in closed_beta)
            or normalized_package_id in closed_beta or any("%" in part for part in normalized_name)):
        return False
    with zipfile.ZipFile(path) as archive:
        if any(part in closed_beta or "%" in part for name in archive.namelist()
               for part in normalized_plugin_path_parts(name)):
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


def is_public_app_archive(path: Path, closed_beta: set[str], public_assets: set[str]) -> bool:
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        markers = [name for name in names if name.endswith("/app/config/distribution-mode.json")]
        if len(markers) != 1:
            return False
        if archive.getinfo(markers[0]).file_size > 4096:
            return False
        if json.loads(archive.read(markers[0])) != {"channel": "public"}:
            return False
        app_root = markers[0].replace("\\", "/").lower().rsplit("/config/distribution-mode.json", 1)[0]
        for name in names:
            parts = normalized_plugin_path_parts(name)
            normalized_name = "/".join(parts)
            if any(f"{app_root}/{asset_path}" == normalized_name for asset_path in public_assets):
                return False
            if "plugins" in parts and any(part in closed_beta for part in parts[parts.index("plugins") + 1:-1]):
                return False
            if "plugins" in parts and any("%" in part for part in parts[parts.index("plugins") + 1:]):
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


def copy_tree(
    source: Path,
    destination: Path,
    distribution_exclusions: set[str],
    route_excluded_ids: set[str],
    allowed_store_packages: set[str] | None = None,
) -> int:
    if not source.exists():
        return 0

    copied = 0
    for path in sorted(source.rglob("*")):
        if not path.is_file():
            continue
        if source == REPO_ROOT / "plugin-store/packages" and path.suffix.lower() == ".zip":
            if allowed_store_packages is not None and path.name not in allowed_store_packages:
                continue
            if not is_public_package(path, distribution_exclusions):
                continue
        relative_path = path.relative_to(source)
        public_route_path = (source.relative_to(REPO_ROOT) / relative_path).as_posix()
        if is_excluded_public_route(public_route_path, route_excluded_ids):
            continue
        if source == REPO_ROOT / "features" and relative_path.as_posix().casefold() == "catalog-data.js":
            continue
        normalized_path = relative_path.as_posix().casefold()
        if source == REPO_ROOT / "assets" and normalized_path in RETIRED_PUBLIC_ASSET_PATHS:
            continue
        if source == REPO_ROOT / "docs" and (
            relative_path.name.casefold() in RETIRED_PUBLIC_DOC_FILENAMES
            or relative_path.as_posix() == "root-i18n-migration-manifest.json"
            or any(
                normalized_path == suffix.lstrip("/") or normalized_path.endswith(suffix)
                for suffix in RETIRED_PUBLIC_DOC_SUFFIXES
            )
        ):
            continue
        if source == REPO_ROOT / "screenshots":
            screenshot_parts = tuple(part.casefold() for part in relative_path.parts)
            if normalized_path in RETIRED_SCREENSHOT_DOC_PATHS:
                continue
            if screenshot_parts and screenshot_parts[0] in {"archive", "mocks"}:
                continue
            if any(
                screenshot_parts[index] == "docs"
                and screenshot_parts[index + 1] == "plugins"
                and screenshot_parts[index + 2] in route_excluded_ids
                for index in range(max(0, len(screenshot_parts) - 2))
            ):
                continue
        if source == REPO_ROOT / "install" and normalized_path in INTERNAL_INSTALL_TEST_PATHS:
            continue
        if source == REPO_ROOT / "features" and any(
            retired_id in part.casefold()
            for part in relative_path.parts
            for retired_id in RETIRED_PLUGIN_IDS
        ):
            continue
        if source == REPO_ROOT / "streammonsters" and relative_path.as_posix() != "index.html":
            continue
        if source == REPO_ROOT / "docs" and is_internal_public_doc(relative_path.as_posix()):
            continue
        target = destination / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
        copied += 1
    return copied


def build_bundle(output_dir: Path) -> None:
    policy = load_release_policy()
    route_excluded_ids = set(policy["closedBeta"]) | set(policy.get("aliases", {})) | {"chatango"}
    distribution_exclusions = route_excluded_ids | set(policy.get("publicRuntimeExcluded", []))
    public_assets = {f"public/{asset_path.lstrip('/')}".lower()
                     for asset_path in policy.get("publicAssetPathOwners", {})}
    store_catalog = json.loads((REPO_ROOT / "plugin-store.json").read_text(encoding="utf-8"))
    public_plugin_ids = load_public_plugin_ids()
    public_store_catalog = filter_store_catalog(store_catalog, public_plugin_ids)
    allowed_store_packages = load_store_package_filenames(public_store_catalog, public_plugin_ids)
    validate_store_package_paths(REPO_ROOT / "plugin-store" / "packages", allowed_store_packages)
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    copied_files = 0
    copied_dirs = 0

    for file_name in ROOT_FILES:
        if file_name == "plugin-store.json":
            store_destination = output_dir / file_name
            store_destination.parent.mkdir(parents=True, exist_ok=True)
            store_destination.write_text(
                json.dumps(public_store_catalog, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            copied_files += 1
            continue
        if file_name == "app/ltth_latest.zip" and (REPO_ROOT / file_name).exists():
            if not is_public_app_archive(REPO_ROOT / file_name, distribution_exclusions, public_assets):
                print("Omitted legacy app download: public distribution policy not satisfied.")
                continue
        if copy_file(REPO_ROOT / file_name, output_dir / file_name):
            copied_files += 1

    for dir_name in ROOT_DIRS:
        source_dir = REPO_ROOT / dir_name
        target_dir = output_dir / dir_name
        copied = copy_tree(
            source_dir,
            target_dir,
            distribution_exclusions,
            route_excluded_ids,
            allowed_store_packages if dir_name == "plugin-store/packages" else None,
        )
        if copied:
            copied_dirs += 1
            copied_files += copied

    for html_file in sorted(REPO_ROOT.glob("*.html")):
        if is_excluded_public_route(html_file.name, route_excluded_ids):
            continue
        if copy_file(html_file, output_dir / html_file.name):
            copied_files += 1

    filter_public_sitemap(output_dir / "sitemap.xml", route_excluded_ids)

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
