# WebGPU Fireworks Superfan End Card Design

## Goal

Show a personalized closing card after a successfully completed Superfan finale. The card thanks the paid Superfan, reuses the visual language of the opening notification, and remains independently configurable for position, size, and duration.

## User Experience

The existing opening notification remains unchanged. After the finale's complete visual and audio tail, the overlay shows:

```text
This firework was for you!
Thank you for being a Superfan, {username}!
```

The card uses the same profile picture, visual style, and entrance animation as the opening notification. It appears only for a Superfan-triggered finale. Goal, API, legacy, and manually triggered finales do not receive it.

## Timing and Ownership

The browser engine owns the closing-card timing. The Superfan finale payload carries a validated completion-card descriptor into the existing FIFO finale queue. The descriptor remains attached to its finale entry until that entry reaches the existing `finale-complete` timeline event.

At `finale-complete`, the engine has already reached the planner's full duration, including visual and audio decay. A Superfan finale then enters a closing-card phase for the configured duration. Only after the card finishes does `completeFinale()` release the current finale and advance the FIFO queue. This prevents the next person's show from starting behind the previous Superfan's thank-you card. Finales without an end card retain the existing immediate completion behavior. Backend timers are not used because they cannot account reliably for queue wait time, renderer scheduling, or a failed finale.

If the finale is rejected, fails, is cleared, or the renderer is lost before normal completion, no closing card is shown.

## Configuration

Add normalized WebGPU Fireworks settings with these defaults:

- `superfanEndCardDuration`: `3000` milliseconds, clamped to 1000 through 10000 milliseconds.
- `superfanEndCardPosition`: `center`, using the existing seven follower-animation positions.
- `superfanEndCardSize`: `medium`, using `small`, `medium`, `large`, or `custom`.
- `superfanEndCardScale`: `1`, clamped to 0.5 through 2 and used when size is `custom`.

The end card inherits `followerAnimationStyle` and `followerAnimationEntrance`. It has no duplicate style or entrance controls. The settings UI places the four end-card controls inside the existing Superfan Finale card and round-trips them through the normal full-config save path.

The Superfan test button sends the currently visible, possibly unsaved end-card values through its existing allowlisted override payload. Tests continue to bypass enabled state and cooldown history without persisting the overrides.

## Data Contract

The backend adds a `completionNotification` object only to accepted Superfan finale submissions. It contains the username, profile-picture URL, configured duration, position, size, scale, inherited style, inherited entrance, and fixed closing text.

The browser validates and copies this descriptor when it creates the finale queue entry. Normal completion passes it to the existing follower-animation renderer. Text continues to be assigned with `textContent`; no HTML from event data is rendered.

## Error Handling and Lifecycle

- Queue rejection or negative renderer acknowledgement: no end card.
- Renderer failure or device loss during the show: no end card.
- Duplicate or stale completion event: at most one end card.
- Plugin or overlay teardown: existing timeline cleanup discards the descriptor with its finale entry.
- Missing avatar: retain the existing avatar-hidden behavior.
- Missing username: fall back to `Superfan`.

## Tests and Acceptance

Automated coverage will verify:

- config defaults, normalization, bounds, and UI round-trip;
- the Superfan endpoint allowlists visible end-card overrides without persisting them;
- only Superfan finale payloads carry the closing-card descriptor;
- FIFO queue wait does not start the card early, and the next queued finale waits until the card has finished;
- `finale-complete` displays the correct text and settings exactly once;
- renderer failure, queue rejection, and aborted finales display no end card;
- existing non-Superfan finales and opening notifications remain unchanged.

Live acceptance uses the settings test button only when a visible test is safe. A plugin-only reload is sufficient; no server restart is required.
