# Soundboard Data Persistence

## Overview

All soundboard settings and configurations are stored persistently and will survive application updates.

## Storage Location

Soundboard data is stored in the persistent user configuration directory managed by `ConfigPathManager`:

### Windows
```
%LOCALAPPDATA%\pupcidslittletiktokhelper\user_configs\<username>.db
```

### macOS
```
~/Library/Application Support/pupcidslittletiktokhelper/user_configs/<username>.db
```

### Linux
```
~/.local/share/pupcidslittletiktokhelper/user_configs/<username>.db
```

This location is **outside the application directory** and is **not affected by application updates**.

## What is Stored

### 1. Gift-Specific Sounds
Stored in the `gift_sounds` table in the database:
- Gift ID
- Sound label
- MP3 URL
- Volume (0.0 - 1.0)
- Animation URL (optional)
- Animation type (none, image, video, gif)
- Animation volume (0.0 - 1.0)

### 2. Event Sounds
Stored in the `settings` table in the database:
- **Follow sound**: URL and volume
- **Subscribe sound**: URL and volume
- **Share sound**: URL and volume
- **Like threshold sound**: URL, volume, threshold, and window settings
- **Default gift sound**: URL and volume

All animation settings for these events are also persisted.

### 3. General Settings
- Soundboard enabled/disabled
- Play mode (overlap/sequential)
- Max queue length

## Migration and Updates

When you update the application:
1. ✅ **The database file is NOT touched** - it remains in the persistent config directory
2. ✅ **All gift sounds are preserved** - stored in `gift_sounds` table
3. ✅ **All event sounds are preserved** - stored in `settings` table
4. ✅ **All settings are preserved** - stored in `settings` table

## Volume Controls

All sound options now have volume adjustment controls:

### Event Sounds (Follow, Subscribe, Share, Like, Gift)
- Volume input field (0.0 - 1.0)
- Test button respects configured volume
- Volume is saved with the sound configuration

### MyInstants Search Results
- Each preview has a volume slider (0-100%)
- Volume slider affects preview playback only
- When you "Use" a sound, you can set its final volume separately

### Gift-Specific Sounds
- Volume stored in database (0.0 - 1.0)
- Test button has volume slider for testing
- Actual playback uses configured volume

## Technical Details

### Database Location
The database is created and managed by:
- `UserProfileManager` - creates profile-specific database files
- `ConfigPathManager` - ensures persistent storage location
- `Database` class - manages SQLite database with WAL mode

### Schema
```sql
-- Gift sounds table
CREATE TABLE gift_sounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gift_id INTEGER UNIQUE NOT NULL,
    label TEXT NOT NULL,
    mp3_url TEXT NOT NULL,
    volume REAL DEFAULT 1.0,
    animation_url TEXT,
    animation_type TEXT DEFAULT 'none',
    animation_volume REAL DEFAULT 1.0
);

-- Settings table (includes event sounds)
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
```

### Settings Keys for Event Sounds
- `soundboard_follow_sound` / `soundboard_follow_volume`
- `soundboard_subscribe_sound` / `soundboard_subscribe_volume`
- `soundboard_share_sound` / `soundboard_share_volume`
- `soundboard_like_sound` / `soundboard_like_volume`
- `soundboard_default_gift_sound` / `soundboard_gift_volume`

Plus animation settings for each event type.

## Troubleshooting

### My sounds disappeared after an update
This should **not** happen. If it does:
1. Check if your profile is selected correctly
2. Verify the database file exists in the config directory
3. Check the logs for database errors

### Where is my data actually stored?
Check the application logs on startup. They will show:
```
📂 [ConfigPathManager] Settings stored at: <path>
```

### Can I backup my soundboard settings?
Yes! Simply copy the database file:
- Windows: `%LOCALAPPDATA%\pupcidslittletiktokhelper\user_configs\<username>.db`
- macOS: `~/Library/Application Support/pupcidslittletiktokhelper/user_configs/<username>.db`
- Linux: `~/.local/share/pupcidslittletiktokhelper/user_configs/<username>.db`

## Summary

**All soundboard data is persistent** - both gift sounds AND event sounds (follow/subscribe/share/like) are stored in the same database file, which is located outside the application directory and survives updates.

The distinction between gift sounds and event sounds is only in how they are stored (separate table vs settings table), but both are equally persistent and survive updates.
