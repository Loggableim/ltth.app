# Interactive Game Round-Robin Turns Design

## Goal

When several interactive Chess and Connect 4 matches are active, LTTH presents
exactly one eligible turn at a time and advances turns fairly in round-robin
order.  The overlay makes both players and the current actor unambiguous, and
the backend accepts input only from that actor for the displayed match.

## Scope

- Interactive Chess and Connect 4 sessions only.
- Viewer chat moves and host dashboard moves.
- Server-authoritative session selection, timers, persistence, recovery, and
  overlay state.
- The unified interactive overlay and the Connect 4/Chess player presentation.

Manual games, Wheel, Slot, Plinko, Arena, matchmaking rules, and game rules
are unchanged.

## Required User Experience

With two Chess and three Connect 4 sessions, every individual player turn is
served fairly.  A valid move advances its session to the back of the active
rotation after its move animation.  The next eligible session becomes visible.
For example:

```text
Connect 4: Anna -> Chess: Host vs Ben -> Connect 4: Carla
-> Chess: David -> Connect 4: Elif -> Connect 4: Host vs Anna -> ...
```

Host turns take exactly the same place in the rotation as viewer turns.  A
session with a viewer turn must not be skipped indefinitely by host turns, and
vice versa.

The displayed board has a prominent header containing both player names and a
large, localised `AM ZUG: <name>` indicator.  The active player is visually
highlighted; the other player remains visible as the opponent.  The header also
shows the current game position, for example `Spiel 2 von 5`, when more than
one active session exists.

## Server-Authoritative Turn Scheduler

`InteractiveTurnQueue` becomes the durable round-robin order for active
interactive sessions.  A queue entry identifies a session, not a permanently
assigned player.  The current `turnRole` is always read from the session after
each legal move.

### Queue invariants

1. Each active session occurs at most once in the runnable queue.
2. The queue head is the only session that can be displayed in the `playing`
   phase and the only session allowed to receive a move.
3. A newly started session is appended to the tail.  It never interrupts an
   already displayed turn.
4. After a legal viewer or host move, the session is persisted with its new
   turn role and appended to the tail if still active.
5. Completed, cancelled, timed-out, and orphaned sessions are removed from the
   queue before the next selection.  They can never be selected again.
6. On startup and recovery, the queue is reconciled against persisted active
   sessions: stale entries are removed and every active session missing from
   the queue is appended once in deterministic session-id order.

The scheduler rotates only at a committed turn boundary: legal move, explicit
host skip, timeout, cancellation, or completed game.  It does not use a
wall-clock display interval.  The current board therefore remains visible for
the complete input window and its post-move animation.

## Display and Timer Flow

`InteractiveDisplayRouter` selects the round-robin queue head for the
`playing` phase.  It must not substitute a least-recently-active viewer session
while a runnable queue exists.

When a displayed player makes a legal move:

1. `InteractiveController` commits game state, turn role, revision, and timer
   state.
2. The displayed board enters its existing move-animation phase.
3. The controller rotates the still-active session to the queue tail.
4. After animation completion, the router selects the next valid queue head,
   publishes a new display revision, and resumes only that session's timer.

Viewer and Chess host timers remain paused while their session is not displayed.
The active session timer is the only timer allowed to count down.  Result and
leaderboard presentations retain their current priority; after each presentation
the router resumes at the current round-robin head.

## Input Authorisation

The backend remains the authority; client-side disabling is only visual help.

### Viewer chat moves

A viewer move is accepted only if all conditions hold:

- the session is active and equals the queue head and `displaySessionId`;
- the displayed turn role is `viewer`;
- the authenticated chat viewer id equals the session's `viewerId`;
- the submitted session and display revisions match the current revisions;
- the adapter accepts the game-specific move.

Every other chat message is ignored or rejected without changing board, timer,
or queue order.  This includes a valid viewer attempting a move while another
match is displayed.

### Host dashboard moves

A host move is accepted only if all conditions hold:

- the session is active and equals the queue head and `displaySessionId`;
- the displayed turn role is `host`;
- the existing admin socket authorisation passes;
- session and display revisions match; and
- the adapter accepts the game-specific move.

The dashboard disables host controls when a viewer is active or another match
owns the current turn.  Stale socket payloads are rejected without mutating
state.

## Overlay Presentation

The interactive display payload adds explicit actor and rotation metadata:

```js
{
  displaySessionId,
  hostDisplayName,
  viewerDisplayName,
  currentTurnRole,          // 'host' or 'viewer'
  activePlayerDisplayName,  // hostDisplayName or viewerDisplayName
  activeSessionIndex,       // one-based display position
  activeSessionCount
}
```

`unified.html` and game-specific interactive overlays render the same player
identity model.  They use translated labels for host, player, opponent, and
`current turn`.  The currently active player receives the large turn banner and
an accessible active-state class; the opposing player receives a neutral class.
No overlay click handler is trusted to authorise a move.

## Failure Handling and Recovery

- Duplicate queue entries are collapsed before publication, preserving the
  earliest valid position.
- If the head points to an inactive, missing, or non-runnable session, it is
  removed and selection continues without exposing it.
- If publishing an animation or display update fails after a move commit, the
  controller reconciles queue and display state from persisted sessions before
  accepting another move.
- Session cancellation, timeout, and finish remove the session atomically from
  registry, persistence, timers, and the round-robin queue.
- Restart recovery preserves queue order where stored, pauses non-displayed
  timers, and emits one coherent snapshot before accepting inputs.

## Verification and Acceptance Criteria

Automated coverage must prove all of the following:

1. Two Chess plus three Connect 4 matches cycle through all five sessions
   without duplicate or starved turns.
2. Viewer and host turns both move their session to the queue tail after a
   legal move.
3. A viewer cannot move a hidden session, another viewer's session, a host
   turn, or a stale revision.
4. A host cannot move a hidden session, a viewer turn, or a stale revision.
5. Only the selected session's viewer or Chess host timer runs; all others are
   persisted as paused.
6. Timeout, cancellation, result display, and restart recovery preserve a
   valid queue and never reactivate a removed session.
7. DOM tests verify the prominent active-player label, both player names,
   active highlighting, and translated fallback text.

Validation uses `runtime/node/node.exe` for the focused tests, then the full
Game Engine Jest suite, ESLint, locale JSON parsing, i18n checks, and
`git diff --check`.
