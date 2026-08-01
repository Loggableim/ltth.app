# Arena growth 999 design

## Goal

Make consuming another player the decisive growth action again, while allowing visibly larger late-game Arena players without restoring the old dense food effect.

## Balance

- Raise the default maximum mass from `666` to `999`.
- Raise the default maximum lives from `88000` to `320000`: `999^2 / 1.8^2 = 308025`, so the mass cap is reachable without changing the size formula.
- Raise direct unarmed absorb rewards to one full prey-equivalent: `playerAbsorbMassRatio: 1` and `playerAbsorbLifeStealRatio: 1`.
- Keep the existing high-mass damping and death-food spill behaviour.  The higher cap delays damping naturally, but dominance near `999` still cannot grow indefinitely.
- Keep every ambient-food value and timing unchanged: `maxFood: 72`, render cap `66`, 2400 ms interval, single-dot batches, and 150000 ms despawn.

## Migration

The two existing Arena config normalizers recognise the current shipped `666 / 0.82 / 0.84` defaults as legacy defaults and upgrade them to `999 / 1 / 1`.  Only the complete prior tuple with `maxLives: 88000` receives the matching `maxLives: 320000` upgrade; partial or custom profiles, including a custom profile that happens to use `88000`, remain untouched.

## Verification

- Add runtime and admin-normalizer regression cases for the exact prior defaults.
- Prove a real player absorb under the default configuration (without an injected `maxLives` override) gains more mass than the previous 0.82 profile, reaches masses above 666, and caps at 999.
- Run the focused Arena suite and lint.  The local app is stopped, so no live reload or runtime-state mutation occurs.
