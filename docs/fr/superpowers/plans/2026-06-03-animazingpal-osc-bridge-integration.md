# AnimazingPal OSC-Bridge Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let AnimazingPal drive VRChat through the existing OSC-Bridge plugin for avatar reactions, chatbox messages, and optional TTS/text flows without making AnimazingPal depend on VRChat directly.

**Architecture:** AnimazingPal emits high-level VRChat intent events on the internal plugin event bus. OSC-Bridge subscribes to those events and maps them to OSC actions such as chatbox messages, emotes, avatar parameters, and PhysBones. AnimazingPal keeps the configuration and event mapping UI; OSC-Bridge keeps the transport and VRChat-specific OSC implementation.

**Tech Stack:** Node.js, CommonJS, Jest, existing LTTH PluginAPI, plugin event bus, OSC-Bridge plugin, Socket.IO/HTTP only where already used by the existing plugins.

---

### Task 1: Define the AnimazingPal-to-VRChat integration contract

**Files:**
- Modify: `app/plugins/animazingpal/main.js`
- Modify: `app/plugins/animazingpal/ui.html`
- Modify: `app/plugins/animazingpal/ui.js`
- Modify: `app/plugins/animazingpal/README.md`
- Modify: `app/plugins/animazingpal/plugin.json`
- Test: `app/test/animazingpal-vrchat-integration.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
const assert = require('assert');
const AnimazingPalPlugin = require('../plugins/animazingpal/main');

test('includes a vrchat integration config block with safe defaults', () => {
  const plugin = new AnimazingPalPlugin(createApiStub());
  const config = plugin.normalizeConfig(plugin.getDefaultConfig());

  assert.strictEqual(config.vrchat.enabled, false);
  assert.strictEqual(config.vrchat.targetPluginId, 'osc-bridge');
  assert.deepStrictEqual(config.vrchat.onEvents.chat.action, 'chatbox');
  assert.deepStrictEqual(config.vrchat.onEvents.gift.action, 'emote');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest test/animazingpal-vrchat-integration.test.js --runInBand`
Expected: FAIL because `vrchat` config does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Add a `vrchat` config block to `getDefaultConfig()`, include it in `normalizeConfig()`, and expose it in `getSafeConfig()` so the UI can edit it and the status endpoint can display it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest test/animazingpal-vrchat-integration.test.js --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/plugins/animazingpal/main.js app/test/animazingpal-vrchat-integration.test.js
git commit -m "feat: add animazingpal vrchat integration config"
```

### Task 2: Emit VRChat intent events from AnimazingPal event handlers

**Files:**
- Modify: `app/plugins/animazingpal/main.js`
- Test: `app/test/animazingpal-vrchat-integration.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
test('emits a vrchat intent for chat responses and gift reactions', async () => {
  const api = createApiStub();
  const plugin = new AnimazingPalPlugin(api);
  plugin.config = plugin.normalizeConfig({
    enabled: true,
    vrchat: {
      enabled: true,
      targetPluginId: 'osc-bridge',
      forwardChatToChatbox: true
    }
  });
  plugin.isConnected = true;
  plugin.brainEngine = { storeMemory() {}, processChat: async () => ({ text: 'hello', emotion: 'happy' }) };
  const events = [];
  api.onEmit = (event, data) => events.push({ event, data });

  await plugin.handleChatEvent({ uniqueId: 'viewer1', comment: 'hi', nickname: 'Viewer One' });

  assert.ok(events.some((entry) => entry.event === 'animazingpal:vrchat-intent'));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest test/animazingpal-vrchat-integration.test.js --runInBand`
Expected: FAIL because no VRChat intent event is emitted yet.

- [ ] **Step 3: Write the minimal implementation**

Add one helper in `main.js` that builds VRChat intent payloads and emits them from chat, gift, follow, share, subscribe, and brain-response flows when `vrchat.enabled` is true.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest test/animazingpal-vrchat-integration.test.js --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/plugins/animazingpal/main.js app/test/animazingpal-vrchat-integration.test.js
git commit -m "feat: emit vrchat intent events from animazingpal"
```

### Task 3: Teach OSC-Bridge to consume AnimazingPal intents

**Files:**
- Modify: `app/plugins/osc-bridge/main.js`
- Test: `app/plugins/osc-bridge/test/animazingpal-intents.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
test('handles animazingpal vrchat intent events', () => {
  const bridge = new OscBridgePlugin(createApiStub());
  const sent = [];
  bridge.send = (address, ...args) => {
    sent.push({ address, args });
    return true;
  };

  bridge.handleAnimazingPalIntent({
    type: 'chat',
    message: 'Hello VRChat!',
    chatbox: true
  });

  assert.ok(sent.length > 0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest plugins/osc-bridge/test/animazingpal-intents.test.js --runInBand`
Expected: FAIL because the handler does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Add a plugin-bus listener such as `this.api.on('animazingpal:vrchat-intent', ...)` and route intents to existing OSC-Bridge methods: `chatbox/send`, `vrchat/emote`, `send`, `expressions/trigger`, and optional avatar or physbone helpers.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest plugins/osc-bridge/test/animazingpal-intents.test.js --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/plugins/osc-bridge/main.js app/plugins/osc-bridge/test/animazingpal-intents.test.js
git commit -m "feat: consume animazingpal vrchat intents in osc bridge"
```

### Task 4: Expose VRChat controls in the AnimazingPal UI and document the flow

**Files:**
- Modify: `app/plugins/animazingpal/ui.html`
- Modify: `app/plugins/animazingpal/ui.js`
- Modify: `app/plugins/animazingpal/README.md`
- Modify: `docs/animazingpal-viewerbase.md`
- Add: `docs/animazingpal-vrchat-integration.md`

- [ ] **Step 1: Write the failing test**

```javascript
test('renders vrchat integration fields and event mappings in safe config', () => {
  const plugin = new AnimazingPalPlugin(createApiStub());
  plugin.config = plugin.normalizeConfig(plugin.getDefaultConfig());
  const safeConfig = plugin.getSafeConfig();

  assert.ok(safeConfig.vrchat);
  assert.ok(Array.isArray(safeConfig.vrchat.onEvents.chat.actions));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest test/animazingpal-vrchat-integration.test.js --runInBand`
Expected: FAIL until the UI/config bindings exist.

- [ ] **Step 3: Write the minimal implementation**

Add a VRChat settings section with event mapping dropdowns, chatbox toggle, and bridge target selection. Document the flow in `docs/animazingpal-vrchat-integration.md` and link it from the plugin README.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest test/animazingpal-vrchat-integration.test.js --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/plugins/animazingpal/ui.html app/plugins/animazingpal/ui.js app/plugins/animazingpal/README.md docs/animazingpal-viewerbase.md docs/animazingpal-vrchat-integration.md
git commit -m "feat: add vrchat integration ui and docs"
```

### Task 5: Verify the full integration path

**Files:**
- Modify: none
- Test: `app/test/animazingpal-vrchat-integration.test.js`

- [ ] **Step 1: Run the focused test suite**

Run: `npx jest test/animazingpal-vrchat-integration.test.js --runInBand`
Expected: PASS.

- [ ] **Step 2: Run syntax checks**

Run: `node --check app/plugins/animazingpal/main.js`
Run: `node --check app/plugins/osc-bridge/main.js`
Run: `node --check app/plugins/animazingpal/ui.js`

- [ ] **Step 3: Run lint on changed files**

Run: `npx eslint plugins/animazingpal/main.js plugins/animazingpal/ui.js plugins/osc-bridge/main.js`
Expected: no lint errors.

- [ ] **Step 4: Commit**

```bash
git add app/plugins/animazingpal/main.js app/plugins/animazingpal/ui.html app/plugins/animazingpal/ui.js app/plugins/animazingpal/README.md app/plugins/osc-bridge/main.js docs/animazingpal-vrchat-integration.md app/test/animazingpal-vrchat-integration.test.js
git commit -m "feat: wire animazingpal to vrchat via osc bridge"
```
