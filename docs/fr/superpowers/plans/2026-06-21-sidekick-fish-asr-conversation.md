# Sidekick Fish-ASR Conversation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-safe Sidekick mode that hears the human host through Fish.audio ASR, converses naturally with host and viewers through AnimazingPal Brain and Viewer Profiles, and contains no ChatPal or duplicate Animaze connection.

**Architecture:** Sidekick owns microphone capture, ASR orchestration, relevance selection and conversation scheduling. The TTS plugin owns the Fish secret and exposes a server-side ASR method; AnimazingPal remains the only owner of LLM personality, Viewer Profiles memory, avatar actions, Fish TTS and Animaze. Sidekick activation takes a non-persistent runtime lease on response decisions, so stopping Sidekick always restores Standalone behavior.

**Tech Stack:** CommonJS, Express plugin routes, Multer memory storage, Axios, MessagePack, Fish.audio `POST /v1/asr`, browser `getUserMedia`/Web Audio/MediaRecorder, Jest, existing LTTH plugin API.

---

## File Map

- Create `app/plugins/tts/engines/fish-asr-client.js`: Fish ASR HTTP client with bounded retry/timeout behavior.
- Modify `app/plugins/tts/main.js`: expose `transcribeFishAudio()` without exposing the Fish key.
- Create `app/plugins/sidekick/backend/conversationCoordinator.js`: transcript validation, echo suppression, dedupe, turn history and AnimazingPal dispatch.
- Create `app/plugins/sidekick/host-audio.js`: browser microphone enumeration, VAD and MediaRecorder lifecycle.
- Modify `app/plugins/sidekick/backend/config.js`: normalized, migrated ASR/conversation defaults.
- Modify `app/plugins/sidekick/main.js`: upload route, coordinator wiring, single AnimazingPal connection and delegated event dispatch.
- Modify `app/plugins/sidekick/ui.html`: host-conversation controls, diagnostics and fixed AnimazingPal/Fish output status.
- Delete `app/plugins/sidekick/backend/animazeClient.js`: remove the obsolete ChatPal client.
- Modify `app/plugins/sidekick/plugin.json` and `README.md`: describe the actual architecture.
- Modify `app/plugins/animazingpal/main.js`: delegated Sidekick events, host-speech entrypoint and runtime mode lease.
- Modify `app/plugins/animazingpal/brain/brain-engine.js`: host conversation generation without fake viewer memory.
- Modify `app/plugins/animazingpal/brain/gpt-brain-service.js`: co-host prompt generation using conversation and viewer context.
- Modify `app/plugins/animazingpal/brain/live-host-config.js` and `live-host-ui.js`: expose effective mode without a persistent silent Sidekick state.
- Create `app/test/tts-fish-asr.test.js`, `app/test/sidekick-conversation.test.js`, and `app/test/sidekick-host-audio-ui.test.js`.
- Extend `app/test/sidekick-runtime-contract.test.js`, `app/test/animazingpal-live-host-integration.test.js`, and `app/test/animazingpal-live-host-ui.test.js`.

### Task 1: Normalize Sidekick configuration and migrate legacy ChatPal values

**Files:**
- Modify: `app/plugins/sidekick/backend/config.js`
- Test: `app/test/sidekick-runtime-contract.test.js`

- [ ] **Step 1: Write failing config tests**

Add tests proving fresh defaults and stored legacy configs normalize to:

```js
expect(config.output).toEqual({ eventType: 'sidekick', username: 'Sidekick' });
expect(config.animaze).toBeUndefined();
expect(config.hostConversation).toEqual(expect.objectContaining({
  enabled: true,
  responseMode: 'auto',
  language: 'de',
  minSegmentMs: 1000,
  maxSegmentMs: 15000,
  endSilenceMs: 700,
  postTtsLockoutMs: 1200,
  echoSimilarity: 0.86,
  dedupeTtlMs: 30000,
  timeoutMs: 30000,
  maxRetries: 2,
  retryBackoffMs: 1000,
  conversationTurns: 8,
  viewerContextItems: 5
}));
```

Also load `{ animaze: { enabled: true }, output: { mode: 'animaze-chatpal' } }` and assert the removed keys are absent from both returned config and the saved migrated config.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `cd app && npm test -- --runInBand test/sidekick-runtime-contract.test.js -t "defaults|migrates"`

Expected: FAIL because `hostConversation` is missing or legacy fields survive.

- [ ] **Step 3: Implement normalization**

Add `normalizeConfig(config)` that clamps numeric limits, normalizes booleans/enums, removes `animaze` and `output.mode`, forces join greetings off by default, and returns a `changed` flag used by `load()` to persist migrations immediately.

```js
const RESPONSE_MODES = ['auto', 'always', 'wake-word'];
const normalized = this._deepMerge(clone(DEFAULT_CONFIG), config || {});
delete normalized.animaze;
delete normalized.output.mode;
normalized.hostConversation.responseMode = RESPONSE_MODES.includes(normalized.hostConversation.responseMode)
  ? normalized.hostConversation.responseMode
  : DEFAULT_CONFIG.hostConversation.responseMode;
```

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- app/plugins/sidekick/backend/config.js app/test/sidekick-runtime-contract.test.js
git commit -m "feat(sidekick): normalize host conversation settings"
```

### Task 2: Add Fish.audio ASR behind the TTS secret boundary

**Files:**
- Create: `app/plugins/tts/engines/fish-asr-client.js`
- Modify: `app/plugins/tts/main.js`
- Create: `app/test/tts-fish-asr.test.js`

- [ ] **Step 1: Write failing Fish ASR client tests**

Mock Axios and assert `FishAsrClient.transcribe()` sends MessagePack to `https://api.fish.audio/v1/asr` with bearer auth, audio bytes, language and `ignore_timestamps: false`. Cover timeout, two retries with configured backoff, 401 without retry, and normalized `{ text, duration, segments }` output.

```js
const result = await client.transcribe(Buffer.from('opus'), {
  language: 'de', timeoutMs: 30000, maxRetries: 2, retryBackoffMs: 1000
});
expect(result).toEqual({
  text: 'Hallo Sidekick', duration: 1.4,
  segments: [{ text: 'Hallo Sidekick', start: 0, end: 1.4 }]
});
```

- [ ] **Step 2: Run and confirm RED**

Run: `cd app && npm test -- --runInBand test/tts-fish-asr.test.js`

Expected: FAIL because the module and plugin method do not exist.

- [ ] **Step 3: Implement `FishAsrClient` and TTS wrapper**

Encode `{ audio, language, ignore_timestamps: false }` with `@msgpack/msgpack`; use Axios `responseType: 'json'`, a bounded timeout and exponential backoff. Add to the TTS plugin:

```js
async transcribeFishAudio(audio, options = {}) {
  if (!Buffer.isBuffer(audio) || audio.length === 0) throw new Error('Audio buffer required');
  if (!this.config.fishaudioApiKey) throw new Error('Fish.audio API key is not configured');
  const client = new FishAsrClient(this.config.fishaudioApiKey, this.logger);
  return client.transcribe(audio, options);
}
```

No status or config response may return the key.

- [ ] **Step 4: Run and confirm GREEN**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- app/plugins/tts/engines/fish-asr-client.js app/plugins/tts/main.js app/test/tts-fish-asr.test.js
git commit -m "feat(tts): add Fish audio speech recognition"
```

### Task 3: Build the conversation coordinator and echo protection

**Files:**
- Create: `app/plugins/sidekick/backend/conversationCoordinator.js`
- Create: `app/test/sidekick-conversation.test.js`

- [ ] **Step 1: Write failing coordinator tests**

Cover normalization, empty/filler rejection, `always`, `auto`, wake-word selection, TTS lockout, similarity against recent spoken text, transcript dedupe, eight-turn trimming, host priority, and error isolation. Use a deterministic clock.

```js
const result = await coordinator.handleTranscript({
  text: 'Sidekick, was hältst du von der Frage im Chat?',
  duration: 2.2,
  receivedAt: now
});
expect(animazingPal.processSidekickHostSpeech).toHaveBeenCalledWith(
  'Sidekick, was hältst du von der Frage im Chat?',
  expect.objectContaining({ hostName: 'Host', conversationHistory: [] })
);
expect(result.responded).toBe(true);
```

- [ ] **Step 2: Run and confirm RED**

Run: `cd app && npm test -- --runInBand test/sidekick-conversation.test.js`

Expected: FAIL because the coordinator is missing.

- [ ] **Step 3: Implement deterministic coordinator**

Expose `handleTranscript`, `recordSpokenText`, `getStatus`, `updateConfig`, and `clear`. Use token-set Jaccard similarity plus normalized exact matching; reject during `isSpeaking` or `postTtsLockoutMs`; retain only configured turns and recent spoken texts. Do not persist the host as a viewer.

- [ ] **Step 4: Run and confirm GREEN**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- app/plugins/sidekick/backend/conversationCoordinator.js app/test/sidekick-conversation.test.js
git commit -m "feat(sidekick): coordinate host conversations safely"
```

### Task 4: Make AnimazingPal the single intelligent response pipeline

**Files:**
- Modify: `app/plugins/animazingpal/main.js`
- Modify: `app/plugins/animazingpal/brain/brain-engine.js`
- Modify: `app/plugins/animazingpal/brain/gpt-brain-service.js`
- Test: `app/test/animazingpal-live-host-integration.test.js`

- [ ] **Step 1: Write failing delegated-event and host-speech tests**

Assert:

1. `processSidekickEvent('chat', data, evaluation)` bypasses the autonomous mode guard but uses Brain, Viewer Profiles and Fish TTS.
2. `processSidekickHostSpeech(text, context)` calls `brainEngine.processHostSpeech`, speaks only a successful response, and does not create a Viewer Profiles record for `Host`.
3. Runtime mode lease blocks autonomous responses only while Sidekick holds it.
4. Successful delegated results return the exact spoken text so Sidekick can seed echo suppression; failed TTS results do not.

```js
await plugin.processSidekickHostSpeech('Was sagt der Chat?', {
  hostName: 'Host',
  conversationHistory: [{ role: 'assistant', content: 'Wir schauen nach.' }],
  viewerMessages: [{ username: 'alice', message: 'Tolles Avatar!' }]
});
expect(brainEngine.processHostSpeech).toHaveBeenCalledWith('Host', 'Was sagt der Chat?', expect.any(Object));
expect(ttsPlugin.speak).toHaveBeenCalledWith(expect.objectContaining({ engine: 'fishaudio' }));
```

- [ ] **Step 2: Run and confirm RED**

Run: `cd app && npm test -- --runInBand test/animazingpal-live-host-integration.test.js -t "sidekick|host speech"`

Expected: at least the host-speech contract fails.

- [ ] **Step 3: Implement Brain host conversation**

Add `BrainEngine.processHostSpeech(hostName, message, options)` that calls a new `gptBrain.generateCoHostResponse()`. The prompt combines personality, bounded conversation history, recent viewer messages and stream events. Store session conversation in AnimazingPal memory but call neither `getOrCreateUserProfile()` nor `viewerMemory.recordMemory()` for the host.

- [ ] **Step 4: Implement AnimazingPal entrypoints and lease**

Use:

```js
processSidekickEvent(eventType, data, evaluation) {
  return this.processLiveHostEvent(eventType, data, { delegated: true, forceRespond: true, evaluation });
}

async processSidekickHostSpeech(text, context) {
  const response = await this.brainEngine.processHostSpeech(context.hostName || 'Host', text, context);
  if (!response?.text) return { handled: true, responded: false };
  const speech = await this.speakHostResponse(response.text, { eventType: 'hostSpeech', username: context.hostName || 'Host' });
  return { handled: true, responded: speech?.success !== false, text: response.text };
}
```

- [ ] **Step 5: Run focused AnimazingPal tests and commit**

Run the command from Step 2. Expected: PASS.

```powershell
git add -- app/plugins/animazingpal/main.js app/plugins/animazingpal/brain/brain-engine.js app/plugins/animazingpal/brain/gpt-brain-service.js app/test/animazingpal-live-host-integration.test.js
git commit -m "feat(animazingpal): generate intelligent sidekick conversations"
```

### Task 5: Remove ChatPal and wire Sidekick runtime

**Files:**
- Modify: `app/plugins/sidekick/main.js`
- Delete: `app/plugins/sidekick/backend/animazeClient.js`
- Modify: `app/plugins/sidekick/plugin.json`
- Modify: `app/plugins/sidekick/README.md`
- Test: `app/test/sidekick-runtime-contract.test.js`

- [ ] **Step 1: Extend failing runtime contract tests**

Assert there is no `AnimazeClient` import or `ChatbotSendMessage`, all connection/status/test routes proxy AnimazingPal, selected Viewer events call `processSidekickEvent`, and stopping Sidekick clears its runtime lease.

- [ ] **Step 2: Run and confirm RED**

Run: `cd app && npm test -- --runInBand test/sidekick-runtime-contract.test.js`

Expected: FAIL while direct client/routes or template dispatch remain.

- [ ] **Step 3: Complete the single-pipeline runtime**

Create `_getAnimazingPal`, `_getAnimazingPalStatus`, `_dispatchSelectedEvent`, `_sendOutput`, and coordinator lifecycle helpers. Proxy `/api/sidekick/animaze/connect`, `disconnect`, `status`, and `test` to AnimazingPal. Delete the direct client and remove its config/update/destroy logic.

When AnimazingPal returns `{ responded: true, text }`, call `conversationCoordinator.recordSpokenText(text)`. For host turns, pass the last configured number of `eventBus.getRecentEvents('chat')` entries as `viewerMessages`, bounded before the Brain call.

- [ ] **Step 4: Route selected events correctly**

Replace every selected chat/gift/follow/share/subscribe template enqueue with:

```js
this._dispatchSelectedEvent(eventType, originalEventData, evaluation).catch(error => {
  this.logger.error(`Sidekick ${eventType} dispatch failed: ${error.message}`);
  this.metrics.recordError();
});
```

Only increment response metrics when AnimazingPal reports `responded: true`.

- [ ] **Step 5: Run tests, scan and commit**

Run:

```powershell
cd app
npm test -- --runInBand test/sidekick-runtime-contract.test.js test/animazingpal-live-host-integration.test.js
rg -n "ChatPal|ChatbotSendMessage|animaze-chatpal|animazeClient" plugins/sidekick
```

Expected: tests PASS and `rg` returns no matches.

```powershell
git add -- app/plugins/sidekick app/test/sidekick-runtime-contract.test.js
git commit -m "refactor(sidekick): remove ChatPal and duplicate Animaze client"
```

### Task 6: Add secure ASR upload and diagnostics routes

**Files:**
- Modify: `app/plugins/sidekick/main.js`
- Test: `app/test/sidekick-conversation.test.js`

- [ ] **Step 1: Write failing route tests**

Register routes on a mock API and exercise the Multer callback. Cover missing audio, disallowed MIME, zero bytes, configured size cap, unavailable TTS plugin, Fish error, successful transcript dispatch, and secret-free status.

- [ ] **Step 2: Run and confirm RED**

Run: `cd app && npm test -- --runInBand test/sidekick-conversation.test.js -t "ASR route|status"`

- [ ] **Step 3: Implement memory-only upload route**

Use `multer.memoryStorage()` with a hard ceiling no larger than 20 MB and the configured lower ceiling. Route `/api/sidekick/stt/transcribe` calls `tts.transcribeFishAudio(req.file.buffer, normalizedOptions)`, then `conversationCoordinator.handleTranscript()`. Never log the audio or Fish key.

- [ ] **Step 4: Add status and test routes**

Expose `/api/sidekick/stt/status`, `/api/sidekick/stt/test-text`, `/api/sidekick/stt/browser-state`, and socket status fields for last ASR latency, transcript, decision, device heartbeat and error. Test text bypasses audio upload but goes through the same coordinator. Browser-state accepts only bounded device/status metadata and never audio or secrets.

- [ ] **Step 5: Run tests and commit**

Run the command from Step 2. Expected: PASS.

```powershell
git add -- app/plugins/sidekick/main.js app/test/sidekick-conversation.test.js
git commit -m "feat(sidekick): add secure Fish ASR routes"
```

### Task 7: Implement browser microphone capture, VAD and UI controls

**Files:**
- Create: `app/plugins/sidekick/host-audio.js`
- Modify: `app/plugins/sidekick/ui.html`
- Create: `app/test/sidekick-host-audio-ui.test.js`

- [ ] **Step 1: Write failing static and behavioral UI tests**

Load the script in a VM with mocked `navigator.mediaDevices`, `AudioContext`, `MediaRecorder` and `fetch`. Assert device enumeration, selected-device persistence, CABLE/loopback blocking, explicit start requirement, VAD start/end, minimum segment rejection, maximum segment flush, TTS speaking pause and FormData upload.

- [ ] **Step 2: Run and confirm RED**

Run: `cd app && npm test -- --runInBand test/sidekick-host-audio-ui.test.js`

- [ ] **Step 3: Implement `HostAudioCapture`**

Expose `enumerateDevices`, `start`, `stop`, `updateConfig`, `setSpeaking`, `getStatus`, and pure `calculateRms`. Recording begins only from a user click. Use `audio/webm;codecs=opus` when supported and fall back to browser default. Send bounded browser-state heartbeats and pause capture immediately when socket status reports Fish/AnimazingPal speaking.

- [ ] **Step 4: Build complete Host Conversation UI**

Add controls for every field in the spec, a persistent recording badge, input level, permission state, device warning, ASR test, last transcript, latency, decision and error. Remove output-mode and direct Animaze settings; state clearly that AnimazingPal owns Fish TTS/voice/avatar/routing.

- [ ] **Step 5: Run UI tests and commit**

Run the command from Step 2. Expected: PASS.

```powershell
git add -- app/plugins/sidekick/host-audio.js app/plugins/sidekick/ui.html app/test/sidekick-host-audio-ui.test.js
git commit -m "feat(sidekick): capture host microphone for Fish ASR"
```

### Task 8: Make mode lifecycle and preflight failure-safe

**Files:**
- Modify: `app/plugins/animazingpal/brain/live-host-config.js`
- Modify: `app/plugins/animazingpal/live-host-ui.js`
- Modify: `app/plugins/animazingpal/main.js`
- Modify: `app/plugins/sidekick/main.js`
- Test: `app/test/animazingpal-live-host-config.test.js`
- Test: `app/test/animazingpal-live-host-ui.test.js`
- Test: `app/test/sidekick-runtime-contract.test.js`

- [ ] **Step 1: Write failing lifecycle tests**

Assert Standalone is the persisted default, Sidekick activation creates only a runtime override, destroy clears it, and an absent Sidekick can never leave autonomous processing delegated. Assert UI shows effective mode and a link/status for Sidekick rather than a persistent selector that can silence the host.

- [ ] **Step 2: Run and confirm RED**

Run: `cd app && npm test -- --runInBand test/animazingpal-live-host-config.test.js test/animazingpal-live-host-ui.test.js test/sidekick-runtime-contract.test.js`

- [ ] **Step 3: Implement effective-mode status and preflight checks**

Keep `operatingMode: 'standalone'` normalized in stored config. Report `effectiveOperatingMode` from the runtime override. Sidekick preflight checks its plugin availability, mic heartbeat, permission, safe device, Fish key, last ASR probe and last conversation response.

- [ ] **Step 4: Run focused suites and commit**

Run the command from Step 2. Expected: PASS.

```powershell
git add -- app/plugins/animazingpal/brain/live-host-config.js app/plugins/animazingpal/live-host-ui.js app/plugins/animazingpal/main.js app/plugins/sidekick/main.js app/test/animazingpal-live-host-config.test.js app/test/animazingpal-live-host-ui.test.js app/test/sidekick-runtime-contract.test.js
git commit -m "fix(animazingpal): make sidekick mode failure safe"
```

### Task 9: Full regression, browser QA and live acceptance

**Files:**
- Modify only files required by defects found during this task.

- [ ] **Step 1: Run scoped integration suites**

```powershell
cd app
npm test -- --runInBand test/tts-fish-asr.test.js test/sidekick-conversation.test.js test/sidekick-host-audio-ui.test.js test/sidekick-runtime-contract.test.js test/animazingpal-live-host-config.test.js test/animazingpal-live-host-ui.test.js test/animazingpal-live-host-integration.test.js test/animazingpal-platforms.test.js
```

Expected: all suites and tests PASS with no forced exit or open-handle warning.

- [ ] **Step 2: Run project gates**

```powershell
cd app
npm test -- --runInBand
npm run build:css
npm run lint
```

Expected: 0 failed suites, CSS exit 0, lint exit 0.

- [ ] **Step 3: Browser QA**

Restart `node app/server.js`, reload AnimazingPal and Sidekick UIs, and verify:

- no overlapping navigation or undefined labels,
- Standalone mode remains connected and autonomous,
- Sidekick UI contains all host-conversation controls and no ChatPal fields,
- microphone device enumeration and unsafe-device warnings work,
- API keys are redacted,
- diagnostics update after a text-only conversation probe.

- [ ] **Step 4: Manual live acceptance**

Using `animazingpal_test`, require the operator to click microphone permission and reselect CABLE output. Run Fish ASR on one host question, confirm one natural Fish response, ask a follow-up referencing a recent Viewer message, confirm personality/memory context, check Animaze mouth/action movement, and verify the Sidekick reply is not re-transcribed. Confirm no outbound interaction was sent to the public TikTok source.

- [ ] **Step 5: Final requirement audit and commit fixes**

Map every section of `docs/superpowers/specs/2026-06-21-sidekick-fish-asr-conversation-design.md` to test or runtime evidence. If any evidence is absent, add it before completion. Commit only verified fixes with a scoped message.
