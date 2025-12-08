# TikTok TTS Engine - Automatic SessionID Extraction

## ✅ AUTOMATIC SOLUTION (November 2024)

**TikTok TTS now extracts SessionID automatically!** No manual cookie extraction needed.

### How It Works

1. **First Time**: Browser opens with your Chrome profile (where you're logged in!)
2. **Already Logged In?**: SessionID extracted immediately - no login needed!
3. **Need to Log In?**: Log in once (no time limit)
4. **Auto-Detect**: SessionID detected automatically when login complete
5. **Auto-Save**: SessionID saved for all future use
6. **Future Use**: Works automatically, no login needed

### Important: Uses Your Chrome Profile

✨ **NEW**: The system now uses your actual Chrome profile!

- **If you're logged into TikTok in Chrome**: SessionID extracted immediately
- **No repeated logins**: Uses your existing TikTok session
- **Avoids bot detection**: Real Chrome profile instead of automated browser
- **Falls back gracefully**: If Chrome is running, opens without profile

### Quick Start

Just use TikTok TTS - a browser will open for you to log in on first use!

```bash
# No setup required!
# On first TTS request, a browser window opens
# Log in to TikTok (take your time - no timeout!)
# Browser closes automatically when login detected
# SessionID saved and reused forever
```

### Important Notes

- **No Rush**: Take your time logging in - there's no timeout
- **Auto-Close**: Browser closes automatically when SessionID is detected
- **Don't Close Manually**: Let the system detect login and close the browser
- **Progress Updates**: You'll see status messages every 10 seconds

## 🔧 Advanced: Manual SessionID (Optional)

If you prefer manual setup or auto-extraction doesn't work:

### Step 1: Get SessionID from TikTok
1. Log in to https://www.tiktok.com in your browser
2. Press `F12` to open Developer Tools
3. Go to **Application** tab (Chrome) or **Storage** tab (Firefox)
4. In the left sidebar, expand **Cookies**
5. Click on `https://www.tiktok.com`
6. Find the cookie named `sessionid`
7. Copy the **Value**

### Step 2: Configure SessionID

```bash
# Add to your .env file
TIKTOK_SESSION_ID=your_session_id_here
```

## 📋 How Auto-Extraction Works

### First Request Flow
```
TTS Request → No SessionID? → Launch Browser → TikTok Login Page
    ↓
User Logs In → Extract SessionID → Save to File → Use for TTS
```

### Subsequent Requests
```
TTS Request → Load Saved SessionID → Use for TTS
```

### Automatic Refresh
- If SessionID expires (401/403 errors)
- System automatically attempts to refresh
- Opens browser if needed for re-login

## 🔒 Security & Privacy

### Saved Files
- `.tiktok-sessionid` - Your SessionID (kept private)
- `.tiktok-cookies.json` - Browser cookies for auto-login

**Location**: `plugins/tts/engines/` (already in .gitignore)

### Keep It Private
- Never commit these files to GitHub
- Don't share SessionID publicly
- Already excluded via .gitignore

## 🎛️ Configuration Options

### Enable/Disable Auto-Extraction

Auto-extraction is **enabled by default**. To disable:

```javascript
// In TTS plugin config
{
  autoExtractSessionId: false  // Disable auto-extraction
}
```

### Force Refresh SessionID

```bash
# Delete saved SessionID to force re-extraction
rm plugins/tts/engines/.tiktok-sessionid
rm plugins/tts/engines/.tiktok-cookies.json
```

## 🐛 Troubleshooting

### Browser Doesn't Open
- **Cause**: Headless browser launch failed
- **Fix**: Check Puppeteer installation
  ```bash
  npm install puppeteer
  ```

### Chrome Security Warning About Flags
- **Warning**: "You are using an unsupported command-line flag"
- **Fix**: Removed unnecessary sandbox-disabling flags (commit XXXXXXX)
- **Note**: Only uses `--disable-blink-features=AutomationControlled` to avoid bot detection

### Chrome Already Running Error
- **Cause**: Can't use Chrome profile when Chrome is already open
- **Fix**: Close Chrome, then try TTS again
- **Workaround**: System will automatically retry without profile

### "Timeout waiting for login" Error (Legacy)
- **Note**: This error no longer occurs - system waits indefinitely
- **If you see it**: Update to latest version

## 🔄 SessionID Lifecycle

### Lifespan
- TikTok SessionIDs typically last weeks to months
- Depends on TikTok's security policies

### Auto-Refresh
- System detects expired SessionID (401/403 errors)
- Automatically attempts re-extraction
- Opens browser for re-login if needed

### Manual Refresh
```bash
# Clear and re-extract
rm plugins/tts/engines/.tiktok-sessionid
# Next TTS request will trigger auto-extraction
```

## 💡 Best Practices

### First-Time Setup
1. Make first TTS request
2. Browser opens with TikTok
3. Log in once
4. Done! Works automatically from now on

### Server/Headless Environment
- Use manual SessionID (TIKTOK_SESSION_ID env var)
- Auto-extraction requires display for first login
- After first extraction, works headless

### Multiple Instances
- Each instance needs own SessionID
- Or share .tiktok-sessionid file
- Coordinate to avoid conflicts

## 🆘 Support

### Still Having Issues?

1. **Try manual setup first** (see Manual SessionID section)
2. **Check logs** for specific error messages
3. **Verify network access** to tiktok.com
4. **Contact support** with log excerpts

### Alternative TTS Engines
If TikTok TTS doesn't work for you:

1. **Google Cloud TTS** - Most reliable, 300+ voices
2. **ElevenLabs TTS** - Highest quality, natural voices
3. **Browser SpeechSynthesis** - Free, client-side, no setup

## 📅 Last Updated

2025-11-21 - Automatic SessionID extraction implemented
