/**
 * Player Avatar/Skin System
 * Customizable avatars for players
 */

class PlayerAvatarSystem {
  constructor(database, logger = console) {
    this.db = database;
    this.logger = logger;
    
    // Available avatar sets
    this.avatarSets = {
      animals: [
        '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼',
        '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔'
      ],
      fantasy: [
        '🧙', '🧛', '🧚', '🧜', '🧝', '🧞', '🧟', '👼',
        '👻', '👽', '🤖', '👾', '🦄', '🐉', '🦖', '🦕'
      ],
      food: [
        '🍕', '🍔', '🍟', '🌭', '🍿', '🧁', '🍰', '🎂',
        '🍪', '🍩', '🍦', '🍧', '🥤', '🍹', '🍺', '🍻'
      ],
      sports: [
        '⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏉', '🥏',
        '🎱', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '⛳'
      ],
      nature: [
        '🌸', '🌺', '🌻', '🌷', '🌹', '🥀', '🌼', '🌵',
        '🌲', '🌳', '🌴', '🌱', '🌿', '☘️', '🍀', '🍃'
      ],
      space: [
        '🌍', '🌎', '🌏', '🌕', '🌖', '🌗', '🌘', '🌑',
        '⭐', '🌟', '✨', '💫', '🌠', '🚀', '🛸', '🌌'
      ]
    };
    
    // Custom skins/frames
    this.skins = {
      default: {
        id: 'default',
        name: 'Default',
        borderColor: '#3b82f6',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        unlock: 'free'
      },
      gold: {
        id: 'gold',
        name: 'Golden Champion',
        borderColor: '#ffd700',
        background: 'linear-gradient(135deg, #ffd700 0%, #ff8c00 100%)',
        unlock: 'win_10_matches'
      },
      diamond: {
        id: 'diamond',
        name: 'Diamond Elite',
        borderColor: '#b9f2ff',
        background: 'linear-gradient(135deg, #b9f2ff 0%, #89f7fe 100%)',
        unlock: 'earn_10000_coins'
      },
      fire: {
        id: 'fire',
        name: 'Blazing Fire',
        borderColor: '#ff4500',
        background: 'linear-gradient(135deg, #ff4500 0%, #ff6347 100%)',
        unlock: 'win_streak_5'
      },
      ice: {
        id: 'ice',
        name: 'Frozen Ice',
        borderColor: '#00ffff',
        background: 'linear-gradient(135deg, #00ffff 0%, #0080ff 100%)',
        unlock: 'king_of_hill_300s'
      },
      rainbow: {
        id: 'rainbow',
        name: 'Rainbow Pride',
        borderColor: 'transparent',
        background: 'linear-gradient(135deg, #ff0000 0%, #ff7f00 14%, #ffff00 28%, #00ff00 42%, #0000ff 57%, #4b0082 71%, #9400d3 85%, #ff0000 100%)',
        unlock: 'play_50_matches'
      }
    };
    
    // Player avatar assignments
    this.playerAvatars = new Map(); // userId -> { avatar, skin, frameColor }
    
    this.logger.info('🎭 Player Avatar System initialized');
  }

  /**
   * Initialize database tables
   */
  initializeTables() {
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS coinbattle_player_avatars (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT UNIQUE NOT NULL,
        avatar TEXT DEFAULT '🎮',
        avatar_set TEXT DEFAULT 'animals',
        skin_id TEXT DEFAULT 'default',
        frame_color TEXT DEFAULT '#3b82f6',
        unlocked_skins TEXT DEFAULT '["default"]',
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `).run();
    
    this.logger.info('🎭 Avatar tables initialized');
  }

  /**
   * Get player avatar
   */
  getPlayerAvatar(userId) {
    if (this.playerAvatars.has(userId)) {
      return this.playerAvatars.get(userId);
    }
    
    try {
      const row = this.db.prepare(`
        SELECT * FROM coinbattle_player_avatars WHERE user_id = ?
      `).get(userId);
      
      if (row) {
        const avatar = {
          avatar: row.avatar,
          avatarSet: row.avatar_set,
          skinId: row.skin_id,
          frameColor: row.frame_color,
          unlockedSkins: JSON.parse(row.unlocked_skins || '["default"]')
        };
        
        this.playerAvatars.set(userId, avatar);
        return avatar;
      }
    } catch (error) {
      this.logger.error(`Failed to get player avatar: ${error.message}`);
    }
    
    // Return default
    return {
      avatar: '🎮',
      avatarSet: 'animals',
      skinId: 'default',
      frameColor: '#3b82f6',
      unlockedSkins: ['default']
    };
  }

  /**
   * Set player avatar
   */
  setPlayerAvatar(userId, avatar, avatarSet = 'animals') {
    try {
      this.db.prepare(`
        INSERT INTO coinbattle_player_avatars (user_id, avatar, avatar_set, updated_at)
        VALUES (?, ?, ?, strftime('%s', 'now'))
        ON CONFLICT(user_id) DO UPDATE SET
          avatar = excluded.avatar,
          avatar_set = excluded.avatar_set,
          updated_at = excluded.updated_at
      `).run(userId, avatar, avatarSet);
      
      // Update cache
      const current = this.getPlayerAvatar(userId);
      current.avatar = avatar;
      current.avatarSet = avatarSet;
      this.playerAvatars.set(userId, current);
      
      this.logger.info(`🎭 Avatar set for ${userId}: ${avatar}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to set player avatar: ${error.message}`);
      return false;
    }
  }

  /**
   * Set player skin
   */
  setPlayerSkin(userId, skinId) {
    const skin = this.skins[skinId];
    if (!skin) {
      return { success: false, error: 'Invalid skin ID' };
    }
    
    const playerData = this.getPlayerAvatar(userId);
    
    // Check if skin is unlocked
    if (!playerData.unlockedSkins.includes(skinId)) {
      return { success: false, error: 'Skin not unlocked' };
    }
    
    try {
      this.db.prepare(`
        UPDATE coinbattle_player_avatars
        SET skin_id = ?, frame_color = ?, updated_at = strftime('%s', 'now')
        WHERE user_id = ?
      `).run(skinId, skin.borderColor, userId);
      
      // Update cache
      playerData.skinId = skinId;
      playerData.frameColor = skin.borderColor;
      this.playerAvatars.set(userId, playerData);
      
      this.logger.info(`🎭 Skin set for ${userId}: ${skinId}`);
      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to set player skin: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Unlock skin for player
   */
  unlockSkin(userId, skinId) {
    const skin = this.skins[skinId];
    if (!skin) {
      return false;
    }
    
    const playerData = this.getPlayerAvatar(userId);
    
    if (playerData.unlockedSkins.includes(skinId)) {
      return true; // Already unlocked
    }
    
    playerData.unlockedSkins.push(skinId);
    
    try {
      this.db.prepare(`
        UPDATE coinbattle_player_avatars
        SET unlocked_skins = ?, updated_at = strftime('%s', 'now')
        WHERE user_id = ?
      `).run(JSON.stringify(playerData.unlockedSkins), userId);
      
      this.playerAvatars.set(userId, playerData);
      
      this.logger.info(`🎭 Skin unlocked for ${userId}: ${skinId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to unlock skin: ${error.message}`);
      return false;
    }
  }

  /**
   * Check and unlock skins based on achievements
   */
  checkAchievements(userId, playerStats) {
    const unlocked = [];
    
    // Check each skin's unlock condition
    for (const [skinId, skin] of Object.entries(this.skins)) {
      if (skinId === 'default') continue;
      
      const playerData = this.getPlayerAvatar(userId);
      if (playerData.unlockedSkins.includes(skinId)) continue;
      
      let shouldUnlock = false;
      
      switch (skin.unlock) {
        case 'win_10_matches':
          shouldUnlock = playerStats.matches_won >= 10;
          break;
        case 'earn_10000_coins':
          shouldUnlock = playerStats.total_coins >= 10000;
          break;
        case 'win_streak_5':
          shouldUnlock = (playerStats.current_streak || 0) >= 5;
          break;
        case 'king_of_hill_300s':
          shouldUnlock = (playerStats.total_king_time || 0) >= 300;
          break;
        case 'play_50_matches':
          shouldUnlock = playerStats.matches_played >= 50;
          break;
      }
      
      if (shouldUnlock) {
        if (this.unlockSkin(userId, skinId)) {
          unlocked.push(skinId);
        }
      }
    }
    
    return unlocked;
  }

  /**
   * Get all available avatars
   */
  getAvailableAvatars() {
    return this.avatarSets;
  }

  /**
   * Get all skins
   */
  getAvailableSkins() {
    return this.skins;
  }

  /**
   * Generate avatar HTML
   */
  generateAvatarHTML(userId, size = 'medium') {
    const playerData = this.getPlayerAvatar(userId);
    const skin = this.skins[playerData.skinId] || this.skins.default;
    
    const sizeMap = {
      small: { outer: '40px', inner: '32px', font: '20px' },
      medium: { outer: '60px', inner: '48px', font: '30px' },
      large: { outer: '80px', inner: '64px', font: '40px' }
    };
    
    const s = sizeMap[size] || sizeMap.medium;
    
    return `
      <div class="player-avatar-container" style="
        width: ${s.outer};
        height: ${s.outer};
        border: 3px solid ${playerData.frameColor};
        background: ${skin.background};
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 0 20px ${playerData.frameColor}40;
        position: relative;
      ">
        <div class="player-avatar-icon" style="
          font-size: ${s.font};
          line-height: 1;
        ">
          ${playerData.avatar}
        </div>
      </div>
    `;
  }
}

module.exports = PlayerAvatarSystem;
