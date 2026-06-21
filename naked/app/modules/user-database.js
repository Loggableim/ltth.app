/**
 * User Database Module for LTTH
 * 
 * Manages multi-user system with SQLite database:
 * - User creation and management
 * - Profile management per user
 * - User-specific configurations
 * - Last login tracking
 * 
 * Database Schema:
 * - users: User accounts with metadata
 * - profiles: User-specific profiles (Default, Gaming, etc.)
 * - profile_settings: Key-value settings per profile
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');

class UserDatabase {
  /**
   * Initialize user database
   * @param {string} dbPath - Path to users.db (default: ~/.config/ltth/users.db)
   */
  constructor(dbPath) {
    this.dbPath = dbPath || this.getDefaultDbPath();
    
    // Ensure directory exists
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    try {
      this.db = new Database(this.dbPath);
      this.initializeTables();
      console.log(`[UserDatabase] Initialized at: ${this.dbPath}`);
    } catch (error) {
      console.error(`[UserDatabase] Failed to initialize:`, error);
      throw error;
    }
  }

  /**
   * Get default database path based on platform
   */
  getDefaultDbPath() {
    const homeDir = os.homedir();
    let configDir;
    
    switch (process.platform) {
      case 'win32':
        configDir = path.join(process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local'), 'pupcidslittletiktokhelper');
        break;
      case 'darwin':
        configDir = path.join(homeDir, 'Library', 'Application Support', 'pupcidslittletiktokhelper');
        break;
      default:
        configDir = path.join(homeDir, '.local', 'share', 'pupcidslittletiktokhelper');
    }
    
    return path.join(configDir, 'users.db');
  }

  /**
   * Initialize database tables
   */
  initializeTables() {
    // Users table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        avatar TEXT,
        language TEXT DEFAULT 'de',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME,
        is_active INTEGER DEFAULT 1
      )
    `);

    // Profiles table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        config_path TEXT NOT NULL,
        is_default INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_used DATETIME,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, name)
      )
    `);

    // Profile settings table (key-value storage per profile)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS profile_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER NOT NULL,
        key TEXT NOT NULL,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
        UNIQUE(profile_id, key)
      )
    `);

    // Create indexes for performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
      CREATE INDEX IF NOT EXISTS idx_profile_settings_profile_id ON profile_settings(profile_id);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login DESC);
    `);

    console.log('[UserDatabase] Tables initialized');
  }

  /**
   * Get all users
   * @returns {Array} Array of user objects with profile counts
   */
  getAllUsers() {
    try {
      const stmt = this.db.prepare(`
        SELECT 
          u.*,
          COUNT(p.id) as profile_count,
          MAX(p.last_used) as last_profile_used
        FROM users u
        LEFT JOIN profiles p ON u.id = p.user_id
        WHERE u.is_active = 1
        GROUP BY u.id
        ORDER BY u.last_login DESC NULLS LAST, u.created_at DESC
      `);
      
      const users = stmt.all();
      
      // Parse avatar and add profiles for each user
      return users.map(user => ({
        ...user,
        profiles: this.getUserProfiles(user.username),
        is_active: Boolean(user.is_active)
      }));
    } catch (error) {
      console.error('[UserDatabase] Error getting all users:', error);
      throw error;
    }
  }

  /**
   * Get user by username
   * @param {string} username - TikTok username
   * @returns {Object|null} User object or null
   */
  getUser(username) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM users WHERE username = ? AND is_active = 1
      `);
      
      const user = stmt.get(username);
      if (!user) return null;
      
      // Get user's profiles
      user.profiles = this.getUserProfiles(username);
      user.is_active = Boolean(user.is_active);
      
      return user;
    } catch (error) {
      console.error('[UserDatabase] Error getting user:', error);
      throw error;
    }
  }

  /**
   * Create new user with default profile
   * @param {string} username - TikTok @username
   * @param {string} language - User's preferred language (de/en/es/fr)
   * @param {string} avatarUrl - Avatar URL or base64
   * @param {string} displayName - Optional display name
   * @returns {Object} Created user with profile
   */
  createUser(username, language = 'de', avatarUrl = null, displayName = null) {
    try {
      // Validate inputs
      if (!username || typeof username !== 'string') {
        throw new Error('Invalid username');
      }
      
      // Remove @ if present
      username = username.replace(/^@/, '');
      
      // Check if user already exists
      const existing = this.getUser(username);
      if (existing) {
        throw new Error(`User ${username} already exists`);
      }
      
      // Validate language
      const allowedLanguages = ['de', 'en', 'es', 'fr'];
      if (!allowedLanguages.includes(language)) {
        language = 'de';
      }
      
      const transaction = this.db.transaction(() => {
        // Insert user
        const insertUser = this.db.prepare(`
          INSERT INTO users (username, display_name, avatar, language, last_login)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);
        
        const result = insertUser.run(
          username,
          displayName || username,
          avatarUrl,
          language
        );
        
        const userId = result.lastInsertRowid;
        
        // Create user directory structure
        const userDir = this.getUserDirectory(username);
        const profileDir = path.join(userDir, 'profiles', 'default');
        fs.mkdirSync(profileDir, { recursive: true });
        
        // Create default profile
        const insertProfile = this.db.prepare(`
          INSERT INTO profiles (user_id, name, config_path, is_default, last_used)
          VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
        `);
        
        insertProfile.run(
          userId,
          'default',
          profileDir
        );
        
        // Create profile metadata file
        const profileMetadata = {
          activeProfile: 'default',
          lastLogin: new Date().toISOString(),
          language: language
        };
        
        fs.writeFileSync(
          path.join(userDir, 'profile-metadata.json'),
          JSON.stringify(profileMetadata, null, 2),
          'utf8'
        );
        
        // Create default settings file
        const defaultSettings = {
          language: language,
          theme: 'dark',
          createdAt: new Date().toISOString()
        };
        
        fs.writeFileSync(
          path.join(profileDir, 'settings.json'),
          JSON.stringify(defaultSettings, null, 2),
          'utf8'
        );
        
        console.log(`[UserDatabase] Created user: ${username} with default profile`);
        
        return userId;
      });
      
      const userId = transaction();
      
      // Return created user
      return this.getUser(username);
    } catch (error) {
      console.error('[UserDatabase] Error creating user:', error);
      throw error;
    }
  }

  /**
   * Get user's profiles
   * @param {string} username - Username
   * @returns {Array} Array of profile objects
   */
  getUserProfiles(username) {
    try {
      const user = this.db.prepare('SELECT id FROM users WHERE username = ?').get(username);
      if (!user) {
        return [];
      }
      
      const stmt = this.db.prepare(`
        SELECT 
          id,
          name,
          config_path,
          is_default,
          created_at,
          last_used
        FROM profiles
        WHERE user_id = ?
        ORDER BY is_default DESC, last_used DESC NULLS LAST, created_at ASC
      `);
      
      const profiles = stmt.all(user.id);
      
      return profiles.map(p => ({
        ...p,
        is_default: Boolean(p.is_default)
      }));
    } catch (error) {
      console.error('[UserDatabase] Error getting user profiles:', error);
      throw error;
    }
  }

  /**
   * Create new profile for user
   * @param {string} username - Username
   * @param {string} profileName - Profile name
   * @returns {Object} Created profile
   */
  createProfile(username, profileName) {
    try {
      if (!profileName || typeof profileName !== 'string') {
        throw new Error('Invalid profile name');
      }
      
      const user = this.getUser(username);
      if (!user) {
        throw new Error(`User ${username} not found`);
      }
      
      const transaction = this.db.transaction(() => {
        // Create profile directory
        const userDir = this.getUserDirectory(username);
        const profileDir = path.join(userDir, 'profiles', profileName);
        
        if (fs.existsSync(profileDir)) {
          throw new Error(`Profile ${profileName} already exists`);
        }
        
        fs.mkdirSync(profileDir, { recursive: true });
        
        // Insert profile
        const stmt = this.db.prepare(`
          INSERT INTO profiles (user_id, name, config_path, is_default, last_used)
          VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)
        `);
        
        stmt.run(user.id, profileName, profileDir);
        
        // Create settings file
        const settings = {
          language: user.language,
          theme: 'dark',
          createdAt: new Date().toISOString()
        };
        
        fs.writeFileSync(
          path.join(profileDir, 'settings.json'),
          JSON.stringify(settings, null, 2),
          'utf8'
        );
        
        console.log(`[UserDatabase] Created profile: ${profileName} for user ${username}`);
      });
      
      transaction();
      
      // Return created profile
      const profiles = this.getUserProfiles(username);
      return profiles.find(p => p.name === profileName);
    } catch (error) {
      console.error('[UserDatabase] Error creating profile:', error);
      throw error;
    }
  }

  /**
   * Select user and profile (updates last_login and last_used)
   * @param {string} username - Username
   * @param {string} profileName - Profile name
   * @param {string} language - Optional language override
   * @returns {Object} Selected profile info
   */
  selectProfile(username, profileName, language = null) {
    try {
      const user = this.getUser(username);
      if (!user) {
        throw new Error(`User ${username} not found`);
      }
      
      const profiles = user.profiles;
      const profile = profiles.find(p => p.name === profileName);
      if (!profile) {
        throw new Error(`Profile ${profileName} not found for user ${username}`);
      }
      
      const transaction = this.db.transaction(() => {
        // Update user last_login
        const updateUser = this.db.prepare(`
          UPDATE users 
          SET last_login = CURRENT_TIMESTAMP
          ${language ? ', language = ?' : ''}
          WHERE id = ?
        `);
        
        if (language) {
          updateUser.run(language, user.id);
        } else {
          updateUser.run(user.id);
        }
        
        // Update profile last_used
        const updateProfile = this.db.prepare(`
          UPDATE profiles
          SET last_used = CURRENT_TIMESTAMP
          WHERE id = ?
        `);
        
        updateProfile.run(profile.id);
        
        // Update profile metadata file
        const userDir = this.getUserDirectory(username);
        const metadataPath = path.join(userDir, 'profile-metadata.json');
        
        const metadata = {
          activeProfile: profileName,
          lastLogin: new Date().toISOString(),
          language: language || user.language
        };
        
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
        
        console.log(`[UserDatabase] Selected profile: ${profileName} for user ${username}`);
      });
      
      transaction();
      
      return {
        user: this.getUser(username),
        profile: profile,
        configPath: profile.config_path
      };
    } catch (error) {
      console.error('[UserDatabase] Error selecting profile:', error);
      throw error;
    }
  }

  /**
   * Get user's config for specific profile
   * @param {string} username - Username
   * @param {string} profileName - Profile name
   * @returns {Object} Merged configuration
   */
  getUserConfig(username, profileName) {
    try {
      const user = this.getUser(username);
      if (!user) {
        throw new Error(`User ${username} not found`);
      }
      
      const profile = user.profiles.find(p => p.name === profileName);
      if (!profile) {
        throw new Error(`Profile ${profileName} not found`);
      }
      
      // Load settings file
      const settingsPath = path.join(profile.config_path, 'settings.json');
      let settings = {};
      
      if (fs.existsSync(settingsPath)) {
        const data = fs.readFileSync(settingsPath, 'utf8');
        settings = JSON.parse(data);
      }
      
      // Merge with user-level settings
      return {
        username: user.username,
        displayName: user.display_name,
        language: user.language,
        profileName: profile.name,
        ...settings
      };
    } catch (error) {
      console.error('[UserDatabase] Error getting user config:', error);
      throw error;
    }
  }

  /**
   * Update user's last login timestamp
   * @param {string} username - Username
   */
  updateUserLastLogin(username) {
    try {
      const stmt = this.db.prepare(`
        UPDATE users
        SET last_login = CURRENT_TIMESTAMP
        WHERE username = ?
      `);
      
      stmt.run(username);
    } catch (error) {
      console.error('[UserDatabase] Error updating last login:', error);
      throw error;
    }
  }

  /**
   * Delete user and all associated data
   * @param {string} username - Username
   * @returns {boolean} Success
   */
  deleteUser(username) {
    try {
      const user = this.getUser(username);
      if (!user) {
        throw new Error(`User ${username} not found`);
      }
      
      const transaction = this.db.transaction(() => {
        // Delete from database (cascades to profiles and settings)
        const stmt = this.db.prepare('DELETE FROM users WHERE id = ?');
        stmt.run(user.id);
        
        // Delete user directory
        const userDir = this.getUserDirectory(username);
        if (fs.existsSync(userDir)) {
          fs.rmSync(userDir, { recursive: true, force: true });
        }
        
        console.log(`[UserDatabase] Deleted user: ${username}`);
      });
      
      transaction();
      return true;
    } catch (error) {
      console.error('[UserDatabase] Error deleting user:', error);
      throw error;
    }
  }

  /**
   * Delete profile
   * @param {string} username - Username
   * @param {string} profileName - Profile name
   * @returns {boolean} Success
   */
  deleteProfile(username, profileName) {
    try {
      if (profileName === 'default') {
        throw new Error('Cannot delete default profile');
      }
      
      const user = this.getUser(username);
      if (!user) {
        throw new Error(`User ${username} not found`);
      }
      
      const profile = user.profiles.find(p => p.name === profileName);
      if (!profile) {
        throw new Error(`Profile ${profileName} not found`);
      }
      
      const transaction = this.db.transaction(() => {
        // Delete from database
        const stmt = this.db.prepare('DELETE FROM profiles WHERE id = ?');
        stmt.run(profile.id);
        
        // Delete profile directory
        if (fs.existsSync(profile.config_path)) {
          fs.rmSync(profile.config_path, { recursive: true, force: true });
        }
        
        console.log(`[UserDatabase] Deleted profile: ${profileName} for user ${username}`);
      });
      
      transaction();
      return true;
    } catch (error) {
      console.error('[UserDatabase] Error deleting profile:', error);
      throw error;
    }
  }

  /**
   * Get user directory path
   * @param {string} username - Username
   * @returns {string} User directory path
   */
  getUserDirectory(username) {
    const configDir = path.dirname(this.dbPath);
    return path.join(configDir, 'users', username);
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      console.log('[UserDatabase] Database closed');
    }
  }

  /**
   * Get database statistics
   * @returns {Object} Database stats
   */
  getStats() {
    try {
      const users = this.db.prepare('SELECT COUNT(*) as count FROM users WHERE is_active = 1').get();
      const profiles = this.db.prepare('SELECT COUNT(*) as count FROM profiles').get();
      const settings = this.db.prepare('SELECT COUNT(*) as count FROM profile_settings').get();
      
      return {
        totalUsers: users.count,
        totalProfiles: profiles.count,
        totalSettings: settings.count,
        dbPath: this.dbPath,
        dbSize: fs.existsSync(this.dbPath) ? fs.statSync(this.dbPath).size : 0
      };
    } catch (error) {
      console.error('[UserDatabase] Error getting stats:', error);
      return null;
    }
  }
}

module.exports = UserDatabase;
