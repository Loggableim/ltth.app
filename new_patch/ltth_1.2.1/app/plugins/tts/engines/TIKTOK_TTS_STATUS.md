# TikTok TTS Engine - SessionID Extraction Methods

## ✅ AUTOMATIC SOLUTION (December 2025)

**TikTok TTS now supports THREE methods for SessionID extraction!**

### Method Comparison

| Method | Speed | Reliability | Requirements | Best For |
|--------|-------|-------------|--------------|----------|
| **🚀 Eulerstream API** | ⚡ Instant | ✅ High | Eulerstream account | **Recommended** |
| **🌐 Browser Automation** | 🐢 Slow (30s+) | ✅ Medium | Puppeteer installed | Fallback |
| **✋ Manual Extraction** | ⚡ Instant | ✅ High | Web browser | Emergency |

---

## 🚀 METHOD 1: Eulerstream API (RECOMMENDED)

**NEW!** The fastest and most reliable method - uses Eulerstream's API to retrieve your TikTok session automatically.

### What is Eulerstream?

Eulerstream is a service that provides reliable access to TikTok LIVE data through their WebSocket API. It handles the complex authentication and connection management for TikTok streams. This application uses Eulerstream for TikTok LIVE connections, and now it can also extract TikTok session IDs through their API, making TTS setup much faster and more reliable.

### Prerequisites
- Eulerstream account (get one at https://www.eulerstream.com)
- Eulerstream API key configured in Dashboard

### How It Works
1. **Automatic**: Uses your existing Eulerstream API key
2. **Fast**: Retrieves SessionID in under 1 second
3. **Reliable**: No browser automation needed
4. **Secure**: API-based authentication

### Setup
1. Get your Eulerstream API key from https://www.eulerstream.com
2. Configure it in the Dashboard Settings
3. Click "Extract Session" in TTS settings
4. Done! SessionID extracted via Eulerstream API

### Advantages
- ✅ Fastest method (< 1 second)
- ✅ No browser/Puppeteer required
- ✅ More reliable than browser automation
- ✅ Uses existing Eulerstream infrastructure

### Limitations
- Requires Eulerstream account with API access
- May require specific Eulerstream plan (contact support if unavailable)

---

## 🌐 METHOD 2: Browser Automation (FALLBACK)

**Fallback method** when Eulerstream API is not available. Uses Puppeteer to extract SessionID from browser.

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

---

## ✋ METHOD 3: Manual Extraction (EMERGENCY)

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

## 📋 How Extraction Works

### Automatic Method Selection

The system automatically tries methods in order:

```
TTS Request → Check SessionID in database
    ↓
No SessionID? → Try METHOD 1: Eulerstream API
    ↓
Failed? → Try METHOD 2: Browser Automation
    ↓
Failed? → Show error with METHOD 3: Manual instructions
```

### First Request Flow (Eulerstream API)
```
TTS Request → No SessionID? → Call Eulerstream API → Extract SessionID → Save to DB → Use for TTS
```

### First Request Flow (Browser Fallback)
```
TTS Request → No SessionID? → Eulerstream Failed → Launch Browser → TikTok Login Page
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
- Tries Eulerstream API first, then browser if needed

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

### Eulerstream API Method Issues

**Error: "No Eulerstream API key configured"**
- **Cause**: No API key found in settings
- **Fix**: Add your Eulerstream API key in Dashboard Settings

**Error: "Session extraction not available"**  
- **Cause**: Your Eulerstream plan may not support session extraction
- **Fix 1**: Contact Eulerstream support to enable this feature
- **Fix 2**: Use browser automation method instead (automatic fallback)

**Error: "Failed to retrieve account information"**
- **Cause**: Invalid or expired API key
- **Fix**: Check and update your Eulerstream API key

### Browser Automation Issues

**Browser Doesn't Open**
- **Cause**: Headless browser launch failed
- **Fix**: Check Puppeteer installation
  ```bash
  npm install puppeteer
  ```

**Chrome Security Warning About Flags**
- **Warning**: "You are using an unsupported command-line flag"
- **Fix**: Removed unnecessary sandbox-disabling flags (commit XXXXXXX)
- **Note**: Only uses `--disable-blink-features=AutomationControlled` to avoid bot detection

**Chrome Already Running Error**
- **Cause**: Can't use Chrome profile when Chrome is already open
- **Fix**: Close Chrome, then try TTS again
- **Workaround**: System will automatically retry without profile

**"Timeout waiting for login" Error (Legacy)**
- **Note**: This error no longer occurs - system waits indefinitely
- **If you see it**: Update to latest version

### General Issues

**TikTok TTS Not Working**
1. **Check SessionID**: Verify in Dashboard that SessionID is present
2. **Try Re-extraction**: Clear SessionID and extract again
3. **Check Method**: See which extraction method was used (logs/status)
4. **Try Different Method**: Manually specify Eulerstream or browser method

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

### Recommended Setup (Fastest & Most Reliable)
1. Get Eulerstream account and API key
2. Configure API key in Dashboard
3. Click "Extract Session" in TTS settings
4. Done! Works instantly with no browser needed

### First-Time Setup (Browser Method)
1. Make first TTS request
2. Browser opens with TikTok
3. Log in once
4. Done! Works automatically from now on

### Server/Headless Environment
- **Best**: Use Eulerstream API method (no display needed)
- **Alternative**: Use manual SessionID (TIKTOK_SESSION_ID env var)
- **Note**: Browser automation requires display for first login
- After first extraction, works headless

### Multiple Instances
- Each instance needs own SessionID
- Or share .tiktok-sessionid file
- Coordinate to avoid conflicts

### Performance Optimization
- Use Eulerstream API for fastest extraction (<1s vs 30s+)
- Browser automation is 30x slower but works as fallback
- Manual extraction is instant but requires user intervention

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

2025-12-14 - Added Eulerstream API method for instant SessionID extraction  
2024-11-21 - Automatic SessionID extraction via browser automation implemented
