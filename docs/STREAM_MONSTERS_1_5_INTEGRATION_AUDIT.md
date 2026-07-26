# Stream Monsters 1.5 Integration Audit

Date: 2026-07-26

## Release boundary

- Release branch: `codex/stream-monsters-1.5-release`
- Audited base: `origin/main` at `1b9b8e6edd4eb7ff24a82ec7ec8212c60b023c1a`
- Stable plugin ID: `streamalchemy`
- Plugin release: `1.5.0`
- LTTH release: `1.4.1`
- Maintained Windows launcher: signed root `launcher.exe`, built from
  `build-src/launcher-gui.go`; it bootstraps and updates from immutable GitHub
  app-release tags. The historical `launcher/main.go` site-ZIP path is not the
  maintained or published launcher source.

The release worktree was created from the audited remote base. The primary
checkout was never used for implementation, staging, package generation, or
runtime QA.

## Stream Monsters changes ported semantically

The following release-branch commits are the reviewed implementation lineage.
They consolidate the useful behavior from the earlier local Stream Monsters
branches without snapshot-merging their obsolete Art Lab, provider, runtime, or
starter paths:

- `1967bf28` through `5fb54227`: Rules-v5 runtime boundary and review fixes.
- `55ee67e6` through `07cfad3b`: gift-only egg loop, Random bags, collection,
  command aliases, GCCE ingress, privacy-safe overlay commands, and reconnect
  defaults.
- `d55ee18a` through `17a9701a`: persistent interactive arena battles, replay,
  recovery, and public replay hardening.

The uncommitted 1.5 release delta on top of that lineage contains the 72 bundled
Furry forms, cosmetic evolution, Creator Live Center, portrait-first arena,
audio, public-state projection, release packaging, localization, and the final
regression fixes. It is committed only after the documented verification gates
pass.

## Local-main inventory

During the release work, the independent primary checkout advanced from earlier
local Stream Monsters work through
`7e5dcb42d41e2fc71266d032cbd9e7a2321b4fd7` and then to local merge commit
`2b833848189ee292cea6723e9f519e34d6822768`. At the final pre-publication
inventory it was 49 commits ahead of and 44 commits behind the still-current
remote base, with 25 foreign working-tree entries (20 modified, 3 deleted, and
2 untracked). Those commits and uncommitted files remain untouched; the primary
checkout is not used as a merge or packaging source.

Classification of local commits not present in `origin/main`:

- **Ported semantically:** the Stream Monsters/GCCE series from `a5735271`
  through `e31c891b`. Required behavior is represented by the Rules-v5 release
  implementation and its focused tests; those snapshots are not cherry-picked.
- **Independent and separately releaseable:** WebGPU Fireworks star-fill
  (`90653299`), Connect4 avatar matchmaking (`4f660d1f`), and the TikTok Studio
  quick-tunnel series after `e31c891b` through `7e5dcb42`. The subsequent
  Connect4 viewer-priority series (`c5c98795` through `44d5af80`) and its
  integration merge (`2b833848`) are likewise independent; their direct
  release diff has no path overlap with the 1.5 delta. They are not required by
  Stream Monsters 1.5 and are not silently folded into this release.
- **Conflicting/obsolete for 1.5:** local deletions of the historical
  Stream Monsters packages and older Art Lab/runtime implementation. The release
  instead preserves the published 1.2.0, 1.3.0, and 1.4.0 archives byte-for-byte,
  retains additive data compatibility, and exposes only controlled HTTP 410
  tombstones for retired generation endpoints.
- **Historical documentation:** earlier Collector/Cinematic plans remain useful
  provenance but do not override the verified Rules-v5 implementation or active
  1.5 documentation.

No independent worktree or branch was merged merely because it existed.

## Publication gates

Before publication, the release must prove:

1. focused Node 22 / ABI 127 Stream Monsters and GCCE suites;
2. 72 unique 1024×1024 RGBA assets and the curated CC0 audio manifest;
3. real Creator and portrait-overlay browser captures from the release worktree;
4. deterministic `streamalchemy-1.5.0.zip` contents and SHA-256;
5. unchanged SHA-256 values for the 1.2.0, 1.3.0, and 1.4.0 archives;
6. lint, CSS build, `git diff --check`, and a bounded full Jest run;
7. exact commit equality between GitHub `main`, tag `v1.4.1`, release source,
   and the commit recorded in `ltth_latest.json`.
