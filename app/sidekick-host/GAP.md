# Sidekick-Host Gaps

This file records plugin interfaces that the sidekick-host cannot wire cleanly.
It is not a wish list; it lists what is missing today, with the exact surface that
exists and why it is not enough.

## Quiz-Show: start a question / check an answer (open)

The `!quiz` port is still a stub (`demo-plugins.js`). There is no request/response
surface the injected HTTP transport can call.

What exists in `app/plugins/quiz-show/main.js`:

- Start / next / stop are **Socket.IO only**:
  - `quiz-show:start` (`main.js:3328`), `quiz-show:next` (`main.js:3362`),
    `quiz-show:stop` (`main.js:3400`).
  - No matching `GET`/`POST` route exists; `registerRoutes()` (`main.js:1511`)
    only exposes admin/state/question/config routes.
- Answers are **TikTok chat events only**:
  - `registerTikTokEvent('chat', ...)` (`main.js:3598`) forwards chat to the
    internal `handleAnswer(userId, username, message, profilePictureUrl)`
    (`main.js:5042`).
  - `handleAnswer` has **no return value and no ack**. Correctness, anti-spam,
    jokers, points and leaderboard are produced as side effects and socket/emit
    events, so a caller cannot synchronously "check an answer".
- `GET /api/quiz-show/state` (`main.js:1549`) returns raw questions including the
  `correct` index plus the internal `gameState`. Re-implementing answer checking
  from that payload would duplicate the plugin's scoring/permission/anti-spam
  rules, so it is not a supported check-answer surface.

Result: start-question and check-answer cannot be wired through the existing
injected transport without inventing an API. The stub stays with a TODO until the
plugin exposes a request/response route (for example `POST /api/quiz-show/start`
and `POST /api/quiz-show/answer` returning `{ correct, points, ... }`).

## Connect4: start a game / make a move (resolved)

Wired through `adapters/connect4-adapter.js` to the existing game-engine manual
routes (`app/plugins/game-engine/main.js`):

- `POST /api/game-engine/manual/start` (`main.js:3034`) with
  `{ gameType: 'connect4', opponentType, player1Name, player2Name }`.
- `POST /api/game-engine/manual/move` (`main.js:3081`) with
  `{ sessionId, player?, column: 'A'-'G' }`.

The underlying rules are `Connect4Game` in
`app/plugins/game-engine/games/connect4.js`.
