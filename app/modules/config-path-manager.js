const fs = require('fs');
const path = require('path');
const os = require('os');
const {
    canonicalizePluginId,
    getPersistentStorageId
} = require('./plugin-identities');

/**
 * ConfigPathManager - Manages persistent storage location for user configurations
 * 
 * Ensures user configurations are stored outside the application directory
 * to survive updates. Supports:
 * - Windows: %LOCALAPPDATA%/ltth.app
 * - macOS: ~/Library/Application Support/ltth.app
 * - Linux: ~/.local/share/ltth.app
 * - Custom path: User-defined location (e.g., cloud sync folder)
 */
class ConfigPathManager {
    constructor() {
        this.APP_NAME = 'ltth.app';
        this.customConfigPath = null;
        this.settingsFile = null;
        
        // Initialize settings file path in app directory (for bootstrap)
        this.initializeBootstrapSettings();
        
        // Log the config location on startup for debugging
        // Note: Using console.log here because this runs before the logger is initialized
        const configDir = this.getConfigDir();
        console.log(`📂 [ConfigPathManager] Settings stored at: ${configDir}`);
        console.log(`   💡 This location survives application updates!`);
        if (this.customConfigPath) {
            console.log(`   ⚙️  Using custom config path`);
        } else {
            console.log(`   ⚙️  Using default platform config path`);
        }
    }

    /**
     * Initialize bootstrap settings file in app directory
     * This file only stores the custom config path if set by user
     */
    initializeBootstrapSettings() {
        const appDir = path.join(__dirname, '..');
        this.settingsFile = path.join(appDir, '.config_path');
        
        // Read custom path if exists
        if (fs.existsSync(this.settingsFile)) {
            try {
                const data = fs.readFileSync(this.settingsFile, 'utf8').trim();
                if (data) {
                    // Validate the path before using it
                    if (fs.existsSync(data)) {
                        const stats = fs.statSync(data);
                        if (stats.isDirectory()) {
                            // Test write permissions
                            try {
                                const testFile = path.join(data, '.write_test');
                                fs.writeFileSync(testFile, 'test');
                                fs.unlinkSync(testFile);
                                this.customConfigPath = data;
                            } catch (writeError) {
                                console.warn(`Warning: Custom config path not writable, using default: ${writeError.message}`);
                            }
                        } else {
                            console.warn('Warning: Custom config path is not a directory, using default');
                        }
                    } else {
                        console.warn('Warning: Custom config path does not exist, using default');
                    }
                }
            } catch (error) {
                console.warn(`Warning: Could not read custom config path: ${error.message}`);
            }
        }
    }

    /**
     * Get the default config directory based on platform
     */
    getDefaultConfigDir() {
        const platform = os.platform();
        const homeDir = os.homedir();

        switch (platform) {
            case 'win32':
                // Windows: %LOCALAPPDATA%\ltth.app
                return path.join(process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local'), this.APP_NAME);
            
            case 'darwin':
                // macOS: ~/Library/Application Support/ltth.app
                return path.join(homeDir, 'Library', 'Application Support', this.APP_NAME);
            
            case 'linux':
            default:
                // Linux: ~/.local/share/ltth.app
                return path.join(homeDir, '.local', 'share', this.APP_NAME);
        }
    }

    /**
     * Get the current config directory (custom or default)
     */
    getConfigDir() {
        return this.customConfigPath || this.getDefaultConfigDir();
    }

    /**
     * Get the user_configs directory path
     */
    getUserConfigsDir() {
        return path.join(this.getConfigDir(), 'user_configs');
    }

    /**
     * Get the user_data directory path
     */
    getUserDataDir() {
        return path.join(this.getConfigDir(), 'user_data');
    }

    /**
     * Get the uploads directory path
     */
    getUploadsDir() {
        return path.join(this.getConfigDir(), 'uploads');
    }

    /**
     * Get the persistent plugins directory path
     */
    getPluginsDir() {
        return path.join(this.getConfigDir(), 'plugins');
    }

    /**
     * Get plugin data directory path
     */
    getPluginDataDir(pluginId) {
        const canonicalId = canonicalizePluginId(pluginId);
        const persistentId = getPersistentStorageId(canonicalId);
        const persistentDir = path.join(this.getPluginsDir(), persistentId, 'data');
        if (canonicalId !== persistentId) {
            const canonicalDir = path.join(this.getPluginsDir(), canonicalId, 'data');
            if (fs.existsSync(canonicalDir)) {
                this.mergeMissingPluginData(canonicalDir, persistentDir);
            }
        }
        return persistentDir;
    }

    mergeMissingPluginData(sourceDir, targetDir, relativeDir = '') {
        if (!fs.existsSync(sourceDir)) return;
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
            const sourcePath = path.join(sourceDir, entry.name);
            const targetPath = path.join(targetDir, entry.name);
            const relativePath = path.join(relativeDir, entry.name);
            const sourceStat = fs.lstatSync(sourcePath);
            if (sourceStat.isSymbolicLink()) {
                console.warn(`[ConfigPathManager] Skipping symlink in canonical plugin data: ${relativePath}`);
                continue;
            }
            if (!fs.existsSync(targetPath)) {
                if (entry.isDirectory()) {
                    this.mergeMissingPluginData(sourcePath, targetPath, relativePath);
                } else if (entry.isFile()) {
                    fs.copyFileSync(sourcePath, targetPath);
                }
                continue;
            }
            const targetStat = fs.lstatSync(targetPath);
            if (entry.isDirectory() && targetStat.isDirectory()) {
                this.mergeMissingPluginData(sourcePath, targetPath, relativePath);
            } else if (
                !entry.isFile() ||
                !targetStat.isFile() ||
                !fs.readFileSync(sourcePath).equals(fs.readFileSync(targetPath))
            ) {
                console.warn(`[ConfigPathManager] Preserved legacy plugin data conflict: ${relativePath}`);
            }
        }
    }

    /**
     * Set custom config directory
     */
    setCustomConfigDir(customPath) {
        if (!customPath) {
            throw new Error('Custom config path cannot be empty');
        }

        // Validate path exists and is a directory
        if (!fs.existsSync(customPath)) {
            throw new Error(`Custom config path does not exist: ${customPath}`);
        }

        const stats = fs.statSync(customPath);
        if (!stats.isDirectory()) {
            throw new Error(`Custom config path is not a directory: ${customPath}`);
        }

        // Test write permissions
        try {
            const testFile = path.join(customPath, '.write_test');
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);
        } catch (error) {
            throw new Error(`Custom config path is not writable: ${customPath}`);
        }

        // Save custom path to bootstrap settings
        this.customConfigPath = customPath;
        fs.writeFileSync(this.settingsFile, customPath, 'utf8');

        return customPath;
    }

    /**
     * Reset to default config directory
     */
    resetToDefaultConfigDir() {
        this.customConfigPath = null;
        
        // Remove bootstrap settings file
        if (fs.existsSync(this.settingsFile)) {
            fs.unlinkSync(this.settingsFile);
        }

        return this.getDefaultConfigDir();
    }

    /**
     * Ensure all required directories exist
     */
    ensureDirectoriesExist() {
        const dirs = [
            this.getConfigDir(),
            this.getUserConfigsDir(),
            this.getUserDataDir(),
            this.getPluginsDir(),
            this.getUploadsDir(),
            path.join(this.getUploadsDir(), 'animations')
        ];

        for (const dir of dirs) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }
    }

    /**
     * Migrate existing configs from app directory to persistent location
     */
    migrateFromAppDirectory() {
        const appDir = path.join(__dirname, '..');
        const oldUserConfigsDir = path.join(appDir, 'user_configs');
        const oldUserDataDir = path.join(appDir, 'user_data');
        const oldUploadsDir = path.join(appDir, 'uploads');

        const newUserConfigsDir = this.getUserConfigsDir();
        const newUserDataDir = this.getUserDataDir();
        const newUploadsDir = this.getUploadsDir();

        let migrated = false;

        // Migrate user_configs if exists and target doesn't have data yet
        if (fs.existsSync(oldUserConfigsDir)) {
            const hasNewData = fs.existsSync(newUserConfigsDir) && 
                               fs.readdirSync(newUserConfigsDir).length > 0;
            
            if (!hasNewData) {
                this.copyDirectory(oldUserConfigsDir, newUserConfigsDir);
                console.log(`✅ Migrated user_configs from ${oldUserConfigsDir} to ${newUserConfigsDir}`);
                migrated = true;
            }
        }

        // Migrate user_data if exists and target doesn't have data yet
        if (fs.existsSync(oldUserDataDir)) {
            const hasNewData = fs.existsSync(newUserDataDir) && 
                               fs.readdirSync(newUserDataDir).length > 0;
            
            if (!hasNewData) {
                this.copyDirectory(oldUserDataDir, newUserDataDir);
                console.log(`✅ Migrated user_data from ${oldUserDataDir} to ${newUserDataDir}`);
                migrated = true;
            }
        }

        // Migrate uploads if exists and target doesn't have data yet
        if (fs.existsSync(oldUploadsDir)) {
            const hasNewData = fs.existsSync(newUploadsDir) && 
                               fs.readdirSync(newUploadsDir).length > 0;
            
            if (!hasNewData) {
                this.copyDirectory(oldUploadsDir, newUploadsDir);
                console.log(`✅ Migrated uploads from ${oldUploadsDir} to ${newUploadsDir}`);
                migrated = true;
            }
        }

        return migrated;
    }

    /**
     * Copy directory recursively
     */
    copyDirectory(src, dest) {
        // Ensure destination directory exists
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }

        // Read source directory
        const entries = fs.readdirSync(src, { withFileTypes: true });

        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);

            if (entry.isDirectory()) {
                // Recursively copy subdirectory
                this.copyDirectory(srcPath, destPath);
            } else {
                // Copy file
                fs.copyFileSync(srcPath, destPath);
                
                // Preserve modification time
                const stats = fs.statSync(srcPath);
                fs.utimesSync(destPath, stats.atime, stats.mtime);
            }
        }
    }

    /**
     * Get configuration info for display/debugging
     */
    getInfo() {
        const userConfigsDir = this.getUserConfigsDir();
        const userDataDir = this.getUserDataDir();
        const uploadsDir = this.getUploadsDir();
        
        return {
            platform: os.platform(),
            homeDir: os.homedir(),
            defaultConfigDir: this.getDefaultConfigDir(),
            customConfigDir: this.customConfigPath,
            activeConfigDir: this.getConfigDir(),
            userConfigsDir: userConfigsDir,
            userDataDir: userDataDir,
            uploadsDir: uploadsDir,
            isUsingCustomPath: this.customConfigPath !== null,
            // Additional info for users
            description: 'All settings, API keys, and configurations are stored in this location.',
            surviveUpdates: true,
            note: 'This directory is OUTSIDE the application folder and will not be deleted when updating the app.'
        };
    }
}

module.exports = ConfigPathManager;
