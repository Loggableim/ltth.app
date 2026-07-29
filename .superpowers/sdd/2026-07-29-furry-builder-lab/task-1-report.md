# Task 1 report — source atlases

## Status

DONE

## Files changed

- `tools/furry-builder-lab/assets/heads-atlas.png`
- `tools/furry-builder-lab/assets/eyes-atlas.png`
- `tools/furry-builder-lab/assets/mouths-atlas.png`
- `tools/furry-builder-lab/assets/atlas-manifest.json`
- `tools/furry-builder-lab/test/assets.test.cjs`
- `.superpowers/sdd/2026-07-29-furry-builder-lab/task-1-report.md`

## Test-first evidence

The contract test was created first and run before the manifest existed.

Command:

```text
node --test tools/furry-builder-lab/test/assets.test.cjs
```

RED output (expected):

```text
fail 1
Error: Cannot find module '../assets/atlas-manifest.json'
```

Final command:

```text
node --test tools/furry-builder-lab/test/assets.test.cjs
```

Final output:

```text
pass 1
fail 0
✔ declares three twelve-cell atlases with the required chroma key
```

PNG readability/grid check:

```text
eyes-atlas.png   1086x1448  width % 3 = 0  height % 4 = 0  Format24bppRgb
heads-atlas.png  1086x1448  width % 3 = 0  height % 4 = 0  Format24bppRgb
mouths-atlas.png 1086x1448  width % 3 = 0  height % 4 = 0  Format24bppRgb
```

## Generated image source paths

- Heads: `C:\Users\logga\.codex\generated_images\019faf6f-bbc0-7421-bb2c-6d11aaab91d9\exec-c5223139-7389-4d2c-b2d9-e77ce3c1d60c.png`
- Eyes (final, replacement for the rejected first result): `C:\Users\logga\.codex\generated_images\019faf6f-bbc0-7421-bb2c-6d11aaab91d9\exec-d994d9d0-a1f6-4d4b-b942-6fd2e99ee79e.png`
- Mouths: `C:\Users\logga\.codex\generated_images\019faf6f-bbc0-7421-bb2c-6d11aaab91d9\exec-4bafacfc-3507-4694-b48a-b3d567254d76.png`

## Visual inspection

All final assets were opened and inspected at high detail. Every image has a flat bright-green chroma-key background, no text, and a regular 3-column by 4-row addressable layout.

- Heads: twelve distinct fur/head silhouettes; no ears, eyes, nose, or mouth are present.
- Eyes: twelve centered front-facing eye-pair overlays, one pair in each logical 3-by-4 cell; the first generated eye sheet was rejected because it was not sufficiently grouped into pairs, then regenerated.
- Mouths: twelve distinct centered front-facing mouth overlays, including neutral, smile, open-mouth, teeth, tongue, and pout expressions.

## Commit SHA

`8325b497ad67b737a349da12c4aa8e8f2d5e1fed` — source-atlas and contract-test commit.

## Concerns

The eye pairs contain prominent dark upper eyelids/lashes; this is intentional eye styling rather than separate facial components. The flat chroma key is stored as RGB source art for the later canvas chroma-key removal step, not as transparency.
