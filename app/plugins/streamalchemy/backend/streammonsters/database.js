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
        monster_id TEXT,
        variant TEXT NOT NULL DEFAULT 'standard',
        ready_at_ms INTEGER,
        visual_source TEXT NOT NULL DEFAULT 'egg_asset',
        visual_key TEXT
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
        personality TEXT,
        visual_source TEXT NOT NULL DEFAULT 'legacy',
        visual_key TEXT,
        is_selected INTEGER NOT NULL DEFAULT 0,
        battle_count INTEGER NOT NULL DEFAULT 0,
        win_streak INTEGER NOT NULL DEFAULT 0,
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
        last_seen_stream TEXT,
        pending_xp INTEGER NOT NULL DEFAULT 0,
        battle_win_streak INTEGER NOT NULL DEFAULT 0,
        best_battle_win_streak INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS streammonsters_battles (
        battle_id TEXT PRIMARY KEY,
        seed TEXT NOT NULL,
        monster_a_id TEXT NOT NULL,
        monster_b_id TEXT NOT NULL,
        winner_monster_id TEXT NOT NULL,
        user_a_id TEXT,
        user_b_id TEXT,
        stance_a TEXT,
        stance_b TEXT,
        rounds_json TEXT,
        result_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS streammonsters_battle_queue (
        user_id TEXT PRIMARY KEY,
        monster_id TEXT NOT NULL,
        stance TEXT NOT NULL,
        queued_at_ms INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS streammonsters_battle_queue_time
        ON streammonsters_battle_queue(queued_at_ms, user_id);

      CREATE TABLE IF NOT EXISTS streammonsters_starter_claims (
        user_id TEXT PRIMARY KEY,
        egg_id TEXT NOT NULL UNIQUE,
        claimed_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS streammonsters_viewer_identities (
        platform_user_id TEXT PRIMARY KEY,
        canonical_user_id TEXT NOT NULL UNIQUE,
        current_unique_id TEXT,
        updated_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS streammonsters_viewer_aliases (
        alias_id TEXT PRIMARY KEY,
        canonical_user_id TEXT NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS streammonsters_gift_mappings (
        gift_id INTEGER PRIMARY KEY,
        gift_name TEXT NOT NULL,
        coin_value INTEGER NOT NULL DEFAULT 0,
        element TEXT,
        egg_color TEXT,
        effect TEXT NOT NULL DEFAULT 'spawn',
        enabled INTEGER NOT NULL DEFAULT 1,
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

      CREATE TABLE IF NOT EXISTS streammonsters_hype (
        stream_key TEXT PRIMARY KEY,
        points INTEGER NOT NULL DEFAULT 0,
        charged_eggs INTEGER NOT NULL DEFAULT 0,
        updated_at_ms INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS streammonsters_art_pool (
        art_id TEXT PRIMARY KEY,
        element TEXT NOT NULL,
        variant TEXT NOT NULL,
        provider TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ready',
        image_url TEXT NOT NULL,
        visual_key TEXT NOT NULL,
        monster_id TEXT,
        created_at_ms INTEGER NOT NULL,
        consumed_at_ms INTEGER
      );
      CREATE INDEX IF NOT EXISTS streammonsters_art_pool_lookup
        ON streammonsters_art_pool(element, variant, status, created_at_ms);

      CREATE TABLE IF NOT EXISTS streammonsters_achievements (
        user_id TEXT NOT NULL,
        achievement_key TEXT NOT NULL,
        unlocked_at_ms INTEGER NOT NULL,
        PRIMARY KEY (user_id, achievement_key)
      );

      CREATE TABLE IF NOT EXISTS streammonsters_seasons (
        season_id TEXT PRIMARY KEY,
        starts_at_ms INTEGER NOT NULL,
        ends_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS streammonsters_season_scores (
        season_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        points INTEGER NOT NULL DEFAULT 0,
        title TEXT,
        badge TEXT,
        frame TEXT,
        updated_at_ms INTEGER NOT NULL,
        PRIMARY KEY (season_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS streammonsters_daily_battle_rewards (
        user_id TEXT NOT NULL,
        day_key TEXT NOT NULL,
        rewarded_battles INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, day_key)
      );

      CREATE TABLE IF NOT EXISTS streammonsters_stream_actions (
        stream_key TEXT NOT NULL,
        user_id TEXT NOT NULL,
        rewarded_at_ms INTEGER NOT NULL,
        PRIMARY KEY (stream_key, user_id)
      );
    `);
    this.ensureColumn('streammonsters_eggs', 'variant', "TEXT NOT NULL DEFAULT 'standard'");
    this.ensureColumn('streammonsters_eggs', 'ready_at_ms', 'INTEGER');
    this.ensureColumn('streammonsters_eggs', 'visual_source', "TEXT NOT NULL DEFAULT 'legacy'");
    this.ensureColumn('streammonsters_eggs', 'visual_key', 'TEXT');
    this.ensureColumn('streammonsters_monsters', 'personality', 'TEXT');
    this.ensureColumn('streammonsters_monsters', 'visual_source', "TEXT NOT NULL DEFAULT 'legacy'");
    this.ensureColumn('streammonsters_monsters', 'visual_key', 'TEXT');
    this.ensureColumn('streammonsters_monsters', 'battle_count', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('streammonsters_monsters', 'win_streak', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('streammonsters_battles', 'user_a_id', 'TEXT');
    this.ensureColumn('streammonsters_battles', 'user_b_id', 'TEXT');
    this.ensureColumn('streammonsters_battles', 'stance_a', 'TEXT');
    this.ensureColumn('streammonsters_battles', 'stance_b', 'TEXT');
    this.ensureColumn('streammonsters_battles', 'rounds_json', 'TEXT');
    this.ensureColumn('streammonsters_gift_mappings', 'enabled', 'INTEGER NOT NULL DEFAULT 1');
    this.ensureColumn('streammonsters_viewer_progress', 'pending_xp', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('streammonsters_viewer_progress', 'battle_win_streak', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('streammonsters_viewer_progress', 'best_battle_win_streak', 'INTEGER NOT NULL DEFAULT 0');
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS streammonsters_battles_created
        ON streammonsters_battles(created_at_ms);
      CREATE INDEX IF NOT EXISTS streammonsters_battles_pair_time
        ON streammonsters_battles(user_a_id, user_b_id, created_at_ms);
    `);
    this.db.prepare(`
      UPDATE streammonsters_eggs
      SET ready_at_ms = created_at_ms + hatch_duration_ms - boost_ms
      WHERE ready_at_ms IS NULL
    `).run();
  }

  ensureColumn(table, column, definition) {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all();
    if (columns.some(entry => entry.name === column)) return;
    this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
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

  getGiftMappings() {
    return this.db.prepare(`
      SELECT * FROM streammonsters_gift_mappings
      WHERE enabled = 1
      ORDER BY coin_value ASC, gift_name COLLATE NOCASE ASC
    `).all();
  }

  deleteGiftMapping(giftId) {
    return this.db.prepare('DELETE FROM streammonsters_gift_mappings WHERE gift_id = ?').run(giftId).changes > 0;
  }

  upsertGiftMapping(input) {
    const current = this.getGiftMapping(input.giftId);
    const next = {
      giftName: input.giftName || current?.gift_name || `Gift ${input.giftId}`,
      coinValue: Number.parseInt(input.coinValue ?? current?.coin_value ?? 0, 10) || 0,
      element: input.element ?? current?.element ?? null,
      eggColor: input.eggColor ?? current?.egg_color ?? null,
      effect: input.effect || current?.effect || 'spawn',
      enabled: input.enabled === undefined ? (current?.enabled ?? 1) : (input.enabled ? 1 : 0),
      imageUrl: input.imageUrl ?? current?.image_url ?? null,
      updatedAtMs: input.updatedAtMs || Date.now()
    };
    this.db.prepare(`
      INSERT INTO streammonsters_gift_mappings (
        gift_id, gift_name, coin_value, element, egg_color, effect, enabled, image_url, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(gift_id) DO UPDATE SET
        gift_name = excluded.gift_name, coin_value = excluded.coin_value,
        element = excluded.element, egg_color = excluded.egg_color, effect = excluded.effect,
        enabled = excluded.enabled, image_url = excluded.image_url, updated_at_ms = excluded.updated_at_ms
    `).run(
      input.giftId, next.giftName, next.coinValue, next.element, next.eggColor,
      next.effect, next.enabled, next.imageUrl, next.updatedAtMs
    );
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
        created_at_ms, hatch_duration_ms, boost_ms, image_url, variant, ready_at_ms,
        visual_source, visual_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'incubating', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      eggId, input.userId, input.giftId, input.giftName, input.element, input.eggColor,
      input.seed, input.createdAtMs, input.hatchDurationMs, input.initialBoostMs || 0, input.imageUrl || null,
      input.variant || 'standard',
      input.readyAtMs ?? (input.createdAtMs + input.hatchDurationMs - (input.initialBoostMs || 0)),
      input.visualSource || 'egg_asset',
      input.visualKey || null
    );
    return this.getEgg(eggId);
  }

  resolveViewerIdentity({ platformUserId = null, legacyUserId = null, updatedAtMs = Date.now() } = {}) {
    const platformId = platformUserId === null || platformUserId === undefined
      ? ''
      : String(platformUserId).trim();
    const legacyId = legacyUserId === null || legacyUserId === undefined
      ? ''
      : String(legacyUserId).trim();
    if (!platformId) return legacyId || null;
    const transaction = this.db.transaction(() => {
      const existing = this.db.prepare(`
        SELECT * FROM streammonsters_viewer_identities WHERE platform_user_id = ?
      `).get(platformId);
      if (existing) {
        this.db.prepare(`
          UPDATE streammonsters_viewer_identities
          SET current_unique_id = ?, updated_at_ms = ?
          WHERE platform_user_id = ?
        `).run(legacyId || existing.current_unique_id, updatedAtMs, platformId);
        this.recordViewerAlias(legacyId, existing.canonical_user_id, updatedAtMs);
        return existing.canonical_user_id;
      }

      const claimedLegacyIdentity = legacyId
        ? this.db.prepare(`
          SELECT 1
          FROM streammonsters_viewer_identities identity
          LEFT JOIN streammonsters_viewer_aliases alias
            ON alias.canonical_user_id = identity.canonical_user_id
          WHERE identity.canonical_user_id = ? OR alias.alias_id = ?
          LIMIT 1
        `).get(legacyId, legacyId)
        : null;
      const canonicalUserId = legacyId &&
        !claimedLegacyIdentity &&
        this.viewerDataExists(legacyId)
        ? legacyId
        : `tiktok:${platformId}`;
      this.db.prepare(`
        INSERT INTO streammonsters_viewer_identities (
          platform_user_id, canonical_user_id, current_unique_id, updated_at_ms
        ) VALUES (?, ?, ?, ?)
      `).run(platformId, canonicalUserId, legacyId || null, updatedAtMs);
      this.recordViewerAlias(legacyId, canonicalUserId, updatedAtMs);
      return canonicalUserId;
    });
    return transaction();
  }

  recordViewerAlias(aliasId, canonicalUserId, updatedAtMs) {
    if (!aliasId || !canonicalUserId) return;
    this.db.prepare(`
      INSERT OR IGNORE INTO streammonsters_viewer_aliases (
        alias_id, canonical_user_id, updated_at_ms
      ) VALUES (?, ?, ?)
    `).run(aliasId, canonicalUserId, updatedAtMs);
  }

  resolveKnownViewerId(userId) {
    const value = String(userId || '').trim();
    if (!value) return value;
    const identity = this.db.prepare(`
      SELECT canonical_user_id
      FROM streammonsters_viewer_identities
      WHERE platform_user_id = ? OR canonical_user_id = ?
      LIMIT 1
    `).get(value, value);
    if (identity) return identity.canonical_user_id;
    const alias = this.db.prepare(`
      SELECT canonical_user_id FROM streammonsters_viewer_aliases WHERE alias_id = ?
    `).get(value);
    return alias?.canonical_user_id || value;
  }

  viewerDataExists(userId) {
    return Boolean(this.db.prepare(`
      SELECT 1 FROM (
        SELECT user_id FROM streammonsters_eggs WHERE user_id = ?
        UNION ALL SELECT user_id FROM streammonsters_monsters WHERE user_id = ?
        UNION ALL SELECT user_id FROM streammonsters_viewer_progress WHERE user_id = ?
        UNION ALL SELECT user_id FROM streammonsters_quests WHERE user_id = ?
        UNION ALL SELECT user_id FROM streammonsters_achievements WHERE user_id = ?
        UNION ALL SELECT user_id FROM streammonsters_season_scores WHERE user_id = ?
        UNION ALL SELECT user_id FROM streammonsters_daily_battle_rewards WHERE user_id = ?
        UNION ALL SELECT user_id FROM streammonsters_stream_actions WHERE user_id = ?
        UNION ALL SELECT user_id FROM streammonsters_battle_queue WHERE user_id = ?
        UNION ALL SELECT user_id FROM streammonsters_starter_claims WHERE user_id = ?
      )
      LIMIT 1
    `).get(
      userId,
      userId,
      userId,
      userId,
      userId,
      userId,
      userId,
      userId,
      userId,
      userId
    ));
  }

  claimStarterEgg(input) {
    const transaction = this.db.transaction(() => {
      const eggId = input.eggId || randomUUID();
      const inserted = this.db.prepare(`
        INSERT OR IGNORE INTO streammonsters_starter_claims (user_id, egg_id, claimed_at_ms)
        VALUES (?, ?, ?)
      `).run(input.userId, eggId, input.claimedAtMs);
      if (!inserted.changes) {
        const claim = this.getStarterClaim(input.userId);
        return { claimed: false, claim, egg: claim ? this.getEgg(claim.egg_id) : null };
      }
      const egg = this.createEgg({ ...input, eggId });
      return { claimed: true, claim: this.getStarterClaim(input.userId), egg };
    });
    return transaction();
  }

  getStarterClaim(userId) {
    return this.db.prepare(`
      SELECT * FROM streammonsters_starter_claims WHERE user_id = ?
    `).get(userId) || null;
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
    this.db.prepare(`
      UPDATE streammonsters_eggs
      SET boost_ms = boost_ms + ?, ready_at_ms = MAX(created_at_ms, ready_at_ms - ?)
      WHERE egg_id = ?
    `).run(boostMs, boostMs, egg.egg_id);
    return this.getEgg(egg.egg_id);
  }

  markReadyEggs(nowMs) {
    const ready = this.db.prepare(`
      SELECT * FROM streammonsters_eggs
      WHERE state = 'incubating' AND ready_at_ms <= ?
      ORDER BY ready_at_ms ASC, egg_id ASC
    `).all(nowMs);
    if (!ready.length) return [];
    const mark = this.db.prepare("UPDATE streammonsters_eggs SET state = 'ready' WHERE egg_id = ?");
    this.db.transaction(rows => rows.forEach(row => mark.run(row.egg_id)))(ready);
    return ready.map(row => this.getEgg(row.egg_id));
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
          stats_json, image_url, personality, visual_source, visual_key,
          is_selected, created_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        monsterId, egg.user_id, egg.egg_id, monster.name, egg.element, monster.rarity,
        JSON.stringify(monster.stats), monster.imageUrl || egg.image_url || null,
        monster.personality || 'Curious', monster.visualSource || egg.visual_source || 'legacy',
        monster.visualKey || egg.visual_key || null, hasSelection ? 0 : 1, monster.createdAtMs
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
        battle_id, seed, monster_a_id, monster_b_id, winner_monster_id,
        user_a_id, user_b_id, stance_a, stance_b, rounds_json,
        result_json, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.battleId, input.seed, input.monsterAId, input.monsterBId,
      input.winnerMonsterId, input.userAId || null, input.userBId || null,
      input.stanceA || null, input.stanceB || null,
      JSON.stringify(input.result?.rounds || []),
      JSON.stringify(input.result), input.createdAtMs
    );
    return this.getBattle(input.battleId);
  }

  getBattle(battleId) {
    return this.db.prepare('SELECT * FROM streammonsters_battles WHERE battle_id = ?').get(battleId) || null;
  }

  hasRecentOpponentPair(userAId, userBId, sinceMs) {
    if (!userAId || !userBId) return false;
    return Boolean(this.db.prepare(`
      SELECT 1
      FROM streammonsters_battles battle
      LEFT JOIN streammonsters_monsters monster_a
        ON monster_a.monster_id = battle.monster_a_id
      LEFT JOIN streammonsters_monsters monster_b
        ON monster_b.monster_id = battle.monster_b_id
      WHERE battle.created_at_ms >= ?
        AND (
          (
            COALESCE(battle.user_a_id, monster_a.user_id) = ?
            AND COALESCE(battle.user_b_id, monster_b.user_id) = ?
          )
          OR (
            COALESCE(battle.user_a_id, monster_a.user_id) = ?
            AND COALESCE(battle.user_b_id, monster_b.user_id) = ?
          )
        )
      LIMIT 1
    `).get(sinceMs, userAId, userBId, userBId, userAId));
  }

  enqueueBattle({ userId, monsterId, stance, queuedAtMs }) {
    this.db.prepare(`
      INSERT INTO streammonsters_battle_queue (user_id, monster_id, stance, queued_at_ms)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        monster_id = excluded.monster_id,
        stance = excluded.stance,
        queued_at_ms = excluded.queued_at_ms
    `).run(userId, monsterId, stance, queuedAtMs);
    return this.getBattleQueueEntry(userId);
  }

  getBattleQueueEntry(userId) {
    return this.db.prepare(`
      SELECT * FROM streammonsters_battle_queue WHERE user_id = ?
    `).get(userId) || null;
  }

  getBattleQueue() {
    return this.db.prepare(`
      SELECT * FROM streammonsters_battle_queue
      ORDER BY queued_at_ms ASC, user_id ASC
    `).all();
  }

  removeBattleQueueEntry(userId) {
    return this.db.prepare(`
      DELETE FROM streammonsters_battle_queue WHERE user_id = ?
    `).run(userId).changes > 0;
  }

  purgeBattleQueue(cutoffMs) {
    return this.db.prepare(`
      DELETE FROM streammonsters_battle_queue WHERE queued_at_ms < ?
    `).run(cutoffMs).changes;
  }

  awardMonsterXp(monsterId, amount) {
    const current = this.getMonster(monsterId);
    if (!current) return null;
    let level = current.level;
    let xp = current.xp + Math.max(0, Number.parseInt(amount, 10) || 0);
    const stats = { ...current.stats };
    const seed = this.db.prepare(`
      SELECT seed FROM streammonsters_eggs WHERE egg_id = ?
    `).get(current.egg_id)?.seed || current.monster_id;
    while (xp >= 100 + (25 * (level - 1))) {
      xp -= 100 + (25 * (level - 1));
      level += 1;
      if (level <= 20 && level % 2 === 0) {
        const names = ['vitality', 'might', 'guard', 'agility'];
        const stat = names[this.hashNumber(`${seed}:level:${level}`) % names.length];
        stats[stat] = (Number(stats[stat]) || 0) + 1;
      }
    }
    this.db.prepare(`
      UPDATE streammonsters_monsters
      SET level = ?, xp = ?, stats_json = ?
      WHERE monster_id = ?
    `).run(level, xp, JSON.stringify(stats), monsterId);
    return this.getMonster(monsterId);
  }

  awardViewerXp(userId, amount, preferredMonsterId = null) {
    this.ensureViewer(userId);
    const normalizedAmount = Math.max(0, Number.parseInt(amount, 10) || 0);
    const progress = this.getViewerProgress(userId);
    const preferred = preferredMonsterId ? this.getMonster(preferredMonsterId) : null;
    const monster = preferred?.user_id === userId ? preferred : this.getSelectedMonster(userId);
    if (!monster) {
      if (normalizedAmount) {
        this.db.prepare(`
          UPDATE streammonsters_viewer_progress
          SET pending_xp = pending_xp + ?
          WHERE user_id = ?
        `).run(normalizedAmount, userId);
      }
      return null;
    }
    const total = normalizedAmount + (Number(progress.pending_xp) || 0);
    if (progress.pending_xp) {
      this.db.prepare(`
        UPDATE streammonsters_viewer_progress SET pending_xp = 0 WHERE user_id = ?
      `).run(userId);
    }
    return this.awardMonsterXp(monster.monster_id, total);
  }

  recordMonsterBattle(monsterId, won) {
    const current = this.getMonster(monsterId);
    if (!current) return null;
    this.db.prepare(`
      UPDATE streammonsters_monsters
      SET battle_count = battle_count + 1,
          win_streak = CASE WHEN ? = 1 THEN win_streak + 1 ELSE 0 END
      WHERE monster_id = ?
    `).run(won ? 1 : 0, monsterId);
    this.ensureViewer(current.user_id);
    this.db.prepare(`
      UPDATE streammonsters_viewer_progress
      SET best_battle_win_streak = CASE
            WHEN ? = 1 THEN MAX(best_battle_win_streak, battle_win_streak + 1)
            ELSE best_battle_win_streak
          END,
          battle_win_streak = CASE WHEN ? = 1 THEN battle_win_streak + 1 ELSE 0 END
      WHERE user_id = ?
    `).run(won ? 1 : 0, won ? 1 : 0, current.user_id);
    return this.getMonster(monsterId);
  }

  getViewerBattleStats(userId) {
    this.ensureViewer(userId);
    const battles = this.db.prepare(`
      SELECT
        COALESCE(SUM(battle_count), 0) AS battle_count
      FROM streammonsters_monsters
      WHERE user_id = ?
    `).get(userId);
    const progress = this.getViewerProgress(userId);
    return {
      battle_count: battles.battle_count,
      win_streak: progress.battle_win_streak,
      best_win_streak: progress.best_battle_win_streak
    };
  }

  claimDailyBattleReward(userId, dayKey, limit = 10) {
    this.db.prepare(`
      INSERT OR IGNORE INTO streammonsters_daily_battle_rewards (user_id, day_key)
      VALUES (?, ?)
    `).run(userId, dayKey);
    const row = this.db.prepare(`
      SELECT rewarded_battles FROM streammonsters_daily_battle_rewards
      WHERE user_id = ? AND day_key = ?
    `).get(userId, dayKey);
    if (row.rewarded_battles >= limit) return false;
    this.db.prepare(`
      UPDATE streammonsters_daily_battle_rewards
      SET rewarded_battles = rewarded_battles + 1
      WHERE user_id = ? AND day_key = ?
    `).run(userId, dayKey);
    return true;
  }

  claimFirstStreamAction(streamKey, userId, rewardedAtMs) {
    if (!streamKey) return false;
    return this.db.prepare(`
      INSERT OR IGNORE INTO streammonsters_stream_actions (stream_key, user_id, rewarded_at_ms)
      VALUES (?, ?, ?)
    `).run(streamKey, userId, rewardedAtMs).changes > 0;
  }

  unlockAchievement(userId, achievementKey, unlockedAtMs) {
    const inserted = this.db.prepare(`
      INSERT OR IGNORE INTO streammonsters_achievements (user_id, achievement_key, unlocked_at_ms)
      VALUES (?, ?, ?)
    `).run(userId, achievementKey, unlockedAtMs);
    const achievement = this.db.prepare(`
      SELECT * FROM streammonsters_achievements
      WHERE user_id = ? AND achievement_key = ?
    `).get(userId, achievementKey);
    return { ...achievement, unlockedNow: inserted.changes > 0 };
  }

  getViewerAchievements(userId) {
    return this.db.prepare(`
      SELECT * FROM streammonsters_achievements
      WHERE user_id = ?
      ORDER BY unlocked_at_ms ASC, achievement_key ASC
    `).all(userId);
  }

  ensureSeason(input) {
    this.db.prepare(`
      INSERT OR IGNORE INTO streammonsters_seasons (season_id, starts_at_ms, ends_at_ms)
      VALUES (?, ?, ?)
    `).run(input.seasonId, input.startsAtMs, input.endsAtMs);
    return this.getSeason(input.seasonId);
  }

  getSeason(seasonId) {
    return this.db.prepare(`
      SELECT * FROM streammonsters_seasons WHERE season_id = ?
    `).get(seasonId) || null;
  }

  addSeasonPoints(seasonId, userId, points, updatedAtMs) {
    this.db.prepare(`
      INSERT INTO streammonsters_season_scores (season_id, user_id, points, updated_at_ms)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(season_id, user_id) DO UPDATE SET
        points = points + excluded.points,
        updated_at_ms = excluded.updated_at_ms
    `).run(seasonId, userId, Math.max(0, Number(points) || 0), updatedAtMs);
    return this.getSeasonScore(seasonId, userId);
  }

  getSeasonScore(seasonId, userId) {
    return this.db.prepare(`
      SELECT * FROM streammonsters_season_scores
      WHERE season_id = ? AND user_id = ?
    `).get(seasonId, userId) || {
      season_id: seasonId,
      user_id: userId,
      points: 0,
      title: null,
      badge: null,
      frame: null
    };
  }

  setSeasonCosmetics(seasonId, userId, cosmetics, updatedAtMs) {
    this.db.prepare(`
      INSERT INTO streammonsters_season_scores (
        season_id, user_id, points, title, badge, frame, updated_at_ms
      ) VALUES (?, ?, 0, ?, ?, ?, ?)
      ON CONFLICT(season_id, user_id) DO UPDATE SET
        title = excluded.title,
        badge = excluded.badge,
        frame = excluded.frame,
        updated_at_ms = MAX(streammonsters_season_scores.updated_at_ms, excluded.updated_at_ms)
    `).run(
      seasonId,
      userId,
      cosmetics.title || null,
      cosmetics.badge || null,
      cosmetics.frame || null,
      updatedAtMs
    );
    return this.getSeasonScore(seasonId, userId);
  }

  getSeasonLeaderboard(seasonId, limit = 50) {
    return this.db.prepare(`
      SELECT * FROM streammonsters_season_scores
      WHERE season_id = ?
      ORDER BY points DESC, updated_at_ms ASC, user_id ASC
      LIMIT ?
    `).all(seasonId, Math.max(1, Math.min(100, Number(limit) || 50)));
  }

  hashNumber(value) {
    let hash = 2166136261;
    for (const char of String(value)) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  getStreamHype(streamKey) {
    const key = streamKey || 'offline';
    this.db.prepare(`
      INSERT OR IGNORE INTO streammonsters_hype (stream_key, updated_at_ms) VALUES (?, ?)
    `).run(key, Date.now());
    return this.db.prepare('SELECT * FROM streammonsters_hype WHERE stream_key = ?').get(key);
  }

  addStreamHype(streamKey, points, updatedAtMs = Date.now()) {
    const key = streamKey || 'offline';
    const current = this.getStreamHype(key);
    const total = current.points + Math.max(0, Number(points) || 0);
    const charged = total >= 100 ? 1 : 0;
    this.db.prepare(`
      UPDATE streammonsters_hype
      SET points = ?, charged_eggs = charged_eggs + ?, updated_at_ms = ?
      WHERE stream_key = ?
    `).run(charged ? 0 : total, charged, updatedAtMs, key);
    return this.getStreamHype(key);
  }

  consumeChargedEgg(streamKey, updatedAtMs = Date.now()) {
    const key = streamKey || 'offline';
    const current = this.getStreamHype(key);
    if (current.charged_eggs < 1) return false;
    this.db.prepare(`
      UPDATE streammonsters_hype
      SET charged_eggs = charged_eggs - 1, updated_at_ms = ?
      WHERE stream_key = ?
    `).run(updatedAtMs, key);
    return true;
  }

  addArtPoolSkin(input) {
    const artId = input.artId || randomUUID();
    this.db.prepare(`
      INSERT INTO streammonsters_art_pool (
        art_id, element, variant, provider, status, image_url, visual_key,
        monster_id, created_at_ms, consumed_at_ms
      ) VALUES (?, ?, ?, ?, 'ready', ?, ?, NULL, ?, NULL)
    `).run(
      artId, input.element, input.variant, input.provider, input.imageUrl,
      input.visualKey, input.createdAtMs
    );
    return this.db.prepare('SELECT * FROM streammonsters_art_pool WHERE art_id = ?').get(artId);
  }

  consumeArtPoolSkin(element, variant, monsterId = null, consumedAtMs = Date.now()) {
    const entry = this.db.prepare(`
      SELECT * FROM streammonsters_art_pool
      WHERE element = ? AND variant = ? AND status = 'ready'
      ORDER BY created_at_ms ASC, art_id ASC
      LIMIT 1
    `).get(element, variant);
    if (!entry) return null;
    this.db.prepare(`
      UPDATE streammonsters_art_pool
      SET status = 'consumed', monster_id = ?, consumed_at_ms = ?
      WHERE art_id = ?
    `).run(monsterId, consumedAtMs, entry.art_id);
    return this.db.prepare('SELECT * FROM streammonsters_art_pool WHERE art_id = ?').get(entry.art_id);
  }

  getArtPoolCoverage() {
    return this.db.prepare(`
      SELECT element, variant,
        SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) AS ready,
        SUM(CASE WHEN status = 'consumed' THEN 1 ELSE 0 END) AS consumed
      FROM streammonsters_art_pool
      GROUP BY element, variant
      ORDER BY element ASC, variant ASC
    `).all().map(row => ({
      ...row,
      ready: row.ready || 0,
      consumed: row.consumed || 0
    }));
  }

  getArtPoolReadyCount(element, variant) {
    return this.db.prepare(`
      SELECT COUNT(*) AS count FROM streammonsters_art_pool
      WHERE element = ? AND variant = ? AND status = 'ready'
    `).get(element, variant).count;
  }

  getOldestKenneyMonster(element, variant) {
    return this.db.prepare(`
      SELECT monster.*
      FROM streammonsters_monsters monster
      JOIN streammonsters_eggs egg ON egg.egg_id = monster.egg_id
      WHERE monster.visual_source = 'kenney'
        AND monster.element = ?
        AND egg.variant = ?
      ORDER BY monster.created_at_ms ASC, monster.monster_id ASC
      LIMIT 1
    `).get(element, variant) || null;
  }

  evolveMonsterVisual(monsterId, input) {
    const current = this.getMonster(monsterId);
    if (!current || current.visual_source !== 'kenney') return null;
    this.db.prepare(`
      UPDATE streammonsters_monsters
      SET image_url = ?, visual_source = 'ai', visual_key = ?
      WHERE monster_id = ? AND visual_source = 'kenney'
    `).run(input.imageUrl, input.visualKey, monsterId);
    return this.getMonster(monsterId);
  }
}

module.exports = StreamMonstersDatabase;
