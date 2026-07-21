const { randomUUID } = require('crypto');

class StreamMonstersDatabase {
  constructor(sqlite) {
    this.db = sqlite?.db || sqlite;
  }

  initialize() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS streammonsters_eggs (
        egg_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        gift_id INTEGER NOT NULL,
        gift_name TEXT NOT NULL,
        element TEXT NOT NULL,
        egg_color TEXT NOT NULL,
        seed TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'incubating',
        created_at_ms INTEGER NOT NULL,
        hatch_duration_ms INTEGER NOT NULL,
        boost_ms INTEGER NOT NULL DEFAULT 0,
        image_url TEXT,
        monster_id TEXT
      );
      CREATE INDEX IF NOT EXISTS streammonsters_eggs_user_state
        ON streammonsters_eggs(user_id, state, created_at_ms);

      CREATE TABLE IF NOT EXISTS streammonsters_monsters (
        monster_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        egg_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        element TEXT NOT NULL,
        rarity TEXT NOT NULL,
        level INTEGER NOT NULL DEFAULT 1,
        xp INTEGER NOT NULL DEFAULT 0,
        stats_json TEXT NOT NULL,
        image_url TEXT,
        is_selected INTEGER NOT NULL DEFAULT 0,
        created_at_ms INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS streammonsters_monsters_user
        ON streammonsters_monsters(user_id, created_at_ms);

      CREATE TABLE IF NOT EXISTS streammonsters_viewer_progress (
        user_id TEXT PRIMARY KEY,
        gifts_sent INTEGER NOT NULL DEFAULT 0,
        eggs_hatched INTEGER NOT NULL DEFAULT 0,
        battles_won INTEGER NOT NULL DEFAULT 0,
        prestige INTEGER NOT NULL DEFAULT 0,
        stream_streak INTEGER NOT NULL DEFAULT 0,
        last_seen_stream TEXT
      );

      CREATE TABLE IF NOT EXISTS streammonsters_battles (
        battle_id TEXT PRIMARY KEY,
        seed TEXT NOT NULL,
        monster_a_id TEXT NOT NULL,
        monster_b_id TEXT NOT NULL,
        winner_monster_id TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS streammonsters_gift_mappings (
        gift_id INTEGER PRIMARY KEY,
        gift_name TEXT NOT NULL,
        coin_value INTEGER NOT NULL DEFAULT 0,
        element TEXT,
        egg_color TEXT,
        effect TEXT NOT NULL DEFAULT 'spawn',
        image_url TEXT,
        updated_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS streammonsters_generation_pool (
        pool_key TEXT PRIMARY KEY,
        gift_id INTEGER NOT NULL,
        gift_name TEXT NOT NULL,
        element TEXT NOT NULL,
        egg_color TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        prompt TEXT,
        image_url TEXT,
        error TEXT,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS streammonsters_quests (
        user_id TEXT NOT NULL,
        period_key TEXT NOT NULL,
        quest_key TEXT NOT NULL,
        title TEXT NOT NULL,
        target INTEGER NOT NULL,
        progress INTEGER NOT NULL DEFAULT 0,
        completed INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, period_key, quest_key)
      );

      CREATE TABLE IF NOT EXISTS streammonsters_stream_events (
        stream_key TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        element TEXT NOT NULL,
        boost_multiplier INTEGER NOT NULL,
        started_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS streammonsters_stream_metrics (
        stream_key TEXT PRIMARY KEY,
        eggs_spawned INTEGER NOT NULL DEFAULT 0,
        egg_boosts INTEGER NOT NULL DEFAULT 0,
        hatches INTEGER NOT NULL DEFAULT 0,
        duels INTEGER NOT NULL DEFAULT 0,
        quest_completions INTEGER NOT NULL DEFAULT 0
      );
    `);
  }

  ensureViewer(userId) {
    this.db.prepare(`
      INSERT INTO streammonsters_viewer_progress (user_id) VALUES (?)
      ON CONFLICT(user_id) DO NOTHING
    `).run(userId);
  }

  incrementViewer(userId, column, amount = 1) {
    const allowed = new Set(['gifts_sent', 'eggs_hatched', 'battles_won']);
    if (!allowed.has(column)) throw new Error('INVALID_STREAM_MONSTERS_PROGRESS_COLUMN');
    this.ensureViewer(userId);
    this.db.prepare(`UPDATE streammonsters_viewer_progress SET ${column} = ${column} + ? WHERE user_id = ?`)
      .run(amount, userId);
  }

  getViewerProgress(userId) {
    this.ensureViewer(userId);
    return this.db.prepare('SELECT * FROM streammonsters_viewer_progress WHERE user_id = ?').get(userId);
  }

  markViewerStream(userId, streamKey) {
    this.ensureViewer(userId);
    const current = this.getViewerProgress(userId);
    if (current.last_seen_stream === streamKey) return current;
    this.db.prepare(`
      UPDATE streammonsters_viewer_progress
      SET stream_streak = stream_streak + 1, last_seen_stream = ? WHERE user_id = ?
    `).run(streamKey, userId);
    return this.getViewerProgress(userId);
  }

  resetForPrestige(userId) {
    this.ensureViewer(userId);
    this.db.prepare(`
      UPDATE streammonsters_viewer_progress
      SET prestige = prestige + 1, gifts_sent = 0, eggs_hatched = 0, battles_won = 0, stream_streak = 0
      WHERE user_id = ?
    `).run(userId);
    return this.getViewerProgress(userId);
  }

  upsertQuestProgress({ userId, periodKey, questKey, title, target, increment = 0 }) {
    const before = this.db.prepare(`
      SELECT * FROM streammonsters_quests WHERE user_id = ? AND period_key = ? AND quest_key = ?
    `).get(userId, periodKey, questKey);
    this.db.prepare(`
      INSERT INTO streammonsters_quests (user_id, period_key, quest_key, title, target, progress, completed)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, period_key, quest_key) DO UPDATE SET
        progress = MIN(streammonsters_quests.target, streammonsters_quests.progress + excluded.progress),
        completed = CASE WHEN streammonsters_quests.progress + excluded.progress >= streammonsters_quests.target THEN 1 ELSE streammonsters_quests.completed END
    `).run(userId, periodKey, questKey, title, target, increment, increment >= target ? 1 : 0);
    const quest = this.db.prepare(`
      SELECT * FROM streammonsters_quests WHERE user_id = ? AND period_key = ? AND quest_key = ?
    `).get(userId, periodKey, questKey);
    return { ...quest, completedNow: Boolean(quest.completed && !before?.completed) };
  }

  setQuestProgress({ userId, periodKey, questKey, title, target, progress = 0 }) {
    const before = this.db.prepare(`
      SELECT * FROM streammonsters_quests WHERE user_id = ? AND period_key = ? AND quest_key = ?
    `).get(userId, periodKey, questKey);
    const normalizedProgress = Math.max(0, Math.min(target, Number(progress) || 0));
    this.db.prepare(`
      INSERT INTO streammonsters_quests (user_id, period_key, quest_key, title, target, progress, completed)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, period_key, quest_key) DO UPDATE SET
        progress = MAX(streammonsters_quests.progress, MIN(streammonsters_quests.target, excluded.progress)),
        completed = CASE
          WHEN streammonsters_quests.completed = 1 OR excluded.progress >= streammonsters_quests.target THEN 1
          ELSE 0
        END
    `).run(userId, periodKey, questKey, title, target, normalizedProgress, normalizedProgress >= target ? 1 : 0);
    const quest = this.db.prepare(`
      SELECT * FROM streammonsters_quests WHERE user_id = ? AND period_key = ? AND quest_key = ?
    `).get(userId, periodKey, questKey);
    return { ...quest, completedNow: Boolean(quest.completed && !before?.completed) };
  }

  getViewerQuests(userId, periodKey) {
    return this.db.prepare(`
      SELECT * FROM streammonsters_quests WHERE user_id = ? AND period_key = ? ORDER BY quest_key ASC
    `).all(userId, periodKey);
  }

  createStreamEvent(input) {
    this.db.prepare(`
      INSERT OR IGNORE INTO streammonsters_stream_events (
        stream_key, event_id, element, boost_multiplier, started_at_ms
      ) VALUES (?, ?, ?, ?, ?)
    `).run(input.streamKey, input.eventId, input.element, input.boostMultiplier, input.startedAtMs);
    return this.getStreamEvent(input.streamKey);
  }

  getStreamEvent(streamKey) {
    return this.db.prepare('SELECT * FROM streammonsters_stream_events WHERE stream_key = ?').get(streamKey) || null;
  }

  ensureStreamMetrics(streamKey) {
    if (!streamKey) return;
    this.db.prepare('INSERT OR IGNORE INTO streammonsters_stream_metrics (stream_key) VALUES (?)').run(streamKey);
  }

  incrementStreamMetric(streamKey, column, amount = 1) {
    const allowed = new Set(['eggs_spawned', 'egg_boosts', 'hatches', 'duels', 'quest_completions']);
    if (!streamKey || !allowed.has(column)) return;
    this.ensureStreamMetrics(streamKey);
    this.db.prepare(`UPDATE streammonsters_stream_metrics SET ${column} = ${column} + ? WHERE stream_key = ?`)
      .run(amount, streamKey);
  }

  getStreamMetrics(streamKey) {
    this.ensureStreamMetrics(streamKey);
    const metrics = this.db.prepare('SELECT * FROM streammonsters_stream_metrics WHERE stream_key = ?').get(streamKey);
    const activeViewers = this.db.prepare(`
      SELECT COUNT(*) AS count FROM streammonsters_viewer_progress WHERE last_seen_stream = ?
    `).get(streamKey).count;
    const pool = this.db.prepare(`
      SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) AS ready
      FROM streammonsters_generation_pool
    `).get();
    return {
      ...metrics,
      active_viewers: activeViewers,
      pool_total: pool.total || 0,
      pool_ready: pool.ready || 0
    };
  }

  getGiftMapping(giftId) {
    return this.db.prepare('SELECT * FROM streammonsters_gift_mappings WHERE gift_id = ?').get(giftId) || null;
  }

  upsertGiftMapping(input) {
    const current = this.getGiftMapping(input.giftId);
    const next = {
      giftName: input.giftName || current?.gift_name || `Gift ${input.giftId}`,
      coinValue: Number.parseInt(input.coinValue ?? current?.coin_value ?? 0, 10) || 0,
      element: input.element ?? current?.element ?? null,
      eggColor: input.eggColor ?? current?.egg_color ?? null,
      effect: input.effect || current?.effect || 'spawn',
      imageUrl: input.imageUrl ?? current?.image_url ?? null,
      updatedAtMs: input.updatedAtMs || Date.now()
    };
    this.db.prepare(`
      INSERT INTO streammonsters_gift_mappings (
        gift_id, gift_name, coin_value, element, egg_color, effect, image_url, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(gift_id) DO UPDATE SET
        gift_name = excluded.gift_name, coin_value = excluded.coin_value,
        element = excluded.element, egg_color = excluded.egg_color, effect = excluded.effect,
        image_url = excluded.image_url, updated_at_ms = excluded.updated_at_ms
    `).run(input.giftId, next.giftName, next.coinValue, next.element, next.eggColor, next.effect, next.imageUrl, next.updatedAtMs);
    return this.getGiftMapping(input.giftId);
  }

  upsertGenerationPool(input) {
    this.db.prepare(`
      INSERT INTO streammonsters_generation_pool (
        pool_key, gift_id, gift_name, element, egg_color, status, attempts, prompt,
        image_url, error, created_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, 'queued', 0, NULL, NULL, NULL, ?, ?)
      ON CONFLICT(pool_key) DO NOTHING
    `).run(input.poolKey, input.giftId, input.giftName, input.element, input.eggColor, input.createdAtMs, input.createdAtMs);
    return this.getGenerationPoolEntry(input.poolKey);
  }

  getGenerationPool(status = null) {
    const sql = status
      ? 'SELECT * FROM streammonsters_generation_pool WHERE status = ? ORDER BY created_at_ms ASC'
      : 'SELECT * FROM streammonsters_generation_pool ORDER BY created_at_ms ASC';
    return status ? this.db.prepare(sql).all(status) : this.db.prepare(sql).all();
  }

  getGenerationPoolEntry(poolKey) {
    return this.db.prepare('SELECT * FROM streammonsters_generation_pool WHERE pool_key = ?').get(poolKey) || null;
  }

  updateGenerationPool(poolKey, updates = {}) {
    const current = this.getGenerationPoolEntry(poolKey);
    if (!current) return null;
    this.db.prepare(`
      UPDATE streammonsters_generation_pool
      SET status = ?, attempts = ?, prompt = ?, image_url = ?, error = ?, updated_at_ms = ?
      WHERE pool_key = ?
    `).run(
      updates.status || current.status,
      updates.attempts ?? current.attempts,
      updates.prompt ?? current.prompt,
      updates.imageUrl ?? current.image_url,
      updates.error ?? current.error,
      updates.updatedAtMs || Date.now(),
      poolKey
    );
    return this.getGenerationPoolEntry(poolKey);
  }

  createEgg(input) {
    const eggId = input.eggId || randomUUID();
    this.db.prepare(`
      INSERT INTO streammonsters_eggs (
        egg_id, user_id, gift_id, gift_name, element, egg_color, seed, state,
        created_at_ms, hatch_duration_ms, boost_ms, image_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'incubating', ?, ?, ?, ?)
    `).run(
      eggId, input.userId, input.giftId, input.giftName, input.element, input.eggColor,
      input.seed, input.createdAtMs, input.hatchDurationMs, input.initialBoostMs || 0, input.imageUrl || null
    );
    return this.getEgg(eggId);
  }

  getEgg(eggId) {
    return this.db.prepare('SELECT * FROM streammonsters_eggs WHERE egg_id = ?').get(eggId) || null;
  }

  getViewerEggs(userId, state = null) {
    const sql = state
      ? 'SELECT * FROM streammonsters_eggs WHERE user_id = ? AND state = ? ORDER BY created_at_ms ASC, egg_id ASC'
      : 'SELECT * FROM streammonsters_eggs WHERE user_id = ? ORDER BY created_at_ms ASC, egg_id ASC';
    return state ? this.db.prepare(sql).all(userId, state) : this.db.prepare(sql).all(userId);
  }

  boostOldestEgg(userId, boostMs) {
    const egg = this.getViewerEggs(userId, 'incubating')[0];
    if (!egg) return null;
    this.db.prepare('UPDATE streammonsters_eggs SET boost_ms = boost_ms + ? WHERE egg_id = ?').run(boostMs, egg.egg_id);
    return this.getEgg(egg.egg_id);
  }

  createMonsterFromEgg(egg, monster) {
    const monsterId = monster.monsterId || randomUUID();
    const transaction = this.db.transaction(() => {
      const hasSelection = this.db.prepare(
        'SELECT 1 FROM streammonsters_monsters WHERE user_id = ? AND is_selected = 1'
      ).get(egg.user_id);
      this.db.prepare(`
        INSERT INTO streammonsters_monsters (
          monster_id, user_id, egg_id, name, element, rarity, level, xp,
          stats_json, image_url, is_selected, created_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?)
      `).run(
        monsterId, egg.user_id, egg.egg_id, monster.name, egg.element, monster.rarity,
        JSON.stringify(monster.stats), monster.imageUrl || egg.image_url || null,
        hasSelection ? 0 : 1, monster.createdAtMs
      );
      this.db.prepare(`
        UPDATE streammonsters_eggs SET state = 'hatched', monster_id = ? WHERE egg_id = ?
      `).run(monsterId, egg.egg_id);
    });
    transaction();
    return this.getMonster(monsterId);
  }

  getMonster(monsterId) {
    const row = this.db.prepare('SELECT * FROM streammonsters_monsters WHERE monster_id = ?').get(monsterId);
    return row ? { ...row, stats: JSON.parse(row.stats_json) } : null;
  }

  getViewerMonsters(userId) {
    return this.db.prepare(`
      SELECT * FROM streammonsters_monsters WHERE user_id = ? ORDER BY created_at_ms ASC, monster_id ASC
    `).all(userId).map(row => ({ ...row, stats: JSON.parse(row.stats_json) }));
  }

  getSelectedMonster(userId) {
    const row = this.db.prepare(`
      SELECT * FROM streammonsters_monsters WHERE user_id = ? AND is_selected = 1
    `).get(userId);
    return row ? { ...row, stats: JSON.parse(row.stats_json) } : null;
  }

  selectMonster(userId, monsterId) {
    const transaction = this.db.transaction(() => {
      this.db.prepare('UPDATE streammonsters_monsters SET is_selected = 0 WHERE user_id = ?').run(userId);
      const result = this.db.prepare(`
        UPDATE streammonsters_monsters SET is_selected = 1 WHERE user_id = ? AND monster_id = ?
      `).run(userId, monsterId);
      if (!result.changes) throw new Error('STREAM_MONSTER_NOT_OWNED');
    });
    transaction();
    return this.getSelectedMonster(userId);
  }

  createBattle(input) {
    this.db.prepare(`
      INSERT OR IGNORE INTO streammonsters_battles (
        battle_id, seed, monster_a_id, monster_b_id, winner_monster_id, result_json, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.battleId, input.seed, input.monsterAId, input.monsterBId,
      input.winnerMonsterId, JSON.stringify(input.result), input.createdAtMs
    );
    return this.getBattle(input.battleId);
  }

  getBattle(battleId) {
    return this.db.prepare('SELECT * FROM streammonsters_battles WHERE battle_id = ?').get(battleId) || null;
  }
}

module.exports = StreamMonstersDatabase;
