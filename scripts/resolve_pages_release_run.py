#!/usr/bin/env python3
"""Resolve the newest successful exact-tag release run for a Pages site commit."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urljoin, urlsplit
from urllib.request import Request, urlopen


TAG_RE = re.compile(r"^v[0-9]+\.[0-9]+\.[0-9]+$")
COMMIT_RE = re.compile(r"^[0-9a-fA-F]{40}$")
RELEASE_WORKFLOW_NAME = "Create GitHub Release"


class ReleaseRunError(ValueError):
    pass


def select_release_run(runs: list[dict], repository: str, tag: str) -> dict:
    if not TAG_RE.fullmatch(tag):
        raise ReleaseRunError("requested Pages runtime tag must be exact vX.Y.Z")
    candidates = []
    for run in runs:
        if not isinstance(run, dict):
            continue
        head_repository = run.get("head_repository")
        head_sha = run.get("head_sha")
        run_id = run.get("id")
        run_number = run.get("run_number")
        run_attempt = run.get("run_attempt")
        if (
            run.get("name") != RELEASE_WORKFLOW_NAME
            or run.get("event") != "push"
            or run.get("status") != "completed"
            or run.get("conclusion") != "success"
            or run.get("head_branch") != tag
            or not isinstance(head_repository, dict)
            or head_repository.get("full_name", "").casefold() != repository.casefold()
            or not isinstance(head_sha, str)
            or not COMMIT_RE.fullmatch(head_sha)
            or not isinstance(run_id, int)
            or isinstance(run_id, bool)
            or run_id <= 0
            or not isinstance(run_number, int)
            or isinstance(run_number, bool)
            or run_number <= 0
            or not isinstance(run_attempt, int)
            or isinstance(run_attempt, bool)
            or run_attempt <= 0
        ):
            continue
        candidates.append(run)

    if not candidates:
        raise ReleaseRunError(f"no successful same-repository release run found for {tag}")

    candidates.sort(
        key=lambda run: (
            run["run_number"],
            run["run_attempt"],
            str(run.get("updated_at") or run.get("created_at") or ""),
            run["id"],
        ),
        reverse=True,
    )
    newest = candidates[0]
    newest_rank = (
        newest["run_number"],
        newest["run_attempt"],
        str(newest.get("updated_at") or newest.get("created_at") or ""),
    )
    tied = [
        run for run in candidates
        if (
            run["run_number"],
            run["run_attempt"],
            str(run.get("updated_at") or run.get("created_at") or ""),
        ) == newest_rank
    ]
    if len(tied) != 1:
        raise ReleaseRunError(f"multiple newest successful release runs are ambiguous for {tag}")
    return {"run_id": newest["id"], "commit_sha": newest["head_sha"].lower(), "tag": tag}


def _next_link(link_header: str) -> str | None:
    for part in link_header.split(","):
        match = re.match(r"\s*<([^>]+)>\s*;\s*rel=\"next\"\s*$", part)
        if match:
            return match.group(1)
    return None


def fetch_release_runs(repository: str, token: str, api_url: str) -> list[dict]:
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
        raise ReleaseRunError("repository must be owner/name")
    endpoint = (
        f"{api_url.rstrip('/')}/repos/{quote(repository, safe='/')}"
        "/actions/workflows/release.yml/runs?event=push&per_page=100&sort=created&direction=desc"
    )
    api_host = urlsplit(api_url).netloc
    runs: list[dict] = []
    seen_urls: set[str] = set()
    next_url: str | None = endpoint
    while next_url:
        parsed = urlsplit(next_url)
        if parsed.scheme != "https" or parsed.netloc != api_host:
            raise ReleaseRunError("GitHub API pagination left the configured API host")
        if next_url in seen_urls:
            raise ReleaseRunError("GitHub API returned a pagination loop")
        seen_urls.add(next_url)
        request = Request(
            next_url,
            headers={
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {token}",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "ltth-pages-release-resolver",
            },
        )
        try:
            with urlopen(request, timeout=30) as response:
                payload = json.loads(response.read().decode("utf-8"))
                next_url = _next_link(response.headers.get("Link", ""))
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ReleaseRunError(f"GitHub Actions API request failed: {exc}") from exc
        if not isinstance(payload, dict) or not isinstance(payload.get("workflow_runs"), list):
            raise ReleaseRunError("GitHub Actions API returned malformed workflow-run data")
        runs.extend(payload["workflow_runs"])
    return runs


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--tag", required=True)
    args = parser.parse_args()
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if not token:
        print("GH_TOKEN or GITHUB_TOKEN is required to query Actions runs", file=sys.stderr)
        return 1
    api_url = os.environ.get("GITHUB_API_URL", "https://api.github.com")
    try:
        selected = select_release_run(
            fetch_release_runs(args.repository, token, api_url),
            args.repository,
            args.tag,
        )
    except ReleaseRunError as exc:
        print(f"Could not resolve a safe Pages runtime release: {exc}", file=sys.stderr)
        return 1

    output = f"run_id={selected['run_id']}\ncommit_sha={selected['commit_sha']}\ntag={selected['tag']}\n"
    output_path = os.environ.get("GITHUB_OUTPUT")
    if output_path:
        with open(output_path, "a", encoding="utf-8") as stream:
            stream.write(output)
    else:
        sys.stdout.write(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
