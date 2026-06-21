# Config Import Plugin

## Overview

The Config Import plugin allows users to import their settings from old installation paths where configuration files were stored directly in the installation directory (before the migration to platform-specific config directories). The plugin automatically detects config files in subdirectories and allows importing without overwriting existing profiles.

## Problem

In older versions of Pup Cid's Little TikTok Helper, configuration files were stored directly in the application installation directory. This meant that when users:
- Reinstalled the application
- Updated to a new version
- Moved the installation to a different location

...they would lose all their settings, profiles, TTS configurations, soundboard mappings, and other data.

## Solution

This plugin provides a user-friendly interface to:
1. Select the old installation directory (or main folder containing app/ subdirectory)
2. Automatically detect configuration files in the root or app/ subdirectory
3. Specify a custom profile name for the import
4. Validate that configuration files exist there
5. Import all settings to the current configuration location without overwriting existing profiles

## Features

- ✅ **Path Validation**: Checks if the selected path contains valid configuration files
- ✅ **Automatic Subdirectory Detection**: Searches for config files in app/ subdirectory if not found in root
- ✅ **Custom Profile Naming**: Allows specifying a name for the imported profile
- ✅ **Conflict Prevention**: Automatically adds timestamps to avoid overwriting existing profiles
- ✅ **Database Integrity Checks**: Validates SQLite databases before and after import
- ✅ **WAL Mode Support**: Properly handles databases in WAL (Write-Ahead Logging) mode
- ✅ **Locked File Handling**: Gracefully handles locked SHM files on Windows
- ✅ **Selective Import**: Shows what will be imported (user_configs, user_data, uploads, plugins)
- ✅ **Plugin Data Support**: Displays and imports plugin-specific data directories
- ✅ **Detailed Logging**: Comprehensive import logs with timestamps and log levels
- ✅ **Warning System**: Alerts users about potential issues (locked files, database in use, etc.)
- ✅ **Progress Feedback**: Visual feedback during the import process
- ✅ **Multi-language Support**: German and English translations
- ✅ **Safe Operation**: Preserves file timestamps and handles errors gracefully

## Usage

1. **Close the old installation** if it's running (important to avoid database lock issues)
2. Open the plugin from the dashboard (Plugins → Config Import)
3. Enter the full path to your old installation directory:
   - Windows: `C:\old-path\pupcidslittletiktokhelper` (or the main folder containing an app/ subdirectory)
   - macOS: `/Users/username/old-path/pupcidslittletiktokhelper`
   - Linux: `/home/username/old-path/pupcidslittletiktokhelper`
4. Optional: Enter a custom name for the imported profile (e.g., "my-old-config")
5. Click "Validate Path" to check if configuration files exist
6. Review the found files (including plugin data)
7. Click "Import Settings" to start the import
8. Review any warnings or errors in the import log
9. **Restart the application** to load the imported settings

## Automatic Subdirectory Detection

If you select a folder that contains the LTTH installation in an `app/` subdirectory, the plugin will automatically detect and use that subdirectory. This is useful when:
- Your old installation was packaged with other files
- You want to select the main project folder instead of navigating into app/
- The config files are located in a standard app/ structure

Example:
```
old-installation/
├── app/              ← Config files are here
│   ├── user_configs/
│   ├── plugins/
│   └── user_data/
└── other-files/
```

## Profile Naming

When importing a legacy database.db file, you can specify a custom profile name:
- If you leave the profile name empty, it defaults to "imported-config"
- If a profile with that name already exists, a timestamp is automatically added (e.g., "my-config-1733234567890")
- This prevents accidentally overwriting your current profile

## What Gets Imported

The plugin imports the following directories from your old installation:

### user_configs/
- User profile databases (`.db` files)
- TTS voice mappings
- Gift sound assignments
- Alert configurations
- Flow automations
- HUD element positions

### user_data/
- TikTok session information
- Flow logs
- Temporary data files

### uploads/
- Custom animations
- User-uploaded assets
- Custom sound files

### plugins/
- Plugin-specific data directories
- Plugin database files (e.g., `quiz_show.db`, `clarityhud.db`)
- Plugin configuration files
- Persisted plugin state data

Each plugin stores its data in `plugins/{pluginId}/data/` and this structure is preserved during import.

### Legacy Format Support (Older Versions)

The plugin also supports importing from older versions that used a different directory structure:

#### database.db (Root Directory)
- In older versions, all settings were stored in a single `database.db` file in the installation root
- This file is automatically imported with the specified profile name (or "imported-config" by default)
- If a profile with that name exists, a timestamp is added to create a unique profile name
- WAL and SHM files (`database.db-wal`, `database.db-shm`) are also imported if present

#### data/ Directory
- Some older versions used a `data/` folder instead of `user_data/`
- Files from this folder are imported into the current user_data directory

## Important Notes

⚠️ **Close Old Installation First**: Always close the old installation before importing. Database files that are in use cannot be properly imported due to file locks. This is especially important on Windows.

⚠️ **Database Integrity**: The import process validates all SQLite database files before and after copying to ensure data integrity. If a database is corrupted, the import will fail for that specific file but continue with others.

⚠️ **WAL Mode Handling**: The importer automatically attempts to checkpoint databases in WAL (Write-Ahead Logging) mode to merge all changes into the main database file. If the database is locked, you'll receive a warning.

⚠️ **SHM Files on Windows**: Shared memory files (`.db-shm`) can sometimes be locked on Windows even after closing the application. The importer handles this gracefully - SQLite will recreate these files automatically when needed.

⚠️ **Profile Naming**: Enter a custom profile name to keep your imports organized. If a profile with the same name exists, a timestamp will be added automatically.

⚠️ **Subdirectory Detection**: The system automatically searches for config files in the app/ subdirectory if they're not found in the specified path.

⚠️ **Restart Required**: After importing, you must restart the application for changes to take effect.

⚠️ **Path Format**: Make sure to use the correct path format for your operating system:
- Windows uses backslashes: `C:\path\to\folder`
- macOS/Linux use forward slashes: `/path/to/folder`

⚠️ **Review Import Logs**: After import, expand the "Import Log" section to see detailed information about what was imported and any issues encountered.

## Example Import Scenarios

### Scenario 1: Import from old installation with custom profile name
1. Path: `C:\old-ltth`
2. Profile Name: `backup-2023`
3. Result: Legacy database imported as `backup-2023.db`

### Scenario 2: Import from folder with app/ subdirectory
1. Path: `D:\downloads\ltth-archive` (contains `app/` subdirectory with configs)
2. Profile Name: (leave empty)
3. Result: System detects `app/` subdirectory, imports as `imported-config.db`

### Scenario 3: Avoid overwriting existing profile
1. Path: `C:\old-ltth`
2. Profile Name: `default` (already exists)
3. Result: Imported as `default-1733234567890.db` with timestamp

## Technical Details

### Database Import Safety

The plugin implements several safety mechanisms for database imports:

#### 1. **Integrity Validation**
- All SQLite databases are validated before import using `PRAGMA integrity_check`
- Corrupted databases are detected and rejected
- Failed validations are logged with detailed error messages

#### 2. **WAL Mode Checkpoint**
- Attempts to checkpoint databases in WAL mode using `PRAGMA wal_checkpoint(TRUNCATE)`
- Merges Write-Ahead Log changes into the main database file
- Handles locked databases gracefully with informative warnings
- Continues import even if checkpoint fails (database still copied safely)

#### 3. **Locked File Handling**
- Detects file locks on database, WAL, and SHM files
- Provides user-friendly warnings about locked files
- **SHM files**: Failures are expected on Windows and safely ignored (SQLite recreates them)
- **WAL files**: Copy failures trigger warnings but don't stop import
- **Main DB files**: Lock failures are critical and prevent import of that specific file

#### 4. **Post-Import Validation**
- Validates copied databases to ensure integrity after transfer
- Removes corrupted copies automatically
- Reports validation failures with detailed error messages

#### 5. **Error Recovery**
- Import continues even if individual files fail
- Detailed error logs help identify specific problems
- Warnings distinguish between critical and non-critical issues

### API Endpoints

#### POST `/api/config-import/validate`
Validates an import path and returns information about found configuration files.

**Request:**
```json
{
  "importPath": "/path/to/old/installation"
}
```

**Response:**
```json
{
  "valid": true,
  "actualPath": "/path/to/old/installation/app",
  "detectedSubdirectory": "app",
  "findings": {
    "userConfigs": true,
    "userData": true,
    "uploads": false,
    "plugins": true,
    "legacyDatabase": false,
    "legacyData": false,
    "files": [
      "user_configs/default.db", 
      "user_data/session.json",
      "plugins/quiz_show/data/quiz_show.db"
    ]
  }
}
```

#### POST `/api/config-import/import`
Imports settings from the validated path.

**Request:**
```json
{
  "importPath": "/path/to/old/installation",
  "profileName": "my-backup"
}
```

**Response:**
```json
{
  "success": true,
  "profileName": "my-backup",
  "imported": {
    "userConfigs": 5,
    "userData": 3,
    "uploads": 0,
    "plugins": 3,
    "legacyDatabase": 3,
    "legacyData": 0
  },
  "errors": [],
  "warnings": [
    "default.db: Could not checkpoint WAL file - database may be in use by another application",
    "quiz_show.db: WAL file could not be copied, but database should be intact"
  ],
  "logs": [
    {
      "message": "Starting config import process",
      "level": "info",
      "timestamp": "2025-12-03T17:20:38.000Z"
    },
    {
      "message": "Validating source database: C:\\old_Config\\user_configs\\default.db",
      "level": "debug",
      "timestamp": "2025-12-03T17:20:38.100Z"
    },
    {
      "message": "Successfully imported default.db (3 files)",
      "level": "info",
      "timestamp": "2025-12-03T17:20:38.250Z"
    }
  ]
}
```

**Note**: The response now includes:
- `warnings`: Array of non-critical issues encountered during import
- `logs`: Detailed log entries with timestamps and severity levels
- Enhanced error reporting with specific context for each failure

## Troubleshooting

### "Path does not exist"
- Check that you've entered the complete path to the old installation
- Make sure the path format matches your operating system
- Verify the directory actually exists

### "No configuration files found"
- The selected path may not be the correct installation directory
- Look for the `user_configs` or `user_data` folders in the path
- The path might be to a subdirectory instead of the main installation folder

### "Import succeeded but settings not visible"
- Make sure you've restarted the application
- Check the console/logs for any errors
- Verify the imported files are in the correct location (see Settings → Configuration Storage Location)

### Database Import Issues

#### "Database appears to be locked or in use"
- **Solution**: Close the old installation completely before importing
- On Windows, check Task Manager to ensure no processes are running
- Wait a few seconds after closing before attempting import
- If the issue persists, restart your computer to release all file locks

#### "Could not checkpoint WAL file"
- **Cause**: The database is in use by another application
- **Solution**: Close all applications using the database and try again
- **Impact**: Import may still succeed, but with a warning

#### "Database integrity check failed"
- **Cause**: The source database file is corrupted
- **Solution**: Try to repair the database using SQLite tools before importing
- **Alternative**: Import other files and manually recreate affected settings

#### SHM File Copy Warnings (Windows)
- **Message**: "Failed to copy .db-shm file" or "Could not copy SHM file"
- **Cause**: Windows locks shared memory files even after applications close
- **Impact**: This is not critical - SQLite recreates SHM files automatically
- **Action**: You can safely ignore these warnings

### Import Logs Show Errors

1. Click "Show Details" in the Import Log section
2. Review error messages (shown in red)
3. Check warnings (shown in yellow) - these are usually non-critical
4. Common non-critical warnings:
   - SHM file copy failures (Windows)
   - WAL checkpoint warnings (database in use)
5. Critical errors that need attention:
   - Database corruption
   - Permission denied errors
   - Disk space issues

## Development

### Plugin Structure
```
config-import/
├── main.js           # Plugin backend logic
├── plugin.json       # Plugin metadata
├── ui.html          # User interface
├── locales/
│   ├── de.json      # German translations
│   └── en.json      # English translations
└── README.md        # This file
```

### Required Permissions
- `routes`: To register API endpoints
- `database`: To access configuration management

## License

CC BY-NC 4.0 License - Part of Pup Cid's Little TikTok Helper

## Support

For issues or questions:
- GitHub Issues: [Create an issue](https://github.com/Loggableim/pupcidslittletiktokhelper/issues)
- Email: loggableim@gmail.com
