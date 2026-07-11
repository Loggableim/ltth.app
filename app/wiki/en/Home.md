# 🇬🇧 English

Welcome to **PupCid's Little TikTool Helper**!

This is a free, open-source tool for professional TikTok LIVE streaming with comprehensive features for content creators.

### Quick Links
- [Getting Started](./Getting-Started.md#english)
- [Installation](./Installation-&-Setup.md#english)
- [Plugin List](./Plugin-Liste.md#english)
- [FAQ](./FAQ-&-Troubleshooting.md#english)

### 🎯 About the Project

**PupCid's Little TikTool Helper** is a professional open-source tool for TikTok-compatible LIVE streaming with extensive features for content creators. The tool provides complete integration of TikTok LIVE events into OBS Studio with overlays, alerts, text-to-speech, soundboard, and event automation.

### ✨ Key Features

- **🔒 100% Local** - No cloud services, no login required
- **🎨 Professional Overlays** - Full-HD browser sources for OBS Studio
- **🔌 Modular Plugin System** - Easily extensible through plugins
- **🌍 Multi-Language** - German and English user interface
- **⚡ Real-time Updates** - WebSocket-based live communication
- **🎭 Event Automation** - If-then rules without code

### 🎤 Who is this tool for?

- **TikTok LIVE Streamers** - Professional overlays and alerts
- **Content Creators** - Event automation and interactivity
- **VRChat Streamers** - OSC integration for avatar control
- **Multi-Guest Streamers** - VDO.Ninja integration for interviews
- **Developers** - Modular plugin system for extension

### 🚀 Main Features

#### 1. TikTok LIVE Integration

Real-time connection to TikTok LIVE streams with all events:

- ✅ **Gifts** - Gifts with coins, combo tracking, gift catalog
- ✅ **Chat** - Messages with profile pictures and badges
- ✅ **Follows** - New followers with follow-role tracking
- ✅ **Shares** - Stream shares with user information
- ✅ **Likes** - Like events with like counts
- ✅ **Subscriptions** - Subscribers with tier levels

#### 2. Text-to-Speech (TTS)

Professional TTS system with 100+ voices:

- 🎙️ **75+ TikTok Voices** - Free, no API keys required
- 🎙️ **30+ Google Cloud Voices** - Optional with API key
- 👤 **User Voice Mappings** - Users get their own voices assigned
- 📝 **Auto-TTS for Chat** - Automatic reading of chat messages
- 🚫 **Blacklist Filter** - Exclude words/users
- 🎚️ **Volume & Speed** - Adjust volume and speed

#### 3. Alert System

Customizable alerts for all TikTok events:

- 🔊 **Sound + Text + Animation** - Fully configurable alerts
- 🖼️ **Images & GIFs** - Custom alert graphics
- ⏱️ **Duration Control** - Set alert display duration
- 🎨 **Custom Templates** - Placeholders like `{username}`, `{giftName}`, `{coins}`
- 🧪 **Test Mode** - Test alerts before the stream

#### 4. Soundboard

100,000+ sounds with gift mapping:

- 🔍 **MyInstants Integration** - Access to huge sound library
- 🎁 **Gift-to-Sound Mapping** - Rose → Sound A, Lion → Sound B
- 🎵 **Event Sounds** - Sounds for Follow, Subscribe, Share
- ⚡ **Like Threshold System** - Trigger sounds at X likes
- 📦 **Custom Upload** - Upload your own MP3s
- ⭐ **Favorites & Trending** - Organize sounds

#### 5. Goals & Progress Bars

4 separate goals with browser source overlays:

- 📊 **Likes Goal** - Like goal with progress bar
- 👥 **Followers Goal** - Follower goal with tracking
- 💎 **Subscriptions Goal** - Subscriber goal
- 🪙 **Coins Goal** - Coin goal (donations)
- 🎨 **Custom Styles** - Customize colors, gradients, labels
- ➕ **Add/Set/Increment** - Flexible mode selection

#### 6. Event Automation (Flows)

"If-then" automations without code:

- 🔗 **Triggers** - Gift, Chat, Follow, Subscribe, Share, Like
- ⚙️ **Conditions** - Conditions with operators (==, !=, >=, <=, contains)
- ⚡ **Actions** - TTS, Alert, OBS Scene, OSC, HTTP Request, Delay
- 🧩 **Multi-Step** - Multiple actions in sequence
- ✅ **Test Mode** - Test flows before the stream

**Example Flow:**
```
Trigger: Gift == "Rose"
Actions:
  1. TTS: "Thanks {username} for the Rose!"
  2. OBS Scene: Switch to "Cam2"
  3. OSC: Wave gesture in VRChat
```

### 💻 Technology Stack

| Category | Technology | Version |
|----------|------------|---------|
| **Backend** | Node.js | >=18.0.0 <25.0.0 |
| **Web Framework** | Express | ^4.18.2 |
| **Real-time** | Socket.io | ^4.6.1 |
| **Database** | SQLite (better-sqlite3) | ^11.9.0 |
| **TikTok API** | Eulerstream SDK / TikFinity Adapter | app adapters |
| **OBS Integration** | obs-websocket-js | ^5.0.6 |
| **OSC Protocol** | osc | ^2.4.5 |
| **Logging** | winston | ^3.18.3 |
| **Frontend** | Bootstrap 5 | 5.3 |
| **Icons** | Font Awesome | 6.x |

### ⚡ Quick Start

1. Install Node.js 18-23
2. Clone repository: `git clone https://github.com/Loggableim/ltth.app.git`
3. Change into the runtime folder: `cd app`
4. Install dependencies: `npm install`
5. Start server: `npm start`
6. Open dashboard: `http://localhost:3000/dashboard.html`
6. Connect to TikTok LIVE with your username

**Done!** 🎉 All events are now displayed live.

### 📄 License

This project is licensed under the **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)** license.

---

*Last updated: 2026-04-28*
*Version: 1.3.3*

---
