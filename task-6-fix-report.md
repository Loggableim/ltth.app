# Task 6 Fix Report: Round-resolution idempotency

Commit: current branch HEAD — `fix: make participant round resolution idempotent`

## Root cause

`resolveParticipantRound` incremented `missed_rounds` every time it was invoked. A retry for the same logical round could therefore eliminate a participant after only one actual missed round.

## Fix

- Added the additive `story_participant_round_resolutions` SQLite table with a unique `(session_id, participant_id, round)` key.
- Resolution atomically claims that key via `INSERT OR IGNORE`; only the call that creates the claim can mutate attendance or eliminate the participant.
- Cleans resolution markers before participant/session deletion.

## Regression coverage

- A registry regression resolves round 1 twice, verifies the second call is empty and `missedRounds` remains 1, then resolves distinct round 2 and verifies elimination.
- Session-retention cleanup now resolves a participant before deleting its expired session, proving resolution markers do not violate foreign keys.

## Verification

- Bundled runtime Jest: `participant-registry.test.js` and `participant-database.test.js` pass: 2 suites, 7 tests.
- `node.exe --check app/plugins/interactive-story/backend/database.js` passes.
- Scoped `git diff --check` passes (only CRLF conversion warnings).

Scope: only Task 6 participant database/registry tests and this report are staged; pre-existing generated documentation/localization changes remain untouched.