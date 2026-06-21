/**
 * Memory Database for AnimazingPal Brain
 * Stores long-term memories, user interactions, and conversation context
 * Uses SQLite for persistent storage with vector-based semantic search
 * 
 * All data is scoped per streamer_id to support multiple streamer profiles
 */

class MemoryDatabase {
  constructor(db, logger) {
    this.db = db;
    this.logger = logger;
    this.initialized = false;
    this.streamerId = null; // Current streamer profile
  }

  /**
   * Set the current streamer ID for scoped queries
   */
  setStreamerId(streamerId) {
    this.streamerId = streamerId;
    this.logger.info(`Memory Database: Switched to streamer profile "${streamerId}"`);
  }

  /**
   * Get the current streamer ID
   */
  getStreamerId() {
    return this.streamerId || 'default';
  }

  /**
   * Initialize database tables for memory storage
   */
  initialize() {
    if (this.initialized) return;

    try {
      // Core memories table - stores individual memory entries (per streamer)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS animazingpal_memories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          streamer_id TEXT NOT NULL DEFAULT 'default',
          memory_type TEXT NOT NULL,
          content TEXT NOT NULL,
          context TEXT,
          embedding TEXT,
          importance REAL DEFAULT 0.5,
          access_count INTEGER DEFAULT 0,
          last_accessed DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          tags TEXT,
          source_user TEXT,
          source_event TEXT
        )
      `);

      // User profiles - stores information about viewers/users (per streamer)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS animazingpal_user_profiles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          streamer_id TEXT NOT NULL DEFAULT 'default',
          username TEXT NOT NULL,
          nickname TEXT,
          first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_seen DATETIME,
          last_interaction DATETIME,
          interaction_count INTEGER DEFAULT 0,
          stream_count INTEGER DEFAULT 0,
          gift_count INTEGER DEFAULT 0,
          total_diamonds INTEGER DEFAULT 0,
          personality_notes TEXT,
          relationship_level TEXT DEFAULT 'stranger',
          favorite_topics TEXT,
          interaction_history TEXT,
          last_topic TEXT,
          custom_tags TEXT,
          UNIQUE(streamer_id, username)
        )
      `);

      // Conversation history - recent conversations for context (per streamer)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS animazingpal_conversations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          streamer_id TEXT NOT NULL DEFAULT 'default',
          session_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          username TEXT,
          emotion TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Memory archives - compressed/summarized old memories (per streamer)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS animazingpal_memory_archive (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          streamer_id TEXT NOT NULL DEFAULT 'default',
          summary TEXT NOT NULL,
          memory_ids TEXT NOT NULL,
          time_range_start DATETIME,
          time_range_end DATETIME,
          key_topics TEXT,
          key_users TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Personality configurations (global - shared across streamers)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS animazingpal_personalities (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          display_name TEXT NOT NULL,
          description TEXT,
          system_prompt TEXT NOT NULL,
          voice_style TEXT,
          emotion_tendencies TEXT,
          catchphrases TEXT,
          topics_of_interest TEXT,
          response_style TEXT,
          tone_settings TEXT DEFAULT '{"temperature":0.7,"presencePenalty":0.3,"frequencyPenalty":0.2}',
          emote_config TEXT DEFAULT '{"defaultEmote":"neutral","highEnergyEmote":"excited","lowEnergyEmote":"calm"}',
          memory_behavior TEXT DEFAULT '{"importanceThreshold":0.5,"maxContextMemories":10}',
          language TEXT DEFAULT 'de',
          is_active INTEGER DEFAULT 0,
          is_custom INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes for performance
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_memories_streamer ON animazingpal_memories(streamer_id);
        CREATE INDEX IF NOT EXISTS idx_memories_type ON animazingpal_memories(streamer_id, memory_type);
        CREATE INDEX IF NOT EXISTS idx_memories_importance ON animazingpal_memories(streamer_id, importance DESC);
        CREATE INDEX IF NOT EXISTS idx_memories_created ON animazingpal_memories(streamer_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_memories_user ON animazingpal_memories(streamer_id, source_user);
        CREATE INDEX IF NOT EXISTS idx_users_streamer ON animazingpal_user_profiles(streamer_id);
        CREATE INDEX IF NOT EXISTS idx_conversations_streamer ON animazingpal_conversations(streamer_id);
        CREATE INDEX IF NOT EXISTS idx_conversations_session ON animazingpal_conversations(streamer_id, session_id);
        CREATE INDEX IF NOT EXISTS idx_conversations_time ON animazingpal_conversations(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_users_username ON animazingpal_user_profiles(username);
      `);

      // Insert default personalities if not exist
      this._insertDefaultPersonalities();

      // Apply schema migrations for new fields
      this._applyMigrations();

      this.initialized = true;
      this.logger.info('AnimazingPal Memory Database initialized');
    } catch (error) {
      this.logger.error(`Failed to initialize memory database: ${error.message}`);
      throw error;
    }
  }

  /**
   * Insert default personality templates
   */
  _insertDefaultPersonalities() {
    const defaultPersonalities = [
      {
        name: 'friendly_streamer',
        display_name: 'Freundlicher Streamer',
        description: 'Ein warmherziger, enthusiastischer Streamer der jeden Zuschauer willkommen heißt',
        system_prompt: `Du bist ein freundlicher, enthusiastischer Livestreamer. Du begrüßt jeden Zuschauer herzlich und freust dich über jede Interaktion.

Deine Persönlichkeit:
- Immer positiv und aufmunternd
- Merkst dir Namen und kleine Details über deine Zuschauer
- Verwendest gelegentlich Emojis
- Bedankst dich herzlich für Geschenke
- Stellst Fragen an deine Community
- Teilst kleine persönliche Geschichten

Sprechstil: Locker und freundlich, wie ein guter Freund`,
        voice_style: 'warm,friendly,enthusiastic',
        emotion_tendencies: JSON.stringify({ happy: 0.6, excited: 0.3, neutral: 0.1 }),
        catchphrases: JSON.stringify(['Hey, schön dich zu sehen!', 'Das ist ja mega!', 'Ihr seid die Besten!']),
        topics_of_interest: JSON.stringify(['Gaming', 'Community', 'Alltag', 'Musik']),
        response_style: 'casual'
      },
      {
        name: 'gaming_pro',
        display_name: 'Gaming Pro',
        description: 'Ein kompetitiver Gamer mit Expertise und trockenem Humor',
        system_prompt: `Du bist ein erfahrener Gaming-Streamer mit viel Expertise. Du nimmst Gaming ernst, hast aber auch einen trockenen Humor.

Deine Persönlichkeit:
- Teilst gerne Gaming-Tipps und Tricks
- Kommentierst Gameplay analytisch
- Hast einen trockenen, sarkastischen Humor
- Respektierst gute Spieler und hilfst Anfängern
- Bleibst auch bei Niederlagen gelassen

Sprechstil: Direkt und informativ, mit gelegentlichem trockenem Humor`,
        voice_style: 'confident,analytical,witty',
        emotion_tendencies: JSON.stringify({ focused: 0.4, excited: 0.3, neutral: 0.3 }),
        catchphrases: JSON.stringify(['Gg', 'Das war knapp', 'Klassiker', 'Watch and learn']),
        topics_of_interest: JSON.stringify(['Gaming', 'Esports', 'Strategien', 'Hardware']),
        response_style: 'analytical'
      },
      {
        name: 'entertainer',
        display_name: 'Entertainer',
        description: 'Ein charismatischer Unterhalter der keine Langeweile kennt',
        system_prompt: `Du bist ein charismatischer Entertainer. Dein Ziel ist es, jeden zum Lachen zu bringen und für gute Laune zu sorgen.

Deine Persönlichkeit:
- Erzählst gerne Witze und lustige Geschichten
- Reagierst übertrieben auf Situationen (auf lustige Art)
- Machst gerne Challenges und Spiele mit Zuschauern
- Hast immer eine lustige Antwort parat
- Singst manchmal spontan

Sprechstil: Energetisch, witzig und überraschend`,
        voice_style: 'energetic,funny,dramatic',
        emotion_tendencies: JSON.stringify({ happy: 0.5, surprised: 0.3, excited: 0.2 }),
        catchphrases: JSON.stringify(['WAAAAS?!', 'Nein, das glaub ich nicht!', 'Let\'s goooo!', 'Das ist legendary!']),
        topics_of_interest: JSON.stringify(['Comedy', 'Challenges', 'Musik', 'Geschichten']),
        response_style: 'theatrical'
      },
      {
        name: 'chill_vibes',
        display_name: 'Chill Vibes',
        description: 'Ein entspannter Streamer für gemütliche Sessions',
        system_prompt: `Du bist ein entspannter, ruhiger Streamer. Du schaffst eine gemütliche Atmosphäre wo sich jeder wohlfühlen kann.

Deine Persönlichkeit:
- Ruhig und gelassen, auch in stressigen Situationen
- Hörst gerne zu und gibst bedachte Antworten
- Philosophierst gerne über tiefere Themen
- Schätzt Qualität über Quantität
- Genießt die kleinen Dinge

Sprechstil: Ruhig, bedacht und tiefgründig`,
        voice_style: 'calm,thoughtful,soothing',
        emotion_tendencies: JSON.stringify({ neutral: 0.5, content: 0.3, thoughtful: 0.2 }),
        catchphrases: JSON.stringify(['Alles easy', 'Nimm dir Zeit', 'Das ist okay', 'Vibe with me']),
        topics_of_interest: JSON.stringify(['Musik', 'Philosophie', 'Kunst', 'Natur']),
        response_style: 'thoughtful'
      },
      {
        name: 'anime_fan',
        display_name: 'Anime Fan',
        description: 'Ein begeisterter Anime- und Manga-Fan mit Otaku-Kultur',
        system_prompt: `Du bist ein leidenschaftlicher Anime- und Manga-Fan. Du liebst japanische Popkultur und teilst diese Begeisterung mit deiner Community.

Deine Persönlichkeit:
- Verwendest gelegentlich japanische Ausdrücke
- Machst Anime-Referenzen
- Diskutierst gerne über Charaktere und Geschichten
- Bist enthusiastisch über neue Anime-Seasons
- Hast Waifus/Husbandos

Sprechstil: Enthusiastisch mit anime-typischen Reaktionen`,
        voice_style: 'kawaii,enthusiastic,expressive',
        emotion_tendencies: JSON.stringify({ excited: 0.4, happy: 0.3, dramatic: 0.3 }),
        catchphrases: JSON.stringify(['Kawaii!', 'Sugoi!', 'Nani?!', 'Das ist mein Waifu!']),
        topics_of_interest: JSON.stringify(['Anime', 'Manga', 'VTuber', 'Japan', 'Cosplay']),
        response_style: 'expressive'
      }
    ];

    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO animazingpal_personalities 
      (name, display_name, description, system_prompt, voice_style, emotion_tendencies, catchphrases, topics_of_interest, response_style, tone_settings, emote_config, memory_behavior, is_custom)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    for (const personality of defaultPersonalities) {
      insertStmt.run(
        personality.name,
        personality.display_name,
        personality.description,
        personality.system_prompt,
        personality.voice_style,
        personality.emotion_tendencies,
        personality.catchphrases,
        personality.topics_of_interest,
        personality.response_style,
        JSON.stringify({ temperature: 0.7, presencePenalty: 0.3, frequencyPenalty: 0.2 }),
        JSON.stringify({ defaultEmote: 'neutral', highEnergyEmote: 'excited', lowEnergyEmote: 'calm' }),
        JSON.stringify({ importanceThreshold: 0.5, maxContextMemories: 10 })
      );
    }
  }

  /**
   * Apply database schema migrations for new fields
   */
  _applyMigrations() {
    try {
      // Check if new columns exist, if not add them
      const columns = this.db.prepare(`PRAGMA table_info(animazingpal_user_profiles)`).all();
      const columnNames = columns.map(col => col.name);

      const migrations = [
        { column: 'last_interaction', sql: 'ALTER TABLE animazingpal_user_profiles ADD COLUMN last_interaction DATETIME' },
        { column: 'stream_count', sql: 'ALTER TABLE animazingpal_user_profiles ADD COLUMN stream_count INTEGER DEFAULT 0' },
        { column: 'interaction_history', sql: 'ALTER TABLE animazingpal_user_profiles ADD COLUMN interaction_history TEXT' },
        { column: 'last_topic', sql: 'ALTER TABLE animazingpal_user_profiles ADD COLUMN last_topic TEXT' }
      ];

      for (const migration of migrations) {
        if (!columnNames.includes(migration.column)) {
          try {
            this.db.exec(migration.sql);
            this.logger.info(`Migration: Added ${migration.column} column`);
          } catch (migrationError) {
            this.logger.error(`Failed to add ${migration.column} column: ${migrationError.message}`);
            // Log specific error but continue with other migrations
            // This allows partial migrations to succeed
          }
        }
      }

      const personalityColumns = this.db.prepare(`PRAGMA table_info(animazingpal_personalities)`).all();
      const personalityColumnNames = personalityColumns.map(col => col.name);
      const personalityMigrations = [
        {
          column: 'tone_settings',
          sql: `ALTER TABLE animazingpal_personalities ADD COLUMN tone_settings TEXT DEFAULT '{"temperature":0.7,"presencePenalty":0.3,"frequencyPenalty":0.2}'`
        },
        {
          column: 'emote_config',
          sql: `ALTER TABLE animazingpal_personalities ADD COLUMN emote_config TEXT DEFAULT '{"defaultEmote":"neutral","highEnergyEmote":"excited","lowEnergyEmote":"calm"}'`
        },
        {
          column: 'memory_behavior',
          sql: `ALTER TABLE animazingpal_personalities ADD COLUMN memory_behavior TEXT DEFAULT '{"importanceThreshold":0.5,"maxContextMemories":10}'`
        }
      ];

      for (const migration of personalityMigrations) {
        if (!personalityColumnNames.includes(migration.column)) {
          try {
            this.db.exec(migration.sql);
            this.logger.info(`Migration: Added ${migration.column} column`);
          } catch (migrationError) {
            this.logger.error(`Failed to add ${migration.column} column: ${migrationError.message}`);
          }
        }
      }

      this.logger.info('Database migrations completed successfully');
    } catch (error) {
      this.logger.error(`Migration error: ${error.message}`);
      this.logger.warn('Database may be in inconsistent state. Some features may not work correctly.');
      // Don't throw - allow initialization to continue with existing schema
    }
  }

  // ==================== Memory Operations ====================

  /**
   * Store a new memory
   */
  storeMemory(data) {
    const streamerId = this.getStreamerId();
    const stmt = this.db.prepare(`
      INSERT INTO animazingpal_memories 
      (streamer_id, memory_type, content, context, embedding, importance, tags, source_user, source_event)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      streamerId,
      data.type || 'general',
      data.content,
      data.context || null,
      data.embedding ? JSON.stringify(data.embedding) : null,
      data.importance || 0.5,
      data.tags ? JSON.stringify(data.tags) : null,
      data.user || null,
      data.event || null
    );

    return result.lastInsertRowid;
  }

  /**
   * Get recent memories (scoped by streamer)
   */
  getRecentMemories(limit = 20, type = null) {
    const streamerId = this.getStreamerId();
    let query = 'SELECT * FROM animazingpal_memories WHERE streamer_id = ?';
    const params = [streamerId];
    
    if (type) {
      query += ' AND memory_type = ?';
      params.push(type);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    return this.db.prepare(query).all(...params);
  }

  /**
   * Get important memories (scoped by streamer)
   */
  getImportantMemories(minImportance = 0.7, limit = 50) {
    const streamerId = this.getStreamerId();
    return this.db.prepare(`
      SELECT * FROM animazingpal_memories 
      WHERE streamer_id = ? AND importance >= ?
      ORDER BY importance DESC, created_at DESC
      LIMIT ?
    `).all(streamerId, minImportance, limit);
  }

  /**
   * Search memories by content (scoped by streamer)
   */
  searchMemories(searchTerm, limit = 20) {
    const streamerId = this.getStreamerId();
    return this.db.prepare(`
      SELECT * FROM animazingpal_memories 
      WHERE streamer_id = ? AND content LIKE ?
      ORDER BY importance DESC, created_at DESC
      LIMIT ?
    `).all(streamerId, `%${searchTerm}%`, limit);
  }

  /**
   * Get memories related to a user
   */
  getUserMemories(username, limit = 30) {
    return this.db.prepare(`
      SELECT * FROM animazingpal_memories 
      WHERE streamer_id = ? AND source_user = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(this.getStreamerId(), username, limit);
  }

  /**
   * Update memory importance
   */
  updateMemoryImportance(memoryId, importance) {
    this.db.prepare(`
      UPDATE animazingpal_memories 
      SET importance = ?, access_count = access_count + 1, last_accessed = CURRENT_TIMESTAMP
      WHERE id = ? AND streamer_id = ?
    `).run(importance, memoryId, this.getStreamerId());
  }

  /**
   * Delete old low-importance memories (scoped by streamer)
   */
  pruneOldMemories(daysOld = 30, maxImportance = 0.3) {
    const streamerId = this.getStreamerId();
    const result = this.db.prepare(`
      DELETE FROM animazingpal_memories 
      WHERE streamer_id = ? AND importance < ? 
      AND created_at < datetime('now', '-' || ? || ' days')
    `).run(streamerId, maxImportance, daysOld);

    return result.changes;
  }

  // ==================== User Profile Operations ====================

  /**
   * Get or create user profile (scoped by streamer)
   */
  getOrCreateUserProfile(username, nickname = null) {
    const streamerId = this.getStreamerId();
    let profile = this.db.prepare(`
      SELECT * FROM animazingpal_user_profiles WHERE streamer_id = ? AND username = ?
    `).get(streamerId, username);

    if (!profile) {
      this.db.prepare(`
        INSERT INTO animazingpal_user_profiles 
        (streamer_id, username, nickname, last_interaction, stream_count, interaction_history, interaction_count) 
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, 1, '[]', 1)
      `).run(streamerId, username, nickname);
      
      profile = this.db.prepare(`
        SELECT * FROM animazingpal_user_profiles WHERE streamer_id = ? AND username = ?
      `).get(streamerId, username);
    } else {
      // Update last_seen, last_interaction and increment interaction count
      this.db.prepare(`
        UPDATE animazingpal_user_profiles 
        SET last_seen = CURRENT_TIMESTAMP,
            last_interaction = CURRENT_TIMESTAMP,
            interaction_count = interaction_count + 1,
            nickname = COALESCE(?, nickname)
        WHERE streamer_id = ? AND username = ?
      `).run(nickname, streamerId, username);
      
      // Reload profile to get updated values
      profile = this.db.prepare(`
        SELECT * FROM animazingpal_user_profiles WHERE streamer_id = ? AND username = ?
      `).get(streamerId, username);
    }

    return profile;
  }

  /**
   * Update user profile (scoped by streamer)
   */
  updateUserProfile(username, updates) {
    const streamerId = this.getStreamerId();
    
    // Allowed fields for updates to prevent SQL injection and maintain data integrity
    const UPDATABLE_FIELDS = [
      'nickname', 
      'personality_notes', 
      'relationship_level', 
      'favorite_topics', 
      'custom_tags', 
      'last_topic', 
      'interaction_history'
    ];
    
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (UPDATABLE_FIELDS.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(typeof value === 'object' ? JSON.stringify(value) : value);
      }
    }

    if (fields.length === 0) return;

    values.push(streamerId, username);
    this.db.prepare(`
      UPDATE animazingpal_user_profiles 
      SET ${fields.join(', ')}
      WHERE streamer_id = ? AND username = ?
    `).run(...values);
  }

  /**
   * Record gift from user (scoped by streamer)
   */
  recordGift(username, diamondValue) {
    const streamerId = this.getStreamerId();
    this.db.prepare(`
      UPDATE animazingpal_user_profiles 
      SET gift_count = gift_count + 1, 
          total_diamonds = total_diamonds + ?,
          last_seen = CURRENT_TIMESTAMP
      WHERE streamer_id = ? AND username = ?
    `).run(diamondValue, streamerId, username);
  }

  /**
   * Get top supporters (scoped by streamer)
   */
  getTopSupporters(limit = 10) {
    const streamerId = this.getStreamerId();
    return this.db.prepare(`
      SELECT * FROM animazingpal_user_profiles 
      WHERE streamer_id = ?
      ORDER BY total_diamonds DESC
      LIMIT ?
    `).all(streamerId, limit);
  }

  /**
   * Get frequent chatters (scoped by streamer)
   */
  getFrequentChatters(limit = 10) {
    const streamerId = this.getStreamerId();
    return this.db.prepare(`
      SELECT * FROM animazingpal_user_profiles 
      WHERE streamer_id = ?
      ORDER BY interaction_count DESC
      LIMIT ?
    `).all(streamerId, limit);
  }

  /**
   * Increment stream count for user (called at start of each stream)
   */
  incrementStreamCount(username) {
    const streamerId = this.getStreamerId();
    this.db.prepare(`
      UPDATE animazingpal_user_profiles 
      SET stream_count = stream_count + 1
      WHERE streamer_id = ? AND username = ?
    `).run(streamerId, username);
  }

  /**
   * Add interaction to history
   */
  addInteractionToHistory(username, interactionType, content, metadata = {}) {
    const streamerId = this.getStreamerId();
    const profile = this.db.prepare(`
      SELECT interaction_history FROM animazingpal_user_profiles 
      WHERE streamer_id = ? AND username = ?
    `).get(streamerId, username);

    if (!profile) return;

    let history = [];
    try {
      history = JSON.parse(profile.interaction_history || '[]');
    } catch (e) {
      history = [];
    }

    // Add new interaction
    history.push({
      type: interactionType,
      content: content,
      timestamp: new Date().toISOString(),
      ...metadata
    });

    // Keep only last 50 interactions
    if (history.length > 50) {
      history = history.slice(-50);
    }

    this.db.prepare(`
      UPDATE animazingpal_user_profiles 
      SET interaction_history = ?,
          last_interaction = CURRENT_TIMESTAMP
      WHERE streamer_id = ? AND username = ?
    `).run(JSON.stringify(history), streamerId, username);
  }

  /**
   * Get interaction history for user
   */
  getInteractionHistory(username, limit = 20) {
    const streamerId = this.getStreamerId();
    const profile = this.db.prepare(`
      SELECT interaction_history FROM animazingpal_user_profiles 
      WHERE streamer_id = ? AND username = ?
    `).get(streamerId, username);

    if (!profile || !profile.interaction_history) return [];

    try {
      const history = JSON.parse(profile.interaction_history);
      return history.slice(-limit);
    } catch (e) {
      return [];
    }
  }

  /**
   * Update last topic discussed with user
   */
  updateLastTopic(username, topic) {
    const streamerId = this.getStreamerId();
    this.db.prepare(`
      UPDATE animazingpal_user_profiles 
      SET last_topic = ?
      WHERE streamer_id = ? AND username = ?
    `).run(topic, streamerId, username);
  }

  // ==================== Conversation Operations ====================

  /**
   * Store conversation message (scoped by streamer)
   */
  storeConversation(sessionId, role, content, username = null, emotion = null) {
    const streamerId = this.getStreamerId();
    this.db.prepare(`
      INSERT INTO animazingpal_conversations (streamer_id, session_id, role, content, username, emotion)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(streamerId, sessionId, role, content, username, emotion);
  }

  /**
   * Get conversation history (scoped by streamer)
   */
  getConversationHistory(sessionId, limit = 50) {
    const streamerId = this.getStreamerId();
    return this.db.prepare(`
      SELECT * FROM animazingpal_conversations 
      WHERE streamer_id = ? AND session_id = ?
      ORDER BY created_at ASC
      LIMIT ?
    `).all(streamerId, sessionId, limit);
  }

  /**
   * Get recent conversations across sessions (scoped by streamer)
   */
  getRecentConversations(limit = 100) {
    const streamerId = this.getStreamerId();
    return this.db.prepare(`
      SELECT * FROM animazingpal_conversations 
      WHERE streamer_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(streamerId, limit);
  }

  /**
   * Clear old conversations (scoped by streamer)
   */
  clearOldConversations(daysOld = 7) {
    const streamerId = this.getStreamerId();
    const result = this.db.prepare(`
      DELETE FROM animazingpal_conversations 
      WHERE streamer_id = ? AND created_at < datetime('now', '-' || ? || ' days')
    `).run(streamerId, daysOld);

    return result.changes;
  }

  // ==================== Memory Archive Operations ====================

  /**
   * Create memory archive from memories (scoped by streamer)
   */
  createArchive(summary, memoryIds, keyTopics, keyUsers, timeRange) {
    const streamerId = this.getStreamerId();
    const result = this.db.prepare(`
      INSERT INTO animazingpal_memory_archive 
      (streamer_id, summary, memory_ids, key_topics, key_users, time_range_start, time_range_end)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      streamerId,
      summary,
      JSON.stringify(memoryIds),
      JSON.stringify(keyTopics),
      JSON.stringify(keyUsers),
      timeRange.start,
      timeRange.end
    );

    return result.lastInsertRowid;
  }

  /**
   * Get memory archives (scoped by streamer)
   */
  getArchives(limit = 20) {
    const streamerId = this.getStreamerId();
    return this.db.prepare(`
      SELECT * FROM animazingpal_memory_archive 
      WHERE streamer_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(streamerId, limit);
  }

  /**
   * Search archives (scoped by streamer)
   */
  searchArchives(searchTerm) {
    const streamerId = this.getStreamerId();
    return this.db.prepare(`
      SELECT * FROM animazingpal_memory_archive 
      WHERE streamer_id = ? AND (summary LIKE ? OR key_topics LIKE ?)
      ORDER BY created_at DESC
    `).all(streamerId, `%${searchTerm}%`, `%${searchTerm}%`);
  }

  // ==================== Personality Operations ====================

  /**
   * Get all personalities
   */
  getPersonalities() {
    return this.db.prepare(`
      SELECT * FROM animazingpal_personalities ORDER BY is_active DESC, name ASC
    `).all();
  }

  getPersonality(name) {
    return this.db.prepare(`
      SELECT * FROM animazingpal_personalities WHERE name = ?
    `).get(name);
  }

  /**
   * Get active personality
   */
  getActivePersonality() {
    return this.db.prepare(`
      SELECT * FROM animazingpal_personalities WHERE is_active = 1 LIMIT 1
    `).get();
  }

  /**
   * Set active personality
   */
  setActivePersonality(name) {
    // Deactivate all first
    this.db.prepare(`UPDATE animazingpal_personalities SET is_active = 0`).run();
    
    // Activate selected
    this.db.prepare(`
      UPDATE animazingpal_personalities SET is_active = 1 WHERE name = ?
    `).run(name);
  }

  /**
   * Create custom personality
   */
  createPersonality(data) {
    const result = this.db.prepare(`
      INSERT INTO animazingpal_personalities 
      (name, display_name, description, system_prompt, voice_style, emotion_tendencies, catchphrases, topics_of_interest, response_style, tone_settings, emote_config, memory_behavior, is_custom)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      data.name,
      data.display_name,
      data.description || '',
      data.system_prompt,
      data.voice_style || '',
      JSON.stringify(data.emotion_tendencies || {}),
      JSON.stringify(data.catchphrases || []),
      JSON.stringify(data.topics_of_interest || []),
      data.response_style || 'casual',
      JSON.stringify(data.tone_settings || { temperature: 0.7, presencePenalty: 0.3, frequencyPenalty: 0.2 }),
      JSON.stringify(data.emote_config || { defaultEmote: 'neutral', highEnergyEmote: 'excited', lowEnergyEmote: 'calm' }),
      JSON.stringify(data.memory_behavior || { importanceThreshold: 0.5, maxContextMemories: 10 })
    );

    return result.lastInsertRowid;
  }

  /**
   * Update personality
   */
  updatePersonality(name, updates) {
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      values.push(typeof value === 'object' ? JSON.stringify(value) : value);
    }

    if (fields.length === 0) return;

    values.push(name);
    this.db.prepare(`
      UPDATE animazingpal_personalities 
      SET ${fields.join(', ')}
      WHERE name = ?
    `).run(...values);
  }

  /**
   * Delete custom personality
   */
  deletePersonality(name) {
    // Only allow deleting custom personalities
    const result = this.db.prepare(`
      DELETE FROM animazingpal_personalities WHERE name = ? AND is_custom = 1
    `).run(name);

    return result.changes > 0;
  }

  // ==================== Statistics ====================

  /**
   * Get memory statistics (scoped by streamer)
   */
  getStatistics() {
    const streamerId = this.getStreamerId();
    const memoryCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM animazingpal_memories WHERE streamer_id = ?
    `).get(streamerId);
    const userCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM animazingpal_user_profiles WHERE streamer_id = ?
    `).get(streamerId);
    const conversationCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM animazingpal_conversations WHERE streamer_id = ?
    `).get(streamerId);
    const archiveCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM animazingpal_memory_archive WHERE streamer_id = ?
    `).get(streamerId);
    
    const avgImportance = this.db.prepare(`
      SELECT AVG(importance) as avg FROM animazingpal_memories WHERE streamer_id = ?
    `).get(streamerId);
    
    const topUsers = this.getTopSupporters(5);
    
    return {
      streamerId,
      totalMemories: memoryCount.count,
      totalUsers: userCount.count,
      totalConversations: conversationCount.count,
      totalArchives: archiveCount.count,
      averageImportance: avgImportance.avg || 0,
      topSupporters: topUsers
    };
  }

  /**
   * Get list of all streamer profiles in the database
   */
  getStreamerProfiles() {
    const profiles = this.db.prepare(`
      SELECT DISTINCT streamer_id, COUNT(*) as memory_count 
      FROM animazingpal_memories 
      GROUP BY streamer_id
    `).all();
    
    return profiles.map(p => ({
      streamerId: p.streamer_id,
      memoryCount: p.memory_count
    }));
  }
}

module.exports = MemoryDatabase;
