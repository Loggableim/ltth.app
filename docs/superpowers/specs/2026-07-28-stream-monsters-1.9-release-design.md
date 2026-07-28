# Stream Monsters 1.9 Release Design

## Goal

Publish the post-1.8 Rules-v7 Stream Monsters source as the immutable plugin
release `1.9.0` without changing LTTH `1.4.1` or rewriting any existing
Stream Monsters archive.

## Release boundary

- Plugin identity remains `streamalchemy`.
- Plugin version becomes `1.9.0`.
- Display name is `Stream Monsters 1.9 - Rules v7 Evolution Combat`.
- LTTH remains `1.4.1`; this is a plugin-only release.
- Archives `1.0.0` through `1.8.0` remain byte-for-byte unchanged.
- The new archive is `plugin-store/packages/streamalchemy-1.9.0.zip`.

## Provenance

The package is built from a dedicated committed plugin tree, not from mutable
working-tree files. The release map records the source commit, plugin tree,
manifest version, package path, and SHA-256. Integrity tests compare every
release with its own recorded source object instead of comparing an old
release with the current `HEAD`.

The version-agnostic package implementation lives in
`app/scripts/build-streammonsters-release.js`. The old
`build-streammonsters-release-v18.js` path remains as a compatibility wrapper.

## Content

The 1.9 package contains the current Rules-v7 implementation:

- passive Special charge during battle;
- localized battle skill explanations and charge state;
- simultaneous sealed choice reveal and replay recovery;
- combat-relevant evolution stats and stage-specific skills;
- animated evolution stat progression;
- explicit Elemental Hour explanation;
- complete deterministic demo battle previews.

No gameplay behavior beyond the already committed Rules-v7 source is added by
the release work.

## Metadata and documentation

`plugin.json`, the official store entry, active Stream Monsters documentation,
and changelog identify `1.9.0`. `CURRENT_RELEASE.json` continues to identify
LTTH `1.4.1`, but its notes describe the currently bundled Stream Monsters
plugin rather than the obsolete 1.5-only state.

## Verification

- Release tests must first fail against the current 1.8-only metadata.
- The new archive must reproduce byte-for-byte from its recorded Git source.
- Every legacy archive hash through 1.8 must remain unchanged.
- Focused Rules-v7, overlay, locale, GCCE, release, and package tests must pass.
- Lint, CSS build, i18n validation, `git diff --check`, ZIP manifest inspection,
  and SHA-256 comparison must pass before integration.

