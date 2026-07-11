# StreamAlchemy Relaunch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Rebuild StreamAlchemy into a functional, cost-controlled RPG crafting plugin where crafted items consume two base items, generated images are cached by recipe, and local ComfyUI generation can be used when the machine supports it.

**Architecture:** Keep the existing plugin id and public URLs, but route runtime behavior through focused backend modules under `app/plugins/streamalchemy/backend/`. SQLite becomes the source of truth for items, inventories, recipes, jobs, and events; old JSON files are read only by an idempotent importer.

**Tech Stack:** Node.js CommonJS, Express routes via plugin API, Socket.IO via plugin API, `better-sqlite3`, Jest, existing LTTH plugin loader APIs, optional local ComfyUI HTTP API, existing OpenAI/SiliconFlow/LightX dependencies.

---

## Snapshot Constraints

- This workspace currently has no `.git` directory. Each task includes a commit checkpoint for future Git checkouts; in the current snapshot, skip the commit command and record the changed files in the final task note.
- Do not delete old StreamAlchemy JSON data or old source files during the relaunch. Keep old files available until the new runtime is verified.
- Do not write runtime data into `app/plugins/streamalchemy/data`; use SQLite and `api.getPluginDataDir()` for generated local images.

## Target File Structure

Create or modify these files:

- Create `app/plugins/streamalchemy/backend/constants.js`: shared defaults, prompt version, styles, provider ids, and event names.
- Create `app/plugins/streamalchemy/backend/database.js`: SQLite schema and prepared-statement data access.
- Create `app/plugins/streamalchemy/backend/prompt-service.js`: sanitized prompts and deterministic recipe keys.
- Create `app/plugins/streamalchemy/backend/inventory-service.js`: inventory add, consume, restore, and query behavior.
- Create `app/plugins/streamalchemy/backend/recipe-service.js`: recipe lookup, creation, and cache-hit behavior.
- Create `app/plugins/streamalchemy/backend/generation-service.js`: provider routing, job tracking, provider fallback.
- Create `app/plugins/streamalchemy/backend/providers/placeholder-provider.js`: deterministic image fallback.
- Create `app/plugins/streamalchemy/backend/providers/local-comfy-provider.js`: optional ComfyUI client.
- Create `app/plugins/streamalchemy/backend/providers/remote-provider-adapters.js`: thin adapters for existing SiliconFlow, OpenAI, and LightX services.
- Create `app/plugins/streamalchemy/backend/system-analyzer.js`: host/GPU/ComfyUI capability detection.
- Create `app/plugins/streamalchemy/backend/overlay-publisher.js`: semantic Socket.IO events.
- Create `app/plugins/streamalchemy/backend/crafting-engine.js`: Gift -> base item -> consume inputs -> recipe cache -> generation -> inventory flow.
- Create `app/plugins/streamalchemy/backend/event-processor.js`: TikTok event normalization and repeat handling.
- Create `app/plugins/streamalchemy/backend/legacy-importer.js`: idempotent import from old JSON files.
- Create `app/plugins/streamalchemy/backend/routes.js`: UI, overlay, item, recipe, job, settings, import, and system-analysis routes.
- Replace `app/plugins/streamalchemy/index.js`: small plugin composition root that wires backend modules.
- Replace `app/plugins/streamalchemy/ui.html`: focused dashboard shell.
- Replace `app/plugins/streamalchemy/overlay.html`: semantic event overlay.
- Keep existing service files (`craftingService.js`, `fusionService.js`, `lightxService.js`, `siliconFlowService.js`, `promptGenerator.js`, `tierSystem.js`, `db.js`) available during transition; only adapters should call them where useful.

Test files:

- Create `app/test/streamalchemy-relaunch-database.test.js`
- Create `app/test/streamalchemy-relaunch-prompt-recipe.test.js`
- Create `app/test/streamalchemy-relaunch-generation.test.js`
- Create `app/test/streamalchemy-relaunch-system-analysis.test.js`
- Create `app/test/streamalchemy-relaunch-crafting-flow.test.js`
- Create `app/test/streamalchemy-relaunch-routes.test.js`
- Create `app/test/streamalchemy-relaunch-legacy-import.test.js`

---

### Task 1: SQLite Store

**Files:**
- Create: `app/plugins/streamalchemy/backend/constants.js`
- Create: `app/plugins/streamalchemy/backend/database.js`
- Test: `app/test/streamalchemy-relaunch-database.test.js`

- [x] **Step 1: Write the failing database tests**

Create `app/test/streamalchemy-relaunch-database.test.js`:

```javascript
const Database = require('better-sqlite3');
const StreamAlchemyDatabase = require('../plugins/streamalchemy/backend/database');

function createStore() {
  const sqlite = new Database(':memory:');
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };
  const store = new StreamAlchemyDatabase(sqlite, logger);
  store.initialize();
  return { sqlite, store };
}

describe('StreamAlchemyDatabase', () => {
  test('initializes all relaunch tables', () => {
    const { sqlite } = createStore();
    const tables = sqlite.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name LIKE 'streamalchemy_%'
      ORDER BY name
    `).all().map(row => row.name);

    expect(tables).toEqual([
      'streamalchemy_events',
      'streamalchemy_generation_jobs',
      'streamalchemy_items',
      'streamalchemy_recipes',
      'streamalchemy_user_inventory'
    ]);
  });

  test('upserts one gift item by gift id', () => {
    const { store } = createStore();
    const item = store.upsertGiftItem({
      giftId: 5655,
      name: 'Essence of Rose',
      rarity: 'Common',
      coinValue: 1,
      imageUrl: 'data:image/svg+xml;base64,rose',
      style: 'rpg',
      promptVersion: 'streamalchemy-v2',
      generator: 'placeholder'
    });

    const same = store.upsertGiftItem({
      giftId: 5655,
      name: 'Essence of Rose Updated',
      rarity: 'Common',
      coinValue: 2,
      imageUrl: 'data:image/svg+xml;base64,rose2',
      style: 'rpg',
      promptVersion: 'streamalchemy-v2',
      generator: 'placeholder'
    });

    expect(same.item_id).toBe(item.item_id);
    expect(store.getItemByGiftId(5655).name).toBe('Essence of Rose');
  });

  test('adds, consumes, and restores inventory quantities atomically', () => {
    const { store } = createStore();
    const item = store.createItem({
      sourceType: 'manual',
      name: 'Manual Rose',
      rarity: 'Common',
      coinValue: 1,
      imageUrl: 'data:image/svg+xml;base64,rose',
      style: 'rpg',
      promptVersion: 'streamalchemy-v2',
      generator: 'placeholder'
    });

    store.addInventoryItem('viewer-a', item.item_id, 2);
    expect(store.getInventoryItem('viewer-a', item.item_id).quantity).toBe(2);

    store.consumeInventoryItems('viewer-a', [
      { itemId: item.item_id, quantity: 1 }
    ]);
    expect(store.getInventoryItem('viewer-a', item.item_id).quantity).toBe(1);

    store.restoreInventoryItems('viewer-a', [
      { itemId: item.item_id, quantity: 1 }
    ]);
    expect(store.getInventoryItem('viewer-a', item.item_id).quantity).toBe(2);
  });

  test('throws without changing quantities when consume lacks stock', () => {
    const { store } = createStore();
    const item = store.createItem({
      sourceType: 'manual',
      name: 'Manual Heart',
      rarity: 'Common',
      coinValue: 5,
      imageUrl: 'data:image/svg+xml;base64,heart',
      style: 'rpg',
      promptVersion: 'streamalchemy-v2',
      generator: 'placeholder'
    });

    store.addInventoryItem('viewer-a', item.item_id, 1);

    expect(() => store.consumeInventoryItems('viewer-a', [
      { itemId: item.item_id, quantity: 2 }
    ])).toThrow('INSUFFICIENT_ITEM_QUANTITY');

    expect(store.getInventoryItem('viewer-a', item.item_id).quantity).toBe(1);
  });

  test('stores recipes and generation jobs', () => {
    const { store } = createStore();
    const result = store.createItem({
      sourceType: 'crafted',
      name: 'Fused Rose-Heart Relic',
      rarity: 'Common',
      coinValue: 6,
      imageUrl: 'data:image/svg+xml;base64,fused',
      style: 'rpg',
      promptVersion: 'streamalchemy-v2',
      generator: 'placeholder'
    });

    store.createRecipe({
      recipeKey: 'craft:v1:a:b:rpg:streamalchemy-v2',
      inputItemAId: 'a',
      inputItemBId: 'b',
      style: 'rpg',
      promptVersion: 'streamalchemy-v2',
      resultItemId: result.item_id
    });

    const job = store.createGenerationJob({
      recipeKey: 'craft:v1:a:b:rpg:streamalchemy-v2',
      itemId: result.item_id,
      status: 'queued',
      provider: 'placeholder',
      model: 'deterministic-svg',
      prompt: 'prompt',
      negativePrompt: 'negative'
    });

    store.updateGenerationJob(job.job_id, {
      status: 'succeeded',
      error: null
    });

    expect(store.getRecipe('craft:v1:a:b:rpg:streamalchemy-v2').result_item_id).toBe(result.item_id);
    expect(store.getGenerationJob(job.job_id).status).toBe('succeeded');
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run:

```bash
cd app
npx jest --runInBand --silent test/streamalchemy-relaunch-database.test.js
```

Expected: FAIL with `Cannot find module '../plugins/streamalchemy/backend/database'`.

- [x] **Step 3: Add constants**

Create `app/plugins/streamalchemy/backend/constants.js`:

```javascript
const PROMPT_VERSION = 'streamalchemy-v2';

const DEFAULT_CONFIG = {
  enabled: true,
  autoCrafting: true,
  craftingWindowMs: 6000,
  defaultStyle: 'rpg',
  promptVersion: PROMPT_VERSION,
  providerOrder: ['localComfy', 'siliconflow', 'openai', 'lightx', 'placeholder'],
  localGeneration: {
    enabled: true,
    comfyUrl: 'http://127.0.0.1:8188',
    model: 'black-forest-labs/FLUX.1-schnell',
    width: 768,
    height: 768,
    steps: 4,
    concurrency: 1
  },
  rateLimit: {
    giftsPerUserPerMinute: 30
  }
};

const STYLE_PRESETS = {
  rpg: { id: 'rpg', label: 'RPG', prompt: 'fantasy RPG game asset' },
  fantasy: { id: 'fantasy', label: 'Fantasy', prompt: 'enchanted fantasy artifact' },
  pixel: { id: 'pixel', label: 'Pixel', prompt: 'clean pixel art icon' },
  anime: { id: 'anime', label: 'Anime', prompt: 'polished anime game icon' },
  cyberpunk: { id: 'cyberpunk', label: 'Cyberpunk', prompt: 'neon cyberpunk item icon' },
  cartoon: { id: 'cartoon', label: 'Cartoon', prompt: 'bright cartoon game item' }
};

const RARITY_TIERS = [
  { name: 'Mythic', min: 5000, color: 'purple' },
  { name: 'Legendary', min: 1000, color: 'gold' },
  { name: 'Rare', min: 100, color: 'silver' },
  { name: 'Common', min: 0, color: 'bronze' }
];

const EVENTS = {
  BASE_ITEM_OBTAINED: 'streamalchemy:base_item_obtained',
  CRAFTING_STARTED: 'streamalchemy:crafting_started',
  CRAFTING_COMPLETED: 'streamalchemy:crafting_completed',
  CRAFTING_FAILED: 'streamalchemy:crafting_failed',
  RECIPE_CACHE_HIT: 'streamalchemy:recipe_cache_hit',
  GENERATION_JOB_STARTED: 'streamalchemy:generation_job_started',
  GENERATION_JOB_FAILED: 'streamalchemy:generation_job_failed'
};

module.exports = {
  PROMPT_VERSION,
  DEFAULT_CONFIG,
  STYLE_PRESETS,
  RARITY_TIERS,
  EVENTS
};
```

- [x] **Step 4: Implement SQLite store**

Create `app/plugins/streamalchemy/backend/database.js`:

```javascript
const { randomUUID } = require('crypto');

class StreamAlchemyDatabase {
  constructor(sqlite, logger) {
    this.db = sqlite?.db || sqlite;
    this.logger = logger;
  }

  initialize() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS streamalchemy_items (
        item_id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL,
        gift_id INTEGER UNIQUE,
        name TEXT NOT NULL,
        rarity TEXT NOT NULL,
        coin_value INTEGER NOT NULL DEFAULT 0,
        image_url TEXT,
        style TEXT,
        prompt_version TEXT NOT NULL,
        generator TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS streamalchemy_user_inventory (
        user_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0,
        first_obtained_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_obtained_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, item_id),
        FOREIGN KEY (item_id) REFERENCES streamalchemy_items(item_id)
      );

      CREATE TABLE IF NOT EXISTS streamalchemy_recipes (
        recipe_key TEXT PRIMARY KEY,
        input_item_a_id TEXT NOT NULL,
        input_item_b_id TEXT NOT NULL,
        style TEXT NOT NULL,
        prompt_version TEXT NOT NULL,
        result_item_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (result_item_id) REFERENCES streamalchemy_items(item_id)
      );

      CREATE TABLE IF NOT EXISTS streamalchemy_generation_jobs (
        job_id TEXT PRIMARY KEY,
        recipe_key TEXT,
        item_id TEXT,
        status TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT,
        prompt TEXT NOT NULL,
        negative_prompt TEXT,
        error TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        started_at TEXT,
        finished_at TEXT
      );

      CREATE TABLE IF NOT EXISTS streamalchemy_events (
        event_id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        user_id TEXT,
        item_id TEXT,
        recipe_key TEXT,
        payload_json TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  createItem(input) {
    const itemId = input.itemId || randomUUID();
    this.db.prepare(`
      INSERT INTO streamalchemy_items (
        item_id, source_type, gift_id, name, rarity, coin_value,
        image_url, style, prompt_version, generator
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      itemId,
      input.sourceType,
      input.giftId ?? null,
      input.name,
      input.rarity,
      Number.parseInt(input.coinValue || 0, 10),
      input.imageUrl || null,
      input.style || null,
      input.promptVersion,
      input.generator
    );
    return this.getItemById(itemId);
  }

  upsertGiftItem(input) {
    const existing = this.getItemByGiftId(input.giftId);
    if (existing) return existing;
    return this.createItem({
      sourceType: 'gift',
      giftId: input.giftId,
      name: input.name,
      rarity: input.rarity,
      coinValue: input.coinValue,
      imageUrl: input.imageUrl,
      style: input.style,
      promptVersion: input.promptVersion,
      generator: input.generator
    });
  }

  getItemById(itemId) {
    return this.db.prepare('SELECT * FROM streamalchemy_items WHERE item_id = ?').get(itemId) || null;
  }

  getItemByGiftId(giftId) {
    return this.db.prepare('SELECT * FROM streamalchemy_items WHERE gift_id = ?').get(giftId) || null;
  }

  getAllItems() {
    return this.db.prepare('SELECT * FROM streamalchemy_items ORDER BY created_at DESC').all();
  }

  addInventoryItem(userId, itemId, quantity = 1) {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO streamalchemy_user_inventory (
        user_id, item_id, quantity, first_obtained_at, last_obtained_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, item_id) DO UPDATE SET
        quantity = quantity + excluded.quantity,
        last_obtained_at = excluded.last_obtained_at
    `).run(userId, itemId, quantity, now, now);
    return this.getInventoryItem(userId, itemId);
  }

  consumeInventoryItems(userId, items) {
    const tx = this.db.transaction(() => {
      for (const item of items) {
        const current = this.getInventoryItem(userId, item.itemId);
        if (!current || current.quantity < item.quantity) {
          throw new Error('INSUFFICIENT_ITEM_QUANTITY');
        }
      }

      for (const item of items) {
        this.db.prepare(`
          UPDATE streamalchemy_user_inventory
          SET quantity = quantity - ?, last_obtained_at = ?
          WHERE user_id = ? AND item_id = ?
        `).run(item.quantity, new Date().toISOString(), userId, item.itemId);
      }
    });
    tx();
  }

  restoreInventoryItems(userId, items) {
    const tx = this.db.transaction(() => {
      for (const item of items) {
        this.addInventoryItem(userId, item.itemId, item.quantity);
      }
    });
    tx();
  }

  getInventoryItem(userId, itemId) {
    return this.db.prepare(`
      SELECT * FROM streamalchemy_user_inventory
      WHERE user_id = ? AND item_id = ?
    `).get(userId, itemId) || null;
  }

  getUserInventory(userId) {
    return this.db.prepare(`
      SELECT inv.*, item.*
      FROM streamalchemy_user_inventory inv
      JOIN streamalchemy_items item ON item.item_id = inv.item_id
      WHERE inv.user_id = ? AND inv.quantity > 0
      ORDER BY inv.last_obtained_at DESC
    `).all(userId);
  }

  createRecipe(input) {
    this.db.prepare(`
      INSERT INTO streamalchemy_recipes (
        recipe_key, input_item_a_id, input_item_b_id, style, prompt_version, result_item_id
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      input.recipeKey,
      input.inputItemAId,
      input.inputItemBId,
      input.style,
      input.promptVersion,
      input.resultItemId
    );
    return this.getRecipe(input.recipeKey);
  }

  getRecipe(recipeKey) {
    return this.db.prepare('SELECT * FROM streamalchemy_recipes WHERE recipe_key = ?').get(recipeKey) || null;
  }

  getRecipeWithResult(recipeKey) {
    return this.db.prepare(`
      SELECT recipe.*, item.*
      FROM streamalchemy_recipes recipe
      JOIN streamalchemy_items item ON item.item_id = recipe.result_item_id
      WHERE recipe.recipe_key = ?
    `).get(recipeKey) || null;
  }

  getAllRecipes() {
    return this.db.prepare('SELECT * FROM streamalchemy_recipes ORDER BY created_at DESC').all();
  }

  createGenerationJob(input) {
    const jobId = input.jobId || randomUUID();
    this.db.prepare(`
      INSERT INTO streamalchemy_generation_jobs (
        job_id, recipe_key, item_id, status, provider, model, prompt, negative_prompt, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      jobId,
      input.recipeKey || null,
      input.itemId || null,
      input.status,
      input.provider,
      input.model || null,
      input.prompt,
      input.negativePrompt || null,
      input.error || null
    );
    return this.getGenerationJob(jobId);
  }

  updateGenerationJob(jobId, updates) {
    const current = this.getGenerationJob(jobId);
    if (!current) return null;
    const nextStatus = updates.status || current.status;
    const finishedAt = ['succeeded', 'failed', 'skipped'].includes(nextStatus)
      ? new Date().toISOString()
      : current.finished_at;
    const startedAt = nextStatus === 'running' && !current.started_at
      ? new Date().toISOString()
      : current.started_at;

    this.db.prepare(`
      UPDATE streamalchemy_generation_jobs
      SET status = ?, provider = ?, model = ?, error = ?, started_at = ?, finished_at = ?
      WHERE job_id = ?
    `).run(
      nextStatus,
      updates.provider || current.provider,
      updates.model || current.model,
      updates.error === undefined ? current.error : updates.error,
      startedAt,
      finishedAt,
      jobId
    );
    return this.getGenerationJob(jobId);
  }

  getGenerationJob(jobId) {
    return this.db.prepare('SELECT * FROM streamalchemy_generation_jobs WHERE job_id = ?').get(jobId) || null;
  }

  getGenerationJobs() {
    return this.db.prepare('SELECT * FROM streamalchemy_generation_jobs ORDER BY created_at DESC').all();
  }

  logEvent(input) {
    const eventId = input.eventId || randomUUID();
    this.db.prepare(`
      INSERT INTO streamalchemy_events (
        event_id, event_type, user_id, item_id, recipe_key, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      eventId,
      input.eventType,
      input.userId || null,
      input.itemId || null,
      input.recipeKey || null,
      input.payload ? JSON.stringify(input.payload) : null
    );
  }
}

module.exports = StreamAlchemyDatabase;
```

- [x] **Step 5: Run database tests**

Run:

```bash
cd app
npx jest --runInBand --silent test/streamalchemy-relaunch-database.test.js
```

Expected: PASS.

- [x] **Step 6: Checkpoint**

If `.git` exists:

```bash
git add app/plugins/streamalchemy/backend/constants.js app/plugins/streamalchemy/backend/database.js app/test/streamalchemy-relaunch-database.test.js
git commit -m "feat(streamalchemy): add relaunch sqlite store"
```

Expected in the current snapshot: skip commit because `.git` is absent.

---

### Task 2: Prompt And Recipe Services

**Files:**
- Create: `app/plugins/streamalchemy/backend/prompt-service.js`
- Create: `app/plugins/streamalchemy/backend/recipe-service.js`
- Test: `app/test/streamalchemy-relaunch-prompt-recipe.test.js`

- [x] **Step 1: Write failing prompt and recipe tests**

Create `app/test/streamalchemy-relaunch-prompt-recipe.test.js`:

```javascript
const Database = require('better-sqlite3');
const StreamAlchemyDatabase = require('../plugins/streamalchemy/backend/database');
const PromptService = require('../plugins/streamalchemy/backend/prompt-service');
const RecipeService = require('../plugins/streamalchemy/backend/recipe-service');

function createServices() {
  const sqlite = new Database(':memory:');
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  const store = new StreamAlchemyDatabase(sqlite, logger);
  store.initialize();
  const promptService = new PromptService();
  const recipeService = new RecipeService(store, promptService);
  return { store, promptService, recipeService };
}

describe('PromptService', () => {
  test('sanitizes names and keeps generated prompts compact', () => {
    const service = new PromptService();
    const prompt = service.createCraftedItemPrompt({
      itemAName: 'Essence of <Rose> with a very long injected suffix that should be truncated by the sanitizer',
      itemBName: 'Heart\\nLogo',
      rarity: 'Common',
      style: 'rpg'
    });

    expect(prompt.prompt).toContain('Rose');
    expect(prompt.prompt).toContain('Heart Logo');
    expect(prompt.prompt).toContain('No text');
    expect(prompt.prompt.length).toBeLessThan(420);
    expect(prompt.negativePrompt).toContain('watermark');
    expect(prompt.promptVersion).toBe('streamalchemy-v2');
  });

  test('builds deterministic recipe keys independent of input order', () => {
    const service = new PromptService();
    const first = service.createRecipeKey({
      itemAId: 'b',
      itemBId: 'a',
      style: 'rpg',
      promptVersion: 'streamalchemy-v2'
    });
    const second = service.createRecipeKey({
      itemAId: 'a',
      itemBId: 'b',
      style: 'rpg',
      promptVersion: 'streamalchemy-v2'
    });

    expect(first).toBe('craft:v1:a:b:rpg:streamalchemy-v2');
    expect(second).toBe(first);
  });
});

describe('RecipeService', () => {
  test('returns cached result when recipe exists', () => {
    const { store, recipeService } = createServices();
    const result = store.createItem({
      sourceType: 'crafted',
      name: 'Fused Rose-Heart Relic',
      rarity: 'Common',
      coinValue: 6,
      imageUrl: 'data:image/svg+xml;base64,fused',
      style: 'rpg',
      promptVersion: 'streamalchemy-v2',
      generator: 'placeholder'
    });

    store.createRecipe({
      recipeKey: 'craft:v1:a:b:rpg:streamalchemy-v2',
      inputItemAId: 'a',
      inputItemBId: 'b',
      style: 'rpg',
      promptVersion: 'streamalchemy-v2',
      resultItemId: result.item_id
    });

    const cached = recipeService.findCachedRecipe({
      itemA: { item_id: 'b', name: 'Heart' },
      itemB: { item_id: 'a', name: 'Rose' },
      style: 'rpg',
      promptVersion: 'streamalchemy-v2'
    });

    expect(cached.fromCache).toBe(true);
    expect(cached.item.item_id).toBe(result.item_id);
    expect(cached.recipeKey).toBe('craft:v1:a:b:rpg:streamalchemy-v2');
  });

  test('creates recipe mapping for generated result', () => {
    const { store, recipeService } = createServices();
    const result = store.createItem({
      sourceType: 'crafted',
      name: 'Fused Rose-Heart Relic',
      rarity: 'Common',
      coinValue: 6,
      imageUrl: 'data:image/svg+xml;base64,fused',
      style: 'rpg',
      promptVersion: 'streamalchemy-v2',
      generator: 'placeholder'
    });

    const recipe = recipeService.saveRecipeResult({
      itemA: { item_id: 'rose-id' },
      itemB: { item_id: 'heart-id' },
      style: 'rpg',
      promptVersion: 'streamalchemy-v2',
      resultItemId: result.item_id
    });

    expect(recipe.recipe_key).toBe('craft:v1:heart-id:rose-id:rpg:streamalchemy-v2');
    expect(store.getRecipe(recipe.recipe_key).result_item_id).toBe(result.item_id);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run:

```bash
cd app
npx jest --runInBand --silent test/streamalchemy-relaunch-prompt-recipe.test.js
```

Expected: FAIL with missing `prompt-service`.

- [x] **Step 3: Implement prompt service**

Create `app/plugins/streamalchemy/backend/prompt-service.js`:

```javascript
const { PROMPT_VERSION, STYLE_PRESETS } = require('./constants');

class PromptService {
  constructor(options = {}) {
    this.promptVersion = options.promptVersion || PROMPT_VERSION;
  }

  sanitizeName(value) {
    const text = String(value || 'Unknown')
      .replace(/^Essence of /i, '')
      .replace(/[<>`"'{}[\]\\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, 48) || 'Unknown';
  }

  normalizeStyle(style) {
    return STYLE_PRESETS[style] ? style : 'rpg';
  }

  createBaseItemPrompt({ giftName, style = 'rpg' }) {
    const cleanGift = this.sanitizeName(giftName);
    const normalizedStyle = this.normalizeStyle(style);
    const styleText = STYLE_PRESETS[normalizedStyle].prompt;
    return {
      promptVersion: this.promptVersion,
      prompt: [
        `Single fantasy RPG item icon inspired by TikTok gift "${cleanGift}".`,
        `Centered isometric object, transparent background, readable silhouette, premium game asset, soft glow, ${styleText}.`,
        'No text, no logo, no character, no background scene.'
      ].join(' '),
      negativePrompt: this.getNegativePrompt(),
      style: normalizedStyle
    };
  }

  createCraftedItemPrompt({ itemAName, itemBName, rarity, style = 'rpg' }) {
    const cleanA = this.sanitizeName(itemAName);
    const cleanB = this.sanitizeName(itemBName);
    const normalizedStyle = this.normalizeStyle(style);
    const styleText = STYLE_PRESETS[normalizedStyle].prompt;
    const cleanRarity = this.sanitizeName(rarity || 'Common');
    return {
      promptVersion: this.promptVersion,
      prompt: [
        `Single fantasy RPG item icon combining "${cleanA}" and "${cleanB}" into one new object.`,
        `Centered isometric object, transparent background, readable silhouette, premium game asset, ${cleanRarity} glow, ${styleText}.`,
        'No text, no logo, no character, no background scene.'
      ].join(' '),
      negativePrompt: this.getNegativePrompt(),
      style: normalizedStyle
    };
  }

  getNegativePrompt() {
    return 'text, watermark, logo, letters, numbers, person, face, hands, full scene, busy background, blurry, cropped, duplicate item';
  }

  createRecipeKey({ itemAId, itemBId, style = 'rpg', promptVersion = this.promptVersion }) {
    const [first, second] = [String(itemAId), String(itemBId)].sort();
    const normalizedStyle = this.normalizeStyle(style);
    return `craft:v1:${first}:${second}:${normalizedStyle}:${promptVersion}`;
  }
}

module.exports = PromptService;
```

- [x] **Step 4: Implement recipe service**

Create `app/plugins/streamalchemy/backend/recipe-service.js`:

```javascript
class RecipeService {
  constructor(store, promptService) {
    this.store = store;
    this.promptService = promptService;
  }

  buildRecipeKey({ itemA, itemB, style, promptVersion }) {
    return this.promptService.createRecipeKey({
      itemAId: itemA.item_id,
      itemBId: itemB.item_id,
      style,
      promptVersion
    });
  }

  findCachedRecipe({ itemA, itemB, style, promptVersion }) {
    const recipeKey = this.buildRecipeKey({ itemA, itemB, style, promptVersion });
    const cached = this.store.getRecipeWithResult(recipeKey);
    if (!cached) {
      return { fromCache: false, recipeKey, item: null };
    }
    return {
      fromCache: true,
      recipeKey,
      item: {
        item_id: cached.result_item_id,
        source_type: cached.source_type,
        name: cached.name,
        rarity: cached.rarity,
        coin_value: cached.coin_value,
        image_url: cached.image_url,
        style: cached.style,
        prompt_version: cached.prompt_version,
        generator: cached.generator
      }
    };
  }

  saveRecipeResult({ itemA, itemB, style, promptVersion, resultItemId }) {
    const recipeKey = this.buildRecipeKey({ itemA, itemB, style, promptVersion });
    const [inputItemAId, inputItemBId] = [itemA.item_id, itemB.item_id].sort();
    return this.store.createRecipe({
      recipeKey,
      inputItemAId,
      inputItemBId,
      style,
      promptVersion,
      resultItemId
    });
  }
}

module.exports = RecipeService;
```

- [x] **Step 5: Run prompt and recipe tests**

Run:

```bash
cd app
npx jest --runInBand --silent test/streamalchemy-relaunch-prompt-recipe.test.js
```

Expected: PASS.

- [x] **Step 6: Checkpoint**

If `.git` exists:

```bash
git add app/plugins/streamalchemy/backend/prompt-service.js app/plugins/streamalchemy/backend/recipe-service.js app/test/streamalchemy-relaunch-prompt-recipe.test.js
git commit -m "feat(streamalchemy): add prompt and recipe services"
```

Expected in the current snapshot: skip commit because `.git` is absent.

---

### Task 3: Generation Providers And Router

**Files:**
- Create: `app/plugins/streamalchemy/backend/providers/placeholder-provider.js`
- Create: `app/plugins/streamalchemy/backend/providers/local-comfy-provider.js`
- Create: `app/plugins/streamalchemy/backend/providers/remote-provider-adapters.js`
- Create: `app/plugins/streamalchemy/backend/generation-service.js`
- Test: `app/test/streamalchemy-relaunch-generation.test.js`

- [x] **Step 1: Write failing generation tests**

Create `app/test/streamalchemy-relaunch-generation.test.js`:

```javascript
const Database = require('better-sqlite3');
const StreamAlchemyDatabase = require('../plugins/streamalchemy/backend/database');
const PlaceholderProvider = require('../plugins/streamalchemy/backend/providers/placeholder-provider');
const LocalComfyProvider = require('../plugins/streamalchemy/backend/providers/local-comfy-provider');
const GenerationService = require('../plugins/streamalchemy/backend/generation-service');

function createStore() {
  const sqlite = new Database(':memory:');
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  const store = new StreamAlchemyDatabase(sqlite, logger);
  store.initialize();
  return { store, logger };
}

describe('PlaceholderProvider', () => {
  test('returns deterministic data URL and metadata', async () => {
    const provider = new PlaceholderProvider();
    const first = await provider.generate({ prompt: 'Rose Heart', rarity: 'Common' });
    const second = await provider.generate({ prompt: 'Rose Heart', rarity: 'Common' });

    expect(first.provider).toBe('placeholder');
    expect(first.model).toBe('deterministic-svg');
    expect(first.imageUrl).toBe(second.imageUrl);
    expect(first.imageUrl).toMatch(/^data:image\/svg\+xml;base64,/);
  });
});

describe('LocalComfyProvider', () => {
  test('reports disabled when local generation is disabled', async () => {
    const provider = new LocalComfyProvider({
      config: { enabled: false, comfyUrl: 'http://127.0.0.1:8188' },
      fetchImpl: jest.fn()
    });

    await expect(provider.checkStatus()).resolves.toEqual({
      provider: 'localComfy',
      state: 'disabled',
      model: null,
      detail: 'Local generation is disabled'
    });
  });

  test('reports unreachable when ComfyUI request fails', async () => {
    const provider = new LocalComfyProvider({
      config: { enabled: true, comfyUrl: 'http://127.0.0.1:8188', model: 'flux' },
      fetchImpl: jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED'))
    });

    const status = await provider.checkStatus();
    expect(status.state).toBe('unreachable');
    expect(status.lastError).toContain('ECONNREFUSED');
  });
});

describe('GenerationService', () => {
  test('uses first ready provider and records successful job', async () => {
    const { store, logger } = createStore();
    const localProvider = {
      id: 'localComfy',
      checkStatus: jest.fn().mockResolvedValue({ state: 'ready' }),
      generate: jest.fn().mockResolvedValue({
        imageUrl: 'http://localhost/generated.png',
        provider: 'localComfy',
        model: 'flux'
      })
    };
    const fallback = new PlaceholderProvider();
    const service = new GenerationService(store, logger, {
      providerOrder: ['localComfy', 'placeholder'],
      providers: { localComfy: localProvider, placeholder: fallback }
    });

    const result = await service.generateImage({
      recipeKey: 'craft:v1:a:b:rpg:streamalchemy-v2',
      prompt: 'prompt',
      negativePrompt: 'negative',
      rarity: 'Common'
    });

    expect(result.provider).toBe('localComfy');
    expect(localProvider.generate).toHaveBeenCalledTimes(1);
    const jobs = store.getGenerationJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('succeeded');
    expect(jobs[0].provider).toBe('localComfy');
  });

  test('falls back to placeholder and records failed provider attempt', async () => {
    const { store, logger } = createStore();
    const failingProvider = {
      id: 'localComfy',
      checkStatus: jest.fn().mockResolvedValue({ state: 'ready' }),
      generate: jest.fn().mockRejectedValue(new Error('GPU out of memory'))
    };
    const service = new GenerationService(store, logger, {
      providerOrder: ['localComfy', 'placeholder'],
      providers: {
        localComfy: failingProvider,
        placeholder: new PlaceholderProvider()
      }
    });

    const result = await service.generateImage({
      recipeKey: 'craft:v1:a:b:rpg:streamalchemy-v2',
      prompt: 'prompt',
      negativePrompt: 'negative',
      rarity: 'Common'
    });

    expect(result.provider).toBe('placeholder');
    const jobs = store.getGenerationJobs();
    expect(jobs).toHaveLength(2);
    const placeholderJob = jobs.find(job => job.provider === 'placeholder');
    const localJob = jobs.find(job => job.provider === 'localComfy');
    expect(placeholderJob.status).toBe('succeeded');
    expect(localJob.status).toBe('failed');
    expect(localJob.error).toContain('GPU out of memory');
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run:

```bash
cd app
npx jest --runInBand --silent test/streamalchemy-relaunch-generation.test.js
```

Expected: FAIL with missing provider modules.

- [x] **Step 3: Implement placeholder provider**

Create `app/plugins/streamalchemy/backend/providers/placeholder-provider.js`:

```javascript
const crypto = require('crypto');

class PlaceholderProvider {
  constructor() {
    this.id = 'placeholder';
  }

  async checkStatus() {
    return {
      provider: this.id,
      state: 'ready',
      model: 'deterministic-svg'
    };
  }

  async generate({ prompt, rarity = 'Common' }) {
    const hash = crypto.createHash('sha256').update(`${rarity}:${prompt}`).digest('hex');
    const color = this.colorForRarity(rarity);
    const accent = `#${hash.slice(0, 6)}`;
    const label = String(rarity).replace(/[^\w -]/g, '').slice(0, 16);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768" viewBox="0 0 768 768">
<rect width="768" height="768" fill="transparent"/>
<circle cx="384" cy="384" r="250" fill="${color}" opacity="0.20"/>
<path d="M384 128 L555 299 L494 555 L274 555 L213 299 Z" fill="${accent}" opacity="0.82"/>
<circle cx="384" cy="384" r="112" fill="${color}" opacity="0.92"/>
<text x="384" y="662" font-family="Arial" font-size="42" fill="${color}" text-anchor="middle">${label}</text>
</svg>`;

    return {
      imageUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
      provider: this.id,
      model: 'deterministic-svg'
    };
  }

  colorForRarity(rarity) {
    const colors = {
      Common: '#CD7F32',
      Rare: '#C0C0C0',
      Legendary: '#FFD700',
      Mythic: '#9370DB'
    };
    return colors[rarity] || colors.Common;
  }
}

module.exports = PlaceholderProvider;
```

- [x] **Step 4: Implement local ComfyUI provider**

Create `app/plugins/streamalchemy/backend/providers/local-comfy-provider.js`:

```javascript
class LocalComfyProvider {
  constructor({ config = {}, fetchImpl = global.fetch, dataDir = null, logger = null } = {}) {
    this.id = 'localComfy';
    this.config = config;
    this.fetch = fetchImpl;
    this.dataDir = dataDir;
    this.logger = logger;
  }

  async checkStatus() {
    if (!this.config.enabled) {
      return {
        provider: this.id,
        state: 'disabled',
        model: null,
        detail: 'Local generation is disabled'
      };
    }

    try {
      const response = await this.fetch(`${this.config.comfyUrl}/system_stats`);
      if (!response || !response.ok) {
        return {
          provider: this.id,
          state: 'unreachable',
          model: this.config.model || null,
          lastError: `ComfyUI returned HTTP ${response?.status || 'unknown'}`
        };
      }

      return {
        provider: this.id,
        state: 'ready',
        model: this.config.model || null,
        detail: 'ComfyUI is reachable'
      };
    } catch (error) {
      return {
        provider: this.id,
        state: 'unreachable',
        model: this.config.model || null,
        lastError: error.message
      };
    }
  }

  async generate() {
    throw new Error('LOCAL_COMFY_WORKFLOW_NOT_CONFIGURED');
  }
}

module.exports = LocalComfyProvider;
```

- [x] **Step 5: Add remote provider adapters**

Create `app/plugins/streamalchemy/backend/providers/remote-provider-adapters.js`:

```javascript
class ExistingServiceProvider {
  constructor({ id, model, hasApiKey, generate }) {
    this.id = id;
    this.model = model;
    this.hasApiKey = hasApiKey;
    this.generateFn = generate;
  }

  async checkStatus() {
    if (!this.hasApiKey()) {
      return {
        provider: this.id,
        state: 'missing_api_key',
        model: this.model
      };
    }
    return {
      provider: this.id,
      state: 'ready',
      model: this.model
    };
  }

  async generate(input) {
    const imageUrl = await this.generateFn(input);
    return {
      imageUrl,
      provider: this.id,
      model: this.model
    };
  }
}

module.exports = {
  ExistingServiceProvider
};
```

- [x] **Step 6: Implement generation router**

Create `app/plugins/streamalchemy/backend/generation-service.js`:

```javascript
class GenerationService {
  constructor(store, logger, options = {}) {
    this.store = store;
    this.logger = logger;
    this.providerOrder = options.providerOrder || ['localComfy', 'siliconflow', 'openai', 'lightx', 'placeholder'];
    this.providers = options.providers || {};
  }

  async getProviderStatuses() {
    const statuses = [];
    for (const providerId of this.providerOrder) {
      const provider = this.providers[providerId];
      if (!provider) {
        statuses.push({ provider: providerId, state: 'disabled', detail: 'Provider is not configured' });
        continue;
      }
      statuses.push(await provider.checkStatus());
    }
    return statuses;
  }

  async generateImage(input) {
    const failures = [];
    for (const providerId of this.providerOrder) {
      const provider = this.providers[providerId];
      if (!provider) continue;

      const status = await provider.checkStatus();
      if (status.state !== 'ready') continue;

      const job = this.store.createGenerationJob({
        recipeKey: input.recipeKey,
        itemId: input.itemId || null,
        status: 'running',
        provider: provider.id,
        model: status.model || null,
        prompt: input.prompt,
        negativePrompt: input.negativePrompt
      });

      try {
        const result = await provider.generate(input);
        this.store.updateGenerationJob(job.job_id, {
          status: 'succeeded',
          provider: result.provider,
          model: result.model,
          error: null
        });
        return result;
      } catch (error) {
        failures.push({ provider: provider.id, error: error.message });
        this.store.updateGenerationJob(job.job_id, {
          status: 'failed',
          error: error.message
        });
        this.logger?.warn?.(`[STREAMALCHEMY] Provider ${provider.id} failed: ${error.message}`);
      }
    }

    const message = failures.map(failure => `${failure.provider}: ${failure.error}`).join('; ');
    throw new Error(message || 'NO_READY_IMAGE_PROVIDER');
  }
}

module.exports = GenerationService;
```

- [x] **Step 7: Run generation tests**

Run:

```bash
cd app
npx jest --runInBand --silent test/streamalchemy-relaunch-generation.test.js
```

Expected: PASS.

- [x] **Step 8: Checkpoint**

If `.git` exists:

```bash
git add app/plugins/streamalchemy/backend/providers app/plugins/streamalchemy/backend/generation-service.js app/test/streamalchemy-relaunch-generation.test.js
git commit -m "feat(streamalchemy): add generation provider router"
```

Expected in the current snapshot: skip commit because `.git` is absent.

---

### Task 4: System Analyzer

**Files:**
- Create: `app/plugins/streamalchemy/backend/system-analyzer.js`
- Test: `app/test/streamalchemy-relaunch-system-analysis.test.js`

- [x] **Step 1: Write failing system analyzer tests**

Create `app/test/streamalchemy-relaunch-system-analysis.test.js`:

```javascript
const SystemAnalyzer = require('../plugins/streamalchemy/backend/system-analyzer');

describe('SystemAnalyzer', () => {
  test('returns local model recommendation for 12GB NVIDIA GPU', async () => {
    const analyzer = new SystemAnalyzer({
      execFileImpl: jest.fn((cmd, args, callback) => {
        callback(null, 'NVIDIA GeForce RTX 3060, 12288 MiB, 595.79\n', '');
      }),
      osImpl: {
        platform: () => 'win32',
        cpus: () => Array.from({ length: 32 }, () => ({ model: 'AMD Ryzen 9 5950X' })),
        totalmem: () => 32 * 1024 * 1024 * 1024
      },
      fetchImpl: jest.fn().mockResolvedValue({ ok: true })
    });

    const result = await analyzer.analyze({
      comfyUrl: 'http://127.0.0.1:8188'
    });

    expect(result.gpu.name).toContain('RTX 3060');
    expect(result.gpu.vramMb).toBe(12288);
    expect(result.recommendation.primaryModel).toBe('black-forest-labs/FLUX.1-schnell');
    expect(result.recommendation.backend).toBe('ComfyUI');
    expect(result.comfy.state).toBe('ready');
  });

  test('does not include API keys or environment secrets', async () => {
    const analyzer = new SystemAnalyzer({
      execFileImpl: jest.fn((cmd, args, callback) => callback(new Error('missing'), '', '')),
      osImpl: {
        platform: () => 'win32',
        cpus: () => [{ model: 'CPU' }],
        totalmem: () => 8 * 1024 * 1024 * 1024
      },
      fetchImpl: jest.fn().mockRejectedValue(new Error('offline'))
    });

    const result = await analyzer.analyze({ comfyUrl: 'http://127.0.0.1:8188' });
    expect(JSON.stringify(result)).not.toContain('sk-');
    expect(JSON.stringify(result)).not.toContain('apiKey');
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run:

```bash
cd app
npx jest --runInBand --silent test/streamalchemy-relaunch-system-analysis.test.js
```

Expected: FAIL with missing `system-analyzer`.

- [x] **Step 3: Implement system analyzer**

Create `app/plugins/streamalchemy/backend/system-analyzer.js`:

```javascript
const os = require('os');
const { execFile } = require('child_process');

class SystemAnalyzer {
  constructor({ execFileImpl = execFile, osImpl = os, fetchImpl = global.fetch } = {}) {
    this.execFile = execFileImpl;
    this.os = osImpl;
    this.fetch = fetchImpl;
  }

  async analyze({ comfyUrl }) {
    const gpu = await this.detectGpu();
    const comfy = await this.checkComfy(comfyUrl);
    return {
      os: {
        platform: this.os.platform()
      },
      cpu: this.detectCpu(),
      memory: {
        totalGb: Math.round(this.os.totalmem() / 1024 / 1024 / 1024)
      },
      gpu,
      comfy,
      recommendation: this.recommend(gpu)
    };
  }

  detectCpu() {
    const cpus = this.os.cpus();
    return {
      model: cpus[0]?.model || 'Unknown CPU',
      logicalCores: cpus.length
    };
  }

  detectGpu() {
    return new Promise(resolve => {
      this.execFile(
        'nvidia-smi',
        ['--query-gpu=name,memory.total,driver_version', '--format=csv,noheader'],
        (error, stdout) => {
          if (error || !stdout) {
            resolve({
              name: null,
              vramMb: 0,
              driver: null,
              state: 'not_detected'
            });
            return;
          }

          const firstLine = stdout.trim().split(/\r?\n/)[0];
          const [name, memory, driver] = firstLine.split(',').map(part => part.trim());
          const vramMb = Number.parseInt(String(memory).replace(/[^\d]/g, ''), 10) || 0;
          resolve({
            name,
            vramMb,
            driver,
            state: 'detected'
          });
        }
      );
    });
  }

  async checkComfy(comfyUrl) {
    if (!comfyUrl) {
      return { state: 'disabled', url: null };
    }
    try {
      const response = await this.fetch(`${comfyUrl}/system_stats`);
      return response.ok
        ? { state: 'ready', url: comfyUrl }
        : { state: 'unreachable', url: comfyUrl, lastError: `HTTP ${response.status}` };
    } catch (error) {
      return { state: 'unreachable', url: comfyUrl, lastError: error.message };
    }
  }

  recommend(gpu) {
    if (gpu.vramMb >= 12000) {
      return {
        backend: 'ComfyUI',
        primaryModel: 'black-forest-labs/FLUX.1-schnell',
        alternativeModel: 'stabilityai/stable-diffusion-3.5-medium',
        width: 768,
        height: 768,
        steps: 4,
        concurrency: 1,
        remoteFallback: true,
        reason: 'Detected at least 12GB NVIDIA VRAM, suitable for single local image jobs with conservative settings.'
      };
    }

    if (gpu.vramMb >= 8000) {
      return {
        backend: 'ComfyUI',
        primaryModel: 'stabilityai/stable-diffusion-3.5-medium',
        alternativeModel: 'black-forest-labs/FLUX.1-schnell with offload',
        width: 768,
        height: 768,
        steps: 4,
        concurrency: 1,
        remoteFallback: true,
        reason: 'Detected 8GB or more VRAM; use conservative local settings and keep remote fallback enabled.'
      };
    }

    return {
      backend: 'remote-first',
      primaryModel: 'siliconflow',
      alternativeModel: 'openai',
      width: 768,
      height: 768,
      steps: null,
      concurrency: 1,
      remoteFallback: true,
      reason: 'Local GPU capacity is missing or low; remote providers should be preferred.'
    };
  }
}

module.exports = SystemAnalyzer;
```

- [x] **Step 4: Run system analyzer tests**

Run:

```bash
cd app
npx jest --runInBand --silent test/streamalchemy-relaunch-system-analysis.test.js
```

Expected: PASS.

- [x] **Step 5: Checkpoint**

If `.git` exists:

```bash
git add app/plugins/streamalchemy/backend/system-analyzer.js app/test/streamalchemy-relaunch-system-analysis.test.js
git commit -m "feat(streamalchemy): add local generation system analysis"
```

Expected in the current snapshot: skip commit because `.git` is absent.

---

### Task 5: Inventory Service, Overlay Publisher, And Crafting Engine

**Files:**
- Create: `app/plugins/streamalchemy/backend/inventory-service.js`
- Create: `app/plugins/streamalchemy/backend/overlay-publisher.js`
- Create: `app/plugins/streamalchemy/backend/crafting-engine.js`
- Create: `app/plugins/streamalchemy/backend/event-processor.js`
- Test: `app/test/streamalchemy-relaunch-crafting-flow.test.js`

- [x] **Step 1: Write failing crafting flow tests**

Create `app/test/streamalchemy-relaunch-crafting-flow.test.js`:

```javascript
const Database = require('better-sqlite3');
const StreamAlchemyDatabase = require('../plugins/streamalchemy/backend/database');
const PromptService = require('../plugins/streamalchemy/backend/prompt-service');
const RecipeService = require('../plugins/streamalchemy/backend/recipe-service');
const InventoryService = require('../plugins/streamalchemy/backend/inventory-service');
const OverlayPublisher = require('../plugins/streamalchemy/backend/overlay-publisher');
const CraftingEngine = require('../plugins/streamalchemy/backend/crafting-engine');
const EventProcessor = require('../plugins/streamalchemy/backend/event-processor');
const { EVENTS } = require('../plugins/streamalchemy/backend/constants');

function createEngine(overrides = {}) {
  const sqlite = new Database(':memory:');
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  const store = new StreamAlchemyDatabase(sqlite, logger);
  store.initialize();
  const promptService = new PromptService();
  const recipeService = new RecipeService(store, promptService);
  const inventoryService = new InventoryService(store);
  const emitted = [];
  const api = { emit: (event, payload) => emitted.push({ event, payload }) };
  const overlayPublisher = new OverlayPublisher(api);
  const generationService = overrides.generationService || {
    generateImage: jest.fn().mockResolvedValue({
      imageUrl: 'data:image/svg+xml;base64,generated',
      provider: 'placeholder',
      model: 'deterministic-svg'
    })
  };
  const engine = new CraftingEngine({
    store,
    promptService,
    recipeService,
    inventoryService,
    generationService,
    overlayPublisher,
    logger,
    config: {
      autoCrafting: true,
      craftingWindowMs: 6000,
      defaultStyle: 'rpg',
      promptVersion: 'streamalchemy-v2'
    },
    now: overrides.now || (() => Date.now())
  });
  return { store, engine, emitted, generationService };
}

describe('StreamAlchemy crafting relaunch flow', () => {
  test('one gift creates and grants a base item', async () => {
    const { store, engine, emitted } = createEngine({ now: () => 1000 });

    await engine.processGift({
      userId: 'viewer-a',
      giftId: 1,
      giftName: 'Rose',
      coinValue: 1
    });

    const inventory = store.getUserInventory('viewer-a');
    expect(inventory).toHaveLength(1);
    expect(inventory[0].name).toBe('Essence of Rose');
    expect(inventory[0].quantity).toBe(1);
    expect(inventory[0].image_url).toBe('data:image/svg+xml;base64,generated');
    expect(emitted.map(event => event.event)).toContain(EVENTS.BASE_ITEM_OBTAINED);
  });

  test('existing gift item skips base image generation', async () => {
    const { engine, generationService } = createEngine({ now: () => 1000 });

    await engine.processGift({ userId: 'viewer-a', giftId: 1, giftName: 'Rose', coinValue: 1 });
    generationService.generateImage.mockClear();
    await engine.processGift({ userId: 'viewer-b', giftId: 1, giftName: 'Rose', coinValue: 1 });

    expect(generationService.generateImage).not.toHaveBeenCalled();
  });

  test('two gifts consume both base items and grant one crafted item', async () => {
    let clock = 1000;
    const { store, engine, emitted, generationService } = createEngine({ now: () => clock });

    await engine.processGift({ userId: 'viewer-a', giftId: 1, giftName: 'Rose', coinValue: 1 });
    clock = 2000;
    await engine.processGift({ userId: 'viewer-a', giftId: 2, giftName: 'Heart', coinValue: 5 });

    const inventory = store.getUserInventory('viewer-a');
    const baseItems = inventory.filter(item => item.source_type === 'gift');
    const craftedItems = inventory.filter(item => item.source_type === 'crafted');

    expect(baseItems).toHaveLength(0);
    expect(craftedItems).toHaveLength(1);
    expect(craftedItems[0].name).toContain('Rose-Heart');
    expect(generationService.generateImage).toHaveBeenCalledTimes(3);
    expect(emitted.map(event => event.event)).toEqual([
      EVENTS.BASE_ITEM_OBTAINED,
      EVENTS.BASE_ITEM_OBTAINED,
      EVENTS.CRAFTING_STARTED,
      EVENTS.CRAFTING_COMPLETED
    ]);
  });

  test('existing recipe skips image generation', async () => {
    let clock = 1000;
    const { store, engine, generationService, emitted } = createEngine({ now: () => clock });

    await engine.processGift({ userId: 'viewer-a', giftId: 1, giftName: 'Rose', coinValue: 1 });
    clock = 2000;
    await engine.processGift({ userId: 'viewer-a', giftId: 2, giftName: 'Heart', coinValue: 5 });
    generationService.generateImage.mockClear();

    clock = 10000;
    await engine.processGift({ userId: 'viewer-b', giftId: 1, giftName: 'Rose', coinValue: 1 });
    clock = 11000;
    await engine.processGift({ userId: 'viewer-b', giftId: 2, giftName: 'Heart', coinValue: 5 });

    expect(generationService.generateImage).not.toHaveBeenCalled();
    expect(emitted.map(event => event.event)).toContain(EVENTS.RECIPE_CACHE_HIT);
  });

  test('generation failure restores consumed inputs', async () => {
    let clock = 1000;
    const generationService = {
      generateImage: jest.fn().mockRejectedValue(new Error('provider failed'))
    };
    const { store, engine, emitted } = createEngine({ now: () => clock, generationService });

    await engine.processGift({ userId: 'viewer-a', giftId: 1, giftName: 'Rose', coinValue: 1 });
    clock = 2000;
    await engine.processGift({ userId: 'viewer-a', giftId: 2, giftName: 'Heart', coinValue: 5 });

    const inventory = store.getUserInventory('viewer-a');
    const baseItems = inventory.filter(item => item.source_type === 'gift');
    const craftedItems = inventory.filter(item => item.source_type === 'crafted');

    expect(baseItems).toHaveLength(2);
    expect(craftedItems).toHaveLength(0);
    expect(emitted.map(event => event.event)).toContain(EVENTS.CRAFTING_FAILED);
  });
});

describe('EventProcessor', () => {
  test('normalizes repeat gifts into individual processing calls', async () => {
    const calls = [];
    const processor = new EventProcessor({
      engine: {
        processGift: async gift => calls.push(gift)
      },
      logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
    });

    await processor.handleGiftEvent({
      uniqueId: 'viewer-a',
      giftId: 1,
      giftName: 'Rose',
      diamondCount: 1,
      repeatCount: 3
    });

    expect(calls).toHaveLength(3);
    expect(calls[0]).toEqual({
      userId: 'viewer-a',
      giftId: 1,
      giftName: 'Rose',
      coinValue: 1
    });
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run:

```bash
cd app
npx jest --runInBand --silent test/streamalchemy-relaunch-crafting-flow.test.js
```

Expected: FAIL with missing `inventory-service`.

- [x] **Step 3: Implement inventory service**

Create `app/plugins/streamalchemy/backend/inventory-service.js`:

```javascript
class InventoryService {
  constructor(store) {
    this.store = store;
  }

  grantItem(userId, itemId, quantity = 1) {
    return this.store.addInventoryItem(userId, itemId, quantity);
  }

  consumeItems(userId, items) {
    this.store.consumeInventoryItems(userId, items);
  }

  restoreItems(userId, items) {
    this.store.restoreInventoryItems(userId, items);
  }

  getInventory(userId) {
    return this.store.getUserInventory(userId);
  }
}

module.exports = InventoryService;
```

- [x] **Step 4: Implement overlay publisher**

Create `app/plugins/streamalchemy/backend/overlay-publisher.js`:

```javascript
const { EVENTS } = require('./constants');

class OverlayPublisher {
  constructor(api) {
    this.api = api;
  }

  baseItemObtained(payload) {
    this.api.emit(EVENTS.BASE_ITEM_OBTAINED, payload);
  }

  craftingStarted(payload) {
    this.api.emit(EVENTS.CRAFTING_STARTED, payload);
  }

  recipeCacheHit(payload) {
    this.api.emit(EVENTS.RECIPE_CACHE_HIT, payload);
  }

  craftingCompleted(payload) {
    this.api.emit(EVENTS.CRAFTING_COMPLETED, payload);
  }

  craftingFailed(payload) {
    this.api.emit(EVENTS.CRAFTING_FAILED, payload);
  }
}

module.exports = OverlayPublisher;
```

- [x] **Step 5: Implement crafting engine**

Create `app/plugins/streamalchemy/backend/crafting-engine.js`:

```javascript
const { RARITY_TIERS } = require('./constants');

class CraftingEngine {
  constructor({
    store,
    promptService,
    recipeService,
    inventoryService,
    generationService,
    overlayPublisher,
    logger,
    config,
    now = () => Date.now()
  }) {
    this.store = store;
    this.promptService = promptService;
    this.recipeService = recipeService;
    this.inventoryService = inventoryService;
    this.generationService = generationService;
    this.overlayPublisher = overlayPublisher;
    this.logger = logger;
    this.config = config;
    this.now = now;
    this.buffers = new Map();
  }

  async processGift(gift) {
    const baseItem = await this.getOrCreateBaseItem(gift);
    this.inventoryService.grantItem(gift.userId, baseItem.item_id, 1);
    this.overlayPublisher.baseItemObtained({ userId: gift.userId, item: baseItem });

    const buffer = this.getBuffer(gift.userId);
    buffer.push({ item: baseItem, timestamp: this.now() });

    if (this.config.autoCrafting && buffer.length >= 2) {
      await this.tryCraft(gift.userId);
    }
  }

  async getOrCreateBaseItem(gift) {
    const existing = this.store.getItemByGiftId(gift.giftId);
    if (existing) return existing;

    const prompt = this.promptService.createBaseItemPrompt({
      giftName: gift.giftName,
      style: this.config.defaultStyle
    });

    let imageUrl = null;
    let generator = 'unavailable';
    try {
      const generated = await this.generationService.generateImage({
        recipeKey: `base:v1:${gift.giftId}:${prompt.style}:${prompt.promptVersion}`,
        prompt: prompt.prompt,
        negativePrompt: prompt.negativePrompt,
        rarity: 'Common'
      });
      imageUrl = generated.imageUrl;
      generator = generated.provider;
    } catch (error) {
      this.logger?.warn?.(`[STREAMALCHEMY] Base item image generation failed for gift ${gift.giftId}: ${error.message}`);
    }

    return this.store.upsertGiftItem({
      giftId: gift.giftId,
      name: `Essence of ${this.promptService.sanitizeName(gift.giftName)}`,
      rarity: 'Common',
      coinValue: gift.coinValue,
      imageUrl,
      style: prompt.style,
      promptVersion: prompt.promptVersion,
      generator
    });
  }

  async tryCraft(userId) {
    const buffer = this.getBuffer(userId);
    const second = buffer[buffer.length - 1];
    const first = buffer[buffer.length - 2];
    if (!first || !second) return;

    const delta = second.timestamp - first.timestamp;
    if (delta > this.config.craftingWindowMs) {
      buffer.shift();
      return;
    }

    buffer.splice(buffer.length - 2, 2);
    this.overlayPublisher.craftingStarted({ userId, itemA: first.item, itemB: second.item });

    const consumed = [
      { itemId: first.item.item_id, quantity: 1 },
      { itemId: second.item.item_id, quantity: 1 }
    ];

    try {
      this.inventoryService.consumeItems(userId, consumed);
      const craftedItem = await this.resolveCraftedItem(first.item, second.item);
      this.inventoryService.grantItem(userId, craftedItem.item_id, 1);
      this.overlayPublisher.craftingCompleted({ userId, item: craftedItem, itemA: first.item, itemB: second.item });
    } catch (error) {
      this.inventoryService.restoreItems(userId, consumed);
      this.logger?.error?.(`[STREAMALCHEMY] Crafting failed: ${error.message}`);
      this.overlayPublisher.craftingFailed({ userId, itemA: first.item, itemB: second.item, error: error.message });
    }
  }

  async resolveCraftedItem(itemA, itemB) {
    const style = this.config.defaultStyle;
    const promptVersion = this.config.promptVersion;
    const cached = this.recipeService.findCachedRecipe({ itemA, itemB, style, promptVersion });
    if (cached.fromCache) {
      this.overlayPublisher.recipeCacheHit({ recipeKey: cached.recipeKey, item: cached.item });
      return cached.item;
    }

    const rarity = this.calculateRarity((itemA.coin_value || 0) + (itemB.coin_value || 0));
    const prompt = this.promptService.createCraftedItemPrompt({
      itemAName: itemA.name,
      itemBName: itemB.name,
      rarity,
      style
    });
    const generated = await this.generationService.generateImage({
      recipeKey: cached.recipeKey,
      prompt: prompt.prompt,
      negativePrompt: prompt.negativePrompt,
      rarity
    });
    const craftedItem = this.store.createItem({
      sourceType: 'crafted',
      name: this.createCraftedName(itemA.name, itemB.name),
      rarity,
      coinValue: (itemA.coin_value || 0) + (itemB.coin_value || 0),
      imageUrl: generated.imageUrl,
      style,
      promptVersion,
      generator: generated.provider
    });
    this.recipeService.saveRecipeResult({
      itemA,
      itemB,
      style,
      promptVersion,
      resultItemId: craftedItem.item_id
    });
    return craftedItem;
  }

  createCraftedName(nameA, nameB) {
    const cleanA = this.promptService.sanitizeName(nameA);
    const cleanB = this.promptService.sanitizeName(nameB);
    return `Fused ${cleanA}-${cleanB} Relic`;
  }

  calculateRarity(totalCoins) {
    return RARITY_TIERS.find(tier => totalCoins >= tier.min)?.name || 'Common';
  }

  getBuffer(userId) {
    if (!this.buffers.has(userId)) {
      this.buffers.set(userId, []);
    }
    return this.buffers.get(userId);
  }
}

module.exports = CraftingEngine;
```

- [x] **Step 6: Implement event processor**

Create `app/plugins/streamalchemy/backend/event-processor.js`:

```javascript
class EventProcessor {
  constructor({ engine, logger }) {
    this.engine = engine;
    this.logger = logger;
  }

  async handleGiftEvent(data = {}) {
    const userId = data.uniqueId || data.userId || data.username;
    const giftId = Number.parseInt(data.giftId, 10);
    const giftName = data.giftName || data.name;
    const coinValue = Number.parseInt(data.diamondCount ?? data.coins ?? 0, 10) || 0;
    const repeatCount = Math.max(Number.parseInt(data.repeatCount || 1, 10) || 1, 1);

    if (!userId || !giftId || !giftName) {
      this.logger?.warn?.('[STREAMALCHEMY] Ignored invalid gift event');
      return;
    }

    for (let i = 0; i < repeatCount; i++) {
      await this.engine.processGift({ userId, giftId, giftName, coinValue });
    }
  }
}

module.exports = EventProcessor;
```

- [x] **Step 7: Run crafting flow tests**

Run:

```bash
cd app
npx jest --runInBand --silent test/streamalchemy-relaunch-crafting-flow.test.js
```

Expected: PASS.

- [x] **Step 8: Checkpoint**

If `.git` exists:

```bash
git add app/plugins/streamalchemy/backend/inventory-service.js app/plugins/streamalchemy/backend/overlay-publisher.js app/plugins/streamalchemy/backend/crafting-engine.js app/plugins/streamalchemy/backend/event-processor.js app/test/streamalchemy-relaunch-crafting-flow.test.js
git commit -m "feat(streamalchemy): add relaunch crafting flow"
```

Expected in the current snapshot: skip commit because `.git` is absent.

---

### Task 6: Plugin Composition And Routes

**Files:**
- Create: `app/plugins/streamalchemy/backend/routes.js`
- Modify: `app/plugins/streamalchemy/index.js`
- Test: `app/test/streamalchemy-relaunch-routes.test.js`

- [x] **Step 1: Write failing route and composition tests**

Create `app/test/streamalchemy-relaunch-routes.test.js`:

```javascript
const StreamAlchemyPlugin = require('../plugins/streamalchemy');

function createApi() {
  const routes = [];
  const sockets = [];
  const tiktokEvents = [];
  const settings = new Map();
    const Database = require('better-sqlite3');
    const sqlite = new Database(':memory:');
  return {
    routes,
    sockets,
    tiktokEvents,
    emitted: [],
    api: {
      pluginDir: require('path').join(process.cwd(), 'plugins', 'streamalchemy'),
      log: jest.fn(),
      getDatabase: () => sqlite,
      getConfig: key => settings.get(key) || null,
      setConfig: (key, value) => { settings.set(key, value); return true; },
      getPluginDataDir: () => require('os').tmpdir(),
      ensurePluginDataDir: () => require('os').tmpdir(),
      registerRoute: (method, path, handler) => { routes.push({ method, path, handler }); return true; },
      registerSocket: (event, handler) => { sockets.push({ event, handler }); return true; },
      registerTikTokEvent: (event, handler) => { tiktokEvents.push({ event, handler }); return true; },
      emit: (event, payload) => { routes.emitted = routes.emitted || []; routes.emitted.push({ event, payload }); return true; }
    }
  };
}

function createRes() {
  return {
    statusCode: 200,
    body: null,
    file: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    sendFile(file) { this.file = file; return this; },
    setHeader(key, value) { this.headers[key] = value; return this; }
  };
}

describe('StreamAlchemy relaunch plugin routes', () => {
  test('initializes focused runtime and registers public routes', async () => {
    const { api, routes, tiktokEvents } = createApi();
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();

    expect(tiktokEvents.map(event => event.event)).toEqual(['gift']);
    expect(routes.map(route => `${route.method} ${route.path}`)).toEqual(expect.arrayContaining([
      'GET /streamalchemy/ui',
      'GET /streamalchemy/overlay',
      'GET /api/streamalchemy/config',
      'GET /api/streamalchemy/items',
      'GET /api/streamalchemy/recipes',
      'GET /api/streamalchemy/generation-jobs',
      'GET /api/streamalchemy/system-analysis'
    ]));
  });

  test('config route masks provider secrets', async () => {
    const { api, routes } = createApi();
    const plugin = new StreamAlchemyPlugin(api);
    await plugin.init();

    const route = routes.find(entry => entry.method === 'GET' && entry.path === '/api/streamalchemy/config');
    const res = createRes();
    await route.handler({}, res);

    expect(res.body.success).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('apiKey');
    expect(res.body.config.providerOrder).toContain('localComfy');
  });
});
```

- [x] **Step 2: Run tests to verify route behavior fails against old plugin**

Run:

```bash
cd app
npx jest --runInBand --silent test/streamalchemy-relaunch-routes.test.js
```

Expected: FAIL because old `index.js` uses the previous composition and does not expose the new routes exactly.

- [x] **Step 3: Implement route registration**

Create `app/plugins/streamalchemy/backend/routes.js`:

```javascript
const path = require('path');

class StreamAlchemyRoutes {
  constructor({ api, pluginDir, store, generationService, systemAnalyzer, configProvider, legacyImporter }) {
    this.api = api;
    this.pluginDir = pluginDir;
    this.store = store;
    this.generationService = generationService;
    this.systemAnalyzer = systemAnalyzer;
    this.configProvider = configProvider;
    this.legacyImporter = legacyImporter;
  }

  register() {
    this.api.registerRoute('GET', '/streamalchemy/ui', (req, res) => {
      res.sendFile(path.join(this.pluginDir, 'ui.html'));
    });

    this.api.registerRoute('GET', '/streamalchemy/overlay', (req, res) => {
      res.sendFile(path.join(this.pluginDir, 'overlay.html'));
    });

    this.api.registerRoute('GET', '/api/streamalchemy/config', async (req, res) => {
      res.json({
        success: true,
        config: this.maskConfig(this.configProvider.getConfig())
      });
    });

    this.api.registerRoute('POST', '/api/streamalchemy/config', async (req, res) => {
      const config = this.configProvider.updateConfig(req.body || {});
      res.json({ success: true, config: this.maskConfig(config) });
    });

    this.api.registerRoute('GET', '/api/streamalchemy/items', async (req, res) => {
      res.json({ success: true, items: this.store.getAllItems() });
    });

    this.api.registerRoute('GET', '/api/streamalchemy/recipes', async (req, res) => {
      res.json({ success: true, recipes: this.store.getAllRecipes() });
    });

    this.api.registerRoute('GET', '/api/streamalchemy/generation-jobs', async (req, res) => {
      res.json({ success: true, jobs: this.store.getGenerationJobs() });
    });

    this.api.registerRoute('GET', '/api/streamalchemy/providers/status', async (req, res) => {
      res.json({ success: true, providers: await this.generationService.getProviderStatuses() });
    });

    this.api.registerRoute('GET', '/api/streamalchemy/system-analysis', async (req, res) => {
      const config = this.configProvider.getConfig();
      res.json({
        success: true,
        analysis: await this.systemAnalyzer.analyze({
          comfyUrl: config.localGeneration?.comfyUrl
        })
      });
    });

    this.api.registerRoute('POST', '/api/streamalchemy/import-legacy', async (req, res) => {
      res.json({
        success: true,
        report: await this.legacyImporter.import()
      });
    });
  }

  maskConfig(config) {
    const clone = JSON.parse(JSON.stringify(config || {}));
    delete clone.openaiApiKey;
    delete clone.siliconFlowApiKey;
    delete clone.lightxApiKey;
    return clone;
  }
}

module.exports = StreamAlchemyRoutes;
```

- [x] **Step 4: Replace plugin composition root**

Replace `app/plugins/streamalchemy/index.js` with:

```javascript
const path = require('path');
const StreamAlchemyDatabase = require('./backend/database');
const PromptService = require('./backend/prompt-service');
const RecipeService = require('./backend/recipe-service');
const InventoryService = require('./backend/inventory-service');
const PlaceholderProvider = require('./backend/providers/placeholder-provider');
const LocalComfyProvider = require('./backend/providers/local-comfy-provider');
const GenerationService = require('./backend/generation-service');
const SystemAnalyzer = require('./backend/system-analyzer');
const OverlayPublisher = require('./backend/overlay-publisher');
const CraftingEngine = require('./backend/crafting-engine');
const EventProcessor = require('./backend/event-processor');
const LegacyImporter = require('./backend/legacy-importer');
const StreamAlchemyRoutes = require('./backend/routes');
const { DEFAULT_CONFIG } = require('./backend/constants');

class StreamAlchemyPlugin {
  constructor(api) {
    this.api = api;
    this.pluginDir = api.pluginDir || __dirname;
    this.config = null;
  }

  async init() {
    this.api.log('[STREAMALCHEMY] Initializing relaunch runtime', 'info');
    this.config = this.loadConfig();

    const logger = {
      info: msg => this.api.log(msg, 'info'),
      warn: msg => this.api.log(msg, 'warn'),
      error: msg => this.api.log(msg, 'error'),
      debug: msg => this.api.log(msg, 'debug')
    };

    this.store = new StreamAlchemyDatabase(this.api.getDatabase(), logger);
    this.store.initialize();

    this.promptService = new PromptService({ promptVersion: this.config.promptVersion });
    this.recipeService = new RecipeService(this.store, this.promptService);
    this.inventoryService = new InventoryService(this.store);
    this.overlayPublisher = new OverlayPublisher(this.api);

    this.providers = {
      localComfy: new LocalComfyProvider({
        config: this.config.localGeneration,
        dataDir: this.api.ensurePluginDataDir(),
        logger
      }),
      placeholder: new PlaceholderProvider()
    };

    this.generationService = new GenerationService(this.store, logger, {
      providerOrder: this.config.providerOrder,
      providers: this.providers
    });

    this.craftingEngine = new CraftingEngine({
      store: this.store,
      promptService: this.promptService,
      recipeService: this.recipeService,
      inventoryService: this.inventoryService,
      generationService: this.generationService,
      overlayPublisher: this.overlayPublisher,
      logger,
      config: this.config
    });

    this.eventProcessor = new EventProcessor({
      engine: this.craftingEngine,
      logger
    });

    this.systemAnalyzer = new SystemAnalyzer();
    this.legacyImporter = new LegacyImporter({
      pluginDir: this.pluginDir,
      store: this.store,
      logger
    });

    this.routes = new StreamAlchemyRoutes({
      api: this.api,
      pluginDir: this.pluginDir,
      store: this.store,
      generationService: this.generationService,
      systemAnalyzer: this.systemAnalyzer,
      legacyImporter: this.legacyImporter,
      configProvider: {
        getConfig: () => this.config,
        updateConfig: updates => this.updateConfig(updates)
      }
    });
    this.routes.register();

    this.api.registerTikTokEvent('gift', async data => {
      if (!this.config.enabled) return;
      await this.eventProcessor.handleGiftEvent(data);
    });

    this.api.log('[STREAMALCHEMY] Relaunch runtime initialized', 'info');
  }

  loadConfig() {
    const stored = this.api.getConfig('streamalchemy_config') || {};
    return {
      ...DEFAULT_CONFIG,
      ...stored,
      localGeneration: {
        ...DEFAULT_CONFIG.localGeneration,
        ...(stored.localGeneration || {})
      }
    };
  }

  updateConfig(updates) {
    this.config = {
      ...this.config,
      ...updates,
      localGeneration: {
        ...this.config.localGeneration,
        ...(updates.localGeneration || {})
      }
    };
    this.api.setConfig('streamalchemy_config', this.config);
    return this.config;
  }

  async destroy() {
    this.api.log('[STREAMALCHEMY] Relaunch runtime stopped', 'info');
  }
}

module.exports = StreamAlchemyPlugin;
```

- [x] **Step 5: Add temporary legacy importer stub used by composition**

Create `app/plugins/streamalchemy/backend/legacy-importer.js`:

```javascript
class LegacyImporter {
  constructor({ pluginDir, store, logger }) {
    this.pluginDir = pluginDir;
    this.store = store;
    this.logger = logger;
  }

  async import() {
    return {
      itemsImported: 0,
      inventoriesImported: 0,
      recipesImported: 0,
      errors: []
    };
  }
}

module.exports = LegacyImporter;
```

- [x] **Step 6: Run route tests**

Run:

```bash
cd app
npx jest --runInBand --silent test/streamalchemy-relaunch-routes.test.js
```

Expected: PASS.

- [x] **Step 7: Checkpoint**

If `.git` exists:

```bash
git add app/plugins/streamalchemy/index.js app/plugins/streamalchemy/backend/routes.js app/plugins/streamalchemy/backend/legacy-importer.js app/test/streamalchemy-relaunch-routes.test.js
git commit -m "feat(streamalchemy): wire relaunch plugin runtime"
```

Expected in the current snapshot: skip commit because `.git` is absent.

---

### Task 7: Legacy JSON Import

**Files:**
- Modify: `app/plugins/streamalchemy/backend/legacy-importer.js`
- Test: `app/test/streamalchemy-relaunch-legacy-import.test.js`

- [x] **Step 1: Write failing legacy import tests**

Create `app/test/streamalchemy-relaunch-legacy-import.test.js`:

```javascript
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const StreamAlchemyDatabase = require('../plugins/streamalchemy/backend/database');
const LegacyImporter = require('../plugins/streamalchemy/backend/legacy-importer');

function createImporter() {
  const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streamalchemy-legacy-'));
  fs.mkdirSync(path.join(pluginDir, 'data'), { recursive: true });
  const sqlite = new Database(':memory:');
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  const store = new StreamAlchemyDatabase(sqlite, logger);
  store.initialize();
  const importer = new LegacyImporter({ pluginDir, store, logger });
  return { pluginDir, store, importer };
}

describe('LegacyImporter', () => {
  test('imports legacy items, inventories, and inferred recipes idempotently', async () => {
    const { pluginDir, store, importer } = createImporter();
    fs.writeFileSync(path.join(pluginDir, 'data', 'inventory_global.json'), JSON.stringify({
      items: [
        {
          itemId: 'rose-item',
          giftId: 1,
          name: 'Essence of Rose',
          rarity: 'Common',
          imageURL: 'data:image/svg+xml;base64,rose',
          isCrafted: false,
          coinValue: 1,
          createdAt: '2026-01-01T00:00:00.000Z'
        },
        {
          itemId: 'heart-item',
          giftId: 2,
          name: 'Essence of Heart',
          rarity: 'Common',
          imageURL: 'data:image/svg+xml;base64,heart',
          isCrafted: false,
          coinValue: 5,
          createdAt: '2026-01-01T00:00:00.000Z'
        },
        {
          itemId: 'crafted-item',
          parentItems: ['rose-item', 'heart-item'],
          name: 'Fused Rose-Heart Relic',
          rarity: 'Common',
          imageURL: 'data:image/svg+xml;base64,crafted',
          isCrafted: true,
          coinValue: 6,
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      ]
    }));
    fs.writeFileSync(path.join(pluginDir, 'data', 'user_inventory.json'), JSON.stringify({
      userInventories: [
        {
          userId: 'viewer-a',
          items: [
            { itemId: 'crafted-item', quantity: 2 }
          ]
        }
      ]
    }));

    const first = await importer.import();
    const second = await importer.import();

    expect(first.itemsImported).toBe(3);
    expect(first.inventoriesImported).toBe(1);
    expect(first.recipesImported).toBe(1);
    expect(second.itemsImported).toBe(0);
    expect(store.getAllItems()).toHaveLength(3);
    expect(store.getUserInventory('viewer-a')[0].quantity).toBe(2);
    expect(store.getAllRecipes()).toHaveLength(1);
    expect(fs.existsSync(path.join(pluginDir, 'data', 'inventory_global.json'))).toBe(true);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run:

```bash
cd app
npx jest --runInBand --silent test/streamalchemy-relaunch-legacy-import.test.js
```

Expected: FAIL because the importer stub imports no records.

- [x] **Step 3: Implement idempotent import**

Replace `app/plugins/streamalchemy/backend/legacy-importer.js` with:

```javascript
const fs = require('fs').promises;
const path = require('path');
const { PROMPT_VERSION } = require('./constants');

class LegacyImporter {
  constructor({ pluginDir, store, logger }) {
    this.pluginDir = pluginDir;
    this.store = store;
    this.logger = logger;
  }

  async import() {
    const report = {
      itemsImported: 0,
      inventoriesImported: 0,
      recipesImported: 0,
      errors: []
    };

    const globalData = await this.readJson(path.join(this.pluginDir, 'data', 'inventory_global.json'), { items: [] }, report);
    const userData = await this.readJson(path.join(this.pluginDir, 'data', 'user_inventory.json'), { userInventories: [] }, report);

    for (const legacyItem of globalData.items || []) {
      if (this.store.getItemById(legacyItem.itemId)) continue;
      try {
        this.store.createItem({
          itemId: legacyItem.itemId,
          sourceType: legacyItem.isCrafted ? 'crafted' : 'gift',
          giftId: legacyItem.giftId || null,
          name: legacyItem.name || 'Imported Item',
          rarity: legacyItem.rarity || 'Common',
          coinValue: legacyItem.coinValue || 0,
          imageUrl: legacyItem.imageURL || null,
          style: legacyItem.style || 'rpg',
          promptVersion: legacyItem.promptVersion || PROMPT_VERSION,
          generator: legacyItem.generator || 'legacy'
        });
        report.itemsImported++;
      } catch (error) {
        report.errors.push(`item ${legacyItem.itemId}: ${error.message}`);
      }
    }

    for (const legacyItem of globalData.items || []) {
      if (!legacyItem.isCrafted || !Array.isArray(legacyItem.parentItems) || legacyItem.parentItems.length !== 2) continue;
      const recipeKey = this.createLegacyRecipeKey(legacyItem.parentItems[0], legacyItem.parentItems[1], legacyItem.style || 'rpg', legacyItem.promptVersion || PROMPT_VERSION);
      if (this.store.getRecipe(recipeKey)) continue;
      try {
        const [inputItemAId, inputItemBId] = [...legacyItem.parentItems].sort();
        this.store.createRecipe({
          recipeKey,
          inputItemAId,
          inputItemBId,
          style: legacyItem.style || 'rpg',
          promptVersion: legacyItem.promptVersion || PROMPT_VERSION,
          resultItemId: legacyItem.itemId
        });
        report.recipesImported++;
      } catch (error) {
        report.errors.push(`recipe ${legacyItem.itemId}: ${error.message}`);
      }
    }

    for (const userInventory of userData.userInventories || []) {
      for (const entry of userInventory.items || []) {
        const existing = this.store.getInventoryItem(userInventory.userId, entry.itemId);
        if (existing) continue;
        try {
          this.store.addInventoryItem(userInventory.userId, entry.itemId, entry.quantity || 1);
          report.inventoriesImported++;
        } catch (error) {
          report.errors.push(`inventory ${userInventory.userId}/${entry.itemId}: ${error.message}`);
        }
      }
    }

    return report;
  }

  async readJson(filePath, fallback, report) {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        report.errors.push(`${path.basename(filePath)}: ${error.message}`);
      }
      return fallback;
    }
  }

  createLegacyRecipeKey(itemAId, itemBId, style, promptVersion) {
    const [first, second] = [String(itemAId), String(itemBId)].sort();
    return `craft:v1:${first}:${second}:${style}:${promptVersion}`;
  }
}

module.exports = LegacyImporter;
```

- [x] **Step 4: Run legacy import tests**

Run:

```bash
cd app
npx jest --runInBand --silent test/streamalchemy-relaunch-legacy-import.test.js
```

Expected: PASS.

- [x] **Step 5: Checkpoint**

If `.git` exists:

```bash
git add app/plugins/streamalchemy/backend/legacy-importer.js app/test/streamalchemy-relaunch-legacy-import.test.js
git commit -m "feat(streamalchemy): import legacy streamalchemy data"
```

Expected in the current snapshot: skip commit because `.git` is absent.

---

### Task 8: Dashboard And Overlay Shells

**Files:**
- Modify: `app/plugins/streamalchemy/ui.html`
- Modify: `app/plugins/streamalchemy/overlay.html`
- Test: extend `app/test/streamalchemy-relaunch-routes.test.js`

- [x] **Step 1: Extend route test for UI and overlay assets**

Append to `app/test/streamalchemy-relaunch-routes.test.js`:

```javascript
describe('StreamAlchemy relaunch static shells', () => {
  test('ui shell contains relaunch dashboard sections', () => {
    const fs = require('fs');
    const path = require('path');
    const html = fs.readFileSync(path.join(process.cwd(), 'plugins', 'streamalchemy', 'ui.html'), 'utf8');

    expect(html).toContain('data-view="overview"');
    expect(html).toContain('data-view="items"');
    expect(html).toContain('data-view="recipes"');
    expect(html).toContain('data-view="generation-jobs"');
    expect(html).toContain('data-view="settings"');
    expect(html).toContain('data-view="migration"');
  });

  test('overlay shell listens to semantic relaunch events', () => {
    const fs = require('fs');
    const path = require('path');
    const html = fs.readFileSync(path.join(process.cwd(), 'plugins', 'streamalchemy', 'overlay.html'), 'utf8');

    expect(html).toContain('streamalchemy:base_item_obtained');
    expect(html).toContain('streamalchemy:crafting_started');
    expect(html).toContain('streamalchemy:crafting_completed');
    expect(html).toContain('streamalchemy:crafting_failed');
    expect(html).toContain('streamalchemy:recipe_cache_hit');
  });
});
```

- [x] **Step 2: Run tests to verify they fail against old HTML**

Run:

```bash
cd app
npx jest --runInBand --silent test/streamalchemy-relaunch-routes.test.js
```

Expected: FAIL because the old HTML does not contain the new shell markers.

- [x] **Step 3: Replace dashboard shell**

Replace `app/plugins/streamalchemy/ui.html` with:

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>StreamAlchemy</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #111827; color: #f9fafb; }
    header { padding: 16px 20px; border-bottom: 1px solid #374151; display: flex; justify-content: space-between; align-items: center; }
    nav { display: flex; gap: 8px; flex-wrap: wrap; padding: 12px 20px; border-bottom: 1px solid #374151; }
    button { border: 1px solid #4b5563; background: #1f2937; color: #f9fafb; padding: 8px 10px; border-radius: 6px; cursor: pointer; }
    button.active { background: #2563eb; border-color: #2563eb; }
    main { padding: 20px; }
    section { display: none; }
    section.active { display: block; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    .panel { border: 1px solid #374151; background: #1f2937; border-radius: 8px; padding: 14px; }
    .muted { color: #9ca3af; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid #374151; padding: 8px; text-align: left; }
    input, select { background: #111827; color: #f9fafb; border: 1px solid #4b5563; border-radius: 6px; padding: 8px; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>StreamAlchemy</h1>
      <div class="muted">RPG Crafting, Recipe Cache und lokale Bildgenerierung</div>
    </div>
    <button id="refresh">Aktualisieren</button>
  </header>

  <nav>
    <button class="active" data-target="overview">Overview</button>
    <button data-target="items">Items</button>
    <button data-target="recipes">Recipes</button>
    <button data-target="generation-jobs">Generation Jobs</button>
    <button data-target="settings">Settings</button>
    <button data-target="migration">Migration</button>
  </nav>

  <main>
    <section class="active" data-view="overview">
      <div class="grid">
        <div class="panel"><strong>Status</strong><div id="status" class="muted">Lade...</div></div>
        <div class="panel"><strong>Provider</strong><div id="providers" class="muted">Lade...</div></div>
        <div class="panel"><strong>System</strong><div id="system-analysis" class="muted">Lade...</div></div>
      </div>
    </section>

    <section data-view="items">
      <h2>Items</h2>
      <div id="items-table" class="panel">Lade Items...</div>
    </section>

    <section data-view="recipes">
      <h2>Recipes</h2>
      <div id="recipes-table" class="panel">Lade Rezepte...</div>
    </section>

    <section data-view="generation-jobs">
      <h2>Generation Jobs</h2>
      <div id="jobs-table" class="panel">Lade Jobs...</div>
    </section>

    <section data-view="settings">
      <h2>Settings</h2>
      <form id="settings-form" class="panel">
        <label>Crafting-Fenster ms <input name="craftingWindowMs" type="number" min="1000" max="60000"></label>
        <label>Standard-Stil <select name="defaultStyle"><option value="rpg">RPG</option><option value="fantasy">Fantasy</option><option value="pixel">Pixel</option><option value="anime">Anime</option><option value="cyberpunk">Cyberpunk</option><option value="cartoon">Cartoon</option></select></label>
        <label><input name="localEnabled" type="checkbox"> Lokale ComfyUI-Generierung aktiv</label>
        <label>ComfyUI URL <input name="comfyUrl" type="text"></label>
        <button type="submit">Speichern</button>
      </form>
    </section>

    <section data-view="migration">
      <h2>Migration</h2>
      <div class="panel">
        <p class="muted">Importiert alte JSON-Daten idempotent. Alte Dateien werden nicht gelöscht.</p>
        <button id="import-legacy">Legacy-Daten importieren</button>
        <pre id="migration-report"></pre>
      </div>
    </section>
  </main>

  <script>
    const state = { config: null };

    document.querySelectorAll('nav button').forEach(button => {
      button.addEventListener('click', () => {
        document.querySelectorAll('nav button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('main section').forEach(section => section.classList.remove('active'));
        button.classList.add('active');
        document.querySelector(`[data-view="${button.dataset.target}"]`).classList.add('active');
      });
    });

    document.getElementById('refresh').addEventListener('click', loadAll);
    document.getElementById('import-legacy').addEventListener('click', async () => {
      const response = await fetch('/api/streamalchemy/import-legacy', { method: 'POST' });
      document.getElementById('migration-report').textContent = JSON.stringify(await response.json(), null, 2);
      await loadAll();
    });

    document.getElementById('settings-form').addEventListener('submit', async event => {
      event.preventDefault();
      const form = new FormData(event.target);
      await fetch('/api/streamalchemy/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          craftingWindowMs: Number.parseInt(form.get('craftingWindowMs'), 10),
          defaultStyle: form.get('defaultStyle'),
          localGeneration: {
            enabled: form.get('localEnabled') === 'on',
            comfyUrl: form.get('comfyUrl')
          }
        })
      });
      await loadAll();
    });

    async function loadAll() {
      await Promise.all([loadConfig(), loadProviders(), loadSystem(), loadItems(), loadRecipes(), loadJobs()]);
    }

    async function loadConfig() {
      const data = await fetchJson('/api/streamalchemy/config');
      state.config = data.config;
      document.getElementById('status').textContent = state.config.enabled ? 'Aktiv' : 'Deaktiviert';
      const form = document.getElementById('settings-form');
      form.craftingWindowMs.value = state.config.craftingWindowMs;
      form.defaultStyle.value = state.config.defaultStyle;
      form.localEnabled.checked = !!state.config.localGeneration?.enabled;
      form.comfyUrl.value = state.config.localGeneration?.comfyUrl || 'http://127.0.0.1:8188';
    }

    async function loadProviders() {
      const data = await fetchJson('/api/streamalchemy/providers/status');
      document.getElementById('providers').innerHTML = data.providers.map(provider => `${provider.provider}: ${provider.state}`).join('<br>');
    }

    async function loadSystem() {
      const data = await fetchJson('/api/streamalchemy/system-analysis');
      document.getElementById('system-analysis').textContent = `${data.analysis.recommendation.backend}: ${data.analysis.recommendation.primaryModel}`;
    }

    async function loadItems() {
      const data = await fetchJson('/api/streamalchemy/items');
      document.getElementById('items-table').innerHTML = renderTable(data.items, ['name', 'source_type', 'rarity', 'generator']);
    }

    async function loadRecipes() {
      const data = await fetchJson('/api/streamalchemy/recipes');
      document.getElementById('recipes-table').innerHTML = renderTable(data.recipes, ['recipe_key', 'style', 'prompt_version', 'result_item_id']);
    }

    async function loadJobs() {
      const data = await fetchJson('/api/streamalchemy/generation-jobs');
      document.getElementById('jobs-table').innerHTML = renderTable(data.jobs, ['status', 'provider', 'model', 'error']);
    }

    async function fetchJson(url) {
      const response = await fetch(url);
      return response.json();
    }

    function renderTable(rows, keys) {
      if (!rows.length) return '<span class="muted">Keine Daten</span>';
      return `<table><thead><tr>${keys.map(key => `<th>${escapeHtml(key)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${keys.map(key => `<td>${escapeHtml(row[key] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    }

    loadAll().catch(error => {
      document.getElementById('status').textContent = error.message;
    });
  </script>
</body>
</html>
```

- [x] **Step 4: Replace overlay shell**

Replace `app/plugins/streamalchemy/overlay.html` with:

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>StreamAlchemy Overlay</title>
  <style>
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; font-family: Arial, sans-serif; }
    #stage { position: fixed; inset: 0; pointer-events: none; }
    .toast { position: absolute; left: 50%; top: 58%; transform: translate(-50%, -50%); min-width: 420px; max-width: 720px; padding: 20px; border-radius: 10px; background: rgba(17, 24, 39, 0.92); color: white; text-align: center; border: 2px solid rgba(255,255,255,0.25); animation: pop 4s ease forwards; }
    .toast img { width: 160px; height: 160px; object-fit: contain; display: block; margin: 0 auto 12px; }
    .title { font-size: 34px; font-weight: 700; }
    .meta { margin-top: 8px; color: #d1d5db; font-size: 20px; }
    @keyframes pop { 0% { opacity: 0; transform: translate(-50%, -44%) scale(0.92); } 12% { opacity: 1; transform: translate(-50%, -50%) scale(1); } 82% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -56%) scale(0.96); } }
  </style>
</head>
<body>
  <div id="stage"></div>
  <script src="/socket.io/socket.io.js"></script>
  <script>
    const socket = io();
    const queue = [];
    let running = false;

    socket.on('streamalchemy:base_item_obtained', data => enqueue({ title: 'Item erhalten', item: data.item, meta: data.userId }));
    socket.on('streamalchemy:crafting_started', data => enqueue({ title: 'Crafting startet', item: data.itemA, meta: `${data.itemA?.name || 'Item'} + ${data.itemB?.name || 'Item'}` }));
    socket.on('streamalchemy:crafting_completed', data => enqueue({ title: 'Crafting abgeschlossen', item: data.item, meta: data.userId }));
    socket.on('streamalchemy:crafting_failed', data => enqueue({ title: 'Crafting fehlgeschlagen', item: data.itemA, meta: data.error || 'Inputs wurden zurückgegeben' }));
    socket.on('streamalchemy:recipe_cache_hit', data => enqueue({ title: 'Rezept wiederverwendet', item: data.item, meta: 'Kein neues Bild generiert' }));

    function enqueue(message) {
      queue.push(message);
      runQueue();
    }

    function runQueue() {
      if (running || queue.length === 0) return;
      running = true;
      show(queue.shift());
    }

    function show(message) {
      const stage = document.getElementById('stage');
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.innerHTML = `
        ${message.item?.image_url ? `<img src="${escapeHtml(message.item.image_url)}" alt="">` : ''}
        <div class="title">${escapeHtml(message.title)}</div>
        <div class="meta">${escapeHtml(message.item?.name || message.meta || '')}</div>
      `;
      stage.appendChild(toast);
      setTimeout(() => {
        toast.remove();
        running = false;
        runQueue();
      }, 4200);
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    }
  </script>
</body>
</html>
```

- [x] **Step 5: Run route/static shell tests**

Run:

```bash
cd app
npx jest --runInBand --silent test/streamalchemy-relaunch-routes.test.js
```

Expected: PASS.

- [x] **Step 6: Checkpoint**

If `.git` exists:

```bash
git add app/plugins/streamalchemy/ui.html app/plugins/streamalchemy/overlay.html app/test/streamalchemy-relaunch-routes.test.js
git commit -m "feat(streamalchemy): add relaunch dashboard and overlay shells"
```

Expected in the current snapshot: skip commit because `.git` is absent.

---

### Task 9: Remote Provider Wiring

**Files:**
- Modify: `app/plugins/streamalchemy/index.js`
- Modify: `app/plugins/streamalchemy/backend/providers/remote-provider-adapters.js`
- Test: extend `app/test/streamalchemy-relaunch-generation.test.js`

- [x] **Step 1: Add adapter tests**

Append to `app/test/streamalchemy-relaunch-generation.test.js`:

```javascript
const { ExistingServiceProvider } = require('../plugins/streamalchemy/backend/providers/remote-provider-adapters');

describe('ExistingServiceProvider', () => {
  test('reports missing_api_key without calling generator', async () => {
    const provider = new ExistingServiceProvider({
      id: 'openai',
      model: 'dall-e-3',
      hasApiKey: () => false,
      generate: jest.fn()
    });

    await expect(provider.checkStatus()).resolves.toEqual({
      provider: 'openai',
      state: 'missing_api_key',
      model: 'dall-e-3'
    });
  });

  test('wraps existing generator result', async () => {
    const provider = new ExistingServiceProvider({
      id: 'siliconflow',
      model: 'FLUX.1-schnell',
      hasApiKey: () => true,
      generate: jest.fn().mockResolvedValue('https://image.example/item.png')
    });

    const result = await provider.generate({ prompt: 'prompt' });
    expect(result).toEqual({
      imageUrl: 'https://image.example/item.png',
      provider: 'siliconflow',
      model: 'FLUX.1-schnell'
    });
  });
});
```

- [x] **Step 2: Run adapter tests**

Run:

```bash
cd app
npx jest --runInBand --silent test/streamalchemy-relaunch-generation.test.js
```

Expected: PASS because the adapter was created in Task 3.

- [x] **Step 3: Wire OpenAI, SiliconFlow, and LightX providers in composition root**

In `app/plugins/streamalchemy/index.js`, add these imports:

```javascript
const CraftingService = require('./craftingService');
const SiliconFlowService = require('./siliconFlowService');
const LightXService = require('./lightxService');
const { ExistingServiceProvider } = require('./backend/providers/remote-provider-adapters');
```

Then replace the provider object in `init()` with:

```javascript
    const openaiKey = this.getCentralSetting('openai_api_key') || process.env.OPENAI_API_KEY || null;
    const siliconFlowKey = this.getCentralSetting('siliconflow_api_key') || process.env.SILICONFLOW_API_KEY || null;
    const lightxKey = this.getCentralSetting('lightx_api_key') || process.env.LIGHTX_API_KEY || null;
    const dalleService = new CraftingService(this.store, logger, openaiKey, null, 'Common');
    const siliconFlowService = new SiliconFlowService(logger, siliconFlowKey);
    const lightxService = new LightXService(logger, lightxKey);

    this.providers = {
      localComfy: new LocalComfyProvider({
        config: this.config.localGeneration,
        dataDir: this.api.ensurePluginDataDir(),
        logger
      }),
      siliconflow: new ExistingServiceProvider({
        id: 'siliconflow',
        model: 'FLUX.1-schnell',
        hasApiKey: () => siliconFlowService.hasApiKey(),
        generate: input => siliconFlowService.generateFusionImage({}, {}, input.prompt, { negativePrompt: input.negativePrompt })
      }),
      openai: new ExistingServiceProvider({
        id: 'openai',
        model: 'dall-e-3',
        hasApiKey: () => !!dalleService.apiKey,
        generate: input => dalleService.queueAIGeneration(input.prompt)
      }),
      lightx: new ExistingServiceProvider({
        id: 'lightx',
        model: 'LightX image2image/text2image',
        hasApiKey: () => lightxService.hasApiKey(),
        generate: input => lightxService.generateTextToImage(input.prompt, { negativePrompt: input.negativePrompt })
      }),
      placeholder: new PlaceholderProvider()
    };
```

Add this method to the class:

```javascript
  getCentralSetting(key) {
    const db = this.api.getDatabase();
    if (db && typeof db.getSetting === 'function') {
      return db.getSetting(key);
    }
    return null;
  }
```

- [x] **Step 4: Run generation and route tests**

Run:

```bash
cd app
npx jest --runInBand --silent test/streamalchemy-relaunch-generation.test.js test/streamalchemy-relaunch-routes.test.js
```

Expected: PASS.

- [x] **Step 5: Checkpoint**

If `.git` exists:

```bash
git add app/plugins/streamalchemy/index.js app/plugins/streamalchemy/backend/providers/remote-provider-adapters.js app/test/streamalchemy-relaunch-generation.test.js
git commit -m "feat(streamalchemy): wire remote image providers"
```

Expected in the current snapshot: skip commit because `.git` is absent.

---

### Task 10: Final Verification

**Files:**
- All files changed by previous tasks

- [x] **Step 1: Run focused StreamAlchemy tests**

Run:

```bash
cd app
npx jest --runInBand --silent test/streamalchemy-relaunch-database.test.js test/streamalchemy-relaunch-prompt-recipe.test.js test/streamalchemy-relaunch-generation.test.js test/streamalchemy-relaunch-system-analysis.test.js test/streamalchemy-relaunch-crafting-flow.test.js test/streamalchemy-relaunch-routes.test.js test/streamalchemy-relaunch-legacy-import.test.js
```

Expected: all seven relaunch test suites PASS.

- [x] **Step 2: Run existing StreamAlchemy service tests**

Run:

```bash
cd app
npx jest --runInBand --silent test/streamalchemy-fusion.test.js test/streamalchemy-lightx.test.js test/streamalchemy-siliconflow.test.js
```

Expected: existing three StreamAlchemy suites PASS. If they fail because the old entry file changed, update imports in those tests to target the old service files directly.

- [x] **Step 3: Run syntax checks**

Run:

```bash
cd app
Get-ChildItem -LiteralPath 'plugins\streamalchemy' -Recurse -File -Filter '*.js' | ForEach-Object { node --check $_.FullName }
```

Expected: no syntax errors.

- [x] **Step 4: Run lint**

Run:

```bash
cd app
npm run lint -- --quiet
```

Expected: PASS. If unrelated existing lint ignores remain unchanged, do not modify unrelated plugins.

- [x] **Step 5: Run CSS build**

Run:

```bash
cd app
npm run build:css
```

Expected: PASS.

- [x] **Step 6: Manual smoke test**

Start the app:

```bash
cd app
npm start
```

Open:

```text
http://localhost:3000/streamalchemy/ui
http://localhost:3000/streamalchemy/overlay
```

Expected:

- UI loads without console errors.
- Provider status endpoint returns JSON.
- System analysis endpoint returns JSON without secrets.
- Overlay loads transparent and waits for events.

- [x] **Step 7: Current snapshot checkpoint**

Because this snapshot has no `.git`, list changed files in the implementation final answer. If `.git` exists in a future checkout:

```bash
git status --short
git add app/plugins/streamalchemy app/test/streamalchemy-relaunch-*.test.js docs/superpowers/plans/2026-04-28-streamalchemy-relaunch.md docs/superpowers/specs/2026-04-28-streamalchemy-relaunch-design.md
git commit -m "feat(streamalchemy): relaunch crafting system"
```

Expected in the current snapshot: skip commit because `.git` is absent.

---

## Self-Review

Spec coverage:

- Crafting consumes two base items: Task 5.
- Recipe caching avoids repeated image generation: Task 2 and Task 5.
- Base gift items are generated once and reused by gift id: Task 1 and Task 5.
- SQLite persistence: Task 1.
- Local ComfyUI generation and system analysis: Task 3 and Task 4.
- Provider fallback: Task 3 and Task 9.
- Prompt optimization and prompt versioning: Task 2.
- UI and overlay relaunch: Task 8.
- Legacy import: Task 7.
- API key masking: Task 6.
- Tests and verification: Tasks 1 through 10.

No unresolved placeholders are intentionally present. The plan avoids destructive data migration and keeps legacy files readable.
