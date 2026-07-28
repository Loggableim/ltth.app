# Egg shelf and active auto-hatch report

## Scope and isolation

- Worktree: `codex/egg-shelf-autohatch`
- Base: local clean `main` at `04b51376` (the current `origin/main` was an ancestor).
- The main checkout, running LTTH instance, TikTok connection, reload state and GitHub remotes were not changed.

## Fixed behaviour

1. Gift eggs remain immediately owned (`provenance: gift`, `ownership_state: owned`) and never surface an adoption affordance.
2. Claimed free eggs stay in their new owner's private inventory and no longer return to the shared shelf after a state snapshot or reconnect.
3. Every visible shelf egg shows a one-second live status:
   - incubating: countdown to `readyAtMs`;
   - queued: FIFO position;
   - ready: the active hatch command;
   - reserved/public free offer: reservation countdown or active adoption command.
4. The overlay receives localized shelf labels in German, English, Spanish and French. It resolves its hatch/adopt command labels dynamically from GCCE command references.
5. Auto-hatch defaults to enabled with a five-minute active-viewer window. It only hatches ready, already owned eggs and remains guarded by the existing transaction/state transition. A free offer cannot be auto-hatched or claimed by it.
6. Creator controls:
   - `autoHatchActiveViewers`: boolean, default `true`;
   - `autoHatchActiveWindowSeconds`: 30–900, default `300`.
   These are creator-only configuration fields and do not appear in the public state configuration.

## Activity definition

LTTH has no reliable platform “viewer is currently watching” event. The implementation therefore uses the narrowest available local evidence: a recent observed TikTok chat event, gift event, GCCE command, or GCCE raw response for the same active `streamKey`. This is in-memory only, expires after the configured window, is cleared on a new stream session, and is not exposed in public state or logs with a raw viewer ID.

## Tests and checks

Run with bundled Node 22 / ABI 127:

```powershell
& C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\node.exe `
  .\node_modules\jest\bin\jest.js --runInBand `
  test/streammonsters-egg-stage-v110.test.js `
  test/streammonsters-jackpot-overlay-v110.test.js `
  test/streammonsters-auto-hatch-v7.test.js `
  test/streammonsters-creator-retention-v6.test.js `
  test/streammonsters-plugin-integration.test.js `
  test/streammonsters-free-egg-drops-v6.test.js `
  test/streammonsters-gcce-v15.test.js
```

Result: 7 suites, 118 tests passed.

Targeted ESLint passed for every changed JavaScript module and test. The CSS build completed without generated-file changes. `git diff --check` exited successfully; Git emitted only pre-existing Windows LF-to-CRLF conversion notices.

## Limits deliberately left for integration/acceptance

- No runtime reload, restart, network action, OBS test or TikTok live test was performed.
- The active-viewer signal is an observed-activity heuristic, not a claim that TikTok reports presence.

## Review fix round 1: connected shelf state changes

### Defects confirmed

1. The backend emitted `egg_ready`, but the event contained no projected public shelf egg. A connected overlay therefore continued to display the stale incubation countdown until it reconnected and received a fresh snapshot.
2. `hatchEgg()` emitted the hatch lifecycle, but not an `egg_stage_removed` event. A successfully hatched egg consequently remained on the connected shelf until the next snapshot.

### Fix

- `egg_ready` now carries the same opaque projected stage item and stable stage event identity as the other shelf lifecycle events.
- `hatchEgg()` now emits exactly one `egg_stage_removed` after the successful transaction. Manual hatch and active-viewer auto-hatch share this code path.
- The overlay applies an incoming `egg_ready` stage update before continuing its established ready-card behaviour. A removal still targets only its matching opaque `visualId`, so a stale removal cannot delete a neighbouring shelf egg.

### Regression evidence

- The new engine regression covers both manual and active-viewer auto-hatch, asserts the ready-stage projection, opaque event identity, no raw egg/viewer identifiers, and exactly one matching removal.
- The JSDOM overlay regression drives the real socket event path: landed -> ready -> hatch lifecycle -> stage removed. It verifies `Ready` plus the active hatch command is visible immediately and that a separately landed neighbour remains after the first egg is removed.
- While tracing that path, one stale assertion was corrected from `upper` to the implemented `upper-third` egg-wait placement. This matches `streammonsters-chat-view.js` and preserves the intended TikTok-safe hatch feedback location.

### Verification

Bundled Node 22 / ABI 127 focused suite:

- `streammonsters-egg-stage-v110`
- `streammonsters-jackpot-overlay-v110`
- `streammonsters-auto-hatch-v7`
- `streammonsters-creator-retention-v6`
- `streammonsters-plugin-integration`
- `streammonsters-free-egg-drops-v6`
- `streammonsters-gcce-v15`
- `streammonsters-review-fix-round2`
- `streammonsters-public-events-v15`
- `streammonsters-overlay-reconnect-v15`
- `streammonsters-arcade-overlay-v6`

Result: 11 suites, 155 tests passed. `git diff --check` passed. The first ESLint invocation used the wrong worktree-relative node_modules path; it was corrected to `app/node_modules` for the final targeted lint run.

No runtime reload, restart, merge, or push was performed.
