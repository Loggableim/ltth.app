# Talking Heads Gift Lottery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Award a random bundled Talking Heads character for a configurable TikTok gift, persist keep/reroll choices, and show the draw in the OBS overlay.

**Architecture:** A small `AvatarLotteryManager` owns SQLite persistence and the four approved states. `TalkingHeadsPlugin` owns gift/chat event normalization and converts random selections into local five-frame sprite sets. The existing overlay receives one lottery event and performs the slot cycle plus result information box locally.

**Tech Stack:** Node.js CommonJS, existing plugin API/TikTok event registry, SQLite helpers, Socket.IO, local SVG sprite output, Jest.

## Global Constraints

- Use only local bundled Boba, Kenney, and vector assets; never call an image API.
- Match a configured gift ID exactly when present; otherwise compare normalized configured gift names.
- Use exact, case-insensitive `!keep` and `!reroll` chat commands.
- Preserve unrelated manual sprite sets and existing cache data.
- Keep all production code in CommonJS with two-space indentation.

---

### Task 1: Persist lottery choices and random selections

**Files:**
- Create: `app/plugins/talking-heads/utils/avatar-lottery-manager.js`
- Modify: `app/plugins/talking-heads/engines/asset-sprite-library.js`
- Create: `app/test/talking-heads-avatar-lottery-manager.test.js`

**Interfaces:**
- Produces `AvatarLotteryManager#getChoice(userId)`, `draw(userId, username, selection)`, `applyCommand(userId, command)`, and `shouldDraw(choice)`.
- Produces `AssetSpriteLibrary#getRandomSelection(random)` and `getLotteryCandidates(count, random)`.

- [ ] **Step 1: Write failing state-transition tests**

```js
expect(manager.shouldDraw(null)).toBe(true);
expect(manager.shouldDraw(manager.draw('u1', 'Viewer', selection))).toBe(true);
expect(manager.applyCommand('u1', '!keep').state).toBe('kept');
expect(manager.shouldDraw(manager.getChoice('u1'))).toBe(false);
expect(manager.applyCommand('u1', '!reroll').state).toBe('reroll_armed');
expect(manager.shouldDraw(manager.getChoice('u1'))).toBe(true);
```

- [ ] **Step 2: Run the focused test**

Run: `cd app && npm test -- --runInBand --silent test/talking-heads-avatar-lottery-manager.test.js`

Expected: FAIL because the manager module does not exist.

- [ ] **Step 3: Implement the SQLite manager and deterministic selection methods**

```js
draw(userId, username, selection) {
  this._upsert(userId, username, selection, 'pending');
  return { userId, username, selection, state: 'pending' };
}

applyCommand(userId, command) {
  const state = command === '!keep' ? 'kept' : command === '!reroll' ? 'reroll_armed' : null;
  return state ? this._setState(userId, state) : null;
}
```

- [ ] **Step 4: Re-run the focused test**

Run: `cd app && npm test -- --runInBand --silent test/talking-heads-avatar-lottery-manager.test.js`

Expected: PASS.

### Task 2: Wire gift/chat events into Talking Heads

**Files:**
- Modify: `app/plugins/talking-heads/main.js`
- Create: `app/test/talking-heads-gift-lottery.test.js`

**Interfaces:**
- Consumes `AvatarLotteryManager` and `AssetSpriteLibrary` methods from Task 1.
- Produces `isLotteryGift(data)`, `handleLotteryGift(data)`, and `handleLotteryCommand(data)`.

- [ ] **Step 1: Write failing event tests**

```js
await plugin.handleLotteryGift({ userId: 'u1', uniqueId: 'viewer', giftName: 'Heart Me' });
expect(io.emit).toHaveBeenCalledWith('talkingheads:avatar:lottery:start', expect.objectContaining({ userId: 'u1' }));
await plugin.handleLotteryCommand({ userId: 'u1', comment: '!keep' });
expect(lotteryManager.applyCommand).toHaveBeenCalledWith('u1', '!keep');
```

- [ ] **Step 2: Run the focused test**

Run: `cd app && npm test -- --runInBand --silent test/talking-heads-gift-lottery.test.js`

Expected: FAIL because the handlers and event registrations are absent.

- [ ] **Step 3: Implement config normalization and event registration**

```js
this.api.registerTikTokEvent('gift', (data) => this.handleLotteryGift(data));
this.api.registerTikTokEvent('chat', (data) => this.handleLotteryCommand(data));
```

Use `lotteryGiftId` when configured; otherwise normalize names against `lotteryGiftNames`. Persist the winner before emitting the event. Resolve a saved user lottery selection before the global selection in `_handleTTSEvent`.

- [ ] **Step 4: Re-run the focused test**

Run: `cd app && npm test -- --runInBand --silent test/talking-heads-gift-lottery.test.js`

Expected: PASS.

### Task 3: Render the OBS lottery and configure its trigger

**Files:**
- Modify: `app/plugins/talking-heads/overlay.html`
- Modify: `app/plugins/talking-heads/assets/overlay.js`
- Modify: `app/plugins/talking-heads/assets/overlay.css`
- Modify: `app/plugins/talking-heads/ui.html`
- Modify: `app/plugins/talking-heads/assets/ui.js`
- Create: `app/test/talking-heads-lottery-overlay.test.js`

**Interfaces:**
- Consumes `talkingheads:avatar:lottery:start` payload `{ candidates, winner, username, duration, keepCommand, rerollCommand }`.
- Produces an animated candidate slot and a visible winner information box.

- [ ] **Step 1: Write a failing overlay-contract test**

```js
expect(overlaySource).toContain("talkingheads:avatar:lottery:start");
expect(overlaySource).toContain('keepCommand');
expect(overlaySource).toContain('rerollCommand');
```

- [ ] **Step 2: Run the focused test**

Run: `cd app && npm test -- --runInBand --silent test/talking-heads-lottery-overlay.test.js`

Expected: FAIL because the event is not handled.

- [ ] **Step 3: Implement the candidate cycle, winner frame, and info box**

Cycle the three idle URLs every 100 ms, stop after the server-provided duration, display `winner.sprites.idle_neutral`, and render the approved `!keep` / `!reroll` instructions. Add fields for enabled, gift ID, and comma-separated gift names to the local asset settings page.

- [ ] **Step 4: Re-run the focused test**

Run: `cd app && npm test -- --runInBand --silent test/talking-heads-lottery-overlay.test.js`

Expected: PASS.

### Task 4: Integrate and validate

**Files:**
- Modify: `app/plugins/talking-heads/plugin.json`
- Modify: `app/plugins/talking-heads/README.md`
- Modify: `app/plugins/talking-heads/locales/de.json`
- Modify: `app/plugins/talking-heads/locales/en.json`
- Modify: `app/plugins/talking-heads/locales/es.json`
- Modify: `app/plugins/talking-heads/locales/fr.json`

- [ ] **Step 1: Add manifest defaults and explain the gift lottery**

Document the three default names, gift ID precedence, and the `!keep` / `!reroll` state rules in user-facing copy.

- [ ] **Step 2: Run focused Talking Heads validation**

Run: `cd app && npm test -- --runInBand --silent test/talking-heads-*.test.js`

Expected: all Talking Heads suites PASS.

- [ ] **Step 3: Run static checks**

Run: `cd app && npm run lint -- --quiet`

Expected: exit code 0 for the touched JavaScript files.
