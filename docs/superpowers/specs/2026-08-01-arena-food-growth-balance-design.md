# Arena Food Pacing and Growth Balance Design

## Goal

Replace the visible ambient-food "star rain" with a calm, continuous food
flow, while allowing players that win absorbs to grow meaningfully larger.
The maximum player mass is 666.

## Scope

- Ambient food only: food produced by normal arena refill.
- Kill drops remain distinct combat rewards and are not converted into ambient
  food.
- The change applies to new defaults and to known legacy/noisy saved Arena
  profiles without overwriting intentional low-volume custom tuning.
- No application restart is part of this work. A later live activation may use
  only the Game Engine plugin reload endpoint when the user requests it.

## Food pacing

New defaults:

| Setting | Value | Reason |
| --- | ---: | --- |
| `maxFood` | 72 | Bounds ambient visual density. |
| `maxFoodRender` | 66 | Keeps the OBS render cost bounded. |
| `foodSpawnIntervalMs` | 2400 | Makes the refill cadence legible. |
| `foodSpawnBatchSize` | 1 | Removes simultaneous ambient spawn waves. |
| `foodDespawnMs` | 150000 | Lets a dot remain useful before it leaves. |

Ambient dots fade in over 1400 ms. They use the final 48 seconds of their
lifetime as their fade-out window, so they do not pop away. Kill, gift, and
life drops retain their existing combat-oriented timing and burst behavior.

## Growth pacing

- Set the default and effective legacy maximum mass to `666`.
- Migrate former standard caps (`90`, `140`, `170`, `260`, and `520`) to 666.
- Rebase ordinary absorb-reward damping on the configured maximum mass rather
  than the former fixed 260 balance cap. A dominant player therefore receives
  strong absorb growth well past 260; damping begins gradually around 306 and
  increases toward the 666 cap, while the late-game death-food spill still
  prevents runaway growth.
- Keep the existing life conversion, speed penalty, collision radius, and
  render transparency formulas tied to `config.maxMass`; they already scale
  with the cap.

## Existing saved profiles

The runtime normalizers in both the Game Engine config path and Arena game
path apply the new values every time an old profile is loaded:

- A legacy mass cap is raised to 666.
- The known noisy food profile (`foodSpawnBatchSize` above 3, including the
  current 22-dot profile) is replaced by the 2400 ms / one-dot cadence.
- Former built-in food caps (130 total / 72 rendered) become 72 total / 66
  rendered. Already-lower custom limits remain unchanged.
- Existing custom food pacing at three or fewer dots per spawn remains intact.

The Arena dashboard displays the normalized values. Saving it later persists
those values; the runtime behavior is already stable across restarts because
the normalizers reapply the migration.

## Verification

Regression coverage will prove:

1. defaults and recognized legacy profiles resolve to the calm food cadence
   and max mass 666;
2. ambient refill emits one dot per 2400 ms, while kill drops remain bursts;
3. ambient food has the slower fade-in/fade-out contract;
4. a large predator still gets a substantial absorb reward above the former
   260 cap, with damping only close to 666;
5. the dashboard limits the ambient batch control to the safe 1-3 range.

The focused Arena suite, lint, diff check, and an overlay visual check will be
run before any optional plugin-only reload.
