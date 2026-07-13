# STT Ollama Cloud Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore STT Ticker translation through the current Ollama Cloud API.

**Architecture:** Keep the Translator public API unchanged while swapping its private transport from the obsolete OpenAI-compatible cloud host to Ollama's native cloud endpoints. The configuration layer migrates only known obsolete default model IDs to a verified current model.

**Tech Stack:** Node.js CommonJS, Axios, Jest.

## Global Constraints

- Modify only STT Ticker source and focused STT tests.
- Preserve unrelated Music Bot work in the dirty worktree.
- Do not log or expose API keys.
- Use `deepseek-v4-flash` for fresh installs and known stale defaults.

---

### Task 1: Cover the current Ollama Cloud contract

**Files:**
- Create: `app/test/stt-ticker-translator-cloud-api.test.js`
- Modify: `app/plugins/stt-ticker/backend/translator.js`

**Interfaces:**
- Consumes: `new Translator(config, logger)` and its `translate()`/`fetchModels()` methods.
- Produces: native Cloud requests to `https://ollama.com/api/chat` and `https://ollama.com/api/tags`.

- [ ] **Step 1: Write the failing test**

```js
expect(axios.post).toHaveBeenCalledWith(
  'https://ollama.com/api/chat',
  expect.objectContaining({ model: 'deepseek-v4-flash', stream: false, think: false }),
  expect.any(Object)
);
expect(result).toMatchObject({ translated: true, text: 'Hello world' });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand app/test/stt-ticker-translator-cloud-api.test.js`

Expected: FAIL because the translator posts to the legacy OpenAI-compatible endpoint and cannot read `message.content`.

- [ ] **Step 3: Write minimal implementation**

```js
const OLLAMA_BASE_URL = 'https://ollama.com/api';
// POST /chat: { model, messages, stream: false, think: false, options: { temperature } }
// Read response.data.message.content.
// GET /tags and map model.name to the UI model id.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand app/test/stt-ticker-translator-cloud-api.test.js`

Expected: PASS.

### Task 2: Migrate broken legacy translation defaults

**Files:**
- Modify: `app/plugins/stt-ticker/backend/config.js`
- Modify: `app/test/stt-ticker-translator-cloud-api.test.js`

**Interfaces:**
- Consumes: `ConfigManager.load()` and a persisted `translation.model` string.
- Produces: `translation.model === 'deepseek-v4-flash'` only for known obsolete built-in defaults.

- [ ] **Step 1: Write the failing test**

```js
const config = new ConfigManager(api).load();
expect(config.translation.model).toBe('deepseek-v4-flash');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand app/test/stt-ticker-translator-cloud-api.test.js`

Expected: FAIL because the loaded legacy `nemotron-3-nano` model is retained.

- [ ] **Step 3: Write minimal implementation**

```js
const DEFAULT_TRANSLATION_MODEL = 'deepseek-v4-flash';
const LEGACY_TRANSLATION_MODELS = new Set(['nemotron-3-nano', 'deepseek-v4', 'qwen2.5-14b-instruct', 'qwen2.5-72b-instruct', 'llama-3.3-70b-instruct', 'mistral-large-2', 'gemma-2-27b-it']);
```

Apply the migration during configuration load and persist only when the model changed.

- [ ] **Step 4: Run tests to verify the migration**

Run: `npm test -- --runInBand app/test/stt-ticker-translator-cloud-api.test.js app/test/stt-ticker-translator-timeout.test.js`

Expected: PASS.

### Task 3: Verify the plugin regression slice

**Files:**
- Verify only: `app/plugins/stt-ticker/backend/translator.js`, `app/plugins/stt-ticker/backend/config.js`, `app/test/stt-ticker-translator-cloud-api.test.js`

- [ ] **Step 1: Run focused tests**

Run: `npm test -- --runInBand app/test/stt-ticker-translator-cloud-api.test.js app/test/stt-ticker-translator-timeout.test.js app/test/stt-ticker-overlay-params.test.js`

Expected: PASS with zero failed tests.

- [ ] **Step 2: Run syntax verification**

Run: `node --check plugins/stt-ticker/backend/translator.js && node --check plugins/stt-ticker/backend/config.js`

Expected: exit code 0.

- [ ] **Step 3: Reproduce the live Cloud contract without exposing the key**

Run a minimal request using the plugin's saved configuration and verify an English and French result for a German sentence through `deepseek-v4-flash`.

Expected: successful native `/api/chat` response, no timeout, and translated output in both languages.
