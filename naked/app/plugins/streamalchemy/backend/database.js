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
