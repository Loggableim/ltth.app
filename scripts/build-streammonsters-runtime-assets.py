#!/usr/bin/env python3
"""Deterministically convert the bundled Stream Monsters runtime PNGs to WebP."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image


REPO_ROOT = Path(__file__).resolve().parents[1]
FURRY_ROOT = REPO_ROOT / 'app' / 'plugins' / 'streamalchemy' / 'assets' / 'streammonsters' / 'furry'
PLUGIN_ROOT = REPO_ROOT / 'app' / 'plugins' / 'streamalchemy'
MANIFEST_PATH = FURRY_ROOT / 'manifest.json'


def sha256(filename: Path) -> str:
    return hashlib.sha256(filename.read_bytes()).hexdigest()


def convert(source: Path, target: Path) -> None:
    """Write a deterministic lossless RGBA WebP before replacing the PNG."""
    with Image.open(source) as image:
        rgba = image.convert('RGBA')
        if rgba.size != (1024, 1024):
            raise ValueError(f'expected 1024x1024: {source}')
        alpha = rgba.getchannel('A')
        if alpha.getextrema()[0] >= 255:
            raise ValueError(f'opaque source is not a runtime furry asset: {source}')
        temporary = target.with_suffix('.webp.tmp')
        rgba.save(temporary, 'WEBP', lossless=True, method=6, exact=True)
    with Image.open(temporary) as converted:
        verified = converted.convert('RGBA')
        if verified.size != (1024, 1024):
            raise ValueError(f'WebP dimensions changed: {target}')
        if verified.getchannel('A').getextrema()[0] >= 255:
            raise ValueError(f'WebP lost alpha: {target}')
    temporary.replace(target)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    arguments = parser.parse_args()
    manifest = json.loads(MANIFEST_PATH.read_text(encoding='utf-8'))
    assets = manifest.get('assets')
    if not isinstance(assets, list) or len(assets) != 72:
        raise ValueError('expected exactly 72 manifest assets')

    for asset in assets:
        relative = Path(asset['assetPath'])
        if relative.suffix not in {'.png', '.webp'} or '..' in relative.parts:
            raise ValueError(f'unsafe runtime asset path: {relative}')
        target_relative = relative.with_suffix('.webp')
        source = PLUGIN_ROOT / relative
        target = PLUGIN_ROOT / target_relative
        if source.suffix == '.png':
            if arguments.check:
                raise ValueError(f'PNG runtime asset remains: {relative}')
            source_hash = sha256(source)
            convert(source, target)
            source.unlink()
        else:
            source_hash = asset.get('sourcePngSha256')
            if not source_hash:
                raise ValueError(f'missing PNG provenance for {relative}')
        if not target.is_file():
            raise ValueError(f'missing WebP runtime asset: {target_relative}')
        with Image.open(target) as image:
            rgba = image.convert('RGBA')
            if rgba.size != (1024, 1024) or rgba.getchannel('A').getextrema()[0] >= 255:
                raise ValueError(f'invalid alpha WebP: {target_relative}')
        asset['assetPath'] = target_relative.as_posix()
        asset['mediaType'] = 'image/webp'
        asset['sha256'] = sha256(target)
        asset['sourcePngSha256'] = source_hash

    manifest['schemaVersion'] = 3
    manifest['assetVersion'] = 'furry-1.12.0'
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
