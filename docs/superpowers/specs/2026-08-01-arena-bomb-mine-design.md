# Arena Bomb Mine Design

**Date:** 2026-08-01
**Status:** approved for implementation

## Goal

Keep `!bomb` as a random cardinal throw, but make a ready bomb readable and a
missed throw become a tactical, non-lethal area-denial mine. Large players must
have a materially larger trigger footprint than small players, while small
players can pass a mine safely when they keep enough distance.

## Player flow

1. A joined Arena player whose bomb is ready has a pulsing red-orange aura.
2. `!bomb` starts the existing random north/south/east/west throw and consumes
   the configured bomb cooldown.
3. A flying bomb detonates on physical contact with an unshielded opponent.
   It does not use its damage radius as a trigger radius.
4. If the flight reaches its range or the field boundary without a hit, the
   bomb stops at that point and changes to an armed mine for 18 seconds.
5. An armed mine detonates when an unshielded opponent physically overlaps its
   core. The owner cannot trigger their own bomb or mine. A shielded player
   does not trigger it.
6. The first active bomb or mine owned by a player is replaced when that player
   throws another bomb, preventing accumulation.

## Explosion rules

The detonation point applies one non-lethal radial shockwave to every eligible
unshielded opponent inside `bombBlastRadius`.

- Core: up to 35% of the radius leaves 22% of the current mass.
- Middle: up to 70% of the radius leaves 45% of the current mass.
- Outer: the remaining radius leaves 70% of the current mass.
- All results are clamped above the safe minimum mass/lives. A bomb never
  eliminates a player directly.

The bomb creates one shared food burst derived from the total mass lost by all
victims. The burst is capped at 40 pieces, so several victims cannot recreate
the former glittering food rain. No kill or kill-score is awarded for this
non-lethal action.

## Overlay feedback

- Ready players render a distinct red-orange pulsing aura; this is separate
  from the boost and shield rings.
- Flying bombs retain a warm yellow core and gain a short red fuse/trail.
- Armed bombs use a grounded red-orange mine presentation with a slow pulse.
- Explosion feedback is an expanding ring and impact flash. It must be
  transient and not cover HUD/rotator text.
- Player state exposes bomb readiness/cooldown, and bomb state exposes its
  `flying` or `armed` phase, enabling both Canvas and Pixi to render the same
  feedback.

## Server and safety boundaries

The Arena remains server-authoritative. The backend owns the random direction,
phase transition, physical trigger, shielding, damage calculation, food burst,
and expiry. The overlay only renders serialized state and event effects.

Existing `bombCooldownMs`, `bombRange`, `bombSpeed`, and `bombBlastRadius`
remain administrator-configurable. The armed duration is a new clamped Arena
configuration value with the shipped default of 18 seconds.

## Verification

Focused Arena tests will cover: ready/cooldown serialization, an unblocked
throw becoming armed, a small player passing without a trigger, a large player
triggering from their larger physical radius, shield immunity, multi-player
non-lethal radial bands, one capped shared food burst, one-bomb-per-owner
replacement, expiry, and the Canvas/Pixi phase/aura/explosion rendering
contract.
