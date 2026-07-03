# Multi-Profile System

## Overview

The Multi-Profile System allows you to manage multiple streaming setups with separate configurations, databases, and settings. Perfect for managing different TikTok accounts, testing new configurations, or maintaining distinct streaming personas.

## Features

- **Multiple Profiles** - Create unlimited profiles
- **Isolated Data** - Each profile has its own database
- **Quick Switching** - Switch profiles on-the-fly
- **Backup & Restore** - Profile-specific backups
- **Import/Export** - Share profiles between installations
- **Profile Templates** - Start with pre-configured setups

## Use Cases

### Multi-Account Management

Manage different TikTok accounts:
```
Profile: MainAccount
- TikTok: @mainstreamer
- Alerts: Professional setup
- Soundboard: Music-focused

Profile: AltAccount
- TikTok: @altstreamer
- Alerts: Fun/casual setup
- Soundboard: Meme-focused
```

### Testing vs Production

Separate test and live environments:
```
Profile: Production
- Live streaming configuration
- Tested flows and alerts
- Stable settings

Profile: Testing
- Experimental features
- New flows being tested
- Beta configurations
```

### Different Streaming Setups

Multiple streaming personas:
```
Profile: Gaming
- Gaming-specific alerts
- Game-related sounds
- Twitch integration

Profile: IRL
- Casual alerts
- Music soundboard
- Mobile setup

Profile: VRChat
- OSC-focused configuration
- Avatar-specific flows
- VRChat alerts
```

## Creating a Profile

### Via Dashboard

1. Go to **Dashboard** → **Settings** → **Profiles**
2. Click **Create New Profile**
3. Enter profile name
4. Choose template (optional):
   - Blank (empty configuration)
   - Default (standard setup)
   - Copy from existing profile
5. Click **Create**

### Via CLI

```bash
node launch.js --create-profile "ProfileName"
```

## Switching Profiles

### Via Dashboard

1. Dashboard → Settings → Profiles
2. Select profile from dropdown
3. Click **Switch**
4. Confirm profile switch
5. Server restarts with new profile

### Via CLI

```bash
node launch.js --profile "ProfileName"
```

### Quick Switch

Keyboard shortcut: `Ctrl+Shift+P` opens profile selector

## Profile Structure

Each profile contains:

```
profiles/
├── ProfileName/
│   ├── database.db        # SQLite database
│   ├── config.json        # Profile configuration
│   ├── flows.json         # Automation flows
│   ├── alerts.json        # Alert configurations
│   ├── soundboard/        # Sound files
│   │   ├── custom/        # Uploaded sounds
│   │   └── favorites.json # Favorite sounds
│   └── backups/           # Profile backups
│       ├── 2025-01-15.zip
│       └── 2025-01-10.zip
```

## Profile Configuration

### config.json

```json
{
  "profile_name": "MainAccount",
  "tiktok_username": "mainstreamer",
  "theme": "dark",
  "language": "en",
  "obs": {
    "enabled": true,
    "host": "localhost",
    "port": 4455,
    "password": "encrypted"
  },
  "vrchat": {
    "enabled": true,
    "port": 9000
  },
  "tts": {
    "default_voice": "en_us_001",
    "auto_tts": true,
    "volume": 100,
    "speed": 1.0
  },
  "created_at": "2025-01-15T10:00:00Z",
  "last_used": "2025-01-18T06:00:00Z"
}
```

## Backup & Restore

### Creating Backups

**Manual Backup:**
1. Dashboard → Profiles → Select profile
2. Click **Create Backup**
3. ZIP file downloaded

**Automatic Backups:**
- Daily: 00:00 local time
- Before profile switch
- Before updates

**Backup Location:**
```
profiles/ProfileName/backups/
├── daily-2025-01-18.zip
├── daily-2025-01-17.zip
├── pre-switch-2025-01-15.zip
└── pre-update-2025-01-10.zip
```

### Restoring Backups

1. Dashboard → Profiles → Select profile
2. Click **Restore from Backup**
3. Choose backup ZIP file
4. Confirm restoration
5. Server restarts with restored data

## Import/Export Profiles

### Exporting Profiles

Share your profile configuration:

1. Dashboard → Profiles → Select profile
2. Click **Export Profile**
3. ZIP file contains:
   - Configuration
   - Flows
   - Alert templates
   - Soundboard favorites (without actual audio files)

**Export Options:**
- **Full Export**: Everything including sounds
- **Config Only**: Configuration and flows only
- **Templates**: Flows and alerts without data

### Importing Profiles

Import shared profiles:

1. Dashboard → Profiles
2. Click **Import Profile**
3. Select ZIP file
4. Choose import options:
   - Create new profile
   - Overwrite existing
   - Merge with current
5. Click **Import**

## Profile Templates

Pre-configured starting points:

### Default Template

Basic streaming setup:
- Standard alerts for gifts, follows, shares
- Auto-TTS enabled
- Basic soundboard
- Simple flows

### Gaming Template

Gaming-focused configuration:
- Gaming alerts
- Game-related sounds
- Multi-cam switching for gameplay
- OBS integration enabled

### VRChat Template

VRChat streaming setup:
- OSC integration enabled
- Avatar gesture flows
- VRChat-specific alerts
- Heart/confetti particle mappings

### IRL Template

IRL streaming configuration:
- Mobile-friendly settings
- Music soundboard
- Casual alerts
- Social media integration

### Minimal Template

Lightweight setup:
- Essential features only
- No TTS
- Basic alerts
- Minimal flows

## Profile Management

### Renaming Profiles

```bash
# Via CLI
node launch.js --rename-profile "OldName" "NewName"
```

Via Dashboard:
1. Settings → Profiles → Select profile
2. Click **Rename**
3. Enter new name
4. Confirm

### Deleting Profiles

⚠️ **Warning:** Profile deletion is permanent!

1. Settings → Profiles → Select profile
2. Click **Delete Profile**
3. Confirm deletion (type profile name)
4. Profile and all data deleted

**Safety:** Cannot delete currently active profile

### Copying Profiles

Create profile based on existing:

1. Settings → Profiles → Select source profile
2. Click **Duplicate Profile**
3. Enter new profile name
4. Copy options:
   - All settings
   - Flows only
   - Alerts only
   - Custom selection
5. Click **Create**

## Auto-Switching

Switch profiles automatically based on conditions:

### Time-Based Switching

```json
{
  "auto_switch": {
    "enabled": true,
    "rules": [
      {
        "profile": "MorningStream",
        "time": "06:00-12:00"
      },
      {
        "profile": "EveningStream",
        "time": "18:00-23:00"
      }
    ]
  }
}
```

### Event-Based Switching

```
TikTok Account Change → Switch to corresponding profile
Game Launch Detected → Switch to Gaming profile
VRChat Startup → Switch to VRChat profile
```

## Profile Statistics

Track profile usage:

- Total stream time per profile
- Events processed per profile
- Most used features per profile
- Profile switch history

**View Statistics:**
Dashboard → Profiles → Statistics

## Performance Considerations

### Database Size

Monitor database size per profile:
```
ProfileName/database.db
- Current size: 25 MB
- Events stored: 50,000
- Flows: 25
- Alerts: 15
```

**Optimization:**
- Archive old events (> 30 days)
- Clean up test data
- Vacuum database monthly

### Profile Switching Speed

Switching profiles requires:
- Save current profile state (< 1 second)
- Load new profile database (< 2 seconds)
- Reconnect TikTok LIVE (5-10 seconds)
- Total: ~10-15 seconds

## Security

### Password Protection

Protect profiles with passwords:

1. Settings → Profiles → Select profile
2. Enable **Password Protection**
3. Set password
4. Password required for:
   - Profile switching
   - Profile deletion
   - Backup restoration
   - Export

### Encryption

Profile data encryption:
- Database: AES-256 encryption (optional)
- Passwords: Bcrypt hashing
- API keys: Encrypted storage

**Enable Encryption:**
Settings → Security → Enable Profile Encryption

## Troubleshooting

### Profile Won't Switch

**Symptoms:** Profile switch fails or hangs

**Solutions:**
- Close TikTok LIVE connection first
- Check if profile exists
- Verify database file is not corrupted
- Check disk space
- Review error logs

### Missing Profile Data

**Symptoms:** Profile loads but data is missing

**Solutions:**
- Check database file exists
- Restore from backup
- Verify file permissions
- Check for database corruption

### Backup Restoration Fails

**Symptoms:** Cannot restore backup

**Solutions:**
- Verify ZIP file integrity
- Check backup compatibility (version)
- Free up disk space
- Try older backup

### Database Corruption

**Symptoms:** Profile database errors

**Solutions:**
1. Stop server
2. Backup current database
3. Run database repair:
   ```bash
   sqlite3 database.db "PRAGMA integrity_check"
   ```
4. Restore from backup if needed

## Best Practices

### Do's ✅

- Create backups before major changes
- Use descriptive profile names
- Organize profiles by purpose
- Test in separate profile before production
- Export profiles for sharing
- Monitor database sizes

### Don'ts ❌

- Don't delete profiles without backup
- Don't switch profiles during live stream
- Don't share profiles with sensitive data
- Don't ignore backup recommendations
- Don't exceed 10-15 active profiles (performance)

## API Access

Profiles can be managed via REST API:

```javascript
// List profiles
GET /api/profiles

// Get current profile
GET /api/profiles/current

// Switch profile
POST /api/profiles/switch
{
  "profile_name": "ProfileName"
}

// Create profile
POST /api/profiles/create
{
  "name": "NewProfile",
  "template": "default"
}

// Delete profile
DELETE /api/profiles/:name

// Export profile
GET /api/profiles/:name/export

// Import profile
POST /api/profiles/import
FormData with 'file' field
```

## Profile Sharing

### Community Profiles

Share your profiles with the community:

1. Export profile
2. Remove sensitive data (API keys, passwords)
3. Add README with setup instructions
4. Upload to GitHub/Discord
5. Add to community profile library

### Profile Repository

Official community profiles:
- https://github.com/Loggableim/ltth-profiles

Browse and download pre-configured profiles.

---

*For more profile management features, see [[API-Reference]] and [[Konfiguration]].*
