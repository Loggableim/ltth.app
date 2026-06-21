/**
 * Team Names Module
 * Allows users to set custom team names instead of "Red Team" / "Blue Team"
 */

class TeamNamesManager {
  constructor(database, logger = console) {
    this.db = database;
    this.logger = logger;
    
    // Default team names
    this.teamNames = {
      red: { name: 'Team Rot', imageUrl: null },
      blue: { name: 'Team Blau', imageUrl: null }
    };
    
    this.logger.info('🏷️ Team Names Manager initialized');
  }

  /**
   * Initialize database table
   */
  initializeTable() {
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS coinbattle_team_names (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id INTEGER,
        team TEXT NOT NULL,
        name TEXT NOT NULL,
        image_url TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(match_id, team)
      )
    `).run();
    
    // Add image_url column if it doesn't exist (migration)
    try {
      this.db.prepare(`ALTER TABLE coinbattle_team_names ADD COLUMN image_url TEXT`).run();
    } catch (error) {
      // Column already exists - expected on subsequent runs
      // Only ignore duplicate column errors
      if (!error.message.includes('duplicate column name')) {
        this.logger.error(`Failed to add image_url column: ${error.message}`);
        throw error;
      }
    }
    
    // Load current team names
    this.loadTeamNames();
  }

  /**
   * Load team names from database
   */
  loadTeamNames() {
    try {
      const redData = this.db.prepare(`
        SELECT name, image_url FROM coinbattle_team_names 
        WHERE match_id IS NULL AND team = 'red'
        ORDER BY created_at DESC LIMIT 1
      `).get();
      
      const blueData = this.db.prepare(`
        SELECT name, image_url FROM coinbattle_team_names 
        WHERE match_id IS NULL AND team = 'blue'
        ORDER BY created_at DESC LIMIT 1
      `).get();
      
      if (redData) {
        this.teamNames.red = { 
          name: redData.name, 
          imageUrl: redData.image_url 
        };
      }
      if (blueData) {
        this.teamNames.blue = { 
          name: blueData.name, 
          imageUrl: blueData.image_url 
        };
      }
      
    } catch (error) {
      this.logger.error(`Failed to load team names: ${error.message}`);
    }
  }

  /**
   * Set team name and optional image
   */
  setTeamName(team, name, matchId = null, imageUrl = null) {
    if (!['red', 'blue'].includes(team)) {
      return { success: false, error: 'Invalid team (must be "red" or "blue")' };
    }
    
    if (!name || name.trim().length === 0) {
      return { success: false, error: 'Team name cannot be empty' };
    }
    
    if (name.length > 50) {
      return { success: false, error: 'Team name too long (max 50 characters)' };
    }
    
    try {
      this.db.prepare(`
        INSERT INTO coinbattle_team_names (match_id, team, name, image_url)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(match_id, team) DO UPDATE SET 
          name = excluded.name,
          image_url = excluded.image_url
      `).run(matchId, team, name.trim(), imageUrl);
      
      // Update in-memory cache for global names
      if (!matchId) {
        this.teamNames[team] = { 
          name: name.trim(), 
          imageUrl: imageUrl 
        };
      }
      
      this.logger.info(`Team name set: ${team} = "${name}"${imageUrl ? ' with image' : ''}`);
      return { success: true };
      
    } catch (error) {
      this.logger.error(`Failed to set team name: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get team data (name and image)
   */
  getTeamName(team, matchId = null) {
    if (!['red', 'blue'].includes(team)) {
      return null;
    }
    
    try {
      // Try to get match-specific data first
      if (matchId) {
        const result = this.db.prepare(`
          SELECT name, image_url FROM coinbattle_team_names 
          WHERE match_id = ? AND team = ?
        `).get(matchId, team);
        
        if (result) {
          return { name: result.name, imageUrl: result.image_url };
        }
      }
      
      // Fall back to global data
      return this.teamNames[team];
      
    } catch (error) {
      this.logger.error(`Failed to get team name: ${error.message}`);
      return this.teamNames[team];
    }
  }

  /**
   * Get both team names
   */
  getTeamNames(matchId = null) {
    return {
      red: this.getTeamName('red', matchId),
      blue: this.getTeamName('blue', matchId)
    };
  }

  /**
   * Reset team names to defaults
   */
  resetTeamNames(matchId = null) {
    try {
      if (matchId) {
        this.db.prepare(`
          DELETE FROM coinbattle_team_names WHERE match_id = ?
        `).run(matchId);
      } else {
        this.db.prepare(`
          DELETE FROM coinbattle_team_names WHERE match_id IS NULL
        `).run();
        
        this.teamNames = {
          red: { name: 'Team Rot', imageUrl: null },
          blue: { name: 'Team Blau', imageUrl: null }
        };
      }
      
      this.logger.info('Team names reset to defaults');
      return { success: true };
      
    } catch (error) {
      this.logger.error(`Failed to reset team names: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get team name history
   */
  getTeamNameHistory(limit = 10) {
    try {
      return this.db.prepare(`
        SELECT * FROM coinbattle_team_names 
        WHERE match_id IS NULL
        ORDER BY created_at DESC
        LIMIT ?
      `).all(limit);
    } catch (error) {
      this.logger.error(`Failed to get team name history: ${error.message}`);
      return [];
    }
  }
}

module.exports = TeamNamesManager;
