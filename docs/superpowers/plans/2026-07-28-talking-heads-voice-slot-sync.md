# Talking Heads Voice Avatar Slot Sync — Execution Plan

## Task 1 — Avatar assignment domain and Boba composition

- Write focused failing tests for an assigned-voice user's first playback, legacy avatar persistence, no auto-assignment without an assigned voice, gift rerolls, and valid Boba frame composition.
- Evolve the existing avatar lottery manager into a persistent avatar-assignment API without a schema-breaking migration. Existing valid records count as assigned avatars.
- Make Boba the default and only automatic assignment pool. Draw uniformly from valid Boba animal/expression selections, guarantee rerolls differ, repair eyebrow/nose/mouth path mapping, and retain manual/legacy avatars.
- Replace the chat `!keep` and `!reroll` behavior with configured-gift rerolls for existing avatars only.

## Task 2 — Canonical TTS and renderer lifecycle

- Write failing lifecycle tests before changing TTS behavior.
- Give every playback one `playbackId` (the existing queue id), remove duplicate PluginLoader emission, and publish `prepared`, renderer `started`, `progress`, `ended`, and `failed` lifecycle events exactly once.
- Before dispatching first-assignment audio, call the Talking Heads preparation API; wait for overlay spin completion or a bounded fallback without blocking an unavailable overlay forever.
- Have dashboard audio acknowledge native `playing`, audio level/current time progress, native `ended`, and failures. Use real renderer events to drive/finish the queue and Talking Heads animation; maintain a bounded watchdog fallback.

## Task 3 — Release overlay, Stream Director UI, and public routing

- Replace the form UI with Live, Character Lab, Overlay Setup, and Advanced sections. Provide Boba thumbnail/frame previews, a safe test spin, live status, copyable local/public overlay URLs, and retained advanced controls.
- Upgrade the overlay to a three-reel Boba slot presentation with an unambiguous winner reveal, a speaker stage, amplitude-driven mouth states, and an idle fallback.
- Add the required public overlay entry point, assets, and strictly necessary Talking Heads socket events to the public overlay allowlist. Do not expose audio-renderer acknowledgements through the public surface.
- Update all Talking Heads locale files and add DOM/browser-facing regression coverage.

## Task 4 — Verification and review

- Run focused unit, integration, JSDOM, and Playwright checks for the complete journey; then CSS build, i18n validation, lint, and relevant static/public-surface suites.
- Review the full branch diff for plan compliance, state lifecycle safety, public-surface exposure, and dirty-tree scope before handoff.
