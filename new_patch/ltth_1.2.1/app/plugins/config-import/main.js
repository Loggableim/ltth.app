/**
 * Config Import Plugin
 * 
 * Allows users to import settings from old installation paths
 * where config files were stored directly in the installation directory.
 * 
 * Features:
 * - Browse and select old installation path
 * - Validate path for config files
 * - Import user_configs, user_data, uploads, and plugins
 * - Conflict detection and handling
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

class ConfigImportPlugin {
    constructor(api) {
        this.api = api;
    }

    async init() {
        this.api.log('📥 Initializing Config Import Plugin...', 'info');

        try {
            // Register API routes
            this.registerRoutes();

            this.api.log('✅ Config Import Plugin initialized successfully', 'info');
        } catch (error) {
            this.api.log(`❌ Error initializing Config Import Plugin: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Register API routes
     */
    registerRoutes() {
        // Serve UI
        this.api.registerRoute('GET', '/config-import/ui', (req, res) => {
            res.sendFile(path.join(__dirname, 'ui.html'));
        });

        // Validate path endpoint
        this.api.registerRoute('POST', '/api/config-import/validate', async (req, res) => {
            try {
                const { importPath } = req.body;

                if (!importPath) {
                    return res.status(400).json({
                        success: false,
                        error: 'Import path is required'
                    });
                }

                // Sanitize and validate input path
                const sanitizedPath = this.sanitizePath(importPath);
                if (!sanitizedPath) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid path format'
                    });
                }

                const validation = this.validateImportPath(sanitizedPath);
                res.json(validation);
            } catch (error) {
                this.api.log(`Validation error: ${error.message}`, 'error');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Import settings endpoint
        this.api.registerRoute('POST', '/api/config-import/import', async (req, res) => {
            try {
                const { importPath, profileName } = req.body;

                if (!importPath) {
                    return res.status(400).json({
                        success: false,
                        error: 'Import path is required'
                    });
                }

                // Sanitize and validate input path
                const sanitizedPath = this.sanitizePath(importPath);
                if (!sanitizedPath) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid path format'
                    });
                }

                // Validate first
                const validation = this.validateImportPath(sanitizedPath);
                if (!validation.valid) {
                    return res.status(400).json({
                        success: false,
                        error: validation.error || 'Invalid import path'
                    });
                }

                // Sanitize profile name if provided
                const sanitizedProfileName = this.sanitizeProfileName(profileName);

                // Use actualPath from validation if it detected a subdirectory
                const actualImportPath = validation.actualPath || sanitizedPath;

                // Perform import
                const result = await this.importSettings(actualImportPath, sanitizedProfileName);
                res.json(result);
            } catch (error) {
                this.api.log(`Import error: ${error.message}`, 'error');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.api.log('Registered Config Import routes', 'info');
    }

    /**
     * Sanitize and validate path input to prevent directory traversal attacks
     */
    sanitizePath(inputPath) {
        try {
            if (typeof inputPath !== 'string') {
                return null;
            }

            // Trim whitespace
            let cleanPath = inputPath.trim();

            // Check for empty path
            if (!cleanPath) {
                return null;
            }

            // Resolve to absolute path to prevent directory traversal
            const absolutePath = path.resolve(cleanPath);

            // Check for directory traversal attempts
            if (/\.\.[\/\\]/.test(cleanPath)) {
                this.api.log(`Directory traversal attempt detected: ${cleanPath}`, 'warn');
                return null;
            }

            // Platform-specific invalid character checks
            const platform = os.platform();
            
            if (platform === 'win32') {
                // On Windows, validate path format and check for invalid characters
                // Valid Windows path examples: C:\path, D:\path\to\folder, \\network\share
                // Invalid characters in Windows paths: < > " | ? *
                
                if (/[<>"|?*]/.test(cleanPath)) {
                    this.api.log(`Invalid path characters detected: ${cleanPath}`, 'warn');
                    return null;
                }
                
                // Validate colon usage in Windows paths
                // Colons are only valid in two contexts:
                // 1. After a single drive letter (e.g., C:)
                // 2. In UNC paths (which don't have colons)
                
                // Check if path has any colons
                const colonCount = (cleanPath.match(/:/g) || []).length;
                
                if (colonCount > 0) {
                    // Should have exactly one colon, and it should be after a drive letter
                    if (colonCount > 1) {
                        this.api.log(`Multiple colons in path not allowed: ${cleanPath}`, 'warn');
                        return null;
                    }
                    
                    // Colon should be at position 1 (after drive letter) like "C:"
                    const colonPosition = cleanPath.indexOf(':');
                    if (colonPosition !== 1) {
                        this.api.log(`Colon must follow drive letter: ${cleanPath}`, 'warn');
                        return null;
                    }
                    
                    // Character before colon should be a letter A-Z or a-z
                    const driveChar = cleanPath.charAt(0);
                    if (!/[A-Za-z]/.test(driveChar)) {
                        this.api.log(`Invalid drive letter: ${cleanPath}`, 'warn');
                        return null;
                    }
                }
            } else {
                // On Unix-like systems (Linux, macOS), check for invalid characters
                // Colon is valid in paths on Unix-like systems
                if (/[<>"|?*]/.test(cleanPath)) {
                    this.api.log(`Invalid path characters detected: ${cleanPath}`, 'warn');
                    return null;
                }
            }

            return absolutePath;
        } catch (error) {
            this.api.log(`Path sanitization error: ${error.message}`, 'error');
            return null;
        }
    }

    /**
     * Sanitize profile name to ensure it's safe for filesystem use
     * @param {string} profileName - Raw profile name from user input
     * @returns {string} Sanitized profile name
     */
    sanitizeProfileName(profileName) {
        let sanitized = 'imported-config';
        
        if (profileName && typeof profileName === 'string') {
            // Remove invalid characters from profile name (handle consecutive invalid chars)
            sanitized = profileName.trim()
                .replace(/[^a-zA-Z0-9_-]+/g, '-')
                .replace(/^-+|-+$/g, '')
                .substring(0, 50);
            
            if (!sanitized) {
                sanitized = 'imported-config';
            }
        }
        
        return sanitized;
    }

    /**
     * Validate import path for configuration files
     * Supports both new structure (user_configs/, user_data/, uploads/, plugins/)
     * and legacy structure (database.db, data/)
     * Also searches for app/ subdirectory if config files aren't found in root
     */
    validateImportPath(importPath) {
        try {
            // Check if path exists
            if (!fs.existsSync(importPath)) {
                return {
                    valid: false,
                    error: 'Path does not exist'
                };
            }

            // Check if it's a directory
            const stats = fs.statSync(importPath);
            if (!stats.isDirectory()) {
                return {
                    valid: false,
                    error: 'Path is not a directory'
                };
            }

            // Try to validate the path directly first
            let result = this.scanPathForConfigs(importPath);
            
            // If no config found in root, search for app/ subdirectory
            if (!result.hasConfig) {
                const appPath = path.join(importPath, 'app');
                if (fs.existsSync(appPath) && fs.statSync(appPath).isDirectory()) {
                    this.api.log('No config in root, checking app/ subdirectory', 'info');
                    const appResult = this.scanPathForConfigs(appPath);
                    if (appResult.hasConfig) {
                        result = appResult;
                        result.actualPath = appPath;
                        result.detectedSubdirectory = 'app';
                    }
                }
            }
            
            if (!result.hasConfig) {
                return {
                    valid: false,
                    error: 'No configuration files found in the specified path'
                };
            }
            
            return {
                valid: true,
                findings: result.findings,
                actualPath: result.actualPath || importPath,
                detectedSubdirectory: result.detectedSubdirectory
            };
        } catch (error) {
            this.api.log(`Validation error: ${error.message}`, 'error');
            return {
                valid: false,
                error: error.message
            };
        }
    }

    /**
     * Scan a specific path for configuration files
     */
    scanPathForConfigs(scanPath) {
        // Look for config directories/files
        const findings = {
            userConfigs: false,
            userData: false,
            uploads: false,
            plugins: false,
            // Legacy format support
            legacyDatabase: false,
            legacyData: false,
            files: []
        };

        // Check for user_configs directory (new structure)
        const userConfigsPath = path.join(scanPath, 'user_configs');
        if (fs.existsSync(userConfigsPath) && fs.statSync(userConfigsPath).isDirectory()) {
            const files = fs.readdirSync(userConfigsPath);
            if (files.length > 0) {
                findings.userConfigs = true;
                findings.files.push(...files.map(f => `user_configs/${f}`));
            }
        }

        // Check for user_data directory (new structure)
        const userDataPath = path.join(scanPath, 'user_data');
        if (fs.existsSync(userDataPath) && fs.statSync(userDataPath).isDirectory()) {
            const files = fs.readdirSync(userDataPath);
            if (files.length > 0) {
                findings.userData = true;
                findings.files.push(...files.map(f => `user_data/${f}`));
            }
        }

        // Check for uploads directory
        const uploadsPath = path.join(scanPath, 'uploads');
        if (fs.existsSync(uploadsPath) && fs.statSync(uploadsPath).isDirectory()) {
            const files = fs.readdirSync(uploadsPath);
            if (files.length > 0) {
                findings.uploads = true;
                findings.files.push(...files.map(f => `uploads/${f}`));
            }
        }

        // Check for plugins directory
        const pluginsPath = path.join(scanPath, 'plugins');
        if (fs.existsSync(pluginsPath) && fs.statSync(pluginsPath).isDirectory()) {
            const pluginDirs = fs.readdirSync(pluginsPath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory());
            
            // List plugin data files
            let hasPluginData = false;
            for (const pluginDir of pluginDirs) {
                const dataPath = path.join(pluginsPath, pluginDir.name, 'data');
                if (fs.existsSync(dataPath) && fs.statSync(dataPath).isDirectory()) {
                    const dataFiles = fs.readdirSync(dataPath);
                    if (dataFiles.length > 0) {
                        hasPluginData = true;
                        findings.files.push(...dataFiles.map(f => `plugins/${pluginDir.name}/data/${f}`));
                    }
                }
            }
            findings.plugins = hasPluginData;
        }

        // Check for legacy database.db file (older versions stored it directly in installation root)
        const legacyDbPath = path.join(scanPath, 'database.db');
        if (fs.existsSync(legacyDbPath) && fs.statSync(legacyDbPath).isFile()) {
            findings.legacyDatabase = true;
            findings.files.push('database.db');
            // Also check for WAL and SHM files
            const walPath = path.join(scanPath, 'database.db-wal');
            const shmPath = path.join(scanPath, 'database.db-shm');
            if (fs.existsSync(walPath)) {
                findings.files.push('database.db-wal');
            }
            if (fs.existsSync(shmPath)) {
                findings.files.push('database.db-shm');
            }
        }

        // Check for legacy data directory (some older versions)
        const legacyDataPath = path.join(scanPath, 'data');
        if (fs.existsSync(legacyDataPath) && fs.statSync(legacyDataPath).isDirectory()) {
            const files = fs.readdirSync(legacyDataPath);
            if (files.length > 0) {
                findings.legacyData = true;
                findings.files.push(...files.map(f => `data/${f}`));
            }
        }

        // Check if any config files were found (new or legacy)
        const hasNewStructure = findings.userConfigs || findings.userData || findings.uploads || findings.plugins;
        const hasLegacyStructure = findings.legacyDatabase || findings.legacyData;
        const hasConfig = hasNewStructure || hasLegacyStructure;
        
        return {
            findings,
            hasConfig
        };
    }

    /**
     * Import settings from old installation path
     * Supports both new structure (user_configs/, user_data/, uploads/, plugins/)
     * and legacy structure (database.db, data/)
     * @param {string} importPath - Path to import from
     * @param {string} profileName - Name for the imported profile (for legacy database)
     */
    async importSettings(importPath, profileName = 'imported-config') {
        try {
            const configPathManager = this.getConfigPathManager();
            const results = {
                success: true,
                imported: {
                    userConfigs: 0,
                    userData: 0,
                    uploads: 0,
                    plugins: 0,
                    legacyDatabase: 0,
                    legacyData: 0
                },
                errors: [],
                warnings: [],
                logs: [],
                profileName: profileName
            };

            // Add log helper
            const addLog = (message, level = 'info') => {
                results.logs.push({ message, level, timestamp: new Date().toISOString() });
                this.api.log(message, level);
            };

            addLog('Starting config import process', 'info');
            addLog(`Import path: ${importPath}`, 'debug');
            addLog(`Profile name: ${profileName}`, 'debug');
            addLog(`Destination config directory: ${configPathManager.getConfigDir()}`, 'debug');
            addLog(`Destination user_configs directory: ${configPathManager.getUserConfigsDir()}`, 'debug');

            // Import user_configs (new structure) - handle .db files specially
            const userConfigsSource = path.join(importPath, 'user_configs');
            const userConfigsDest = configPathManager.getUserConfigsDir();
            
            if (fs.existsSync(userConfigsSource)) {
                try {
                    addLog('Importing user_configs directory...', 'info');
                    const files = fs.readdirSync(userConfigsSource);
                    let dbCount = 0;
                    let otherCount = 0;
                    
                    for (const file of files) {
                        const srcPath = path.join(userConfigsSource, file);
                        let destPath = path.join(userConfigsDest, file);
                        
                        // Skip WAL and SHM files - they'll be handled with their database
                        if (file.endsWith('-wal') || file.endsWith('-shm')) {
                            continue;
                        }
                        
                        // Handle database files specially
                        if (file.endsWith('.db')) {
                            addLog(`Importing database file: ${file}`, 'debug');
                            
                            // Check for conflicts and rename if necessary
                            let finalFile = file;
                            if (fs.existsSync(destPath)) {
                                // File exists - create unique name with timestamp
                                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                                const baseName = file.replace('.db', '');
                                finalFile = `${baseName}-imported-${timestamp}.db`;
                                destPath = path.join(userConfigsDest, finalFile);
                                
                                addLog(`Profile ${file} already exists, renaming to ${finalFile}`, 'warn');
                                results.warnings.push(`Profile ${baseName} already exists, imported as ${finalFile.replace('.db', '')}`);
                            }
                            
                            addLog(`  Source: ${srcPath}`, 'debug');
                            addLog(`  Destination: ${destPath}`, 'debug');
                            const copyResult = this.safeCopyDatabase(srcPath, destPath);
                            
                            if (copyResult.success) {
                                dbCount += copyResult.filesCopied;
                                addLog(`Successfully imported ${file} to ${destPath} (${copyResult.filesCopied} files)`, 'info');
                            } else {
                                results.errors.push(`Failed to import ${file}: ${copyResult.errors.join(', ')}`);
                                addLog(`Failed to import ${file}: ${copyResult.errors.join(', ')}`, 'error');
                            }
                            
                            // Collect warnings
                            if (copyResult.warnings && copyResult.warnings.length > 0) {
                                results.warnings.push(...copyResult.warnings.map(w => `${file}: ${w}`));
                                copyResult.warnings.forEach(w => addLog(`Warning for ${file}: ${w}`, 'warn'));
                            }
                        } else {
                            // Copy non-database files normally
                            try {
                                fs.copyFileSync(srcPath, destPath);
                                otherCount++;
                            } catch (error) {
                                results.errors.push(`Failed to copy ${file}: ${error.message}`);
                                addLog(`Failed to copy ${file}: ${error.message}`, 'error');
                            }
                        }
                    }
                    
                    results.imported.userConfigs = dbCount + otherCount;
                    addLog(`Imported ${results.imported.userConfigs} files from user_configs (${dbCount} database files, ${otherCount} other files)`, 'info');
                } catch (error) {
                    results.errors.push(`user_configs: ${error.message}`);
                    addLog(`Error importing user_configs: ${error.message}`, 'error');
                }
            }

            // Import user_data (new structure)
            const userDataSource = path.join(importPath, 'user_data');
            const userDataDest = configPathManager.getUserDataDir();
            
            if (fs.existsSync(userDataSource)) {
                try {
                    addLog('Importing user_data directory...', 'info');
                    const count = this.copyDirectoryContents(userDataSource, userDataDest);
                    results.imported.userData = count;
                    addLog(`Imported ${count} files from user_data`, 'info');
                } catch (error) {
                    results.errors.push(`user_data: ${error.message}`);
                    addLog(`Error importing user_data: ${error.message}`, 'error');
                }
            }

            // Import uploads
            const uploadsSource = path.join(importPath, 'uploads');
            const uploadsDest = configPathManager.getUploadsDir();
            
            if (fs.existsSync(uploadsSource)) {
                try {
                    addLog('Importing uploads directory...', 'info');
                    const count = this.copyDirectoryContents(uploadsSource, uploadsDest);
                    results.imported.uploads = count;
                    addLog(`Imported ${count} files from uploads`, 'info');
                } catch (error) {
                    results.errors.push(`uploads: ${error.message}`);
                    addLog(`Error importing uploads: ${error.message}`, 'error');
                }
            }

            // Import plugins data
            const pluginsSource = path.join(importPath, 'plugins');
            if (fs.existsSync(pluginsSource) && fs.statSync(pluginsSource).isDirectory()) {
                try {
                    addLog('Importing plugins data...', 'info');
                    const pluginDirs = fs.readdirSync(pluginsSource, { withFileTypes: true })
                        .filter(dirent => dirent.isDirectory());
                    
                    let pluginFileCount = 0;
                    for (const pluginDir of pluginDirs) {
                        const pluginDataSource = path.join(pluginsSource, pluginDir.name, 'data');
                        if (fs.existsSync(pluginDataSource) && fs.statSync(pluginDataSource).isDirectory()) {
                            addLog(`Importing data for plugin: ${pluginDir.name}`, 'debug');
                            
                            // Use getPluginDataDir to get the correct destination path
                            const pluginDataDest = configPathManager.getPluginDataDir(pluginDir.name);
                            
                            // Ensure destination directory exists
                            if (!fs.existsSync(pluginDataDest)) {
                                fs.mkdirSync(pluginDataDest, { recursive: true });
                            }
                            
                            // Handle database files in plugin data specially
                            const files = fs.readdirSync(pluginDataSource);
                            let pluginDbCount = 0;
                            let pluginOtherCount = 0;
                            
                            for (const file of files) {
                                const srcPath = path.join(pluginDataSource, file);
                                const destPath = path.join(pluginDataDest, file);
                                
                                // Skip WAL and SHM files
                                if (file.endsWith('-wal') || file.endsWith('-shm')) {
                                    continue;
                                }
                                
                                if (file.endsWith('.db')) {
                                    // Handle database files
                                    const copyResult = this.safeCopyDatabase(srcPath, destPath);
                                    
                                    if (copyResult.success) {
                                        pluginDbCount += copyResult.filesCopied;
                                        addLog(`Imported ${pluginDir.name}/${file} (${copyResult.filesCopied} files)`, 'info');
                                    } else {
                                        results.errors.push(`Failed to import plugin ${pluginDir.name}/${file}: ${copyResult.errors.join(', ')}`);
                                        addLog(`Failed to import ${pluginDir.name}/${file}: ${copyResult.errors.join(', ')}`, 'error');
                                    }
                                    
                                    if (copyResult.warnings && copyResult.warnings.length > 0) {
                                        results.warnings.push(...copyResult.warnings.map(w => `${pluginDir.name}/${file}: ${w}`));
                                        copyResult.warnings.forEach(w => addLog(`Warning for ${pluginDir.name}/${file}: ${w}`, 'warn'));
                                    }
                                } else {
                                    // Copy non-database files normally
                                    try {
                                        if (fs.statSync(srcPath).isFile()) {
                                            fs.copyFileSync(srcPath, destPath);
                                            pluginOtherCount++;
                                        }
                                    } catch (error) {
                                        results.errors.push(`Failed to copy ${pluginDir.name}/${file}: ${error.message}`);
                                        addLog(`Failed to copy ${pluginDir.name}/${file}: ${error.message}`, 'error');
                                    }
                                }
                            }
                            
                            const totalFiles = pluginDbCount + pluginOtherCount;
                            pluginFileCount += totalFiles;
                            addLog(`Imported ${totalFiles} files from plugin ${pluginDir.name}`, 'info');
                        }
                    }
                    
                    results.imported.plugins = pluginFileCount;
                    if (pluginFileCount > 0) {
                        addLog(`Total plugin files imported: ${pluginFileCount}`, 'info');
                    }
                } catch (error) {
                    results.errors.push(`plugins: ${error.message}`);
                    addLog(`Error importing plugins: ${error.message}`, 'error');
                }
            }

            // Import legacy database.db (older versions stored it directly in installation root)
            const legacyDbPath = path.join(importPath, 'database.db');
            if (fs.existsSync(legacyDbPath)) {
                try {
                    addLog('Importing legacy database.db...', 'info');
                    
                    // Use the provided profile name instead of 'default'
                    let actualProfileName = profileName;
                    let destDbPath = path.join(userConfigsDest, `${actualProfileName}.db`);
                    
                    // Check if profile already exists
                    if (fs.existsSync(destDbPath)) {
                        // Add a readable timestamp to avoid conflicts
                        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                        actualProfileName = `${profileName}-${timestamp}`;
                        destDbPath = path.join(userConfigsDest, `${actualProfileName}.db`);
                        
                        addLog(`Profile ${profileName}.db already exists, using ${actualProfileName}.db instead`, 'warn');
                        results.warnings.push(`Profile ${profileName}.db already exists, renamed to ${actualProfileName}.db`);
                        results.profileName = actualProfileName;
                    }
                    
                    // Use safe database copy method
                    const copyResult = this.safeCopyDatabase(legacyDbPath, destDbPath);
                    
                    if (copyResult.success) {
                        results.imported.legacyDatabase = copyResult.filesCopied;
                        addLog(`Imported legacy database.db as ${actualProfileName}.db (${copyResult.filesCopied} files)`, 'info');
                    } else {
                        results.errors.push(`Failed to import legacy database.db: ${copyResult.errors.join(', ')}`);
                        addLog(`Failed to import legacy database.db: ${copyResult.errors.join(', ')}`, 'error');
                    }
                    
                    // Collect warnings
                    if (copyResult.warnings && copyResult.warnings.length > 0) {
                        results.warnings.push(...copyResult.warnings.map(w => `Legacy database: ${w}`));
                        copyResult.warnings.forEach(w => addLog(`Legacy database warning: ${w}`, 'warn'));
                    }
                } catch (error) {
                    results.errors.push(`legacy database.db: ${error.message}`);
                    addLog(`Error importing legacy database.db: ${error.message}`, 'error');
                }
            }

            // Import legacy data directory (some older versions)
            const legacyDataPath = path.join(importPath, 'data');
            if (fs.existsSync(legacyDataPath) && fs.statSync(legacyDataPath).isDirectory()) {
                try {
                    addLog('Importing legacy data directory...', 'info');
                    const count = this.copyDirectoryContents(legacyDataPath, userDataDest);
                    results.imported.legacyData = count;
                    addLog(`Imported ${count} files from legacy data directory`, 'info');
                } catch (error) {
                    results.errors.push(`legacy data: ${error.message}`);
                    addLog(`Error importing legacy data: ${error.message}`, 'error');
                }
            }

            // Check if anything was imported
            const totalImported = results.imported.userConfigs + 
                                 results.imported.userData + 
                                 results.imported.uploads +
                                 results.imported.plugins +
                                 results.imported.legacyDatabase +
                                 results.imported.legacyData;

            if (totalImported === 0) {
                results.success = false;
                results.errors.push('No files were imported');
                addLog('Import failed: No files were imported', 'error');
            } else {
                addLog(`Import completed successfully: ${totalImported} total files imported`, 'info');
            }
            
            // Summary
            addLog('=== Import Summary ===', 'info');
            addLog(`User configs: ${results.imported.userConfigs}`, 'info');
            addLog(`User data: ${results.imported.userData}`, 'info');
            addLog(`Uploads: ${results.imported.uploads}`, 'info');
            addLog(`Plugins: ${results.imported.plugins}`, 'info');
            addLog(`Legacy database: ${results.imported.legacyDatabase}`, 'info');
            addLog(`Legacy data: ${results.imported.legacyData}`, 'info');
            addLog(`Errors: ${results.errors.length}`, results.errors.length > 0 ? 'warn' : 'info');
            addLog(`Warnings: ${results.warnings.length}`, results.warnings.length > 0 ? 'warn' : 'info');

            return results;
        } catch (error) {
            this.api.log(`Import error: ${error.message}`, 'error');
            return {
                success: false,
                error: error.message,
                errors: [error.message],
                warnings: [],
                logs: [{ message: `Fatal error: ${error.message}`, level: 'error', timestamp: new Date().toISOString() }]
            };
        }
    }

    /**
     * Validate SQLite database file integrity
     * @param {string} dbPath - Path to database file
     * @returns {Object} Validation result with success flag and error message
     */
    validateDatabaseFile(dbPath) {
        try {
            // Check if file exists
            if (!fs.existsSync(dbPath)) {
                return { success: false, error: 'Database file does not exist' };
            }

            // Try to open and validate the database
            let db;
            try {
                db = new Database(dbPath, { readonly: true, fileMustExist: true });
                
                // Check database integrity
                const integrityResult = db.pragma('integrity_check');
                
                // integrity_check returns array of results, 'ok' means healthy
                const isHealthy = integrityResult.length === 1 && integrityResult[0].integrity_check === 'ok';
                
                db.close();
                
                if (!isHealthy) {
                    return { 
                        success: false, 
                        error: 'Database integrity check failed: ' + JSON.stringify(integrityResult) 
                    };
                }
                
                return { success: true };
            } catch (dbError) {
                if (db) {
                    try { db.close(); } catch (e) { /* ignore */ }
                }
                return { 
                    success: false, 
                    error: `Database validation failed: ${dbError.message}` 
                };
            }
        } catch (error) {
            return { 
                success: false, 
                error: `Validation error: ${error.message}` 
            };
        }
    }

    /**
     * Safely copy SQLite database with WAL checkpoint
     * @param {string} srcDbPath - Source database path
     * @param {string} destDbPath - Destination database path
     * @returns {Object} Result with success flag, warnings, and error messages
     */
    safeCopyDatabase(srcDbPath, destDbPath) {
        const result = {
            success: false,
            filesCopied: 0,
            warnings: [],
            errors: []
        };

        try {
            // First, validate source database
            this.api.log(`Validating source database: ${srcDbPath}`, 'debug');
            const validation = this.validateDatabaseFile(srcDbPath);
            
            if (!validation.success) {
                result.errors.push(`Source database validation failed: ${validation.error}`);
                this.api.log(`Database validation failed: ${validation.error}`, 'error');
                return result;
            }

            // Try to checkpoint WAL file if database is not locked
            const walPath = `${srcDbPath}-wal`;
            const shmPath = `${srcDbPath}-shm`;
            
            if (fs.existsSync(walPath) || fs.existsSync(shmPath)) {
                this.api.log('WAL/SHM files detected, attempting checkpoint...', 'debug');
                
                try {
                    // First try readonly access to check if database is accessible
                    let db;
                    try {
                        db = new Database(srcDbPath, { readonly: true });
                        db.close();
                    } catch (accessError) {
                        this.api.log(`Database not accessible for checkpoint (may be locked): ${accessError.message}`, 'warn');
                        result.warnings.push(
                            'Database appears to be locked - checkpoint skipped. Will copy WAL files as-is.'
                        );
                        // Skip checkpoint attempt but continue with file copy below
                        throw new Error('SKIP_CHECKPOINT');
                    }
                    
                    // Now try to open for checkpoint
                    db = new Database(srcDbPath, { readonly: false });
                    
                    try {
                        // Checkpoint WAL to merge changes into main database
                        db.pragma('wal_checkpoint(TRUNCATE)');
                        this.api.log('WAL checkpoint successful', 'info');
                    } catch (checkpointError) {
                        // Checkpoint might fail if database is locked by another process
                        this.api.log(`WAL checkpoint warning: ${checkpointError.message}`, 'warn');
                        result.warnings.push(
                            'Could not checkpoint WAL file - database may be in use by another application. ' +
                            'WAL files will be copied as-is.'
                        );
                    } finally {
                        db.close();
                    }
                } catch (openError) {
                    // If we can't open the database or got SKIP_CHECKPOINT, just continue with copy
                    if (openError.message !== 'SKIP_CHECKPOINT') {
                        this.api.log(`Could not open database for checkpoint: ${openError.message}`, 'warn');
                        result.warnings.push(
                            'Database checkpoint failed - WAL files will be copied as-is.'
                        );
                    }
                    // Continue anyway - we'll copy the files including WAL/SHM
                }
            }

            // Ensure destination directory exists
            const destDir = path.dirname(destDbPath);
            if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
            }

            // Copy the main database file
            this.api.log(`Copying database: ${srcDbPath} -> ${destDbPath}`, 'debug');
            fs.copyFileSync(srcDbPath, destDbPath);
            result.filesCopied++;

            // Copy WAL file if it still exists after checkpoint attempt
            if (fs.existsSync(walPath)) {
                try {
                    this.api.log('Copying WAL file', 'debug');
                    fs.copyFileSync(walPath, `${destDbPath}-wal`);
                    result.filesCopied++;
                } catch (walError) {
                    // WAL copy failure is not critical if checkpoint succeeded
                    this.api.log(`Could not copy WAL file (non-critical): ${walError.message}`, 'warn');
                    result.warnings.push('WAL file could not be copied, but database should be intact');
                }
            }

            // Copy SHM file if it exists
            // Note: SHM files can be locked on Windows even when DB is closed
            if (fs.existsSync(shmPath)) {
                try {
                    this.api.log('Copying SHM file', 'debug');
                    fs.copyFileSync(shmPath, `${destDbPath}-shm`);
                    result.filesCopied++;
                } catch (shmError) {
                    // SHM copy failure is not critical - SQLite will recreate it
                    this.api.log(`Could not copy SHM file (non-critical): ${shmError.message}`, 'debug');
                    // Don't add warning for SHM - it's expected to be locked on Windows
                    // SQLite will recreate this file automatically when the database is opened
                }
            }

            // Validate destination database
            this.api.log('Validating copied database', 'debug');
            const destValidation = this.validateDatabaseFile(destDbPath);
            
            if (!destValidation.success) {
                result.errors.push(`Copied database validation failed: ${destValidation.error}`);
                this.api.log(`Copied database validation failed: ${destValidation.error}`, 'error');
                
                // Clean up corrupted copy
                try {
                    if (fs.existsSync(destDbPath)) fs.unlinkSync(destDbPath);
                    if (fs.existsSync(`${destDbPath}-wal`)) fs.unlinkSync(`${destDbPath}-wal`);
                    if (fs.existsSync(`${destDbPath}-shm`)) fs.unlinkSync(`${destDbPath}-shm`);
                } catch (cleanupError) {
                    this.api.log(`Cleanup error: ${cleanupError.message}`, 'warn');
                }
                
                return result;
            }

            result.success = true;
            this.api.log(`Database copied successfully: ${result.filesCopied} files`, 'info');
            
        } catch (error) {
            result.errors.push(`Database copy failed: ${error.message}`);
            this.api.log(`Database copy error: ${error.message}`, 'error');
        }

        return result;
    }

    /**
     * Copy directory contents recursively
     */
    copyDirectoryContents(src, dest) {
        // Ensure destination directory exists
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }

        let fileCount = 0;

        // Read source directory
        const entries = fs.readdirSync(src, { withFileTypes: true });

        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);

            if (entry.isDirectory()) {
                // Recursively copy subdirectory
                fileCount += this.copyDirectoryContents(srcPath, destPath);
            } else {
                try {
                    // Skip locked SHM files - they're not critical
                    // SQLite will recreate them when the database is opened
                    if (entry.name.endsWith('.db-shm')) {
                        try {
                            // Try to copy, but don't fail if locked
                            const stats = fs.statSync(srcPath);
                            
                            // Don't use COPYFILE_FICLONE for SHM files as it may fail on NTFS
                            fs.copyFileSync(srcPath, destPath);
                            fs.utimesSync(destPath, stats.atime, stats.mtime);
                            fileCount++;
                        } catch (shmError) {
                            // SHM files can be locked on Windows - this is expected and non-critical
                            this.api.log(`Skipping locked SHM file (non-critical): ${entry.name}`, 'debug');
                            // Don't count as error
                        }
                        continue;
                    }
                    
                    // Get stats before copying for efficiency
                    const stats = fs.statSync(srcPath);
                    
                    // Copy file - try with CoW optimization on supported filesystems
                    try {
                        fs.copyFileSync(srcPath, destPath, fs.constants.COPYFILE_FICLONE);
                    } catch (cowError) {
                        // If CoW fails (e.g., on NTFS), fall back to regular copy
                        fs.copyFileSync(srcPath, destPath);
                    }
                    
                    // Preserve modification time
                    fs.utimesSync(destPath, stats.atime, stats.mtime);
                    
                    fileCount++;
                } catch (copyError) {
                    // Log error but continue with other files
                    this.api.log(`Failed to copy ${srcPath}: ${copyError.message}`, 'warn');
                }
            }
        }

        return fileCount;
    }

    /**
     * Get ConfigPathManager instance
     */
    getConfigPathManager() {
        // Use the shared ConfigPathManager instance from PluginAPI
        // This ensures we're using the same config paths as the rest of the application
        return this.api.getConfigPathManager();
    }
}

module.exports = ConfigImportPlugin;
