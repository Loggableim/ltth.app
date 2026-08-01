# Arena left info commands design

## Goal

Move the existing Arena information rotator into the free upper-left portrait-stream area selected by the streamer, and keep its direct ability instructions readable there.

## Behaviour

- Add the `stream-left-panel` information-rotator placement.  In the portrait `stream-bottom` layout it occupies the area below the small top cards and above event callouts; other placement choices retain their current behaviour.
- The new choice appears in the Arena dashboard as **Linkes Infofeld (Stream)**.  It does not silently change other saved layouts or the global default.
- Direct ability instructions start each rotator cycle so viewers see them before general, custom, gift, and strategy information.
- The German shield command `!schild` activates the same ability as `!shield`.  Both spellings remain accepted and the overlay card explicitly shows both.
- `!boost` remains the established speed command.  No combat values, cooldown logic, player rings, or game-reset behaviour change.

## Rendering and copy

The stream-left panel is fixed to the portrait viewport with proportional margins and width, so it aligns with the marked free area at 1080x1920 while staying readable at other portrait resolutions.  Its German cards state the command, effect duration, and recharge time using the actual Arena configuration.  The existing top ability legend remains optional and off by default.

## Verification

- Regression tests cover the new stored placement, the rendered placement contract, the `!schild` alias, and the German ability card copy.
- Run the focused Arena suite and lint only touched Game Engine files with the bundled runtime.
- Merge locally into `main`, set the current Arena profile to `stream-left-panel`, reload only `game-engine`, and inspect the live portrait overlay.  Do not restart the desktop app or alter an active match.
