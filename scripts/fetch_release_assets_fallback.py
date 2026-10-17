#!/usr/bin/env python3
"""Fetch exact-tag release assets when the Actions artifact has expired."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
import zipfile
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen


TAG_RE = re.compile(r"^v[0-9]+\.[0-9]+\.[0-9]+$")
SHA_RE = re.compile(r"^[0-9a-fA-F]{64}$")
COMMIT_RE = re.compile(r"^[0-9a-fA-F]{40}$")
REQUIRED_ASSETS = {"ltth_latest.json", "ltth_latest.zip"}


class FallbackError(ValueError):
    pass


def _api_json(url: str, token: str, api_host: str) -> dict:
    parsed = urlsplit(url)
    if parsed.scheme != "https" or parsed.netloc != api_host:
        raise FallbackError("GitHub API URL left the configured API host")
    request = Request(url, headers={
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "ltth-pages-release-fallback",
    })
    try:
        with urlopen(request, timeout=60) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise FallbackError(f"GitHub release API request failed: {exc}") from exc
    if not isinstance(payload, dict):
        raise FallbackError("GitHub release API returned malformed data")
    return payload


def _download_asset(asset_url: str, token: str, api_host: str, destination: Path, expected_size: int) -> str:
    parsed = urlsplit(asset_url)
    if parsed.scheme != "https" or parsed.netloc != api_host or expected_size <= 0:
        raise FallbackError("Release asset URL or declared size is invalid")
    request = Request(asset_url, headers={
        "Accept": "application/octet-stream",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "ltth-pages-release-fallback",
    })
    digest = hashlib.sha256()
    size = 0
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        with urlopen(request, timeout=120) as response, destination.open("wb") as output:
            final = urlsplit(response.geturl())
            if final.scheme != "https" or not (
                final.netloc == api_host or final.netloc.endswith(".githubusercontent.com")
            ):
                raise FallbackError("Release asset download redirected to an unexpected host")
            for chunk in iter(lambda: response.read(1024 * 1024), b""):
                size += len(chunk)
                if size > expected_size:
                    raise FallbackError("Release asset exceeded its declared byte count")
                output.write(chunk)
                digest.update(chunk)
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        destination.unlink(missing_ok=True)
        raise FallbackError(f"GitHub release asset download failed: {exc}") from exc
    if size != expected_size:
        destination.unlink(missing_ok=True)
        raise FallbackError("Release asset byte count does not match GitHub metadata")
    return digest.hexdigest()


def fetch_exact_release_assets(
    repository: str,
    tag: str,
    expected_version: str,
    expected_commit_sha: str,
    output_dir: Path,
    token: str,
    api_url: str,
) -> dict:
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
        raise FallbackError("repository must be owner/name")
    if not TAG_RE.fullmatch(tag) or tag != f"v{expected_version}":
        raise FallbackError("fallback requires the exact website vX.Y.Z tag")
    if not COMMIT_RE.fullmatch(expected_commit_sha):
        raise FallbackError("expected release commit SHA is malformed")

    api_host = urlsplit(api_url).netloc
    encoded_repo = quote(repository, safe="/")
    release_url = f"{api_url.rstrip('/')}/repos/{encoded_repo}/releases/tags/{quote(tag, safe='')}"
    release = _api_json(release_url, token, api_host)
    if release.get("tag_name") != tag or release.get("draft") is not False or release.get("prerelease") is not False:
        raise FallbackError("exact-tag GitHub release is missing, draft, prerelease, or has a different tag")
    assets = release.get("assets")
    if not isinstance(assets, list):
        raise FallbackError("GitHub release assets list is malformed")
    asset_path_prefix = urlsplit(release_url).path.rsplit("/releases/tags/", 1)[0] + "/releases/assets/"
    selected: dict[str, dict] = {}
    for asset in assets:
        if not isinstance(asset, dict) or asset.get("name") not in REQUIRED_ASSETS:
            continue
        name = asset["name"]
        if name in selected:
            raise FallbackError(f"GitHub release contains duplicate {name}")
        if asset.get("state") != "uploaded" or not isinstance(asset.get("size"), int) or isinstance(asset.get("size"), bool):
            raise FallbackError(f"GitHub release asset {name} is not a complete upload")
        asset_url = asset.get("url")
        parsed_asset_url = urlsplit(asset_url) if isinstance(asset_url, str) else None
        if (parsed_asset_url is None or parsed_asset_url.scheme != "https" or parsed_asset_url.netloc != api_host
                or not re.fullmatch(re.escape(asset_path_prefix) + r"[1-9][0-9]*", parsed_asset_url.path)
                or parsed_asset_url.query or parsed_asset_url.fragment):
            raise FallbackError(f"GitHub release asset URL is not a canonical asset endpoint for {name}")
        selected[name] = asset
    if set(selected) != REQUIRED_ASSETS:
        raise FallbackError("exact-tag GitHub release is missing required runtime assets")

    manifest_path = output_dir / "ltth_latest.json"
    zip_path = output_dir / "ltth_latest.zip"
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest_hash = _download_asset(selected["ltth_latest.json"].get("url", ""), token, api_host,
                                   manifest_path, selected["ltth_latest.json"]["size"])
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as exc:
        raise FallbackError("release sidecar is unreadable JSON") from exc
    if (not isinstance(manifest, dict) or manifest.get("component") != "ltth_latest.zip"
            or manifest.get("version") != expected_version or manifest.get("tag") != tag
            or not isinstance(manifest.get("commitSha"), str)
            or manifest["commitSha"].lower() != expected_commit_sha.lower()
            or not isinstance(manifest.get("bytes"), int) or isinstance(manifest.get("bytes"), bool)
            or not isinstance(manifest.get("sha256"), str) or not SHA_RE.fullmatch(manifest["sha256"])):
        raise FallbackError("release sidecar does not match exact tag, version, component, or workflow commit")
    if selected["ltth_latest.zip"]["size"] != manifest["bytes"]:
        raise FallbackError("GitHub runtime asset size differs from release sidecar")
    actual_hash = _download_asset(selected["ltth_latest.zip"].get("url", ""), token, api_host,
                                  zip_path, manifest["bytes"])
    if actual_hash.lower() != manifest["sha256"].lower():
        raise FallbackError("GitHub runtime asset SHA-256 differs from release sidecar")
    try:
        with zipfile.ZipFile(zip_path) as archive:
            bad_member = archive.testzip()
    except (OSError, zipfile.BadZipFile) as exc:
        raise FallbackError("GitHub runtime asset is not a readable ZIP") from exc
    if bad_member is not None:
        raise FallbackError(f"GitHub runtime ZIP integrity check failed at {bad_member}")
    return {"tag": tag, "version": expected_version, "commitSha": manifest["commitSha"],
            "bytes": manifest["bytes"], "sha256": actual_hash, "sidecarSha256": manifest_hash}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--version-file", type=Path, required=True)
    parser.add_argument("--expected-release-commit-sha", required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if not token:
        print("GH_TOKEN or GITHUB_TOKEN is required to fetch release assets", file=sys.stderr)
        return 1
    api_url = os.environ.get("GITHUB_API_URL", "https://api.github.com")
    try:
        version_data = json.loads(args.version_file.read_text(encoding="utf-8-sig"))
        version = version_data.get("downloadVersion") if isinstance(version_data, dict) else None
        result = fetch_exact_release_assets(args.repository, args.tag, version, args.expected_release_commit_sha,
                                           args.output_dir, token, api_url)
    except (OSError, json.JSONDecodeError, FallbackError, TypeError) as exc:
        shutil.rmtree(args.output_dir, ignore_errors=True)
        print(f"Exact-tag release asset fallback failed: {exc}", file=sys.stderr)
        return 1
    print(f"Fetched exact release {result['tag']} from commit {result['commitSha']}: "
          f"{result['bytes']} bytes, SHA-256 {result['sha256']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
