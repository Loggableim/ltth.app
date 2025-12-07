# ARCHITECTURE_SPEC.md — Electron Desktop App Technisches Design

**Erstellt:** 2025-11-27  
**Version:** 1.0.0  
**Projekt:** PupCid's Little TikTool Helper (LTTH)  
**Ziel:** Production-Ready Electron Desktop App

---

## 1. Electron Tri-Core Architektur

### 1.1 Architektur-Übersicht

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ELECTRON APPLICATION                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                        MAIN PROCESS                               │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │   │
│  │  │   App       │  │   IPC       │  │   Child Process         │  │   │
│  │  │   Lifecycle │  │   Hub       │  │   Manager               │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘  │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │   │
│  │  │   Tray      │  │   Auto      │  │   Window                │  │   │
│  │  │   Menu      │  │   Updater   │  │   Manager               │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│                     ┌──────────────┴──────────────┐                     │
│                     │         IPC Bridge          │                     │
│                     └──────────────┬──────────────┘                     │
│                                    │                                     │
│  ┌─────────────────────────────────┴─────────────────────────────────┐  │
│  │                      RENDERER PROCESSES                            │  │
│  │  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────┐  │  │
│  │  │   Dashboard       │  │   Overlay         │  │   Settings    │  │  │
│  │  │   Window          │  │   Windows (1-n)   │  │   Window      │  │  │
│  │  │   (main UI)       │  │   (transparent)   │  │   (modal)     │  │  │
│  │  └───────────────────┘  └───────────────────┘  └───────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                    │                                     │
│                     ┌──────────────┴──────────────┐                     │
│                     │     Preload Scripts         │                     │
│                     │  (contextBridge API)        │                     │
│                     └─────────────────────────────┘                     │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                         CHILD PROCESSES                                  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                     NODE.JS BACKEND                                │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐   │  │
│  │  │   Express   │  │   Socket.io │  │   Plugin                │   │  │
│  │  │   Server    │  │   Server    │  │   Loader                │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘   │  │
│  │  Port: 3210 (localhost only)                                      │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                     RUST SIDECAR (Optional)                        │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐   │  │
│  │  │   AI/ML     │  │   TTS       │  │   Audio                 │   │  │
│  │  │   Engine    │  │   Engine    │  │   Processing            │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘   │  │
│  │  Communication: stdin/stdout JSON or Unix Socket                  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Prozess-Kommunikation

```
Main Process ◄──────────► Renderer (IPC)
      │
      ├──────► Backend Child (spawn + stdio)
      │              │
      │              └──────► HTTP/WebSocket (localhost:3210)
      │
      └──────► Rust Sidecar (spawn + stdio/socket)
```

---

## 2. IPC-Contract

### 2.1 Preload API Surface (`window.ltth`)

```typescript
interface LTTHElectronAPI {
  // === App Lifecycle ===
  app: {
    getVersion(): Promise<string>;
    getPlatform(): string;
    quit(): void;
    minimize(): void;
    maximize(): void;
    isMaximized(): Promise<boolean>;
  };

  // === Settings ===
  settings: {
    get(key: string): Promise<any>;
    set(key: string, value: any): Promise<void>;
    getAll(): Promise<Record<string, any>>;
    openFolder(type: 'userData' | 'logs' | 'plugins'): Promise<void>;
  };

  // === Backend Control ===
  backend: {
    getStatus(): Promise<BackendStatus>;
    start(): Promise<boolean>;
    stop(): Promise<boolean>;
    restart(): Promise<boolean>;
    getLogs(lines?: number): Promise<string[]>;
  };

  // === Plugin Control ===
  plugin: {
    list(): Promise<PluginInfo[]>;
    enable(id: string): Promise<boolean>;
    disable(id: string): Promise<boolean>;
    install(id: string): Promise<boolean>;
    uninstall(id: string): Promise<boolean>;
    openSettings(id: string): void;
  };

  // === Overlay Control ===
  overlay: {
    open(name: string, options?: OverlayOptions): Promise<void>;
    close(name: string): Promise<void>;
    list(): Promise<string[]>;
    setClickThrough(name: string, enabled: boolean): Promise<void>;
    setAlwaysOnTop(name: string, enabled: boolean): Promise<void>;
  };

  // === Updater ===
  updater: {
    check(): Promise<UpdateInfo>;
    download(): Promise<void>;
    install(): void;
    onProgress(callback: (progress: number) => void): void;
  };

  // === System ===
  system: {
    openExternal(url: string): Promise<void>;
    showItemInFolder(path: string): void;
    getPath(name: string): Promise<string>;
  };

  // === Events ===
  on(channel: string, callback: (...args: any[]) => void): void;
  off(channel: string, callback: (...args: any[]) => void): void;
}

interface BackendStatus {
  running: boolean;
  pid?: number;
  port: number;
  uptime?: number;
  health: 'healthy' | 'unhealthy' | 'starting' | 'stopped';
}

interface PluginInfo {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  hasUI: boolean;
}

interface OverlayOptions {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  transparent?: boolean;
  clickThrough?: boolean;
  alwaysOnTop?: boolean;
}

interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseNotes?: string;
  releaseDate?: string;
}
```

### 2.2 IPC Channel Names

```javascript
// Main → Renderer
const CHANNELS = {
  // Backend Events
  'backend:status': 'Backend status changed',
  'backend:log': 'Backend log line',
  'backend:error': 'Backend error',
  
  // Update Events
  'updater:checking': 'Checking for updates',
  'updater:available': 'Update available',
  'updater:not-available': 'No update available',
  'updater:progress': 'Download progress',
  'updater:downloaded': 'Update downloaded',
  'updater:error': 'Update error',
  
  // Window Events
  'window:focus': 'Window focused',
  'window:blur': 'Window blurred',
  'window:maximize': 'Window maximized',
  'window:unmaximize': 'Window unmaximized',
  
  // System Events
  'system:power-suspend': 'System suspending',
  'system:power-resume': 'System resuming',
};
```

---

## 3. Security Policy

### 3.1 Renderer Security

```javascript
// BrowserWindow Configuration
const windowConfig = {
  webPreferences: {
    // === REQUIRED FOR SECURITY ===
    contextIsolation: true,      // Isolate preload from renderer
    nodeIntegration: false,      // No Node.js in renderer
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    sandbox: true,               // Enable Chromium sandbox
    
    // === PRELOAD ===
    preload: path.join(__dirname, 'preload.js'),
    
    // === ADDITIONAL ===
    enableRemoteModule: false,   // Deprecated, ensure disabled
    worldSafeExecuteJavaScript: true,
    webSecurity: true,           // Enable same-origin policy
    allowRunningInsecureContent: false,
  }
};
```

### 3.2 Content Security Policy

```javascript
// CSP for Electron Renderer
const CSP = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'"],  // Tailwind needs inline
  'img-src': ["'self'", 'data:', 'blob:', 'https:'],
  'font-src': ["'self'", 'data:'],
  'connect-src': [
    "'self'",
    'http://127.0.0.1:3210',
    'ws://127.0.0.1:3210',
    'wss://ws.eulerstream.com',
    'https://www.eulerstream.com',
  ],
  'media-src': ["'self'", 'blob:', 'data:', 'https:'],
  'frame-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
};
```

### 3.3 Overlay Window Security (Relaxed)

```javascript
// Overlay windows need special handling for WebGPU/WebGL
const overlayConfig = {
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,  // Required for WebGPU
    preload: path.join(__dirname, 'preload-overlay.js'),
    webgl: true,
    experimentalFeatures: true,
  }
};
```

---

## 4. Backend as Child Process

### 4.1 Spawn Configuration

```javascript
// commands.js - Backend Launcher
const { spawn } = require('child_process');
const path = require('path');

class BackendManager {
  constructor(options = {}) {
    this.port = options.port || 3210;
    this.process = null;
    this.logPath = options.logPath;
    this.healthCheckInterval = null;
  }

  async start() {
    const serverPath = path.join(__dirname, '..', 'app', 'server.js');
    
    this.process = spawn(process.execPath, [serverPath], {
      env: {
        ...process.env,
        PORT: this.port.toString(),
        ELECTRON: 'true',
        NODE_ENV: 'production',
        OPEN_BROWSER: 'false',  // Don't auto-open browser
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: path.join(__dirname, '..', 'app'),
    });

    // Pipe stdout/stderr to log files
    this.setupLogging();
    
    // Start health check
    await this.waitForHealth();
    
    return true;
  }

  async waitForHealth(timeout = 30000) {
    const startTime = Date.now();
    const healthUrl = `http://127.0.0.1:${this.port}/api/init-state`;

    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(healthUrl);
        if (response.ok) {
          const state = await response.json();
          if (state.serverStarted) {
            return true;
          }
        }
      } catch (e) {
        // Server not ready yet
      }
      await new Promise(r => setTimeout(r, 500));
    }
    throw new Error('Backend health check timeout');
  }

  stop() {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
  }
}
```

### 4.2 Health Check Loop

```javascript
// Continuous health monitoring
startHealthCheck(intervalMs = 5000) {
  this.healthCheckInterval = setInterval(async () => {
    try {
      const response = await fetch(
        `http://127.0.0.1:${this.port}/api/init-state`,
        { timeout: 3000 }
      );
      
      if (!response.ok) {
        this.emit('health:degraded', { status: response.status });
      } else {
        this.emit('health:ok');
      }
    } catch (error) {
      this.emit('health:error', { error: error.message });
      // Attempt restart
      await this.restart();
    }
  }, intervalMs);
}
```

### 4.3 Graceful Shutdown

```javascript
// On app quit
app.on('before-quit', async (event) => {
  if (backendManager.process) {
    event.preventDefault();
    
    // Give backend time to cleanup
    backendManager.process.kill('SIGTERM');
    
    await new Promise((resolve) => {
      backendManager.process.on('exit', resolve);
      setTimeout(resolve, 5000);  // Force after 5s
    });
    
    app.quit();
  }
});

// On crash
app.on('render-process-gone', async (event, webContents, details) => {
  if (details.reason === 'crashed') {
    // Restart backend if it crashed with renderer
    await backendManager.restart();
  }
});
```

---

## 5. WebGPU & GameMode Flags

### 5.1 Command Line Switches

```javascript
// main.js - Before app.ready
const { app } = require('electron');

// GPU Acceleration
app.commandLine.appendSwitch('enable-features', [
  'Vulkan',
  'WebGPU',
  'VaapiVideoDecoder',
  'VaapiVideoEncoder',
].join(','));

app.commandLine.appendSwitch('use-vulkan');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-hardware-overlays', 'single-fullscreen,single-on-top,underlay');

// WebGPU specific
app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-dawn-features', 'allow_unsafe_apis');

// Performance (GameMode-like)
app.commandLine.appendSwitch('disable-frame-rate-limit');
app.commandLine.appendSwitch('disable-gpu-vsync');
app.commandLine.appendSwitch('max-gum-fps', '60');

// Memory
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');
```

### 5.2 Overlay Window GPU Config

```javascript
// windows-config.js
const overlayWindowConfig = {
  width: 1920,
  height: 1080,
  transparent: true,
  frame: false,
  resizable: false,
  skipTaskbar: true,
  alwaysOnTop: true,
  hasShadow: false,
  type: 'toolbar',  // Prevents focus stealing
  
  webPreferences: {
    offscreen: false,
    backgroundThrottling: false,  // Keep animations smooth
    webgl: true,
    enableWebGPU: true,
  }
};
```

---

## 6. Rust Sidecar Integration

### 6.1 Strategy: Sidecar Binary (not NAPI)

**Begründung:**
- Unabhängige Kompilierung (keine Node.js ABI-Abhängigkeit)
- Einfacheres Update (Binary austauschen)
- Bessere Crash-Isolation
- Cross-Platform mit Cargo

### 6.2 CLI Contract

```
SIDECAR BINARY: ltth-ai-engine[.exe]

USAGE:
  ltth-ai-engine <COMMAND>

COMMANDS:
  tts     Text-to-Speech generation
  stt     Speech-to-Text transcription
  llm     Local LLM inference
  health  Health check

TTS MODE:
  Input:  JSON via stdin
  Output: WAV audio via stdout (binary) OR base64 JSON

  Input Schema:
  {
    "text": "Hello world",
    "voice": "default",
    "speed": 1.0,
    "pitch": 1.0,
    "format": "wav" | "base64"
  }

  Output Schema (base64 mode):
  {
    "success": true,
    "audio": "<base64 encoded audio>",
    "duration_ms": 1234,
    "sample_rate": 22050
  }

HEALTH CHECK:
  $ ltth-ai-engine health
  {"status":"ok","version":"1.0.0","capabilities":["tts","stt"]}
```

### 6.3 Spawn from Main Process

```javascript
// sidecar-manager.js
const { spawn } = require('child_process');
const path = require('path');

class SidecarManager {
  constructor() {
    this.process = null;
    this.binaryPath = this.getSidecarPath();
  }

  getSidecarPath() {
    const platform = process.platform;
    const arch = process.arch;
    const ext = platform === 'win32' ? '.exe' : '';
    
    // Look in resources for packaged app
    const resourcePath = process.resourcesPath || path.join(__dirname, '..');
    return path.join(resourcePath, 'sidecars', `ltth-ai-engine-${platform}-${arch}${ext}`);
  }

  async spawn(command, input) {
    return new Promise((resolve, reject) => {
      const child = spawn(this.binaryPath, [command], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => stdout += data);
      child.stderr.on('data', (data) => stderr += data);

      child.on('close', (code) => {
        if (code === 0) {
          try {
            resolve(JSON.parse(stdout));
          } catch {
            resolve(stdout);
          }
        } else {
          reject(new Error(`Sidecar exited with code ${code}: ${stderr}`));
        }
      });

      if (input) {
        child.stdin.write(JSON.stringify(input));
        child.stdin.end();
      }
    });
  }

  async tts(text, options = {}) {
    return this.spawn('tts', {
      text,
      voice: options.voice || 'default',
      speed: options.speed || 1.0,
      format: 'base64',
    });
  }

  async health() {
    return this.spawn('health');
  }
}
```

---

## 7. AutoUpdater Setup

### 7.1 electron-updater Configuration

```yaml
# electron-builder.yml
publish:
  provider: github
  owner: Loggableim
  repo: ltth_dev
  releaseType: release

# OR for S3/Generic
publish:
  provider: generic
  url: https://updates.ltth.app
  channel: latest
```

### 7.2 Updater Module

```javascript
// updater.js
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

class UpdaterManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    
    // Configure logging
    autoUpdater.logger = log;
    autoUpdater.logger.transports.file.level = 'info';
    
    // Configure update behavior
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    autoUpdater.on('checking-for-update', () => {
      this.sendToRenderer('updater:checking');
    });

    autoUpdater.on('update-available', (info) => {
      this.sendToRenderer('updater:available', {
        version: info.version,
        releaseNotes: info.releaseNotes,
        releaseDate: info.releaseDate,
      });
    });

    autoUpdater.on('update-not-available', () => {
      this.sendToRenderer('updater:not-available');
    });

    autoUpdater.on('download-progress', (progress) => {
      this.sendToRenderer('updater:progress', {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      this.sendToRenderer('updater:downloaded', {
        version: info.version,
      });
    });

    autoUpdater.on('error', (error) => {
      this.sendToRenderer('updater:error', {
        message: error.message,
      });
    });
  }

  sendToRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  async checkForUpdates() {
    return autoUpdater.checkForUpdates();
  }

  async downloadUpdate() {
    return autoUpdater.downloadUpdate();
  }

  quitAndInstall() {
    autoUpdater.quitAndInstall();
  }
}

module.exports = UpdaterManager;
```

---

## 8. Electron-Builder Configuration

### 8.1 Full Configuration

```yaml
# electron/electron-builder.yml
appId: com.pupcid.ltth
productName: "PupCid's Little TikTool Helper"
copyright: "Copyright © 2025 PupCid"

directories:
  output: dist
  buildResources: build

files:
  - "electron/**/*"
  - "app/**/*"
  - "!app/node_modules"
  - "!**/*.map"
  - "!**/test/**"
  - "!**/*.test.js"

extraResources:
  - from: "sidecars/"
    to: "sidecars"
    filter:
      - "**/*"

asar: true
asarUnpack:
  - "**/*.node"
  - "**/better-sqlite3/**"

# Windows
win:
  target:
    - target: nsis
      arch: [x64]
  icon: electron/assets/icons/icon.ico
  artifactName: "${productName}-${version}-win-${arch}.${ext}"

nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  installerIcon: electron/assets/icons/icon.ico
  uninstallerIcon: electron/assets/icons/icon.ico
  installerHeaderIcon: electron/assets/icons/icon.ico
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: "LTTH"

# macOS
mac:
  target:
    - target: dmg
      arch: [x64, arm64]
  icon: electron/assets/icons/icon.icns
  category: public.app-category.entertainment
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: electron/entitlements.mac.plist
  entitlementsInherit: electron/entitlements.mac.plist
  artifactName: "${productName}-${version}-mac-${arch}.${ext}"

dmg:
  background: electron/assets/dmg-background.png
  iconSize: 100
  contents:
    - x: 380
      y: 180
      type: link
      path: /Applications
    - x: 130
      y: 180
      type: file

# Linux
linux:
  target:
    - target: AppImage
      arch: [x64]
    - target: deb
      arch: [x64]
  icon: electron/assets/icons
  category: AudioVideo
  artifactName: "${productName}-${version}-linux-${arch}.${ext}"

appImage:
  artifactName: "${productName}-${version}.AppImage"

# Publish
publish:
  provider: github
  owner: Loggableim
  repo: ltth_dev
  releaseType: draft

# Native dependencies rebuild
npmRebuild: true
buildDependenciesFromSource: true

# Hooks
afterSign: electron/scripts/notarize.js
```

---

## 9. Directory Structure

```
ltth_dev/
├── electron/
│   ├── main.js                 # Main process entry
│   ├── preload.js              # Preload for main window
│   ├── preload-overlay.js      # Preload for overlay windows
│   ├── updater.js              # Auto-updater logic
│   ├── commands.js             # Backend process manager
│   ├── windows-config.js       # Window configurations
│   ├── sidecar-manager.js      # Rust sidecar spawner
│   ├── electron-builder.yml    # Build configuration
│   ├── entitlements.mac.plist  # macOS entitlements
│   ├── renderer-skeleton/
│   │   ├── index.html          # Dashboard shell
│   │   └── renderer.js         # Renderer script
│   ├── overlay-skeleton/
│   │   ├── index.html          # Overlay template
│   │   └── overlay.js          # WebGPU/PixiJS demo
│   ├── assets/
│   │   ├── icons/
│   │   │   ├── icon.ico        # Windows icon
│   │   │   ├── icon.icns       # macOS icon
│   │   │   └── icon.png        # Linux icons (multiple sizes)
│   │   └── dmg-background.png  # macOS DMG background
│   └── scripts/
│       └── notarize.js         # macOS notarization
├── sidecars/
│   ├── ai_engine/
│   │   ├── README.md           # Sidecar spec & contract
│   │   └── Cargo.toml          # Rust project (optional)
│   └── .gitkeep
├── tools/
│   ├── dev-electron.sh         # Dev mode script (Unix)
│   └── dev-electron.bat        # Dev mode script (Windows)
├── .github/
│   └── workflows/
│       ├── electron-ci.yml     # Build & test
│       └── electron-release.yml# Auto-release
├── ANALYSIS_AGENT_RESULT.md    # Phase 0 output
├── ARCHITECTURE_SPEC.md        # This file (Phase 1)
└── MIGRATION_CHECKLIST.md      # Phase 5 output
```

---

## 10. Summary

### Key Design Decisions

1. **Tri-Core Architecture**: Main Process orchestrates, Backend runs as child, Renderers are sandboxed
2. **Security First**: contextIsolation + sandbox + CSP + no nodeIntegration
3. **Backend Isolation**: Express server runs in child process, not Electron
4. **GPU Support**: WebGPU enabled via command-line flags for overlays
5. **Rust Sidecar**: Binary spawned on-demand, communicates via JSON stdio
6. **Auto-Update**: electron-updater with GitHub Releases

### Performance Targets

| Metric | Target |
|--------|--------|
| App Startup | < 3 seconds |
| Backend Ready | < 5 seconds |
| Overlay FPS | 60 FPS |
| Memory (Idle) | < 300 MB |
| Update Download | Background |

---

*Architecture designed by: GitHub Copilot Electron Agent*  
*Ready for Phase 2: Implementation*
