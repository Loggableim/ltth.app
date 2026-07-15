# Music Bot: Random Auto-DJ History Seed

## Goal

The **Next Auto-DJ Track** action must start a suitable random Auto-DJ track
even when no song is currently playing and no in-memory seed exists.

## Behavior

1. Random Auto-DJ normally creates a YouTube Radio URL from its current seed.
2. If no seed is available, it selects the newest valid YouTube title from the
   persisted Music Bot history.
3. That title becomes the in-memory seed only; it is not replayed.
4. Auto-DJ resolves the next matching YouTube Radio entry and starts it.
5. If history has no usable YouTube title, the existing clear no-context message
   remains the fallback.

## Scope

- Add a focused Auto-DJ helper that obtains one usable history seed.
- Reuse the existing `setPlaybackSeed` boundary and random radio resolver.
- Keep Auto-DJ activation state and consecutive-track counters unchanged while
  establishing the seed.
- Cover the empty-seed history path with focused tests.

## Non-goals

- Do not persist the seed across restarts.
- Do not alter normal playlist, history, or viewer-request behavior.
- Do not replay the history title before selecting its radio follow-up.

## Acceptance criteria

- With random mode enabled, no active song, no seed, and usable history, the
  Next Auto-DJ Track action starts a related radio title.
- With no usable history, the action returns the existing no-context result.
- Existing random-mode and playlist-mode selection tests remain green.
