# EmojiRain animal chat commands

## Goal

Fix the `!beans` effect so it drops paw prints instead of stars, and add
animal-themed EmojiRain chat commands.

## Scope and behaviour

The classic `emoji-rain` plugin will continue to register commands through
GCCE. Existing commands and the render pipeline remain unchanged.

| Command | Emoji | Permission | User cooldown | Global cooldown | Effect |
| --- | --- | --- | --- | --- | --- |
| `!beans` | `🐾` | subscriber | 30 seconds | 5 seconds | Existing 30-item burst |
| `!miau` | `🐱` | all | 60 seconds | 15 seconds | 30-item burst |
| `!rawr` | `🦖` | all | 60 seconds | 15 seconds | 30-item burst |
| `!woof` | `🐶` | all | 60 seconds | 15 seconds | 30-item burst |
| `!wuff` | `🐶` | all | 60 seconds | 15 seconds | 30-item burst |

Each command uses the plugin's normal enabled-state and anti-spam checks. On
success it calls the existing `triggerEmojiRain` method with the configured
emoji, `count: 30`, `intensity: 1.5`, and `burst: true`. The overlay therefore
receives the normal `emoji-rain:spawn` event and needs no changes.

## Implementation approach

Add command metadata and handlers in `app/plugins/emoji-rain/main.js`, keeping
the existing GCCE command-registration pattern. The animal handlers may share
a small private helper so their enabled-state check, anti-spam behaviour,
metrics update, and spawn parameters remain identical.

No configuration, database schema, permission model, WebGPU renderer, or
plugin-store package changes are part of this work.

## Error handling

Disabled EmojiRain returns the existing disabled message. Calls rejected by
the shared anti-spam limit retain the existing wait message. GCCE enforces the
per-command user and global cooldowns before a handler is invoked.

## Tests

Add Jest coverage using the existing EmojiRain plugin mock API. Tests will
verify the registered animal-command metadata, all 60/15-second cooldowns,
the corrected `!beans` paw-print spawn, and each new command's emitted emoji,
burst flag, count, and source. The test will exercise the actual command
handlers rather than duplicate their spawn logic.
