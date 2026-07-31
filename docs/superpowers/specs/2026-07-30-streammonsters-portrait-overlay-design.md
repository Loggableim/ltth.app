# Stream Monsters portrait overlay redesign

## Goal

Make the Stream Monsters OBS/TikTok overlay legible and visually calm at the
canonical 1080 x 1920 portrait profile. The lower 26 percent of the canvas
remains transparent and unoccupied for TikTok chat or camera content.

The supplied live screenshot shows an event/reveal presentation occupying the
same vertical space as the persistent portrait egg-focus card. This work
removes that class of overlap and turns the existing neon purple/cyan styling
into a clear visual hierarchy rather than replacing the product identity.

## Root cause

The portrait egg shelf has a variable height of `clamp(146px, 19vh, 246px)`,
while `#reveal-stage` reserves only the 66 px shelf lane. At both the canonical
1080 x 1920 profile and compact 477 x 829 preview, the reveal area can extend
into the taller egg-focus card. Several independent fixed/absolute layers then
render at the same time without a shared portrait geometry contract.

## Scope

### Portrait geometry contract

The overlay will define named layout variables for the portrait game area,
information rail, and chat-safe boundary. All persistent and temporary
portrait views will consume those variables instead of duplicating `26%`,
`66px`, and unrelated offsets.

```text
0–10%   Header: logo, hype indicator, short toast
10–54%  Hero stage: monster, egg, reward, or event presentation
54–74%  Information rail: one persistent egg-focus card
74–100% Transparent TikTok chat/camera safe zone
```

The information rail's height is the same dynamic height used by the egg-focus
card. The hero stage ends above it; the rail ends at the 74 percent boundary.
No overlay-owned visual element may enter the safe zone in portrait mode.

### Information hierarchy and event behavior

- Keep the existing Stream Monsters logo, neon purple/cyan palette, particle
  effects, ownership information, elements, timer, and command hints.
- Treat the egg-focus card as the sole persistent information rail. It shows
  owner, element, state/action, timer, and queue position in that order.
- Present gift, hatch, monster, XP, and rank events in the hero stage. Their
  card sizing and anchor are bounded by the hero stage, so a long name or
  translation cannot collide with the egg-focus rail.
- Keep short notices in the header. Detailed chat/result views use the same
  hero bounds and do not compete with the persistent rail.
- Preserve battle takeover behavior: a battle owns the complete 0–74 percent
  gameplay area and suppresses the persistent event and egg layers as it does
  today. The TikTok safe zone remains untouched.
- Landscape behavior is not redesigned or regressed.

### Battle readability contract

A battle is a live decision surface, not a written combat log. In portrait it
uses the same 0–74 percent gameplay area, with each phase exposing only the
information the viewer needs next:

- The top status area permanently shows the two fighters, their element, and
  large HP bars. It does not repeat long owner, rank, or narrative text.
- The action phase has one centered, single-line callout: actor, action, and
  the decisive result (for example `Luna attacks · 24 DMG`). At most one short
  badge may accompany it for an effect such as Critical, Shield, or Element
  Advantage. Detailed damage formulae and narrated descriptions stay out of
  the overlay.
- The choice phase shows the prominent `A / B / C` choices as the sole primary
  instruction. The selected action name remains readable, but explanatory
  prose, battle summaries, and unrelated persistent hints are hidden.
- The result phase shows a compact winner/result card after the battle. It
  must not replay a multi-line turn history.

This changes presentation only: battle rules, sealed-choice privacy, the
existing `A / B / C` command protocol, effects, and stored results stay
unchanged.

### Public page and menu discoverability

The existing public guide at `/streammonsters/` becomes the concise product
explanation for the same portrait-first experience. Its hero and arena copy
will explain the viewer-readable sequence `status → A / B / C choice → compact
result`, including the protected lower TikTok chat/camera area. The guide keeps
its existing Monsterdex, commands, rules, and four-language rendering rather
than adding a second marketing page.

The shared Features mega menu receives a direct `Stream Monsters` entry in the
existing `Gaming & Interaction` category that points to `/streammonsters/`.
This keeps the already dense top-level navigation stable while making the game
discoverable from every site page, including mobile navigation. No external
links, new tracking, release deployment, or standalone game purchase flow is
introduced.

### Implementation boundaries

The change is limited to the Stream Monsters overlay presentation, focused
tests, the existing public Stream Monsters guide, and one shared menu link. It
does not change game rules, Twitch/TikTok command handling, stored egg data,
localisation keys, asset packs, or public API contracts.

The implementation should consolidate portrait CSS around shared custom
properties and the existing `#reveal-stage`, `#egg-shelf`, `#chat-card`, and
`#chat-detail` elements. It should not add a second overlay renderer or a
timer-driven parallel state machine.

## Acceptance criteria

1. At 1080 x 1920, the header, hero stage, information rail, and 26 percent
   safe zone have disjoint vertical bounds.
2. At 477 x 829, the same bounds remain disjoint; text stays inside its card
   without a clipped command/timer row.
3. A persistent egg-focus card and each representative temporary presentation
   (egg offer, hatch, monster reveal, detailed chat result) can be shown
   without overlap.
4. Active battle presentation still occupies only the gameplay 74 percent and
   hides conflicting persistent layers.
5. At 1080 x 1920, battle status, action, choice, and result phases make one
   next action unmistakable: fighter/HP, current result, `A / B / C` choice,
   or final winner. No multi-line combat log or description competes with that
   primary item.
6. Existing landscape geometry and public event sequencing continue to pass
   their focused regression tests.
7. The rendered portrait demo is inspected in a real browser at 1080 x 1920;
   a screenshot provides visual evidence for the final hand-off.
8. `/streammonsters/` renders the current portrait game flow in every existing
   site language, and the shared Gaming & Interaction menu has one working
   direct link to that page.

## Test strategy

- Extend the closest Stream Monsters overlay-layout/egg-shelf tests with a
  regression assertion that the portrait reveal and detail bounds reserve the
  complete dynamic information rail, not merely its 66 px lane.
- Add geometry checks for 1080 x 1920 and 477 x 829 covering the safe-zone
  boundary, hero area, and egg-focus rail.
- Run the focused overlay, egg-shelf, arena-view, and chat suites using the
  bundled Node runtime when native dependencies require it.
- Exercise the built-in Stream Monsters demo in a real browser and inspect the
  portrait rendered state for the representative events above plus the battle
  choice, action, and result phases.
- Build the static Pages bundle and browser-check `/streammonsters/` with its
  injected shared header. Verify the direct menu item resolves to the guide
  and the guide copy introduces the compact portrait battle flow.

## Non-goals

- A new illustration/asset pack or a different Stream Monsters brand.
- Changes to current combat balance, player commands, egg ownership, or chat
  safe-zone policy.
- A full landscape redesign or general dashboard redesign.
- Changing the public website deployment or asserting that the isolated
  overlay branch is already live.
