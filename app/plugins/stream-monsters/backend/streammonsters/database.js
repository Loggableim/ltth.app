const { randomUUID } = require('crypto');
const { deterministicTemplateId, getTemplate } = require('./catalog');
const {
  evolutionStatGrant,
  applyEvolutionGrant: applyEvolutionStatGrant,
  effectiveCombatPower
} = require('./evolution-rules');

const FREE_EGG_PUBLIC_WINDOW_MS = 300_000;

class StreamMonstersDatabase {
  constructor(sqlite, { logger = null, assetRegistry = null } = {}) {
    this.db = sqlite?.db || sqlite;
    this.logger = logger;
    this.assetRegistry = assetRegistry;
    this.transactionDepth = 0;
    this.afterCommitCallbacks = null;
  }

  runInTransaction(operation) {
    return this.runTransaction(operation, false);
  }

  runInImmediateTransaction(operation) {
    return this.runTransaction(operation, true);
  }

  runTransaction(operation, immediate) {
    if (this.transactionDepth > 0) return operation();
    const callbacks = [];
    this.transactionDepth = 1;
    this.afterCommitCallbacks = callbacks;
    let result;
    try {
      const transaction = this.db.transaction(operation);
      result = immediate && typeof transaction.immediate === 'function'
        ? transaction.immediate()
        : transaction();
    } catch (error) {
      this.transactionDepth = 0;
      this.afterCommitCallbacks = null;
      throw error;
    }
    this.transactionDepth = 0;
    this.afterCommitCallbacks = null;
    callbacks.forEach(callback => this.invokeAfterCommit(callback));
    return result;
  }

  invokeAfterCommit(callback) {
    try {
      callback();
    } catch (error) {
      const message = `[STREAM MONSTERS] afterCommit callback failed: ${error.message}`;
      if (typeof this.logger === 'function') this.logger(message, error);
      else this.logger?.error?.(message, error);
    }
  }

  afterCommit(callback) {
    if (this.afterCommitCallbacks) {
      this.afterCommitCallbacks.push(callback);
      return;
    }
    this.invokeAfterCommit(callback);
  }

  initialize() {
    const migrate = () => {
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
        queued_at_ms INTEGER,
        incubating_at_ms INTEGER,
        expires_at_ms INTEGER,
        expired_at_ms INTEGER,
        visual_source TEXT NOT NULL DEFAULT 'egg_asset',
        visual_key TEXT,
        provenance TEXT NOT NULL DEFAULT 'legacy',
        ownership_state TEXT NOT NULL DEFAULT 'owned',
        free_offer_id TEXT,
        display_name TEXT,
        avatar_ref TEXT
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
        asset_version TEXT,
        template_id TEXT,
        is_selected INTEGER NOT NULL DEFAULT 0,
        battle_count INTEGER NOT NULL DEFAULT 0,
        win_streak INTEGER NOT NULL DEFAULT 0,
        evolution_stage INTEGER NOT NULL DEFAULT 1,
        evolution_essence_spent INTEGER NOT NULL DEFAULT 0,
        collection_state TEXT NOT NULL DEFAULT 'owned',
        archived_at_ms INTEGER,
        archived_reason TEXT,
        archived_by_fusion_id TEXT,
        prestige_level INTEGER NOT NULL DEFAULT 0,
        created_at_ms INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS streammonsters_monsters_user
        ON streammonsters_monsters(user_id, created_at_ms);

      CREATE TABLE IF NOT EXISTS streammonsters_evolution_grants (
        monster_id TEXT NOT NULL,
        stage INTEGER NOT NULL CHECK (stage IN (2, 3)),
        stats_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        PRIMARY KEY (monster_id, stage),
        FOREIGN KEY (monster_id) REFERENCES streammonsters_monsters(monster_id)
      );

      CREATE TABLE IF NOT EXISTS streammonsters_fusion_ledger (
        fusion_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        template_id TEXT NOT NULL,
        survivor_monster_id TEXT NOT NULL,
        donor_monster_id TEXT NOT NULL UNIQUE,
        from_stage INTEGER NOT NULL CHECK (from_stage IN (1, 2, 3)),
        to_stage INTEGER NOT NULL CHECK (to_stage IN (2, 3)),
        prestige_before INTEGER NOT NULL DEFAULT 0,
        prestige_after INTEGER NOT NULL DEFAULT 0,
        trigger_type TEXT NOT NULL,
        trigger_id TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        UNIQUE (trigger_type, trigger_id)
      );
      CREATE TRIGGER IF NOT EXISTS streammonsters_fusion_ledger_no_update
        BEFORE UPDATE ON streammonsters_fusion_ledger
        BEGIN
          SELECT RAISE(ABORT, 'STREAM_MONSTERS_FUSION_LEDGER_APPEND_ONLY');
        END;
      CREATE TRIGGER IF NOT EXISTS streammonsters_fusion_ledger_no_delete
        BEFORE DELETE ON streammonsters_fusion_ledger
        BEGIN
          SELECT RAISE(ABORT, 'STREAM_MONSTERS_FUSION_LEDGER_APPEND_ONLY');
        END;

      CREATE TABLE IF NOT EXISTS streammonsters_fusion_contacts (
        contact_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        result TEXT NOT NULL DEFAULT 'pending',
        fusion_id TEXT,
        processed_at_ms INTEGER NOT NULL
      );

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

      CREATE TABLE IF NOT EXISTS streammonsters_viewer_onboarding (
        user_id TEXT NOT NULL,
        step_key TEXT NOT NULL,
        completed_at_ms INTEGER NOT NULL,
        PRIMARY KEY (user_id, step_key)
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
        rules_version INTEGER,
        skills_json TEXT,
        result_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS streammonsters_battle_queue (
        user_id TEXT PRIMARY KEY,
        monster_id TEXT NOT NULL,
        stance TEXT NOT NULL,
        stream_key TEXT,
        queued_power INTEGER,
        queued_at_ms INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS streammonsters_battle_queue_time
        ON streammonsters_battle_queue(queued_at_ms, user_id);

      CREATE TABLE IF NOT EXISTS streammonsters_queue_dodges (
        viewer_id TEXT PRIMARY KEY,
        window_started_ms INTEGER NOT NULL,
        dodge_count INTEGER NOT NULL DEFAULT 0,
        cooldown_until_ms INTEGER NOT NULL DEFAULT 0,
        updated_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS streammonsters_starter_claims (
        user_id TEXT PRIMARY KEY,
        egg_id TEXT NOT NULL UNIQUE,
        claimed_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS streammonsters_free_egg_offers (
        offer_id TEXT PRIMARY KEY,
        stream_key TEXT NOT NULL,
        source_user_id TEXT NOT NULL,
        source_display_name TEXT,
        offer_event_id TEXT NOT NULL UNIQUE,
        offered_at_ms INTEGER NOT NULL,
        reserved_until_ms INTEGER NOT NULL,
        public_expires_at_ms INTEGER,
        status TEXT NOT NULL CHECK (status IN ('reserved', 'public', 'claimed', 'expired')),
        claimed_by_user_id TEXT,
        claimed_at_ms INTEGER,
        element TEXT,
        variant TEXT NOT NULL DEFAULT 'standard',
        image_url TEXT,
        source_avatar_ref TEXT,
        stage_state TEXT NOT NULL DEFAULT 'reserved',
        UNIQUE (stream_key, source_user_id)
      );
      CREATE INDEX IF NOT EXISTS streammonsters_free_egg_offers_public_fifo
        ON streammonsters_free_egg_offers(stream_key, status, offered_at_ms, offer_id);

      CREATE TABLE IF NOT EXISTS streammonsters_free_egg_claims (
        claim_id TEXT PRIMARY KEY,
        offer_id TEXT NOT NULL UNIQUE,
        stream_key TEXT NOT NULL,
        user_id TEXT NOT NULL,
        claim_event_id TEXT NOT NULL UNIQUE,
        claimed_at_ms INTEGER NOT NULL,
        FOREIGN KEY (offer_id) REFERENCES streammonsters_free_egg_offers(offer_id)
      );
      CREATE INDEX IF NOT EXISTS streammonsters_free_egg_claims_cooldown
        ON streammonsters_free_egg_claims(user_id, claimed_at_ms DESC);

      CREATE TABLE IF NOT EXISTS streammonsters_free_egg_events (
        event_id TEXT PRIMARY KEY,
        stream_key TEXT NOT NULL,
        event_type TEXT NOT NULL CHECK (event_type IN ('first_chat', 'adopt')),
        result_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS streammonsters_free_egg_events_stream
        ON streammonsters_free_egg_events(stream_key, created_at_ms);

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
        template_id TEXT,
        monster_id TEXT,
        created_at_ms INTEGER NOT NULL,
        consumed_at_ms INTEGER
      );
      CREATE INDEX IF NOT EXISTS streammonsters_art_pool_lookup
        ON streammonsters_art_pool(element, variant, status, created_at_ms);

      CREATE TABLE IF NOT EXISTS streammonsters_template_shuffle_bags (
        user_id TEXT NOT NULL, element TEXT NOT NULL, cycle INTEGER NOT NULL,
        position INTEGER NOT NULL DEFAULT 0, order_json TEXT NOT NULL,
        PRIMARY KEY (user_id, element)
      );
      CREATE TABLE IF NOT EXISTS streammonsters_template_reservations (
        egg_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, element TEXT NOT NULL,
        template_id TEXT NOT NULL, cycle INTEGER NOT NULL, position INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS streammonsters_template_reservations_viewer
        ON streammonsters_template_reservations(user_id, element, template_id);
      CREATE TABLE IF NOT EXISTS streammonsters_template_mastery (
        user_id TEXT NOT NULL, template_id TEXT NOT NULL, points INTEGER NOT NULL DEFAULT 0,
        unlocks_json TEXT NOT NULL DEFAULT '[]', PRIMARY KEY (user_id, template_id)
      );
      CREATE TABLE IF NOT EXISTS streammonsters_element_essence (
        user_id TEXT NOT NULL, element TEXT NOT NULL, amount INTEGER NOT NULL DEFAULT 0,
        spent INTEGER NOT NULL DEFAULT 0, unlocks_json TEXT NOT NULL DEFAULT '[]',
        PRIMARY KEY (user_id, element)
      );
      CREATE TABLE IF NOT EXISTS streammonsters_gift_event_claims (
        stream_key TEXT NOT NULL, event_key TEXT NOT NULL, claimed_at_ms INTEGER NOT NULL,
        PRIMARY KEY (stream_key, event_key)
      );
      CREATE TABLE IF NOT EXISTS streammonsters_element_shuffle_bags (
        stream_key TEXT NOT NULL, gift_id INTEGER NOT NULL, cycle INTEGER NOT NULL,
        position INTEGER NOT NULL DEFAULT 0, order_json TEXT NOT NULL,
        PRIMARY KEY (stream_key, gift_id)
      );
      CREATE TABLE IF NOT EXISTS streammonsters_collection_actions (
        action_key TEXT PRIMARY KEY, created_at_ms INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS streammonsters_collection_cosmetics (
        user_id TEXT NOT NULL, cosmetic_key TEXT NOT NULL, unlocked_at_ms INTEGER NOT NULL,
        PRIMARY KEY (user_id, cosmetic_key)
      );
      CREATE TABLE IF NOT EXISTS streammonsters_stream_missions (
        stream_key TEXT PRIMARY KEY, mission_key TEXT NOT NULL, target INTEGER NOT NULL,
        progress INTEGER NOT NULL DEFAULT 0, completed_at_ms INTEGER,
        population_band TEXT, population_peak INTEGER
      );
      CREATE TABLE IF NOT EXISTS streammonsters_stream_mission_participants (
        stream_key TEXT NOT NULL, user_id TEXT NOT NULL, selected_monster_id TEXT,
        rewarded_at_ms INTEGER, PRIMARY KEY (stream_key, user_id)
      );
      CREATE TABLE IF NOT EXISTS streammonsters_stream_mission_elements (
        stream_key TEXT NOT NULL, element TEXT NOT NULL,
        PRIMARY KEY (stream_key, element)
      );
      CREATE TABLE IF NOT EXISTS streammonsters_heart_chains (
        stream_key TEXT PRIMARY KEY, last_user_id TEXT, last_gift_at_ms INTEGER,
        chain_length INTEGER NOT NULL DEFAULT 0, awarded_json TEXT NOT NULL DEFAULT '[]'
      );

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

      CREATE TABLE IF NOT EXISTS streammonsters_matches (
        match_id TEXT PRIMARY KEY,
        state TEXT NOT NULL CHECK (
          state IN ('roster', 'action', 'finalizing', 'completed', 'cancelled')
        ),
        phase_version INTEGER NOT NULL DEFAULT 1,
        seed TEXT NOT NULL,
        rules_version INTEGER NOT NULL DEFAULT 5,
        matchmaking_level_gap INTEGER NOT NULL DEFAULT 2,
        matchmaking_power_gap INTEGER NOT NULL DEFAULT 10,
        round_number INTEGER NOT NULL DEFAULT 0,
        roster_deadline_ms INTEGER,
        action_opened_at_ms INTEGER,
        action_deadline_ms INTEGER,
        charge_paused_ms INTEGER NOT NULL DEFAULT 0,
        charge_pause_started_at_ms INTEGER,
        charge_pause_until_ms INTEGER,
        charge_pause_reason TEXT,
        winner_monster_id TEXT,
        result_json TEXT,
        finalized_at_ms INTEGER,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        completed_at_ms INTEGER
      );
      CREATE INDEX IF NOT EXISTS streammonsters_matches_state_deadline
        ON streammonsters_matches(state, roster_deadline_ms, action_deadline_ms);

      CREATE TABLE IF NOT EXISTS streammonsters_match_participants (
        match_id TEXT NOT NULL,
        participant_id TEXT NOT NULL,
        viewer_id TEXT NOT NULL,
        slot INTEGER NOT NULL CHECK (slot IN (1, 2)),
        queued_monster_id TEXT NOT NULL,
        queued_level INTEGER,
        queued_power INTEGER,
        locked_monster_id TEXT,
        locked_power INTEGER,
        roster_json TEXT,
        combat_state_json TEXT,
        rating_before INTEGER,
        rating_after INTEGER,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        PRIMARY KEY (match_id, participant_id),
        UNIQUE (match_id, slot),
        UNIQUE (match_id, viewer_id),
        FOREIGN KEY (match_id) REFERENCES streammonsters_matches(match_id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS streammonsters_one_active_match_per_viewer
        ON streammonsters_match_participants(viewer_id) WHERE active = 1;
      CREATE UNIQUE INDEX IF NOT EXISTS streammonsters_one_active_match_per_monster
        ON streammonsters_match_participants(locked_monster_id)
        WHERE active = 1 AND locked_monster_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS streammonsters_match_decisions (
        match_id TEXT NOT NULL,
        participant_id TEXT NOT NULL,
        window_kind TEXT NOT NULL CHECK (window_kind IN ('action', 'stat')),
        window_sequence INTEGER NOT NULL,
        choice TEXT NOT NULL,
        requested_choice TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('viewer', 'timeout')),
        event_id TEXT,
        event_sequence INTEGER,
        charge_at_choice INTEGER,
        created_at_ms INTEGER NOT NULL,
        PRIMARY KEY (match_id, participant_id, window_kind, window_sequence),
        UNIQUE (event_id),
        FOREIGN KEY (match_id, participant_id)
          REFERENCES streammonsters_match_participants(match_id, participant_id)
      );

      CREATE TABLE IF NOT EXISTS streammonsters_match_actions (
        match_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        round_number INTEGER NOT NULL,
        actor_participant_id TEXT NOT NULL,
        event_id TEXT NOT NULL UNIQUE,
        event_sequence INTEGER,
        action_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        PRIMARY KEY (match_id, sequence),
        FOREIGN KEY (match_id) REFERENCES streammonsters_matches(match_id)
      );

      CREATE TABLE IF NOT EXISTS streammonsters_match_events (
        match_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        event_id TEXT NOT NULL UNIQUE,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        public_payload_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        PRIMARY KEY (match_id, sequence),
        FOREIGN KEY (match_id) REFERENCES streammonsters_matches(match_id)
      );

      CREATE TABLE IF NOT EXISTS streammonsters_event_outbox (
        event_id TEXT PRIMARY KEY,
        correlation_id TEXT NOT NULL,
        stream_key TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        delivered_at_ms INTEGER,
        delivery_attempts INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS streammonsters_event_outbox_pending
        ON streammonsters_event_outbox(delivered_at_ms, created_at_ms, event_id);
      CREATE TABLE IF NOT EXISTS streammonsters_public_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        correlation_id TEXT NOT NULL,
        stream_key TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS streammonsters_public_events_stream_cursor
        ON streammonsters_public_events(stream_key, sequence);

      CREATE TABLE IF NOT EXISTS streammonsters_command_ingress_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        command_name TEXT NOT NULL,
        user_id TEXT NOT NULL,
        transport TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        expires_at_ms INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS streammonsters_command_ingress_events_expiry
        ON streammonsters_command_ingress_events(expires_at_ms);

      CREATE TABLE IF NOT EXISTS streammonsters_match_rewards (
        match_id TEXT NOT NULL,
        participant_id TEXT NOT NULL,
        xp_awarded INTEGER NOT NULL,
        arena_eligible INTEGER NOT NULL CHECK (arena_eligible IN (0, 1)),
        rating_delta INTEGER NOT NULL DEFAULT 0,
        claimed_at_ms INTEGER NOT NULL,
        PRIMARY KEY (match_id, participant_id),
        FOREIGN KEY (match_id, participant_id)
          REFERENCES streammonsters_match_participants(match_id, participant_id)
      );

      CREATE TABLE IF NOT EXISTS streammonsters_stat_prompts (
        prompt_id TEXT PRIMARY KEY,
        match_id TEXT NOT NULL,
        participant_id TEXT NOT NULL,
        viewer_id TEXT NOT NULL,
        monster_id TEXT NOT NULL,
        deadline_ms INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('open', 'claimed', 'expired')),
        choice TEXT,
        event_id TEXT UNIQUE,
        created_at_ms INTEGER NOT NULL,
        claimed_at_ms INTEGER,
        UNIQUE (match_id, monster_id),
        FOREIGN KEY (match_id, participant_id)
          REFERENCES streammonsters_match_participants(match_id, participant_id)
      );
      CREATE INDEX IF NOT EXISTS streammonsters_stat_prompts_viewer_open
        ON streammonsters_stat_prompts(viewer_id, status, deadline_ms);

      CREATE TABLE IF NOT EXISTS streammonsters_stat_allocations (
        prompt_id TEXT PRIMARY KEY,
        viewer_id TEXT NOT NULL,
        monster_id TEXT NOT NULL,
        source_key TEXT NOT NULL UNIQUE,
        deadline_ms INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('open', 'claimed', 'expired')),
        choice TEXT,
        event_id TEXT UNIQUE,
        created_at_ms INTEGER NOT NULL,
        claimed_at_ms INTEGER
      );
      CREATE UNIQUE INDEX IF NOT EXISTS streammonsters_one_open_stat_allocation
        ON streammonsters_stat_allocations(monster_id) WHERE status = 'open';
      CREATE INDEX IF NOT EXISTS streammonsters_stat_allocations_viewer_open
        ON streammonsters_stat_allocations(viewer_id, status, deadline_ms);

      CREATE TABLE IF NOT EXISTS streammonsters_arena_seasons (
        season_id TEXT PRIMARY KEY,
        starts_at_ms INTEGER NOT NULL,
        ends_at_ms INTEGER NOT NULL,
        duration_days INTEGER NOT NULL CHECK (duration_days IN (7, 14, 28, 60, 90))
      );

      CREATE TABLE IF NOT EXISTS streammonsters_arena_ratings (
        season_id TEXT NOT NULL,
        viewer_id TEXT NOT NULL,
        rating INTEGER NOT NULL DEFAULT 900,
        battles_rated INTEGER NOT NULL DEFAULT 0,
        updated_at_ms INTEGER NOT NULL,
        PRIMARY KEY (season_id, viewer_id),
        FOREIGN KEY (season_id) REFERENCES streammonsters_arena_seasons(season_id)
      );

      CREATE TABLE IF NOT EXISTS streammonsters_arena_daily_ledger (
        viewer_id TEXT NOT NULL,
        day_key TEXT NOT NULL,
        rated_battles INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (viewer_id, day_key)
      );
    `);
    this.ensureColumn('streammonsters_eggs', 'variant', "TEXT NOT NULL DEFAULT 'standard'");
    this.ensureColumn('streammonsters_eggs', 'ready_at_ms', 'INTEGER');
    this.ensureColumn('streammonsters_eggs', 'queued_at_ms', 'INTEGER');
    this.ensureColumn('streammonsters_eggs', 'incubating_at_ms', 'INTEGER');
    this.ensureColumn('streammonsters_eggs', 'expires_at_ms', 'INTEGER');
    this.ensureColumn('streammonsters_eggs', 'expired_at_ms', 'INTEGER');
    this.ensureColumn('streammonsters_eggs', 'visual_source', "TEXT NOT NULL DEFAULT 'legacy'");
    this.ensureColumn('streammonsters_eggs', 'visual_key', 'TEXT');
    this.ensureColumn('streammonsters_eggs', 'provenance', "TEXT NOT NULL DEFAULT 'legacy'");
    this.ensureColumn('streammonsters_eggs', 'ownership_state', "TEXT NOT NULL DEFAULT 'owned'");
    this.ensureColumn('streammonsters_eggs', 'free_offer_id', 'TEXT');
    this.ensureColumn('streammonsters_eggs', 'display_name', 'TEXT');
    this.ensureColumn('streammonsters_eggs', 'avatar_ref', 'TEXT');
    this.ensureColumn('streammonsters_free_egg_offers', 'element', 'TEXT');
    this.ensureColumn('streammonsters_free_egg_offers', 'variant', "TEXT NOT NULL DEFAULT 'standard'");
    this.ensureColumn('streammonsters_free_egg_offers', 'image_url', 'TEXT');
    this.ensureColumn('streammonsters_free_egg_offers', 'source_avatar_ref', 'TEXT');
    this.ensureColumn('streammonsters_free_egg_offers', 'stage_state', "TEXT NOT NULL DEFAULT 'reserved'");
    this.ensureColumn('streammonsters_free_egg_offers', 'public_expires_at_ms', 'INTEGER');
    this.migrateFreeEggOfferStatusConstraint();
    this.db.prepare(`
      UPDATE streammonsters_free_egg_offers
      SET stage_state = status
      WHERE status IN ('reserved', 'public', 'claimed', 'expired')
        AND (stage_state IS NULL OR stage_state != status)
    `).run();
    this.db.prepare(`
      UPDATE streammonsters_free_egg_offers
      SET public_expires_at_ms = reserved_until_ms + ?
      WHERE public_expires_at_ms IS NULL
        OR public_expires_at_ms != reserved_until_ms + ?
    `).run(FREE_EGG_PUBLIC_WINDOW_MS, FREE_EGG_PUBLIC_WINDOW_MS);
    this.db.prepare(`
      UPDATE streammonsters_eggs
      SET provenance = 'free', ownership_state = 'owned'
      WHERE free_offer_id IS NOT NULL
        OR (
          gift_id = ?
          AND lower(trim(gift_name)) = ?
        )
    `).run(0, 'free egg drop');
    this.ensureColumn('streammonsters_monsters', 'personality', 'TEXT');
    this.ensureColumn('streammonsters_monsters', 'visual_source', "TEXT NOT NULL DEFAULT 'legacy'");
    this.ensureColumn('streammonsters_monsters', 'visual_key', 'TEXT');
    this.ensureColumn('streammonsters_monsters', 'asset_version', 'TEXT');
    this.ensureColumn('streammonsters_monsters', 'template_id', 'TEXT');
    this.ensureColumn('streammonsters_art_pool', 'template_id', 'TEXT');
    this.ensureColumn('streammonsters_monsters', 'battle_count', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('streammonsters_monsters', 'win_streak', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('streammonsters_monsters', 'evolution_stage', 'INTEGER NOT NULL DEFAULT 1');
    this.ensureColumn('streammonsters_monsters', 'evolution_essence_spent', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('streammonsters_monsters', 'unspent_stat_points', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('streammonsters_monsters', 'collection_state', "TEXT NOT NULL DEFAULT 'owned'");
    this.ensureColumn('streammonsters_monsters', 'archived_at_ms', 'INTEGER');
    this.ensureColumn('streammonsters_monsters', 'archived_reason', 'TEXT');
    this.ensureColumn('streammonsters_monsters', 'archived_by_fusion_id', 'TEXT');
    this.ensureColumn('streammonsters_monsters', 'prestige_level', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('streammonsters_element_essence', 'spent', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('streammonsters_battles', 'user_a_id', 'TEXT');
    this.ensureColumn('streammonsters_battles', 'user_b_id', 'TEXT');
    this.ensureColumn('streammonsters_battles', 'stance_a', 'TEXT');
    this.ensureColumn('streammonsters_battles', 'stance_b', 'TEXT');
    this.ensureColumn('streammonsters_battles', 'rounds_json', 'TEXT');
    this.ensureColumn('streammonsters_battles', 'rules_version', 'INTEGER');
    this.ensureColumn('streammonsters_battles', 'skills_json', 'TEXT');
    this.ensureColumn('streammonsters_battles', 'match_id', 'TEXT');
    this.ensureColumn('streammonsters_battles', 'replay_version', 'INTEGER');
    this.ensureColumn('streammonsters_match_decisions', 'event_sequence', 'INTEGER');
    this.ensureColumn('streammonsters_match_decisions', 'charge_at_choice', 'INTEGER');
    this.ensureColumn('streammonsters_match_actions', 'event_sequence', 'INTEGER');
    this.ensureColumn('streammonsters_matches', 'action_opened_at_ms', 'INTEGER');
    this.ensureColumn('streammonsters_matches', 'charge_paused_ms', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('streammonsters_matches', 'charge_pause_started_at_ms', 'INTEGER');
    this.ensureColumn('streammonsters_matches', 'charge_pause_until_ms', 'INTEGER');
    this.ensureColumn('streammonsters_matches', 'charge_pause_reason', 'TEXT');
    this.ensureColumn(
      'streammonsters_matches',
      'matchmaking_level_gap',
      'INTEGER NOT NULL DEFAULT 2'
    );
    this.ensureColumn(
      'streammonsters_matches',
      'matchmaking_power_gap',
      'INTEGER NOT NULL DEFAULT 10'
    );
    this.ensureColumn('streammonsters_match_participants', 'queued_level', 'INTEGER');
    this.ensureColumn('streammonsters_match_participants', 'queued_power', 'INTEGER');
    this.ensureColumn('streammonsters_match_participants', 'locked_power', 'INTEGER');
    this.ensureColumn('streammonsters_battle_queue', 'stream_key', 'TEXT');
    this.ensureColumn('streammonsters_battle_queue', 'queued_power', 'INTEGER');
    this.ensureColumn('streammonsters_gift_mappings', 'enabled', 'INTEGER NOT NULL DEFAULT 1');
    this.ensureColumn('streammonsters_viewer_progress', 'pending_xp', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('streammonsters_viewer_progress', 'battle_win_streak', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('streammonsters_viewer_progress', 'best_battle_win_streak', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('streammonsters_stream_missions', 'population_band', 'TEXT');
    this.ensureColumn('streammonsters_stream_missions', 'population_peak', 'INTEGER');
    this.db.prepare(`
      UPDATE streammonsters_eggs
      SET provenance = CASE
          WHEN provenance IN ('gift', 'free', 'legacy') THEN provenance
          ELSE 'legacy'
        END,
        ownership_state = 'owned'
      WHERE provenance IS NULL
        OR provenance NOT IN ('gift', 'free', 'legacy')
        OR ownership_state IS NULL
        OR ownership_state != 'owned'
    `).run();
    this.db.prepare(`
      UPDATE streammonsters_monsters
      SET evolution_essence_spent = CASE
        WHEN evolution_stage >= 3 THEN 8
        WHEN evolution_stage = 2 THEN 3
        ELSE evolution_essence_spent
      END
      WHERE evolution_essence_spent = 0 AND evolution_stage >= 2
    `).run();
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS streammonsters_eggs_state_ready_deadline
        ON streammonsters_eggs(state, ready_at_ms, egg_id);
      CREATE INDEX IF NOT EXISTS streammonsters_eggs_state_expiry_deadline
        ON streammonsters_eggs(state, expires_at_ms, egg_id);
      CREATE INDEX IF NOT EXISTS streammonsters_monsters_user_template
        ON streammonsters_monsters(user_id, template_id, created_at_ms);
      CREATE INDEX IF NOT EXISTS streammonsters_monsters_owned_template_stage
        ON streammonsters_monsters(
          user_id, template_id, evolution_stage, prestige_level, created_at_ms
        )
        WHERE collection_state = 'owned';
      CREATE INDEX IF NOT EXISTS streammonsters_art_pool_template_lookup
        ON streammonsters_art_pool(element, variant, template_id, status, created_at_ms);
      CREATE INDEX IF NOT EXISTS streammonsters_battles_created
        ON streammonsters_battles(created_at_ms);
      CREATE INDEX IF NOT EXISTS streammonsters_battles_pair_time
        ON streammonsters_battles(user_a_id, user_b_id, created_at_ms);
    `);
    this.db.prepare(`
      UPDATE streammonsters_eggs
      SET ready_at_ms = created_at_ms + hatch_duration_ms - boost_ms
      WHERE ready_at_ms IS NULL AND state != 'queued'
    `).run();
      this.migrateLegacyTemplateIds();
      this.migrateEvolutionGrants();
      this.backfillBattleQueuePower();
      this.migrateCanonicalFurryVisuals();
    };
    this.runInImmediateTransaction(migrate);
  }

  migrateLegacyTemplateIds() {
    const rows = this.db.prepare(`
      SELECT monster.monster_id, monster.element, egg.seed
      FROM streammonsters_monsters monster
      LEFT JOIN streammonsters_eggs egg ON egg.egg_id = monster.egg_id
      WHERE monster.template_id IS NULL OR monster.template_id = ''
    `).all();
    const update = this.db.prepare('UPDATE streammonsters_monsters SET template_id = ? WHERE monster_id = ?');
    rows.forEach(row => update.run(
      deterministicTemplateId(row.element, row.seed || row.monster_id),
      row.monster_id
    ));
  }

  migrateCanonicalFurryVisuals() {
    if (!this.assetRegistry) return;
    const auditedAssets = this.assetRegistry.audit().assets;
    const rows = this.db.prepare(`
      SELECT monster_id, template_id, evolution_stage
      FROM streammonsters_monsters
      WHERE template_id IS NOT NULL
        AND template_id != ''
        AND (
          visual_source IS NULL
          OR visual_source = ''
          OR visual_source IN ('legacy', 'furry', 'kenney')
        )
    `).all();
    const update = this.db.prepare(`
      UPDATE streammonsters_monsters
      SET image_url = ?, visual_source = 'furry', visual_key = ?,
          asset_version = ?
      WHERE monster_id = ?
    `);
    rows.forEach(row => {
      const template = getTemplate(row.template_id);
      if (!template) return;
      const stage = Math.max(1, Math.min(3, Number(row.evolution_stage) || 1));
      const asset = auditedAssets.get(`${template.templateId}:${stage}`);
      if (!asset) return;
      update.run(
        asset.publicUrl,
        stage === 1 ? `furry:${template.templateId}` : `furry:${template.templateId}:stage-${stage}`,
        asset.assetVersion || null,
        row.monster_id
      );
    });
  }

  migrateEvolutionGrants() {
    const rows = this.db.prepare(`
      SELECT monster_id, element, evolution_stage, created_at_ms
      FROM streammonsters_monsters
      WHERE evolution_stage >= 2
      ORDER BY created_at_ms, monster_id
    `).all();
    rows.forEach(row => {
      const maximumStage = Math.min(3, Number(row.evolution_stage) || 1);
      for (let stage = 2; stage <= maximumStage; stage += 1) {
        this.applyEvolutionGrant(
          row.monster_id,
          stage,
          row.created_at_ms
        );
      }
    });
  }

  backfillBattleQueuePower() {
    const rows = this.db.prepare(`
      SELECT user_id, monster_id
      FROM streammonsters_battle_queue
      WHERE queued_power IS NULL
    `).all();
    const update = this.db.prepare(`
      UPDATE streammonsters_battle_queue
      SET queued_power = ?
      WHERE user_id = ?
    `);
    rows.forEach(row => {
      const monster = this.getMonster(row.monster_id);
      if (monster) update.run(effectiveCombatPower(monster), row.user_id);
    });
  }

  migrateFreeEggOfferStatusConstraint() {
    const table = this.db.prepare(`
      SELECT sql
      FROM sqlite_master
      WHERE type = 'table' AND name = 'streammonsters_free_egg_offers'
    `).get();
    if (String(table?.sql || '').includes("'expired'")) return;
    this.db.exec(`
      CREATE TABLE streammonsters_free_egg_offers_v110 (
        offer_id TEXT PRIMARY KEY,
        stream_key TEXT NOT NULL,
        source_user_id TEXT NOT NULL,
        source_display_name TEXT,
        offer_event_id TEXT NOT NULL UNIQUE,
        offered_at_ms INTEGER NOT NULL,
        reserved_until_ms INTEGER NOT NULL,
        public_expires_at_ms INTEGER,
        status TEXT NOT NULL CHECK (
          status IN ('reserved', 'public', 'claimed', 'expired')
        ),
        claimed_by_user_id TEXT,
        claimed_at_ms INTEGER,
        element TEXT,
        variant TEXT NOT NULL DEFAULT 'standard',
        image_url TEXT,
        source_avatar_ref TEXT,
        stage_state TEXT NOT NULL DEFAULT 'reserved',
        UNIQUE (stream_key, source_user_id)
      );
      INSERT INTO streammonsters_free_egg_offers_v110 (
        offer_id, stream_key, source_user_id, source_display_name,
        offer_event_id, offered_at_ms, reserved_until_ms, public_expires_at_ms, status,
        claimed_by_user_id, claimed_at_ms, element, variant, image_url,
        source_avatar_ref, stage_state
      )
      SELECT
        offer_id, stream_key, source_user_id, source_display_name,
        offer_event_id, offered_at_ms, reserved_until_ms, public_expires_at_ms, status,
        claimed_by_user_id, claimed_at_ms, element, variant, image_url,
        source_avatar_ref, stage_state
      FROM streammonsters_free_egg_offers;

      CREATE TABLE streammonsters_free_egg_claims_v110 (
        claim_id TEXT PRIMARY KEY,
        offer_id TEXT NOT NULL UNIQUE,
        stream_key TEXT NOT NULL,
        user_id TEXT NOT NULL,
        claim_event_id TEXT NOT NULL UNIQUE,
        claimed_at_ms INTEGER NOT NULL,
        FOREIGN KEY (offer_id)
          REFERENCES streammonsters_free_egg_offers_v110(offer_id)
      );
      INSERT INTO streammonsters_free_egg_claims_v110 (
        claim_id, offer_id, stream_key, user_id, claim_event_id, claimed_at_ms
      )
      SELECT
        claim_id, offer_id, stream_key, user_id, claim_event_id, claimed_at_ms
      FROM streammonsters_free_egg_claims;

      DROP TABLE streammonsters_free_egg_claims;
      DROP TABLE streammonsters_free_egg_offers;
      ALTER TABLE streammonsters_free_egg_offers_v110
        RENAME TO streammonsters_free_egg_offers;
      ALTER TABLE streammonsters_free_egg_claims_v110
        RENAME TO streammonsters_free_egg_claims;

      CREATE INDEX streammonsters_free_egg_offers_public_fifo
        ON streammonsters_free_egg_offers(
          stream_key, status, offered_at_ms, offer_id
        );
      CREATE INDEX streammonsters_free_egg_claims_cooldown
        ON streammonsters_free_egg_claims(user_id, claimed_at_ms DESC);
    `);
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

  hasGiftMappings() {
    return this.db.prepare('SELECT 1 FROM streammonsters_gift_mappings LIMIT 1').get() !== undefined;
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
        queued_at_ms, incubating_at_ms, expires_at_ms, expired_at_ms, visual_source, visual_key,
        provenance, ownership_state, free_offer_id, display_name, avatar_ref
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      eggId, input.userId, input.giftId, input.giftName, input.element, input.eggColor,
      input.seed, input.state || 'incubating', input.createdAtMs, input.hatchDurationMs,
      input.initialBoostMs || 0, input.imageUrl || null,
      input.variant || 'standard',
      input.readyAtMs ?? (input.state === 'queued'
        ? null
        : input.createdAtMs + input.hatchDurationMs - (input.initialBoostMs || 0)),
      input.queuedAtMs ?? (input.state === 'queued' ? input.createdAtMs : null),
      input.incubatingAtMs ?? (input.state === 'queued' ? null : input.createdAtMs),
      input.expiresAtMs ?? null,
      input.expiredAtMs ?? null,
      input.visualSource || 'egg_asset',
      input.visualKey || null,
      ['gift', 'free', 'legacy'].includes(input.provenance) ? input.provenance : 'legacy',
      'owned',
      input.freeOfferId || null,
      input.displayName || null,
      input.avatarRef || null
    );
    return this.getEgg(eggId);
  }

  resolveViewerIdentity({ platformUserId = null, legacyUserId = null, updatedAtMs = Date.now() } = {}) {
    const platformId = platformUserId === null || platformUserId === undefined
      ? ''
      : String(platformUserId).trim();
    const rawLegacyId = legacyUserId === null || legacyUserId === undefined
      ? ''
      : String(legacyUserId).trim();
    const legacyId = /^\d{8,}$/.test(rawLegacyId) ? '' : rawLegacyId;
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

  getViewerDisplayName(userId) {
    const value = String(userId || '').trim();
    if (!value) return null;
    const identity = this.db.prepare(`
      SELECT current_unique_id
      FROM streammonsters_viewer_identities
      WHERE canonical_user_id = ? OR platform_user_id = ?
      ORDER BY updated_at_ms DESC
      LIMIT 1
    `).get(value, value);
    const isPublicName = candidate => {
      const name = String(candidate || '').trim();
      const normalized = name.replace(/^@+/, '');
      return normalized &&
        !/^\d{8,}$/.test(normalized) &&
        !/^tiktok:\d+$/i.test(normalized);
    };
    if (isPublicName(identity?.current_unique_id)) return identity.current_unique_id;
    const aliases = this.db.prepare(`
      SELECT alias_id
      FROM streammonsters_viewer_aliases
      WHERE canonical_user_id = ?
      ORDER BY updated_at_ms DESC
    `).all(value);
    return aliases.map(alias => alias.alias_id).find(isPublicName) || null;
  }

  viewerDataExists(userId) {
    return Boolean(this.db.prepare(`
      SELECT 1 FROM (
        SELECT user_id FROM streammonsters_eggs WHERE user_id = ?
        UNION ALL SELECT user_id FROM streammonsters_monsters WHERE user_id = ?
        UNION ALL SELECT user_id FROM streammonsters_viewer_progress WHERE user_id = ?
        UNION ALL SELECT user_id FROM streammonsters_viewer_onboarding WHERE user_id = ?
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
      userId,
      userId
    ));
  }

  getStarterClaim(userId) {
    return this.db.prepare(`
      SELECT * FROM streammonsters_starter_claims WHERE user_id = ?
    `).get(userId) || null;
  }

  getFreeEggEvent(eventId) {
    const row = this.db.prepare(`
      SELECT result_json FROM streammonsters_free_egg_events WHERE event_id = ?
    `).get(eventId);
    if (!row) return null;
    try {
      return JSON.parse(row.result_json);
    } catch (_) {
      return null;
    }
  }

  recordFreeEggEvent({ eventId, streamKey, eventType, result, createdAtMs }) {
    this.db.prepare(`
      INSERT INTO streammonsters_free_egg_events (
        event_id, stream_key, event_type, result_json, created_at_ms
      ) VALUES (?, ?, ?, ?, ?)
    `).run(eventId, streamKey, eventType, JSON.stringify(result), createdAtMs);
    return result;
  }

  createFreeEggOffer(input) {
    this.db.prepare(`
      INSERT INTO streammonsters_free_egg_offers (
        offer_id, stream_key, source_user_id, source_display_name, offer_event_id,
        offered_at_ms, reserved_until_ms, public_expires_at_ms, status,
        element, variant, image_url,
        source_avatar_ref, stage_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'reserved', ?, ?, ?, ?, 'reserved')
    `).run(
      input.offerId,
      input.streamKey,
      input.sourceUserId,
      input.sourceDisplayName || null,
      input.offerEventId,
      input.offeredAtMs,
      input.reservedUntilMs,
      input.publicExpiresAtMs ?? (
        Number(input.reservedUntilMs) + FREE_EGG_PUBLIC_WINDOW_MS
      ),
      input.element || null,
      input.variant || 'standard',
      input.imageUrl || null,
      input.sourceAvatarRef || null
    );
    return this.getFreeEggOffer(input.offerId);
  }

  getFreeEggOffer(offerId) {
    return this.db.prepare(`
      SELECT * FROM streammonsters_free_egg_offers WHERE offer_id = ?
    `).get(offerId) || null;
  }

  getFreeEggOfferBySource(streamKey, sourceUserId) {
    return this.db.prepare(`
      SELECT * FROM streammonsters_free_egg_offers
      WHERE stream_key = ? AND source_user_id = ?
    `).get(streamKey, sourceUserId) || null;
  }

  getFreeEggOffers(streamKey) {
    return this.db.prepare(`
      SELECT * FROM streammonsters_free_egg_offers
      WHERE stream_key = ?
      ORDER BY offered_at_ms ASC, offer_id ASC
    `).all(streamKey);
  }

  releaseExpiredFreeEggOffers(streamKey, nowMs) {
    const hasStreamKey = streamKey !== undefined && streamKey !== null;
    const released = this.db.prepare(`
      UPDATE streammonsters_free_egg_offers
      SET status = 'public', stage_state = 'public'
      WHERE ${hasStreamKey ? 'stream_key = ? AND ' : ''}
        status = 'reserved'
        AND stage_state = 'reserved'
        AND reserved_until_ms <= ?
        AND public_expires_at_ms > ?
      RETURNING *
    `).all(...(hasStreamKey ? [streamKey, nowMs, nowMs] : [nowMs, nowMs]));
    return released.sort((left, right) => (
      left.offered_at_ms - right.offered_at_ms ||
      left.offer_id.localeCompare(right.offer_id)
    ));
  }

  getNextFreeEggReservationDeadline(nowMs = Date.now()) {
    return this.getNextFreeEggTransitionDeadline(nowMs);
  }

  expirePublicFreeEggOffers(streamKey, nowMs) {
    const hasStreamKey = streamKey !== undefined && streamKey !== null;
    const expired = this.db.prepare(`
      UPDATE streammonsters_free_egg_offers
      SET status = 'expired', stage_state = 'expired'
      WHERE ${hasStreamKey ? 'stream_key = ? AND ' : ''}
        (
          (status = 'public' AND stage_state = 'public')
          OR (status = 'reserved' AND stage_state = 'reserved')
        )
        AND public_expires_at_ms <= ?
      RETURNING *
    `).all(...(hasStreamKey ? [streamKey, nowMs] : [nowMs]));
    return expired.sort((left, right) => (
      left.public_expires_at_ms - right.public_expires_at_ms ||
      left.offer_id.localeCompare(right.offer_id)
    ));
  }

  getNextFreeEggTransitionDeadline(nowMs = Date.now()) {
    const row = this.db.prepare(`
      SELECT MIN(
        CASE
          WHEN status = 'reserved' AND stage_state = 'reserved'
            THEN reserved_until_ms
          WHEN status = 'public' AND stage_state = 'public'
            THEN public_expires_at_ms
          ELSE NULL
        END
      ) AS deadline_ms
      FROM streammonsters_free_egg_offers
      WHERE (
        status = 'reserved'
        AND stage_state = 'reserved'
        AND reserved_until_ms > ?
      ) OR (
        status = 'public'
        AND stage_state = 'public'
        AND public_expires_at_ms > ?
      )
    `).get(Number(nowMs) || 0, Number(nowMs) || 0);
    if (row?.deadline_ms === null || row?.deadline_ms === undefined) {
      return null;
    }
    return Number.isFinite(Number(row.deadline_ms))
      ? Number(row.deadline_ms)
      : null;
  }

  getReservedFreeEggOffer(streamKey, userId, nowMs) {
    return this.db.prepare(`
      SELECT * FROM streammonsters_free_egg_offers
      WHERE stream_key = ? AND source_user_id = ?
        AND status = 'reserved' AND stage_state = 'reserved' AND reserved_until_ms > ?
      ORDER BY offered_at_ms ASC, offer_id ASC
      LIMIT 1
    `).get(streamKey, userId, nowMs) || null;
  }

  getOldestPublicFreeEggOffer(streamKey) {
    return this.db.prepare(`
      SELECT * FROM streammonsters_free_egg_offers
      WHERE stream_key = ? AND status = 'public' AND stage_state = 'public'
      ORDER BY offered_at_ms ASC, offer_id ASC
      LIMIT 1
    `).get(streamKey) || null;
  }

  claimFreeEggOffer({ offerId, userId, claimedAtMs }) {
    const result = this.db.prepare(`
      UPDATE streammonsters_free_egg_offers
      SET status = 'claimed', stage_state = 'claimed',
        claimed_by_user_id = ?, claimed_at_ms = ?
      WHERE offer_id = ? AND stage_state IN ('reserved', 'public')
    `).run(userId, claimedAtMs, offerId);
    return result.changes === 1 ? this.getFreeEggOffer(offerId) : null;
  }

  createFreeEggClaim({ claimId, offerId, streamKey, userId, claimEventId, claimedAtMs }) {
    this.db.prepare(`
      INSERT INTO streammonsters_free_egg_claims (
        claim_id, offer_id, stream_key, user_id, claim_event_id, claimed_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(claimId, offerId, streamKey, userId, claimEventId, claimedAtMs);
  }

  getLatestFreeEggClaim(userId) {
    return this.db.prepare(`
      SELECT * FROM streammonsters_free_egg_claims
      WHERE user_id = ?
      ORDER BY claimed_at_ms DESC, claim_id DESC
      LIMIT 1
    `).get(userId) || null;
  }

  cleanupFreeEggStream(streamKey) {
    const offersRemoved = this.db.prepare(`
      UPDATE streammonsters_free_egg_offers
      SET status = 'expired', stage_state = 'expired'
      WHERE stream_key = ?
        AND status IN ('reserved', 'public')
        AND stage_state IN ('reserved', 'public')
    `).run(streamKey).changes;
    const eventsRemoved = this.db.prepare(`
      DELETE FROM streammonsters_free_egg_events
      WHERE stream_key = ?
        AND event_id NOT IN (
          SELECT offer_event_id
          FROM streammonsters_free_egg_offers
          WHERE stream_key = ? AND status = 'claimed'
          UNION
          SELECT claim_event_id
          FROM streammonsters_free_egg_claims
          WHERE stream_key = ?
        )
    `).run(streamKey, streamKey, streamKey).changes;
    return { offersRemoved, eventsRemoved };
  }

  getEggStageEggs() {
    return this.db.prepare(`
      SELECT eggs.*,
        CASE WHEN eggs.state = 'queued' THEN (
          SELECT COUNT(*) + 1
          FROM streammonsters_eggs earlier
          WHERE earlier.user_id = eggs.user_id
            AND earlier.state = 'queued'
            AND (
              earlier.queued_at_ms < eggs.queued_at_ms
              OR (
                earlier.queued_at_ms = eggs.queued_at_ms
                AND earlier.egg_id < eggs.egg_id
              )
            )
        ) ELSE NULL END AS queue_position
      FROM streammonsters_eggs eggs
      WHERE eggs.state IN ('queued', 'incubating', 'ready')
        AND COALESCE(eggs.provenance, 'legacy') <> 'free'
      ORDER BY eggs.created_at_ms ASC, eggs.egg_id ASC
    `).all();
  }

  getEggStageOffers(streamKey) {
    return this.db.prepare(`
      SELECT * FROM streammonsters_free_egg_offers
      WHERE stream_key = ? AND stage_state IN ('reserved', 'public')
      ORDER BY offered_at_ms ASC, offer_id ASC
    `).all(streamKey || 'offline');
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

  getNextEggDeadline(nowMs = Date.now()) {
    const now = Number(nowMs) || 0;
    const row = this.db.prepare(`
      SELECT MIN(deadline_ms) AS deadline_ms
      FROM (
        SELECT ready_at_ms AS deadline_ms
        FROM streammonsters_eggs
        WHERE state = 'incubating' AND ready_at_ms IS NOT NULL
        UNION ALL
        SELECT expires_at_ms AS deadline_ms
        FROM streammonsters_eggs
        WHERE state = 'ready' AND expires_at_ms IS NOT NULL
      )
    `).get();
    return Number.isFinite(Number(row?.deadline_ms))
      ? Number(row.deadline_ms)
      : null;
  }
  getReadyEggs() {
    return this.db.prepare(`
      SELECT * FROM streammonsters_eggs
      WHERE state = 'ready'
      ORDER BY ready_at_ms ASC, created_at_ms ASC, egg_id ASC
    `).all();
  }

  getQueuedEggs(userId = null) {
    const sql = userId
      ? `SELECT *, ROW_NUMBER() OVER (
          PARTITION BY user_id ORDER BY queued_at_ms ASC, created_at_ms ASC, egg_id ASC
        ) AS queue_position
        FROM streammonsters_eggs
        WHERE user_id = ? AND state = 'queued'
        ORDER BY queued_at_ms ASC, created_at_ms ASC, egg_id ASC`
      : `SELECT *, ROW_NUMBER() OVER (
          PARTITION BY user_id ORDER BY queued_at_ms ASC, created_at_ms ASC, egg_id ASC
        ) AS queue_position
        FROM streammonsters_eggs
        WHERE state = 'queued'
        ORDER BY queued_at_ms ASC, created_at_ms ASC, egg_id ASC`;
    return userId ? this.db.prepare(sql).all(userId) : this.db.prepare(sql).all();
  }

  getEggStateCounts(userId = null) {
    const counts = { incubating: 0, queued: 0, ready: 0 };
    const rows = userId
      ? this.db.prepare(`
        SELECT state, COUNT(*) AS count
        FROM streammonsters_eggs
        WHERE user_id = ? AND state IN ('incubating', 'queued', 'ready')
        GROUP BY state
      `).all(userId)
      : this.db.prepare(`
        SELECT state, COUNT(*) AS count
        FROM streammonsters_eggs
        WHERE state IN ('incubating', 'queued', 'ready')
        GROUP BY state
      `).all();
    rows.forEach(row => {
      if (Object.prototype.hasOwnProperty.call(counts, row.state)) counts[row.state] = Number(row.count) || 0;
    });
    return counts;
  }

  boostOldestEgg(userId, boostMs) {
    const egg = this.getViewerEggs(userId, 'incubating')[0];
    if (!egg) return null;
    this.db.prepare(`
      UPDATE streammonsters_eggs
      SET boost_ms = boost_ms + ?,
        ready_at_ms = MAX(created_at_ms, ready_at_ms - ?),
        expires_at_ms = MAX(created_at_ms, expires_at_ms - ?)
      WHERE egg_id = ?
    `).run(boostMs, boostMs, boostMs, egg.egg_id);
    return this.getEgg(egg.egg_id);
  }

  markReadyEggs(nowMs) {
    const ready = this.db.prepare(`
      SELECT * FROM streammonsters_eggs
      WHERE state = 'incubating' AND ready_at_ms <= ?
      ORDER BY ready_at_ms ASC, egg_id ASC
      LIMIT 250
    `).all(nowMs);
    if (!ready.length) return [];
    const mark = this.db.prepare("UPDATE streammonsters_eggs SET state = 'ready' WHERE egg_id = ?");
    this.db.transaction(rows => rows.forEach(row => mark.run(row.egg_id)))(ready);
    return ready.map(row => this.getEgg(row.egg_id));
  }

  expireReadyEggs(nowMs, eggExpiryMs = 86_400_000) {
    const expiryMs = Math.max(1, Number.parseInt(eggExpiryMs, 10) || 86_400_000);
    const expired = this.db.prepare(`
      SELECT * FROM streammonsters_eggs
      WHERE state = 'ready' AND COALESCE(expires_at_ms, ready_at_ms + ?) <= ?
      ORDER BY expires_at_ms ASC, egg_id ASC
      LIMIT 250
    `).all(expiryMs, nowMs);
    if (!expired.length) return [];
    const mark = this.db.prepare(`
      UPDATE streammonsters_eggs
      SET state = 'expired',
        expires_at_ms = COALESCE(expires_at_ms, ready_at_ms + ?),
        expired_at_ms = ?
      WHERE egg_id = ? AND state = 'ready'
    `);
    this.db.transaction(rows => rows.forEach(row => mark.run(expiryMs, nowMs, row.egg_id)))(expired);
    return expired.map(row => this.getEgg(row.egg_id));
  }

  promoteQueuedEggs(nowMs, maxActive = 3, eggExpiryMs = 86_400_000) {
    const activeLimit = Math.max(1, Number.parseInt(maxActive, 10) || 3);
    const expiryMs = Math.max(1, Number.parseInt(eggExpiryMs, 10) || 86_400_000);
    const queued = this.getQueuedEggs();
    if (!queued.length) return [];
    const activeByUser = new Map(this.db.prepare(`
      SELECT user_id, COUNT(*) AS count
      FROM streammonsters_eggs
      WHERE state = 'incubating'
      GROUP BY user_id
    `).all().map(row => [row.user_id, row.count]));
    const promotedIds = [];
    const promote = this.db.prepare(`
      UPDATE streammonsters_eggs
      SET state = 'incubating', incubating_at_ms = ?,
        ready_at_ms = ? + hatch_duration_ms - boost_ms,
        expires_at_ms = ? + hatch_duration_ms - boost_ms + ?
      WHERE egg_id = ? AND state = 'queued'
    `);
    this.db.transaction(() => {
      queued.forEach(egg => {
        const active = activeByUser.get(egg.user_id) || 0;
        if (active >= activeLimit) return;
        const result = promote.run(nowMs, nowMs, nowMs, expiryMs, egg.egg_id);
        if (!result.changes) return;
        activeByUser.set(egg.user_id, active + 1);
        promotedIds.push(egg.egg_id);
      });
    })();
    return promotedIds.map(eggId => this.getEgg(eggId));
  }

  createMonsterFromEgg(egg, monster, {
    requireReadyOwner = false,
    claimAtMs = Date.now()
  } = {}) {
    const monsterId = monster.monsterId || randomUUID();
    const transaction = this.db.transaction(() => {
      if (requireReadyOwner) {
        const claimed = this.db.prepare(`
          UPDATE streammonsters_eggs
          SET state = 'hatched', monster_id = ?
          WHERE egg_id = ?
            AND user_id = ?
            AND state = 'ready'
            AND monster_id IS NULL
            AND expired_at_ms IS NULL
            AND (expires_at_ms IS NULL OR expires_at_ms > ?)
        `).run(monsterId, egg.egg_id, egg.user_id, Number(claimAtMs) || 0);
        if (claimed.changes !== 1) {
          const error = new Error('STREAM_MONSTERS_EGG_NOT_READY');
          error.code = 'STREAM_MONSTERS_EGG_NOT_READY';
          throw error;
        }
      }
      const hasSelection = this.db.prepare(
        `SELECT 1 FROM streammonsters_monsters
         WHERE user_id = ? AND is_selected = 1 AND collection_state = 'owned'`
      ).get(egg.user_id);
      this.db.prepare(`
        INSERT INTO streammonsters_monsters (
          monster_id, user_id, egg_id, name, element, rarity, level, xp,
          stats_json, image_url, personality, visual_source, visual_key,
          asset_version, template_id, is_selected, created_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        monsterId, egg.user_id, egg.egg_id, monster.name, egg.element, monster.rarity,
        JSON.stringify(monster.stats), monster.imageUrl || egg.image_url || null,
        monster.personality || 'Curious', monster.visualSource || egg.visual_source || 'legacy',
        monster.visualKey || egg.visual_key || null,
        monster.assetVersion || null,
        monster.templateId || deterministicTemplateId(egg.element, egg.seed),
        hasSelection ? 0 : 1, monster.createdAtMs
      );
      if (!requireReadyOwner) {
        this.db.prepare(`
          UPDATE streammonsters_eggs
          SET state = 'hatched', monster_id = ?
          WHERE egg_id = ?
        `).run(monsterId, egg.egg_id);
      }
    });
    transaction();
    return this.getMonster(monsterId);
  }

  createMonsterFromReadyEgg(egg, monster, claimAtMs = Date.now()) {
    return this.createMonsterFromEgg(egg, monster, {
      requireReadyOwner: true,
      claimAtMs
    });
  }

  getMonster(monsterId) {
    const row = this.db.prepare('SELECT * FROM streammonsters_monsters WHERE monster_id = ?').get(monsterId);
    return row ? { ...row, stats: JSON.parse(row.stats_json) } : null;
  }

  getFusionCandidates(userId, templateId) {
    return this.db.prepare(`
      SELECT *
      FROM streammonsters_monsters
      WHERE user_id = ?
        AND template_id = ?
        AND collection_state = 'owned'
      ORDER BY evolution_stage DESC, prestige_level DESC,
               created_at_ms ASC, monster_id ASC
    `).all(userId, templateId).map(row => ({
      ...row,
      stats: JSON.parse(row.stats_json)
    }));
  }

  getFusionCandidateTemplates(userId) {
    return this.db.prepare(`
      SELECT template_id, MAX(evolution_stage) AS highest_stage,
             MIN(created_at_ms) AS oldest_created_at_ms
      FROM streammonsters_monsters
      WHERE user_id = ?
        AND collection_state = 'owned'
        AND template_id IS NOT NULL
        AND template_id != ''
      GROUP BY template_id
      HAVING COUNT(*) >= 2
      ORDER BY highest_stage DESC, oldest_created_at_ms ASC, template_id ASC
    `).all(userId).map(row => row.template_id);
  }

  claimFusionContact(userId, contactId, processedAtMs) {
    return this.db.prepare(`
      INSERT OR IGNORE INTO streammonsters_fusion_contacts (
        contact_id, user_id, result, processed_at_ms
      ) VALUES (?, ?, 'pending', ?)
    `).run(contactId, userId, processedAtMs).changes > 0;
  }

  setFusionContactResult(contactId, result, fusionId = null) {
    this.db.prepare(`
      UPDATE streammonsters_fusion_contacts
      SET result = ?, fusion_id = ?
      WHERE contact_id = ?
    `).run(result, fusionId, contactId);
  }

  getFusionBlocker(monsterId) {
    if (this.db.prepare(`
      SELECT 1 FROM streammonsters_battle_queue
      WHERE monster_id = ?
    `).get(monsterId)) return 'queued';
    if (this.db.prepare(`
      SELECT 1 FROM streammonsters_match_participants
      WHERE active = 1
        AND (locked_monster_id = ? OR queued_monster_id = ?)
    `).get(monsterId, monsterId)) return 'active_match';
    if (this.db.prepare(`
      SELECT 1 FROM streammonsters_stat_prompts
      WHERE monster_id = ? AND status = 'open'
      UNION ALL
      SELECT 1 FROM streammonsters_stat_allocations
      WHERE monster_id = ? AND status = 'open'
      LIMIT 1
    `).get(monsterId, monsterId)) return 'pending_stat_choice';
    return null;
  }

  getFusionByTrigger(triggerType, triggerId) {
    const ledger = this.db.prepare(`
      SELECT * FROM streammonsters_fusion_ledger
      WHERE trigger_type = ? AND trigger_id = ?
    `).get(triggerType, triggerId);
    if (!ledger) return null;
    return {
      ...ledger,
      survivor: this.getMonster(ledger.survivor_monster_id),
      donor: this.getMonster(ledger.donor_monster_id)
    };
  }

  commitFusion({
    fusionId,
    userId,
    templateId,
    survivorMonsterId,
    donorMonsterId,
    fromStage,
    toStage,
    prestigeBefore = 0,
    prestigeAfter = 0,
    triggerType,
    triggerId,
    visual = null,
    createdAtMs
  }) {
    return this.runInImmediateTransaction(() => {
      const processed = this.getFusionByTrigger(triggerType, triggerId);
      if (processed) return { status: 'already_processed', ...processed };
      const survivor = this.getMonster(survivorMonsterId);
      const donor = this.getMonster(donorMonsterId);
      const unchanged = [survivor, donor].every(monster => (
        monster &&
        monster.user_id === userId &&
        monster.template_id === templateId &&
        monster.collection_state === 'owned' &&
        Number(monster.evolution_stage) === fromStage
      ));
      if (!unchanged || survivorMonsterId === donorMonsterId) {
        throw new Error('STREAM_MONSTERS_FUSION_PAIR_CHANGED');
      }
      const blocker = this.getFusionBlocker(survivorMonsterId) ||
        this.getFusionBlocker(donorMonsterId);
      if (blocker) {
        const error = new Error(`STREAM_MONSTERS_FUSION_BLOCKED:${blocker}`);
        error.code = 'STREAM_MONSTERS_FUSION_BLOCKED';
        error.reason = blocker;
        throw error;
      }

      const donorWasSelected = donor.is_selected === 1;
      const statsBefore = { ...survivor.stats };
      let grant = {
        applied: false,
        monster: survivor,
        statsBefore,
        statsAfter: statsBefore,
        statChanges: { vitality: 0, might: 0, guard: 0, agility: 0 }
      };
      if (fromStage < 3) {
        this.setMonsterEvolutionStage(
          survivorMonsterId,
          toStage,
          Math.max(0, Number(survivor.evolution_essence_spent) || 0),
          visual.imageUrl,
          visual.visualKey,
          visual.visualSource,
          visual.assetVersion
        );
        grant = this.applyEvolutionGrant(
          survivorMonsterId,
          toStage,
          createdAtMs
        );
      } else {
        this.db.prepare(`
          UPDATE streammonsters_monsters
          SET prestige_level = ?
          WHERE monster_id = ? AND collection_state = 'owned'
        `).run(prestigeAfter, survivorMonsterId);
      }
      this.db.prepare(`
        UPDATE streammonsters_monsters
        SET collection_state = 'archived',
            archived_at_ms = ?,
            archived_reason = 'fusion_donor',
            archived_by_fusion_id = ?,
            is_selected = 0
        WHERE monster_id = ? AND collection_state = 'owned'
      `).run(createdAtMs, fusionId, donorMonsterId);
      if (donorWasSelected) {
        this.db.prepare(`
          UPDATE streammonsters_monsters
          SET is_selected = 1
          WHERE monster_id = ? AND collection_state = 'owned'
        `).run(survivorMonsterId);
      }
      this.db.prepare(`
        INSERT INTO streammonsters_fusion_ledger (
          fusion_id, user_id, template_id, survivor_monster_id,
          donor_monster_id, from_stage, to_stage, prestige_before,
          prestige_after, trigger_type, trigger_id, created_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        fusionId,
        userId,
        templateId,
        survivorMonsterId,
        donorMonsterId,
        fromStage,
        toStage,
        prestigeBefore,
        prestigeAfter,
        triggerType,
        triggerId,
        createdAtMs
      );
      return {
        status: 'fused',
        fusion_id: fusionId,
        user_id: userId,
        template_id: templateId,
        survivor: this.getMonster(survivorMonsterId),
        donor: this.getMonster(donorMonsterId),
        from_stage: fromStage,
        to_stage: toStage,
        prestige_before: prestigeBefore,
        prestige_after: prestigeAfter,
        stats_before: grant.statsBefore,
        stats_after: grant.statsAfter,
        stat_changes: grant.statChanges
      };
    });
  }

  getViewerMonsters(userId) {
    return this.db.prepare(`
      SELECT * FROM streammonsters_monsters
      WHERE user_id = ? AND collection_state = 'owned'
      ORDER BY created_at_ms ASC, monster_id ASC
    `).all(userId).map(row => ({ ...row, stats: JSON.parse(row.stats_json) }));
  }

  getOwnedTemplateIds(userId, element = null) {
    const sql = element
      ? `SELECT DISTINCT template_id FROM streammonsters_monsters
         WHERE user_id = ? AND element = ? AND template_id IS NOT NULL
           AND collection_state = 'owned'`
      : `SELECT DISTINCT template_id FROM streammonsters_monsters
         WHERE user_id = ? AND template_id IS NOT NULL
           AND collection_state = 'owned'`;
    return (element ? this.db.prepare(sql).all(userId, element) : this.db.prepare(sql).all(userId))
      .map(row => row.template_id);
  }

  countOwnedTemplate(userId, templateId) {
    return this.db.prepare(`
      SELECT COUNT(*) AS count FROM streammonsters_monsters
      WHERE user_id = ? AND template_id = ? AND collection_state = 'owned'
    `).get(userId, templateId).count;
  }

  getTemplateBag(userId, element) {
    const row = this.db.prepare(`
      SELECT * FROM streammonsters_template_shuffle_bags WHERE user_id = ? AND element = ?
    `).get(userId, element);
    return row ? { ...row, order: JSON.parse(row.order_json) } : null;
  }

  getElementBag(streamKey, giftId) {
    const row = this.db.prepare(`
      SELECT * FROM streammonsters_element_shuffle_bags
      WHERE stream_key = ? AND gift_id = ?
    `).get(streamKey, giftId);
    return row ? { ...row, order: JSON.parse(row.order_json) } : null;
  }

  reserveElement(streamKey, giftId, orderForCycle) {
    return this.db.transaction(() => {
      let bag = this.getElementBag(streamKey, giftId);
      if (!bag || bag.position >= bag.order.length) {
        const cycle = bag ? bag.cycle + 1 : 0;
        bag = { stream_key: streamKey, gift_id: giftId, cycle, position: 0, order: orderForCycle(cycle) };
      }
      const position = bag.position;
      const element = bag.order[position];
      this.db.prepare(`
        INSERT INTO streammonsters_element_shuffle_bags (
          stream_key, gift_id, cycle, position, order_json
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(stream_key, gift_id) DO UPDATE SET
          cycle = excluded.cycle,
          position = excluded.position,
          order_json = excluded.order_json
      `).run(streamKey, giftId, bag.cycle, position + 1, JSON.stringify(bag.order));
      return element;
    })();
  }

  claimGiftEvent(streamKey, eventKey, claimedAtMs) {
    if (!eventKey) return true;
    return this.db.prepare(`
      INSERT OR IGNORE INTO streammonsters_gift_event_claims (
        stream_key, event_key, claimed_at_ms
      ) VALUES (?, ?, ?)
    `).run(streamKey || 'offline', eventKey, claimedAtMs).changes > 0;
  }

  reserveTemplateForEgg(egg, orderForCycle) {
    const transaction = this.db.transaction(() => {
      const existing = this.db.prepare(`
        SELECT * FROM streammonsters_template_reservations WHERE egg_id = ?
      `).get(egg.egg_id);
      if (existing) return existing;
      let bag = this.getTemplateBag(egg.user_id, egg.element);
      if (!bag || bag.position >= bag.order.length) {
        const cycle = bag ? bag.cycle + 1 : 0;
        bag = { user_id: egg.user_id, element: egg.element, cycle, position: 0, order: orderForCycle(cycle) };
      }
      const position = bag.position;
      const templateId = bag.order[position];
      this.db.prepare(`
        INSERT INTO streammonsters_template_shuffle_bags (user_id, element, cycle, position, order_json)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, element) DO UPDATE SET cycle = excluded.cycle, position = excluded.position, order_json = excluded.order_json
      `).run(bag.user_id, bag.element, bag.cycle, position + 1, JSON.stringify(bag.order));
      this.db.prepare(`
        INSERT INTO streammonsters_template_reservations (egg_id, user_id, element, template_id, cycle, position)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(egg.egg_id, egg.user_id, egg.element, templateId, bag.cycle, position);
      return this.db.prepare('SELECT * FROM streammonsters_template_reservations WHERE egg_id = ?').get(egg.egg_id);
    });
    return transaction();
  }

  claimCollectionAction(actionKey, createdAtMs) {
    return this.db.prepare(`
      INSERT OR IGNORE INTO streammonsters_collection_actions (action_key, created_at_ms) VALUES (?, ?)
    `).run(actionKey, createdAtMs).changes > 0;
  }

  getTemplateMastery(userId, templateId) {
    const row = this.db.prepare(`
      SELECT * FROM streammonsters_template_mastery WHERE user_id = ? AND template_id = ?
    `).get(userId, templateId);
    return row ? { ...row, unlocks: JSON.parse(row.unlocks_json) } : {
      user_id: userId, template_id: templateId, points: 0, unlocks: []
    };
  }

  setTemplateMastery(userId, templateId, points, unlocks) {
    this.db.prepare(`
      INSERT INTO streammonsters_template_mastery (user_id, template_id, points, unlocks_json)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, template_id) DO UPDATE SET points = excluded.points, unlocks_json = excluded.unlocks_json
    `).run(userId, templateId, points, JSON.stringify(unlocks));
    return this.getTemplateMastery(userId, templateId);
  }

  getElementEssence(userId, element) {
    const row = this.db.prepare(`
      SELECT * FROM streammonsters_element_essence WHERE user_id = ? AND element = ?
    `).get(userId, element);
    return row ? { ...row, unlocks: JSON.parse(row.unlocks_json) } : {
      user_id: userId, element, amount: 0, spent: 0, unlocks: []
    };
  }

  setElementEssence(userId, element, amount, unlocks, spent = null) {
    const current = this.getElementEssence(userId, element);
    this.db.prepare(`
      INSERT INTO streammonsters_element_essence (user_id, element, amount, spent, unlocks_json)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, element) DO UPDATE SET
        amount = excluded.amount,
        spent = excluded.spent,
        unlocks_json = excluded.unlocks_json
    `).run(userId, element, amount, spent ?? current.spent, JSON.stringify(unlocks));
    return this.getElementEssence(userId, element);
  }

  spendElementEssence(userId, element, amount) {
    const normalized = Math.max(0, Number.parseInt(amount, 10) || 0);
    const result = this.db.prepare(`
      UPDATE streammonsters_element_essence
      SET amount = amount - ?, spent = spent + ?
      WHERE user_id = ? AND element = ? AND amount >= ?
    `).run(normalized, normalized, userId, element, normalized);
    return result.changes ? this.getElementEssence(userId, element) : null;
  }

  setMonsterEvolutionStage(
    monsterId,
    stage,
    spentEssence,
    imageUrl,
    visualKey,
    visualSource = 'furry',
    assetVersion = 'furry-1.5.0'
  ) {
    this.db.prepare(`
      UPDATE streammonsters_monsters
      SET evolution_stage = ?, evolution_essence_spent = ?, image_url = ?,
          visual_source = ?, visual_key = ?, asset_version = ?
      WHERE monster_id = ?
    `).run(
      stage,
      spentEssence,
      imageUrl,
      visualSource,
      visualKey,
      assetVersion,
      monsterId
    );
    return this.getMonster(monsterId);
  }

  applyEvolutionGrant(monsterId, stage, createdAtMs) {
    return this.runInImmediateTransaction(() => {
      const monster = this.getMonster(monsterId);
      if (!monster) throw new Error('STREAM_MONSTERS_MONSTER_NOT_FOUND');
      const normalizedStage = Number(stage);
      if (![2, 3].includes(normalizedStage)) {
        throw new Error('STREAM_MONSTERS_EVOLUTION_STAGE_INVALID');
      }
      const normalizedChanges = evolutionStatGrant(monster.element, normalizedStage);
      const inserted = this.db.prepare(`
        INSERT OR IGNORE INTO streammonsters_evolution_grants (
          monster_id, stage, stats_json, created_at_ms
        ) VALUES (?, ?, ?, ?)
      `).run(
        monsterId,
        normalizedStage,
        JSON.stringify(normalizedChanges),
        Math.max(0, Number(createdAtMs) || 0)
      );
      const statsBefore = { ...monster.stats };
      if (!inserted.changes) {
        return {
          applied: false,
          monster,
          statsBefore,
          statsAfter: statsBefore,
          statChanges: { vitality: 0, might: 0, guard: 0, agility: 0 }
        };
      }
      const statsAfter = applyEvolutionStatGrant(
        statsBefore,
        monster.element,
        normalizedStage
      );
      this.db.prepare(`
        UPDATE streammonsters_monsters
        SET stats_json = ?
        WHERE monster_id = ?
      `).run(JSON.stringify(statsAfter), monsterId);
      return {
        applied: true,
        monster: this.getMonster(monsterId),
        statsBefore,
        statsAfter,
        statChanges: normalizedChanges
      };
    });
  }

  unlockCollectionCosmetic(userId, cosmeticKey, unlockedAtMs) {
    return this.db.prepare(`
      INSERT OR IGNORE INTO streammonsters_collection_cosmetics (user_id, cosmetic_key, unlocked_at_ms)
      VALUES (?, ?, ?)
    `).run(userId, cosmeticKey, unlockedAtMs).changes > 0;
  }

  getCollectionCosmetics(userId) {
    return this.db.prepare(`
      SELECT cosmetic_key FROM streammonsters_collection_cosmetics WHERE user_id = ? ORDER BY cosmetic_key ASC
    `).all(userId).map(row => row.cosmetic_key);
  }

  getOrCreateStreamMission(streamKey, mission) {
    this.db.prepare(`
      INSERT OR IGNORE INTO streammonsters_stream_missions (
        stream_key, mission_key, target, population_band, population_peak
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      streamKey,
      mission.key,
      mission.target,
      mission.populationBand || null,
      Number.isFinite(Number(mission.populationPeak))
        ? Math.max(0, Math.round(Number(mission.populationPeak)))
        : null
    );
    return this.getStreamMission(streamKey);
  }

  getStreamMission(streamKey) {
    return this.db.prepare(`SELECT * FROM streammonsters_stream_missions WHERE stream_key = ?`).get(streamKey) || null;
  }

  setStreamMissionProgress(streamKey, progress, completedAtMs = null) {
    this.db.prepare(`
      UPDATE streammonsters_stream_missions
      SET progress = ?, completed_at_ms = COALESCE(completed_at_ms, ?)
      WHERE stream_key = ?
    `).run(progress, completedAtMs, streamKey);
    return this.getStreamMission(streamKey);
  }

  updateStreamMissionPopulation(streamKey, {
    populationBand,
    populationPeak,
    target
  }) {
    const normalizedPeak = Math.max(0, Math.round(Number(populationPeak) || 0));
    const normalizedTarget = Math.max(1, Math.round(Number(target) || 1));
    this.db.prepare(`
      UPDATE streammonsters_stream_missions
      SET population_peak = MAX(COALESCE(population_peak, 0), ?),
        population_band = CASE
          WHEN progress = 0 AND ? > target THEN ?
          ELSE population_band
        END,
        target = CASE
          WHEN progress = 0 AND ? > target THEN ?
          ELSE target
        END
      WHERE stream_key = ? AND population_band IS NOT NULL
    `).run(
      normalizedPeak,
      normalizedTarget,
      populationBand,
      normalizedTarget,
      normalizedTarget,
      streamKey
    );
    return this.getStreamMission(streamKey);
  }

  addMissionParticipant(streamKey, userId, selectedMonsterId = null) {
    this.db.prepare(`
      INSERT INTO streammonsters_stream_mission_participants (stream_key, user_id, selected_monster_id)
      VALUES (?, ?, ?)
      ON CONFLICT(stream_key, user_id) DO UPDATE SET selected_monster_id = COALESCE(excluded.selected_monster_id, selected_monster_id)
    `).run(streamKey, userId, selectedMonsterId);
    return this.getMissionParticipant(streamKey, userId);
  }

  recordBattleMission({ streamKey, battleId, participants, completedAtMs }) {
    const transaction = this.db.transaction(() => {
      const mission = this.getStreamMission(streamKey);
      if (!mission || mission.completed_at_ms || mission.mission_key !== 'three_battles') {
        return { mission, accepted: false, newlyCompleted: false };
      }
      const addParticipant = this.db.prepare(`
        INSERT INTO streammonsters_stream_mission_participants (stream_key, user_id, selected_monster_id)
        VALUES (?, ?, ?)
        ON CONFLICT(stream_key, user_id) DO UPDATE SET selected_monster_id = COALESCE(excluded.selected_monster_id, selected_monster_id)
      `);
      participants.forEach(participant => addParticipant.run(
        streamKey,
        participant.userId,
        participant.monsterId || null
      ));
      const claimed = this.db.prepare(`
        INSERT OR IGNORE INTO streammonsters_collection_actions (action_key, created_at_ms) VALUES (?, ?)
      `).run(`mission-battle:${streamKey}:${battleId}`, completedAtMs).changes > 0;
      if (!claimed) {
        return { mission: this.getStreamMission(streamKey), accepted: false, newlyCompleted: false };
      }
      const progress = Math.min(mission.target, mission.progress + 1);
      const completed = progress >= mission.target;
      this.db.prepare(`
        UPDATE streammonsters_stream_missions
        SET progress = ?, completed_at_ms = COALESCE(completed_at_ms, ?)
        WHERE stream_key = ?
      `).run(progress, completed ? completedAtMs : null, streamKey);
      return { mission: this.getStreamMission(streamKey), accepted: true, newlyCompleted: completed };
    });
    return transaction();
  }

  getMissionParticipant(streamKey, userId) {
    return this.db.prepare(`
      SELECT * FROM streammonsters_stream_mission_participants WHERE stream_key = ? AND user_id = ?
    `).get(streamKey, userId) || null;
  }

  getMissionParticipants(streamKey) {
    return this.db.prepare(`
      SELECT * FROM streammonsters_stream_mission_participants WHERE stream_key = ? ORDER BY user_id ASC
    `).all(streamKey);
  }

  recordMissionElement(streamKey, element) {
    this.db.prepare(`
      INSERT OR IGNORE INTO streammonsters_stream_mission_elements (stream_key, element) VALUES (?, ?)
    `).run(streamKey, element);
    return this.db.prepare(`
      SELECT COUNT(*) AS count FROM streammonsters_stream_mission_elements WHERE stream_key = ?
    `).get(streamKey).count;
  }

  claimMissionParticipantReward(streamKey, userId, rewardedAtMs) {
    return this.db.prepare(`
      UPDATE streammonsters_stream_mission_participants SET rewarded_at_ms = ?
      WHERE stream_key = ? AND user_id = ? AND rewarded_at_ms IS NULL
    `).run(rewardedAtMs, streamKey, userId).changes > 0;
  }

  getHeartChain(streamKey) {
    const key = streamKey || 'offline';
    this.db.prepare(`INSERT OR IGNORE INTO streammonsters_heart_chains (stream_key) VALUES (?)`).run(key);
    const row = this.db.prepare(`SELECT * FROM streammonsters_heart_chains WHERE stream_key = ?`).get(key);
    return { ...row, awarded: JSON.parse(row.awarded_json) };
  }

  setHeartChain(streamKey, chain) {
    const key = streamKey || 'offline';
    this.db.prepare(`
      UPDATE streammonsters_heart_chains
      SET last_user_id = ?, last_gift_at_ms = ?, chain_length = ?, awarded_json = ?
      WHERE stream_key = ?
    `).run(chain.lastUserId, chain.lastGiftAtMs, chain.length, JSON.stringify(chain.awarded), key);
    return this.getHeartChain(key);
  }

  getSelectedMonster(userId) {
    const row = this.db.prepare(`
      SELECT * FROM streammonsters_monsters
      WHERE user_id = ? AND is_selected = 1 AND collection_state = 'owned'
    `).get(userId);
    return row ? { ...row, stats: JSON.parse(row.stats_json) } : null;
  }

  selectMonster(userId, monsterId) {
    const transaction = this.db.transaction(() => {
      this.db.prepare('UPDATE streammonsters_monsters SET is_selected = 0 WHERE user_id = ?').run(userId);
      const result = this.db.prepare(`
        UPDATE streammonsters_monsters SET is_selected = 1
        WHERE user_id = ? AND monster_id = ? AND collection_state = 'owned'
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
        rules_version, skills_json, result_json, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.battleId, input.seed, input.monsterAId, input.monsterBId,
      input.winnerMonsterId, input.userAId || null, input.userBId || null,
      input.stanceA || null, input.stanceB || null,
      JSON.stringify(input.result?.rounds || []),
      Number.isInteger(input.rulesVersion) ? input.rulesVersion : null,
      input.skills ? JSON.stringify(input.skills) : null,
      JSON.stringify(input.result), input.createdAtMs
    );
    return this.getBattle(input.battleId);
  }

  getBattle(battleId) {
    const row = this.db.prepare('SELECT * FROM streammonsters_battles WHERE battle_id = ?').get(battleId);
    if (!row) return null;
    return {
      ...row,
      rulesVersion: Number.isInteger(row.rules_version) ? row.rules_version : null,
      rounds: this.safeParseBattleJson(row.rounds_json, []),
      skills: this.safeParseBattleJson(row.skills_json, null),
      result: this.safeParseBattleJson(row.result_json, null)
    };
  }

  safeParseBattleJson(value, fallback) {
    if (typeof value !== 'string' || !value.trim()) return fallback;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  countBattlesBetween(monsterAId, monsterBId) {
    if (!monsterAId || !monsterBId) return 0;
    const row = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM streammonsters_battles
      WHERE (monster_a_id = ? AND monster_b_id = ?)
         OR (monster_a_id = ? AND monster_b_id = ?)
    `).get(monsterAId, monsterBId, monsterBId, monsterAId);
    return Math.max(0, Number(row?.count) || 0);
  }

  countBattlesBetweenViewers(userAId, userBId) {
    if (!userAId || !userBId || userAId === userBId) return 0;
    const row = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM streammonsters_battles battle
      LEFT JOIN streammonsters_monsters monster_a
        ON monster_a.monster_id = battle.monster_a_id
      LEFT JOIN streammonsters_monsters monster_b
        ON monster_b.monster_id = battle.monster_b_id
      WHERE (
        COALESCE(battle.user_a_id, monster_a.user_id) = ?
        AND COALESCE(battle.user_b_id, monster_b.user_id) = ?
      ) OR (
        COALESCE(battle.user_a_id, monster_a.user_id) = ?
        AND COALESCE(battle.user_b_id, monster_b.user_id) = ?
      )
    `).get(userAId, userBId, userBId, userAId);
    return Math.max(0, Number(row?.count) || 0);
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

  enqueueBattle({
    userId,
    monsterId,
    stance,
    streamKey = null,
    queuedPower = null,
    queuedAtMs
  }) {
    const monster = this.getMonster(monsterId);
    if (
      !monster ||
      monster.user_id !== userId ||
      monster.collection_state !== 'owned'
    ) {
      throw new Error('STREAM_MONSTER_NOT_OWNED');
    }
    const power = Number.isInteger(queuedPower)
      ? queuedPower
      : effectiveCombatPower(monster);
    this.db.prepare(`
      INSERT INTO streammonsters_battle_queue (
        user_id, monster_id, stance, stream_key, queued_power, queued_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        monster_id = excluded.monster_id,
        stance = excluded.stance,
        stream_key = excluded.stream_key,
        queued_power = excluded.queued_power,
        queued_at_ms = excluded.queued_at_ms
    `).run(userId, monsterId, stance, streamKey, power, queuedAtMs);
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

  purgeBattleQueue(cutoffMs, streamKey = undefined) {
    if (streamKey === undefined) {
      return this.db.prepare(`
        DELETE FROM streammonsters_battle_queue WHERE queued_at_ms < ?
      `).run(cutoffMs).changes;
    }
    const scopedStreamKey = String(streamKey || '').trim();
    if (!scopedStreamKey) return 0;
    return this.db.prepare(`
      DELETE FROM streammonsters_battle_queue
      WHERE stream_key = ? AND queued_at_ms < ?
    `).run(scopedStreamKey, cutoffMs).changes;
  }

  awardMonsterXp(monsterId, amount) {
    const current = this.getMonster(monsterId);
    if (!current || current.collection_state !== 'owned') return null;
    let level = current.level;
    let xp = current.xp + Math.max(0, Number.parseInt(amount, 10) || 0);
    let unspentStatPoints = Math.max(0, Number(current.unspent_stat_points) || 0);
    while (level < 20 && xp >= 100 + (25 * (level - 1))) {
      xp -= 100 + (25 * (level - 1));
      level += 1;
      unspentStatPoints += 1;
    }
    if (level >= 20) xp = 0;
    this.db.prepare(`
      UPDATE streammonsters_monsters
      SET level = ?, xp = ?, unspent_stat_points = ?
      WHERE monster_id = ?
    `).run(level, xp, unspentStatPoints, monsterId);
    return this.getMonster(monsterId);
  }

  applyMonsterStatPoint({ userId, monsterId, stat }) {
    const names = ['vitality', 'might', 'guard', 'agility'];
    if (!names.includes(stat)) return { applied: false, reason: 'invalid_stat' };
    return this.runInImmediateTransaction(() => {
      const monster = this.getMonster(monsterId);
      if (
        !monster ||
        monster.user_id !== userId ||
        monster.collection_state !== 'owned'
      ) {
        return { applied: false, reason: 'not_owned' };
      }
      if ((Number(monster.unspent_stat_points) || 0) < 1) {
        return { applied: false, reason: 'no_points' };
      }
      const stats = { ...monster.stats, [stat]: (Number(monster.stats[stat]) || 0) + 1 };
      const updated = this.db.prepare(`
        UPDATE streammonsters_monsters
        SET stats_json = ?, unspent_stat_points = unspent_stat_points - 1
        WHERE monster_id = ? AND user_id = ? AND unspent_stat_points > 0
      `).run(JSON.stringify(stats), monsterId, userId);
      if (!updated.changes) return { applied: false, reason: 'already_claimed' };
      return { applied: true, stat, monster: this.getMonster(monsterId) };
    });
  }

  awardViewerXp(userId, amount, preferredMonsterId = null) {
    this.ensureViewer(userId);
    const normalizedAmount = Math.max(0, Number.parseInt(amount, 10) || 0);
    const progress = this.getViewerProgress(userId);
    const preferred = preferredMonsterId ? this.getMonster(preferredMonsterId) : null;
    const monster = preferred?.user_id === userId && preferred.collection_state === 'owned'
      ? preferred
      : this.getSelectedMonster(userId);
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
    if (!current || current.collection_state !== 'owned') return null;
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
      WHERE user_id = ? AND collection_state = 'owned'
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
    const charged = Math.floor(total / 100);
    const overflow = total % 100;
    this.db.prepare(`
      UPDATE streammonsters_hype
      SET points = ?, charged_eggs = charged_eggs + ?, updated_at_ms = ?
      WHERE stream_key = ?
    `).run(overflow, charged, updatedAtMs, key);
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

  claimCommandIngressEvent({
    eventId,
    commandName,
    userId,
    transport,
    createdAtMs = Date.now(),
    ttlMs = 21_600_000,
    maxRows = 50_000
  } = {}) {
    const normalizedEventId = String(eventId || '').trim();
    const normalizedCommand = String(commandName || '').trim().toLowerCase();
    const normalizedUserId = String(userId || '').trim();
    const normalizedTransport = String(transport || '').trim().toLowerCase();
    if (!normalizedEventId || !normalizedCommand || !normalizedUserId || !normalizedTransport) {
      throw new Error('STREAM_MONSTERS_COMMAND_EVENT_INVALID');
    }
    const timestamp = Number.isFinite(Number(createdAtMs))
      ? Math.trunc(Number(createdAtMs))
      : Date.now();
    const retentionMs = Math.max(1_000, Math.min(
      604_800_000,
      Math.trunc(Number(ttlMs) || 21_600_000)
    ));
    const rowLimit = Math.max(1, Math.min(
      100_000,
      Math.trunc(Number(maxRows) || 50_000)
    ));

    return this.runInImmediateTransaction(() => {
      this.db.prepare(`
        DELETE FROM streammonsters_command_ingress_events
        WHERE expires_at_ms <= ?
      `).run(timestamp);
      const insert = this.db.prepare(`
        INSERT OR IGNORE INTO streammonsters_command_ingress_events (
          event_id, command_name, user_id, transport, created_at_ms, expires_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        normalizedEventId,
        normalizedCommand,
        normalizedUserId,
        normalizedTransport,
        timestamp,
        timestamp + retentionMs
      );
      if (insert.changes > 0) {
        const count = this.db.prepare(`
          SELECT COUNT(*) AS count FROM streammonsters_command_ingress_events
        `).get().count;
        const excess = Math.max(0, Number(count) - rowLimit);
        if (excess > 0) {
          this.db.prepare(`
            DELETE FROM streammonsters_command_ingress_events
            WHERE sequence IN (
              SELECT sequence FROM streammonsters_command_ingress_events
              ORDER BY created_at_ms ASC, sequence ASC
              LIMIT ?
            )
          `).run(excess);
        }
      }
      return {
        claimed: insert.changes > 0,
        eventId: normalizedEventId
      };
    });
  }

  addArtPoolSkin(input) {
    const artId = input.artId || randomUUID();
    this.db.prepare(`
      INSERT INTO streammonsters_art_pool (
        art_id, element, variant, provider, status, image_url, visual_key,
        template_id, monster_id, created_at_ms, consumed_at_ms
      ) VALUES (?, ?, ?, ?, 'ready', ?, ?, ?, NULL, ?, NULL)
    `).run(
      artId, input.element, input.variant, input.provider, input.imageUrl,
      input.visualKey, input.templateId || null, input.createdAtMs
    );
    return this.db.prepare('SELECT * FROM streammonsters_art_pool WHERE art_id = ?').get(artId);
  }

  enqueueOutboxEvent({
    eventId,
    correlationId,
    streamKey,
    eventType,
    payload,
    createdAtMs = Date.now()
  }) {
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO streammonsters_event_outbox (
        event_id, correlation_id, stream_key, event_type, payload_json, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      eventId,
      correlationId,
      streamKey || 'offline',
      eventType,
      JSON.stringify(payload || {}),
      createdAtMs
    );
    return insert.changes > 0;
  }

  appendCriticalEvent(input) {
    const append = () => {
      const persisted = this.appendPublicEvent(input);
      const queued = this.enqueueOutboxEvent(input);
      return { ...persisted, queued, inserted: persisted.inserted && queued };
    };
    return this.transactionDepth > 0
      ? append()
      : this.runInImmediateTransaction(append);
  }

  pendingOutboxEvents(limit = 100) {
    return this.db.prepare(`
      SELECT event_id, correlation_id, stream_key, event_type, payload_json, created_at_ms
      FROM streammonsters_event_outbox
      WHERE delivered_at_ms IS NULL
      ORDER BY created_at_ms ASC, event_id ASC
      LIMIT ?
    `).all(Math.max(1, Math.min(250, Number(limit) || 100))).map(row => ({
      eventId: row.event_id,
      correlationId: row.correlation_id,
      streamKey: row.stream_key,
      eventType: row.event_type,
      payload: JSON.parse(row.payload_json),
      createdAtMs: row.created_at_ms
    }));
  }

  acknowledgeOutboxEvent(eventId, deliveredAtMs = Date.now()) {
    return this.db.prepare(`
      UPDATE streammonsters_event_outbox
      SET delivered_at_ms = COALESCE(delivered_at_ms, ?),
          delivery_attempts = delivery_attempts + 1
      WHERE event_id = ?
    `).run(deliveredAtMs, eventId).changes === 1;
  }
  appendPublicEvent({
    eventId,
    correlationId,
    streamKey,
    eventType,
    payload,
    createdAtMs = Date.now()
  }) {
    const result = this.db.prepare(`
      INSERT OR IGNORE INTO streammonsters_public_events (
        event_id, correlation_id, stream_key, event_type, payload_json, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      eventId,
      correlationId,
      streamKey || 'offline',
      eventType,
      JSON.stringify(payload || {}),
      createdAtMs
    );
    const row = this.db.prepare(`
      SELECT sequence, event_id, correlation_id, stream_key, event_type,
             payload_json, created_at_ms
      FROM streammonsters_public_events
      WHERE event_id = ?
    `).get(eventId);
    return {
      inserted: result.changes > 0,
      event: row ? this.projectPublicEventRow(row) : null
    };
  }

  getRecentPublicEvents(streamKey, {
    afterSequence = 0,
    limit = 100
  } = {}) {
    const normalizedLimit = Math.max(1, Math.min(200, Number(limit) || 100));
    const rows = this.db.prepare(`
      SELECT sequence, event_id, correlation_id, stream_key, event_type,
             payload_json, created_at_ms
      FROM streammonsters_public_events
      WHERE stream_key = ? AND sequence > ?
      ORDER BY sequence DESC
      LIMIT ?
    `).all(
      streamKey || 'offline',
      Math.max(0, Number(afterSequence) || 0),
      normalizedLimit
    );
    return rows.reverse().map(row => this.projectPublicEventRow(row));
  }

  projectPublicEventRow(row) {
    let payload = {};
    try {
      payload = JSON.parse(row.payload_json || '{}');
    } catch (_) {
      payload = {};
    }
    return {
      sequence: row.sequence,
      eventId: row.event_id,
      correlationId: row.correlation_id,
      type: row.event_type,
      createdAtMs: row.created_at_ms,
      payload
    };
  }

  prunePublicEvents(cutoffMs, maximumRows = 500) {
    const expired = this.db.prepare(`
      DELETE FROM streammonsters_public_events WHERE created_at_ms < ?
    `).run(cutoffMs).changes;
    const overflow = this.db.prepare(`
      DELETE FROM streammonsters_public_events
      WHERE sequence IN (
        SELECT sequence
        FROM streammonsters_public_events
        ORDER BY sequence DESC
        LIMIT -1 OFFSET ?
      )
    `).run(Math.max(1, Number(maximumRows) || 500)).changes;
    return expired + overflow;
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

  consumeArtPoolSkinForTemplate(element, variant, templateId, monsterId = null, consumedAtMs = Date.now()) {
    const find = this.db.prepare(`
      SELECT * FROM streammonsters_art_pool
      WHERE element = ? AND variant = ? AND template_id IS ? AND status = 'ready'
      ORDER BY created_at_ms ASC, art_id ASC LIMIT 1
    `);
    const entry = find.get(element, variant, templateId || null);
    if (!entry) return null;
    this.db.prepare(`
      UPDATE streammonsters_art_pool SET status = 'consumed', monster_id = ?, consumed_at_ms = ? WHERE art_id = ?
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
