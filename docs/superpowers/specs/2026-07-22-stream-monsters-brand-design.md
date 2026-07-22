# Stream Monsters Brand Design

## Goal

Replace the remaining StreamAlchemy visual identity with a distinctive Stream Monsters icon and wordmark before integrating the feature branch into `main`.

## Visual direction

The mark uses the polished, high-contrast game presentation already established by the Coin Battle and Emoji Rain plugin logos: a midnight-indigo outline, cyan and violet neon light, and a small gold highlight. Its central figure is an original elemental egg opening around a friendly hatchling. It must not resemble or reference Pokemon characters, names, assets, or typography.

Two generated, transparent PNG assets form one consistent lockup:

- `assets/plugin-logos/stream-monsters-icon.png` is a square store and plugin icon. It contains no text and remains recognisable at 128 px.
- `assets/plugin-logos/stream-monsters-logo.png` is a wide marketing lockup. It uses the same egg and hatchling with the exact visible title `STREAM MONSTERS`.

The generator source images use a flat chroma-key background. The checked-in assets have the chroma key removed and retain alpha transparency.

## Integration

The visible site pages use the new icon and wordmark:

- `features/plugin-stream-alchemy.html` uses the wide logo in the hero and the square icon in the explanatory section.
- `plugins.html` maps the existing `streamalchemy` plugin ID to the square icon.

The stable plugin ID, existing feature URL, plugin data path, and package identifier remain `streamalchemy` for update compatibility. Only customer-facing branding changes to Stream Monsters. The legacy `assets/plugin-logos/streamalchemy.svg` remains in the repository as an unused compatibility-era asset; it is not deleted.

## Packaging and verification

After visual inspection, update the package version and registry hash only if the package builder changes them. Verify that both PNGs are packaged, that no public StreamAlchemy branding remains except the deliberately stable identifiers, and that the focused Stream Monsters test suites, CSS build, and lint pass. Then merge the branded feature branch into `main` locally without overwriting unrelated changes in existing worktrees. No remote push is part of this change.

## Acceptance criteria

- The icon and wide logo are generated, legible, transparent PNGs in the project asset directory.
- The feature page and plugin catalogue display the new assets.
- Visible product name is Stream Monsters; only compatibility identifiers retain `streamalchemy`.
- The package registry hash matches the rebuilt archive.
- The selected tests, CSS build, lint, and post-merge checks supply fresh passing evidence.
