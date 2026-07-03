const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const logger = require('./logger');

/**
 * CloudSyncEngine - Bidirectional Cloud Synchronization for User Configs
 * 
 * Synchronizes all user configurations, plugin settings, TTS profiles,
 * flows, HUD layouts, emoji mappings, sounds, and custom assets with
 * a cloud storage folder (OneDrive, Google Drive, Dropbox).
 * 
 * Key Features:
 * - Fully optional (disabled by default)
 * - No direct cloud API calls - uses local folder monitoring
 * - Bidirectional sync with timestamp-based conflict resolution
 * - File watcher for real-time synchronization
 * - Robust error handling to prevent data loss
 * - Comprehensive logging of all sync operations
 * 
 * The sync works by monitoring two directories:
 * 1. Local persistent user_configs directory (outside app folder)
 * 2. User-specified cloud sync directory (in OneDrive/Google Drive/Dropbox)
 */
class CloudSyncEngine extends EventEmitter {
    constructor(db, configPathManager = null) {
        super();
        this.db = db;
        this.isEnabled = false;
        this.isSyncing = false;
        this.cloudPath = null;
        
        // Use ConfigPathManager to get persistent local path
        if (configPathManager) {
            this.localPath = configPathManager.getUserConfigsDir();
        } else {
            // Fallback to old behavior if no configPathManager provided
            this.localPath = path.join(__dirname, '..', 'user_configs');
        }
        
        this.watcher = null;
        this.cloudWatcher = null;
        this.syncInProgress = false;
        this.syncQueue = [];
        this.lastSyncTime = null;
        this.syncStats = {
            totalSyncs: 0,
            successfulSyncs: 0,
            failedSyncs: 0,
            filesUploaded: 0,
            filesDownloaded: 0,
            conflicts: 0
        };

        // Debounce timer for file changes
        this.debounceTimers = new Map();
        this.debounceDelay = 1000; // 1 second debounce

        // Load configuration from database
        this.loadConfig();
    }

    /**
     * Load sync configuration from database
     */
    loadConfig() {
        try {
            const stmt = this.db.prepare('SELECT value FROM settings WHERE key = ?');
            const row = stmt.get('cloud_sync:config');

            if (row) {
                const config = JSON.parse(row.value);
                this.isEnabled = config.enabled || false;
                this.cloudPath = config.cloudPath || null;

                logger.info(`[CloudSync] Configuration loaded: enabled=${this.isEnabled}, cloudPath=${this.cloudPath || 'not set'}`);
            } else {
                // Initialize default config
                this.saveConfig();
                logger.info('[CloudSync] Initialized with default configuration (disabled)');
            }
        } catch (error) {
            logger.error(`[CloudSync] Failed to load config: ${error.message}`);
            this.isEnabled = false;
            this.cloudPath = null;
        }
    }

    /**
     * Save sync configuration to database
     */
    saveConfig() {
        try {
            const config = {
                enabled: this.isEnabled,
                cloudPath: this.cloudPath,
                lastSyncTime: this.lastSyncTime,
                stats: this.syncStats
            };

            const stmt = this.db.prepare(`
                INSERT INTO settings (key, value)
                VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
            `);
            stmt.run('cloud_sync:config', JSON.stringify(config));

            logger.debug('[CloudSync] Configuration saved to database');
        } catch (error) {
            logger.error(`[CloudSync] Failed to save config: ${error.message}`);
        }
    }

    /**
     * Validate cloud path
     */
    validateCloudPath(cloudPath) {
        if (!cloudPath) {
            return { valid: false, error: 'Cloud path is required' };
        }

        // Check if path exists
        if (!fs.existsSync(cloudPath)) {
            return { valid: false, error: 'Cloud path does not exist' };
        }

        // Check if path is a directory
        const stats = fs.statSync(cloudPath);
        if (!stats.isDirectory()) {
            return { valid: false, error: 'Cloud path must be a directory' };
        }

        // Check if path is writable
        try {
            const testFile = path.join(cloudPath, '.cloud_sync_test');
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);
        } catch (error) {
            return { valid: false, error: 'Cloud path is not writable' };
        }

        return { valid: true };
    }

    /**
     * Enable cloud sync with specified path
     */
    async enable(cloudPath) {
        try {
            // Validate cloud path
            const validation = this.validateCloudPath(cloudPath);
            if (!validation.valid) {
                throw new Error(validation.error);
            }

            this.cloudPath = cloudPath;
            this.isEnabled = true;

            // Save configuration
            this.saveConfig();

            // Perform initial sync
            logger.info(`[CloudSync] Enabling sync with cloud path: ${cloudPath}`);
            await this.performInitialSync();

            // Start file watchers
            this.startWatchers();

            this.emit('enabled', { cloudPath });
            logger.info('[CloudSync] Cloud sync enabled successfully');

            return { success: true };
        } catch (error) {
            logger.error(`[CloudSync] Failed to enable: ${error.message}`);
            this.isEnabled = false;
            this.cloudPath = null;
            this.saveConfig();
            throw error;
        }
    }

    /**
     * Disable cloud sync
     */
    async disable() {
        try {
            logger.info('[CloudSync] Disabling cloud sync');

            // Stop watchers
            this.stopWatchers();

            // Update configuration
            this.isEnabled = false;
            this.saveConfig();

            this.emit('disabled');
            logger.info('[CloudSync] Cloud sync disabled successfully');

            return { success: true };
        } catch (error) {
            logger.error(`[CloudSync] Failed to disable: ${error.message}`);
            throw error;
        }
    }

    /**
     * Perform initial sync on startup
     */
    async performInitialSync() {
        if (this.syncInProgress) {
            logger.warn('[CloudSync] Sync already in progress, skipping initial sync');
            return;
        }

        this.syncInProgress = true;
        logger.info('[CloudSync] Starting initial sync...');

        try {
            // Ensure cloud directory exists
            if (!fs.existsSync(this.cloudPath)) {
                fs.mkdirSync(this.cloudPath, { recursive: true });
            }

            // Get all files from both directories
            const localFiles = this.getAllFiles(this.localPath);
            const cloudFiles = this.getAllFiles(this.cloudPath);

            // Create a map of all unique file paths
            const allFiles = new Set([...localFiles, ...cloudFiles]);

            for (const file of allFiles) {
                const localFilePath = path.join(this.localPath, file);
                const cloudFilePath = path.join(this.cloudPath, file);

                const localExists = fs.existsSync(localFilePath);
                const cloudExists = fs.existsSync(cloudFilePath);

                if (localExists && !cloudExists) {
                    // File only exists locally - upload to cloud
                    await this.copyFile(localFilePath, cloudFilePath);
                    this.syncStats.filesUploaded++;
                    logger.debug(`[CloudSync] Uploaded to cloud: ${file}`);
                } else if (!localExists && cloudExists) {
                    // File only exists in cloud - download to local
                    await this.copyFile(cloudFilePath, localFilePath);
                    this.syncStats.filesDownloaded++;
                    logger.debug(`[CloudSync] Downloaded from cloud: ${file}`);
                } else if (localExists && cloudExists) {
                    // File exists in both - check which is newer
                    const localStat = fs.statSync(localFilePath);
                    const cloudStat = fs.statSync(cloudFilePath);

                    if (localStat.mtime > cloudStat.mtime) {
                        // Local is newer - upload to cloud
                        await this.copyFile(localFilePath, cloudFilePath);
                        this.syncStats.filesUploaded++;
                        this.syncStats.conflicts++;
                        logger.debug(`[CloudSync] Local is newer, uploaded to cloud: ${file}`);
                    } else if (cloudStat.mtime > localStat.mtime) {
                        // Cloud is newer - download to local
                        await this.copyFile(cloudFilePath, localFilePath);
                        this.syncStats.filesDownloaded++;
                        this.syncStats.conflicts++;
                        logger.debug(`[CloudSync] Cloud is newer, downloaded to local: ${file}`);
                    }
                    // If timestamps are equal, no action needed
                }
            }

            this.lastSyncTime = new Date();
            this.syncStats.totalSyncs++;
            this.syncStats.successfulSyncs++;
            this.saveConfig();

            logger.info(`[CloudSync] Initial sync completed: ${this.syncStats.filesUploaded} uploaded, ${this.syncStats.filesDownloaded} downloaded, ${this.syncStats.conflicts} conflicts resolved`);
            this.emit('syncComplete', this.syncStats);
        } catch (error) {
            logger.error(`[CloudSync] Initial sync failed: ${error.message}`);
            this.syncStats.failedSyncs++;
            this.emit('syncError', error);
            throw error;
        } finally {
            this.syncInProgress = false;
        }
    }

    /**
     * Get all files in a directory recursively
     */
    getAllFiles(dirPath, arrayOfFiles = [], basePath = null) {
        if (!fs.existsSync(dirPath)) {
            return arrayOfFiles;
        }

        const base = basePath || dirPath;
        const files = fs.readdirSync(dirPath);

        files.forEach(file => {
            const filePath = path.join(dirPath, file);
            
            // Skip hidden files and directories
            if (file.startsWith('.')) {
                return;
            }

            if (fs.statSync(filePath).isDirectory()) {
                arrayOfFiles = this.getAllFiles(filePath, arrayOfFiles, base);
            } else {
                const relativePath = path.relative(base, filePath);
                arrayOfFiles.push(relativePath);
            }
        });

        return arrayOfFiles;
    }

    /**
     * Copy file with error handling and directory creation
     */
    async copyFile(src, dest) {
        try {
            // Ensure destination directory exists
            const destDir = path.dirname(dest);
            if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
            }

            // Read source file
            const data = fs.readFileSync(src);

            // Write to temporary file first (atomic write)
            const tempDest = dest + '.tmp';
            fs.writeFileSync(tempDest, data);

            // Rename to final destination
            fs.renameSync(tempDest, dest);

            // Preserve modification time
            const srcStat = fs.statSync(src);
            fs.utimesSync(dest, srcStat.atime, srcStat.mtime);

            return true;
        } catch (error) {
            logger.error(`[CloudSync] Failed to copy file ${src} to ${dest}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Start file watchers for both local and cloud directories
     */
    startWatchers() {
        if (!this.isEnabled || !this.cloudPath) {
            return;
        }

        logger.info('[CloudSync] Starting file watchers...');

        // Watch local directory
        try {
            this.watcher = fs.watch(this.localPath, { recursive: true }, (eventType, filename) => {
                if (filename && !filename.startsWith('.')) {
                    this.handleLocalChange(eventType, filename);
                }
            });
            logger.debug('[CloudSync] Local directory watcher started');
        } catch (error) {
            logger.error(`[CloudSync] Failed to start local watcher: ${error.message}`);
        }

        // Watch cloud directory
        try {
            this.cloudWatcher = fs.watch(this.cloudPath, { recursive: true }, (eventType, filename) => {
                if (filename && !filename.startsWith('.')) {
                    this.handleCloudChange(eventType, filename);
                }
            });
            logger.debug('[CloudSync] Cloud directory watcher started');
        } catch (error) {
            logger.error(`[CloudSync] Failed to start cloud watcher: ${error.message}`);
        }
    }

    /**
     * Stop file watchers
     */
    stopWatchers() {
        logger.info('[CloudSync] Stopping file watchers...');

        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
            logger.debug('[CloudSync] Local watcher stopped');
        }

        if (this.cloudWatcher) {
            this.cloudWatcher.close();
            this.cloudWatcher = null;
            logger.debug('[CloudSync] Cloud watcher stopped');
        }

        // Clear debounce timers
        this.debounceTimers.forEach(timer => clearTimeout(timer));
        this.debounceTimers.clear();
    }

    /**
     * Handle local file change
     */
    handleLocalChange(eventType, filename) {
        // Clear existing debounce timer
        if (this.debounceTimers.has(`local:${filename}`)) {
            clearTimeout(this.debounceTimers.get(`local:${filename}`));
        }

        // Set new debounce timer
        const timer = setTimeout(async () => {
            this.debounceTimers.delete(`local:${filename}`);

            const localFilePath = path.join(this.localPath, filename);
            const cloudFilePath = path.join(this.cloudPath, filename);

            try {
                if (fs.existsSync(localFilePath)) {
                    // File exists - sync to cloud
                    const localStat = fs.statSync(localFilePath);
                    
                    // Check if cloud file exists and compare timestamps
                    if (fs.existsSync(cloudFilePath)) {
                        const cloudStat = fs.statSync(cloudFilePath);
                        
                        // Only sync if local is newer (avoid sync loops)
                        if (localStat.mtime > cloudStat.mtime) {
                            await this.copyFile(localFilePath, cloudFilePath);
                            this.syncStats.filesUploaded++;
                            logger.debug(`[CloudSync] Local change detected, uploaded to cloud: ${filename}`);
                            this.emit('fileUploaded', { file: filename });
                        }
                    } else {
                        // Cloud file doesn't exist - upload
                        await this.copyFile(localFilePath, cloudFilePath);
                        this.syncStats.filesUploaded++;
                        logger.debug(`[CloudSync] New local file, uploaded to cloud: ${filename}`);
                        this.emit('fileUploaded', { file: filename });
                    }
                } else {
                    // File was deleted locally - delete from cloud
                    if (fs.existsSync(cloudFilePath)) {
                        fs.unlinkSync(cloudFilePath);
                        logger.debug(`[CloudSync] Local file deleted, removed from cloud: ${filename}`);
                        this.emit('fileDeleted', { file: filename, location: 'cloud' });
                    }
                }
            } catch (error) {
                logger.error(`[CloudSync] Error handling local change for ${filename}: ${error.message}`);
                this.emit('syncError', { file: filename, error: error.message });
            }
        }, this.debounceDelay);

        this.debounceTimers.set(`local:${filename}`, timer);
    }

    /**
     * Handle cloud file change
     */
    handleCloudChange(eventType, filename) {
        // Clear existing debounce timer
        if (this.debounceTimers.has(`cloud:${filename}`)) {
            clearTimeout(this.debounceTimers.get(`cloud:${filename}`));
        }

        // Set new debounce timer
        const timer = setTimeout(async () => {
            this.debounceTimers.delete(`cloud:${filename}`);

            const localFilePath = path.join(this.localPath, filename);
            const cloudFilePath = path.join(this.cloudPath, filename);

            try {
                if (fs.existsSync(cloudFilePath)) {
                    // File exists in cloud - sync to local
                    const cloudStat = fs.statSync(cloudFilePath);
                    
                    // Check if local file exists and compare timestamps
                    if (fs.existsSync(localFilePath)) {
                        const localStat = fs.statSync(localFilePath);
                        
                        // Only sync if cloud is newer (avoid sync loops)
                        if (cloudStat.mtime > localStat.mtime) {
                            await this.copyFile(cloudFilePath, localFilePath);
                            this.syncStats.filesDownloaded++;
                            logger.debug(`[CloudSync] Cloud change detected, downloaded to local: ${filename}`);
                            this.emit('fileDownloaded', { file: filename });
                        }
                    } else {
                        // Local file doesn't exist - download
                        await this.copyFile(cloudFilePath, localFilePath);
                        this.syncStats.filesDownloaded++;
                        logger.debug(`[CloudSync] New cloud file, downloaded to local: ${filename}`);
                        this.emit('fileDownloaded', { file: filename });
                    }
                } else {
                    // File was deleted from cloud - delete locally
                    if (fs.existsSync(localFilePath)) {
                        fs.unlinkSync(localFilePath);
                        logger.debug(`[CloudSync] Cloud file deleted, removed from local: ${filename}`);
                        this.emit('fileDeleted', { file: filename, location: 'local' });
                    }
                }
            } catch (error) {
                logger.error(`[CloudSync] Error handling cloud change for ${filename}: ${error.message}`);
                this.emit('syncError', { file: filename, error: error.message });
            }
        }, this.debounceDelay);

        this.debounceTimers.set(`cloud:${filename}`, timer);
    }

    /**
     * Get current sync status
     */
    getStatus() {
        return {
            enabled: this.isEnabled,
            cloudPath: this.cloudPath,
            syncInProgress: this.syncInProgress,
            lastSyncTime: this.lastSyncTime,
            stats: this.syncStats,
            watchers: {
                local: this.watcher !== null,
                cloud: this.cloudWatcher !== null
            }
        };
    }

    /**
     * Manually trigger a full sync
     */
    async manualSync() {
        if (!this.isEnabled) {
            throw new Error('Cloud sync is not enabled');
        }

        if (this.syncInProgress) {
            throw new Error('Sync already in progress');
        }

        logger.info('[CloudSync] Manual sync triggered');
        await this.performInitialSync();
        return this.getStatus();
    }

    /**
     * Initialize sync engine on startup
     */
    async initialize() {
        logger.info('[CloudSync] Initializing cloud sync engine...');

        if (this.isEnabled && this.cloudPath) {
            try {
                // Validate cloud path is still valid
                const validation = this.validateCloudPath(this.cloudPath);
                if (!validation.valid) {
                    logger.warn(`[CloudSync] Cloud path no longer valid: ${validation.error}`);
                    logger.warn('[CloudSync] Cloud sync will be disabled');
                    this.isEnabled = false;
                    this.saveConfig();
                    return;
                }

                // Perform initial sync
                await this.performInitialSync();

                // Start watchers
                this.startWatchers();

                logger.info('[CloudSync] Cloud sync initialized and active');
            } catch (error) {
                logger.error(`[CloudSync] Failed to initialize: ${error.message}`);
                logger.warn('[CloudSync] Cloud sync will be disabled');
                this.isEnabled = false;
                this.saveConfig();
            }
        } else {
            logger.info('[CloudSync] Cloud sync is disabled');
        }
    }

    /**
     * Cleanup on shutdown
     */
    async shutdown() {
        logger.info('[CloudSync] Shutting down cloud sync engine...');
        this.stopWatchers();
        this.saveConfig();
        logger.info('[CloudSync] Cloud sync engine shut down');
    }
}

module.exports = CloudSyncEngine;
