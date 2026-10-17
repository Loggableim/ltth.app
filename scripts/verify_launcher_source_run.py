#!/usr/bin/env python3
"""Fail-closed validator for launcher candidate Actions run provenance."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen

REPOSITORY = "Loggableim/ltth.app"
WORKFLOWS = {
    ".github/workflows/release.yml": {"events": {"push"}, "ref": re.compile(r"^refs/tags/v[0-9]+\.[0-9]+\.[0-9]+$")},
    ".github/workflows/build-launcher.yml": {
        "events": {"push", "workflow_dispatch"},
        "ref": re.compile(r"^(?:refs/tags/launcher-v[0-9]+\.[0-9]+\.[0-9]+|refs/tags/launcher-beta-v[0-9]+\.[0-9]+\.[0-9]+|refs/heads/main)$"),
    },
}
SHA_RE = re.compile(r"^[0-9a-fA-F]{40}$")
RUN_ID_RE = re.compile(r"^[1-9][0-9]*$")


class SourceRunError(ValueError):
    pass


def source_run_receipt(selected: dict) -> dict:
    return {
        "schema": 1,
        "repository": REPOSITORY,
        "runId": selected["run_id"],
        "workflow": selected["workflow"],
        "event": selected["event"],
        "ref": selected["ref"],
        "commitSha": selected["commit_sha"],
    }


def validate_source_run(run: dict, workflow_ids: dict[str, int], expected_run_id: str, expected_sha: str) -> dict:
    if not RUN_ID_RE.fullmatch(expected_run_id):
        raise SourceRunError("source run ID input is malformed")
    if not SHA_RE.fullmatch(expected_sha):
        raise SourceRunError("source commit input is malformed")
    if not isinstance(run, dict):
        raise SourceRunError("Actions API returned malformed run metadata")
    api_run_id = run.get("id")
    if not isinstance(api_run_id, int) or isinstance(api_run_id, bool) or api_run_id <= 0 or api_run_id != int(expected_run_id):
        raise SourceRunError("Actions run ID does not match requested run")
    repository = run.get("repository")
    repository_name = repository.get("full_name") if isinstance(repository, dict) else None
    if not isinstance(repository_name, str) or repository_name.casefold() != REPOSITORY.casefold():
        raise SourceRunError("source run repository is not canonical")
    path = run.get("path")
    workflow_id = run.get("workflow_id")
    if not isinstance(path, str) or not isinstance(workflow_id, int) or isinstance(workflow_id, bool):
        raise SourceRunError("source run workflow identity is unsupported")
    canonical_path = next((candidate for candidate in WORKFLOWS if path.startswith(candidate + "@")), None)
    if canonical_path is None or workflow_ids.get(canonical_path) != workflow_id:
        raise SourceRunError("source run workflow ID does not match canonical workflow metadata")
    path_ref = path.split("@", 1)[1]
    expected = WORKFLOWS[canonical_path]
    event = run.get("event")
    head_branch = run.get("head_branch")
    if not isinstance(event, str) or event not in expected["events"] or not expected["ref"].fullmatch(path_ref):
        raise SourceRunError("source run event or ref is not allowed for its workflow")
    expected_branch = path_ref.removeprefix("refs/tags/") if path_ref.startswith("refs/tags/") else path_ref.removeprefix("refs/heads/")
    if head_branch != expected_branch:
        raise SourceRunError("source run branch/tag does not match workflow ref")
    if event == "workflow_dispatch" and (canonical_path != ".github/workflows/build-launcher.yml" or path_ref != "refs/heads/main"):
        raise SourceRunError("manual source run must use canonical main ref")
    head_sha = run.get("head_sha")
    if not isinstance(head_sha, str) or not SHA_RE.fullmatch(head_sha) or head_sha.casefold() != expected_sha.casefold():
        raise SourceRunError("source run SHA does not match requested source commit")
    if run.get("status") != "completed" or run.get("conclusion") != "success":
        raise SourceRunError("source run is not completed successfully")
    return {"run_id": int(expected_run_id), "workflow": canonical_path, "commit_sha": head_sha.lower(), "event": event, "ref": path_ref}


def _get_json(url: str, api_host: str, token: str) -> dict:
    parsed = urlsplit(url)
    if parsed.scheme != "https" or parsed.netloc != api_host:
        raise SourceRunError("Actions API URL left configured host")
    request = Request(url, headers={"Accept": "application/vnd.github+json", "Authorization": f"Bearer {token}", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "ltth-launcher-source-run-validator"})
    try:
        with urlopen(request, timeout=30) as response:
            if urlsplit(response.geturl()).scheme != "https" or urlsplit(response.geturl()).netloc != api_host:
                raise SourceRunError("Actions API redirect left configured host")
            result = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise SourceRunError(f"GitHub Actions API request failed ({type(exc).__name__})") from exc
    if not isinstance(result, dict):
        raise SourceRunError("GitHub Actions API returned malformed JSON")
    return result


def fetch_source_run(repository: str, run_id: str, token: str, api_url: str) -> tuple[dict, dict[str, int]]:
    if not isinstance(repository, str) or repository.casefold() != REPOSITORY.casefold():
        raise SourceRunError("repository context is not canonical")
    if not RUN_ID_RE.fullmatch(run_id):
        raise SourceRunError("source run ID input is malformed")
    api_host = urlsplit(api_url).netloc
    if not api_host:
        raise SourceRunError("GitHub API URL is malformed")
    base = f"{api_url.rstrip('/')}/repos/{quote(REPOSITORY, safe='/')}/actions"
    run = _get_json(f"{base}/runs/{run_id}", api_host, token)
    ids = {}
    for path in WORKFLOWS:
        workflow_name = path.rsplit("/", 1)[1]
        metadata = _get_json(f"{base}/workflows/{quote(workflow_name, safe='')}", api_host, token)
        if (not isinstance(metadata.get("id"), int) or isinstance(metadata.get("id"), bool)
                or metadata.get("path") != path):
            raise SourceRunError("canonical workflow metadata is malformed")
        ids[path] = metadata["id"]
    return run, ids


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--commit-sha", required=True)
    parser.add_argument("--receipt-output", help="write the validated source-run provenance receipt as JSON")
    args = parser.parse_args()
    token = os.environ.get("GH_TOKEN")
    if not token:
        print("GH_TOKEN is required for Actions run verification", file=sys.stderr)
        return 1
    try:
        run, ids = fetch_source_run(args.repository, args.run_id, token, os.environ.get("GITHUB_API_URL", "https://api.github.com"))
        selected = validate_source_run(run, ids, args.run_id, args.commit_sha)
    except SourceRunError as exc:
        print(f"Source run provenance rejected: {exc}", file=sys.stderr)
        return 1
    output = f"run_id={selected['run_id']}\ncommit_sha={selected['commit_sha']}\nworkflow={selected['workflow']}\n"
    if args.receipt_output:
        receipt = source_run_receipt(selected)
        try:
            with open(args.receipt_output, "x", encoding="utf-8", newline="\n") as stream:
                json.dump(receipt, stream, sort_keys=True, separators=(",", ":"))
                stream.write("\n")
        except OSError as exc:
            print(f"Could not create source-run receipt ({type(exc).__name__})", file=sys.stderr)
            return 1
    output_path = os.environ.get("GITHUB_OUTPUT")
    if output_path:
        with open(output_path, "a", encoding="utf-8") as stream:
            stream.write(output)
    else:
        sys.stdout.write(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
