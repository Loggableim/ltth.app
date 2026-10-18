# Sidekick-Host Gaps

This file records plugin interfaces that the sidekick-host cannot wire cleanly.
It is not a wish list; it lists what is missing today, with the exact surface that
exists and why it is not enough.

## Quiz-Show: start a question / check an answer (resolved)

Wired through `adapters/quiz-adapter.js` to the new request/response routes in
`app/plugins/quiz-show/main.js`:

- `POST /api/quiz-show/start` starts (or, with `{ next: true }`, advances) a
  question. It reuses the same internal `startRound()` / `endRound()` logic as the
  **Socket.IO** handlers `quiz-show:start` and `quiz-show:next`, which stay
  unchanged. The response returns the question text and answers but never the
  `correct` index.
- `POST /api/quiz-show/answer` calls the existing
  `handleAnswer(userId, username, message, profilePictureUrl)` and returns a JSON
  ack `{ ok, accepted, correct, points, text, ... }`. `handleAnswer` and the
  TikTok chat flow are unchanged; the return value is additive.

Known limit: `HostCore` deliberately routes only allowlisted commands to plugin
ports and never free chat, so the demo port carries the answer as the argument of
`!quiz` (for example `!quiz a`) rather than as a bare chat line. Free-text answers
still work when they are a single allowlisted argument token.

## Connect4: start a game / make a move (resolved)

Wired through `adapters/connect4-adapter.js` to the existing game-engine manual
routes (`app/plugins/game-engine/main.js`):

- `POST /api/game-engine/manual/start` (`main.js:3034`) with
  `{ gameType: 'connect4', opponentType, player1Name, player2Name }`.
- `POST /api/game-engine/manual/move` (`main.js:3081`) with
  `{ sessionId, player?, column: 'A'-'G' }`.

The underlying rules are `Connect4Game` in
`app/plugins/game-engine/games/connect4.js`.
