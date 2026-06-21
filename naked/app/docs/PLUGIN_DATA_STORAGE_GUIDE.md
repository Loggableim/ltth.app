# Plugin Data Storage Guide

## Overview

This guide explains how plugins should handle data storage to ensure all user data, configurations, uploads, and API keys persist across application updates.

## Critical Rule: Never Store Data in the Application Directory

**⚠️ IMPORTANT**: Never store plugin data in the application directory (`__dirname`, `plugins/your-plugin/data`, etc.). This data will be **lost during application updates**.

## Using Persistent Storage

### Getting the Plugin Data Directory

The `PluginAPI` provides methods to access the user profile directory where plugin data should be stored:

```javascript
class MyPlugin {
    constructor(api) {
        this.api = api;
        
        // ✅ CORRECT: Use persistent storage in user profile
        const pluginDataDir = api.getPluginDataDir();
        this.uploadDir = path.join(pluginDataDir, 'uploads');
        this.configFile = path.join(pluginDataDir, 'custom-config.json');
    }

    async init() {
        // Ensure the plugin data directory exists
        this.api.ensurePluginDataDir();
        
        // Create subdirectories if needed
        if (!fs.existsSync(this.uploadDir)) {
            fs.mkdirSync(this.uploadDir, { recursive: true });
        }
        
        // Log the storage location for debugging
        this.api.log(`📂 Using persistent storage: ${this.api.getPluginDataDir()}`, 'info');
    }
}
```

### What NOT to Do

```javascript
// ❌ WRONG: Storing in plugin directory (lost on update!)
this.uploadDir = path.join(__dirname, 'uploads');
this.dataFile = path.join(__dirname, 'data', 'users.json');

// ❌ WRONG: Storing in app directory (lost on update!)
this.cacheDir = path.join(__dirname, '..', '..', 'data', 'cache');
```

## Storage Locations

### Database Configuration (Recommended for Settings)

For most configuration data, use the database which is already stored in the user profile:

```javascript
// ✅ Store configuration in database (automatically persisted)
this.api.setConfig('apiKey', userApiKey);
this.api.setConfig('settings', { enabled: true, volume: 80 });

// Retrieve configuration
const apiKey = this.api.getConfig('apiKey');
const settings = this.api.getConfig('settings');
```

### File Storage (For Uploads, Logs, Cache)

For files (uploads, logs, cache), use the plugin data directory:

```javascript
class MyPlugin {
    constructor(api) {
        this.api = api;
        
        // Get the persistent plugin data directory
        const pluginDataDir = api.getPluginDataDir();
        
        // Create subdirectories for different types of data
        this.uploadDir = path.join(pluginDataDir, 'uploads');
        this.logDir = path.join(pluginDataDir, 'logs');
        this.cacheDir = path.join(pluginDataDir, 'cache');
    }
}
```

## Migration Guide

If your plugin previously stored data in the application directory, you need to migrate it to the user profile directory:

```javascript
class MyPlugin {
    async init() {
        // Ensure plugin data directory exists
        this.api.ensurePluginDataDir();
        
        // Migrate old data
        await this.migrateOldData();
        
        // Continue with normal initialization
        // ...
    }

    async migrateOldData() {
        const oldUploadDir = path.join(__dirname, 'uploads');
        const newUploadDir = path.join(this.api.getPluginDataDir(), 'uploads');
        
        if (fs.existsSync(oldUploadDir)) {
            const oldFiles = fs.readdirSync(oldUploadDir).filter(f => f !== '.gitkeep');
            
            if (oldFiles.length > 0) {
                this.api.log(`📦 Migrating ${oldFiles.length} files to user profile...`, 'info');
                
                // Ensure new directory exists
                if (!fs.existsSync(newUploadDir)) {
                    fs.mkdirSync(newUploadDir, { recursive: true });
                }
                
                // Copy files
                for (const file of oldFiles) {
                    const oldPath = path.join(oldUploadDir, file);
                    const newPath = path.join(newUploadDir, file);
                    
                    if (!fs.existsSync(newPath)) {
                        fs.copyFileSync(oldPath, newPath);
                    }
                }
                
                this.api.log(`✅ Migration complete. Files moved to: ${newUploadDir}`, 'info');
                this.api.log('💡 Old files are kept for safety. You can manually delete them after verifying.', 'info');
            }
        }
    }
}
```

## Platform-Specific Locations

The `ConfigPathManager` automatically selects the appropriate location based on the platform:

- **Windows**: `%LOCALAPPDATA%\pupcidslittletiktokhelper\plugins\your-plugin\`
- **macOS**: `~/Library/Application Support/pupcidslittletiktokhelper/plugins/your-plugin/`
- **Linux**: `~/.local/share/pupcidslittletiktokhelper/plugins/your-plugin/`

## Best Practices

### 1. Always Use PluginAPI Methods

```javascript
// ✅ CORRECT: Use PluginAPI helper
const dataDir = this.api.getPluginDataDir();

// ❌ WRONG: Construct path manually
const dataDir = path.join(__dirname, '..', '..', 'user_data', 'plugins', this.pluginId);
```

### 2. Create Subdirectories for Organization

```javascript
async init() {
    const pluginDataDir = this.api.getPluginDataDir();
    
    this.uploadDir = path.join(pluginDataDir, 'uploads');
    this.logDir = path.join(pluginDataDir, 'logs');
    this.tempDir = path.join(pluginDataDir, 'temp');
    
    // Create all subdirectories
    [this.uploadDir, this.logDir, this.tempDir].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
}
```

### 3. Use Database for Simple Configuration

```javascript
// ✅ CORRECT: Small config in database
this.api.setConfig('apiKey', 'secret-key-123');
this.api.setConfig('volume', 80);

// ❌ WRONG: Creating files for simple config
fs.writeFileSync(path.join(dataDir, 'api-key.txt'), 'secret-key-123');
```

### 4. Log Storage Locations for Debugging

```javascript
async init() {
    const dataDir = this.api.getPluginDataDir();
    this.api.log(`📂 Plugin data directory: ${dataDir}`, 'info');
    this.api.log(`📂 Uploads: ${this.uploadDir}`, 'debug');
}
```

## Examples

### Example 1: Plugin with File Uploads

```javascript
const path = require('path');
const fs = require('fs');
const multer = require('multer');

class FileUploadPlugin {
    constructor(api) {
        this.api = api;
        
        // Use persistent storage
        const pluginDataDir = api.getPluginDataDir();
        this.uploadDir = path.join(pluginDataDir, 'uploads');
    }

    async init() {
        // Ensure directory exists
        this.api.ensurePluginDataDir();
        
        if (!fs.existsSync(this.uploadDir)) {
            fs.mkdirSync(this.uploadDir, { recursive: true });
        }

        // Setup multer
        const storage = multer.diskStorage({
            destination: (req, file, cb) => {
                cb(null, this.uploadDir);
            },
            filename: (req, file, cb) => {
                const uniqueName = `${Date.now()}-${file.originalname}`;
                cb(null, uniqueName);
            }
        });

        this.upload = multer({ storage });
        
        // Register upload route
        this.api.registerRoute('post', '/api/myplugin/upload', (req, res) => {
            this.upload.single('file')(req, res, (err) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                res.json({ success: true, filename: req.file.filename });
            });
        });
    }
}

module.exports = FileUploadPlugin;
```

### Example 2: Plugin with Configuration and Logs

```javascript
const path = require('path');
const fs = require('fs');

class LoggingPlugin {
    constructor(api) {
        this.api = api;
        
        // Use persistent storage
        const pluginDataDir = api.getPluginDataDir();
        this.logFile = path.join(pluginDataDir, 'plugin.log');
    }

    async init() {
        // Ensure directory exists
        this.api.ensurePluginDataDir();
        
        // Load configuration from database
        this.config = this.api.getConfig('settings') || {
            enabled: true,
            logLevel: 'info'
        };
        
        // Initialize log file
        this.log('Plugin initialized');
    }

    log(message) {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${message}\n`;
        fs.appendFileSync(this.logFile, logEntry);
    }

    async destroy() {
        // Save configuration on shutdown
        this.api.setConfig('settings', this.config);
        this.log('Plugin destroyed');
    }
}

module.exports = LoggingPlugin;
```

## Checklist for Plugin Developers

Before releasing your plugin, verify:

- [ ] No data is stored in `__dirname` or plugin directory
- [ ] All uploads use `api.getPluginDataDir()`
- [ ] All configuration uses `api.setConfig()` / `api.getConfig()` or custom database tables
- [ ] Migration logic is implemented for existing users
- [ ] Storage locations are logged for debugging
- [ ] Old data directories are documented in README
- [ ] Plugin works correctly after simulated update (delete plugin folder, reinstall)

## Getting Help

If you're unsure whether your plugin is storing data correctly:

1. Check the plugin initialization logs for storage locations
2. Look at existing core plugins (emoji-rain, fireworks, gift-milestone) as examples
3. Ask in the development Discord channel
4. Review the `ConfigPathManager` API documentation

## Summary

**Golden Rule**: Always use `api.getPluginDataDir()` for file storage and `api.setConfig()` / `api.getConfig()` for configuration. Never store data in the plugin directory or application directory.

This ensures your users' data, API keys, and configurations survive application updates and can be easily backed up or migrated to new systems.
