# Advanced Features

[← Konfiguration](Konfiguration) | [→ Developer Section](Entwickler-Leitfaden)

---

## 📑 Inhaltsverzeichnis

1. [Übersicht](#übersicht)
2. [WebGPU Engine](#webgpu-engine)
3. [Worker Threads](#worker-threads)
4. [Multi-Stage Systems](#multi-stage-systems)
5. [Global Chat Command Engine](#global-chat-command-engine)
6. [Flow System](#flow-system)
7. [Plugin Data Storage](#plugin-data-storage)
8. [Performance Optimizations](#performance-optimizations)
9. [Multi-Device Setup](#multi-device-setup)
10. [Security Features](#security-features)

---

## 🔍 Übersicht

Little TikTool Helper v1.2.1 enthält zahlreiche **Advanced Features** für Power-User, Entwickler und professionelle Streamer. Diese Features ermöglichen maximale Performance, Flexibilität und Kontrolle.

---

## 🚀 WebGPU Engine

### Beschreibung

GPU-beschleunigtes Rendering-System für hochperformante visuelle Effekte.

**Siehe:** **[WebGPU Engine](Features/WebGPU-Engine.md)** für vollständige Dokumentation

### Highlights

- **10x Performance** - Verglichen mit Canvas-basierten Lösungen
- **60 FPS konstant** - Auch bei 10.000+ Partikeln
- **Compute Shaders** - GPU-basierte Physik-Simulationen
- **Instanced Rendering** - Effizientes Partikel-Rendering

### Unterstützte Plugins

1. **WebGPU Emoji Rain** (Early Beta)
   - GPU-Partikel-System
   - Custom Emoji-Sets
   - 60 FPS bei 2000+ Emojis

### Browser-Support

| Browser | Version | WebGPU-Support |
|---------|---------|----------------|
| Chrome | 113+ | ✅ Vollständig |
| Edge | 113+ | ✅ Vollständig |
| Firefox | Experimentell | ⚠️ Flag erforderlich |
| Safari | Experimentell | ⚠️ macOS 14+ |

**Fallback:** Automatischer Fallback auf WebGL/Canvas wenn WebGPU nicht verfügbar.

---

## 🧵 Worker Threads

### Beschreibung

Hintergrund-Worker für CPU-intensive Tasks, um den Main-Thread zu entlasten.

### Verwendung

**Physik-Berechnungen:**
```javascript
// In Plugin
const worker = new Worker('physics-worker.js');

worker.postMessage({
  type: 'simulate',
  particles: particleData
});

worker.onmessage = (e) => {
  const updatedParticles = e.data.particles;
  renderParticles(updatedParticles);
};
```

### Vorteile

- ✅ Main-Thread bleibt responsive
- ✅ UI-Updates blockieren nicht
- ✅ Bessere Multi-Core-Nutzung
- ✅ Höhere FPS bei komplexen Berechnungen

### Beispiel-Anwendungen

- **Emoji Rain** - Partikel-Physik im Worker
- **Fireworks** - Explosion-Simulationen
- **Viewer XP** - XP-Berechnungen im Hintergrund

---

## 🎆 Multi-Stage Systems

### Beschreibung

Mehrstufige Effekt-Systeme mit separaten Render-Phasen.

### Fireworks Multi-Stage Pipeline

```
1. Launch Stage    → Rakete steigt auf
2. Burst Stage     → Erste Explosion
3. Trail Stage     → Partikel-Trails
4. Secondary Burst → Zweite Explosion (optional)
5. Fade Stage      → Ausblenden
```

### Vorteile

- **Realistische Effekte** - Jede Phase separat steuerbar
- **Performance** - Nur aktive Stages werden berechnet
- **Flexibilität** - Stages können übersprungen/erweitert werden

### Implementierung

```javascript
class MultiStageEffect {
  constructor() {
    this.stages = [
      new LaunchStage(),
      new BurstStage(),
      new TrailStage(),
      new FadeStage()
    ];
    this.currentStage = 0;
  }
  
  update(deltaTime) {
    const stage = this.stages[this.currentStage];
    
    if (stage.isComplete()) {
      this.currentStage++;
      if (this.currentStage >= this.stages.length) {
        return true; // Effect complete
      }
    }
    
    stage.update(deltaTime);
    return false;
  }
  
  render(ctx) {
    this.stages[this.currentStage].render(ctx);
  }
}
```

### Verwendete Plugins

- **Fireworks Superplugin** - 5-Stage Feuerwerk-System
- **Weather Control** - Multi-Phase Wetter-Effekte
- **Gift Milestone** - Mehrstufige Celebrations

---

## 💬 Global Chat Command Engine

### Beschreibung

Zentrales Chat-Command-Framework für alle Plugins.

**Siehe:** **[GCCE](Features/GCCE.md)** für vollständige Dokumentation

### Features

- **Zentrales Registry** - Alle Commands an einem Ort
- **Permission-System** - broadcaster > moderator > vip > subscriber > all
- **Auto-Validierung** - Argument-Typen und Requirements
- **Rate-Limiting** - Anti-Spam-Mechanismen
- **Help-System** - Auto-generierte Hilfe

### Command registrieren

```javascript
const gcce = this.api.pluginLoader?.loadedPlugins?.get('gcce')?.instance;

gcce.registerCommand({
  command: '!mytimer',
  description: 'Starts a custom timer',
  permission: 'moderator',
  args: [
    { name: 'duration', type: 'number', required: true }
  ],
  handler: async (args, user, message) => {
    const duration = args[0];
    startTimer(duration);
    return { success: true, message: `Timer started: ${duration}s` };
  }
});
```

### Verwendung

```
Chat: !mytimer 120
Bot:  Timer started: 120s

Chat: !help mytimer
Bot:  !mytimer <duration>
      Starts a custom timer
      Permission: Moderator+
```

---

## ⚡ Flow System

### Beschreibung

"Wenn-Dann"-Automatisierungen ohne Code.

**Siehe:** **[Flows](modules/flows.md)** für vollständige Dokumentation

### Trigger-Typen

1. **Gift** - Geschenke (z.B. Rose, Lion)
2. **Chat** - Chat-Nachrichten
3. **Follow** - Neue Follower
4. **Subscribe** - Neue Subscriber
5. **Share** - Stream-Shares
6. **Like** - Like-Events

### Action-Typen

1. **TTS** - Text-to-Speech
2. **Alert** - Alert anzeigen
3. **OBS** - Szene wechseln
4. **OSC** - OSC-Message senden
5. **HTTP** - HTTP-Request
6. **Delay** - Warten

### Beispiel-Flow

```javascript
{
  "name": "Rose Gift Flow",
  "trigger": {
    "type": "gift",
    "condition": {
      "field": "giftName",
      "operator": "==",
      "value": "Rose"
    }
  },
  "actions": [
    {
      "type": "tts",
      "params": {
        "text": "Danke {username} für die Rose!",
        "voice": "en_us_001"
      }
    },
    {
      "type": "obs",
      "params": {
        "action": "switch_scene",
        "scene": "Camera2"
      }
    },
    {
      "type": "osc",
      "params": {
        "address": "/avatar/parameters/Wave",
        "value": true
      }
    }
  ]
}
```

### Advanced Features

**Conditions:**
```javascript
// Mehrere Bedingungen
{
  "conditions": [
    { "field": "giftName", "operator": "==", "value": "Rose" },
    { "field": "coins", "operator": ">=", "value": 100 }
  ],
  "logic": "AND" // oder "OR"
}
```

**Variables:**
```javascript
// Verfügbare Variablen in Actions
{username}    // Benutzername
{giftName}    // Gift-Name
{coins}       // Coin-Anzahl
{message}     // Chat-Nachricht
{count}       // Gift-Count (bei Combos)
```

---

## 💾 Plugin Data Storage

### Beschreibung

Persistente Daten-Speicherung für Plugins, die Updates überleben.

**Siehe:** `/app/docs/PLUGIN_DATA_STORAGE_GUIDE.md` für vollständige Dokumentation

### Problem

Daten im Plugin-Verzeichnis (`__dirname`) gehen bei Updates verloren.

### Lösung

**Plugin Data Directory:**
```javascript
// ❌ FALSCH: Geht bei Update verloren
const uploadDir = path.join(__dirname, 'uploads');

// ✅ RICHTIG: Überlebt Updates
const pluginDataDir = this.api.getPluginDataDir();
const uploadDir = path.join(pluginDataDir, 'uploads');
```

### API-Methoden

```javascript
// Data-Directory-Pfad erhalten
const dataDir = this.api.getPluginDataDir();
// → /path/to/user/profile/plugins/my-plugin/

// Data-Directory erstellen (falls nicht vorhanden)
this.api.ensurePluginDataDir();

// Config speichern (in Datenbank)
this.api.setConfig('uploads', uploadList);

// Config laden
const uploads = this.api.getConfig('uploads') || [];
```

### Beispiel

```javascript
async init() {
  // Data-Directory sicherstellen
  this.api.ensurePluginDataDir();
  
  // Upload-Verzeichnis im Data-Dir
  const dataDir = this.api.getPluginDataDir();
  this.uploadDir = path.join(dataDir, 'uploads');
  
  if (!fs.existsSync(this.uploadDir)) {
    fs.mkdirSync(this.uploadDir, { recursive: true });
  }
  
  // Upload-Liste aus DB laden
  this.uploads = this.api.getConfig('uploads') || [];
}
```

### Was speichern?

**Plugin Data Directory:**
- 📁 Uploaded Files (Bilder, Sounds, Videos)
- 📄 Logs & Cache-Dateien
- 🗂️ Exported Data (JSON, CSV)

**Database (Config):**
- ⚙️ Plugin-Einstellungen
- 🔑 API-Keys
- 📋 Listen & Mappings

---

## 🚄 Performance Optimizations

### Event Processing (60% schneller)

**Before:**
```javascript
// Jedes Event einzeln verarbeiten
events.forEach(event => {
  processEvent(event);
});
```

**After (Batch Processing):**
```javascript
// Events in Batches verarbeiten
const batches = chunkArray(events, 100);
batches.forEach(batch => {
  processBatch(batch);
});
```

**Ergebnis:** 60% Reduktion der Event-Processing-Zeit

### Database Queries (50-75% schneller)

**Before:**
```javascript
// Einzelne Queries
events.forEach(event => {
  db.prepare('INSERT INTO events VALUES (?, ?)').run(event.id, event.data);
});
```

**After (Prepared Statements + Transactions):**
```javascript
// Prepared Statement einmal erstellen
const stmt = db.prepare('INSERT INTO events VALUES (?, ?)');

// Transaction für Batch-Insert
const insertMany = db.transaction((events) => {
  events.forEach(event => stmt.run(event.id, event.data));
});

insertMany(events);
```

**Ergebnis:** 50-75% Reduktion der Query-Zeit

### Memory Management

**Object Pooling:**
```javascript
class ParticlePool {
  constructor(size) {
    this.pool = new Array(size).fill(null).map(() => new Particle());
    this.activeCount = 0;
  }
  
  acquire() {
    if (this.activeCount < this.pool.length) {
      return this.pool[this.activeCount++];
    }
    return null;
  }
  
  release(particle) {
    if (this.activeCount > 0) {
      this.activeCount--;
      particle.reset();
    }
  }
}
```

**Vorteile:**
- Keine GC-Pauses
- Konstante Memory-Usage
- Höhere FPS

---

## 📱 Multi-Device Setup

### Beschreibung

LTTH auf mehreren Geräten gleichzeitig nutzen.

### Use-Cases

1. **PC + Handy** - Dashboard auf PC, Monitoring auf Handy
2. **Streaming-PC + Gaming-PC** - OBS auf Streaming-PC, LTTH auf Gaming-PC
3. **Multi-Monitor** - Dashboard auf einem Monitor, Overlays auf anderem

### Setup

**1. Server auf PC starten:**
```bash
npm start
```

**2. IP-Adresse ermitteln:**
```bash
# Windows
ipconfig

# Linux/macOS
ifconfig
```

**3. Firewall öffnen:**
```
Port 3000 für eingehende Verbindungen
```

**4. Auf anderem Gerät verbinden:**
```
http://<PC-IP-Adresse>:3000
```

**Beispiel:**
```
PC-IP: 192.168.1.100
Handy-Browser: http://192.168.1.100:3000
```

### Netzwerk-Sicherheit

**Option 1: Lokales Netzwerk (sicher)**
- Nur im eigenen WLAN verfügbar
- Keine externe Erreichbarkeit

**Option 2: VPN (für externe Zugriffe)**
- Tailscale, ZeroTier, WireGuard
- Sichere Verbindung von außen

**⚠️ NICHT empfohlen:**
- Port-Forwarding ohne Authentication
- Öffentliche IP ohne Schutz

---

## 🔒 Security Features

### 1. Input Sanitization

**Alle User-Inputs werden validiert:**
```javascript
// Chat-Nachrichten
function sanitizeMessage(message) {
  return message
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
```

### 2. Rate Limiting

**API-Endpoints:**
```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 Minute
  max: 100 // Max 100 Requests pro Minute
});

app.use('/api/', limiter);
```

**GCCE Commands:**
```javascript
// Per-User Rate-Limiting
rateLimit: {
  maxCalls: 5,
  windowMs: 60000
}
```

### 3. API-Key Storage

**Sichere Speicherung in Datenbank:**
```javascript
// API-Keys niemals in Code hardcoden
const apiKey = this.api.getConfig('api_key');

// Verschlüsselt in DB speichern
this.api.setConfig('api_key', encryptedKey);
```

### 4. CORS-Protection

**Nur bestimmte Origins erlauben:**
```javascript
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));
```

### 5. SQL-Injection-Schutz

**Prepared Statements:**
```javascript
// ❌ UNSICHER
db.exec(`SELECT * FROM users WHERE username = '${username}'`);

// ✅ SICHER
db.prepare('SELECT * FROM users WHERE username = ?').get(username);
```

### 6. File Upload Validation

**File-Type & Size-Limits:**
```javascript
// Nur bestimmte File-Typen
const allowedTypes = ['.png', '.jpg', '.gif', '.webp'];
const ext = path.extname(file.name).toLowerCase();

if (!allowedTypes.includes(ext)) {
  throw new Error('Invalid file type');
}

// Max File-Size (z.B. 10 MB)
if (file.size > 10 * 1024 * 1024) {
  throw new Error('File too large');
}
```

---

## 🔗 Weiterführende Ressourcen

### Feature-Dokumentation
- **[WebGPU Engine](Features/WebGPU-Engine.md)** - GPU-Rendering-System
- **[GCCE](Features/GCCE.md)** - Chat-Command-Engine
- **[Flows](modules/flows.md)** - Flow-Automation-System

### Plugin-Entwicklung
- **[Plugin-Dokumentation](Plugin-Dokumentation.md)** - Plugin-API
- **[Entwickler-Leitfaden](Entwickler-Leitfaden.md)** - Best Practices
- **[API-Reference](API-Reference.md)** - Vollständige API-Dokumentation

### Weitere Guides
- **[Getting Started](Getting-Started.md)** - Schnelleinstieg
- **[Konfiguration](Konfiguration.md)** - Erweiterte Einstellungen
- **[FAQ & Troubleshooting](FAQ-&-Troubleshooting.md)** - Probleme lösen

---

[← Konfiguration](Konfiguration) | [→ Developer Section](Entwickler-Leitfaden)

---

*Letzte Aktualisierung: 2025-12-11*  
*Version: 1.2.1*
