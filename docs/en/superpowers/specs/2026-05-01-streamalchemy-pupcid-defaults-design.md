# StreamAlchemy PupCid Defaults Design

Date: 2026-05-01

## Context

The requested change is global default tuning for the TikTok visual effects overlay, specifically StreamAlchemy gift-to-item visuals and rarity frame changes. The local profile database `pupcid.db` contains the relevant gift history and shows that PupCid's gift pattern is dominated by low-coin gifts with occasional mid-value gifts.

Observed profile sample:

- Source: `%LOCALAPPDATA%/ltth.app/user_configs/pupcid.db`
- Range: 2026-04-13 16:22:42 through 2026-04-30 02:08:32
- Raw gift events: 267
- Expanded gift units: 552
- Average coins per gift unit: 11.99
- Median: 1 coin
- 75th percentile: 1 coin
- 90th percentile: 10 coins
- 95th percentile: 100 coins
- Maximum observed gift: 549 coins

Current StreamAlchemy defaults use rarity thresholds of 100, 1000, and 5000 coins, and base gift items are always created as `Common`. This means the overlay rarely shows meaningful frame changes for this profile.

## Decision

Tune StreamAlchemy's global defaults around PupCid's observed distribution:

- `Common`: 0-9 coins
- `Rare`: 10-89 coins
- `Legendary`: 90-298 coins
- `Mythic`: 299+ coins

Base gifts must use the same rarity calculation as crafted items. This makes normal profile gifts produce visible frame variation without waiting for very high-value TikTok gifts.

## Scope

The implementation will change StreamAlchemy only:

- Update global rarity thresholds in the active relaunch constants.
- Update legacy/default config values where StreamAlchemy still exposes older config shapes.
- Change base item creation so gift coin value determines rarity.
- Keep existing frame class names and overlay DOM behavior.
- Keep `defaultStyle` as `rpg`.

The implementation will not modify existing user databases, stored profile settings, or runtime plugin data.

## Data Flow

1. A TikTok gift event reaches `EventProcessor`.
2. `EventProcessor` normalizes `giftId`, `giftName`, `coinValue`, and `repeatCount`.
3. `CraftingEngine.getOrCreateBaseItem()` calculates rarity from `coinValue`.
4. The base item is saved with that rarity and emitted to the overlay.
5. Crafting continues to calculate rarity from the sum of both item coin values.
6. The overlay maps rarity to the existing frame classes:
   - `Common` -> `frame-common`
   - `Rare` -> `frame-rare`
   - `Legendary` -> `frame-legendary`
   - `Mythic` -> `frame-mythic`

## Testing

Use test-first changes in the StreamAlchemy Jest suites:

- A 1-coin base gift remains `Common`.
- A 10-coin base gift becomes `Rare`.
- A 90-coin base gift becomes `Legendary`.
- A 299-coin base gift becomes `Mythic`.
- Crafted rarity uses the same thresholds by summed coin value.

Targeted verification:

```bash
cd app
npx jest test/streamalchemy-relaunch-crafting-flow.test.js test/streamalchemy-rarity-frames.test.js --runInBand
```

If touched behavior affects config route exposure, also run:

```bash
cd app
npx jest test/streamalchemy-relaunch-routes.test.js --runInBand
```

## Risks

Existing profiles with stored StreamAlchemy config may keep their stored thresholds until reset or manually updated, because this change is global default behavior and must not overwrite user data. New profiles and code paths that use defaults will use the PupCid-tuned thresholds.

No Git commit will be made in this workspace because the snapshot is not a Git checkout.

