# Electron Desktop Application Implementation Guide

## 🎯 Mission
Convert this TikTok Stream Tool from a Node.js web application to a native Electron desktop application **WITHOUT code signing** to avoid additional costs. This guide provides complete step-by-step instructions for LLMs to implement.

## 📋 Prerequisites Check
- Node.js >= 18.0.0 installed
- Current application is working (test with `npm start`)
- Git repository is clean or changes are committed

## 🏗️ Implementation Overview

This implementation will:
- ✅ Wrap existing Express server in Electron
- ✅ Create system tray integration
- ✅ Build Windows (.exe), macOS (.dmg), and Linux (.AppImage) installers
- ✅ Implement auto-update via GitHub Releases
- ✅ Add auto-start functionality
- ⚠️ **NO code signing** (users will see SmartScreen warning on first run)

**Expected outcome:** Professional desktop app with ~150-200MB installer size.

---

## 📦 Phase 1: Electron Setup (Week 1)

### Step 1.1: Install Dependencies

Add to `package.json`:
```json
{
  "devDependencies": {
    "electron": "^28.1.0",
    "electron-builder": "^24.9.1",
    "concurrently": "^8.2.2"
  },
  "dependencies": {
    "electron-updater": "^6.1.7"
  }
}
```

Run:
```bash
npm install
```

### Step 1.2: Create Electron Main Process

Create `main.js` in root directory:

```javascript
const { app, BrowserWindow, Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('path');
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const { autoUpdater } = require('electron-updater');

// Import existing server modules
const Database = require('./modules/database');
const TikTokConnector = require('./modules/tiktok');
const AlertManager = require('./modules/alerts');
const FlowEngine = require('./modules/flows');
const { GoalManager } = require('./modules/goals');
const UserProfileManager = require('./modules/user-profiles');
const VDONinjaManager = require('./modules/vdoninja');
const logger = require('./modules/logger');
const { apiLimiter, authLimiter, uploadLimiter } = require('./modules/rate-limiter');
const i18n = require('./modules/i18n');
const SubscriptionTiers = require('./modules/subscription-tiers');
const Leaderboard = require('./modules/leaderboard');
const { setupSwagger } = require('./modules/swagger-config');
const PluginLoader = require('./modules/plugin-loader');
const { setupPluginRoutes } = require('./routes/plugin-routes');
const UpdateManager = require('./modules/update-manager');
const { Validators, ValidationError } = require('./modules/validators');
const PresetManager = require('./modules/preset-manager');

// Global references
let mainWindow = null;
let tray = null;
let expressApp = null;
let httpServer = null;
let io = null;
let db = null;
let tiktokConnector = null;

// Configuration
const PORT = 3000;
const isDev = !app.isPackaged;

// ========== EXPRESS SERVER SETUP ==========
function setupExpressServer() {
    // Copy all server.js logic here (lines 37-end from server.js)
    // This includes all your existing Express routes, middleware, Socket.io setup

    expressApp = express();
    httpServer = http.createServer(expressApp);
    io = socketIO(httpServer);

    // Middleware
    expressApp.use(express.json());

    // CORS (same as server.js)
    const ALLOWED_ORIGINS = [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:8080',
        'http://127.0.0.1:8080',
        'null'
    ];

    expressApp.use((req, res, next) => {
        const origin = req.headers.origin;
        if (origin && ALLOWED_ORIGINS.includes(origin)) {
            res.header('Access-Control-Allow-Origin', origin);
            res.header('Access-Control-Allow-Credentials', 'true');
        } else if (!origin) {
            res.header('Access-Control-Allow-Origin', 'null');
        }
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        next();
    });

    // Serve static files
    expressApp.use(express.static(path.join(__dirname, 'public')));

    // Initialize database
    db = new Database();

    // Initialize all modules (copy from server.js)
    // ... (all your existing initialization code)

    // Start server
    httpServer.listen(PORT, () => {
        logger.info(`Server running on http://localhost:${PORT}`);
    });
}

// ========== ELECTRON WINDOW MANAGEMENT ==========
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1200,
        minHeight: 700,
        icon: path.join(__dirname, 'build/icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        show: false, // Don't show until ready
        backgroundColor: '#1a1a1a'
    });

    // Load the app
    mainWindow.loadURL(`http://localhost:${PORT}`);

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        if (!app.getLoginItemSettings().wasOpenedAtLogin) {
            mainWindow.show();
        }
    });

    // Handle window close (minimize to tray instead)
    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();

            // Show notification
            if (tray) {
                tray.displayBalloon({
                    title: 'TikTok Stream Tool',
                    content: 'App minimized to tray. Right-click tray icon to quit.'
                });
            }
        }
        return false;
    });

    // Open DevTools in development
    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ========== SYSTEM TRAY ==========
function createTray() {
    // Create tray icon
    const iconPath = path.join(__dirname, 'build/tray-icon.png');
    const trayIcon = nativeImage.createFromPath(iconPath);
    tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));

    // Create context menu
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'TikTok Stream Tool',
            enabled: false,
            icon: trayIcon.resize({ width: 16, height: 16 })
        },
        { type: 'separator' },
        {
            label: 'Show Window',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
            }
        },
        {
            label: 'Connection Status',
            submenu: [
                {
                    label: 'Disconnected',
                    enabled: false,
                    id: 'connection-status'
                }
            ]
        },
        { type: 'separator' },
        {
            label: 'Auto-Start on Boot',
            type: 'checkbox',
            checked: app.getLoginItemSettings().openAtLogin,
            click: (menuItem) => {
                app.setLoginItemSettings({
                    openAtLogin: menuItem.checked,
                    openAsHidden: true
                });
            }
        },
        { type: 'separator' },
        {
            label: 'Check for Updates',
            click: () => {
                checkForUpdates();
            }
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                app.isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('TikTok Stream Tool');
    tray.setContextMenu(contextMenu);

    // Double-click to show window
    tray.on('double-click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

// Update tray connection status
function updateTrayStatus(connected, username = '') {
    if (!tray) return;

    const contextMenu = tray.getContextMenu();
    const statusItem = contextMenu.getMenuItemById('connection-status');

    if (statusItem) {
        statusItem.label = connected
            ? `✅ Connected to @${username}`
            : '❌ Disconnected';
    }

    tray.setContextMenu(contextMenu);
}

// ========== AUTO-UPDATER ==========
function setupAutoUpdater() {
    // Configure auto-updater
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (info) => {
        dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Update Available',
            message: `Version ${info.version} is available. Download now?`,
            buttons: ['Download', 'Later']
        }).then((result) => {
            if (result.response === 0) {
                autoUpdater.downloadUpdate();
            }
        });
    });

    autoUpdater.on('update-downloaded', (info) => {
        dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Update Ready',
            message: 'Update downloaded. Restart now to install?',
            buttons: ['Restart', 'Later']
        }).then((result) => {
            if (result.response === 0) {
                autoUpdater.quitAndInstall();
            }
        });
    });

    autoUpdater.on('error', (error) => {
        logger.error('Auto-updater error:', error);
    });
}

function checkForUpdates() {
    autoUpdater.checkForUpdates().catch((error) => {
        logger.error('Update check failed:', error);
    });
}

// ========== APP LIFECYCLE ==========
app.on('ready', async () => {
    // Setup Express server first
    setupExpressServer();

    // Wait a bit for server to start
    setTimeout(() => {
        createWindow();
        createTray();
        setupAutoUpdater();

        // Check for updates on startup (silently)
        if (!isDev) {
            setTimeout(() => {
                autoUpdater.checkForUpdates();
            }, 5000);
        }
    }, 1000);
});

app.on('window-all-closed', () => {
    // Don't quit on macOS
    if (process.platform !== 'darwin') {
        // Don't quit, just hide
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    } else {
        mainWindow.show();
    }
});

app.on('before-quit', () => {
    app.isQuitting = true;
});

// Cleanup on quit
app.on('will-quit', () => {
    if (httpServer) {
        httpServer.close();
    }
    if (db) {
        db.close();
    }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection:', reason);
});
```

### Step 1.3: Create Preload Script

Create `preload.js`:

```javascript
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld('electron', {
    platform: process.platform,
    isElectron: true,

    // Add any custom IPC methods here later if needed
    send: (channel, data) => {
        // Whitelist channels
        const validChannels = ['toMain'];
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },

    receive: (channel, func) => {
        const validChannels = ['fromMain'];
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => func(...args));
        }
    }
});
```

### Step 1.4: Update package.json

Modify `package.json`:

```json
{
  "name": "tiktok-stream-tool",
  "version": "1.0.3",
  "description": "Professional TikTok LIVE streaming tool with overlays, alerts, TTS and automation",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "start:web": "node server.js",
    "dev": "concurrently \"npm run start\" \"npm run watch:css\"",
    "build:css": "tailwindcss -i ./public/css/tailwind.input.css -o ./public/css/tailwind.output.css --minify",
    "watch:css": "tailwindcss -i ./public/css/tailwind.input.css -o ./public/css/tailwind.output.css --watch",
    "build": "npm run build:css && electron-builder",
    "build:win": "npm run build:css && electron-builder --win",
    "build:mac": "npm run build:css && electron-builder --mac",
    "build:linux": "npm run build:css && electron-builder --linux",
    "dist": "npm run build"
  },
  "build": {
    "appId": "com.tiktok-stream-tool.app",
    "productName": "TikTok Stream Tool",
    "copyright": "Copyright © 2025",
    "directories": {
      "output": "dist",
      "buildResources": "build"
    },
    "files": [
      "**/*",
      "!**/*.ts",
      "!*.code-workspace",
      "!LICENSE.md",
      "!package-lock.json",
      "!**/{.DS_Store,.git,.hg,.svn,CVS,RCS,SCCS,.gitignore,.gitattributes}",
      "!**/{__pycache__,thumbs.db,.flowconfig,.idea,.vs,.nyc_output}",
      "!**/{appveyor.yml,.travis.yml,circle.yml}",
      "!**/{npm-debug.log,yarn.lock,.yarn-integrity,.yarn-metadata.json}",
      "!dist",
      "!node_modules/electron",
      "!node_modules/electron-builder"
    ],
    "win": {
      "target": [
        {
          "target": "nsis",
          "arch": ["x64"]
        }
      ],
      "icon": "build/icon.ico",
      "artifactName": "${productName}-Setup-${version}.${ext}"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "shortcutName": "TikTok Stream Tool",
      "runAfterFinish": true,
      "installerIcon": "build/icon.ico",
      "uninstallerIcon": "build/icon.ico",
      "installerHeader": "build/installer-header.bmp",
      "installerSidebar": "build/installer-sidebar.bmp"
    },
    "mac": {
      "target": [
        {
          "target": "dmg",
          "arch": ["x64", "arm64"]
        }
      ],
      "icon": "build/icon.icns",
      "category": "public.app-category.utilities",
      "artifactName": "${productName}-${version}-${arch}.${ext}"
    },
    "dmg": {
      "contents": [
        {
          "x": 130,
          "y": 220
        },
        {
          "x": 410,
          "y": 220,
          "type": "link",
          "path": "/Applications"
        }
      ]
    },
    "linux": {
      "target": [
        {
          "target": "AppImage",
          "arch": ["x64"]
        },
        {
          "target": "deb",
          "arch": ["x64"]
        }
      ],
      "icon": "build/icon.png",
      "category": "Network",
      "artifactName": "${productName}-${version}.${ext}"
    },
    "publish": {
      "provider": "github",
      "owner": "YOUR_GITHUB_USERNAME",
      "repo": "pupcidslittletiktokhelper",
      "private": false
    }
  }
}
```

**IMPORTANT:** Replace `YOUR_GITHUB_USERNAME` with actual GitHub username!

### Step 1.5: Create Build Assets

Create `build/` directory with icons:

1. **Windows Icon** (`build/icon.ico`):
   - 256x256 PNG converted to ICO
   - Use online converter: https://convertio.co/png-ico/

2. **macOS Icon** (`build/icon.icns`):
   - 512x512 PNG converted to ICNS
   - Use online converter or `png2icns` tool

3. **Linux Icon** (`build/icon.png`):
   - 512x512 PNG

4. **Tray Icon** (`build/tray-icon.png`):
   - 32x32 PNG (white/transparent for dark backgrounds)

5. **Optional Installer Graphics**:
   - `build/installer-header.bmp` (150x57, Windows)
   - `build/installer-sidebar.bmp` (164x314, Windows)

### Step 1.6: Test Electron App

```bash
npm start
```

**Expected result:**
- Electron window opens with your app
- System tray icon appears
- Close button minimizes to tray
- Double-click tray shows window

**Troubleshooting:**
- If window doesn't load: Check console for errors, ensure server starts
- If icons missing: Check paths in `main.js`
- If tray doesn't work: Check icon format (PNG, 16x16 or 32x32)

---

## 🔧 Phase 2: System Tray Enhancements (Week 2)

### Step 2.1: Connection Status Updates

Add to `main.js` after Express setup:

```javascript
// Listen to Socket.io connection events
io.on('connection', (socket) => {
    socket.on('tiktok:connected', (data) => {
        updateTrayStatus(true, data.username);
    });

    socket.on('tiktok:disconnected', () => {
        updateTrayStatus(false);
    });
});
```

### Step 2.2: Tray Notifications

Add notification system:

```javascript
const { Notification } = require('electron');

function showNotification(title, body, silent = false) {
    if (!Notification.isSupported()) return;

    new Notification({
        title,
        body,
        icon: path.join(__dirname, 'build/icon.png'),
        silent
    }).show();
}

// Usage: Listen to Socket.io events
io.on('connection', (socket) => {
    socket.on('gift:received', (data) => {
        if (data.giftValue > 1000) { // Only for expensive gifts
            showNotification(
                'Large Gift Received!',
                `${data.username} sent ${data.giftName} (${data.giftValue} coins)`,
                false
            );
        }
    });
});
```

### Step 2.3: Settings Persistence

Electron stores user data differently. Update settings save location:

```javascript
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

// Get user data path
const userDataPath = app.getPath('userData');
const configPath = path.join(userDataPath, 'user_configs');

// Ensure directory exists
if (!fs.existsSync(configPath)) {
    fs.mkdirSync(configPath, { recursive: true });
}

// Use this path in Database module
// Modify modules/database.js to accept custom path
```

---

## 📦 Phase 3: Building & Distribution (Week 3)

### Step 3.1: Build for Windows

```bash
npm run build:win
```

**Output:**
- `dist/TikTok Stream Tool-Setup-1.0.3.exe` (~150-200MB)

**What users will see:**
1. Download .exe file
2. Windows SmartScreen warning: "Windows protected your PC"
3. Click "More info" → "Run anyway"
4. NSIS installer opens
5. Choose install location
6. Desktop shortcut created
7. App launches

**Expected warnings:**
- ✅ SmartScreen: Expected (no code signing)
- ❌ Virus warning: Should NOT happen (if it does, file false positive report)

### Step 3.2: Build for macOS

```bash
npm run build:mac
```

**Output:**
- `dist/TikTok Stream Tool-1.0.3-x64.dmg`
- `dist/TikTok Stream Tool-1.0.3-arm64.dmg`

**What users will see:**
1. Download .dmg file
2. Open DMG
3. Drag app to Applications folder
4. Open from Applications
5. Gatekeeper warning: "Cannot be opened because developer cannot be verified"
6. Right-click → Open → Confirm

### Step 3.3: Build for Linux

```bash
npm run build:linux
```

**Output:**
- `dist/TikTok Stream Tool-1.0.3.AppImage`
- `dist/TikTok Stream Tool-1.0.3.deb`

**AppImage usage:**
```bash
chmod +x TikTok\ Stream\ Tool-1.0.3.AppImage
./TikTok\ Stream\ Tool-1.0.3.AppImage
```

### Step 3.4: GitHub Releases Setup

1. Create GitHub Release:
```bash
git tag v1.0.3
git push origin v1.0.3
```

2. Upload build artifacts to GitHub Release:
   - `TikTok Stream Tool-Setup-1.0.3.exe`
   - `TikTok Stream Tool-1.0.3-x64.dmg`
   - `TikTok Stream Tool-1.0.3-arm64.dmg`
   - `TikTok Stream Tool-1.0.3.AppImage`
   - `latest.yml` (auto-generated by electron-builder)
   - `latest-mac.yml` (auto-generated)

3. Auto-updater will check this release for updates

---

## 🚀 Phase 4: Auto-Update Implementation (Week 4)

### Step 4.1: Configure Update Server

In `package.json`, ensure publish is set:

```json
"publish": {
  "provider": "github",
  "owner": "YOUR_GITHUB_USERNAME",
  "repo": "pupcidslittletiktokhelper",
  "private": false
}
```

### Step 4.2: Test Auto-Update Flow

1. Build version 1.0.3: `npm run build`
2. Upload to GitHub Release v1.0.3
3. Bump version to 1.0.4 in `package.json`
4. Build version 1.0.4: `npm run build`
5. Upload to GitHub Release v1.0.4
6. Run version 1.0.3 installer
7. App should detect update and prompt

**Testing checklist:**
- ✅ Update notification appears
- ✅ Download progress works
- ✅ "Restart to update" prompt works
- ✅ App restarts with new version

---

## 📝 Migration Checklist

Before releasing Electron version:

### Code Changes
- [ ] Create `main.js` with server logic
- [ ] Create `preload.js`
- [ ] Update `package.json` with Electron deps and build config
- [ ] Move server initialization to `main.js`
- [ ] Setup tray icon and menu
- [ ] Implement auto-updater
- [ ] Add connection status updates to tray
- [ ] Add notifications for important events

### Assets
- [ ] Create `build/icon.ico` (Windows)
- [ ] Create `build/icon.icns` (macOS)
- [ ] Create `build/icon.png` (Linux)
- [ ] Create `build/tray-icon.png` (Tray)
- [ ] Optional: Create installer graphics

### Testing
- [ ] Test on Windows 10/11
- [ ] Test on macOS (Intel & Apple Silicon if possible)
- [ ] Test on Linux (Ubuntu/Debian)
- [ ] Test minimize to tray
- [ ] Test auto-start on boot
- [ ] Test auto-update flow
- [ ] Test all existing features work
- [ ] Test TikTok connection
- [ ] Test plugins
- [ ] Test settings persistence

### Distribution
- [ ] Update GitHub username in `package.json`
- [ ] Build all platforms: `npm run build`
- [ ] Create GitHub Release
- [ ] Upload all installers
- [ ] Write installation instructions for README
- [ ] Document SmartScreen/Gatekeeper bypass steps

### Documentation
- [ ] Update README.md with Electron install instructions
- [ ] Add section about SmartScreen warning
- [ ] Add system requirements
- [ ] Add uninstall instructions
- [ ] Update screenshots

---

## 📖 User Documentation Template

Add to README.md:

```markdown
## Installation

### Windows
1. Download `TikTok Stream Tool-Setup-{version}.exe` from [Releases](https://github.com/YOUR_USERNAME/pupcidslittletiktokhelper/releases)
2. Run the installer
3. **Important:** Windows SmartScreen will show a warning (this is normal for unsigned apps)
   - Click "More info"
   - Click "Run anyway"
4. Follow installation wizard
5. App will launch automatically

### macOS
1. Download `TikTok Stream Tool-{version}-{arch}.dmg` from [Releases](https://github.com/YOUR_USERNAME/pupcidslittletiktokhelper/releases)
   - Intel Macs: Use `x64` version
   - Apple Silicon (M1/M2): Use `arm64` version
2. Open DMG file
3. Drag app to Applications folder
4. **Important:** Right-click the app and select "Open" (don't double-click)
   - Click "Open" in Gatekeeper dialog
5. Subsequent launches can be done normally

### Linux
1. Download `TikTok Stream Tool-{version}.AppImage` from [Releases](https://github.com/YOUR_USERNAME/pupcidslittletiktokhelper/releases)
2. Make executable:
   ```bash
   chmod +x TikTok\ Stream\ Tool-*.AppImage
   ```
3. Run:
   ```bash
   ./TikTok\ Stream\ Tool-*.AppImage
   ```

## System Tray

The app minimizes to the system tray for convenient background operation:
- **Double-click tray icon:** Show/hide window
- **Right-click tray icon:** Access menu
  - Connection status
  - Auto-start settings
  - Check for updates
  - Quit

## Auto-Updates

The app automatically checks for updates on startup. When an update is available:
1. Notification appears
2. Click "Download" to download in background
3. When ready, click "Restart" to install

## Auto-Start

Enable auto-start from the tray menu:
1. Right-click tray icon
2. Check "Auto-Start on Boot"
3. App will start minimized to tray on system boot
```

---

## 🐛 Troubleshooting

### Build Issues

**Error: `Cannot find module 'electron'`**
```bash
npm install --save-dev electron
```

**Error: `ENOENT: no such file or directory, open 'build/icon.ico'`**
- Create icon files in `build/` directory
- Check file names match exactly

**Error: `Application entry file "main.js" does not exist`**
- Check `package.json` has `"main": "main.js"`
- Check `main.js` exists in root directory

### Runtime Issues

**Window doesn't load (blank screen)**
- Check DevTools console for errors
- Ensure Express server starts before window creation
- Check port 3000 is not in use

**Tray icon not showing**
- Check icon path is correct
- Ensure icon is PNG format
- Try different icon size (16x16, 32x32)

**Auto-update not working**
- Check `package.json` has correct GitHub repo
- Ensure `latest.yml` is uploaded to GitHub Release
- Check app version is lower than release version

### Windows-Specific

**SmartScreen blocks download**
- Users must click "More info" → "Run anyway"
- This is normal for unsigned apps
- Add note in README

**Installer not creating shortcuts**
- Check NSIS config in `package.json`
- Ensure `createDesktopShortcut: true`

### macOS-Specific

**"App is damaged and can't be opened"**
- This is Gatekeeper blocking unsigned apps
- Users must right-click → Open (not double-click)

**App won't run on Apple Silicon**
- Ensure you built with `arm64` architecture
- Or use Rosetta (automatic)

### Linux-Specific

**AppImage won't run**
- Ensure `chmod +x` was run
- Check FUSE is installed: `sudo apt install fuse`

---

## 🎯 Success Criteria

After implementation, verify:

✅ **Functionality:**
- All existing features work identically
- TikTok connection works
- Plugins load correctly
- Settings persist across restarts
- Database operations work

✅ **User Experience:**
- App window opens on launch
- System tray icon appears
- Minimize to tray works
- Auto-start works (optional)
- Updates can be installed

✅ **Distribution:**
- Windows installer works (.exe)
- macOS installer works (.dmg)
- Linux AppImage works
- Installers are ~150-200MB
- README has clear install instructions

✅ **Performance:**
- App starts in < 5 seconds
- Memory usage similar to web version
- CPU usage acceptable
- No crashes or freezes

---

## 📊 Expected Timeline

- **Week 1:** Electron setup, basic window, tray
- **Week 2:** System tray enhancements, notifications
- **Week 3:** Building, testing, icon creation
- **Week 4:** Auto-update, documentation, release

**Total: 4 weeks for complete implementation**

---

## 🔗 Resources

- [Electron Documentation](https://www.electronjs.org/docs/latest)
- [electron-builder Docs](https://www.electron.build/)
- [electron-updater Guide](https://www.electron.build/auto-update)
- [Tray API](https://www.electronjs.org/docs/latest/api/tray)
- [BrowserWindow API](https://www.electronjs.org/docs/latest/api/browser-window)

---

## ⚠️ Important Notes for LLMs

1. **DO NOT remove `server.js`** - keep it for backwards compatibility
2. **DO copy all server logic to `main.js`** - don't try to import server.js
3. **DO test on actual OS** - VMs may have different behavior
4. **DO create all icon files** - app won't build without them
5. **DO update GitHub username** in package.json publish config
6. **DO NOT attempt code signing** - this guide is explicitly for unsigned builds
7. **DO document SmartScreen warning** - users need to know it's normal

---

**Last Updated:** 2025-11-13
**Status:** Ready for Implementation
**Estimated Effort:** 4 weeks
**Cost:** $0 (no code signing)
