# Stream Monsters Steal Egg Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe `!steal` flow for inactive viewers' ready eggs and turn the lower overlay band into a rotating six-egg rail.

**Architecture:** A dedicated `UnhatchedEggStealService` owns publication and atomic claims for abandoned ready eggs. The ready timer auto-hatches active owners before invoking that service. The existing public egg-stage projection gains an explicit offer type so the overlay can render free, stealable, and incubating eggs without leaking internal IDs.

**Tech Stack:** CommonJS, better-sqlite3, Jest, HTML/CSS/vanilla browser JavaScript, Playwright.

## Global Constraints

- `!adopt` can only claim the existing public daily/free egg offer.
- `!steal` and `!stehlen` can only claim a public ready egg whose owner was inactive.
- With steal enabled, an active owner must auto-hatch before their egg can be published.
- Default timings are 600 seconds ready and 300 seconds owner-activity window; both are editable in the creator GUI.
- The lower overlay rail shows six eggs per page and rotates all egg types.

---

### Task 1: Dedicated Steal Lifecycle

**Files:**
- Create: `app/plugins/streamalchemy/backend/streammonsters/unhatched-egg-steal-service.js`
- Modify: `app/plugins/streamalchemy/index.js`, `app/plugins/streamalchemy/backend/streammonsters/routes.js`
- Test: `app/test/streammonsters-unhatched-egg-steal.test.js`

**Interfaces:**
- Produces `observeReadyEgg(eggId)`, `sweep({ isViewerActive })`, `steal(input)`, and `listPublic()`.
- Publishes sanitized `eggStage` entries with `offerType: 'steal'`.

- [ ] Write failing lifecycle tests for inactive publication, active-owner auto-hatch, owner return, and one-winner concurrent claims.
- [ ] Implement the SQLite-backed service and wire it after active-owner auto-hatch in the ready timer.
- [ ] Verify the focused lifecycle suite passes.

### Task 2: Strict Chat Command Split

**Files:**
- Modify: `app/plugins/streamalchemy/backend/streammonsters/chat-commands.js`, `app/plugins/streamalchemy/backend/streammonsters/command-ingress.js`, `app/plugins/streamalchemy/index.js`
- Test: `app/test/streammonsters-chat-commands.test.js`, `app/test/streammonsters-unhatched-egg-steal.test.js`

**Interfaces:**
- Adds canonical command `steal` with aliases `steal` and `stehlen`.
- Returns `own_ready_egg` when the thief must hatch first.

- [ ] Write failing command tests proving `!adopt` never claims a steal offer, `!steal` never claims a free offer, and the ready-egg guard is public.
- [ ] Route the new command through GCCE/fallback ingress and localized chat results.
- [ ] Verify command suites pass with retry-safe provider-event receipts.

### Task 3: Creator Controls and Legacy Handover

**Files:**
- Modify: `app/plugins/streamalchemy/streammonsters-ui.html`, `app/plugins/streamalchemy/backend/streammonsters/routes.js`, `app/plugins/streamalchemy/index.js`
- Test: `app/test/streammonsters-unhatched-egg-steal.test.js`

**Interfaces:**
- Adds `unhatchedEggStealEnabled`, `unhatchedEggStealGraceSeconds`, and `unhatchedEggStealActivityWindowSeconds` to the creator payload.

- [ ] Write failing config tests for defaults, validation, live recalculation, and disabled-offer closure.
- [ ] Replace the old owned-ready rescue startup/runtime route with the new service so a ready egg has one publisher only.
- [ ] Verify old rescue records cannot appear or be claimed after the handover.

### Task 4: Six-Slot Rotating Lower Egg Rail

**Files:**
- Modify: `app/plugins/streamalchemy/streammonsters-egg-stage-view.js`, `app/plugins/streamalchemy/streammonsters-overlay.html`
- Test: `app/test/streammonsters-egg-stage-view.test.js`, `app/test/streammonsters-overlay.test.js`

**Interfaces:**
- `offerType` chooses `!adopt` versus `!steal`; `sourceOwnerDisplayName` is displayed only for steal offers.
- `buildShelfModel()` returns the next full page of at most six entries.

- [ ] Write failing unit tests for six-slot mixed pages, rotation of every egg type, command labels, sanitized source-owner copy, and ticking incubation timers.
- [ ] Move the shelf into the lower band, remove the overflow-only model, and cross-fade full pages without changing hatch-reveal layering.
- [ ] Verify the focused UI suites pass.

### Task 5: End-to-End Verification

**Files:**
- Modify: focused test fixtures only if needed for the production overlay contract.

- [ ] Run the focused service, command, overlay, and localization suites with the bundled Node runtime.
- [ ] Run lint and `git diff --check`.
- [ ] Use the portrait browser fixture at 1080x1920 to verify six slots, page rotation, timers, command labels, and no overlap with the hatch reveal.
