/**
 * Cache Manager for Talking Heads
 * Handles persistent storage and retrieval of avatars and sprites
 */

const fs = require('fs').promises;
const path = require('path');

class CacheManager {
  constructor(pluginDataDir, db, logger, config) {
    this.pluginDataDir = pluginDataDir;
    this.db = db;
    this.logger = logger;
    this.config = config;
    this.cacheDir = path.join(pluginDataDir, 'avatars');
    this.manualDir = path.join(pluginDataDir, 'manual');
    this.initialized = false;
  }

  /**
   * Initialize cache directory and database table
   */
  async init() {
    try {
      // Ensure cache directories exist
      await fs.mkdir(this.cacheDir, { recursive: true });
      await fs.mkdir(this.manualDir, { recursive: true });

      // Create database table for avatar metadata
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS talking_heads_cache (
          user_id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          style_key TEXT NOT NULL,
          avatar_path TEXT NOT NULL,
          sprite_idle_neutral TEXT NOT NULL,
          sprite_blink TEXT NOT NULL,
          sprite_speak_closed TEXT NOT NULL,
          sprite_speak_mid TEXT NOT NULL,
          sprite_speak_open TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          last_used INTEGER NOT NULL,
          profile_image_url TEXT
        )
      `).run();

      // Create table for manual sprite sets
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS talking_heads_manual_sets (
          set_id TEXT PRIMARY KEY,
          set_name TEXT NOT NULL,
          sprite_idle_neutral TEXT NOT NULL,
          sprite_blink TEXT NOT NULL,
          sprite_speak_closed TEXT NOT NULL,
          sprite_speak_mid TEXT NOT NULL,
          sprite_speak_open TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )
      `).run();

      this.initialized = true;
      this.logger.info('TalkingHeads: Cache manager initialized');
    } catch (error) {
      this.logger.error('TalkingHeads: Failed to initialize cache manager', error);
      throw error;
    }
  }

  /**
   * Check if avatar exists for user
   * @param {string} userId - TikTok user ID
   * @param {string} styleKey - Style template key
   * @returns {boolean} True if cached avatar exists
   */
  hasAvatar(userId, styleKey) {
    if (!this.initialized) return false;

    try {
      const result = this.db.prepare(
        'SELECT user_id FROM talking_heads_cache WHERE user_id = ? AND style_key = ?'
      ).get(userId, styleKey);

      return !!result;
    } catch (error) {
      this.logger.error('TalkingHeads: Error checking cache', error);
      return false;
    }
  }

  /**
   * Get cached avatar data for user
   * @param {string} userId - TikTok user ID
   * @param {string} styleKey - Style template key
   * @returns {object|null} Avatar data or null if not found
   */
  getAvatar(userId, styleKey) {
    if (!this.initialized) return null;

    try {
      const result = this.db.prepare(
        'SELECT * FROM talking_heads_cache WHERE user_id = ? AND style_key = ?'
      ).get(userId, styleKey);

      if (result) {
        // Update last used timestamp
        this.db.prepare(
          'UPDATE talking_heads_cache SET last_used = ? WHERE user_id = ? AND style_key = ?'
        ).run(Date.now(), userId, styleKey);

        return {
          userId: result.user_id,
          username: result.username,
          styleKey: result.style_key,
          avatarPath: result.avatar_path,
          sprites: {
            idle_neutral: result.sprite_idle_neutral,
            blink: result.sprite_blink,
            speak_closed: result.sprite_speak_closed,
            speak_mid: result.sprite_speak_mid,
            speak_open: result.sprite_speak_open
          },
          createdAt: result.created_at,
          lastUsed: result.last_used,
          profileImageUrl: result.profile_image_url
        };
      }

      return null;
    } catch (error) {
      this.logger.error('TalkingHeads: Error retrieving cached avatar', error);
      return null;
    }
  }

  /**
   * Save avatar and sprites to cache
   * @param {string} userId - TikTok user ID
   * @param {string} username - TikTok username
   * @param {string} styleKey - Style template key
   * @param {string} avatarPath - Path to avatar image
   * @param {object} spritePaths - Paths to sprite images
   * @param {string} profileImageUrl - Original profile image URL
   */
  saveAvatar(userId, username, styleKey, avatarPath, spritePaths, profileImageUrl = null) {
    if (!this.initialized) {
      throw new Error('Cache manager not initialized');
    }

    try {
      const now = Date.now();

      this.db.prepare(`
        INSERT OR REPLACE INTO talking_heads_cache (
          user_id, username, style_key, avatar_path,
          sprite_idle_neutral, sprite_blink, sprite_speak_closed,
          sprite_speak_mid, sprite_speak_open,
          created_at, last_used, profile_image_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        username,
        styleKey,
        avatarPath,
        spritePaths.idle_neutral,
        spritePaths.blink,
        spritePaths.speak_closed,
        spritePaths.speak_mid,
        spritePaths.speak_open,
        now,
        now,
        profileImageUrl
      );

      this.logger.info(`TalkingHeads: Cached avatar for user ${username} (${userId})`);
    } catch (error) {
      this.logger.error('TalkingHeads: Failed to save avatar to cache', error);
      throw error;
    }
  }

  /**
   * Clean up old cached avatars based on cache duration
   * @param {Array<string>} activeUserIds - Array of currently active user IDs to skip
   * @returns {number} Number of deleted entries
   */
  async cleanupOldCache(activeUserIds = []) {
    if (!this.initialized || !this.config.cacheEnabled) return 0;

    try {
      const cacheDuration = this.config.cacheDuration || 2592000000; // 30 days default
      const expiryTime = Date.now() - cacheDuration;

      // Get expired entries
      const expiredEntries = this.db.prepare(
        'SELECT user_id, username, avatar_path, sprite_idle_neutral, sprite_blink, sprite_speak_closed, sprite_speak_mid, sprite_speak_open FROM talking_heads_cache WHERE last_used < ?'
      ).all(expiryTime);

      if (expiredEntries.length === 0) return 0;

      // Filter out active animations
      const toDelete = expiredEntries.filter(entry => !activeUserIds.includes(entry.user_id));

      if (toDelete.length === 0) {
        this.logger.info('TalkingHeads: All expired cache entries are currently active, skipping cleanup');
        return 0;
      }

      this.logger.info(`TalkingHeads: Cleaning ${toDelete.length} expired cache entries (${expiredEntries.length - toDelete.length} skipped due to active animations)`);

      // Delete files
      for (const entry of toDelete) {
        try {
          const files = [
            entry.avatar_path,
            entry.sprite_idle_neutral,
            entry.sprite_blink,
            entry.sprite_speak_closed,
            entry.sprite_speak_mid,
            entry.sprite_speak_open
          ];

          for (const file of files) {
            if (file) {
              try {
                await fs.unlink(file);
              } catch (err) {
                // File might not exist, ignore
              }
            }
          }
        } catch (error) {
          this.logger.warn(`TalkingHeads: Error deleting files for user ${entry.username}`, error);
        }
      }

      // Delete database entries for non-active users
      const userIdsToDelete = toDelete.map(e => e.user_id);
      if (userIdsToDelete.length > 0) {
        const placeholders = userIdsToDelete.map(() => '?').join(',');
        const result = this.db.prepare(
          `DELETE FROM talking_heads_cache WHERE user_id IN (${placeholders}) AND last_used < ?`
        ).run(...userIdsToDelete, expiryTime);

        this.logger.info(`TalkingHeads: Cleaned up ${result.changes} old cached avatars`);
        return result.changes;
      }

      return 0;
    } catch (error) {
      this.logger.error('TalkingHeads: Error during cache cleanup', error);
      return 0;
    }
  }

  /**
   * Get cache statistics
   * @returns {object} Cache statistics
   */
  getStats() {
    if (!this.initialized) {
      return { totalAvatars: 0, cacheEnabled: false };
    }

    try {
      const result = this.db.prepare(
        'SELECT COUNT(*) as count FROM talking_heads_cache'
      ).get();

      return {
        totalAvatars: result.count,
        cacheEnabled: this.config.cacheEnabled,
        cacheDuration: this.config.cacheDuration,
        cacheDir: this.cacheDir
      };
    } catch (error) {
      this.logger.error('TalkingHeads: Error getting cache stats', error);
      return { totalAvatars: 0, cacheEnabled: false, error: error.message };
    }
  }

  /**
   * Clear all cached avatars
   * @returns {number} Number of deleted entries
   */
  async clearAllCache() {
    if (!this.initialized) return 0;

    try {
      // Get all entries
      const allEntries = this.db.prepare(
        'SELECT avatar_path, sprite_idle_neutral, sprite_blink, sprite_speak_closed, sprite_speak_mid, sprite_speak_open FROM talking_heads_cache'
      ).all();

      // Delete all files
      for (const entry of allEntries) {
        const files = [
          entry.avatar_path,
          entry.sprite_idle_neutral,
          entry.sprite_blink,
          entry.sprite_speak_closed,
          entry.sprite_speak_mid,
          entry.sprite_speak_open
        ];

        for (const file of files) {
          if (file) {
            try {
              await fs.unlink(file);
            } catch (err) {
              // File might not exist, ignore
            }
          }
        }
      }

      // Clear database
      const result = this.db.prepare('DELETE FROM talking_heads_cache').run();

      this.logger.info(`TalkingHeads: Cleared all cache (${result.changes} entries)`);
      return result.changes;
    } catch (error) {
      this.logger.error('TalkingHeads: Error clearing cache', error);
      return 0;
    }
  }

  /**
   * Save a manual sprite set to the database
   * @param {string} setId - Unique set identifier (slugified from setName)
   * @param {string} setName - Human-readable set name
   * @param {object} spritePaths - Absolute paths to the 5 sprite files
   */
  cacheManualSprites(setId, setName, spritePaths) {
    if (!this.initialized) {
      throw new Error('Cache manager not initialized');
    }

    try {
      const now = Date.now();
      this.db.prepare(`
        INSERT OR REPLACE INTO talking_heads_manual_sets (
          set_id, set_name,
          sprite_idle_neutral, sprite_blink, sprite_speak_closed,
          sprite_speak_mid, sprite_speak_open, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        setId,
        setName,
        spritePaths.idle_neutral,
        spritePaths.blink,
        spritePaths.speak_closed,
        spritePaths.speak_mid,
        spritePaths.speak_open,
        now
      );
      this.logger.info(`TalkingHeads: Cached manual sprite set "${setName}" (${setId})`);
    } catch (error) {
      this.logger.error('TalkingHeads: Failed to save manual sprite set', error);
      throw error;
    }
  }

  /**
   * Retrieve a manual sprite set by its ID
   * @param {string} setId
   * @returns {object|null}
   */
  getManualSet(setId) {
    if (!this.initialized) return null;

    try {
      const row = this.db.prepare(
        'SELECT * FROM talking_heads_manual_sets WHERE set_id = ?'
      ).get(setId);

      if (!row) return null;

      return {
        setId: row.set_id,
        setName: row.set_name,
        sprites: {
          idle_neutral: row.sprite_idle_neutral,
          blink: row.sprite_blink,
          speak_closed: row.sprite_speak_closed,
          speak_mid: row.sprite_speak_mid,
          speak_open: row.sprite_speak_open
        },
        createdAt: row.created_at
      };
    } catch (error) {
      this.logger.error('TalkingHeads: Error retrieving manual sprite set', error);
      return null;
    }
  }

  /**
   * List all manual sprite sets
   * @returns {Array}
   */
  listManualSets() {
    if (!this.initialized) return [];

    try {
      const rows = this.db.prepare(
        'SELECT * FROM talking_heads_manual_sets ORDER BY created_at DESC'
      ).all();

      return rows.map((row) => ({
        setId: row.set_id,
        setName: row.set_name,
        sprites: {
          idle_neutral: row.sprite_idle_neutral,
          blink: row.sprite_blink,
          speak_closed: row.sprite_speak_closed,
          speak_mid: row.sprite_speak_mid,
          speak_open: row.sprite_speak_open
        },
        createdAt: row.created_at
      }));
    } catch (error) {
      this.logger.error('TalkingHeads: Failed to list manual sprite sets', error);
      return [];
    }
  }

  /**
   * Delete a manual sprite set including its files
   * @param {string} setId
   * @returns {boolean} True if deleted
   */
  async deleteManualSet(setId) {
    if (!this.initialized) return false;

    try {
      const set = this.getManualSet(setId);
      if (!set) return false;

      // Delete sprite files
      const files = Object.values(set.sprites);
      for (const file of files) {
        if (file) {
          try {
            await fs.unlink(file);
          } catch (_) {
            // File may not exist, ignore
          }
        }
      }

      // Try to remove the directory if empty
      try {
        const setDir = path.join(this.manualDir, setId);
        await fs.rmdir(setDir);
      } catch (_) {
        // Directory may not be empty or may not exist
      }

      // Remove DB row
      this.db.prepare('DELETE FROM talking_heads_manual_sets WHERE set_id = ?').run(setId);

      this.logger.info(`TalkingHeads: Deleted manual sprite set ${setId}`);
      return true;
    } catch (error) {
      this.logger.error('TalkingHeads: Failed to delete manual sprite set', error);
      return false;
    }
  }

  /**
   * Assign a manual sprite set to a user (stores in main cache table)
   * @param {string} userId
   * @param {string} username
   * @param {string} setId
   * @returns {boolean} True if successful
   */
  assignManualSetToUser(userId, username, setId) {
    if (!this.initialized) {
      throw new Error('Cache manager not initialized');
    }

    const set = this.getManualSet(setId);
    if (!set) {
      throw new Error(`Manual sprite set "${setId}" not found`);
    }

    // Store in the main cache table using style_key = 'manual:{setId}'
    // avatar_path reuses idle_neutral since manual sets don't have a separate full avatar image
    const styleKey = `manual:${setId}`;
    const avatarPath = set.sprites.idle_neutral;

    this.saveAvatar(userId, username, styleKey, avatarPath, set.sprites, null);
    this.logger.info(`TalkingHeads: Assigned manual set "${setId}" to user ${username} (${userId})`);
    return true;
  }

  /**
   * List cached avatars for UI display
   * @param {number} limit - Maximum number of entries to return
   * @returns {Array} Cached avatar metadata
   */
  listAvatars(limit = 50) {
    if (!this.initialized) {
      return [];
    }

    try {
      const rows = this.db.prepare(`
        SELECT user_id, username, style_key, avatar_path,
               sprite_idle_neutral, sprite_blink, sprite_speak_closed,
               sprite_speak_mid, sprite_speak_open,
               created_at, last_used, profile_image_url
        FROM talking_heads_cache
        ORDER BY created_at DESC
        LIMIT ?
      `).all(limit);

      return rows.map((row) => ({
        userId: row.user_id,
        username: row.username,
        styleKey: row.style_key,
        avatarPath: row.avatar_path,
        sprites: {
          idle_neutral: row.sprite_idle_neutral,
          blink: row.sprite_blink,
          speak_closed: row.sprite_speak_closed,
          speak_mid: row.sprite_speak_mid,
          speak_open: row.sprite_speak_open
        },
        createdAt: row.created_at,
        lastUsed: row.last_used,
        profileImageUrl: row.profile_image_url
      }));
    } catch (error) {
      this.logger.error('TalkingHeads: Failed to list cached avatars', error);
      return [];
    }
  }
}

module.exports = CacheManager;
