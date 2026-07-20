# Game Engine Chess Hardening Design

Date: 2026-07-20
Status: Approved direction, pending implementation review

## Goal

Harden the Game Engine chess addon across gameplay, timers, lifecycle, queue integration, and broadcast/admin UI while keeping immediate match starts and the shared Interactive FIFO used by Connect4 and chess.

## Product decisions

- A chess start request creates an interactive match immediately.
- Chess host turns enter the same `InteractiveTurnQueue` as Connect4 host turns.
- Viewer turns remain background turns and use the existing chess viewer response deadline.
- The obsolete chess challenge-screen controls are removed from the active chess settings UI; no second challenge state machine is introduced.
- Existing legacy challenge methods remain untouched unless a shared terminal-state fix requires a compatibility guard.

## Architecture

### Game and time-control boundary

`ChessGame` becomes the final safety boundary. It validates the time-control string at construction, rejects moves after a terminal state, and updates the legacy clock before any chess.js mutation. Interactive callers continue to own host-clock and viewer-deadline timing through `InteractiveController`; the game object remains responsible for legal chess moves and final result state.

### Interactive lifecycle boundary

Every interactive resignation or terminal outcome goes through `InteractiveController._completeSession()`. Host resignation must resolve the displayed/current chess session through the controller rather than falling through to legacy `endGame()`, so queue membership, timers, registry state, persistent interactive state, result presentation, XP/ELO, and leaderboard handling remain consistent.

### Overlay and admin UI

The chess overlay consumes the authoritative interactive snapshot and applies the chess config instead of hardcoded visual defaults. It will render coordinates conditionally, gate last-move/check/captured-piece layers, show the viewer response countdown, apply theme/colors/font variables, map result reasons through display texts, and honor sound/celebration settings where browser playback is available. The admin host board will offer all four legal promotion pieces through a small in-page choice control.

## Error handling and invariants

- Invalid time controls fail before a session is created; no `NaN`, zero, infinite, or negative chess clocks may enter a game.
- A completed game cannot accept moves, resignations, or draw offers.
- A legacy clock expiry cannot mutate the board or report a successful move.
- Interactive queue order remains FIFO across Connect4 and chess; viewer moves append the session once at the queue tail.
- Viewer timeout and host timeout produce one terminal result and one cleanup path.
- The overlay never displays an internal result key as the final user-facing reason.

## Test strategy

Add failing regression tests before each implementation slice:

1. `ChessGame` rejects invalid controls, rejects post-terminal moves, and does not apply a move after a legacy timeout.
2. Interactive host resignation completes through the controller and removes queue/registry/timer state.
3. Shared queue behavior still interleaves Connect4 and chess FIFO turns.
4. Overlay DOM tests cover config-gated layers, viewer countdown, result reason mapping, and promotion choice contract.
5. Run the focused Game Engine suites, then the broader app checks that are practical in the isolated worktree.

## Non-goals

- No broad rewrite of the existing Game Engine or queue architecture.
- No restoration of the old chess challenge workflow.
- No changes to unrelated dirty-worktree files or other plugins.
