# AnimazingPal Production Defaults Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make fresh AnimazingPal installations start with one consistent, safe 24/7 AI-host configuration while preserving every explicit value and secret in existing installations.

**Architecture:** `buildLiveHostDefaults()` remains the canonical builder for nested live-host settings; `getDefaultConfig()` composes those settings into the plugin-level production profile. Tests lock plugin defaults, live-host defaults, migrations, resets, presets and UI labels together so static UI values cannot drift from backend behavior.

**Tech Stack:** CommonJS JavaScript, Express-style plugin routes, Jest/jsdom, Tailwind CSS, ESLint.

---

## File Structure

- Modify `app/plugins/animazingpal/brain/live-host-config.js`: canonical nested defaults, event-specific defaults, migration and production preset.
- Modify `app/plugins/animazingpal/main.js`: plugin/Animaze defaults, legacy event-action safety, personality and migration behavior.
- Modify `app/plugins/animazingpal/live-host-ui.js`: production-preset labels and required-setup guidance.
- Modify `app/plugins/animazingpal/ui.html`: connection defaults and removal of visible ChatPal controls.
- Modify `app/plugins/animazingpal/ui.js`: remove ChatPal UI bindings and align static fallbacks.
- Modify `app/test/animazingpal-live-host-config.test.js`: nested default snapshot, event matrix, migration and preset tests.
- Modify `app/test/animazingpal-live-host-integration.test.js`: plugin-level defaults, reset, memory isolation and action safety tests.
- Modify `app/test/animazingpal-live-host-ui.test.js`: UI/default coverage and ChatPal absence tests.

### Task 1: Lock the production profile with failing tests

**Files:**
- Modify: `app/test/animazingpal-live-host-config.test.js`
- Modify: `app/test/animazingpal-live-host-integration.test.js`

- [ ] **Step 1: Write the failing plugin-default test**

Add a test that instantiates the prototype and asserts the production connection/brain profile:

```js
test('fresh installs use the canonical 24/7 production profile', () => {
  const plugin = Object.create(AnimazingPalPlugin.prototype);
  const defaults = plugin.getDefaultConfig();

  expect(defaults).toEqual(expect.objectContaining({
    enabled: true,
    host: '127.0.0.1',
    port: 9000,
    autoConnect: true,
    reconnectOnDisconnect: true,
    reconnectDelay: 5000,
    maxReconnectAttempts: 0,
    connectionTimeoutMs: 10000
  }));
  expect(defaults.platform.profiles.animaze).toEqual(expect.objectContaining({
    host: '127.0.0.1', port: 9000, autoConnect: true,
    reconnectOnDisconnect: true, maxReconnectAttempts: 0
  }));
  expect(defaults.brain).toEqual(expect.objectContaining({
    enabled: true,
    standaloneMode: false,
    forceTtsOnlyOnActions: false,
    activePersonality: 'entertainer'
  }));
  expect(defaults.brain.liveHost.enabled).toBe(true);
  expect(defaults.chatToAvatar.enabled).toBe(false);
});
```

- [ ] **Step 2: Write the failing nested-default test**

```js
test('live-host defaults are production-ready except for installation-specific values', () => {
  const defaults = buildLiveHostDefaults();

  expect(defaults).toEqual(expect.objectContaining({
    enabled: true,
    provider: 'ollama',
    source: expect.objectContaining({
      username: '', autoConnect: true, watchdogIntervalMs: 30000,
      eventStaleMs: 300000, reconnectOnEventStale: true
    }),
    response: expect.objectContaining({
      decisionMode: 'auto', minDecisionScore: 0.55,
      maxResponsesPerMinute: 4, chatProbability: 0.1, maxSentences: 2
    }),
    tts: expect.objectContaining({
      enabled: true, engine: 'fishaudio', voiceId: '', streaming: true,
      volume: 80, fallbackBehavior: 'silent'
    }),
    audio: expect.objectContaining({
      outputDeviceId: '', monitoringEnabled: false, missingDeviceBehavior: 'mute'
    }),
    viewerMemory: expect.objectContaining({ streamerId: '', enabled: true, writeMemories: true })
  }));
  expect(defaults.providers.ollama).toEqual(expect.objectContaining({
    baseUrl: 'https://ollama.com', model: 'nemotron-3-nano:30b-cloud',
    timeoutMs: 30000, maxRetries: 2, retryBackoffMs: 1000, thinking: true
  }));
});
```

- [ ] **Step 3: Run RED tests**

Run:

```powershell
cd app
npm test -- --runInBand test/animazingpal-live-host-config.test.js test/animazingpal-live-host-integration.test.js
```

Expected: FAIL on disabled plugin/live host, port `8008`, provider `openai`, finite reconnect limit and `viewerMemory.streamerId === 'default'`.

- [ ] **Step 4: Commit test-only RED state only if the repository policy permits red commits; otherwise keep it uncommitted for Task 2**

No production file changes occur in this task.

### Task 2: Implement canonical plugin and live-host defaults

**Files:**
- Modify: `app/plugins/animazingpal/brain/live-host-config.js`
- Modify: `app/plugins/animazingpal/main.js`
- Test: `app/test/animazingpal-live-host-config.test.js`
- Test: `app/test/animazingpal-live-host-integration.test.js`

- [ ] **Step 1: Replace generic event creation with explicit event defaults**

Build event defaults from a common base plus this matrix:

```js
const EVENT_DEFAULT_OVERRIDES = {
  chat: { enabled: true, brainEnabled: true, avatarActionEnabled: true, priority: 40, cooldownMs: 3000 },
  gift: { enabled: true, brainEnabled: true, avatarActionEnabled: true, priority: 100, cooldownMs: 1000, minQuantity: 1 },
  follow: { enabled: true, brainEnabled: true, avatarActionEnabled: true, priority: 70, cooldownMs: 3000 },
  share: { enabled: true, brainEnabled: true, avatarActionEnabled: true, priority: 65, cooldownMs: 3000 },
  like: { enabled: true, brainEnabled: false, avatarActionEnabled: true, priority: 20, cooldownMs: 5000, minLikes: 10 },
  subscribe: { enabled: true, brainEnabled: true, avatarActionEnabled: true, priority: 90, cooldownMs: 3000 },
  join: { enabled: false, brainEnabled: false, avatarActionEnabled: false, priority: 10, cooldownMs: 5000 }
};

function buildEventDefaults(type) {
  return { ...eventDefaults(false), ...EVENT_DEFAULT_OVERRIDES[type] };
}
```

Set `events` with `Object.fromEntries(EVENT_TYPES.map(type => [type, buildEventDefaults(type)]))`.

- [ ] **Step 2: Apply the approved live-host values**

Change `buildLiveHostDefaults()` to use:

```js
enabled: true,
provider: 'ollama',
source: {
  username: '', readOnly: true, autoConnect: true,
  watchdogIntervalMs: 30000, eventStaleMs: 300000,
  reconnectOnEventStale: true
},
response: {
  decisionMode: 'auto', minDecisionScore: 0.55,
  maxResponsesPerMinute: 4, chatProbability: 0.1,
  maxSentences: 2, maxCharacters: 500,
  language: 'de', systemPrompt: '', cacheEnabled: true,
  cacheTtlMs: 300000, contextMessages: 10,
  queueLimit: 50, queueWarnRatio: 0.8,
  queuePolicy: 'drop-lowest', speakCooldownMs: 3000,
  silenceWarnAfterEvents: 5
},
viewerMemory: {
  enabled: true, streamerId: '', maxMemories: 20,
  minimumImportance: 0.25, writeMemories: true,
  includeInsights: true, includeGiftHistory: true,
  allowedProfileFields: [
    'display_name', 'language', 'tags', 'is_vip', 'vip_tier',
    'total_visits', 'total_comments', 'total_gifts_sent', 'total_coins_spent'
  ]
}
```

Retain the already approved TTS, audio, privacy, avatar switch, idle motion and diagnostics values from the design spec.

- [ ] **Step 3: Apply plugin-level production values**

In `getDefaultConfig()` set both the active Animaze profile and legacy mirrors to port `9000`, unlimited reconnects, and enabled state:

```js
enabled: true,
// platform.profiles.animaze
host: '127.0.0.1',
port: 9000,
autoConnect: true,
reconnectOnDisconnect: true,
reconnectDelay: 5000,
maxReconnectAttempts: 0,
connectionTimeoutMs: 10000,
```

Set brain defaults to:

```js
enabled: true,
standaloneMode: false,
forceTtsOnlyOnActions: false,
activePersonality: 'entertainer',
maxResponsesPerMinute: 4,
chatResponseProbability: 0.1,
liveHost: buildLiveHostDefaults()
```

Keep `chatToAvatar.enabled` false.

- [ ] **Step 4: Make legacy event-action defaults data-driven-safe**

For new defaults and `normalizeStandaloneEventActions()`, remove fixed indices/names by using null values while preserving event enablement:

```js
follow: { enabled: true, actionType: 'specialAction', actionValue: null, chatMessage: null, useEcho: null },
share: { enabled: true, actionType: 'specialAction', actionValue: null, chatMessage: null, useEcho: null },
subscribe: { enabled: true, actionType: 'emote', actionValue: null, chatMessage: null, useEcho: null },
like: { enabled: true, actionType: 'emote', actionValue: null, chatMessage: null, useEcho: null, threshold: 10 },
gift: { enabled: true, actionType: 'emote', actionValue: null, chatMessage: null, useEcho: null },
chat: { enabled: true, actionType: 'idle', actionValue: null, chatMessage: null, useEcho: null }
```

The enabled live-host path continues to call `selectSituationalAvatarAction()` against real Animaze inventory.

- [ ] **Step 5: Run GREEN tests**

Run the Task 1 command. Expected: both suites PASS.

- [ ] **Step 6: Commit**

```powershell
git add app/plugins/animazingpal/brain/live-host-config.js app/plugins/animazingpal/main.js app/test/animazingpal-live-host-config.test.js app/test/animazingpal-live-host-integration.test.js
git commit -m "feat(animazingpal): establish production host defaults"
```

### Task 3: Preserve existing installations and align reset/preset behavior

**Files:**
- Modify: `app/test/animazingpal-live-host-config.test.js`
- Modify: `app/test/animazingpal-live-host-integration.test.js`
- Modify: `app/plugins/animazingpal/brain/live-host-config.js`
- Modify: `app/plugins/animazingpal/main.js`

- [ ] **Step 1: Write failing migration and preset tests**

```js
test('normalization preserves every explicit existing value over production defaults', () => {
  const configured = normalizeLiveHostConfig({
    enabled: false,
    provider: 'gemini',
    source: { autoConnect: false, username: 'saved-stream' },
    response: { maxResponsesPerMinute: 17 },
    audio: { outputDeviceId: 'saved-cable' },
    tts: { voiceId: 'saved-fish' },
    viewerMemory: { streamerId: 'saved-profile' }
  });

  expect(configured).toEqual(expect.objectContaining({ enabled: false, provider: 'gemini' }));
  expect(configured.source).toEqual(expect.objectContaining({ autoConnect: false, username: 'saved-stream' }));
  expect(configured.response.maxResponsesPerMinute).toBe(17);
  expect(configured.audio.outputDeviceId).toBe('saved-cable');
  expect(configured.tts.voiceId).toBe('saved-fish');
  expect(configured.viewerMemory.streamerId).toBe('saved-profile');
});

test('production preset applies canonical editable values without clearing secrets', () => {
  const current = normalizeLiveHostConfig({
    providers: { ollama: { apiKey: 'saved-secret' } },
    tts: { voiceId: 'saved-fish' },
    audio: { outputDeviceId: 'saved-cable' },
    source: { username: 'saved-stream' }
  });
  const configured = applyLiveHostPreset(current, 'production-24-7');

  expect(configured.providers.ollama.apiKey).toBe('saved-secret');
  expect(configured.tts.voiceId).toBe('saved-fish');
  expect(configured.audio.outputDeviceId).toBe('saved-cable');
  expect(configured.source.username).toBe('saved-stream');
  expect(configured.provider).toBe('ollama');
  expect(configured.enabled).toBe(true);
});
```

Add a route test that resets one section and confirms unrelated source/voice/device/secret fields remain unchanged.

- [ ] **Step 2: Run RED tests**

Expected: the new preset key is rejected and section-reset assertions expose any drift.

- [ ] **Step 3: Implement production preset compatibility**

Allow both `production-24-7` and legacy `safe-live` to apply the canonical production patch. Preserve source username, TTS voice, audio device and provider keys by merging over the current normalized configuration and using existing secret merge behavior.

- [ ] **Step 4: Ensure source connection derives the memory namespace**

Keep the existing connect behavior:

```js
this.config.brain.liveHost.viewerMemory.streamerId = username;
this.brainEngine?.setStreamerId(username);
```

Add an assertion that no `default` or unrelated profile is used.

- [ ] **Step 5: Run GREEN tests and commit**

```powershell
cd app
npm test -- --runInBand test/animazingpal-live-host-config.test.js test/animazingpal-live-host-integration.test.js
cd ..
git add app/plugins/animazingpal/brain/live-host-config.js app/plugins/animazingpal/main.js app/test/animazingpal-live-host-config.test.js app/test/animazingpal-live-host-integration.test.js
git commit -m "fix(animazingpal): preserve configured production setup"
```

### Task 4: Remove visible ChatPal controls and align the UI

**Files:**
- Modify: `app/test/animazingpal-live-host-ui.test.js`
- Modify: `app/plugins/animazingpal/ui.html`
- Modify: `app/plugins/animazingpal/ui.js`
- Modify: `app/plugins/animazingpal/live-host-ui.js`

- [ ] **Step 1: Write failing UI tests**

```js
test('standalone production UI has no visible ChatPal controls', () => {
  expect(html).not.toContain('id="chatpalMessage"');
  expect(html).not.toContain('data-action="send-chatpal"');
  expect(html).not.toContain('TikTok Chat an ChatPal weiterleiten');
  expect(uiScript).not.toContain("querySelector('[data-action=\"send-chatpal\"]')");
});

test('UI presents the canonical production setup', () => {
  expect(html).toContain('id="settingsPort" value="9000"');
  expect(html).toContain('0 = unbegrenzt');
  expect(script).toContain('24/7 Produktionsprofil');
  expect(script).toContain('Pflicht-Setup');
  expect(script).toContain("data-preset=\"production-24-7\"");
});
```

- [ ] **Step 2: Run RED UI test**

```powershell
cd app
npm test -- --runInBand test/animazingpal-live-host-ui.test.js
```

Expected: FAIL because manual ChatPal controls and stale labels remain.

- [ ] **Step 3: Remove the visible legacy controls and dead bindings**

Delete the manual ChatPal card and forwarding controls from `ui.html`. Remove DOM listeners/functions that exist only for those deleted controls from `ui.js`. Retain backend parsing for old stored configs, but do not expose or activate it in the production UI.

Rename historical `ChatPal Nachricht (optional)` event labels to `Fallback-/Aktionsnachricht (optional)` so event-action templates remain understandable without implying ChatPal.

- [ ] **Step 4: Align UI fallbacks and production controls**

Use port `9000` and reconnect limit `0` as JavaScript fallbacks. Rename the live-host preset button to `24/7 Produktionsprofil`, send `production-24-7`, and add required-setup text for TikTok channel, Fish voice and CABLE output.

- [ ] **Step 5: Run GREEN UI test and commit**

```powershell
cd app
npm test -- --runInBand test/animazingpal-live-host-ui.test.js
cd ..
git add app/plugins/animazingpal/ui.html app/plugins/animazingpal/ui.js app/plugins/animazingpal/live-host-ui.js app/test/animazingpal-live-host-ui.test.js
git commit -m "refactor(animazingpal): remove visible ChatPal workflow"
```

### Task 5: Add exhaustive default/UI coverage

**Files:**
- Modify: `app/test/animazingpal-live-host-config.test.js`
- Modify: `app/test/animazingpal-live-host-ui.test.js`

- [ ] **Step 1: Add the event-matrix test**

Assert every event's `enabled`, `brainEnabled`, `avatarActionEnabled`, `priority`, `cooldownMs`, `minLikes` and `minQuantity` against the approved table. Also assert `templateEnabled === false`, empty event voice IDs, and no non-null legacy action values in fresh plugin defaults.

- [ ] **Step 2: Add UI path coverage**

Extract every literal `input('path'` and `textarea('path'` from `live-host-ui.js`. Traverse `buildLiveHostDefaults()` into leaf paths and assert every editable scalar path is represented, excluding documented computed/internal fields:

```js
const INTERNAL_PATHS = new Set([
  'source.readOnly', 'providers.openai.apiKey', 'providers.gemini.apiKey',
  'providers.openrouter.apiKey', 'providers.ollama.apiKey',
  'tts.engine', 'audio.outputDeviceLabel', 'viewerMemory.allowedProfileFields',
  'avatarBundles', 'activeAvatarBundleId'
]);
```

Dynamic provider and event fields must be checked through their renderer templates (`providerCard` and `eventCard`) rather than requiring fully expanded literal paths.

- [ ] **Step 3: Add boundary coverage for all newly changed numeric defaults**

Test port, reconnect attempts, source watchdog, event cooldowns/priorities/minimums, response limits, TTS values, memory limits, idle motion and diagnostics. Invalid input must normalize to the documented min/max/fallback.

- [ ] **Step 4: Run RED/GREEN cycle**

If the coverage tests reveal a missing UI field or normalization rule, first retain the failing assertion, then add the smallest production change, and rerun the focused suite.

- [ ] **Step 5: Commit**

```powershell
git add app/test/animazingpal-live-host-config.test.js app/test/animazingpal-live-host-ui.test.js app/plugins/animazingpal/brain/live-host-config.js app/plugins/animazingpal/live-host-ui.js
git commit -m "test(animazingpal): enforce complete production defaults"
```

### Task 6: Full verification and browser acceptance

**Files:**
- Verify all modified files above.

- [ ] **Step 1: Run all AnimazingPal tests**

```powershell
cd app
npm test -- --runInBand test/animazingpal-live-host-config.test.js test/animazingpal-live-host-ui.test.js test/animazingpal-live-host-integration.test.js
```

Expected: all suites PASS with zero failures.

- [ ] **Step 2: Run repository verification**

```powershell
npm run lint -- --quiet
npm run build:css
```

Expected: both commands exit `0`; the known Browserslist database-age notice is informational.

- [ ] **Step 3: Inspect scoped changes**

```powershell
cd ..
git diff --check -- app/plugins/animazingpal app/test/animazingpal-live-host-config.test.js app/test/animazingpal-live-host-ui.test.js app/test/animazingpal-live-host-integration.test.js
git status --short -- app/plugins/animazingpal app/test/animazingpal-live-host-config.test.js app/test/animazingpal-live-host-ui.test.js app/test/animazingpal-live-host-integration.test.js
```

Expected: no scoped whitespace errors and only intentional files before the final commit.

- [ ] **Step 4: Perform in-app browser acceptance at `http://127.0.0.1:3000/animazingpal/ui`**

Verify:

- connection UI shows port `9000` and `0 = unbegrenzt`;
- no visible ChatPal controls remain;
- Live Host shows `24/7 Produktionsprofil`;
- defaults render for Ollama, auto decision, events, TTS, memory, motion and diagnostics;
- TikTok channel, Fish voice and CABLE output are clearly marked as required;
- preset and section reset retain configured key/voice/device/channel;
- preflight reports concrete blockers rather than false readiness.

- [ ] **Step 5: Final scoped commit**

```powershell
git add app/plugins/animazingpal app/test/animazingpal-live-host-config.test.js app/test/animazingpal-live-host-ui.test.js app/test/animazingpal-live-host-integration.test.js
git commit -m "feat(animazingpal): ship complete 24/7 defaults"
```

Do not stage unrelated dirty-worktree files.
