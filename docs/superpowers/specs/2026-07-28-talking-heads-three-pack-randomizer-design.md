# Talking Heads Three-Pack Randomizer Design

## Goal

Make the automatic Talking Heads avatar lottery draw from the already bundled
Boba Animals, Kenney Monster Builder, and RGS Vector Character Builder packs.
Each pack receives the same chance per draw. Existing viewer assignments stay
unchanged, and a reroll still cannot return the exact current selection.

## Asset Boundary

The supplied archives do not need importing:

- `asset-packs/kenney` already contains the Monster Builder source layers.
- `asset-packs/rgs` already contains the modular Vector Character Builder layers.
- Both source archives are CC0.

The existing renderer already composes five frames for all three packs. The
change is limited to lottery selection, presentation labels, and verification.

## Selection Contract

The valid selection pools are:

| Pack | Valid selections |
| --- | ---: |
| Boba | 90 |
| Kenney | 540 |
| RGS | 504 |

`AssetSpriteLibrary` will expose canonical pools for each pack. On every draw,
it will:

1. Remove excluded exact selections.
2. Choose uniformly from packs that still have an eligible selection.
3. Choose uniformly from that pack's eligible selections.

`getRandomSelection()` and `getLotteryCandidates()` use this same rule. The
candidate method repeats the draw without replacement, so reel cards remain
unique. A reroll excludes the current full selection, including its options.

This gives Boba, Kenney, and RGS each one-third of normal lottery draws. A
flat 1,134-item pool was intentionally rejected because it would reduce Boba
to 7.9 percent of outcomes.

## Presentation and Compatibility

The existing `{ packId, characterId, options }` assignment schema remains
unchanged; no database migration is required. Existing assignments continue to
resolve through their original pack.

Lottery and overlay labels become pack-aware:

- Boba: animal and expression.
- Kenney: body and eye style.
- RGS: head, hair, eyes, and mouth style.

The slot stage keeps its current three-reel event contract and public allowlist.
No assets, chat text, or audio are added to Socket.IO payloads.

## Quality Gates

- Asset-library tests cover all three per-pack pool counts, equal pack choice,
  exact-selection exclusion, and unique reel candidates.
- Frame tests validate representative Kenney and RGS selections and a
  read-only full-pool frame audit validates all 1,134 selections against the
  bundled assets.
- Gift-reroll and first-assignment tests prove that cross-pack winners persist
  and retain the normal no-repeat behavior.
- Stream Director/overlay tests verify pack-aware labels and three-reel cards.
- Focused Talking Heads tests, lint, CSS/i18n checks, and a browser overlay
  smoke test gate release.

## Live Rollout

After verification, commit the scoped change to local `main` and reload only
the `talking-heads` plugin. No application restart, TTS test audio, database
migration, or asset extraction is required. If the browser source has cached
label text, refresh only that OBS source after the plugin reload.
