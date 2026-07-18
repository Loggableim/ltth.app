# Game Engine Leaderboard Display Priority Design

Date: 2026-07-18
Status: Approved design

## Goal

After an interactive Connect 4 or chess match, show the configured leaderboard rotation only when no game is waiting for the streamer. A host-ready game always takes visual priority. New Connect 4 commands must replace an in-progress leaderboard presentation with the new interactive state in both the unified and direct Connect 4 OBS overlays.

## Approved Product Decisions

- Multiple interactive games remain active in parallel, up to the existing configured session limit.
- The FIFO host-turn queue remains the only selector for the board on which the streamer can play.
- The configured terminal-result duration is retained.
- After a result, a waiting host turn wins over any leaderboard presentation.
- If no host turn is waiting, the completed game's configured leaderboard types rotate for the configured duration per type.
- A new interactive match or a newly queued host turn preempts leaderboard rotation immediately.
- Existing `leaderboardEnabled`, `leaderboardTypes`, and `leaderboardDisplayTime` settings remain the source of configuration.
- The server is the authority for result, leaderboard, idle, and board-display state. Overlays do not run untracked post-game leaderboard timers for interactive matches.

## Current Failure

The individual Connect 4 overlay starts leaderboard rotation from a delayed legacy `game-engine:game-ended` handler. That local timer can fire after the server has selected a newer interactive board, covering it or hiding it again. The unified overlay also treats only boards and results as authoritative interactive states, so it cannot keep the appropriate game renderer mounted for a leaderboard phase.

## Architecture

### InteractiveDisplayRouter

`InteractiveDisplayRouter` gains a `leaderboard` phase in addition to `idle`, `playing`, `animating`, and `result`.

The router owns all transition timers:

1. It shows a completed match result for `interactiveResultDisplaySeconds`.
2. When that result expires, it selects the next host-turn queue head if one exists.
3. If no host turn exists and the completed game's leaderboard setting is enabled, it presents each configured leaderboard type in order for `leaderboardDisplayTime` seconds.
4. When the rotation ends, it returns to `idle` or begins the next queued host board.

The display snapshot includes a leaderboard descriptor while in this phase:

```json
{
  "phase": "leaderboard",
  "gameType": "connect4",
  "leaderboard": {
    "type": "daily",
    "index": 0,
    "total": 4
  }
}
```

Every phase change increments `displayRevision`. The router cancels its own leaderboard timer and immediately selects the queue head when a host-ready session arrives. Starting a new interactive session also dismisses a visible leaderboard so the state is emitted promptly; a one-session viewer-first game is then rendered by the existing viewer-turn fallback.

### Completion and Queue Priority

The completion payload carries a normalized snapshot of the completed session's leaderboard settings. This prevents a later setting update from changing the currently scheduled rotation and keeps Connect 4 and chess independent.

If several games complete while no host board is ready, their terminal results remain FIFO. Each completed result may lead into its own configured leaderboard rotation. If a host-ready game arrives at any point during a leaderboard, the leaderboard is cancelled and the host board is shown. The streamer is therefore never blocked by a leaderboard.

### Overlays

The unified overlay treats `leaderboard` as an interactive presentation. It keeps the matching Connect 4 or chess iframe active, forwards the authoritative snapshot, and hides the match-up timer while the board is not playable.

The Connect 4 child overlay renders the specified leaderboard by calling the existing leaderboard endpoint and shows it only for an authoritative `leaderboard` snapshot. It removes the legacy delayed leaderboard call for interactive `game-engine:game-ended` events. A newer `displayRevision` clears any prior result, rotation, or fetch presentation before rendering the new board or leaderboard. The direct Connect 4 URL requests the current state on load, so it restores a leaderboard or newer board after an OBS refresh.

Chess receives the same authoritative phase contract in the unified overlay. Its existing standalone behavior remains unchanged unless it receives an interactive leaderboard snapshot.

## Flow Examples

### No waiting host turn

`Connect 4 ends` -> `result` -> `leaderboard daily` -> `leaderboard season` -> `idle`

### Waiting host turn

`Connect 4 ends` -> `result` -> `next host-ready board`

No leaderboard is displayed while the streamer has a board available.

### New Connect 4 command during leaderboard

`leaderboard daily` -> `new /c4 command` -> `fresh interactive snapshot` -> `new board`

The client clears the leaderboard immediately. When the host moves first, the router displays that board from the host queue; when the viewer moves first and it is the only active match, the existing fallback renders its board.

## Error Handling and Compatibility

- Empty or disabled leaderboard configuration skips directly to the next board or idle state.
- A failed leaderboard data request displays the existing localized load-error message but does not block later authoritative snapshots.
- A stale leaderboard snapshot cannot replace a newer board because overlay revision checks remain global.
- Legacy non-interactive games retain their current result and leaderboard behavior.
- Existing leaderboard REST endpoints and Game Engine settings are unchanged.

## Verification Strategy

Unit tests cover:

- result to leaderboard when the host queue is empty;
- result to next host board when the queue is non-empty;
- configured leaderboard type order and duration;
- leaderboard preemption by a new queued host board;
- leaderboard dismissal by a new Connect 4 match;
- queued results retaining FIFO behavior.

Overlay contract tests cover:

- unified rendering of the `leaderboard` phase;
- direct Connect 4 rendering from an authoritative leaderboard snapshot;
- removal of the delayed interactive legacy leaderboard timer;
- newer game snapshots clearing a visible leaderboard.

Final checks run the focused Game Engine Jest suites, ESLint, `git diff --check`, a Game Engine-only reload, and a live read-only overlay state check. The connected live app is not restarted.

## Acceptance Criteria

1. A finished interactive game shows the configured leaderboard rotation when no host board is waiting.
2. A waiting host board appears after the configured result duration without a leaderboard delay.
3. Multiple sessions continue in parallel and the FIFO queue selects the streamer board.
4. A new Connect 4 command replaces any shown leaderboard with the correct new overlay state.
5. Unified and direct Connect 4 OBS sources agree after load, refresh, and transition.
6. Older result or leaderboard timers cannot cover a newer board.
