# Quiz Reveal Reconnect: review patch proposal

Status: design artifact only; not applied to product files. This artifact is anchored to the source SHA-256 values below. Regenerate/rebase before implementation if any source hash differs.

## Source fingerprint

- `app/plugins/quiz-show/main.js`: `BDFD6F366DDF99B6E236A87ADB2B3DED5D809B7FDF2A4C169ED3B0F69FE55254`
- `app/plugins/quiz-show/quiz_show_overlay.js`: `2B6DE2CE836E8897B22A7042DD3AC830EF6EF02BF76DC067B3466FB288B2E2CA`
- `app/modules/public-overlay-payload-projection.js`: `BE8D7EF2523EF9A4EB2DF7BA6A2A43454EC50B0F1F9925F317ED811FE77EE6C3`
- `app/test/quiz-show-public-projection.test.js`: `D64929F4578060C0BA12946E96C7B8B1562A37E6CE958059B7A699F456DBE99F`
- `app/test/quiz-show-public-reconnect.test.js`: `8350F6DC98953BBEF0CB1E95ED8EC01A138E9D0B0482B47A2E5F508B3B2A1B61`

## Proposed narrow source changes

1. `main.js`: add private `revealGeneration` and `activeRevealSnapshot` state. On `get-public-state`, emit current `state-update` first, then—only for the same active round, `roundState === 'ended'`, and `Date.now() < expiresAt`—emit the saved already-projected round-ended DTO directly with `socket.emit('quiz-show:round-ended', {...dto, answerDisplayDuration: remainingMs / 1000})`. Never use `api.emit` for the replay.
2. `endRound()`: return early when already ended; capture generation and question identity before any await. Keep the existing configured producer duration (minimum 6 seconds). Immediately after the existing awaits and just before normal `api.emit`, verify generation/question/ended state are unchanged. Build the existing public DTO from only the current allowlisted round-ended fields, save it with private `{generation, questionId, expiresAt}` metadata, then issue the original room broadcast once.
3. Invalidate and increment the private generation at the beginning of every new-round transition (including before `startRound()` awaits category-vote/TTS work), in `resetGameState()`, and before `next` advances. For `next`, call `endRound()` only when the current round is not already ended. A completion from an old async `endRound()` then fails its generation and identity guard.
4. `projectQuizShowRoundEnded()`: change only the existing duration bound from `>= 6` to finite `> 0 && <= 600`. Do not alter any other DTO field, validation, event name, or registry permission. Normal producer values stay >= 6; only requester-only remaining-time snapshots use fractions.
5. Renderer: for a valid `round-ended` received while `IDLE`/`QUESTION_INTRO`, cancel the intro/state timeout and transition directly to `REVEAL_CORRECT`, bypassing the normal 1-second `TIME_UP` animation delay. Use the supplied positive duration as-is (no rounding); the existing timeout code already multiplies seconds by 1000 and accepts a positive fraction. If in `RUNNING`/`TIME_LOW`, retain the ordinary live flow. Keep escaped `info` rendering and do not put it in state updates.

## Regression cases to add with implementation

- State request emits `state-update` before the existing `round-ended` event; the reveal event is delivered only to the requester; `api.emit` and other sockets see no replay.
- At 250 ms remaining, replay duration is a finite positive fraction and the renderer immediately reveals without waiting for the 1-second `TIME_UP` path. No rounding to 0 or 1 second.
- At exact expiry and after expiry, state is sent but no answer/info replay is emitted. Normal round-ended projector continues to reject non-finite, zero, negative, and values above 600.
- The ordinary producer still calls `getAnswerDisplayDuration()` and therefore emits >= 6 seconds; only internal reconnect projection can be fractional.
- Reset, explicit next, and a new start invalidate the snapshot before any await; no old answer/info can be replayed afterward.
- A delayed `saveConfig()` or TTS completion from an old round, after reset/next/new round, emits neither stale `round-ended` nor a snapshot.
- Calling `next` after `roundState === 'ended'` does not call `endRound()` a second time or re-broadcast a duplicate reveal.
- During active voting/question intro, the ordinary `state-update` contains neither correct answer nor `info`; `round-ended` is only sent after the producer has ended the round. In particular, a pending vote or running round never gets a snapshot.
- Renderer handles positive fractional duration, clears pending intro/reveal timeouts, shows no expired replay, and keeps `info` escaped as text.

## Verification boundary

No product source/test was edited, and no test or server was run for this proposal. This is a source-reviewed design patch, not implementation verification, local-server verification, OBS acceptance, or LIVE acceptance. The original-component reproduction and source trace are recorded in `quiz-reveal-reconnect-audit-2026-10-07.md`.
