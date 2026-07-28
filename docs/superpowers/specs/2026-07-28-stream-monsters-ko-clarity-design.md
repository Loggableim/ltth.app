# Stream Monsters KO Clarity Design

## Goal

Make a TikTok viewer understand the current combat state, the cause of each HP
change, and the winner without learning a hidden scoring system. A battle ends
only on K.O.; remaining HP never decides a winner.

## Viewer-facing flow

1. The arena shows both fighters, their owner names, HP, shield and Special
   charge throughout the fight.
2. A persistent upper-third lead strip shows the current leader from the
   visible HP and shield state. It says that this is the current lead, not a
   win prediction.
3. When a fighter acts, one large card names the player, selected skill and
   short effect before the hit sequence. Damage, shield absorption, healing
   and evasion appear at the affected fighter and the matching meter changes
   immediately afterwards.
4. Only a K.O. finishes the match. The arena freezes on the defeated fighter,
   highlights the winner, then presents a transparent result board in the
   chat-safe upper area.
5. The result board names the winning player and monster, states the K.O.
   round, shows remaining HP, and lists both applied Arena Rating changes in
   `before -> after (+/-delta)` form. An ineligible daily-rated battle says
   `ELO unchanged` rather than displaying a fabricated change.

## Data contract

`streammonsters:battle_completed` remains the terminal, deduplicated event.
Its public payload is additive:

- `winnerSlot`
- redacted `winner` with `viewerName`, monster identity and slot
- `ratingChanges[]` containing only slot, rating before, rating after and
  delta
- `completion` and `forfeitedSlot` remain compatible

No viewer ID, chat content or private roster data is exposed. The arena uses
the active fighter snapshot only as a visual fallback when old events lack the
new fields.

## Presentation rules

- Skill cards use readable multi-line names and descriptions; they never use
  ellipsis for skill copy.
- The result card is large, semitransparent and constrained to the upper 74%
  of portrait output, preserving the TikTok chat safe zone.
- The lead strip and result card are presentational only. They do not alter
  combat resolution, matchmaking, charge, XP or Elo.
- The winning player, not only the monster name, is the primary result label.

## Failure handling

Old replay and event payloads retain their legacy behaviour: the arena falls
back to the visible monster name and omits missing rating text. A missing or
zero rating delta renders as `ELO unchanged`; it must not be styled as a loss.

## Verification

- Battle service tests prove the completed public event carries sanitized
  winner and rating changes.
- Arena DOM tests prove the result card displays the player name and signed
  Elo values, and old events still render safely.
- Overlay markup tests assert readable skill typography, no single-line
  truncation for skill descriptions, and result-card placement above the
  portrait chat safe zone.
- A manual OBS preview verifies both portrait and landscape layouts.
