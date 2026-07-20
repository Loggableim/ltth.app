# CoinBattle Hardening Design

## Goal

Make CoinBattle gameplay deterministic and safe by making Pyramid an exclusive
alternative to normal CoinBattle, then repair scoring, lifecycle, persistence,
and overlay/UI state transitions without changing unrelated plugins.

## Architecture

CoinBattle has two mutually exclusive gameplay owners:

1. The normal engine owns `solo`, `team`, and `1v1` matches.
2. `PyramidMode` owns Pyramid rounds directly and may run only when the normal
   engine has no active match.

`POST /match/start` with `mode: "pyramid"`, the dedicated Pyramid start route,
and Pyramid auto-start all use `PyramidMode.startRound()`. Pyramid gifts and
likes are consumed once by Pyramid and never enter the normal engine. Normal
match events are consumed once by the normal engine. Starting either mode while
the other is active returns a clear conflict error.

KOTH remains an optional layer for a normal match. It must be attached to the
active match, crown the first leaderboard leader, update the current match
score for bonuses, and end when the parent match ends.

## Required behavior

- Team ties are represented as draws and never award Blue by default.
- Solo leaderboard order is deterministic for equal scores.
- Auto-reset repeats the mode and duration of the match that just ended.
- Offline simulation cannot start while a real match is active and stops the
  simulation-owned match without scheduling an automatic live reset.
- Gift idempotency is marked only after the transactional score write succeeds;
  a failed write remains retryable.
- Gift insertion and participant score update are one database transaction.
- Manual team assignment accepts only `red` or `blue`, requires team mode, and
  synchronizes database and in-memory state.
- Pausing freezes the match multiplier and resumes its remaining duration.
- Likes, shares, follows, and comments accumulate fractional remainders per
  match/user/event type so thresholds are reached across separate events.
- Weekly and season leaderboards include completed matches only.
- Pyramid extensions, round stats, and custom duration caps are per-round.
- UI reset writes the documented defaults instead of reloading saved settings.
- Dashboard and overlay timers are single-owner, cancellable, and do not hide a
  newer round after an older timeout fires.
- Static overlay labels use the existing i18n system.

## Testing strategy

Each behavior gets a focused Jest regression test before production changes.
Pure engine/system tests use small real fakes where SQLite is not required;
database behavior uses the existing in-memory database tests. The final pass
includes the focused CoinBattle suites, JavaScript syntax checks, CSS build,
and the project lint command. Existing native-module ABI failures are reported
separately if the local Node runtime prevents database tests from loading.

