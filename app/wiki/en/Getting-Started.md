# 🇬🇧 English

### 📑 Table of Contents

1. [Overview](#overview-english)
2. [Quick Start (5 Minutes)](#quick-start-5-minutes-english)
3. [First Stream](#first-stream-english)
4. [Enable Plugins](#enable-plugins-english)
5. [OBS Setup](#obs-setup-english)
6. [Common First Steps](#common-first-steps-english)
7. [Next Steps](#next-steps-english)

---

### 🎯 Overview {#overview-english}

This guide will help you get started with **Little TikTool Helper v1.2.1** in **5-10 minutes**.

**What you will achieve:**

✅ Tool installed and running
✅ Connected to TikTok LIVE
✅ First overlays set up in OBS
✅ Basic plugins activated
✅ Ready for your first stream

---

### ⚡ Quick Start (5 Minutes) {#quick-start-5-minutes-english}

#### Step 1: Installation (2 minutes)

**Prerequisites:**
- Node.js 18.0.0+ installed ([Download](https://nodejs.org/))
- Git installed (optional, [Download](https://git-scm.com/))

**Installation:**

**Option A - Desktop App (Recommended):**
```bash
# Clone repository
git clone https://github.com/Loggableim/ltth.app.git
cd ltth.app

# Install dependencies
npm install

# Start desktop app
npm start
```

**Option B - Standalone Server:**
```bash
# Go to app folder
cd app

# Install dependencies
npm install

# Start server
npm start
```

#### Step 2: Open Dashboard (30 seconds)

**Desktop App:** Opens automatically

**Standalone:** Open browser to `http://localhost:3000`

#### Step 3: Connect to TikTok (1 minute)

1. **Get Eulerstream API Key:**
   - Go to [Eulerstream](https://eulerstream.com/)
   - Register (free)
   - Copy your API key

2. **In Dashboard:**
   - Click **"Connect to TikTok LIVE"**
   - Enter your **TikTok username**
   - Enter your **Eulerstream API key**
   - Click **"Connect"**

3. **Wait for connection:**
   - Status should change to **"Connected" (green)**
   - Live events appear in event log

#### Step 4: Test (30 seconds)

**Send test gift:**
1. Open TikTok on your phone
2. Go to your LIVE stream
3. Send a test gift (e.g. Rose)
4. Dashboard should display the gift

**✅ Done!** You are now connected to TikTok LIVE.

---

### 🎬 First Stream {#first-stream-english}

#### 1. Basic Settings

**Enable TTS:**
1. Dashboard → **TTS** (Sidebar)
2. Enable **"Auto-TTS for Chat"**
3. Select voice (e.g. "en_us_001 - Female")
4. Click **Test**

**Enable Alerts:**
1. Dashboard → **Alerts** (Sidebar)
2. Enable **Gift Alert**
3. Select sound (optional)
4. Click **Test Alert**

**Set up Goals:**
1. Dashboard → **Goals** (Sidebar)
2. Configure **Goal 1** (e.g. "1000 Likes")
3. Type: **Likes**
4. Target: **1000**
5. Click **Save**

#### 2. Add OBS Overlays

**Main Overlay:**
```
Browser Source → URL: http://localhost:3000/overlay
Width: 1920
Height: 1080
```

**Goal Overlay:**
```
Browser Source → URL: http://localhost:3000/goals/goal1
Width: 600
Height: 100
```

**Leaderboard Overlay:**
```
Browser Source → URL: http://localhost:3000/leaderboard/overlay
Width: 400
Height: 600
```

#### 3. Start Streaming

1. **Start OBS** - Overlays should be visible
2. **Start TikTok LIVE** - On your phone
3. **Connect LTTH** - Dashboard → Connect
4. **Start streaming!** 🎉

---

### 🔌 Enable Plugins {#enable-plugins-english}

#### Recommended Plugins for Beginners

**1. TTS v2.0** (Auto-enabled)
- Text-to-Speech for chat messages
- 75+ free voices

**2. Live Goals** (Auto-enabled)
- Progress bars for likes, coins, followers
- OBS overlays available

**3. Leaderboard** (Recommended)
```
Dashboard → Plugins → Leaderboard → Enable
```
- Shows top gifters
- Real-time updates

**4. Spotlight** (Recommended)
```
Dashboard → Plugins → Spotlight → Enable
```
- Shows last follower, gifter, etc.
- Overlay for each event type

**5. Soundboard** (Optional)
```
Dashboard → Plugins → Soundboard → Enable
```
- Gift-specific sounds
- MyInstants integration

#### Enable a Plugin

1. Dashboard → **Plugins** (Sidebar)
2. Find plugin in list
3. Click **Enable** button
4. Configure plugin (if UI available)

See **[Plugin List](./Plugin-Liste.md#english)** for all 31 available plugins.

---

### 🎨 OBS Setup {#obs-setup-english}

#### Install OBS Studio

1. Download: [obsproject.com](https://obsproject.com/)
2. Version **29.0 or higher** recommended
3. Perform standard installation

#### Enable OBS WebSocket (for Multi-Cam plugin)

1. OBS → **Tools** → **WebSocket Server Settings**
2. Enable **"Enable WebSocket server"**
3. Port: **4455** (default)
4. Set password (optional)
5. Click **OK**

**In LTTH:**
```
Dashboard → Plugins → Multi-Cam Switcher → Configure
OBS WebSocket:
  Host: localhost
  Port: 4455
  Password: (your password)
→ Connect
```

---

### 💡 Common First Steps {#common-first-steps-english}

#### Have Chat Messages Read Aloud

**Automatically:**
```
Dashboard → TTS → Enable Auto-TTS for Chat
```

**Blacklist (don't read certain words):**
```
Dashboard → TTS → Blacklist
→ Add words (e.g. "spam", "bad word")
```

#### Connect Gifts with Sounds

```
Dashboard → Plugins → Soundboard → Enable
→ Configure
→ Gift Mappings
→ Rose → Select sound
→ Save
```

#### Switch Camera via Chat

```
Dashboard → Plugins → Multi-Cam Switcher → Enable
→ Configure
→ Connect OBS
→ Enable chat commands

In chat: !cam 1 (or !cam 2, !cam 3, etc.)
```

---

### 🎓 Next Steps {#next-steps-english}

#### Explore Advanced Features

**1. Flow System (Event Automation):**
```
Dashboard → Flows → Create new flow
Example:
  Trigger: Gift = "Rose"
  Actions:
    1. TTS: "Thanks {username} for the Rose!"
    2. OBS: Switch scene to "Cam2"
    3. OSC: Wave gesture in VRChat
```

**2. Enable WebGPU Plugins:**
- **WebGPU Emoji Rain** - GPU-accelerated emoji effect

**3. Viewer XP System:**
```
Dashboard → Plugins → Viewer XP System → Enable
→ Configure XP rewards
→ Add leaderboard overlay
```

#### Read Documentation

- **[Plugin List](./Plugin-Liste.md#english)** - all 35 Plugins in detail
- **[Configuration](./Konfiguration.md#english)** - Advanced settings
- **[FAQ & Troubleshooting](./FAQ-&-Troubleshooting.md#english)** - Solve common problems

---

### 🎉 Good Luck with Your Stream!

You are now ready for your first professional TikTok LIVE stream with Little TikTool Helper!

**Tips for Getting Started:**
- Test everything **before** your first live stream
- Use **Test Alerts** and **Test TTS**
- Start with few plugins and expand gradually
- Read **[FAQ & Troubleshooting](./FAQ-&-Troubleshooting.md#english)** if you have problems

---

[← Home](Home#english) | [→ Installation & Setup](Installation-&-Setup#english)

---

*Last updated: 2025-12-11*
*Version: 1.2.1*

---
