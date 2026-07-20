# EmojiRain Command UI and Despawn Design

Date: 2026-07-20
Status: Approved for inline implementation

## Goal

Repair the dynamic EmojiRain command editor so it remains visually intact at dashboard and standalone-plugin widths, and add one shared despawn duration that applies only to emojis spawned by dynamic commands such as `!beans`, `!miau`, `!rawr`, `!woof`, and `!wuff`.

Classic EmojiRain and WebGPU EmojiRain must remain behaviorally and visually equivalent. Normal emoji rain, likes, gifts, heart balloons, gift balls, and other commands keep their existing lifetime behavior.

## Confirmed Root Cause

The command editor is currently nested inside a half-width settings card that is about 538 px wide at a 1280 px viewport. Each command row nevertheless enforces a minimum width of about 730 px through four fixed minimum grid columns. This expands the document horizontally and tears the form apart.

The editor also applies author-level `display` rules to labels and upload containers. Those rules override the browser's native `[hidden]` behavior, so gallery and upload controls can remain visible for emoji targets even though the editor marks them hidden.

## Configuration

Add one shared persistent field:

```js
{
  animal_command_despawn_ms: 8000
}
```

- The UI displays and accepts seconds while persistence and renderer payloads use milliseconds.
- The allowed UI range is 1 to 120 whole seconds.
- Missing configuration migrates to 8000 ms.
- Strict saves reject non-finite, fractional-millisecond, or out-of-range values instead of silently accepting malformed data.
- An explicitly configured value round-trips through the Classic database config and the WebGPU plugin config.

## Runtime Behavior

- A successful dynamic animal-command spawn receives the configured lifetime override.
- Cooldown rejection, permission rejection, flood protection, disabled commands, and failed spawns do not emit anything and do not alter cooldown behavior.
- WebGPU receives the command lifetime as `lifetimeMs`, which its native renderer already understands.
- Classic receives the same `lifetimeMs` spawn field. Its standard overlay and OBS-HUD paths retain that field on spawned bodies and prefer it over the global `emoji_lifetime_ms` value during lifetime checks.
- The override is attached only inside `handleConfiguredAnimalCommand`; `/rain`, `/emoji`, `/storm`, likes, gifts, gift balls, heart balloons, and all other event paths remain unchanged.
- Queued command spawns preserve the lifetime override.

## User Interface

- Move the command editor out of the SuperFan burst card into its own full-width configuration card in both Classic and WebGPU UIs.
- Keep access, cooldowns, and the new shared despawn setting together in a responsive settings grid.
- Label the control as `Despawn-Dauer der Kommando-Emojis (Sekunden)` in German and provide equivalent EN, ES, and FR translations.
- Use a responsive command-row layout with shrinkable columns. At narrower widths it becomes two columns and then one column without document-level horizontal overflow.
- Add `min-width: 0` where grid and form controls must shrink.
- Enforce `.emoji-command-editor [hidden] { display: none !important; }` so image-only controls cannot appear for emoji targets.
- Keep all dynamic content creation on safe DOM APIs; no user-provided HTML insertion is introduced.

## Error Handling

- Invalid despawn values produce the existing invalid-command-settings response path with a field-specific issue.
- Save failures leave the previous config and GCCE registration active through the existing atomic update behavior.
- The editor shows the existing localized validation/status surface; it must not partially save malformed values.

## Tests

- Shared normalization: default, valid boundary values, invalid values, and strict-save rejection.
- Classic and WebGPU command handlers: exact `lifetimeMs: 8000` (or configured value) appears only on successful dynamic command spawns.
- Classic standard overlay and OBS-HUD: per-spawn lifetime overrides the global lifetime.
- Config persistence: Classic database and WebGPU config round-trip the new field.
- JSDOM/editor tests: seconds-to-milliseconds load/save conversion and localized label contract.
- Static UI contract: editor is a full-width card, shrinkable, and has an explicit `[hidden]` rule in both variants.
- Browser verification at 1280 px and a narrower viewport: no horizontal page overflow; upload/gallery controls are hidden for emoji targets and visible for image targets.
- Focused command/UI/renderer suites, scoped ESLint, syntax checks, translation validation, CSS build where relevant, and `git diff --check`.

## Live Rollout

The active server currently runs from `C:\Users\logga\Downloads\app` on port 3000 with `webgpu-emoji-rain` enabled and Classic `emoji-rain` disabled. After repository verification, copy only the validated EmojiRain files needed by the running instance and reload only `webgpu-emoji-rain`. Do not restart the server and do not emit synthetic chat commands during the live rollout.
