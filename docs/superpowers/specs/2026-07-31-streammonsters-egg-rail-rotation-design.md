# Stream Monsters Egg Rail Rotation

## Goal

Keep the portrait egg rail readable when more active eggs exist than fit on screen.

## Behavior

- The Stream Monsters creator GUI exposes `Visible eggs in rotation`.
- The selectable range is 1 through 6 and the default is 4.
- Every active, non-expired egg participates in one circular rotation.
- The rail displays exactly the configured number of cards whenever that many eggs exist.
- Each rotation advances the window by one egg, wrapping at the end. A partial final page is never rendered.
- Portrait cards never use the landing transform; landscape landing animation is unchanged.

## Data flow

1. The GUI saves `eggShelfVisibleCount` through the existing Stream Monsters config route.
2. Backend config normalization persists the value in the inclusive range 1–6 with a default of 4.
3. The overlay state snapshot exposes the normalized config.
4. The egg rail passes that value to its shelf model on every render.

## Verification

- Unit tests cover defaults, bounds, persistence payload, and circular full-window rotation.
- Overlay integration tests verify a portrait live `egg_landed` does not scale a card.
- Creator GUI tests exercise saving and rehydrating the chosen value.
