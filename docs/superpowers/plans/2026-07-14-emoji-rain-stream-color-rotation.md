# EmojiRain Stream-Farbrotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each Like-User a stable heart-balloon color for one confirmed TikTok LIVE session, then reset and randomly reshuffle the palette only for the next confirmed session in both EmojiRain renderers.

**Architecture:** Each plugin keeps a shuffled in-memory palette, a user-to-color map, and the last processed stream identity. `streamSessionStarted` resets the session state; `connected` is a deduplicated fallback and must explicitly report `isNewStream: true`. The existing spawn protocol continues to receive the selected `heartColor` unchanged.

**Tech Stack:** Node.js CommonJS, Jest, TikTok EventEmitter plugin API.

## Global Constraints

- Modify both mutually exclusive plugins: `emoji-rain` and `webgpu-emoji-rain`.
- Do not persist color assignments in database, configuration, or plugin files.
- A reconnect or `isNewStream: false` must not reset colors.
- Shuffle the existing palette; do not introduce a different color set.
- Use a failing Jest regression test before each production-code change.

---

### Task 1: Add session-scoped color rotation to classic EmojiRain

**Files:**
- Modify: `app/plugins/emoji-rain/test/heart-balloons.test.js`
- Modify: `app/plugins/emoji-rain/main.js:93-105,708-718,2356-2388`

**Interfaces:**
- Consumes: TikTok lifecycle payload `{ streamIdentity, username, roomId, isNewStream }`.
- Produces: `handleHeartBalloonStreamSession(data, options)` which returns `true` only when it resets state; `getHeartBalloonColor(username)` returns the stable hex color.

- [ ] **Step 1: Write the failing regression tests**

Add these tests after `assigns a stable heart color per user` in `app/plugins/emoji-rain/test/heart-balloons.test.js`:

```js
  test('shuffles every heart color and uses each before repeating within a stream', () => {
    const random = jest.spyOn(Math, 'random').mockReturnValue(0);
    const plugin = new EmojiRainPlugin(new MockAPI());
    random.mockRestore();
    const colors = plugin.heartBalloonPalette.map((_, index) =>
      plugin.getHeartBalloonColor(`viewer-${index}`)
    );

    expect(plugin.heartBalloonColorPool).toEqual(expect.any(Array));
    expect(plugin.heartBalloonColorPool).not.toEqual(plugin.heartBalloonPalette);
    expect(new Set(colors).size).toBe(plugin.heartBalloonPalette.length);
    expect(plugin.getHeartBalloonColor('viewer-after-palette')).toBe(colors[0]);
  });

  test('resets user colors only for a confirmed new stream session', () => {
    const plugin = new EmojiRainPlugin(new MockAPI());
    const firstColor = plugin.getHeartBalloonColor('viewer-one');

    expect(plugin.handleHeartBalloonStreamSession({
      streamIdentity: 'streamer:room-1',
      isNewStream: false
    })).toBe(false);
    expect(plugin.getHeartBalloonColor('viewer-one')).toBe(firstColor);

    expect(plugin.handleHeartBalloonStreamSession({
      streamIdentity: 'streamer:room-2'
    })).toBe(true);
    expect(plugin.heartBalloonUserColors.size).toBe(0);
    expect(plugin.heartBalloonColorIndex).toBe(0);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand plugins/emoji-rain/test/heart-balloons.test.js`

Expected: FAIL because `handleHeartBalloonStreamSession` is not defined.

- [ ] **Step 3: Write minimal implementation**

After the constructor's `heartBalloonPalette` declaration, add:

```js
    this.heartBalloonColorPool = this.createHeartBalloonColorPool();
    this.lastHeartBalloonStreamIdentity = null;
```

Replace the existing `getHeartBalloonColor` block with:

```js
  createHeartBalloonColorPool() {
    const pool = [...this.heartBalloonPalette];
    for (let index = pool.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
    }
    return pool;
  }

  handleHeartBalloonStreamSession(data = {}, { requireIsNewStream = false } = {}) {
    if (data.isNewStream === false || (requireIsNewStream && data.isNewStream !== true)) {
      return false;
    }

    const streamIdentity = data.streamIdentity || (
      data.username && data.roomId
        ? `\${String(data.username).toLowerCase()}:\${data.roomId}`
        : null
    );
    if (!streamIdentity || streamIdentity === this.lastHeartBalloonStreamIdentity) {
      return false;
    }

    this.heartBalloonUserColors.clear();
    this.heartBalloonColorPool = this.createHeartBalloonColorPool();
    this.heartBalloonColorIndex = 0;
    this.lastHeartBalloonStreamIdentity = streamIdentity;
    return true;
  }

  getHeartBalloonColor(username) {
    const key = String(username || 'Unknown').toLowerCase();
    if (this.heartBalloonUserColors.has(key)) {
      return this.heartBalloonUserColors.get(key);
    }

    const color = this.heartBalloonColorPool[
      this.heartBalloonColorIndex % this.heartBalloonColorPool.length
    ];
    this.heartBalloonColorIndex++;
    this.heartBalloonUserColors.set(key, color);
    return color;
  }
```

At the start of `registerTikTokEventHandlers()`, register:

```js
    this.api.registerTikTokEvent('streamSessionStarted', (data) => {
      this.handleHeartBalloonStreamSession(data);
    });
    this.api.registerTikTokEvent('connected', (data) => {
      this.handleHeartBalloonStreamSession(data, { requireIsNewStream: true });
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand plugins/emoji-rain/test/heart-balloons.test.js`

Expected: PASS with all classic heart-balloon tests green.

- [ ] **Step 5: Commit**

```bash
git add app/plugins/emoji-rain/main.js app/plugins/emoji-rain/test/heart-balloons.test.js
git commit -m "feat: rotate emoji rain heart colors per stream"
```

### Task 2: Mirror the color rotation in WebGPU EmojiRain

**Files:**
- Modify: `app/plugins/webgpu-emoji-rain/test/heart-balloons.test.js`
- Modify: `app/plugins/webgpu-emoji-rain/main.js:112-124,780-790,2438-2470`

**Interfaces:**
- Consumes: TikTok lifecycle payload `{ streamIdentity, username, roomId, isNewStream }`.
- Produces: `handleHeartBalloonStreamSession(data, options)`; WebGPU `heart-balloons` socket messages retain their existing `heartColor` field.

- [ ] **Step 1: Write the failing regression tests**

Add these tests after `assigns a stable heart color per user` in `app/plugins/webgpu-emoji-rain/test/heart-balloons.test.js`:

```js
  test('shuffles every heart color and uses each before repeating within a stream', () => {
    const random = jest.spyOn(Math, 'random').mockReturnValue(0);
    const plugin = new WebGPUEmojiRainPlugin(new MockAPI());
    random.mockRestore();
    const colors = plugin.heartBalloonPalette.map((_, index) =>
      plugin.getHeartBalloonColor(`viewer-${index}`)
    );

    expect(plugin.heartBalloonColorPool).toEqual(expect.any(Array));
    expect(plugin.heartBalloonColorPool).not.toEqual(plugin.heartBalloonPalette);
    expect(new Set(colors).size).toBe(plugin.heartBalloonPalette.length);
    expect(plugin.getHeartBalloonColor('viewer-after-palette')).toBe(colors[0]);
  });

  test('resets user colors only for a confirmed new stream session', () => {
    const plugin = new WebGPUEmojiRainPlugin(new MockAPI());
    const firstColor = plugin.getHeartBalloonColor('viewer-one');

    expect(plugin.handleHeartBalloonStreamSession({
      streamIdentity: 'streamer:room-1',
      isNewStream: false
    })).toBe(false);
    expect(plugin.getHeartBalloonColor('viewer-one')).toBe(firstColor);

    expect(plugin.handleHeartBalloonStreamSession({
      streamIdentity: 'streamer:room-2'
    })).toBe(true);
    expect(plugin.heartBalloonUserColors.size).toBe(0);
    expect(plugin.heartBalloonColorIndex).toBe(0);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand plugins/webgpu-emoji-rain/test/heart-balloons.test.js`

Expected: FAIL because `handleHeartBalloonStreamSession` is not defined.

- [ ] **Step 3: Write minimal implementation**

After the constructor's `heartBalloonPalette` declaration, add:

```js
    this.heartBalloonColorPool = this.createHeartBalloonColorPool();
    this.lastHeartBalloonStreamIdentity = null;
```

Replace the existing `getHeartBalloonColor` block with:

```js
  createHeartBalloonColorPool() {
    const pool = [...this.heartBalloonPalette];
    for (let index = pool.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
    }
    return pool;
  }

  handleHeartBalloonStreamSession(data = {}, { requireIsNewStream = false } = {}) {
    if (data.isNewStream === false || (requireIsNewStream && data.isNewStream !== true)) {
      return false;
    }

    const streamIdentity = data.streamIdentity || (
      data.username && data.roomId
        ? `\${String(data.username).toLowerCase()}:\${data.roomId}`
        : null
    );
    if (!streamIdentity || streamIdentity === this.lastHeartBalloonStreamIdentity) {
      return false;
    }

    this.heartBalloonUserColors.clear();
    this.heartBalloonColorPool = this.createHeartBalloonColorPool();
    this.heartBalloonColorIndex = 0;
    this.lastHeartBalloonStreamIdentity = streamIdentity;
    return true;
  }

  getHeartBalloonColor(username) {
    const key = String(username || 'Unknown').toLowerCase();
    if (this.heartBalloonUserColors.has(key)) {
      return this.heartBalloonUserColors.get(key);
    }

    const color = this.heartBalloonColorPool[
      this.heartBalloonColorIndex % this.heartBalloonColorPool.length
    ];
    this.heartBalloonColorIndex++;
    this.heartBalloonUserColors.set(key, color);
    return color;
  }
```

At the start of `registerTikTokEventHandlers()`, register:

```js
    this.api.registerTikTokEvent('streamSessionStarted', (data) => {
      this.handleHeartBalloonStreamSession(data);
    });
    this.api.registerTikTokEvent('connected', (data) => {
      this.handleHeartBalloonStreamSession(data, { requireIsNewStream: true });
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand plugins/webgpu-emoji-rain/test/heart-balloons.test.js`

Expected: PASS with all WebGPU heart-balloon tests green.

- [ ] **Step 5: Commit**

```bash
git add app/plugins/webgpu-emoji-rain/main.js app/plugins/webgpu-emoji-rain/test/heart-balloons.test.js
git commit -m "feat: rotate webgpu emoji rain heart colors per stream"
```

### Task 3: Verify parity and repository hygiene

**Files:**
- Verify: `app/plugins/emoji-rain/main.js`
- Verify: `app/plugins/webgpu-emoji-rain/main.js`
- Verify: both `heart-balloons.test.js` files

**Interfaces:**
- Consumes: completed Tasks 1 and 2.
- Produces: verified parity between the standard and WebGPU implementations.

- [ ] **Step 1: Run both focused regression suites together**

Run: `npm test -- --runInBand plugins/emoji-rain/test/heart-balloons.test.js plugins/webgpu-emoji-rain/test/heart-balloons.test.js`

Expected: PASS with zero failing tests.

- [ ] **Step 2: Check touched files for syntax and whitespace errors**

Run:

```bash
node --check plugins/emoji-rain/main.js
node --check plugins/webgpu-emoji-rain/main.js
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 3: Inspect final scope before handoff**

Run: `git status --short && git diff --check`

Expected: only the two plugin implementations and their focused tests are included in the feature commits; unrelated existing workspace changes remain untouched.
