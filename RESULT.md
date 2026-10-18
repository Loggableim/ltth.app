# sk-quiz HTTP endpoints + sidekick quiz wiring

Branch: `lastbrowser/sidekick-sk-quiz-http` (base `819c1884` = #167 rebased on #166)

## Files changed

Part A — quiz-show plugin:
- `app/plugins/quiz-show/main.js`
  - Added `POST /api/quiz-show/start`: starts a round or advances with
    `{ next: true }`. Reuses `startRound()` / `endRound()` / `stopActiveTTS()` /
    `resetGameState()` and mirrors the `quiz-show:start` / `quiz-show:next`
    Socket.IO checks. Response returns `{ ok, running, ended, round, question }`
    and never exposes the `correct` index.
  - Added `POST /api/quiz-show/answer`: validates the body, calls the existing
    `handleAnswer(userId, username, message, profilePictureUrl)` and returns
    `{ ok, accepted, correct, points, answerIndex, reason, text }`.
  - `handleAnswer` now returns that ack (additive). Socket.IO handlers and the
    TikTok chat flow are unchanged and ignore the return value.

Part B — sidekick-host:
- `app/sidekick-host/adapters/quiz-adapter.js` (new): injected transport,
  `start()` / `answer()`, failures as `{ ok: false, code, text }`, no HostCore
  import. Modeled on `connect4-adapter.js`.
- `app/sidekick-host/testing/fake-quiz.js` (new): in-memory stand-in for the two
  quiz-show routes; no socket, no key, no network.
- `app/sidekick-host/demo-plugins.js`: `!quiz` now goes through the adapter.
  `!quiz` starts a question (or advances when active); `!quiz <answer>` forwards
  the chat text as the answer. Answers ride on `!quiz` because `HostCore`
  deliberately never routes free chat to plugin ports.
- `app/sidekick-host/GAP.md`: quiz section changed from open to resolved,
  documenting the two routes and the demo's answer-via-`!quiz` limit.

Part C — tests:
- `app/test/quiz-show-http-endpoints.test.js` (new)
- `app/test/sidekick-quiz-wiring.test.js` (new)

## Verification (one file at a time from `app/`)

New tests:
- `test/quiz-show-http-endpoints.test.js` — 11 passed
- `test/sidekick-quiz-wiring.test.js` — 11 passed

Existing sidekick tests still green:
- `test/sidekick-host-demo.test.js` — 43 passed
- `test/sidekick-connect4-wiring.test.js` — 10 passed
- `test/sidekick-host-wire.test.js` — 3 passed
- `test/sidekick-host-fixture.test.js` — 3 passed

Related quiz-show tests:
- `test/quiz-state-management.test.js` — 14 passed
- `test/quiz-show-public-projection.test.js` — 13 passed
- `test/quiz-show-robustness.test.js` — 4 passed
- `test/quiz-show-expansion.test.js` — 8 passed

`npx eslint` on the changed JS files: clean (exit 0).
