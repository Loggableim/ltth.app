# Config Import/profile isolation practical acceptance plan

Status: prepared only; not executed. This procedure is for a disposable isolated test root and synthetic data. It must never target the running user's LTTH data directory or perform an actual profile switch.

## Fixture setup

1. Create a temporary app data root and initialize two explicit profiles (`alpha` and `beta`) using the profile manager. Put distinct marker values in each profile DB and in the Advanced Timer per-profile data directory. Add a separate legacy plugin-data marker outside profile directories. Place a sentinel value in `.active_profile` and record its exact bytes; do not change it during the test.
2. In Schnorrbecher fixtures, create distinct persistent state for alpha and beta plus a session-only marker in each. Use only the app's test schema. Keep all fixture paths under the temporary root and assert canonical paths before each mutation.
3. Build a backup from alpha with profile-scoped Advanced Timer data enabled. First export with persistent Schnorrbecher state disabled; verify manifest source identity is alpha, only alpha-scoped entries exist, no beta or ambiguous legacy marker is present, and session data is absent. Make a second isolated archive only if separately checking the explicit persistent-state option.

## Import acceptance

4. Preview the archive through the Config Import route/UI fixture. Verify the UI lists explicit existing targets and does not infer target from archive metadata. Submit profile-scoped data to beta while global/plugin settings are also selected; expect the existing cross-profile guard to reject the request, with alpha, beta, legacy markers, DBs, and `.active_profile` unchanged.
5. Submit again with only profile-scoped data selected, explicit target `beta`, and merge mode. Require the confirmation path. Verify only beta receives the alpha marker files; alpha and the legacy location remain byte-identical; beta's existing files/DB data follow merge semantics; `.active_profile` remains byte-identical; response/report names the explicit target. Repeat import to confirm existing destination conflicts do not clobber bytes.
6. Exercise fail-closed inputs independently: missing target selection, nonexistent target profile, malformed profile ID, traversal-like target, target profile directory replaced by a symlink/junction, and unsupported replace mode for scoped data. Each case must reject before altering alpha, beta, legacy data, or active profile sentinel. Use fresh disposable fixtures for any case that cannot be safely retried.
7. For Schnorrbecher persistent state, verify import is unavailable by default and only enabled when both the scoped-plugin checkbox and separate persistent-state checkbox are true and the archive declares the persistent payload. Confirm only the persistent file is imported; session-only markers remain absent. If testing initialized empty state, test exact empty-state replacement only and verify unknown/future fields are preserved or cause a conflict, never guessed to mean empty.

## Evidence and stop conditions

- Record fixture root, test command, route/UI request fields, expected and actual response, before/after hashes for alpha, beta, legacy and `.active_profile`, and all rejected cases.
- Run only relevant isolated regression suites against a copied candidate. Do not change the shared app profile, launch OBS, invoke network/live actions, or use real user backup archives.
- Stop on any unexpected path outside the temporary root, active-profile sentinel change, unexplained data overwrite, or failure to establish whether a target is a junction. Preserve the fixture and report the exact state for review.
- This is an acceptance plan, not test evidence. It does not establish real-user migration correctness, running-app behavior, or live acceptance.
