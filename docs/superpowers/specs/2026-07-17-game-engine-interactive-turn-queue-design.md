# Game Engine Interactive Turn Queue Design

Date: 2026-07-17
Status: Approved design

## Goal

Allow multiple viewers to play parallel Connect 4 or chess matches against the host while presenting exactly one host turn at a time. The broadcast overlay and admin controls must show the same authoritative board, keep that board visible until the host acts, and then advance fairly to the next board waiting for a host move.

Every visible board must identify the real host and viewer as `Hostname vs. Playername`. Viewer moves arrive through TikTok chat. Host moves are accepted only through the authenticated Game Engine admin UI.

## Approved Product Decisions

- Connect 4 and chess share one FIFO `InteractiveTurnQueue`.
- Matches run concurrently in the background; the queue contains only sessions that currently need a host move.
- A visible board remains selected until the host makes a valid move, the host loses on chess time, or an admin cancels the match.
- After the host moves, the session leaves the queue and the next host-ready board becomes visible.
- When the viewer later makes a valid move, that session returns at the back of the queue.
- Connect 4 and chess have separate configurable viewer response limits.
- A viewer who does not move before the server deadline loses automatically.
- A queued chess board does not consume host time. The host chess clock runs only while that board is the visible interactive board.
- In multiplayer queue mode, chess viewers use the per-turn response limit instead of an additional viewer total clock. The host retains the configured chess clock, which advances only on visible host turns. Legacy non-queue chess keeps its existing symmetric clock behavior.
- Connect 4 has no host response deadline.
- One viewer may have at most one active interactive match across Connect 4 and chess.
- The first release does not support manual queue reordering.
- The canonical multiplayer OBS surface switches between Connect 4 and chess. The individual game overlays remain available for legacy use and testing.

## Current Problems Addressed

The current implementation serializes all Connect 4 and chess matches behind a global queue. `activeSessions`, the admin page, the active-session endpoint, and the Connect 4 overlay can technically reference sessions, but the control and display paths assume one current session. Additional interactive games wait until the active game ends.

The current overlay also has several single-session race conditions:

- Generic game events are not consistently filtered by game type.
- The reconnect endpoint returns the first active session instead of an authoritative display session.
- Old result and leaderboard timers can hide a newer game that has already started.
- The host display name is hard-coded as `Streamer` instead of using the active TikTok identity.
- Connect 4 timer and animation settings are not fully connected to runtime behavior.

This design replaces those assumptions for Connect 4 and chess without rewriting unrelated Game Engine games.

## Scope

The implementation covers:

- Concurrent Connect 4 and chess session lifecycle.
- A shared host-turn queue for both game types.
- Server-authoritative viewer and chess-host timers.
- Persistence and restart recovery for active sessions and queue order.
- A shared admin control surface for the current board and background sessions.
- A unified interactive overlay that switches renderers without losing session state.
- Actual host-name resolution.
- Regression coverage for queue, timer, reconnect, and stale-event races.

## Non-Goals

- Viewer-versus-viewer matches in multiplayer queue mode.
- Manual queue reordering or host selection of an out-of-order board.
- More than one active interactive match per viewer.
- Changing Connect 4 or chess move rules.
- Reworking Plinko, Wheel, Slot, or Live Arena game logic.
- Replacing the existing Game Engine theme, media, XP, ELO, or leaderboard systems.
- Mobile-first redesign of the Game Engine admin page.

## Architecture

### InteractiveSessionRegistry

`InteractiveSessionRegistry` owns the in-memory representation of active Connect 4 and chess sessions. It replaces global single-session assumptions while continuing to use the existing game classes as rule engines.

The registry must:

- Index sessions by `sessionId`.
- Index the viewer's one active session by stable TikTok user identity.
- Store the game type, player objects, game state, current turn role, `sessionRevision`, last activity, timer state, and queue membership.
- Serialize and restore each game through a small game-specific adapter.
- Reject a second start request from a viewer who already has an active Connect 4 or chess session.
- Enforce a configurable concurrent-session limit. The default is 20 and the accepted range is 1 through 50.

Stable TikTok `userId` is the preferred identity. Normalized `uniqueId` or username is the fallback. Display nicknames must never be used as the sole session key.

### InteractiveTurnQueue

`InteractiveTurnQueue` is a dedicated FIFO queue for host-ready Connect 4 and chess sessions. It is separate from the existing queue that sequences Plinko, Wheel, Slot, and other transient games.

Each queue entry contains:

- `sessionId`
- `gameType`
- `viewerId`
- `viewerDisplayName`
- `sequence`
- `enqueuedAt`
- `sessionRevision`

Queue invariants:

1. A session appears at most once.
2. Only an active session whose current turn belongs to the host may appear.
3. The lowest persisted sequence is the queue head.
4. Only the queue head may receive a host move.
5. A valid host move removes the session before the next head is selected.
6. A later valid viewer move adds the session at the current tail with a new sequence.
7. Ending or cancelling a session removes it from every queue position and timer registry.
8. Reconnects and duplicate events cannot change queue order.

### TurnTimerService

`TurnTimerService` owns all authoritative deadlines. Browser timers are presentation only.

It manages:

- A per-turn viewer deadline for Connect 4.
- A separate per-turn viewer deadline for chess.
- Remaining host chess time while the board is visible.
- Scheduled timeout callbacks keyed by session and state revision.

Default viewer response limits are 30 seconds for Connect 4 and 60 seconds for chess. Both are configurable from 5 through 300 seconds.

Absolute UTC deadlines are persisted. A timeout callback must re-read the session revision, turn owner, and deadline before applying a loss. This prevents a late callback from ending a game after a valid move.

Connect 4 has no host timer. For chess, host time is paused while the session waits behind another board. It resumes when `InteractiveDisplayRouter` confirms that session as the visible interactive board and pauses again before the router advances. If the visible host chess clock reaches zero, the host loses.

Visibility is a server-side router state, not a browser acknowledgement. A disconnected OBS client cannot pause or reset a clock. A transient Game Engine presentation may explicitly suspend interactive visibility; in that case the host clock pauses until the same board resumes.

### InteractiveDisplayRouter

`InteractiveDisplayRouter` is the single authority for which interactive session is on stream. Its display session is normally the current queue head.

It emits full snapshots rather than move-only deltas. A snapshot includes:

- `displaySessionId`
- `gameType`
- `sessionRevision`
- Global `displayRevision`
- `hostDisplayName`
- `viewerDisplayName`
- Complete serialized game state
- Current turn role
- Viewer deadline or host chess time, when applicable
- Waiting queue count
- Active session count
- Display phase: `idle`, `playing`, `animating`, or `result`

Every accepted game-state transition increments `sessionRevision`. Every board selection, phase change, transient suspension, or resume increments a separate global `displayRevision`. Admin and overlay clients ignore a lower session revision for the same session and ignore any snapshot whose display revision is lower than the latest globally rendered display revision. This prevents a late event from an older session from switching the overlay backward.

The current unified overlay remains the canonical Game Engine URL. It gains an interactive base layer controlled by this router. Existing transient games keep their current queue. If a transient overlay temporarily takes visual focus, the interactive display session remains locked, its host chess clock pauses while it is not actually visible, and the same interactive board resumes afterward. Transient games must never dequeue or advance the interactive session.

### Game Adapters

Connect 4 and chess keep their existing rule engines. Small adapters provide a common contract:

- `getState()`
- `restoreState(state)`
- `getCurrentTurnRole()`
- `applyViewerMove(move, viewerId)`
- `applyHostMove(move)`
- `getResult()`
- `isComplete()`

The queue, timer service, persistence layer, and display router depend on this contract instead of branching through unrelated game internals.

## Session and Persistence Model

Active state must survive plugin reloads and server restarts. The database remains the source of recovery truth.

Each active interactive session persists:

- Serialized game state after every accepted move.
- Monotonic session revision.
- Last global display revision when the session owned the interactive surface.
- Current turn role.
- Viewer identity and display name.
- Resolved host display name.
- Viewer deadline, if running.
- Host chess time remaining.
- Queue sequence and enqueue timestamp, if host-ready.
- Last activity timestamp.
- Terminal reason when completed.

Queue order may be stored in a dedicated interactive-queue table keyed by `sessionId`, or through equivalent normalized fields with a uniqueness constraint. Whichever schema is selected in the implementation plan must make duplicate membership impossible at database level.

On startup:

1. Load active Connect 4 and chess rows.
2. Recreate game instances through their adapters.
3. Restore queue entries in sequence order.
4. Rebuild timer callbacks from absolute deadlines.
5. Resolve already-expired viewer deadlines as automatic viewer losses.
6. Select the first valid queue entry as the display session.
7. Emit one authoritative snapshot after restoration.

Incomplete or corrupt session state must be ended with a logged recovery reason rather than left permanently active.

## Game Flows

### Starting a match

Multiplayer queue mode always creates a host-versus-viewer match. Existing challenge media may be shown as a non-blocking notification, but another viewer cannot take the host's place and challenge presentation cannot block another session from starting.

If the viewer moves first, start that game's viewer response timer. If the host moves first, enqueue the session immediately. A viewer who already owns an active interactive session receives a chat response identifying the existing game instead of a duplicate session.

### Viewer move

For every chat move:

1. Resolve the viewer's active session using stable identity.
2. Confirm that the move targets the correct game type.
3. Confirm that it is the viewer's turn and the deadline has not expired.
4. Validate and apply the move through the game adapter.
5. Persist the new game state and session revision atomically.
6. Stop the viewer timer.
7. If the move ends the game, publish the terminal result through the transient result channel without creating a host-turn queue entry.
8. Otherwise enqueue the session once at the back of the host-turn queue.

Invalid, duplicate, late, or out-of-turn chat messages do not mutate state or queue order. The command response should explain the rejection without exposing internal session data.

A viewer win or viewer timeout can happen while another host board is locked on screen. Such a terminal result enters a FIFO transient-result channel for the configured result duration. The current interactive board and its host chess clock are suspended during the result, then the same board resumes. Multiple background results are presented in terminal-event order and never reorder the host-turn queue.

### Host move

The admin action includes the displayed session ID and last rendered session revision.

The server must confirm that:

- The socket is authorized as admin.
- The session is the current queue head.
- The supplied session revision matches the current state.
- It is the host's turn.
- The move is legal.

After a valid move, the server pauses the host chess clock if applicable, persists state, removes the queue entry, and lets the overlay complete the move animation. If the match continues, it starts the viewer deadline and advances to the next queue head. If the match ends, it enters the result phase before advancing.

### Timeout and game end

A viewer deadline expiring produces an automatic viewer loss with terminal reason `viewer_timeout`. A visible host chess clock expiring produces `host_timeout`.

The result phase defaults to three seconds and is configurable from one through ten seconds. Result completion is controlled by the display router and display revision, not by an untracked browser timeout. A result from an older session can never hide a newer board.

After the result phase:

- Remove the session from the active registry.
- Clear all timers and queue membership.
- Apply existing XP, statistics, streak, and leaderboard updates once.
- Advance to the next queue head or the idle state.

## Admin UI

The existing single active-game panel becomes an `Interactive Games` surface with three coordinated areas.

### Now on stream

This area renders the authoritative display session and includes:

- Game-type badge.
- `Hostname vs. Playername` heading.
- Current turn and timer state.
- Complete board preview.
- A through G controls for Connect 4.
- Clickable source and destination squares for chess.
- Cancel-match action.

Move controls are enabled only when the session is the queue head, the host is at turn, and both the displayed session and display revisions are current.

### Host queue

The queue list shows order, game type, viewer name, enqueue time, and waiting duration. It is read-only in the first release. The displayed session is visibly marked as `Now on stream`.

### Active background matches

Background sessions show game type, viewer name, current turn, viewer time remaining, move count, and last activity. The host may inspect a read-only state without changing broadcast order or enabling move controls.

Settings add:

- Connect 4 viewer response seconds.
- Chess viewer response seconds.
- Maximum concurrent interactive sessions.
- Result display seconds.
- Connect 4 move animation speed; the saved value must control the actual overlay animation duration.

## Overlay UI

The unified interactive overlay follows this order:

1. Persistent heading: `Hostname vs. Playername`.
2. Game-type and turn-status row.
3. Full Connect 4 or chess board.
4. Visible host chess clock when applicable.
5. Subtle waiting count such as `3 more boards waiting`.

After a host move, its animation finishes before the renderer switches. A terminal result is shown for the configured result duration. When no board needs a host move, the overlay shows an idle state such as `Waiting for player moves · 6 active matches`.

Host identity resolves from the active TikTok connection first, then the active profile, and finally the literal `Streamer` fallback. Viewer-provided names are rendered with text-safe DOM APIs.

The Connect 4 and chess child renderers must filter events by game type and session. They must cancel old animation, result, leaderboard, and challenge timers when a newer display revision arrives. Post-game leaderboard rotation must not cover a waiting host board; it is deferred until the interactive queue is idle.

## API and Socket Contracts

The implementation should expose one full-state read endpoint for reconnect and diagnostics:

`GET /api/game-engine/interactive/state`

It returns the current display snapshot, ordered host queue, active-session summaries, configuration, and server timestamp.

Admin host moves remain socket-driven but use a shared envelope:

```json
{
  "sessionId": 42,
  "gameType": "connect4",
  "sessionRevision": 7,
  "displayRevision": 18,
  "move": { "column": "D" }
}
```

Chess uses the same envelope with its existing move representation. The server validates `sessionRevision`; `displayRevision` lets it reject controls from an admin view that is no longer on stream. The server emits one authoritative `game-engine:interactive-state` snapshot after every state or display change. Existing generic game events remain available for legacy clients during migration, but the new admin and unified overlay use the authoritative snapshot contract.

## Error Handling

- Unsupported game types never enter the interactive queue.
- Invalid or stale host revisions return a stable error and trigger a fresh snapshot to that admin client.
- Duplicate chat deliveries are idempotent by session revision and move identity.
- Queue insertion is transactional with the state change that makes the host current.
- Session cancellation removes queue rows and timers before advancing display state.
- A full concurrency limit rejects new starts with a clear chat response.
- Persistence errors log session and transition context and do not emit a state that was not committed.
- Corrupt recovery data ends only the affected session.
- Plugin destruction clears in-memory timers without deleting persisted active state unless shutdown policy explicitly ends sessions.
- Overlay reconnect always begins with the full-state endpoint or equivalent full socket snapshot.

## Observability

Structured plugin logs must include `sessionId`, `gameType`, `viewerId`, `sessionRevision`, `displayRevision`, queue sequence, transition, and terminal reason where applicable.

Useful transitions include:

- `session_started`
- `viewer_timer_started`
- `viewer_move_accepted`
- `host_turn_enqueued`
- `display_session_changed`
- `host_move_accepted`
- `viewer_timeout`
- `host_timeout`
- `session_recovered`
- `session_ended`

The admin state endpoint provides enough read-only detail to diagnose stuck sessions, duplicate queue entries, and timer drift without inspecting the database manually.

## Backward Compatibility and Migration

- Existing completed session, move, XP, ELO, and leaderboard data remains intact.
- Existing active sessions created by the single-session model are migrated or closed with an explicit recovery reason if they cannot be reconstructed.
- Existing Connect 4 and chess start and move chat commands remain valid.
- Existing individual overlay URLs continue to render their own game type for testing and legacy scenes.
- The current active-session endpoint remains temporarily available but delegates to the authoritative interactive display session.
- Plinko, Wheel, Slot, and Arena retain their current game logic and queue data.
- The current Connect 4 round-timer value becomes the initial Connect 4 viewer response limit when no new setting exists.

## Verification Strategy

### Unit tests

- Mixed Connect 4 and chess FIFO ordering.
- Duplicate enqueue prevention.
- Queue removal on host move, cancellation, timeout, and completion.
- Stable sequence restoration after restart.
- One active interactive match per viewer.
- Concurrent-session limit and configuration validation.
- Viewer deadlines for both games.
- Paused queued host chess time and resumed visible host time.
- Chess viewer per-turn response timing without an additional viewer total clock in multiplayer mode.
- Stale timeout callbacks and stale revisions are ignored.

### Integration tests

- Three or more viewers maintain independent simultaneous states.
- Viewer chat moves route only to the sender's session.
- A mixed Connect 4, chess, Connect 4 queue advances only after each valid host action.
- An out-of-order host move is rejected.
- Viewer timeout produces exactly one automatic loss and one statistics update.
- Host chess timeout produces exactly one terminal result.
- Restart restores active sessions, queue order, deadlines, and display session.
- A transient non-interactive overlay does not advance the interactive queue and the same interactive board resumes.
- A viewer-side terminal result suspends and resumes the current host board without changing host-queue order.

### Overlay and admin tests

- Actual host name and viewer name appear above both board types.
- Renderer switching follows authoritative snapshots.
- Old result timers cannot hide a newer board.
- Lower session revisions cannot replace a newer snapshot for the same session.
- Lower global display revisions cannot switch back to an older session.
- Reconnect restores the current board and correct countdown.
- Controls are enabled only for the queue head and current session/display revisions.
- Idle copy reports the active background-match count.
- Day, night, CID, contrast, and vision-impaired themes remain readable.

### Final validation

- Focused new Jest suites.
- Existing Connect 4, chess, challenge, queue, socket-authorization, and full Game Engine test suites.
- ESLint and CSS build.
- `git diff --check`.
- Browser verification in an isolated test instance with at least three simulated viewers and a mixed Connect 4/chess queue.
- Verification of move animation, host control, viewer timeout, automatic loss, result transition, reconnect, and idle state.
- No visible test events or server restarts against the currently connected LIVE instance without explicit approval.

## Acceptance Criteria

The feature is complete when:

1. Multiple viewers can hold independent active Connect 4 or chess matches against the host.
2. Viewer moves are accepted through chat only for the sender's own active match.
3. Connect 4 and chess host turns share one deterministic FIFO queue.
4. The visible board does not change until the host acts or the current match ends.
5. A valid host move advances to the next host-ready board after animation or result display.
6. Queued chess boards consume no host time; visible chess boards do.
7. Viewer response limits are separately configurable and timeout causes an automatic viewer loss.
8. Admin and overlay show the same board and `Hostname vs. Playername` heading.
9. Restart and reconnect preserve active matches, queue order, timer truth, and display state.
10. Stale events and old browser timers cannot overwrite or hide newer state.
11. Other Game Engine games continue to function without being serialized behind the lifetime of an interactive match.
12. The existing Game Engine regression suite remains green and the isolated live-style browser scenario behaves as specified.
13. Saved Connect 4 animation speed affects the real drop animation, and leaderboard rotation never covers a waiting host board.
