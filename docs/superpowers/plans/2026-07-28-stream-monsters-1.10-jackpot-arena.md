# Stream Monsters 1.10 – Jackpot Arena & Living Egg Shelf

## Global constraints

- Work only in the isolated `codex/stream-monsters-1.10-jackpot` worktree.
- Do not reload or restart the live LTTH process on port 3000.
- Use CommonJS, two-space indentation, prepared database statements, and plugin data storage.
- Follow strict red-green-refactor with the bundled Node 22 runtime.
- Gift-spawned eggs are owned immediately and never adoptable. Only optional free-egg offers use `!adopt`.
- Preserve sealed A/B/C choices: the first choice is never revealed before both choices are locked.
- Keep the lower 26 percent of the portrait overlay free for TikTok chat.
- No paid combat bonuses, crowd votes, or non-fighter A/B/C input.

## Task 1: Egg ownership and public egg-stage contract

- Add additive egg provenance and stage projection so gift eggs are `gift` plus `owned`, while free offers alone use `reserved|public|claimed|expired`.
- Project a sanitized reconnect-safe `eggStage` containing opaque visual ID, provenance, element, variant, state, display name, safe avatar reference, timing, queue position, and adoption status.
- Gift processing must create exactly one directly owned egg and emit deduplicated `egg_landed`; `!adopt` must never claim or alter gift eggs.
- Free offers remain private for 60 seconds, then emit `free_egg_public`; claim and expiry emit `free_egg_claimed` and `egg_stage_removed`.
- Existing eggs with unknown provenance migrate safely to owned gift/legacy state and never become adoptable.
- Add focused tests for gift ownership, free-offer transitions, concurrent claim, queue/ready/expiry projection, reconnect snapshot, and event deduplication.

## Task 2: GCCE, TTS, identity, and hatch feedback

- Keep GCCE as the sole command ingress while active and TikTok parsing only as fallback.
- Add a stable consumed-command event/correlation contract so TTS skips only successfully handled Stream Monsters commands.
- Preserve normal chat TTS and prevent listener-order races and duplicate command execution.
- Add a Stream Monsters same-origin avatar proxy with protocol, hostname, content-type, size, timeout, and redirect protections.
- Prefer current viewer unique ID or nickname over numeric platform IDs; use initials when no safe avatar exists.
- Hatch reveals and permanent-owner captions must show `@username` plus the proxied profile image; a long numeric platform ID must never be rendered as the owner label.
- Generic cards render without an image circle. Unready `!hatch` uses a compact upper-third card with exact remaining time and queue position.
- Add focused GCCE/TTS, identity, hatch-owner, avatar-security, and chat-view tests, including a numeric incoming username with a valid stored unique ID.

## Task 3: Jackpot battle state and deterministic arena timeline

- Use an eight-second A/B/C choice window; only the two fighters can lock a choice.
- Keep choices sealed until both lock or timeout; then reveal together.
- Project localized skill name, concise effect, element relation, availability, and Special charge.
- Special gains five percentage points per active battle second plus existing action/defense/damage contributions. Pause passive charge during cinematic playback, pause, reconnect restoration, and after completion.
- Keep C unavailable below 100 percent with an explicit reason; emit a single ready transition at 100 percent.
- Expand the deterministic director timeline: entrance, telegraph, anticipation, movement, projectile/shield, sequential hits, number pop, HUD update, recoil, recovery, KO/winner.
- Add structured phase/choice/charge/action logs without direct user identifiers.
- Add battle service, replay, sealed-choice, charge, timeout, reconnect, and director tests.

## Task 4: Portrait Living Egg Shelf and Jackpot Clash UI

- Implement the V1 chat-safe shelf at the 74-percent gameplay boundary. Eggs fly in, bounce, collide, and settle.
- Show eight full-size eggs; overflow is a rotating `+N` stack prioritizing public free offers, ready eggs, then incubating eggs.
- Public free eggs jump, shake, show an eight-second `!adopt` callout, and retain a gold ring until claimed or expired.
- Gift eggs never show adoption affordances.
- Implement V2 Jackpot Clash with full monsters, combo feedback, camera impulse, readable skill cards, HP/shield/Special HUD, and element lighting.
- WebGPU handles particles/light; Canvas2D/CSS follows the same timeline on fallback, device loss, low quality, or reduced motion.
- Add creator previews and diagnostics for shelf, renderer, match phase, GCCE, aliases, and Elemental Hour explanation.
- Add portrait/landscape, queue, reconnect, reduced-motion, renderer-fallback, and creator UI tests.

## Task 5: Release and verification

- Update Stream Monsters manifest, store registry, documentation, and package to `1.10.0`; preserve earlier packages byte-for-byte.
- Build `streamalchemy-1.10.0.zip` and verify its contents and SHA-256 against `plugin-store.json`.
- Run focused Stream Monsters/GCCE/TTS suites, lint, CSS build, `git diff --check`, and a bounded broader Jest run with Node 22/ABI 127.
- Do not reload the plugin or restart LTTH while the stream is active. Runtime acceptance, main integration, and GitHub publication require a later explicit safe point.
