# Stream Monsters Rules v7 – Live Battle & Evolution Design

## Goal

Stream Monsters makes every active battle understandable without chat spam:
Specials charge visibly over time, both fighters' skills are explained during
the choice window, Elemental Hour states its concrete effect, and evolution
shows animated stat growth. Evolution stages become meaningful combat
progression while matchmaking continues to prefer fair opponents.

The implementation is prepared on an isolated branch. The running `main`
checkout and the port-3000 live runtime are not modified or reloaded while a
TikTok stream is connected.

## Decisions

### Rules version and compatibility

- New matches use `rulesVersion: 7`.
- Existing Rules v5/v6 matches and stored replays keep their original behavior.
- GCCE remains the sole command/raw-response ingress when it is active.
- A sealed skill choice never becomes public before both fighters have locked.
- Public event payloads expose skill descriptions and charge timing, but never a
  hidden choice, provider event ID, participant ID, or private viewer data.

### Passive Special charge

- During each active skill-choice window, both fighters gain 5 Special charge
  per completed second.
- Passive charge supplements the existing gains: Attack +25, Defense +50, and
  an HP hit +25.
- Charge is derived by the server from a durable window-open timestamp and is
  capped at 100. The browser only animates a server-authoritative projection.
- A premature `C` is rejected without locking the player. The same player can
  send `C` again once the meter reaches 100.
- The second accepted lock closes the choice window for charge calculation.
  Timeout recovery uses the stored deadline, so reloads cannot add charge twice.
- `C` consumes the full meter. The stored action contains the materialized
  charge before and after the action plus the charge-window timing.

### Skill explanations

- Every choice-open payload contains a safe public A/B/C presentation for each
  locked monster: localized-name key, icon, localized-effect key, VFX key,
  required charge, and the server charge timing.
- The portrait overlay shows a two-column choice board in the gameplay-safe
  upper 74 percent. Each fighter gets three compact skill rows with icon, name,
  one-line effect, and a live Special meter/readiness label.
- A locked fighter shows only a sealed check mark. Both selected skills are
  highlighted together after the simultaneous reveal event.
- Reconnect and replay normalization preserve the same public skill board and
  charge state.

### Combat evolution

- Stage II permanently grants three deterministic element-appropriate stat
  points and upgrades one A or B skill:
  - Ember: Strength +2, Agility +1
  - Tide: Vitality +2, Defense +1
  - Grove: Defense +2, Vitality +1
  - Gale: Agility +2, Strength +1
  - Volt: Strength +2, Agility +1
  - Lunar: Vitality +1, Defense +1, Strength +1
- Stage III grants the same element profile again and replaces/upgrades the
  monster's Special.
- Striker and Trickster roles upgrade Attack at Stage II. Guardian and Sustain
  roles upgrade Defense.
- Stage-II upgrades add one bounded effect-budget point. Stage-III Specials add
  at most two bounded effect-budget points. All skills retain their element
  identity and `C` still requires 100 charge.
- Evolution grants are recorded in an idempotent ledger and applied in the same
  immediate transaction as essence spending and stage advancement.
- Existing Stage-II/III monsters receive missing grants once during additive
  migration. Re-running migration cannot duplicate stats.
- Match snapshots store stage, stats, and the resolved Rules-v7 skill revision.
  Later evolution cannot mutate an already reserved fight or old replay.

### Fair matchmaking

- Gifts never grant a direct combat stat or a stronger random roll. Daily free
  eggs retain a non-paid path to collection and essence.
- The queue and roster revalidation use a deterministic effective-combat-power
  score derived from level, total persistent stats, and evolution skill tier.
- The initial power window is approximately two normal level gains and widens
  every 30 seconds, alongside the existing Elo window and rematch avoidance.
- Arena Elo calculation and the daily ranked-battle cap do not change.

### Elemental Hour

- The start overlay uses a full localized sentence:
  matching-element eggs receive the existing 30-second incubation reduction and
  +10 Hype; combat values and hatch quality do not improve.
- The message names the active element and remains within the upper gameplay
  area long enough to read.

### Evolution presentation

- `monster_evolved` contains `statsBefore`, `statsAfter`, per-stat deltas, and
  the unlocked skill presentation.
- The large evolution popup keeps the evolved monster visible and animates four
  labeled bars from the previous to the new value.
- The upgraded skill appears after the bars with icon, localized name, and
  localized effect. Reduced Motion jumps to the final values without removing
  the information.

### Languages

- German, English, Spanish, and French contain identical key sets.
- Skill names, skill effects, Special readiness, Elemental Hour explanation,
  evolution stats, and skill-unlock copy are translated in all four languages.
- Template/monster proper names remain canonical.
- Automated validation compares key sets, empty values, and interpolation
  placeholders for the four locale files.

## Verification

- Test-first coverage proves exact passive-charge boundaries, reload recovery,
  premature-C retry, sealed choices, replay determinism, idempotent evolution
  grants, stage-aware skills, effective-power matchmaking, four-locale parity,
  and the portrait overlay behavior.
- The balance simulator covers all templates across stages and representative
  levels/seeds. Same-stage neutral matchups retain the existing neutral target;
  cross-stage results must remain monotonic and bounded by the matchmaking
  window.
- Focused Stream Monsters/GCCE suites use bundled Node 22 / ABI 127, followed by
  lint, CSS build, i18n audit, and `git diff --check`.
- No live reload, runtime restart, merge to `main`, or push is part of this
  implementation pass unless separately authorized after the stream.
