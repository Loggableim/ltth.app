# Quiz Show reveal reconnect: original-path reproduction and bounded snapshot design (2026-10-07)

## Original flow

1. `startRound()` copies the selected question (including `info` and `category`) into in-memory `gameState.currentQuestion`, marks `roundState: 'running'`, then broadcasts `quiz-show:state-update`. The public producer intentionally sends display question/answers/category, not `info` or the correct answer.
2. `endRound()` sets `roundState: 'ended'`, calculates the answer, awaits config persistence and optional TTS, then emits `quiz-show:round-ended` with the existing display fields: correct answer index/letter/text, `info`, and `answerDisplayDuration`.
3. The live renderer receives that event while its state is `RUNNING`/`TIME_LOW`, enters `TIME_UP`, then `REVEAL_CORRECT`. It displays `info` only here, escaped by `escapeHtml()`. The Quiz Show form labels this value “Info (optional - wird nach der Runde angezeigt)”. This is direct evidence that `info` must not be added to the question-state snapshot.
4. A fresh renderer requests `quiz-show:get-public-state`. The handler emits only `buildGameStatePayload()` as `quiz-show:state-update`; it does not replay `round-ended`. The builder may have raw `roundState: 'ended'`, but `projectQuizShowStateUpdate()` drops `roundState`, correct answer, reveal phase and duration. Fresh renderer therefore treats the result as a question-state update and enters `QUESTION_INTRO`.
5. Replaying the existing `quiz-show:round-ended` event after that state update is insufficient by itself: `handleRoundEnded()` reveals only when its renderer state is `RUNNING`, `TIME_LOW`, `TIME_UP`, or `REVEAL_CORRECT`. In `QUESTION_INTRO`, it stores answer fields but does not reveal.

## Isolated original-component reproduction

A local one-off JSDOM harness used the original Quiz Show builder, existing public projector and original renderer source. It did not start a product server or modify files.

- Fresh renderer after original `get-public-state` response: reveal popup hidden.
- Fresh renderer after a synthetic replay of the existing projected `round-ended` event: still hidden, because the renderer is in `QUESTION_INTRO`.
- Live renderer advanced through original `QUESTION_INTRO` → `RUNNING`, then received the same `round-ended` payload: reveal popup became visible.
- Public state had no `roundState`; the existing `round-ended` payload projected successfully. No runtime console errors.

## Existing contract boundaries

- Incoming `quiz-show:get-public-state` and outgoing `quiz-show:state-update` / `quiz-show:round-ended` are already exact registered event names. The requester-specific response can reuse `round-ended`; no new public event name or room broadcast is needed.
- `projectQuizShowRoundEnded()` allows only `correctAnswer` 0–3; optional answer letter/text/info strings up to 2000 characters; optional `answerDisplayDuration` from 6 to 600 seconds; and the existing bounded voter fields.
- It has no expiration timestamp or `remainingMs`. `answerDisplayDuration < 6` is rejected. These limits prevent an exact replay of the final 0–5 seconds with the current DTO.
- Public state projection deliberately removes `roundState`; it does not represent an answer-reveal phase. `info` must remain absent from `buildGameStatePayload()` and state updates until the round-end disclosure event.

## Proposed read-only snapshot design (not implemented)

1. Keep one volatile, non-persisted reveal snapshot, created only when the original `round-ended` payload is about to be emitted. Store exactly its currently projected display fields plus private server metadata: current round identity/generation and an absolute server expiry derived from the emitted `answerDisplayDuration`.
2. On a valid `quiz-show:get-public-state` request, emit the ordinary projected `state-update` first. Then emit a projected `quiz-show:round-ended` directly to that requester only if the snapshot still belongs to the current round and `now < expiresAt`. Never include `info` or correct-answer fields in the preceding state update.
3. The original renderer needs a state-machine path for a valid round-end snapshot received in `IDLE`/`QUESTION_INTRO`: it must show the reveal directly rather than waiting for a `RUNNING` state that the reconnect does not have. This should consume the same projected answer fields and escaped `info`; it does not require new display data.
4. Invalidate the snapshot before a new `startRound()` proceeds (including before its asynchronous TTS wait) and in `resetGameState()`. Capture a private round generation before async `endRound()` work and re-check generation/current question identity before emitting or storing a reveal. This prevents a stale async completion from a prior round/reset from publishing a late answer.
5. Make “next” idempotent for an already-ended round: do not run `endRound()` again and emit a duplicate reveal before starting the next question. Invalidate any active snapshot before advancing.
6. With the current DTO, only replay snapshots while the remaining duration is at least six seconds, and set `answerDisplayDuration` to the remaining whole seconds. Do not replay once expired or in the final sub-six-second window. This is conservative but leaves the final 0–5 seconds unrecoverable. A complete exact-duration replay over the whole reveal window requires an approved timing contract (for example a small bounded remaining-time field plus projection and renderer enforcement); that would be a future projector/contract change, not authorized here.

## Scope and status

Read-only source trace and isolated original-component reproduction. No product or test files changed, no Public policy/projector edits, and no product server, tunnel, OBS or LIVE. `info` remains excluded from the initial state builder by design; the prior category fix remains frozen and unchanged.
