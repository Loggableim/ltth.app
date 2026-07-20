# Schnorrbecher Top-Spawn Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every live gift fall from directly above the Schnorrbecher glass and render every completed combo repeat as an individual gift icon.

**Architecture:** `CoinJarEngine` determines the visual count for completed repeats. `CoinJarOverlay` owns the spawn position and physics behavior; it no longer interprets jar fullness as a side-spawn instruction or recontains bodies that have naturally escaped.

**Tech Stack:** CommonJS, Jest, Matter.js, Socket.IO overlay.

## Global Constraints

- New gift positions must be above `physicsBounds.opening`.
- Only the global `maxPhysicalIcons` limit may compact older bodies.
- Side-spawn and forced recontainment are prohibited for new and escaped gifts.

---

### Task 1: Lock the requested visual behavior with tests

**Files:**
- Modify: `app/plugins/schnorrbecher/test/overlay-controller.test.js`
- Modify: `app/plugins/schnorrbecher/test/coin-jar-engine.test.js`

**Interfaces:**
- Consumes: `CoinJarOverlay#_scheduleSpawn`, `CoinJarOverlay#_updateBodies`, `CoinJarEngine#handleGift`
- Produces: regression coverage for top-only spawn, natural escape, and repeat counts.

- [ ] **Step 1: Write failing overlay tests**

```js
expect(overlay._createCoin).toHaveBeenCalledWith(payload, expect.objectContaining({ overflow: false }));
expect(mockMatter.Body.setPosition).not.toHaveBeenCalled();
```

- [ ] **Step 2: Write a failing completed-combo test**

```js
expect(engine.handleGift({
  eventId: 'ten-roses', giftId: 'rose', diamondValue: 1,
  repeatCount: 10, repeatEnd: true
})).toMatchObject({ visualCoins: 10 });
```

- [ ] **Step 3: Run the focused tests and observe failure**

Run: `cd app && npx jest --runInBand plugins/schnorrbecher/test/overlay-controller.test.js plugins/schnorrbecher/test/coin-jar-engine.test.js`

Expected: the existing capacity path still requests `overflow: true` and a 10-Rose event returns four visual icons.

### Task 2: Remove artificial overflow routing

**Files:**
- Modify: `app/plugins/schnorrbecher/overlay/coincup.js`

**Interfaces:**
- Consumes: normal gift queue items and Matter body state.
- Produces: queue items with `overflow: false` and opening-only spawn coordinates.

- [ ] **Step 1: Remove fullness-based side-spawn decisions**

```js
for (let index = 0; index < count; index += 1) {
  this.queue.push({ payload, generation: this.generation, overflow: false, tier: 0 });
}
```

- [ ] **Step 2: Always calculate a top spawn position**

```js
const x = options.position?.x ?? spawnX;
const y = options.position?.y ?? (options.settled
  ? settledY
  : this.physicsBounds.opening.y - 30 - this.random() * 120);
```

- [ ] **Step 3: Preserve escaped body positions**

```js
// Do not call Matter.Body.setPosition for a normal body merely because it is outside the jar contour.
```

- [ ] **Step 4: Run focused overlay tests**

Run: `cd app && npx jest --runInBand plugins/schnorrbecher/test/overlay-controller.test.js`

Expected: PASS.

### Task 3: Render each repeat individually

**Files:**
- Modify: `app/plugins/schnorrbecher/lib/coin-jar-engine.js`
- Modify: `app/plugins/schnorrbecher/test/coin-jar-engine.test.js`

**Interfaces:**
- Consumes: normalized event `repeatCount`.
- Produces: `payload.visualCoins` equal to the completed repeat count when it is greater than one.

- [ ] **Step 1: Select repeat count before value-based scaling**

```js
const visualCoins = event.repeatCount > 1
  ? Math.min(100, event.repeatCount)
  : calculateVisualCoins(totalValue);
```

- [ ] **Step 2: Run engine tests**

Run: `cd app && npx jest --runInBand plugins/schnorrbecher/test/coin-jar-engine.test.js`

Expected: PASS, including the ten-Rose combo.

### Task 4: Verify the running overlay

**Files:**
- No source files beyond Tasks 1-3.

- [ ] **Step 1: Run full Schnorrbecher checks**

Run: `cd app && npx jest --runInBand plugins/schnorrbecher/test test/plugin-store-registry.test.js && npm run lint -- --quiet`

Expected: all suites pass and ESLint exits 0.

- [ ] **Step 2: Restart only `app/launch.js` and inspect the served overlay**

```powershell
Invoke-WebRequest http://127.0.0.1:3000/plugins/schnorrbecher/overlay/coincup.js -UseBasicParsing
```

Expected: no side-spawn coordinate expression remains and the application is listening on port 3000.
