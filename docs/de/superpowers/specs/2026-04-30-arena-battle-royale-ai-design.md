# Arena Battle Royale AI Design

Date: 2026-04-30

## Goal

Turn Live Arena into a watchable battle-royale simulation where balls behave like tactical combatants instead of drifting particles. The system must create visible hunts, escapes, fights, power-up contests, and death drops while staying scalable for large viewer counts.

## Current Context

The active game implementation is `app/plugins/game-engine/games/arena.js`. It already has player state, lives-based size, weapons, spatial indexing, personality profiles, and an overlay at `app/plugins/game-engine/overlay/arena.html`. The next change should keep existing features and API events, but replace weak movement decisions with clearer battle-royale utility AI and steering.

The workspace is not a Git checkout, so this spec cannot be committed here.

## Gameplay Model

Each ball is a combatant with stable personality traits:

- aggression: willingness to hunt or pressure near-equal rivals
- fear: sensitivity to larger threats and unsafe routes
- intelligence: quality of target selection, interception, and threat avoidance
- weaponFocus: priority for powerups and weapon pickups
- foodFocus: priority for growth and safe resource clusters
- randomness: tactical variance, not random wandering
- commitment: target lock duration and resistance to jitter

Small balls are faster and more evasive. Large balls are slower, harder to turn, and more dangerous. A ball may only eat another ball when the real collision overlaps and the attacker radius exceeds the target radius by a configured threshold, defaulting to 1.15.

## Utility AI

Every tick, each ball scores nearby options:

- food: nearby food, clusters, and strategic food lanes near rivals
- threats: larger balls that can eat it soon
- prey: smaller balls it can realistically catch and eat
- weapons: pickups and gift-spawned powerups
- danger: large enemies, boundary traps, and dense clumps

The final steering vector is a weighted sum:

```text
velocity =
  seek(food) +
  seek(prey) +
  seek(weapon) +
  flee(threats) +
  avoidance(large enemies) +
  separation(nearby bodies) +
  boundaryAvoidance +
  wanderFallback
```

Wander is only used when there is no useful food, prey, threat, or weapon signal. Randomness may perturb scoring and steering slightly, but it must not be the primary behavior.

## Combat And Events

Weapons must remain visually meaningful and have cooldowns or active windows. Existing aura-style weapons continue to work. Projectile-oriented weapons can be represented by cooldown-based hits in the backend state before adding richer overlay rendering.

Deaths should emit the existing absorbed event and also drop food particles around the death location. These drops create new conflict zones and make kills visually and strategically valuable.

Live events affect the simulation:

- likes spawn small food bursts near the active viewer or at safe random points
- gifts activate or spawn strong powerups and can grant an extra-life reserve
- streak-like gift repeats should increase buff strength within caps
- chat activity or `!join` style handling keeps spawning players as existing integration already does

## Collision And Performance

The spatial grid is the required query path for player-player, player-food, and player-weapon checks. New code must avoid broad O(n^2) scans for hot paths. Tests should make the spatial query path observable enough to prevent regressions.

The overlay keeps `requestAnimationFrame`. Backend simulation emits compact state snapshots. Object churn should be minimized in hot paths; death food drops and transient combat records should use capped counts and cleanup.

## Visual Clarity

The overlay must preserve clear size differences, weapon tells, death effects, and readable movement. This change focuses on backend state and existing overlay events first. If state adds fields for AI intent, death drops, or cooldowns, the overlay can render them without changing the plugin route shape.

## Acceptance Criteria

- Small balls move faster than large balls under the same steering intent.
- Defensive balls flee from larger threats and avoid fleeing into clumps or walls.
- Aggressive balls hunt edible prey and pressure near-equal rivals when growth routes exist.
- Food, prey, threat, weapon, separation, and boundary signals combine into one final movement vector.
- Eating requires real overlap and a radius threshold.
- Death drops spawn food particles.
- Likes spawn food.
- Gifts activate weapons and can grant extra-life reserve metadata.
- Hot collision and targeting paths use the spatial grid rather than all-player scans.
- Focused Arena Jest tests cover the new behavior.
