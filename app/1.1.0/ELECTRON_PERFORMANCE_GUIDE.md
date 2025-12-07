# Electron Performance-Diagnose-Guide

**Version**: 1.0.0  
**Erstellt**: 2025-12-01  
**Für**: PupCid's Little TikTool Helper (LTTH)

---

## 📋 Inhaltsverzeichnis

1. [Überblick / Hypothesen](#1-überblick--hypothesen)
2. [Schritt-für-Schritt-Diagnoseplan](#2-schritt-für-schritt-diagnoseplan)
3. [Detaillierte Checks je Problemkategorie](#3-detaillierte-checks-je-problemkategorie)
   - A. GPU & Rendering-Pipeline
   - B. Bundle/Build-Konfiguration
   - C. Main-/Renderer-Thread-Blocking
   - D. IO/DB/Filesystem
   - E. Layout/CSS & DOM-Größe
   - F. Prod-spezifische Features
   - G. Packaging/Architektur/Anti-Virus
4. [Konkrete Fix-Empfehlungen](#4-konkrete-fix-empfehlungen)
5. [Abschließende To-Do-Liste](#5-abschließende-to-do-liste)

---

## 1. Überblick / Hypothesen

### Beobachtetes Verhalten

| Modus | UI-Reaktion | Scroll-Verhalten | Klick-Delay |
|-------|-------------|------------------|-------------|
| Browser / Dev-Modus | Flüssig | Direkt | < 100ms |
| Installierte Electron-App | Träge | Sticky, verzögert | > 1s |

### Primäre Hypothesen

| Priorität | Hypothese | Wahrscheinlichkeit |
|-----------|-----------|---------------------|
| 1 | GPU-Beschleunigung deaktiviert oder gestört | Hoch |
| 2 | Synchrone IPC/FS-Aufrufe blockieren den Renderer | Hoch |
| 3 | Anti-Virus (Windows Defender) scannt Dateizugriffe | Mittel-Hoch |
| 4 | NODE_ENV nicht auf "production" gesetzt | Mittel |
| 5 | Debugging-Overhead durch DevTools-Protokoll | Mittel |
| 6 | Langsame Dateipfade (AppData statt lokaler Ordner) | Mittel |
| 7 | Fehlende CSS/DOM-Optimierungen (keine Virtualisierung) | Niedrig-Mittel |
| 8 | Telemetrie/Analytics blockiert den UI-Thread | Niedrig |

### Stack-Übersicht (LTTH)

```
Frontend: HTML/CSS/JavaScript (Dashboard + Plugin UIs)
Backend: Node.js Express + Socket.IO
Datenbank: better-sqlite3 (native Modul)
Electron: v33.x
Packaging: electron-builder (asar: false)
```

---

## 2. Schritt-für-Schritt-Diagnoseplan

### Phase 1: Baseline-Messungen

1. **Installierte Electron-App mit DevTools starten**
2. **GPU-Status prüfen** (chrome://gpu)
3. **Performance-Profil aufnehmen** (Klicken/Scrollen)
4. **Flamegraph analysieren**

### Phase 2: Code-Analyse

5. **Sync-API-Aufrufe suchen**
6. **Build-Skripte und Bundler-Config prüfen**
7. **NODE_ENV und Feature-Toggles validieren**

### Phase 3: Umgebungsanalyse

8. **Datenpfade und DB-Konfiguration prüfen**
9. **CSS/DOM-Last evaluieren**
10. **Telemetrie/Netzwerk-Calls inspizieren**
11. **Packaging/AV-Einfluss checken**

---

## 3. Detaillierte Checks je Problemkategorie

### A. GPU & Rendering-Pipeline

#### Was prüfen?

| Check | Beschreibung | Erwartetes Ergebnis |
|-------|--------------|---------------------|
| chrome://gpu | GPU-Beschleunigung aktiv? | "Hardware accelerated" für alle Features |
| --disable-gpu Flags | Werden GPU-Flags gesetzt? | Keine negativen Flags |
| High-DPI/Zoom | Skalierungsfaktor korrekt? | 100% oder natives DPI |

#### Wo prüfen?

**Dateien:**
- `electron/main.js` (Zeilen 25-60)
- `electron/windows-config.js`
- `electron/electron-builder.yml`

**Aktuell gesetzte Flags in LTTH (main.js):**

```javascript
// GPU & WebGPU Flags (bereits implementiert)
app.commandLine.appendSwitch('enable-features', [
  'Vulkan',
  'WebGPU',
  'VaapiVideoDecoder',
  'VaapiVideoEncoder',
  'CanvasOopRasterization',
].join(','));

app.commandLine.appendSwitch('use-vulkan');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-hardware-overlays', 'single-fullscreen,single-on-top,underlay');

// Performance flags
app.commandLine.appendSwitch('disable-frame-rate-limit');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('enable-smooth-scrolling');
app.commandLine.appendSwitch('disable-background-timer-throttling');
```

#### Wie messen?

**DevTools in Electron öffnen:**

1. Starte die installierte Electron-App
2. Drücke `Ctrl+Shift+I` (falls aktiviert) oder:
3. Temporär in `main.js` hinzufügen:
   ```javascript
   mainWindow.webContents.openDevTools();
   ```

**GPU-Status prüfen:**

1. In der geöffneten App: `mainWindow.loadURL('chrome://gpu')` oder
2. Neues Fenster mit chrome://gpu erstellen:
   ```javascript
   const gpuWindow = new BrowserWindow({ width: 1200, height: 800 });
   gpuWindow.loadURL('chrome://gpu');
   ```

**Interpretation chrome://gpu:**

| Status | Bedeutung | Aktion |
|--------|-----------|--------|
| `Hardware accelerated` | ✅ OK | Keine Änderung nötig |
| `Software only` | ⚠️ Fallback aktiv | GPU-Treiber oder Flags prüfen |
| `Disabled` | ❌ Problem | --disable-gpu entfernen |
| `Unavailable` | ❌ Hardware-Problem | Grafikkartenkompatibilität prüfen |

#### Mögliche Fixes

```javascript
// NICHT SETZEN (verursacht Software-Rendering):
// app.disableHardwareAcceleration();
// app.commandLine.appendSwitch('--disable-gpu');

// GPU-Cache-Probleme beheben:
const gpuCachePath = path.join(app.getPath('userData'), 'GPUCache');
app.commandLine.appendSwitch('disk-cache-dir', gpuCachePath);
app.commandLine.appendSwitch('gpu-cache-path', gpuCachePath);
```

---

### B. Bundle/Build-Konfiguration (Dev vs. Prod)

#### Was prüfen?

| Check | Datei | Was suchen |
|-------|-------|------------|
| NODE_ENV | package.json, main.js | Wird "production" korrekt gesetzt? |
| Debug-Logging | server.js | Logging-Level in Prod reduziert? |
| Source Maps | Build-Config | Inline-Source-Maps in Prod deaktiviert? |
| Bundle-Größe | dist/ | Ungewöhnlich große Bundles? |

#### Wo prüfen?

**package.json (Root):**
```json
{
  "scripts": {
    "dev": "NODE_ENV=development electron .",
    "build:electron": "electron-builder --publish never"
  }
}
```

**electron/commands.js (Backend-Umgebung):**
```javascript
// Zeile 279-290
const backendEnv = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV || 'production',
  ELECTRON: 'true',
  // ...
};
```

**app/server.js (Logging-Level prüfen):**
```javascript
// Aktuell: Winston Logger mit festen Levels
// Prüfen ob Debug-Logging in Prod aktiv ist
```

#### Konkrete Checks

```bash
# 1. Prüfe ob NODE_ENV gesetzt wird
grep -r "NODE_ENV" electron/ app/
grep -r "isDev\|isProduction\|isProd" electron/ app/

# 2. Prüfe process.env Abfragen
grep -r "process.env" electron/ app/ --include="*.js"

# 3. Prüfe Build-Artefakte auf Source Maps
ls -la dist/
```

#### Wie beheben?

```javascript
// In electron/main.js (bereits vorhanden):
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Logging anpassen:
log.transports.console.level = isDev ? 'debug' : 'warn';
log.transports.file.level = isDev ? 'debug' : 'info';
```

**Tailwind CSS Build prüfen (app/package.json):**
```json
{
  "scripts": {
    "build:css": "tailwindcss -i ./public/css/tailwind.input.css -o ./public/css/tailwind.output.css --minify"
  }
}
```

---

### C. Main-/Renderer-Thread-Blocking (Sync-IO, teure JS)

#### Was prüfen?

| API | Typ | Problem |
|-----|-----|---------|
| `ipcRenderer.sendSync` | IPC | Blockiert Renderer komplett |
| `remote.*Sync` | IPC | Deprecated, blockierend |
| `fs.readFileSync` | IO | Blockiert bei großen Dateien |
| `fs.writeFileSync` | IO | Blockiert besonders auf langsamen Laufwerken |
| `child_process.execSync` | Prozess | Blockiert bis Prozess beendet |
| `better-sqlite3` (sync) | DB | Native Modul, potenziell blockierend |

#### Wo prüfen?

```bash
# Synchrone APIs im gesamten Projekt suchen
grep -rn "Sync(" electron/ app/ --include="*.js"
grep -rn "sendSync\|invokeSync" electron/ app/ --include="*.js"
grep -rn "remote\." electron/ app/ --include="*.js"
```

**Bekannte Sync-Aufrufe in LTTH:**

| Datei | Zeile | Aufruf | Risiko |
|-------|-------|--------|--------|
| `electron/main.js` | ~98 | `fs.existsSync(lockFilePath)` | Niedrig (einmalig) |
| `electron/commands.js` | ~259-265 | `fs.readdirSync(this.appPath)` | Niedrig (Debug) |
| `app/server.js` | ~234-236 | `fs.mkdirSync`, `fs.existsSync` | Niedrig (Startup) |
| `app/modules/database.js` | diverse | `better-sqlite3` | **Mittel** (häufige Aufrufe) |

#### Performance-Profil aufnehmen

1. **DevTools öffnen** (`Ctrl+Shift+I`)
2. **Performance-Tab** wählen
3. **Record** klicken (⏺️)
4. **Typische Aktionen ausführen:**
   - Dashboard scrollen
   - Plugin-UI öffnen
   - Einstellungen ändern
5. **Stop** klicken
6. **Flamegraph analysieren**

#### Flamegraph interpretieren

| Bereich | Problem | Lösung |
|---------|---------|--------|
| Lange gelbe Blöcke (>50ms) | JavaScript blockiert | Code optimieren/async |
| Lila Blöcke beim Scrollen | Layout/Reflow | CSS optimieren |
| Braune Blöcke | Paint-Operationen | will-change, contain |
| Grüne Blöcke | Composite | OK, GPU-beschleunigt |

#### Fixes für Sync-Blocking

**Sync → Async umstellen:**

```javascript
// VORHER (blockierend):
const data = fs.readFileSync(path, 'utf8');

// NACHHER (nicht-blockierend):
const data = await fs.promises.readFile(path, 'utf8');
```

**Event-Handler mit Debouncing:**

```javascript
// Scroll-Handler optimieren
let scrollTimeout;
element.addEventListener('scroll', () => {
  clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(() => {
    // Eigentliche Logik hier
  }, 16); // ~60fps
});
```

**better-sqlite3 Optimierung:**

```javascript
// Batch-Operationen statt Einzelaufrufe
db.transaction(() => {
  for (const item of items) {
    db.prepare('INSERT INTO ...').run(item);
  }
})();
```

---

### D. IO/DB/Filesystem (Dev vs. Prod-Pfade)

#### Was prüfen?

| Aspekt | Dev | Prod | Potenzielles Problem |
|--------|-----|------|----------------------|
| Datenpfad | Projektordner | AppData/Roaming | Defender-Scan |
| DB-Größe | Klein (Test) | Groß (Produktion) | Langsame Queries |
| Journal-Mode | WAL | WAL | ✅ OK |
| Synchronous | NORMAL | NORMAL | ✅ OK |

#### Wo prüfen?

**app/modules/config-path-manager.js:**
```javascript
// Überprüfen welche Pfade verwendet werden
getConfigDir()      // → User-Config-Ordner
getUserDataDir()    // → User-Data-Ordner
getUploadsDir()     // → Uploads-Ordner
```

**app/modules/database.js:**
```javascript
// SQLite-Konfiguration prüfen
this.db.pragma('journal_mode = WAL');
this.db.pragma('synchronous = NORMAL');
```

#### Messanweisungen

```javascript
// Zeitstempel vor/nach IO/DB-Aufrufen loggen
const start = performance.now();
const result = db.prepare('SELECT * FROM ...').all();
const duration = performance.now() - start;
console.log(`DB Query took ${duration.toFixed(2)}ms`);
```

**Datenblatt erstellen:**

| Metrik | Wert | Grenzwert |
|--------|------|-----------|
| DB-Größe | ? MB | < 100 MB |
| Datensätze | ? | < 100.000 |
| Langsamste Query | ? ms | < 50 ms |
| Pfad-Typ | AppData / Lokal | - |

#### Fixes

**SQLite-Optimierungen:**

```javascript
// In database.js sicherstellen:
this.db.pragma('journal_mode = WAL');
this.db.pragma('synchronous = NORMAL');
this.db.pragma('cache_size = -64000'); // 64MB Cache
this.db.pragma('temp_store = MEMORY');

// Indizes für häufige Queries
this.db.exec('CREATE INDEX IF NOT EXISTS idx_events_type ON event_logs(event_type)');
this.db.exec('CREATE INDEX IF NOT EXISTS idx_events_time ON event_logs(timestamp)');
```

**Windows Defender Ausnahme:**

1. Windows-Sicherheit öffnen
2. Viren- & Bedrohungsschutz → Einstellungen verwalten
3. Ausschlüsse → Ausschluss hinzufügen
4. Ordner auswählen: `%APPDATA%\ltth-electron`

---

### E. Layout/CSS & DOM-Größe (Rendering-Last)

#### Was prüfen?

| Check | Tool | Problem-Indikator |
|-------|------|-------------------|
| DOM-Knoten | DevTools Elements | > 1500 Knoten |
| CSS-Komplexität | Performance-Tab | Lange Style-Recalc |
| Virtualisierung | Code-Review | Listen > 100 Items nicht virtualisiert |

#### Teure CSS-Features identifizieren

```css
/* VERMEIDEN in scroll-intensiven Bereichen: */
box-shadow: 0 0 20px rgba(0,0,0,0.5);  /* Teuer */
backdrop-filter: blur(10px);           /* Sehr teuer */
filter: blur(5px);                     /* Teuer */
position: fixed;                       /* Kann Repaints verursachen */

/* BEVORZUGEN: */
transform: translateZ(0);              /* GPU-Layer erzwingen */
will-change: transform;                /* GPU-Layer ankündigen */
contain: layout;                       /* Rendering isolieren */
```

#### DevTools Rendering-Metriken

1. DevTools → More tools → Rendering
2. Aktivieren:
   - [x] Paint flashing (zeigt Repaints)
   - [x] Layout Shift Regions
   - [x] Frame Rendering Stats

#### Test-Szenarien

**Minimales Theme testen:**

```javascript
// Temporär CSS-Effekte deaktivieren
document.querySelectorAll('*').forEach(el => {
  el.style.boxShadow = 'none';
  el.style.backdropFilter = 'none';
  el.style.filter = 'none';
});
```

**Performance vergleichen:**
1. Mit vollem CSS → Performance messen
2. Mit reduziertem CSS → Performance messen
3. Differenz analysieren

#### Fixes

**Virtualisierung für lange Listen:**

```javascript
// Statt alle Items rendern:
items.forEach(item => container.appendChild(renderItem(item)));

// Virtualisierung verwenden:
// Nur sichtbare Items + Buffer rendern
const visibleItems = items.slice(startIndex, endIndex + buffer);
```

**CSS-Optimierungen:**

```css
/* GPU-Layer für animierte Elemente */
.animated-element {
  will-change: transform, opacity;
  transform: translateZ(0);
}

/* Contain für isolierte Komponenten */
.card {
  contain: layout style paint;
}

/* Statt box-shadow: */
.shadow-optimized {
  box-shadow: none;
  background: linear-gradient(...); /* GPU-beschleunigt */
}
```

---

### F. Prod-spezifische Features (Tracking, Telemetrie, Netzwerk)

#### Was prüfen?

| Aspekt | Dev | Prod | Check-Methode |
|--------|-----|------|---------------|
| Analytics | Mock/Aus | Aktiv | Network-Tab |
| API-Calls | localhost | Extern | Network-Tab |
| Error-Tracking | Konsole | Sentry/etc. | Code-Review |
| Auto-Update | Aus | Aktiv | Startup-Logs |

#### Network-Tab Analyse

1. DevTools → Network-Tab
2. Preserve log aktivieren
3. App normal verwenden
4. Filtern nach:
   - XHR/Fetch
   - WS (WebSocket)
   - Other

**Auf diese Patterns achten:**

| Pattern | Problem | Fix |
|---------|---------|-----|
| Request pro Klick | UI blockiert auf Response | Debounce + Async |
| Polling alle 1s | Unnötiger Overhead | Interval erhöhen / WebSocket |
| Große Payloads | Parsing-Overhead | Pagination / Streaming |

#### Code-Review für Telemetrie

```bash
# Analytics-Module suchen
grep -rn "analytics\|telemetry\|tracking\|mixpanel\|amplitude" app/ electron/

# Auto-Update-Checks
grep -rn "autoUpdater\|checkForUpdates" electron/
```

**In LTTH (electron/main.js):**

```javascript
// Auto-Update Check beim Start (Zeile 217-260)
// Timeout: 10 Sekunden
const updateResult = await Promise.race([
  autoUpdater.checkForUpdates().catch(() => null),
  new Promise(resolve => setTimeout(() => resolve(null), 10000))
]);
```

#### Fixes

**Events batchen:**

```javascript
// VORHER: Jedes Event sofort senden
onClick() {
  await analytics.track('click', data);
}

// NACHHER: Events sammeln und batch-senden
const eventQueue = [];
onClick() {
  eventQueue.push({ type: 'click', data, time: Date.now() });
}
setInterval(async () => {
  if (eventQueue.length > 0) {
    const batch = eventQueue.splice(0, eventQueue.length);
    await analytics.trackBatch(batch);
  }
}, 5000);
```

**Non-blocking Tracking:**

```javascript
// Async, ohne auf Antwort zu warten
analytics.track('event', data).catch(console.error);
// UI reagiert sofort
```

---

### G. Packaging / Architektur / Anti-Virus

#### Was prüfen?

| Check | Wie | Erwartet |
|-------|-----|----------|
| Architektur | Task-Manager | x64 (nicht ARM-Emulation) |
| ASAR | electron-builder.yml | `asar: false` oder `asar: true` |
| Debug-Symbole | Build-Ordner | Keine .pdb/.map in Prod |
| AV-Scan | Process Monitor | Keine hohe CPU durch AV |

#### Architektur prüfen

**Task-Manager:**
1. Task-Manager öffnen (`Ctrl+Shift+Esc`)
2. Details-Tab
3. LTTH-Prozess finden
4. Rechtsklick → Gehe zu Details
5. Plattform-Spalte aktivieren: x64 / ARM64

**electron-builder.yml (LTTH):**

```yaml
# Zeile 72-77
win:
  target:
    - target: nsis
      arch:
        - x64  # ✅ Nur x64, kein ARM-Emulation-Problem
```

#### ASAR-Nutzung

**Aktuell in LTTH:**

```yaml
# electron-builder.yml Zeile 59-60
asar: false  # Deaktiviert für einfacheres Debugging
```

**Trade-offs:**

| asar: false | asar: true |
|-------------|------------|
| ✅ Einfaches Debugging | ✅ Schnellerer Start |
| ✅ Native Module funktionieren | ✅ Kleinere Größe |
| ❌ Viele Datei-Operationen | ❌ Debug schwieriger |
| ❌ Langsamerer Start (viele Dateien) | ❌ Native Module können problematisch sein |

#### Anti-Virus Einfluss messen

**Windows Defender prüfen:**

1. Task-Manager → Details
2. Sortieren nach CPU
3. `MsMpEng.exe` (Defender) beobachten
4. Während LTTH-Nutzung: Steigt CPU-Last?

**Temporäre Ausnahme testen:**

1. Windows-Sicherheit → Viren- & Bedrohungsschutz
2. Einstellungen verwalten
3. Ausschlüsse → Ordner hinzufügen:
   - Installationsordner von LTTH
   - `%APPDATA%\ltth-electron`
4. LTTH neu starten und Performance vergleichen

**Process Monitor für detaillierte Analyse:**

1. Process Monitor herunterladen (Sysinternals)
2. Filter setzen:
   - Process Name contains "ltth" OR "electron"
   - Operation is "CreateFile" OR "ReadFile"
3. App verwenden
4. Auf hohe Anzahl von Dateizugriffen achten

---

## 4. Konkrete Fix-Empfehlungen

### Sofortige Verbesserungen (Quick Wins)

#### 1. GPU-Cache-Verzeichnis sicherstellen

```javascript
// Bereits in electron/main.js implementiert (Zeile 53-58)
const gpuCachePath = path.join(app.getPath('userData'), 'GPUCache');
app.commandLine.appendSwitch('disk-cache-dir', gpuCachePath);
app.commandLine.appendSwitch('gpu-cache-path', gpuCachePath);
```

#### 2. Background-Throttling deaktivieren

```javascript
// Bereits in electron/main.js (Zeile 46-48)
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
```

```javascript
// In windows-config.js (BrowserWindow)
webPreferences: {
  backgroundThrottling: false,  // Bereits gesetzt
}
```

#### 3. DevTools im Release deaktivieren

```javascript
// In electron/windows-config.js Zeile 99-102
mainWindow.once('ready-to-show', () => {
  mainWindow.show();
  if (this.isDev) {  // ✅ Nur in Dev
    mainWindow.webContents.openDevTools();
  }
});
```

### Mittelfristige Optimierungen

#### 4. SQLite-Performance verbessern

```javascript
// In app/modules/database.js
constructor(dbPath) {
  this.db = new Database(dbPath);
  
  // Performance-Pragmas
  this.db.pragma('journal_mode = WAL');
  this.db.pragma('synchronous = NORMAL');
  this.db.pragma('cache_size = -64000');      // NEU: 64MB Cache
  this.db.pragma('temp_store = MEMORY');       // NEU: Temp in RAM
  this.db.pragma('mmap_size = 268435456');     // NEU: 256MB mmap
}
```

#### 5. Event-Handler optimieren

```javascript
// Scroll-Handler mit requestAnimationFrame
let ticking = false;
element.addEventListener('scroll', () => {
  if (!ticking) {
    requestAnimationFrame(() => {
      // Scroll-Logik hier
      ticking = false;
    });
    ticking = true;
  }
});
```

### Langfristige Architektur-Verbesserungen

#### 6. Worker-Thread für schwere Operationen

```javascript
// Schwere Berechnungen in Worker auslagern
const { Worker } = require('worker_threads');

async function heavyComputation(data) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./heavy-worker.js', { workerData: data });
    worker.on('message', resolve);
    worker.on('error', reject);
  });
}
```

#### 7. IPC-Calls minimieren

```javascript
// VORHER: Viele kleine IPC-Calls
const setting1 = await ipcRenderer.invoke('settings:get', 'key1');
const setting2 = await ipcRenderer.invoke('settings:get', 'key2');

// NACHHER: Ein Batch-Call
const settings = await ipcRenderer.invoke('settings:getMultiple', ['key1', 'key2']);
```

---

## 5. Abschließende To-Do-Liste

### Diagnose-Checkliste

| # | Aufgabe | Beschreibung | Status |
|---|---------|--------------|--------|
| 1 | **DevTools starten** | Installierte App mit `Ctrl+Shift+I` oder Code-Änderung | ☐ |
| 2 | **chrome://gpu prüfen** | Alle Features "Hardware accelerated"? | ☐ |
| 3 | **Performance-Profil** | 30s Aufnahme beim Scrollen/Klicken | ☐ |
| 4 | **Flamegraph analysieren** | Lange Blöcke (>50ms) identifizieren | ☐ |
| 5 | **Sync-APIs suchen** | `grep -rn "Sync(" electron/ app/` | ☐ |
| 6 | **Build-Skripte prüfen** | NODE_ENV=production gesetzt? | ☐ |
| 7 | **Prod-Bundle testen** | Standalone im Browser laden | ☐ |
| 8 | **Datenpfade checken** | AppData vs. lokaler Ordner | ☐ |
| 9 | **DB-Performance** | Langsamste Queries identifizieren | ☐ |
| 10 | **CSS/DOM-Last** | DOM-Knoten zählen, CSS-Effekte testen | ☐ |
| 11 | **Network-Tab** | Requests pro Aktion zählen | ☐ |
| 12 | **Defender-Ausnahme** | Temporär testen, Performance vergleichen | ☐ |
| 13 | **Task-Manager** | CPU/RAM während Nutzung monitoren | ☐ |

### Erwartete Ergebnisse

| Check | Erwartung bei Problem | Typische Ursache |
|-------|----------------------|------------------|
| GPU = Software only | Lag beim Scrollen | GPU-Treiber oder Flags |
| Lange JS-Blöcke | Klick-Delay | Sync-APIs oder teure Berechnungen |
| Viele FS-Operationen | Genereller Lag | asar: false + viele Dateien |
| Defender hohe CPU | Lag bei Dateizugriffen | Fehlende AV-Ausnahme |
| Große DOM-Anzahl | Scroll-Lag | Fehlende Virtualisierung |

### Priorisierte Fix-Reihenfolge

1. **GPU-Beschleunigung verifizieren** → Größter Impact
2. **Defender-Ausnahme hinzufügen** → Schneller Test
3. **Sync-APIs in Async umwandeln** → Mittlerer Aufwand
4. **SQLite-Cache erhöhen** → Geringer Aufwand
5. **Event-Handler optimieren** → Mittlerer Aufwand
6. **CSS-Effekte reduzieren** → Je nach Umfang
7. **Virtualisierung implementieren** → Hoher Aufwand

---

## Anhang: Hilfreiche Befehle

### Electron mit Debug-Flags starten

```bash
# Windows
set ELECTRON_ENABLE_LOGGING=true && npm run start:electron

# macOS/Linux
ELECTRON_ENABLE_LOGGING=true npm run start:electron
```

### Performance-Trace automatisch erstellen

```javascript
// In main.js temporär hinzufügen
const { app, contentTracing } = require('electron');

app.whenReady().then(async () => {
  await contentTracing.startRecording({
    included_categories: ['*']
  });
  
  setTimeout(async () => {
    const path = await contentTracing.stopRecording();
    console.log('Trace saved to:', path);
  }, 30000); // 30 Sekunden aufnehmen
});
```

### SQLite-Query-Analyse

```javascript
// Langsame Queries identifizieren
const startTime = process.hrtime.bigint();
const result = db.prepare(query).all();
const duration = Number(process.hrtime.bigint() - startTime) / 1e6;
if (duration > 10) {
  console.warn(`Slow query (${duration.toFixed(2)}ms): ${query}`);
}
```

---

*Dokument erstellt für LTTH v1.1.0*  
*Letzte Aktualisierung: 2025-12-01*
