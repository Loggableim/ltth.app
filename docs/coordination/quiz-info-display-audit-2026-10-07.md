# Quiz Show question.info: read-only data-path audit (2026-10-07)

## Befund

`buildGameStatePayload().currentQuestion` does not include `info`. The overlay's `handleStateUpdate()` can store `state.currentQuestion.info`, but this is not the path that normally reveals the explanation. On round completion, `endRound()` reads `currentQuestion.info`, attaches it to the `quiz-show:round-ended` payload, and the existing public projector allows only a string up to 2000 characters. The original renderer's `handleRoundEnded()` copies `data.info`, and `revealCorrectAnswer()` inserts it using `escapeHtml()` in the correct-answer popup.

## Einordnung

This is not the same product bug as `category` missing from the question-state payload. Category is intended to show alongside the live question, so the renderer needs it in `quiz-show:state-update`; that was fixed separately. The `info` field is explanation text displayed after the answer reveal. The regular flow deliberately supplies it through the `round-ended` event, rather than the initial question-state snapshot, which avoids exposing explanation text before the answer phase.

A reconnect during the answer-reveal window may not replay the prior `round-ended` event. However, the reconnect state contract also omits the correct answer and does not represent the reveal phase as a replayable snapshot. No isolated `info` field addition to `buildGameStatePayload()` is recommended absent a broader reveal-state reconnect requirement.

The reconnect case was then reproduced through the original producer, projector, and renderer. The fresh client also remained hidden after receiving the existing `round-ended` DTO because its renderer state was `QUESTION_INTRO`. A bounded snapshot design and the existing DTO timing limitation are documented in [Quiz Reveal-Reconnect Audit](quiz-reveal-reconnect-audit-2026-10-07.md).

## Scope and verification

Read-only source tracing across the quiz question source, `buildGameStatePayload()`, `endRound()`, the public `quiz-show:round-ended` projection, and the original overlay consumer. No product changes and no tests run for this audit. No Public policy, shared projector, server, tunnel, OBS, or LIVE changes.
