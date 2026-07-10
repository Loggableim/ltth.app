/**
 * Game Engine Database Module
 * 
 * Manages persistent storage for game sessions, moves, configurations, and results.
 */

class GameEngineDatabase {
  constructor(api, logger) {
    this.api = api;
    this.logger = this._normalizeLogger(logger);
    this.db = api.getDatabase().db; // Get the underlying better-sqlite3 instance
  }

  _normalizeLogger(logger) {
    const fallback = (level) => (message) => {
      if (typeof this.api?.log === 'function') {
        this.api.log(message, level);
      }
    };

    return {
      info: typeof logger?.info === 'function' ? logger.info.bind(logger) : fallback('info'),
      warn: typeof logger?.warn === 'function' ? logger.warn.bind(logger) : fallback('warn'),
      error: typeof logger?.error === 'function' ? logger.error.bind(logger) : fallback('error'),
      debug: typeof logger?.debug === 'function' ? logger.debug.bind(logger) : fallback('debug')
    };
  }

  /**
   * Initialize database tables
   */
  initialize() {
    // Game sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS game_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_type TEXT NOT NULL,
        player1_username TEXT NOT NULL,
        player1_role TEXT NOT NULL,
        player2_username TEXT,
        player2_role TEXT,
        status TEXT NOT NULL DEFAULT 'waiting',
        winner TEXT,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ended_at DATETIME,
        game_state TEXT,
        trigger_type TEXT,
        trigger_value TEXT,
        challenger_username TEXT,
        challenger_nickname TEXT,
        gift_image_url TEXT,
        challenge_expires_at DATETIME,
        pgn_history TEXT,
        final_fen TEXT,
        win_reason TEXT
      )
    `);
    
    // Add chess-specific columns if they don't exist (for existing databases)
    const sessionColumns = ['pgn_history', 'final_fen', 'win_reason'];
    for (const column of sessionColumns) {
      try {
        this.db.exec(`
          ALTER TABLE game_sessions 
          ADD COLUMN ${column} TEXT
        `);
      } catch (error) {
        // Column already exists, ignore error
      }
    }


    // Game moves history
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS game_moves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        player_username TEXT NOT NULL,
        move_data TEXT NOT NULL,
        move_number INTEGER NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES game_sessions(id)
      )
    `);

    // Game configurations (per game type)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS game_configs (
        game_type TEXT PRIMARY KEY,
        config TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Game triggers (gifts or commands that start games)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS game_triggers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_type TEXT NOT NULL,
        trigger_type TEXT NOT NULL,
        trigger_value TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(game_type, trigger_type, trigger_value)
      )
    `);

    // XP rewards configuration
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS game_xp_rewards (
        game_type TEXT PRIMARY KEY,
        win_xp INTEGER DEFAULT 100,
        loss_xp INTEGER DEFAULT 25,
        draw_xp INTEGER DEFAULT 50,
        participation_xp INTEGER DEFAULT 10
      )
    `);

    // Player statistics and win streaks
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS game_player_stats (
        username TEXT NOT NULL,
        game_type TEXT NOT NULL,
        total_games INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        draws INTEGER DEFAULT 0,
        current_win_streak INTEGER DEFAULT 0,
        best_win_streak INTEGER DEFAULT 0,
        total_xp_earned INTEGER DEFAULT 0,
        elo_rating INTEGER DEFAULT 1000,
        peak_elo INTEGER DEFAULT 1000,
        last_played DATETIME,
        chess_wins_white INTEGER DEFAULT 0,
        chess_wins_black INTEGER DEFAULT 0,
        chess_losses_white INTEGER DEFAULT 0,
        chess_losses_black INTEGER DEFAULT 0,
        chess_draws_white INTEGER DEFAULT 0,
        chess_draws_black INTEGER DEFAULT 0,
        PRIMARY KEY (username, game_type)
      )
    `);
    
    // Add chess-specific columns if they don't exist (for existing databases)
    const chessColumns = [
      'chess_wins_white',
      'chess_wins_black',
      'chess_losses_white',
      'chess_losses_black',
      'chess_draws_white',
      'chess_draws_black'
    ];
    
    for (const column of chessColumns) {
      try {
        this.db.exec(`
          ALTER TABLE game_player_stats 
          ADD COLUMN ${column} INTEGER DEFAULT 0
        `);
      } catch (error) {
        // Column already exists, ignore error
      }
    }

    // Game media configuration (challenge sounds, event sounds)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS game_media (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_type TEXT NOT NULL,
        media_type TEXT NOT NULL,
        media_event TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_type TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(game_type, media_event)
      )
    `);

    // Round timer configuration
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS game_round_timers (
        game_type TEXT PRIMARY KEY,
        enabled INTEGER DEFAULT 0,
        time_limit_seconds INTEGER DEFAULT 30,
        warning_time_seconds INTEGER DEFAULT 10
      )
    `);

    // Plinko transactions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS game_plinko_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user TEXT NOT NULL,
        bet INTEGER NOT NULL,
        multiplier REAL NOT NULL,
        profit INTEGER NOT NULL,
        slot_index INTEGER NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Plinko test transactions table (for offline testing)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS game_plinko_test_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user TEXT NOT NULL,
        bet INTEGER NOT NULL,
        multiplier REAL NOT NULL,
        profit INTEGER NOT NULL,
        slot_index INTEGER NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Plinko configuration table - migrate to multi-board support
    // Check if the old single-board table exists with CHECK constraint
    try {
      const tableInfo = this.db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='game_plinko_config'`).get();
      if (tableInfo && tableInfo.sql && tableInfo.sql.includes('CHECK')) {
        // Old table with CHECK constraint - need to migrate
        this.logger.info('Migrating game_plinko_config table to multi-board support...');
        
        // Get existing data
        const existingData = this.db.prepare('SELECT * FROM game_plinko_config').all();
        
        // Drop old table
        this.db.exec('DROP TABLE game_plinko_config');
        
        // Create new table without CHECK constraint
        this.db.exec(`
          CREATE TABLE game_plinko_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL DEFAULT 'Standard Plinko',
            slots TEXT NOT NULL,
            physics_settings TEXT NOT NULL,
            gift_mappings TEXT,
            chat_command TEXT,
            enabled INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        // Re-insert data
        if (existingData.length > 0) {
          const insertStmt = this.db.prepare(`
            INSERT INTO game_plinko_config (id, name, slots, physics_settings, gift_mappings, chat_command, enabled, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const row of existingData) {
            insertStmt.run(
              row.id,
              'Standard Plinko',
              row.slots,
              row.physics_settings,
              row.gift_mappings || '{}',
              null,
              1,
              row.updated_at || new Date().toISOString()
            );
          }
        }
        
        this.logger.info('Migration complete - multi-board plinko support enabled');
      }
    } catch (error) {
      // Table doesn't exist yet or migration failed, will be created below
    }
    
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS game_plinko_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL DEFAULT 'Standard Plinko',
        slots TEXT NOT NULL,
        physics_settings TEXT NOT NULL,
        gift_mappings TEXT,
        chat_command TEXT,
        enabled INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Add new columns for multi-board support if they don't exist (for existing databases)
    const plinkoColumns = ['name', 'chat_command', 'enabled', 'created_at'];
    for (const column of plinkoColumns) {
      try {
        if (column === 'name') {
          this.db.exec(`ALTER TABLE game_plinko_config ADD COLUMN name TEXT NOT NULL DEFAULT 'Standard Plinko'`);
        } else if (column === 'chat_command') {
          this.db.exec(`ALTER TABLE game_plinko_config ADD COLUMN chat_command TEXT`);
        } else if (column === 'enabled') {
          this.db.exec(`ALTER TABLE game_plinko_config ADD COLUMN enabled INTEGER DEFAULT 1`);
        } else if (column === 'created_at') {
          this.db.exec(`ALTER TABLE game_plinko_config ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`);
        }
      } catch (error) {
        // Column already exists, ignore error
      }
    }
    
    // Migrate legacy database: ensure legacy single-board entry has proper name
    try {
      // Check if there's a row with id=1 (legacy format)
      const legacyCheck = this.db.prepare('SELECT id FROM game_plinko_config WHERE id = 1').get();
      if (legacyCheck) {
        // Update the legacy row to have a proper name if it has default/empty name
        this.db.prepare(`UPDATE game_plinko_config SET name = 'Standard Plinko' WHERE id = 1 AND (name IS NULL OR name = '')`).run();
      }
    } catch (error) {
      // Ignore errors during migration
    }

    // Initialize default Plinko config if no boards exist
    const plinkoConfigExists = this.db.prepare('SELECT COUNT(*) as count FROM game_plinko_config').get();
    if ((plinkoConfigExists?.count || 0) === 0) {
      const defaultSlots = [
        { multiplier: 0.2, color: '#FF6B6B' },
        { multiplier: 0.5, color: '#FFA500' },
        { multiplier: 1.0, color: '#FFD700' },
        { multiplier: 2.0, color: '#4CAF50' },
        { multiplier: 5.0, color: '#00BCD4' },
        { multiplier: 10.0, color: '#9C27B0' },
        { multiplier: 2.0, color: '#4CAF50' },
        { multiplier: 1.0, color: '#FFD700' },
        { multiplier: 0.5, color: '#FFA500' },
        { multiplier: 0.2, color: '#FF6B6B' },
        { multiplier: 0, color: '#000000' }
      ];
      const defaultPhysics = {
        gravity: 2.5,
        ballRestitution: 0.6,
        pegRestitution: 0.8,
        pegRows: 12,
        pegSpacing: 60,
        testModeEnabled: false,
        maxSimultaneousBalls: 5,
        rateLimitMs: 800
      };
      const defaultGiftMappings = {};
      
      this.db.prepare(`
        INSERT INTO game_plinko_config (name, slots, physics_settings, gift_mappings, chat_command, enabled)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('Standard Plinko', JSON.stringify(defaultSlots), JSON.stringify(defaultPhysics), JSON.stringify(defaultGiftMappings), null, 1);
    }

    // Wheel (Glücksrad) configuration table - supports multiple wheels
    // Check if the table has a CHECK constraint that limits it to single row
    // If so, we need to migrate to the new schema
    try {
      const tableInfo = this.db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='game_wheel_config'`).get();
      if (tableInfo && tableInfo.sql && tableInfo.sql.includes('CHECK')) {
        // Old table with CHECK constraint - need to migrate
        this.logger.info('Migrating game_wheel_config table to multi-wheel support...');
        
        // Get existing data
        const existingData = this.db.prepare('SELECT * FROM game_wheel_config').all();
        
        // Drop old table
        this.db.exec('DROP TABLE game_wheel_config');
        
        // Create new table without CHECK constraint
        this.db.exec(`
          CREATE TABLE game_wheel_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL DEFAULT 'Standard Wheel',
            segments TEXT NOT NULL,
            settings TEXT NOT NULL,
            gift_triggers TEXT,
            chat_command TEXT,
            enabled INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        // Re-insert data
        if (existingData.length > 0) {
          const insertStmt = this.db.prepare(`
            INSERT INTO game_wheel_config (id, name, segments, settings, gift_triggers, chat_command, enabled, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const row of existingData) {
            insertStmt.run(
              row.id,
              row.name || 'Standard Wheel',
              row.segments,
              row.settings,
              row.gift_triggers || '{}',
              row.chat_command || null,
              row.enabled !== undefined ? row.enabled : 1,
              row.updated_at || new Date().toISOString()
            );
          }
        }
        
        this.logger.info('Migration complete - multi-wheel support enabled');
      }
    } catch (error) {
      // Table doesn't exist yet or migration failed, will be created below
    }
    
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS game_wheel_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL DEFAULT 'Standard Wheel',
        segments TEXT NOT NULL,
        settings TEXT NOT NULL,
        gift_triggers TEXT,
        chat_command TEXT,
        enabled INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Add new columns for multi-wheel support if they don't exist (for existing databases)
    const wheelColumns = ['name', 'chat_command', 'enabled', 'created_at'];
    for (const column of wheelColumns) {
      try {
        if (column === 'name') {
          this.db.exec(`ALTER TABLE game_wheel_config ADD COLUMN name TEXT NOT NULL DEFAULT 'Standard Wheel'`);
        } else if (column === 'chat_command') {
          this.db.exec(`ALTER TABLE game_wheel_config ADD COLUMN chat_command TEXT`);
        } else if (column === 'enabled') {
          this.db.exec(`ALTER TABLE game_wheel_config ADD COLUMN enabled INTEGER DEFAULT 1`);
        } else if (column === 'created_at') {
          this.db.exec(`ALTER TABLE game_wheel_config ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`);
        }
      } catch (error) {
        // Column already exists, ignore error
      }
    }
    
    // Migrate legacy database: ensure legacy single-wheel entry has proper name
    try {
      // Check if there's a row with id=1 (legacy format)
      const legacyCheck = this.db.prepare('SELECT id FROM game_wheel_config WHERE id = 1').get();
      if (legacyCheck) {
        // Update the legacy row to have a proper name if it has default/empty name
        this.db.prepare(`UPDATE game_wheel_config SET name = 'Standard Wheel' WHERE id = 1 AND (name IS NULL OR name = '')`).run();
      }
    } catch (error) {
      // Ignore errors during migration
    }

    // Wheel win history table - now tracks which wheel was used
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS game_wheel_wins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wheel_id INTEGER DEFAULT 1,
        username TEXT NOT NULL,
        nickname TEXT,
        prize_text TEXT NOT NULL,
        segment_index INTEGER NOT NULL,
        gift_name TEXT,
        paid_out INTEGER DEFAULT 0,
        paid_out_at DATETIME,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Add wheel_id column if it doesn't exist (for existing databases)
    try {
      this.db.exec(`ALTER TABLE game_wheel_wins ADD COLUMN wheel_id INTEGER DEFAULT 1`);
    } catch (error) {
      // Column already exists, ignore error
    }

    // Initialize default Wheel config if no wheels exist
    const wheelConfigExists = this.db.prepare('SELECT COUNT(*) as count FROM game_wheel_config').get();
    if ((wheelConfigExists?.count || 0) === 0) {
      const defaultSegments = [
        { text: '100 XP', color: '#FF6B6B', weight: 10, isNiete: false, isShock: false, shockIntensity: 0, shockDuration: 0, shockType: 'shock', shockDevices: [] },
        { text: '200 XP', color: '#FFA500', weight: 8, isNiete: false, isShock: false, shockIntensity: 0, shockDuration: 0, shockType: 'shock', shockDevices: [] },
        { text: '500 XP', color: '#FFD700', weight: 5, isNiete: false, isShock: false, shockIntensity: 0, shockDuration: 0, shockType: 'shock', shockDevices: [] },
        { text: 'Shoutout!', color: '#4CAF50', weight: 4, isNiete: false, isShock: false, shockIntensity: 0, shockDuration: 0, shockType: 'shock', shockDevices: [] },
        { text: '1000 XP', color: '#00BCD4', weight: 3, isNiete: false, isShock: false, shockIntensity: 0, shockDuration: 0, shockType: 'shock', shockDevices: [] },
        { text: 'VIP Status', color: '#9C27B0', weight: 2, isNiete: false, isShock: false, shockIntensity: 0, shockDuration: 0, shockType: 'shock', shockDevices: [] },
        { text: 'JACKPOT!', color: '#E91E63', weight: 1, isNiete: false, isShock: false, shockIntensity: 0, shockDuration: 0, shockType: 'shock', shockDevices: [] },
        { text: 'Niete', color: '#607D8B', weight: 15, isNiete: true, isShock: false, shockIntensity: 0, shockDuration: 0, shockType: 'shock', shockDevices: [] }
      ];
      const defaultSettings = {
        spinDuration: 5000,
        soundEnabled: true,
        soundVolume: 0.7,
        showQueue: true,
        winnerDisplayDuration: 5,
        // Niete (no win) settings
        nieteText: 'Leider kein Gewinn!',
        // Info screen settings
        infoScreenEnabled: false,
        infoScreenText: 'Um deinen Gewinn abzuholen, besuche discord.gg/deinserver',
        infoScreenDuration: 5,
        // Idle message settings
        idleMessageEnabled: true,
        idleMessageTitle: '🎡 Warte auf Spieler...',
        idleMessageSubtitle: 'Sende ein Geschenk, um das Glücksrad zu drehen!'
      };
      const defaultGiftTriggers = {};
      
      this.db.prepare(`
        INSERT INTO game_wheel_config (name, segments, settings, gift_triggers, chat_command, enabled)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('Standard Wheel', JSON.stringify(defaultSegments), JSON.stringify(defaultSettings), JSON.stringify(defaultGiftTriggers), null, 1);
    }

    // Game overlay settings table (unified vs legacy overlay mode per game)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS game_overlay_settings (
        game_type TEXT PRIMARY KEY,
        use_unified_overlay INTEGER DEFAULT 1,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Initialize default overlay settings for all game types
    this.initializeOverlaySettings();

    // Initialize slot machine tables
    this.initSlotTables();

    this.logger.info('✅ Game Engine database tables initialized');
  }
  
  /**
   * Initialize overlay settings with defaults for all game types
   */
  initializeOverlaySettings() {
    const games = ['connect4', 'chess', 'plinko', 'wheel', 'slot', 'arena'];
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO game_overlay_settings (game_type, use_unified_overlay)
      VALUES (?, ?)
    `);
    
    games.forEach(game => {
      stmt.run(game, game === 'arena' ? 0 : 1);
    });
  }
  
  /**
   * Get overlay settings for all games
   * @returns {Object} Object with game types as keys and boolean values
   */
  getOverlaySettings() {
    const rows = this.db.prepare(`
      SELECT game_type, use_unified_overlay 
      FROM game_overlay_settings
    `).all();
    
    return rows.reduce((acc, row) => {
      acc[row.game_type] = Boolean(row.use_unified_overlay);
      return acc;
    }, {});
  }
  
  /**
   * Set overlay setting for a specific game type
   * @param {string} gameType - Game type (connect4, chess, plinko, wheel, slot, arena)
   * @param {boolean} useUnified - Whether to use unified overlay
   */
  setOverlaySetting(gameType, useUnified) {
    this.db.prepare(`
      INSERT INTO game_overlay_settings (game_type, use_unified_overlay, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(game_type) DO UPDATE SET
        use_unified_overlay = excluded.use_unified_overlay,
        updated_at = CURRENT_TIMESTAMP
    `).run(gameType, useUnified ? 1 : 0);
  }

  /**
   * Create a new game session
   */
  createSession(gameType, player1Username, player1Role, triggerType, triggerValue) {
    const stmt = this.db.prepare(`
      INSERT INTO game_sessions (game_type, player1_username, player1_role, status, trigger_type, trigger_value)
      VALUES (?, ?, ?, 'waiting', ?, ?)
    `);
    
    const result = stmt.run(gameType, player1Username, player1Role, triggerType, triggerValue);
    return result.lastInsertRowid;
  }

  /**
   * Get game session by ID
   */
  getSession(sessionId) {
    const stmt = this.db.prepare('SELECT * FROM game_sessions WHERE id = ?');
    return stmt.get(sessionId);
  }

  /**
   * Get active game session for a player
   */
  getActiveSessionForPlayer(username) {
    const stmt = this.db.prepare(`
      SELECT * FROM game_sessions 
      WHERE (player1_username = ? OR player2_username = ?) 
        AND status IN ('waiting', 'active')
      ORDER BY started_at DESC
      LIMIT 1
    `);
    return stmt.get(username, username);
  }

  /**
   * Update game session
   */
  updateSession(sessionId, updates) {
    const fields = [];
    const values = [];
    
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
    
    values.push(sessionId);
    
    const stmt = this.db.prepare(`
      UPDATE game_sessions 
      SET ${fields.join(', ')}
      WHERE id = ?
    `);
    
    stmt.run(...values);
  }

  /**
   * Add player 2 to session
   */
  addPlayer2(sessionId, player2Username, player2Role) {
    this.updateSession(sessionId, {
      player2_username: player2Username,
      player2_role: player2Role,
      status: 'active'
    });
  }

  /**
   * Save game move
   */
  saveMove(sessionId, playerUsername, moveData, moveNumber) {
    const stmt = this.db.prepare(`
      INSERT INTO game_moves (session_id, player_username, move_data, move_number)
      VALUES (?, ?, ?, ?)
    `);
    
    stmt.run(sessionId, playerUsername, JSON.stringify(moveData), moveNumber);
  }

  /**
   * Get game moves for a session
   */
  getMoves(sessionId) {
    const stmt = this.db.prepare(`
      SELECT * FROM game_moves 
      WHERE session_id = ?
      ORDER BY move_number ASC
    `);
    
    const moves = stmt.all(sessionId);
    return moves.map(move => ({
      ...move,
      move_data: JSON.parse(move.move_data)
    }));
  }

  /**
   * End game session
   */
  endSession(sessionId, winner, gameState) {
    this.updateSession(sessionId, {
      status: 'completed',
      winner: winner,
      ended_at: new Date().toISOString(),
      game_state: JSON.stringify(gameState)
    });
  }

  /**
   * Get game configuration
   */
  getGameConfig(gameType) {
    const stmt = this.db.prepare('SELECT config FROM game_configs WHERE game_type = ?');
    const row = stmt.get(gameType);
    
    if (row) {
      return JSON.parse(row.config);
    }
    
    return null;
  }

  /**
   * Save game configuration
   */
  saveGameConfig(gameType, config) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO game_configs (game_type, config, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `);
    
    stmt.run(gameType, JSON.stringify(config));
  }

  /**
   * Get game triggers
   */
  getTriggers(gameType = null) {
    if (gameType) {
      const stmt = this.db.prepare('SELECT * FROM game_triggers WHERE game_type = ? AND enabled = 1');
      return stmt.all(gameType);
    } else {
      const stmt = this.db.prepare('SELECT * FROM game_triggers WHERE enabled = 1');
      return stmt.all();
    }
  }

  /**
   * Add game trigger
   */
  addTrigger(gameType, triggerType, triggerValue) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO game_triggers (game_type, trigger_type, trigger_value)
      VALUES (?, ?, ?)
    `);
    
    stmt.run(gameType, triggerType, triggerValue);
  }

  /**
   * Remove game trigger
   */
  removeTrigger(triggerId) {
    const stmt = this.db.prepare('DELETE FROM game_triggers WHERE id = ?');
    stmt.run(triggerId);
  }

  /**
   * Get XP rewards for a game type
   */
  getXPRewards(gameType) {
    const stmt = this.db.prepare('SELECT * FROM game_xp_rewards WHERE game_type = ?');
    const row = stmt.get(gameType);
    
    if (row) {
      return row;
    }
    
    // Return defaults if not configured
    return {
      game_type: gameType,
      win_xp: 100,
      loss_xp: 25,
      draw_xp: 50,
      participation_xp: 10
    };
  }

  /**
   * Save XP rewards configuration
   */
  saveXPRewards(gameType, winXP, lossXP, drawXP, participationXP) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO game_xp_rewards (game_type, win_xp, loss_xp, draw_xp, participation_xp)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    stmt.run(gameType, winXP, lossXP, drawXP, participationXP);
  }

  /**
   * Get game statistics
   */
  getGameStats(gameType = null) {
    let query = `
      SELECT 
        game_type,
        COUNT(*) as total_games,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_games,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_games
      FROM game_sessions
    `;
    
    if (gameType) {
      query += ' WHERE game_type = ?';
      const stmt = this.db.prepare(query + ' GROUP BY game_type');
      return stmt.get(gameType);
    } else {
      query += ' GROUP BY game_type';
      const stmt = this.db.prepare(query);
      return stmt.all();
    }
  }

  /**
   * Get player statistics
   */
  getPlayerStats(username) {
    const stmt = this.db.prepare(`
      SELECT 
        game_type,
        COUNT(*) as total_games,
        SUM(CASE WHEN winner = ? THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN status = 'completed' AND winner != ? AND winner IS NOT NULL THEN 1 ELSE 0 END) as losses,
        SUM(CASE WHEN status = 'completed' AND winner IS NULL THEN 1 ELSE 0 END) as draws
      FROM game_sessions
      WHERE (player1_username = ? OR player2_username = ?)
        AND status = 'completed'
      GROUP BY game_type
    `);
    
    return stmt.all(username, username, username, username);
  }

  /**
   * Update player statistics after game
   */
  updatePlayerStats(username, gameType, isWin, isLoss, isDraw, xpEarned) {
    // Get or create player stats
    let stats = this.db.prepare(`
      SELECT * FROM game_player_stats WHERE username = ? AND game_type = ?
    `).get(username, gameType);

    if (!stats) {
      // Create new stats entry
      this.db.prepare(`
        INSERT INTO game_player_stats 
        (username, game_type, total_games, wins, losses, draws, current_win_streak, best_win_streak, total_xp_earned, last_played)
        VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, CURRENT_TIMESTAMP)
      `).run(username, gameType);
      
      stats = { total_games: 0, wins: 0, losses: 0, draws: 0, current_win_streak: 0, best_win_streak: 0, total_xp_earned: 0 };
    }

    // Update counters
    const newTotalGames = stats.total_games + 1;
    const newWins = stats.wins + (isWin ? 1 : 0);
    const newLosses = stats.losses + (isLoss ? 1 : 0);
    const newDraws = stats.draws + (isDraw ? 1 : 0);
    
    // Update win streak
    let newWinStreak = stats.current_win_streak;
    if (isWin) {
      newWinStreak = stats.current_win_streak + 1;
    } else if (isLoss) {
      newWinStreak = 0;
    }
    
    const newBestStreak = Math.max(stats.best_win_streak, newWinStreak);
    const newTotalXP = stats.total_xp_earned + xpEarned;

    // Update database
    this.db.prepare(`
      UPDATE game_player_stats
      SET total_games = ?,
          wins = ?,
          losses = ?,
          draws = ?,
          current_win_streak = ?,
          best_win_streak = ?,
          total_xp_earned = ?,
          last_played = CURRENT_TIMESTAMP
      WHERE username = ? AND game_type = ?
    `).run(newTotalGames, newWins, newLosses, newDraws, newWinStreak, newBestStreak, newTotalXP, username, gameType);

    // Check if this is a new personal record
    const isNewRecord = (newWinStreak === newBestStreak) && (newWinStreak > stats.best_win_streak);

    return { newWinStreak, newBestStreak, isNewRecord };
  }

  /**
   * Get detailed player stats including streaks
   */
  getDetailedPlayerStats(username, gameType) {
    if (gameType) {
      return this.db.prepare(`
        SELECT * FROM game_player_stats WHERE username = ? AND game_type = ?
      `).get(username, gameType);
    } else {
      return this.db.prepare(`
        SELECT * FROM game_player_stats WHERE username = ?
      `).all(username);
    }
  }

  /**
   * Get leaderboard by win streaks
   */
  getStreakLeaderboard(gameType, limit = 10) {
    const query = gameType 
      ? `SELECT * FROM game_player_stats WHERE game_type = ? ORDER BY best_win_streak DESC, wins DESC LIMIT ?`
      : `SELECT * FROM game_player_stats ORDER BY best_win_streak DESC, wins DESC LIMIT ?`;
    
    const stmt = this.db.prepare(query);
    return gameType ? stmt.all(gameType, limit) : stmt.all(limit);
  }

  /**
   * Get daily leaderboard (games played today)
   */
  getDailyLeaderboard(gameType, limit = 10) {
    const today = new Date().toISOString().split('T')[0];
    
    // We need to get all players from both player1 and player2
    const query = `
      WITH player_games AS (
        SELECT 
          player1_username as username,
          game_type,
          CASE WHEN winner = player1_username THEN 1 ELSE 0 END as is_win
        FROM game_sessions
        WHERE DATE(started_at) = ?
          ${gameType ? 'AND game_type = ?' : ''}
          AND status = 'completed'
          AND player1_username != 'streamer'
        UNION ALL
        SELECT 
          player2_username as username,
          game_type,
          CASE WHEN winner = player2_username THEN 1 ELSE 0 END as is_win
        FROM game_sessions
        WHERE DATE(started_at) = ?
          ${gameType ? 'AND game_type = ?' : ''}
          AND status = 'completed'
          AND player2_username != 'streamer'
      )
      SELECT 
        username,
        game_type,
        COUNT(*) as games_today,
        SUM(is_win) as wins_today
      FROM player_games
      GROUP BY username, game_type
      ORDER BY wins_today DESC, games_today DESC
      LIMIT ?
    `;
    
    const stmt = this.db.prepare(query);
    if (gameType) {
      return stmt.all(today, gameType, today, gameType, limit);
    } else {
      return stmt.all(today, today, limit);
    }
  }

  /**
   * Get season leaderboard (this month)
   */
  getSeasonLeaderboard(gameType, limit = 10) {
    const thisMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
    
    const query = `
      WITH player_games AS (
        SELECT 
          player1_username as username,
          game_type,
          CASE WHEN winner = player1_username THEN 1 ELSE 0 END as is_win
        FROM game_sessions
        WHERE strftime('%Y-%m', started_at) = ?
          ${gameType ? 'AND game_type = ?' : ''}
          AND status = 'completed'
          AND player1_username != 'streamer'
        UNION ALL
        SELECT 
          player2_username as username,
          game_type,
          CASE WHEN winner = player2_username THEN 1 ELSE 0 END as is_win
        FROM game_sessions
        WHERE strftime('%Y-%m', started_at) = ?
          ${gameType ? 'AND game_type = ?' : ''}
          AND status = 'completed'
          AND player2_username != 'streamer'
      )
      SELECT 
        username,
        game_type,
        COUNT(*) as games_season,
        SUM(is_win) as wins_season
      FROM player_games
      GROUP BY username, game_type
      ORDER BY wins_season DESC, games_season DESC
      LIMIT ?
    `;
    
    const stmt = this.db.prepare(query);
    if (gameType) {
      return stmt.all(thisMonth, gameType, thisMonth, gameType, limit);
    } else {
      return stmt.all(thisMonth, thisMonth, limit);
    }
  }

  /**
   * Get lifetime leaderboard (all time)
   */
  getLifetimeLeaderboard(gameType, limit = 10) {
    const query = gameType
      ? `SELECT * FROM game_player_stats WHERE game_type = ? ORDER BY wins DESC, total_games DESC LIMIT ?`
      : `SELECT * FROM game_player_stats ORDER BY wins DESC, total_games DESC LIMIT ?`;
    
    const stmt = this.db.prepare(query);
    return gameType ? stmt.all(gameType, limit) : stmt.all(limit);
  }

  /**
   * Get ELO leaderboard
   */
  getELOLeaderboard(gameType, limit = 10) {
    const query = gameType
      ? `SELECT * FROM game_player_stats WHERE game_type = ? ORDER BY elo_rating DESC, total_games DESC LIMIT ?`
      : `SELECT * FROM game_player_stats ORDER BY elo_rating DESC, total_games DESC LIMIT ?`;
    
    const stmt = this.db.prepare(query);
    return gameType ? stmt.all(gameType, limit) : stmt.all(limit);
  }

  /**
   * Calculate ELO change based on game result
   * @param {number} playerELO - Player's current ELO
   * @param {number} opponentELO - Opponent's current ELO
   * @param {number} score - Actual score (1 = win, 0.5 = draw, 0 = loss)
   * @param {number} kFactor - K-factor (default 32 for new players, 16 for experienced)
   */
  calculateELOChange(playerELO, opponentELO, score, kFactor = 32) {
    // Expected score formula
    const expectedScore = 1 / (1 + Math.pow(10, (opponentELO - playerELO) / 400));
    
    // ELO change
    const eloChange = Math.round(kFactor * (score - expectedScore));
    
    return eloChange;
  }

  /**
   * Update player ELO after game
   */
  updatePlayerELO(username, gameType, eloChange) {
    const stats = this.db.prepare(`
      SELECT elo_rating, peak_elo FROM game_player_stats WHERE username = ? AND game_type = ?
    `).get(username, gameType);

    if (!stats) {
      // Create stats with default ELO
      this.db.prepare(`
        INSERT INTO game_player_stats 
        (username, game_type, elo_rating, peak_elo)
        VALUES (?, ?, 1000, 1000)
      `).run(username, gameType);
      return { oldELO: 1000, newELO: 1000 + eloChange, change: eloChange };
    }

    const newELO = Math.max(0, stats.elo_rating + eloChange); // ELO can't go below 0
    const newPeakELO = Math.max(stats.peak_elo, newELO);

    this.db.prepare(`
      UPDATE game_player_stats
      SET elo_rating = ?,
          peak_elo = ?
      WHERE username = ? AND game_type = ?
    `).run(newELO, newPeakELO, username, gameType);

    return {
      oldELO: stats.elo_rating,
      newELO: newELO,
      change: eloChange,
      isPeakELO: newELO === newPeakELO && newELO > stats.peak_elo
    };
  }

  /**
   * Get or create player ELO
   */
  getPlayerELO(username, gameType) {
    let stats = this.db.prepare(`
      SELECT elo_rating FROM game_player_stats WHERE username = ? AND game_type = ?
    `).get(username, gameType);

    if (!stats) {
      // Create with default ELO
      this.db.prepare(`
        INSERT INTO game_player_stats 
        (username, game_type, elo_rating, peak_elo)
        VALUES (?, ?, 1000, 1000)
      `).run(username, gameType);
      return 1000;
    }

    return stats.elo_rating;
  }

  /**
   * Get media configuration for game events
   */
  getGameMedia(gameType, mediaEvent = null) {
    if (mediaEvent) {
      const stmt = this.db.prepare(`
        SELECT * FROM game_media 
        WHERE game_type = ? AND media_event = ? AND enabled = 1
      `);
      return stmt.get(gameType, mediaEvent);
    } else {
      const stmt = this.db.prepare(`
        SELECT * FROM game_media 
        WHERE game_type = ? AND enabled = 1
      `);
      return stmt.all(gameType);
    }
  }

  /**
   * Save or update game media
   */
  saveGameMedia(gameType, mediaEvent, filePath, fileType) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO game_media 
      (game_type, media_type, media_event, file_path, file_type, enabled)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    
    const mediaType = fileType.startsWith('audio/') ? 'audio' : 'video';
    stmt.run(gameType, mediaType, mediaEvent, filePath, fileType);
  }

  /**
   * Remove game media
   */
  removeGameMedia(gameType, mediaEvent) {
    const stmt = this.db.prepare(`
      DELETE FROM game_media WHERE game_type = ? AND media_event = ?
    `);
    stmt.run(gameType, mediaEvent);
  }

  /**
   * Get round timer configuration
   */
  getRoundTimer(gameType) {
    const stmt = this.db.prepare(`
      SELECT * FROM game_round_timers WHERE game_type = ?
    `);
    const result = stmt.get(gameType);
    
    if (!result) {
      return {
        enabled: false,
        time_limit_seconds: 30,
        warning_time_seconds: 10
      };
    }
    
    return result;
  }

  /**
   * Save round timer configuration
   */
  saveRoundTimer(gameType, enabled, timeLimitSeconds, warningTimeSeconds) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO game_round_timers 
      (game_type, enabled, time_limit_seconds, warning_time_seconds)
      VALUES (?, ?, ?, ?)
    `);
    
    stmt.run(gameType, enabled ? 1 : 0, timeLimitSeconds, warningTimeSeconds);
  }

  /**
   * Update chess-specific player statistics
   */
  updateChessPlayerStats(username, gameType, isWin, isLoss, isDraw, playerSide, xpEarned) {
    // First update general stats
    const streakResult = this.updatePlayerStats(username, gameType, isWin, isLoss, isDraw, xpEarned);
    
    // Then update chess-specific columns
    if (gameType === 'chess') {
      let updateField = '';
      if (isWin) {
        updateField = playerSide === 'white' ? 'chess_wins_white' : 'chess_wins_black';
      } else if (isLoss) {
        updateField = playerSide === 'white' ? 'chess_losses_white' : 'chess_losses_black';
      } else if (isDraw) {
        updateField = playerSide === 'white' ? 'chess_draws_white' : 'chess_draws_black';
      }
      
      if (updateField) {
        this.db.prepare(`
          UPDATE game_player_stats
          SET ${updateField} = ${updateField} + 1
          WHERE username = ? AND game_type = ?
        `).run(username, gameType);
      }
    }
    
    return streakResult;
  }

  /**
   * Update ELO rating for a player
   */
  updateELO(username, gameType, newELO) {
    const stmt = this.db.prepare(`
      UPDATE game_player_stats
      SET elo_rating = ?,
          peak_elo = CASE WHEN ? > peak_elo THEN ? ELSE peak_elo END
      WHERE username = ? AND game_type = ?
    `);
    
    stmt.run(newELO, newELO, newELO, username, gameType);
  }

  /**
   * Get all plinko boards
   * @returns {Array} List of all plinko board configurations
   */
  getAllPlinkoBoards() {
    const boards = this.db.prepare('SELECT * FROM game_plinko_config ORDER BY id ASC').all();
    return boards.map(board => ({
      id: board.id,
      name: board.name || 'Unnamed Plinko',
      slots: JSON.parse(board.slots),
      physicsSettings: JSON.parse(board.physics_settings),
      giftMappings: board.gift_mappings ? JSON.parse(board.gift_mappings) : {},
      chatCommand: board.chat_command || null,
      enabled: board.enabled === 1,
      createdAt: board.created_at,
      updatedAt: board.updated_at
    }));
  }

  /**
   * Get Plinko configuration by ID (or first board if no ID provided for backward compatibility)
   * @param {number} boardId - Plinko board ID (optional, defaults to first board)
   */
  getPlinkoConfig(boardId = null) {
    let config;
    if (boardId !== null) {
      config = this.db.prepare('SELECT * FROM game_plinko_config WHERE id = ?').get(boardId);
    } else {
      // Backward compatibility: get first board
      config = this.db.prepare('SELECT * FROM game_plinko_config ORDER BY id ASC LIMIT 1').get();
    }
    if (!config) return null;
    
    return {
      id: config.id,
      name: config.name || 'Unnamed Plinko',
      slots: JSON.parse(config.slots),
      physicsSettings: JSON.parse(config.physics_settings),
      giftMappings: config.gift_mappings ? JSON.parse(config.gift_mappings) : {},
      chatCommand: config.chat_command || null,
      enabled: config.enabled === 1
    };
  }

  /**
   * Create a new plinko board
   * @param {string} name - Name of the board
   * @param {Array} slots - Plinko slots
   * @param {Object} physicsSettings - Physics settings
   * @param {Object} giftMappings - Gift mappings for this board
   * @param {string} chatCommand - Chat command to trigger this board (optional)
   * @returns {number} New board ID
   */
  createPlinkoBoard(name, slots, physicsSettings, giftMappings = {}, chatCommand = null) {
    const result = this.db.prepare(`
      INSERT INTO game_plinko_config (name, slots, physics_settings, gift_mappings, chat_command, enabled)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(name, JSON.stringify(slots), JSON.stringify(physicsSettings), JSON.stringify(giftMappings), chatCommand);
    
    return result.lastInsertRowid;
  }

  /**
   * Update Plinko configuration
   * @param {number} boardId - Plinko board ID
   * @param {Array} slots - Plinko slots
   * @param {Object} physicsSettings - Physics settings
   * @param {Object} giftMappings - Gift mappings (optional)
   */
  updatePlinkoConfig(boardId, slots, physicsSettings, giftMappings = null) {
    const existingConfig = this.getPlinkoConfig(boardId);
    const newGiftMappings = giftMappings !== null ? giftMappings : (existingConfig?.giftMappings || {});
    
    this.db.prepare(`
      UPDATE game_plinko_config 
      SET slots = ?, 
          physics_settings = ?, 
          gift_mappings = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(JSON.stringify(slots), JSON.stringify(physicsSettings), JSON.stringify(newGiftMappings), boardId);
  }

  /**
   * Update plinko board name
   */
  updatePlinkoName(boardId, name) {
    this.db.prepare(`UPDATE game_plinko_config SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(name, boardId);
  }

  /**
   * Update plinko board chat command
   */
  updatePlinkoChatCommand(boardId, chatCommand) {
    this.db.prepare(`UPDATE game_plinko_config SET chat_command = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(chatCommand, boardId);
  }

  /**
   * Update plinko board enabled status
   */
  updatePlinkoEnabled(boardId, enabled) {
    this.db.prepare(`UPDATE game_plinko_config SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(enabled ? 1 : 0, boardId);
  }

  /**
   * Update plinko gift mappings
   */
  updatePlinkoGiftMappings(boardId, giftMappings) {
    this.db.prepare(`
      UPDATE game_plinko_config 
      SET gift_mappings = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(JSON.stringify(giftMappings || {}), boardId);
  }

  /**
   * Delete a plinko board
   */
  deletePlinkoBoard(boardId) {
    // Prevent deletion if it's the only board
    const boardCount = this.db.prepare('SELECT COUNT(*) as count FROM game_plinko_config').get();
    if (boardCount.count <= 1) {
      return false;
    }
    
    this.db.prepare('DELETE FROM game_plinko_config WHERE id = ?').run(boardId);
    return true;
  }

  /**
   * Find plinko board by gift trigger
   * @param {string} giftIdentifier - Gift name or ID
   * @returns {Object|null} Board config if found
   */
  findPlinkoBoardByGiftTrigger(giftIdentifier) {
    const boards = this.getAllPlinkoBoards();
    const lowerIdentifier = String(giftIdentifier || '').toLowerCase().trim();
    
    for (const board of boards) {
      if (!board.enabled) continue;
      if (!board.giftMappings) continue;
      
      // Exact match by key (gift ID string or gift name)
      if (board.giftMappings[giftIdentifier] || board.giftMappings[String(giftIdentifier)]) {
        return board;
      }
      
      // Case-insensitive fallback (for manually-entered gift names)
      if (lowerIdentifier) {
        for (const key of Object.keys(board.giftMappings)) {
          if (key.toLowerCase() === lowerIdentifier) {
            return board;
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Find plinko board by chat command
   * @param {string} command - Chat command
   * @returns {Object|null} Board config if found
   */
  findPlinkoBoardByChatCommand(command) {
    const boards = this.getAllPlinkoBoards();
    const normalizedCommand = command.toLowerCase().trim();
    
    for (const board of boards) {
      if (!board.enabled) continue;
      if (!board.chatCommand) continue;
      
      if (board.chatCommand.toLowerCase().trim() === normalizedCommand) {
        return board;
      }
    }
    
    return null;
  }

  /**
   * Record Plinko transaction
   */
  recordPlinkoTransaction(user, bet, multiplier, profit, slotIndex) {
    this.db.prepare(`
      INSERT INTO game_plinko_transactions (user, bet, multiplier, profit, slot_index)
      VALUES (?, ?, ?, ?, ?)
    `).run(user, bet, multiplier, profit, slotIndex);
  }

  /**
   * Get Plinko statistics
   */
  getPlinkoStats() {
    const stats = this.db.prepare(`
      SELECT 
        COUNT(*) as total_games,
        SUM(bet) as total_bet,
        SUM(bet * multiplier) as total_payout,
        SUM(profit) as total_profit,
        AVG(multiplier) as avg_multiplier,
        MAX(profit) as max_win,
        MIN(profit) as max_loss
      FROM game_plinko_transactions
    `).get();

    if (!stats || stats.total_games === 0) {
      return {
        totalGames: 0,
        totalBet: 0,
        totalPayout: 0,
        rtp: 0,
        avgMultiplier: 0,
        maxWin: 0,
        maxLoss: 0
      };
    }

    const rtp = stats.total_bet > 0 ? ((stats.total_payout / stats.total_bet) * 100).toFixed(2) : 0;

    return {
      totalGames: stats.total_games,
      totalBet: stats.total_bet,
      totalPayout: stats.total_payout,
      rtp: parseFloat(rtp),
      avgMultiplier: stats.avg_multiplier ? parseFloat(stats.avg_multiplier.toFixed(2)) : 0,
      maxWin: stats.max_win || 0,
      maxLoss: stats.max_loss || 0
    };
  }

  /**
   * Get Plinko user statistics
   */
  getPlinkUserStats(username, limit = 10) {
    return this.db.prepare(`
      SELECT * FROM game_plinko_transactions 
      WHERE user = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `).all(username, limit);
  }

  /**
   * Get Plinko leaderboard (top players by total profit)
   * @param {number} limit - Number of top players to return (default: 10)
   * @returns {Array} Array of {user, totalProfit, totalGames, totalBet, totalWinnings, avgMultiplier}
   */
  getPlinkoLeaderboard(limit = 10) {
    return this.db.prepare(`
      SELECT 
        user,
        SUM(profit) as totalProfit,
        COUNT(*) as totalGames,
        SUM(bet) as totalBet,
        SUM(bet * multiplier) as totalWinnings,
        AVG(multiplier) as avgMultiplier
      FROM game_plinko_transactions
      GROUP BY user
      ORDER BY totalProfit DESC
      LIMIT ?
    `).all(limit);
  }

  // ========================================
  // PLINKO TEST MODE DATABASE METHODS
  // Separate tracking for offline testing
  // ========================================

  /**
   * Record a test Plinko transaction
   */
  recordPlinkoTestTransaction(user, bet, multiplier, profit, slotIndex) {
    this.db.prepare(`
      INSERT INTO game_plinko_test_transactions (user, bet, multiplier, profit, slot_index)
      VALUES (?, ?, ?, ?, ?)
    `).run(user, bet, multiplier, profit, slotIndex);
  }

  /**
   * Get Plinko test statistics
   */
  getPlinkoTestStats() {
    const stats = this.db.prepare(`
      SELECT 
        COUNT(*) as total_games,
        SUM(bet) as total_bet,
        SUM(bet * multiplier) as total_payout,
        SUM(profit) as total_profit,
        AVG(multiplier) as avg_multiplier,
        MAX(profit) as max_win,
        MIN(profit) as max_loss
      FROM game_plinko_test_transactions
    `).get();

    if (!stats || stats.total_games === 0) {
      return {
        totalGames: 0,
        totalBet: 0,
        totalPayout: 0,
        rtp: 0,
        avgMultiplier: 0,
        maxWin: 0,
        maxLoss: 0
      };
    }

    const rtp = stats.total_bet > 0 ? ((stats.total_payout / stats.total_bet) * 100).toFixed(2) : 0;

    return {
      totalGames: stats.total_games,
      totalBet: stats.total_bet,
      totalPayout: stats.total_payout,
      rtp: parseFloat(rtp),
      avgMultiplier: stats.avg_multiplier ? parseFloat(stats.avg_multiplier.toFixed(2)) : 0,
      maxWin: stats.max_win || 0,
      maxLoss: stats.max_loss || 0
    };
  }

  /**
   * Get Plinko test history
   * @param {number} limit - Number of recent test transactions to return (default: 50)
   */
  getPlinkoTestHistory(limit = 50) {
    return this.db.prepare(`
      SELECT * FROM game_plinko_test_transactions 
      ORDER BY timestamp DESC 
      LIMIT ?
    `).all(limit);
  }

  /**
   * Clear all Plinko test transactions
   * @returns {number} Number of deleted rows
   */
  clearPlinkoTestHistory() {
    const result = this.db.prepare('DELETE FROM game_plinko_test_transactions').run();
    return result.changes;
  }

  // ========================================
  // WHEEL (GLÜCKSRAD) DATABASE METHODS
  // Supports multiple wheels with individual triggers
  // ========================================

  /**
   * Get all wheels
   * @returns {Array} List of all wheel configurations
   */
  getAllWheels() {
    const wheels = this.db.prepare('SELECT * FROM game_wheel_config ORDER BY id ASC').all();
    return wheels.map(wheel => ({
      id: wheel.id,
      name: wheel.name || 'Unnamed Wheel',
      segments: JSON.parse(wheel.segments),
      settings: JSON.parse(wheel.settings),
      giftTriggers: wheel.gift_triggers ? JSON.parse(wheel.gift_triggers) : {},
      chatCommand: wheel.chat_command || null,
      enabled: wheel.enabled === 1,
      createdAt: wheel.created_at,
      updatedAt: wheel.updated_at
    }));
  }

  /**
   * Get Wheel configuration by ID (or first wheel if no ID provided for backward compatibility)
   * @param {number} wheelId - Wheel ID (optional, defaults to first wheel)
   */
  getWheelConfig(wheelId = null) {
    let config;
    if (wheelId !== null) {
      config = this.db.prepare('SELECT * FROM game_wheel_config WHERE id = ?').get(wheelId);
    } else {
      // Backward compatibility: get first wheel
      config = this.db.prepare('SELECT * FROM game_wheel_config ORDER BY id ASC LIMIT 1').get();
    }
    if (!config) return null;

    const settings = JSON.parse(config.settings);
    // Backward-compatible: fill missing displayTexts with defaults
    const wheelDisplayDefaults = {
      titleText: '🎡 GLÜCKSRAD', labelSpin: '🔄 Dreht sich...', labelResult: '🎉 Ergebnis:',
      labelNiete: '💔 Niete!', labelWin: '🎊 Gewonnen!', labelQueued: '⏳ In der Warteschlange...'
    };
    settings.displayTexts = Object.assign({ ...wheelDisplayDefaults }, settings.displayTexts || {});
    
    return {
      id: config.id,
      name: config.name || 'Unnamed Wheel',
      segments: JSON.parse(config.segments),
      settings,
      giftTriggers: config.gift_triggers ? JSON.parse(config.gift_triggers) : {},
      chatCommand: config.chat_command || null,
      enabled: config.enabled === 1
    };
  }

  /**
   * Create a new wheel
   * @param {string} name - Name of the wheel
   * @param {Array} segments - Wheel segments
   * @param {Object} settings - Wheel settings
   * @param {Object} giftTriggers - Gift triggers for this wheel
   * @param {string} chatCommand - Chat command to trigger this wheel (optional)
   * @returns {number} New wheel ID
   */
  createWheel(name, segments, settings, giftTriggers = {}, chatCommand = null) {
    const result = this.db.prepare(`
      INSERT INTO game_wheel_config (name, segments, settings, gift_triggers, chat_command, enabled)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(name, JSON.stringify(segments), JSON.stringify(settings), JSON.stringify(giftTriggers), chatCommand);
    
    return result.lastInsertRowid;
  }

  /**
   * Update Wheel configuration
   * @param {number} wheelId - Wheel ID
   * @param {Array} segments - Wheel segments
   * @param {Object} settings - Wheel settings
   * @param {Object} giftTriggers - Gift triggers (optional)
   */
  updateWheelConfig(wheelId, segments, settings, giftTriggers = null) {
    const existingConfig = this.getWheelConfig(wheelId);
    const newGiftTriggers = giftTriggers !== null ? giftTriggers : (existingConfig?.giftTriggers || {});
    
    this.db.prepare(`
      UPDATE game_wheel_config 
      SET segments = ?, 
          settings = ?,
          gift_triggers = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(JSON.stringify(segments), JSON.stringify(settings), JSON.stringify(newGiftTriggers), wheelId);
  }

  /**
   * Update wheel name
   * @param {number} wheelId - Wheel ID
   * @param {string} name - New name
   */
  updateWheelName(wheelId, name) {
    this.db.prepare(`
      UPDATE game_wheel_config 
      SET name = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, wheelId);
  }

  /**
   * Update wheel chat command
   * @param {number} wheelId - Wheel ID
   * @param {string} chatCommand - New chat command (or null to disable)
   */
  updateWheelChatCommand(wheelId, chatCommand) {
    this.db.prepare(`
      UPDATE game_wheel_config 
      SET chat_command = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(chatCommand || null, wheelId);
  }

  /**
   * Update wheel enabled status
   * @param {number} wheelId - Wheel ID
   * @param {boolean} enabled - Whether the wheel is enabled
   */
  updateWheelEnabled(wheelId, enabled) {
    this.db.prepare(`
      UPDATE game_wheel_config 
      SET enabled = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(enabled ? 1 : 0, wheelId);
  }

  /**
   * Update Wheel gift triggers
   * @param {number} wheelId - Wheel ID (optional for backward compatibility)
   * @param {Object} giftTriggers - Gift triggers object
   */
  updateWheelGiftTriggers(giftTriggers, wheelId = null) {
    if (wheelId !== null) {
      this.db.prepare(`
        UPDATE game_wheel_config 
        SET gift_triggers = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(JSON.stringify(giftTriggers), wheelId);
    } else {
      // Backward compatibility: update first wheel
      this.db.prepare(`
        UPDATE game_wheel_config 
        SET gift_triggers = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = (SELECT id FROM game_wheel_config ORDER BY id ASC LIMIT 1)
      `).run(JSON.stringify(giftTriggers));
    }
  }

  /**
   * Delete a wheel
   * @param {number} wheelId - Wheel ID
   * @returns {boolean} Success
   */
  deleteWheel(wheelId) {
    // Don't allow deleting the last wheel
    const count = this.db.prepare('SELECT COUNT(*) as count FROM game_wheel_config').get();
    if (count.count <= 1) {
      return false;
    }
    
    this.db.prepare('DELETE FROM game_wheel_config WHERE id = ?').run(wheelId);
    return true;
  }

  /**
   * Find wheel by gift trigger
   * @param {string} giftIdentifier - Gift name or ID
   * @returns {Object|null} Wheel config if found
   */
  findWheelByGiftTrigger(giftIdentifier) {
    const wheels = this.getAllWheels();
    const giftIdLower = giftIdentifier.toLowerCase();
    const giftIdStr = String(giftIdentifier);
    
    for (const wheel of wheels) {
      if (!wheel.enabled) continue;
      if (!wheel.giftTriggers) continue;
      
      const triggerKeys = Object.keys(wheel.giftTriggers);
      const matchingTrigger = triggerKeys.find(triggerKey => {
        // Direct match by ID
        if (triggerKey === giftIdStr) return true;
        // Case-insensitive name match
        if (triggerKey.toLowerCase() === giftIdLower) return true;
        return false;
      });
      
      if (matchingTrigger) {
        return wheel;
      }
    }
    
    return null;
  }

  /**
   * Find wheel by chat command
   * @param {string} command - Chat command (with or without leading /)
   * @returns {Object|null} Wheel config if found
   */
  findWheelByChatCommand(command) {
    const normalizedCommand = command.toLowerCase().replace(/^\/+/, '');
    const wheels = this.getAllWheels();
    
    for (const wheel of wheels) {
      if (!wheel.enabled) continue;
      if (!wheel.chatCommand) continue;
      
      const wheelCommand = wheel.chatCommand.toLowerCase().replace(/^\/+/, '');
      if (wheelCommand === normalizedCommand) {
        return wheel;
      }
    }
    
    return null;
  }

  /**
   * Record a wheel win
   * @param {string} username - Username
   * @param {string} nickname - Nickname
   * @param {string} prizeText - Prize text
   * @param {number} segmentIndex - Segment index
   * @param {string} giftName - Gift name (optional)
   * @param {number} wheelId - Wheel ID (optional, defaults to 1)
   */
  recordWheelWin(username, nickname, prizeText, segmentIndex, giftName, wheelId = 1) {
    this.db.prepare(`
      INSERT INTO game_wheel_wins (wheel_id, username, nickname, prize_text, segment_index, gift_name)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(wheelId, username, nickname || username, prizeText, segmentIndex, giftName || '');
  }

  /**
   * Get wheel win history
   */
  getWheelWinHistory(limit = 50, wheelId = null) {
    if (wheelId !== null) {
      return this.db.prepare(`
        SELECT w.*, wc.name as wheel_name
        FROM game_wheel_wins w
        LEFT JOIN game_wheel_config wc ON w.wheel_id = wc.id
        WHERE w.wheel_id = ?
        ORDER BY w.timestamp DESC 
        LIMIT ?
      `).all(wheelId, limit);
    }
    return this.db.prepare(`
      SELECT w.*, wc.name as wheel_name
      FROM game_wheel_wins w
      LEFT JOIN game_wheel_config wc ON w.wheel_id = wc.id
      ORDER BY w.timestamp DESC 
      LIMIT ?
    `).all(limit);
  }

  /**
   * Get wheel win history for a specific user
   */
  getWheelUserWinHistory(username, limit = 10) {
    return this.db.prepare(`
      SELECT w.*, wc.name as wheel_name
      FROM game_wheel_wins w
      LEFT JOIN game_wheel_config wc ON w.wheel_id = wc.id
      WHERE w.username = ?
      ORDER BY w.timestamp DESC 
      LIMIT ?
    `).all(username, limit);
  }

  /**
   * Mark a wheel prize as paid out
   */
  markWheelPrizePaid(winId) {
    this.db.prepare(`
      UPDATE game_wheel_wins 
      SET paid_out = 1, paid_out_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(winId);
    
    return this.db.prepare('SELECT * FROM game_wheel_wins WHERE id = ?').get(winId);
  }

  /**
   * Get wheel statistics
   * @param {number} wheelId - Wheel ID (optional, returns stats for all wheels if not provided)
   */
  getWheelStats(wheelId = null) {
    let statsQuery = `
      SELECT 
        COUNT(*) as total_spins,
        COUNT(DISTINCT username) as unique_players,
        SUM(CASE WHEN paid_out = 1 THEN 1 ELSE 0 END) as prizes_paid,
        SUM(CASE WHEN paid_out = 0 THEN 1 ELSE 0 END) as prizes_pending
      FROM game_wheel_wins
    `;
    
    let popularQuery = `
      SELECT prize_text, COUNT(*) as count
      FROM game_wheel_wins
    `;
    
    let recentQuery = `
      SELECT nickname, prize_text, timestamp
      FROM game_wheel_wins
    `;
    
    let stats, popularPrizes, recentWinners;
    
    if (wheelId !== null) {
      stats = this.db.prepare(statsQuery + ' WHERE wheel_id = ?').get(wheelId);
      popularPrizes = this.db.prepare(popularQuery + ' WHERE wheel_id = ? GROUP BY prize_text ORDER BY count DESC LIMIT 5').all(wheelId);
      recentWinners = this.db.prepare(recentQuery + ' WHERE wheel_id = ? ORDER BY timestamp DESC LIMIT 5').all(wheelId);
    } else {
      stats = this.db.prepare(statsQuery).get();
      popularPrizes = this.db.prepare(popularQuery + ' GROUP BY prize_text ORDER BY count DESC LIMIT 5').all();
      recentWinners = this.db.prepare(recentQuery + ' ORDER BY timestamp DESC LIMIT 5').all();
    }

    return {
      totalSpins: stats?.total_spins || 0,
      uniquePlayers: stats?.unique_players || 0,
      prizesPaid: stats?.prizes_paid || 0,
      prizesPending: stats?.prizes_pending || 0,
      popularPrizes: popularPrizes || [],
      recentWinners: recentWinners || []
    };
  }

  /**
   * Get unpaid prizes
   */
  getUnpaidWheelPrizes(limit = 100) {
    return this.db.prepare(`
      SELECT w.*, wc.name as wheel_name
      FROM game_wheel_wins w
      LEFT JOIN game_wheel_config wc ON w.wheel_id = wc.id
      WHERE w.paid_out = 0
      ORDER BY w.timestamp ASC
      LIMIT ?
    `).all(limit);
  }

  /**
   * Update a wheel win entry (edit prize text)
   */
  updateWheelWin(winId, prizeText) {
    // Check if win exists first
    const existing = this.db.prepare('SELECT id FROM game_wheel_wins WHERE id = ?').get(winId);
    if (!existing) {
      return null;
    }
    
    this.db.prepare(`
      UPDATE game_wheel_wins 
      SET prize_text = ?
      WHERE id = ?
    `).run(prizeText, winId);
    
    return this.db.prepare('SELECT * FROM game_wheel_wins WHERE id = ?').get(winId);
  }

  /**
   * Delete a wheel win entry
   */
  deleteWheelWin(winId) {
    // Check if win exists first
    const existing = this.db.prepare('SELECT id FROM game_wheel_wins WHERE id = ?').get(winId);
    if (!existing) {
      return false;
    }
    
    this.db.prepare(`
      DELETE FROM game_wheel_wins 
      WHERE id = ?
    `).run(winId);
    
    return true;
  }

  /**
   * Reset all wheel wins (delete all entries)
   * @param {number} wheelId - Wheel ID (optional, resets all if not provided)
   */
  resetAllWheelWins(wheelId = null) {
    if (wheelId !== null) {
      this.db.prepare('DELETE FROM game_wheel_wins WHERE wheel_id = ?').run(wheelId);
    } else {
      this.db.prepare('DELETE FROM game_wheel_wins').run();
    }
  }

  // ========================================
  // WHEEL AUDIO SETTINGS
  // ========================================

  /**
   * Initialize wheel audio settings table
   */
  initWheelAudioTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS game_wheel_audio (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wheel_id TEXT NOT NULL,
        audio_type TEXT NOT NULL,
        filename TEXT,
        is_custom INTEGER DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(wheel_id, audio_type)
      )
    `);
  }

  /**
   * Save wheel audio setting
   * @param {string} wheelId - Wheel ID
   * @param {string} audioType - Audio type (spinning, prize1, prize2, prize3, lost)
   * @param {string} filename - Original filename (or null for default)
   * @param {boolean} isCustom - Whether this is a custom audio
   */
  saveWheelAudioSetting(wheelId, audioType, filename, isCustom) {
    // Ensure table exists
    this.initWheelAudioTable();
    
    this.db.prepare(`
      INSERT OR REPLACE INTO game_wheel_audio (wheel_id, audio_type, filename, is_custom, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(String(wheelId), audioType, filename, isCustom ? 1 : 0);
  }

  /**
   * Get wheel audio settings
   * @param {string} wheelId - Wheel ID
   * @returns {Object} Audio settings by type
   */
  getWheelAudioSettings(wheelId) {
    // Ensure table exists
    this.initWheelAudioTable();
    
    const rows = this.db.prepare(`
      SELECT audio_type, filename, is_custom
      FROM game_wheel_audio
      WHERE wheel_id = ?
    `).all(String(wheelId));
    
    const settings = {};
    for (const row of rows) {
      settings[row.audio_type] = {
        filename: row.filename,
        isCustom: row.is_custom === 1
      };
    }
    
    return settings;
  }

  /**
   * Get single wheel audio setting
   * @param {string} wheelId - Wheel ID
   * @param {string} audioType - Audio type
   * @returns {Object|null} Audio setting or null
   */
  getWheelAudioSetting(wheelId, audioType) {
    // Ensure table exists
    this.initWheelAudioTable();
    
    const row = this.db.prepare(`
      SELECT filename, is_custom
      FROM game_wheel_audio
      WHERE wheel_id = ? AND audio_type = ?
    `).get(String(wheelId), audioType);
    
    if (!row) return null;
    
    return {
      filename: row.filename,
      isCustom: row.is_custom === 1
    };
  }

  // ========================================
  // SLOT AUDIO DATABASE METHODS
  // ========================================

  /**
   * Initialize the slot audio settings table.
   */
  initSlotAudioTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS game_slot_audio (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        machine_id TEXT NOT NULL,
        audio_type TEXT NOT NULL,
        filename TEXT,
        duration_ms INTEGER,
        is_custom INTEGER DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(machine_id, audio_type)
      )
    `);
  }

  /**
   * Save slot audio setting
   * @param {string} machineId - Slot machine ID
   * @param {string} audioType - Audio type (spin, small_win, medium_win, big_win, jackpot, near_miss, reel_stop)
   * @param {string} filename - Original filename (or null for default)
   * @param {number|null} durationMs - Audio duration in ms (or null)
   * @param {boolean} isCustom - Whether this is a custom audio
   */
  saveSlotAudioSetting(machineId, audioType, filename, durationMs, isCustom) {
    this.initSlotAudioTable();
    this.db.prepare(`
      INSERT OR REPLACE INTO game_slot_audio (machine_id, audio_type, filename, duration_ms, is_custom, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(String(machineId), audioType, filename, durationMs || null, isCustom ? 1 : 0);
  }

  /**
   * Get all slot audio settings for a machine
   * @param {string} machineId - Slot machine ID
   * @returns {Object} Audio settings keyed by type
   */
  getSlotAudioSettings(machineId) {
    this.initSlotAudioTable();
    const rows = this.db.prepare(`
      SELECT audio_type, filename, duration_ms, is_custom
      FROM game_slot_audio
      WHERE machine_id = ?
    `).all(String(machineId));

    const settings = {};
    for (const row of rows) {
      settings[row.audio_type] = {
        filename: row.filename,
        durationMs: row.duration_ms,
        isCustom: row.is_custom === 1
      };
    }
    return settings;
  }

  /**
   * Get single slot audio setting
   * @param {string} machineId - Slot machine ID
   * @param {string} audioType - Audio type
   * @returns {Object|null}
   */
  getSlotAudioSetting(machineId, audioType) {
    this.initSlotAudioTable();
    const row = this.db.prepare(`
      SELECT filename, duration_ms, is_custom
      FROM game_slot_audio
      WHERE machine_id = ? AND audio_type = ?
    `).get(String(machineId), audioType);
    if (!row) return null;
    return {
      filename: row.filename,
      durationMs: row.duration_ms,
      isCustom: row.is_custom === 1
    };
  }

  // ========================================
  // SLOT MACHINE DATABASE METHODS
  // Supports multiple slot machines with individual triggers and odds profiles
  // ========================================

  /**
   * Initialize all slot-machine tables.
   * Called once from initialize() – idempotent via IF NOT EXISTS.
   */
  initSlotTables() {
    // Main slot machine configuration table (multi-machine)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS game_slot_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL DEFAULT 'Standard Slot',
        symbols TEXT NOT NULL,
        settings TEXT NOT NULL,
        gift_mappings TEXT DEFAULT '{}',
        odds_profiles TEXT DEFAULT '{}',
        reward_rules TEXT DEFAULT '[]',
        chat_command TEXT,
        enabled INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Per-spin session log (server-authoritative result records)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS game_slot_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        machine_id INTEGER NOT NULL DEFAULT 1,
        username TEXT NOT NULL,
        nickname TEXT,
        trigger_type TEXT NOT NULL,
        trigger_value TEXT,
        reel1 TEXT NOT NULL,
        reel2 TEXT NOT NULL,
        reel3 TEXT NOT NULL,
        outcome_category TEXT NOT NULL,
        reward_actions TEXT DEFAULT '[]',
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Aggregate statistics per machine
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS game_slot_stats (
        machine_id INTEGER PRIMARY KEY,
        total_spins INTEGER DEFAULT 0,
        total_wins INTEGER DEFAULT 0,
        total_jackpots INTEGER DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed a default slot machine if none exists
    const count = this.db.prepare('SELECT COUNT(*) as c FROM game_slot_config').get();
    if ((count?.c || 0) === 0) {
      const defaultSymbols = [
        { id: 'cherry',  emoji: '🍒', label: 'Cherry',  weight: 18 },
        { id: 'lemon',   emoji: '🍋', label: 'Lemon',   weight: 16 },
        { id: 'grape',   emoji: '🍇', label: 'Grape',   weight: 14 },
        { id: 'clover',  emoji: '🍀', label: 'Clover',  weight: 12 },
        { id: 'star',    emoji: '⭐',  label: 'Star',    weight: 10 },
        { id: 'bell',    emoji: '🔔', label: 'Bell',    weight:  8 },
        { id: 'diamond', emoji: '💎', label: 'Diamond', weight:  6 },
        { id: 'money',   emoji: '💰', label: 'Money',   weight:  5 },
        { id: 'seven',   emoji: '7️⃣',  label: 'Seven',  weight:  4 },
        { id: 'bolt',    emoji: '⚡',  label: 'Bolt',   weight:  4 },
        { id: 'fire',    emoji: '🔥', label: 'Fire',   weight:  2 },
        { id: 'joker',   emoji: '🃏', label: 'Joker',  weight:  1 }
      ];

      const defaultSettings = {
        spinDuration: 3000,
        reelStopDelay: 400,
        soundEnabled: true,
        soundVolume: 0.7,
        chatCooldownMs: 30000,
        globalCooldownMs: 0,
        vipCooldownMs: 15000,
        subCooldownMs: 10000,
        nearMissEnabled: true,
        showResultDuration: 5000
      };

      // Odds profiles control the probability of each outcome category.
      // Each profile lists weights – higher weight = more likely.
      // The engine normalises these to a sum of 1000.
      const defaultOddsProfiles = {
        chat: {
          loss:       650,
          near_miss:   80,
          small_win:  150,
          medium_win:  70,
          big_win:     40,
          jackpot:     10
        },
        gift_common: {
          loss:       550,
          near_miss:   80,
          small_win:  200,
          medium_win:  90,
          big_win:     60,
          jackpot:     20
        },
        gift_rare: {
          loss:       400,
          near_miss:   70,
          small_win:  230,
          medium_win: 130,
          big_win:     110,
          jackpot:      60
        }
      };

      const defaultRewardRules = [
        {
          id: 'small_win_audio',
          outcomeCategories: ['small_win'],
          action: 'audio',
          params: { audioType: 'small_win' }
        },
        {
          id: 'medium_win_audio',
          outcomeCategories: ['medium_win'],
          action: 'audio',
          params: { audioType: 'medium_win' }
        },
        {
          id: 'big_win_audio',
          outcomeCategories: ['big_win'],
          action: 'audio',
          params: { audioType: 'big_win' }
        },
        {
          id: 'jackpot_audio',
          outcomeCategories: ['jackpot'],
          action: 'audio',
          params: { audioType: 'jackpot' }
        }
      ];

      this.db.prepare(`
        INSERT INTO game_slot_config
          (name, symbols, settings, gift_mappings, odds_profiles, reward_rules, chat_command, enabled)
        VALUES (?, ?, ?, '{}', ?, ?, ?, 1)
      `).run(
        'Standard Slot',
        JSON.stringify(defaultSymbols),
        JSON.stringify(defaultSettings),
        JSON.stringify(defaultOddsProfiles),
        JSON.stringify(defaultRewardRules),
        '!spin'
      );
    }
  }

  /**
   * Get all slot machines
   * @returns {Array}
   */
  getAllSlotMachines() {
    const rows = this.db.prepare('SELECT * FROM game_slot_config ORDER BY id ASC').all();
    return rows.map(r => this._parseSlotRow(r));
  }

  /**
   * Get slot machine config by ID (defaults to first machine)
   * @param {number|null} machineId
   * @returns {Object|null}
   */
  getSlotConfig(machineId = null) {
    let row;
    if (machineId !== null) {
      row = this.db.prepare('SELECT * FROM game_slot_config WHERE id = ?').get(machineId);
    } else {
      row = this.db.prepare('SELECT * FROM game_slot_config ORDER BY id ASC LIMIT 1').get();
    }
    return row ? this._parseSlotRow(row) : null;
  }

  /**
   * @private
   */
  _parseSlotRow(row) {
    return {
      id: row.id,
      name: row.name,
      symbols: JSON.parse(row.symbols),
      settings: JSON.parse(row.settings),
      giftMappings: JSON.parse(row.gift_mappings || '{}'),
      oddsProfiles: JSON.parse(row.odds_profiles || '{}'),
      rewardRules: JSON.parse(row.reward_rules || '[]'),
      chatCommand: row.chat_command,
      enabled: row.enabled === 1
    };
  }

  /**
   * Create a new slot machine
   * @param {string} name
   * @param {Array}  symbols
   * @param {Object} settings
   * @param {Object} giftMappings
   * @param {Object} oddsProfiles
   * @param {Array}  rewardRules
   * @param {string|null} chatCommand
   * @returns {number} New machine ID
   */
  createSlotMachine(name, symbols, settings, giftMappings = {}, oddsProfiles = {}, rewardRules = [], chatCommand = null) {
    const result = this.db.prepare(`
      INSERT INTO game_slot_config (name, symbols, settings, gift_mappings, odds_profiles, reward_rules, chat_command, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      name,
      JSON.stringify(symbols),
      JSON.stringify(settings),
      JSON.stringify(giftMappings),
      JSON.stringify(oddsProfiles),
      JSON.stringify(rewardRules),
      chatCommand
    );
    return result.lastInsertRowid;
  }

  /**
   * Update slot machine config
   */
  updateSlotConfig(machineId, symbols, settings, giftMappings, oddsProfiles, rewardRules) {
    this.db.prepare(`
      UPDATE game_slot_config
      SET symbols = ?, settings = ?, gift_mappings = ?, odds_profiles = ?, reward_rules = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      JSON.stringify(symbols),
      JSON.stringify(settings),
      JSON.stringify(giftMappings),
      JSON.stringify(oddsProfiles),
      JSON.stringify(rewardRules),
      machineId
    );
  }

  /**
   * Update slot machine name
   */
  updateSlotName(machineId, name) {
    this.db.prepare('UPDATE game_slot_config SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(name, machineId);
  }

  /**
   * Update slot machine chat command
   */
  updateSlotChatCommand(machineId, chatCommand) {
    this.db.prepare('UPDATE game_slot_config SET chat_command = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(chatCommand, machineId);
  }

  /**
   * Update slot machine enabled status
   */
  updateSlotEnabled(machineId, enabled) {
    this.db.prepare('UPDATE game_slot_config SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(enabled ? 1 : 0, machineId);
  }

  /**
   * Delete a slot machine
   * @returns {boolean}
   */
  deleteSlotMachine(machineId) {
    const info = this.db.prepare('DELETE FROM game_slot_config WHERE id = ?').run(machineId);
    return info.changes > 0;
  }

  /**
   * Find slot machine by gift trigger (gift ID string or gift name)
   * @param {string} giftIdentifier
   * @returns {Object|null}
   */
  findSlotMachineByGiftTrigger(giftIdentifier) {
    const machines = this.getAllSlotMachines();
    const lowerIdent = (giftIdentifier || '').toLowerCase().trim();

    for (const machine of machines) {
      if (!machine.enabled) continue;
      const mappings = machine.giftMappings || {};

      // Exact match by key (numeric ID stored as string, or exact name)
      if (mappings[giftIdentifier] !== undefined) return machine;

      // Case-insensitive name fallback
      for (const key of Object.keys(mappings)) {
        if (key.toLowerCase() === lowerIdent) return machine;
      }
    }
    return null;
  }

  /**
   * Find slot machine by chat command
   * @param {string} command  (without leading !/  already stripped)
   * @returns {Object|null}
   */
  findSlotMachineByChatCommand(command) {
    const lowerCmd = (command || '').toLowerCase().replace(/^[!/]+/, '');
    const machines = this.getAllSlotMachines();
    for (const machine of machines) {
      if (!machine.enabled) continue;
      const mc = (machine.chatCommand || '').toLowerCase().replace(/^[!/]+/, '');
      if (mc === lowerCmd) return machine;
    }
    return null;
  }

  /**
   * Record a completed spin
   * @param {Object} spinRecord
   * @returns {number} new session ID
   */
  recordSlotSpin(spinRecord) {
    const result = this.db.prepare(`
      INSERT INTO game_slot_sessions
        (machine_id, username, nickname, trigger_type, trigger_value,
         reel1, reel2, reel3, outcome_category, reward_actions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      spinRecord.machineId,
      spinRecord.username,
      spinRecord.nickname || spinRecord.username,
      spinRecord.triggerType,
      spinRecord.triggerValue || null,
      spinRecord.reel1,
      spinRecord.reel2,
      spinRecord.reel3,
      spinRecord.outcomeCategory,
      JSON.stringify(spinRecord.rewardActions || [])
    );

    // Update aggregate stats
    const isWin = spinRecord.outcomeCategory !== 'loss' && spinRecord.outcomeCategory !== 'near_miss';
    const isJackpot = spinRecord.outcomeCategory === 'jackpot';

    this.db.prepare(`
      INSERT INTO game_slot_stats (machine_id, total_spins, total_wins, total_jackpots)
      VALUES (?, 1, ?, ?)
      ON CONFLICT(machine_id) DO UPDATE SET
        total_spins    = total_spins + 1,
        total_wins     = total_wins + excluded.total_wins,
        total_jackpots = total_jackpots + excluded.total_jackpots,
        updated_at     = CURRENT_TIMESTAMP
    `).run(spinRecord.machineId, isWin ? 1 : 0, isJackpot ? 1 : 0);

    return result.lastInsertRowid;
  }

  /**
   * Get slot statistics for a machine
   * @param {number} machineId
   * @returns {Object}
   */
  getSlotStats(machineId) {
    const row = this.db.prepare('SELECT * FROM game_slot_stats WHERE machine_id = ?').get(machineId);
    if (!row) return { machineId, totalSpins: 0, totalWins: 0, totalJackpots: 0 };
    return {
      machineId: row.machine_id,
      totalSpins: row.total_spins,
      totalWins: row.total_wins,
      totalJackpots: row.total_jackpots
    };
  }
}

module.exports = GameEngineDatabase;
