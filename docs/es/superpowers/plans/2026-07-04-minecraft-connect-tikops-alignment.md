# Minecraft Connect TikOps Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh LTTH's Minecraft Connect plugin to match TikOps' stronger product UX while keeping LTTH's deeper bridge, mapping, and safety architecture.

**Architecture:** Reframe the plugin UI around four product areas: Commands, Chat, Gift bars, and Setup. Keep the existing WebSocket bridge, queue, and action mapper, but extend config persistence so theme selection and the new UI sections survive restarts.

**Tech Stack:** CommonJS, vanilla browser JavaScript, CSS custom properties, existing LTTH plugin routes and Socket.IO events.

---

### Task 1: Add theme and product-section state

**Files:**
- Modify: `app/plugins/minecraft-connect/main.js`
- Modify: `app/plugins/minecraft-connect/plugin.json`

- [ ] **Step 1: Extend the default config object with `ui.theme`, `chat`, and `giftBars` state**

```js
ui: {
  theme: 'aurora-2'
},
chat: {
  enabled: false,
  mode: 'relay',
  filters: [],
  relayTargets: []
},
giftBars: {
  enabled: false,
  goals: []
}
```

- [ ] **Step 2: Add a dashboard state route that returns status, mappings, events, and config in one payload**

```js
this.api.registerRoute('GET', '/api/minecraft-connect/dashboard', async (req, res) => {
  res.json({ success: true, dashboard: this.getDashboardState() });
});
```

- [ ] **Step 3: Merge nested config updates when saving settings so `ui`, `chat`, and `giftBars` do not get dropped**

```js
this.config = {
  ...this.config,
  ...updates,
  ui: { ...this.config.ui, ...(updates.ui || {}) },
  chat: { ...this.config.chat, ...(updates.chat || {}) },
  giftBars: { ...this.config.giftBars, ...(updates.giftBars || {}) }
};
```

- [ ] **Step 4: Add `getDashboardState()` to centralize the payload for the refreshed UI**

```js
getDashboardState() {
  return {
    config: this.config,
    status: {
      connectionStatus: this.connectionStatus,
      isConnected: this.wsServer.isConnected(),
      availableActions: this.availableActions,
      stats: this.stats,
      queueStatus: this.commandQueue.getStatus()
    },
    mappings: this.actionMapper.getMappings(),
    events: this.eventLog
  };
}
```

- [ ] **Step 5: Keep the feature metadata in `plugin.json` aligned with the new product sections**

```json
"features": [
  { "id": "websocket-bridge", "name": "WebSocket Bridge Server", "description": "Local WebSocket server for communication with Minecraft mod" },
  { "id": "event-mapping", "name": "TikTok Event Mapping", "description": "Map TikTok events to Commands, Chat, and Gift bars" },
  { "id": "dashboard-ui", "name": "Dashboard UI", "description": "TikOps-style interface for Commands, Chat, Gift bars, and Setup" }
]
```

- [ ] **Step 6: Run the plugin file through a syntax check**

```bash
node --check app/plugins/minecraft-connect/main.js
```

**Expected:** no syntax errors

### Task 2: Rebuild the dashboard UI around TikOps-style sections

**Files:**
- Replace: `app/plugins/minecraft-connect/minecraft-connect.html`
- Replace: `app/plugins/minecraft-connect/minecraft-connect.js`
- Replace: `app/plugins/minecraft-connect/minecraft-connect.css`

- [ ] **Step 1: Replace the old generic tab layout with a product shell**

```html
<header class="mc-hero">...</header>
<nav class="mc-product-tabs">Commands / Chat / Gift bars / Setup</nav>
<main class="mc-shell">...</main>
```

- [ ] **Step 2: Map the Commands tab to the existing mapping engine and present it as TikOps-style command cards**

```js
renderCommandCards(mappings);
```

- [ ] **Step 3: Add a Chat tab that edits relay/filter settings and shows the live chat feed**

```js
renderChatRules(config.chat);
renderChatFeed(events.filter(event => event.type === 'chat'));
```

- [ ] **Step 4: Add a Gift bars tab that edits goals and shows progress bars**

```js
renderGiftBars(config.giftBars);
```

- [ ] **Step 5: Add a Setup tab with connection status, setup checklist, and theme selector**

```js
renderSetupStatus(status);
renderThemeToggle(config.ui.theme);
```

- [ ] **Step 6: Rebuild the CSS around Aurora and Aurora 2.0 theme variables**

```css
:root[data-theme='aurora-2'] { ... }
.mc-glass-card { ... }
```

- [ ] **Step 7: Load the consolidated dashboard payload and save the new config sections**

```js
const state = await fetch('/api/minecraft-connect/dashboard').then(r => r.json());
await fetch('/api/minecraft-connect/config', { method: 'PUT', body: JSON.stringify(config) });
```

- [ ] **Step 8: Verify the dashboard renders and tabs switch without console errors**

```bash
npm run build:css
```

**Expected:** CSS build succeeds and the UI loads cleanly in the browser

### Task 3: Verify and tighten the feature set

**Files:**
- Inspect: `app/plugins/minecraft-connect/helpers/actionMapper.js`
- Inspect: `app/plugins/minecraft-connect/helpers/commandQueue.js`
- Inspect: `app/plugins/minecraft-connect/helpers/minecraftWebSocket.js`

- [ ] **Step 1: Confirm the existing bridge, queue, and action mapper still back the new Commands tab**

```js
this.actionMapper.processEvent(eventType, eventData);
this.commandQueue.enqueue(...);
this.wsServer.sendCommand(action, params);
```

- [ ] **Step 2: Make sure the UI-only additions do not break existing TikTok event handling**

```bash
npm test
```

**Expected:** existing tests remain green or surface only pre-existing failures

- [ ] **Step 3: Commit the aligned feature set**

```bash
git add app/plugins/minecraft-connect docs/superpowers/plans/2026-07-04-minecraft-connect-tikops-alignment.md
git commit -m "feat: align minecraft connect with tikops-style ux"
```
