# Stream Monsters Collection Overlay Design

## Goal

Make collection commands readable and useful in OBS, and make unhatched eggs
expire fairly after 24 hours without changing monster ownership, combat values,
or the single GCCE command execution path.

## Scope

- `!monsters` renders the caller's complete collection in the Stream Monsters
  OBS overlay.
- `!monster <slot>` renders one monster with its visual and permanent stats in
  the lower half of the OBS canvas.
- A creator-controlled display duration applies to lower overlay cards.
- An unhatched egg expires exactly 24 hours after its creation time and can no
  longer be selected or hatched.

No paid advantage, battle-rule change, image replacement, or command-prefix
change is part of this work.

## Existing Integration Boundary

GCCE and the direct TikTok fallback already call the same Stream Monsters
`ChatCommands` domain handler. That handler returns a command result and the
plugin emits exactly one `streammonsters:chat_result`. The new OBS views stay
inside that event: the overlay inspects `result.status` and consumes the
already returned `monsters` or `monster` payload. This preserves the
one-message/one-action/one-overlay-event invariant and avoids a second socket
event for the same command.

## Overlay Views

### Collection view

For `result.status === "inventory"`, the overlay shows a collection view
instead of the compact chat card.

- At most six monster cards are shown at once in a 2 by 3 grid.
- Cards show stable slot number, visual, name, element, level, and a selected
  marker when applicable.
- With more than six monsters, the view pages through the collection in
  creation/slot order. Each page remains visible for five seconds and the
  current page indicator is shown.
- The view remains open for `max(bottomOverlayDurationMs, pageCount * 5000)`.
  This guarantees a readable five seconds for every page even when the creator
  chooses a shorter default duration.
- If no monsters exist, the regular command message remains a compact chat
  result instead of opening an empty gallery.

### Monster profile view

For `result.status === "monster"`, the overlay shows a dedicated lower-half
profile card.

- The card occupies the lower half of the canvas while keeping the existing
  battle arena independent.
- It shows visual, slot, name, element, rarity, level, personality, selected
  state, and the four permanent stats: vitality, might, guard, and agility.
- It uses the creator's `bottomOverlayDurationMs` and never modifies monster
  state.
- Portrait mode stacks the visual and stat panels while retaining all stat
  labels; landscape mode uses a horizontal layout.

### Timing and queue behavior

`bottomOverlayDurationMs` is a persisted Stream Monsters configuration value.
It defaults to 8,000 ms and is validated to the inclusive 4,000 to 20,000 ms
range. The Creator UI exposes it in seconds. Spawn, hatch, profile, collection,
and compact lower chat cards use this duration. Top toast and battle timing are
unchanged.

Collection and profile command results go through the existing serialized
overlay queue. They are not emitted again from the backend, so a GCCE command
cannot produce duplicate lower cards.

## Egg Expiration

The `streammonsters_eggs` table gains nullable `expired_at_ms`. The existing
`state` column gains the additive value `expired`; existing `incubating`,
`ready`, and `hatched` rows remain valid.

- An egg expires when `created_at_ms + 24 * 60 * 60 * 1000 <= now` and its
  current state is `incubating` or `ready`.
- The store exposes `expireUnhatchedEggs(nowMs)`, which changes qualifying rows
  to `expired`, stamps `expired_at_ms`, and returns the changed eggs.
- The engine invokes expiration before ready-state processing, before any
  hatch attempt, and from its existing periodic timer. Startup invokes the
  same sweep so downtime cannot preserve stale eggs.
- Hatching slots contain only `incubating` and `ready` eggs. Expired eggs are
  retained as collection history but have no hatch slot and cannot block
  incubator capacity.
- `!eggs` reports the active egg slots plus the count of expired eggs. A direct
  hatch request for an expired or missing slot has the existing safe
  not-ready-style response, without creating a monster or awarding progress.

## Data and Compatibility

The migration is additive and idempotent. It does not modify creation times,
ready times, monster records, experience, season points, art choices, or
existing hatch durations. Existing eggs only become expired when they actually
cross the 24-hour boundary.

The public shape of existing `chat_result`, `!monsters`, `!monster`, and
`!eggs` responses stays compatible; additional `expiredEggs` data is additive.

## Verification

Focused tests cover:

1. `!monsters` exposes six cards per page, rotates a seventh monster, and uses
   the full page duration.
2. `!monster 1` provides the selected monster and all four permanent stats to
   the profile renderer.
3. Lower-card duration defaults to eight seconds, persists after config
   updates, and clamps invalid values.
4. An egg one millisecond before 24 hours remains hatchable when ready; an egg
   at 24 hours becomes expired and cannot hatch, grant XP, or create a monster.
5. The periodic and pre-hatch expiry paths are idempotent, and existing
   ready/incubating rows remain compatible.
6. GCCE and fallback command paths continue to emit exactly one chat result
   for a collection or profile request.

The focused Stream Monsters and GCCE suites, lint, CSS build, and
`git diff --check` run before handoff. OBS verification uses the real browser
overlay: collection pages, a profile card, the duration setting, and an expired
egg response are inspected after a plugin-only reload when TikTok is
disconnected.
