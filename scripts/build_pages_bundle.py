#!/usr/bin/env python3
"""Build the static website bundle for GitHub Pages."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent

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


def copy_tree(source: Path, destination: Path) -> int:
    if not source.exists():
        return 0

    copied = 0
    for path in sorted(source.rglob("*")):
        if not path.is_file():
            continue
        relative_path = path.relative_to(source)
        target = destination / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
        copied += 1
    return copied


def build_bundle(output_dir: Path) -> None:
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    copied_files = 0
    copied_dirs = 0

    for file_name in ROOT_FILES:
        if copy_file(REPO_ROOT / file_name, output_dir / file_name):
            copied_files += 1

    for dir_name in ROOT_DIRS:
        source_dir = REPO_ROOT / dir_name
        target_dir = output_dir / dir_name
        copied = copy_tree(source_dir, target_dir)
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
