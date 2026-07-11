# Quiz Show Expansion Design

Approved: 2026-04-30

## Goal

Expand the quiz-show plugin in one coordinated work block with category voting, configurable question cooldowns, show playlists, duel mode, new overlay themes, accessibility controls, avatar performance controls, sound upload management, achievements, season automation, encoding cleanup, plugin health checks, and a first-run setup wizard.

## Current System

The active plugin lives in `app/plugins/quiz-show/`. It already provides question management, AI question packages, multiple game modes, joker and gift-joker support, leaderboard seasons, HUD configuration, slot-machine category selection, TTS, custom overlay layout, and Socket.IO-based overlay updates.

The implementation will extend the existing CommonJS plugin instead of replacing its structure. Persistent runtime data will use the plugin data directory and SQLite tables. User data, logs, configs, and runtime databases will not be removed.

## Feature Design

### Category Selection

The fixed 24-hour question cooldown becomes configurable through `questionCooldownHours`. Selection continues to avoid repeats within the current session and now applies the configured cooldown window.

Show playlists store a named quiz flow with category filters, package filters, round count, sequential/random order, and optional audience voting before each question. Audience voting opens a timed voting window, collects chat votes, updates the overlay with live totals, and applies the winning category to the next question.

### Duel Mode

Duel mode is added as a first-class game mode. A duel session has two sides, each with an id, label, optional user ids, score, streak, and latest answer status. A correct answer awards the side, updates streaks, and emits duel overlay updates. The round result can show a duel winner or tie.

### Overlay Visuals

HUD config gains theme presets: `minimal`, `neon`, `retro`, `casino`, and `highContrast`. Accessibility options add `reducedMotion` and `highContrast` switches. The overlay maps these options to CSS classes and CSS variables.

Voter avatar rendering gains performance controls: mode, max avatars per answer, cache toggle, and fallback initials. The overlay limits DOM work and avoids repeated image work where possible.

### Sounds

Sound management moves from manual DB-only setup to an admin UI with upload/delete/test support. Uploaded files are stored under `api.getPluginDataDir()/sounds`, and only safe audio extensions are accepted. Existing `game_sounds` rows remain compatible.

### Achievements

Achievement rules cover fastest answer, answer streak, category specialist, duel winner, and participation. Achievements are stored per user and emitted to dashboard/overlay as popup events. Rules are configurable but ship with sensible defaults.

### Season Automation

Leaderboard seasons can be scheduled manually, weekly, or monthly. A maintenance method checks whether the active season should roll over before state is returned or a quiz action starts. Season history stays intact.

### Health And Setup

The health endpoint reports database availability, Socket.IO availability, question count, category count, active season, overlay URL, TTS setting, OpenAI key presence, sound count, setup completion, and current quiz state.

The setup wizard records progress in plugin config and guides the first setup through questions, categories, overlay test, sound setup, and first quiz/show selection.

### Encoding Cleanup

Plugin manifest, README-facing text, and visible admin/overlay labels touched by this work are corrected to valid German UTF-8 text. This is limited to static plugin files and does not rewrite runtime user data.

## Error Handling

Routes validate request bodies, numeric ranges, enum values, uploaded file extensions, and ids. Chat voting rejects messages outside an active voting window. Duel scoring falls back cleanly when no duel participant matches the answering user. Sound upload failures return explicit HTTP errors and do not create database rows.

## Testing

Add focused Jest coverage for helper logic and endpoint-level behavior where the existing test harness allows it:

- question cooldown config
- category voting lifecycle and chat parsing
- playlist selection metadata
- duel scoring
- achievement awards
- season rollover calculation
- health payload shape
- sound filename validation

Run the closest quiz tests, then lint/build CSS if the focused tests are clean enough to proceed.
