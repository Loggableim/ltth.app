# Stream Monsters Egg Adoption Reliability Design

## Context

The Stream Monsters 1.11.1 egg loop already distinguishes directly owned gift
eggs from optional free-egg offers, but the persisted offer lifecycle and the
OBS shelf can drift apart. A live read-only audit found stale public offers,
legacy expired eggs in the shared shelf, cooldown-ineligible offers, delayed
shelf updates, replayed egg animations, repeated overflow animation resets,
portrait collisions, and viewer-specific hatch feedback being coalesced away.

This change fixes those reliability defects without changing the core rules:
gift eggs remain directly owned, only free eggs use `!adopt`, the private
reservation remains exactly 60 seconds, and existing incubating eggs retain
their stored `ready_at_ms`.

## Lifecycle Contract

Free-egg offers have one canonical state in both `status` and `stage_state`:

1. `reserved` for exactly 60 seconds and claimable only by the source viewer.
2. `public` for 300 seconds and claimable FIFO by any cooldown-eligible viewer.
3. `claimed` after one transactional claim.
4. `expired` after the public window, stream termination, or disabling the
   feature.

The 24-hour default claim cooldown is checked before creating a reservation.
An ineligible viewer receives no shelf item and no adoption prompt. Existing
creator-configured cooldowns remain unchanged.

The transition timer schedules the next reservation release or public expiry,
whichever is earlier. Terminal TikTok disconnects (`wasLive=true`,
`isTransient=false`, code `1000`, `4005`, or `4404`) expire outstanding offers;
transient reconnects preserve them. Turning free drops off expires outstanding
offers immediately. Reload cleanup stops timers but does not treat a reload as
a stream end.

## Migration and Privacy

The additive migration normalizes `stage_state` from the authoritative
`status`, adds and backfills `public_expires_at_ms`, and recognizes historical
free eggs by either `free_offer_id` or the canonical legacy signature
`gift_id=0` plus `gift_name='Free Egg Drop'`. Existing gift and legacy eggs are
otherwise untouched.

Claimed free inventory eggs remain private shelf state. Their public,
sanitized ready/hatch notifications may still be shown, but live stage events
must carry `ownershipState='owned'` so the shared shelf reducer never
re-inserts them. Numeric viewer IDs are never exposed.

The claimant display name and safe avatar reference are propagated from the
GCCE/fallback command context. The avatar proxy also accepts the current
`tiktokcdn-us.com` host family while retaining HTTPS-only, redirect, MIME, and
size protections.

## Authoritative Overlay State

Egg shelf state is updated immediately when a socket event is received, before
the serial cinematic presentation queue. Presentation latency can therefore
never leave claimed, hatched, boosted, or expired eggs visually stale.

The HTTP snapshot is authoritative on reconnect. Recent egg lifecycle events
are not replayed into the shelf or reanimated after a snapshot; battle replay
continues to use its independent persisted cursor. Live event IDs remain
deduplicated.

Claimed free inventory eggs are ignored by both snapshot and live shelf
reducers. Boost timing is applied immediately and will be recovered from the
next snapshot if the socket was disconnected.

Viewer-specific `chat_result` cards no longer share one global coalescing
bucket. Hatch-wait results are durable and cannot be replaced by another
viewer’s command result before presentation.

## Portrait Shelf and Notices

The shared shelf contains only queued, incubating, and ready owned eggs plus
active reserved/public free offers. Rotten eggs remain available through
viewer inventory commands but never occupy the broadcast shelf.

At 477×829 and 1080×1920, the shelf occupies the documented band immediately
above the bottom 26-percent TikTok chat safe-zone and below the Likes region.
It shows at most the responsive capacity plus a stable `+N` preview. Countdown
ticks update existing keyed nodes; they do not recreate overflow previews or
restart landing, jump, or shake animations.

Each public egg shows a compact expiry countdown. A single localized shelf
summary carries the current `!adopt` reference instead of repeating a wide
label under every egg. Reserved/public transition notices are compact,
coalescible five-second cards in the upper third rather than lossless
12-second cinematic sequences. Gift spawn remains the single ownership
presentation; `egg_landed` updates the shelf without a second long card.

Hatch-not-ready cards stay in the upper gameplay area and show the viewer,
remaining time, and queue position where applicable. Expiry emits one
reachable, sanitized lifecycle notice.

## Verification

Regression coverage must prove:

- cooldown eligibility before offering;
- reserved, public, expired, claimed, disabled, terminal-disconnect, transient
  reconnect, and concurrent-claim behavior;
- migration of mismatched offer states and historical free eggs;
- immediate shelf mutation despite a blocked presentation queue;
- no egg lifecycle replay after a reconnect snapshot;
- claimed free eggs never reappearing on live stage updates;
- stable overflow DOM identity across one-second countdown ticks;
- 477×829 and 1080×1920 shelf geometry with non-overlapping compact labels;
- per-viewer hatch-wait queue behavior;
- safe claimant name/avatar propagation.

All automated verification uses the bundled Node 22 / ABI 127 runtime. No
plugin reload or application restart is part of this implementation while a
stream is active.
