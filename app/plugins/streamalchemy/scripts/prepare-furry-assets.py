#!/usr/bin/env python3
"""Prepare generated Stream Monsters furry art for the bundled asset pack."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont


TARGET_SIZE = (1024, 1024)
PROMPT_VERSION = "furry-v1"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def border_median(rgb: np.ndarray) -> np.ndarray:
    width = max(8, min(rgb.shape[:2]) // 80)
    border = np.concatenate(
        (
            rgb[:width, :, :].reshape(-1, 3),
            rgb[-width:, :, :].reshape(-1, 3),
            rgb[:, :width, :].reshape(-1, 3),
            rgb[:, -width:, :].reshape(-1, 3),
        ),
        axis=0,
    )
    return np.median(border, axis=0).astype(np.float32)


def connected_chroma_mask(rgb: np.ndarray, background: np.ndarray) -> np.ndarray:
    values = rgb.astype(np.float32)
    distance = np.linalg.norm(values - background, axis=2)
    red, green, blue = values[:, :, 0], values[:, :, 1], values[:, :, 2]
    green_screen = background[1] > background[0] + 60 and background[1] > background[2] + 60

    if green_screen:
        chroma = (green > red + 34) & (green > blue + 34) & (green > 120)
    else:
        chroma = (red > green + 45) & (blue > green + 45) & (red > 130) & (blue > 100)

    candidates = ((distance < 92) | chroma).astype(np.uint8)
    _, labels = cv2.connectedComponents(candidates, connectivity=8)
    edge_labels = np.unique(
        np.concatenate((labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]))
    )
    edge_labels = edge_labels[edge_labels != 0]
    return np.isin(labels, edge_labels)


def despill_edges(rgb: np.ndarray, background_mask: np.ndarray, background: np.ndarray) -> np.ndarray:
    result = rgb.astype(np.float32)
    kernel = np.ones((5, 5), dtype=np.uint8)
    boundary = cv2.dilate(background_mask.astype(np.uint8), kernel, iterations=1).astype(bool)
    boundary &= ~background_mask

    red, green, blue = result[:, :, 0], result[:, :, 1], result[:, :, 2]
    if background[1] > background[0] + 60 and background[1] > background[2] + 60:
        excess = np.maximum(0, green - np.maximum(red, blue) - 8)
        green[boundary] -= excess[boundary] * 0.82
    else:
        magenta_excess = np.maximum(0, np.minimum(red, blue) - green - 12)
        red[boundary] -= magenta_excess[boundary] * 0.55
        blue[boundary] -= magenta_excess[boundary] * 0.55
    return np.clip(result, 0, 255).astype(np.uint8)


def prepare_image(source: Path, destination: Path) -> dict:
    source_image = Image.open(source).convert("RGB")
    rgb = np.asarray(source_image)
    background = border_median(rgb)
    mask = connected_chroma_mask(rgb, background)
    cleaned = despill_edges(rgb, mask, background)
    alpha = np.where(mask, 0, 255).astype(np.uint8)
    rgba = np.dstack((cleaned, alpha))

    output = Image.fromarray(rgba, mode="RGBA")
    output = output.resize(TARGET_SIZE, Image.Resampling.LANCZOS)
    destination.parent.mkdir(parents=True, exist_ok=True)
    output.save(destination, "PNG", optimize=True)

    alpha_channel = np.asarray(output.getchannel("A"))
    opaque_fraction = float(np.count_nonzero(alpha_channel > 200)) / alpha_channel.size
    return {
        "sourceDimensions": list(source_image.size),
        "dimensions": list(output.size),
        "backgroundRgb": [round(float(value), 2) for value in background],
        "opaqueFraction": round(opaque_fraction, 6),
        "sha256": sha256(destination),
    }


def contact_sheet(records: list[dict], output_dir: Path, destination: Path) -> None:
    tile_size = 240
    label_height = 36
    columns = 6
    rows = (len(records) + columns - 1) // columns
    sheet = Image.new("RGBA", (columns * tile_size, rows * (tile_size + label_height)), (18, 14, 42, 255))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=18)

    for index, record in enumerate(records):
        x = (index % columns) * tile_size
        y = (index // columns) * (tile_size + label_height)
        image = Image.open(output_dir / f"{record['templateId']}.png").convert("RGBA")
        image.thumbnail((tile_size - 12, tile_size - 12), Image.Resampling.LANCZOS)
        offset = (x + (tile_size - image.width) // 2, y + (tile_size - image.height) // 2)
        sheet.alpha_composite(image, offset)
        draw.text((x + 8, y + tile_size + 7), record["name"], fill=(245, 240, 255, 255), font=font)

    destination.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(destination, "PNG", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-map", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--contact-sheet", type=Path)
    args = parser.parse_args()

    source_records = json.loads(args.source_map.read_text(encoding="utf-8"))
    if len(source_records) != 24:
        raise ValueError(f"Expected exactly 24 source records, got {len(source_records)}")

    seen = set()
    manifest_records = []
    for record in source_records:
        template_id = record["templateId"]
        if template_id in seen:
            raise ValueError(f"Duplicate template ID: {template_id}")
        seen.add(template_id)
        source = Path(record["source"])
        if not source.is_file():
            raise FileNotFoundError(source)

        destination = args.output_dir / f"{template_id}.png"
        metrics = prepare_image(source, destination)
        manifest_records.append(
            {
                "templateId": template_id,
                "element": record["element"],
                "name": record["name"],
                "species": record["species"],
                "assetPath": f"assets/streammonsters/furry/{template_id}.png",
                "promptVersion": PROMPT_VERSION,
                **metrics,
            }
        )

    manifest = {
        "schemaVersion": 1,
        "pack": "furry",
        "generator": "OpenAI built-in image generator",
        "promptVersion": PROMPT_VERSION,
        "assets": manifest_records,
    }
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    if args.contact_sheet:
        contact_sheet(source_records, args.output_dir, args.contact_sheet)


if __name__ == "__main__":
    main()
