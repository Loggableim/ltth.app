# Stream Monsters Bounded Arena Variants Design

## Context

The current portrait overlay can place independently positioned cards, fighter HUDs, sprites, and prompts in the same vertical area. The supplied 324 × 581 stream reference defines a separate violet arena frame, an external Likebar area, and a lower notification area. Stream Monsters must match that composition instead of taking over the full upper 74% of the canvas.

This design adds an approved `Split Arena` portrait variant while retaining `Classic`. Both variants obey the same collision and text-density rules. The live LTTH app is updated only after isolated implementation, review, and browser validation have passed.

## Goals

- Keep every visible Stream Monsters-owned element fully inside the violet arena frame unless it is one of the two explicit lower exceptions.
- Permit only the egg shelf and short egg lifecycle notifications below the external Likebar.
- Add `Split Arena` as a selectable, esports-intense portrait variant.
- Retain `Classic`, while fixing its text collisions and verbose attack presentation.
- Make `Split Arena` the default for new setups without changing existing saved setups.
- Validate real layout geometry and animation states at the supplied reference size and two larger portrait sizes.
- Integrate the approved result into the running `main` worktree and reload only `streamalchemy`.

## Non-goals

- No changes to battle rules, choice secrecy, timing, damage, matchmaking, persistence, APIs used by gameplay, or monster assets.
- No redesign of landscape mode.
- No control over the external Likebar source; Stream Monsters only reserves its area.
- No app restart, process restart, deployment, website publication, or GitHub push.
- No predictions, crowd meter, or new viewer commands.

## Portrait Geometry Contract

The reference canvas is 324 × 581. Percentages are the source of truth so the same composition scales to other 9:16 canvases.

| Zone | Horizontal range | Vertical range | Allowed content |
| --- | --- | --- | --- |
| Violet arena | 2%–98% | 11.8%–57.8% | Brand badge, battle status, fighter HUDs, sprites, choices, action strip, result, battle VFX |
| Likebar exclusion | 2%–98% | 57.8%–74% | No Stream Monsters content |
| Lower exception lane | 3%–97% | 74%–98% | Egg shelf and one short egg lifecycle notification only |

Equivalent target geometry:

- 324 × 581: arena x 6–318, y 69–336; exception lane y 430–569.
- 477 × 829: arena x 10–467, y 98–479; exception lane y 613–812.
- 1080 × 1920: arena x 22–1058, y 227–1110; exception lane y 1421–1882.

All values may differ by at most one CSS pixel because of subpixel rounding.

The violet arena is a real clipping container. Its background, sprites, HUD, cards, pseudo-elements, Canvas 2D effects, CSS fallback effects, and WebGPU output must not paint outside its rectangle. The rest of the overlay remains transparent except for the allowed exception lane.

The Stream Monsters logo is reduced to an arena badge inside the violet frame during portrait presentation. Global toast, hype, reveal, chat detail, music, gift, profile, and choreography layers must either render inside the arena or remain hidden. They may not occupy the Likebar exclusion or lower exception lane.

## Selectable Variants

### Split Arena

`Split Arena` is the approved new variant.

- Both fighters remain visible and retain a direct left/right relationship.
- The UI uses phase-owned bands inside the arena:
  - status band: arena y 4%–13%;
  - HUD band: arena y 15%–28%;
  - fighter field: arena y 27%–78%;
  - decision rail: arena y 79%–97%.
- Choice phase shows the two HUDs, two fighters, and only `A`, `B`, and `C` with short skill names.
- Action phase replaces the decision rail with one compact action strip and keeps both fighters visible.
- Completed phase replaces all battle UI with one centered result card.
- A phase may own only one dominant information surface.

### Classic

`Classic` keeps the existing portrait visual composition and familiar fighter presentation, but it must use the same violet clipping container and phase-owned collision budget.

- Existing HUD styling and general sprite arrangement remain recognizable.
- Containers may be repositioned or resized to prevent intersection.
- Long attack descriptions, duplicate feed content, and secondary metrics are removed in portrait mode.
- Classic must pass the same geometry and text-overlap tests as Split Arena.

Landscape behavior remains unchanged for both settings.

## Configuration and Compatibility

Add `streamMonsters.portraitArenaVariant` with these accepted values:

- `split-arena`
- `classic`

The Creator UI exposes a localized selector in Overlay Studio with a preview for each variant.

Compatibility rules:

- A truly new setup with no stored `streamMonsters` object defaults to `split-arena` when that object is first created.
- Any existing stored `streamMonsters` object that lacks `portraitArenaVariant`, contains a non-string value, or contains an unknown string resolves once to `classic` and persists that value.
- A saved explicit selection is preserved.
- API updates that include `streamMonsters` but omit `portraitArenaVariant` preserve the already resolved selection instead of reapplying a default.

Data flow:

`Creator selector → sanitized plugin configuration → overlay snapshot → data-arena-variant on the portrait arena`.

The variant is presentation-only and never enters battle-engine decisions.

## Information Density

### Choice

- Show round/countdown, both compact HUDs, both fighters, and the three decisions.
- Each decision contains key plus localized skill name.
- Hide explanatory skill copy, charge prose, tutorial prose, and the general feed while the timer is active.
- Sealed choices remain private; both choices are revealed together using the existing battle contract.

### Attack

Render exactly one line:

`KEY · SKILL NAME · DECISIVE METRIC`

Examples:

- `C · MOONFALL · −7 HP`
- `B · BARK BASTION · +8 SHIELD`
- `C · TIDAL RENEWAL · +6 HP`

Rules:

- No actor name in the action strip because the fighter HUD and motion identify the actor.
- No skill description, duplicate feed, narrative sentence, or second metric.
- Skill name and metric truncate with ellipsis rather than wrap.
- The strip remains one line at 324 × 581.

### Result

Show only:

- winner or draw;
- owner;
- ending round;
- one decisive value, such as remaining HP.

Do not show a round log, rating grid, next-step paragraph, duplicate feed, or combat report in portrait mode.

### Lower Exceptions

Only these may appear in the exception lane:

- persistent egg shelf;
- one short egg lifecycle notification, such as “2 eggs can hatch · !hatch”.

Notifications use at most two lines, never overlap the egg shelf, and respect the existing notification-duration setting. Non-egg notifications remain inside the violet arena or are suppressed in portrait mode.

## Esports-intense Motion

Motion is energetic but bounded. Stable UI surfaces do not move.

- Arena entry: 320–420 ms clipped scale/fade with a short edge glow.
- Choice ready: restrained 900 ms pulse on available `A/B/C` cards.
- Sealed choice: 180 ms lock flash; no early choice reveal.
- Attack:
  - anticipation: 100–140 ms;
  - fighter dash: 140–190 ms;
  - hit-stop: 60–80 ms;
  - recoil and elemental burst: 240–320 ms.
- Result: 380–460 ms winner pop plus a clipped 600–800 ms particle burst.
- Camera impulse is applied only to the arena contents and can never move the clipping boundary.
- VFX origins derive from the measured fighter rectangles instead of fixed viewport coordinates.
- Effects remain behind HUD and action text.
- `prefers-reduced-motion` removes dash, shake, hit-stop, and repeated pulses while preserving phase changes.

## Collision Rules

- Every phase has an explicit grid or reserved bands; independent absolute offsets may not be the only collision control.
- Text containers use a defined maximum width, line count, and overflow behavior.
- No stage-owned bounding rectangle may intersect another stage-owned rectangle unless it is a decorative VFX layer behind the UI.
- Egg shelf and notification rectangles may not intersect each other or the Likebar exclusion.
- Asset aspect ratio and localized copy must not change the geometry contract.

## Testing and Evidence

Implementation follows red-green TDD.

Automated coverage:

- configuration normalization, new-install default, existing-install migration, persistence, and route sanitization;
- Creator payload/load behavior and localized selector copy;
- variant dataset application;
- phase-specific DOM hierarchy and attack text limits;
- Canvas/CSS/WebGPU bounds;
- reduced-motion behavior;
- unchanged landscape contracts;
- sealed-choice privacy and simultaneous reveal regression.

Real-browser validation uses the actual overlay DOM, arena view, and effects renderer without mutating backend game state:

- 324 × 581;
- 477 × 829;
- 1080 × 1920.

For `Split Arena` and `Classic`, capture and measure:

- choice;
- sealed/reveal transition;
- attack anticipation, impact, and settled state;
- completed result;
- egg shelf plus one hatch notification.

Acceptance:

- all visible Stream Monsters rectangles and effect pixels stay inside the violet arena, except for the two lower exceptions;
- only egg shelf and the permitted notification enter the exception lane;
- nothing enters the Likebar exclusion;
- no text wraps or overlaps;
- attack shows exactly one line and one metric;
- screenshots are visually readable at the 324 × 581 reference size.

## Integration Into the Running Main Worktree

Implementation and review happen in the isolated feature worktree first.

After all scoped tests, browser checks, and final review pass:

1. Inspect the live `main` worktree and preserve unrelated dirty changes.
2. Integrate only the approved feature commits into local `main`.
3. Re-run the focused configuration, overlay, battle, effects, and Creator UI tests on the integrated tree.
4. Confirm the existing LTTH server process is still running.
5. Reload only the `streamalchemy` plugin through `POST /api/plugins/streamalchemy/reload`.
6. Verify the reload response and plugin initialization logs.
7. Do not restart the app, Node server, OBS, or any other plugin.

The user then performs the final stream-visible acceptance check. No public push or deployment occurs without a separate explicit request.
