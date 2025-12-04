# Entwickler-Leitfaden

[← Architektur](Architektur) | [→ Plugin-Dokumentation](Plugin-Dokumentation)

---

## 📑 Inhaltsverzeichnis

1. [Entwicklungsumgebung](#entwicklungsumgebung)
2. [Code-Style & Standards](#code-style--standards)
3. [Git-Workflow & Branching](#git-workflow--branching)
4. [Commit-Konventionen](#commit-konventionen)
5. [Pull-Request-Prozess](#pull-request-prozess)
6. [Testing](#testing)
7. [Debugging](#debugging)
8. [Logging](#logging)
9. [Error-Handling](#error-handling)
10. [Performance-Best-Practices](#performance-best-practices)
11. [Sicherheitsrichtlinien](#sicherheitsrichtlinien)
12. [Dokumentation](#dokumentation)

---

## 💻 Entwicklungsumgebung

### Empfohlene Tools

| Tool | Zweck | Download |
|------|-------|----------|
| **VS Code** | Code-Editor | [code.visualstudio.com](https://code.visualstudio.com/) |
| **Node.js 20 LTS** | Runtime | [nodejs.org](https://nodejs.org/) |
| **Git** | Versionskontrolle | [git-scm.com](https://git-scm.com/) |
| **Postman** | API-Testing | [postman.com](https://www.postman.com/) |
| **OBS Studio** | Overlay-Testing | [obsproject.com](https://obsproject.com/) |

### VS Code Extensions

**Empfohlene Extensions:**
```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-typescript-next",
    "eamodio.gitlens",
    "oderwat.indent-rainbow",
    "wayou.vscode-todo-highlight"
  ]
}
```

Speichere in `.vscode/extensions.json`.

### Projekt-Setup für Entwicklung

```bash
# Repository klonen
git clone https://github.com/yourusername/pupcidslittletiktokhelper.git
cd pupcidslittletiktokhelper

# Dependencies installieren
npm install

# Optional: Nodemon für Auto-Restart installieren
npm install -g nodemon

# Server im Dev-Modus starten (mit Auto-Restart)
nodemon server.js

# Oder mit npm-Script:
npm run dev
```

**package.json Scripts:**
```json
{
  "scripts": {
    "start": "node launch.js",
    "dev": "nodemon server.js",
    "test": "echo \"No tests yet\" && exit 0"
  }
}
```

### Umgebungsvariablen für Development

```bash
# .env.example (nicht committen!)
NODE_ENV=development
LOG_LEVEL=debug
PORT=3000
```

---

## 📝 Code-Style & Standards

### JavaScript-Konventionen

**1. Indentation:**
- **4 Spaces** (keine Tabs)
- Konsistent im gesamten Projekt

**2. Naming-Konventionen:**
```javascript
// Variablen & Funktionen: camelCase
const userName = 'john';
function getUserData() { }

// Konstanten: UPPER_SNAKE_CASE
const MAX_RETRIES = 3;
const API_ENDPOINT = 'https://api.example.com';

// Klassen: PascalCase
class UserManager { }
class PluginLoader { }

// Private Methoden/Properties: Prefix mit _
class MyClass {
    _privateMethod() { }
    _privateProperty = 'secret';
}

// Dateien: kebab-case
// user-manager.js, plugin-loader.js, tiktok-connector.js
```

**3. Kommentare:**
```javascript
// Einzeilige Kommentare für kurze Erklärungen
const port = 3000; // Server-Port

/**
 * Mehrzeilige JSDoc-Kommentare für Funktionen/Klassen
 *
 * @param {string} username - TikTok-Username
 * @param {Object} options - Optionen
 * @returns {Promise<boolean>} - Erfolgsstatus
 */
async function connectToTikTok(username, options) {
    // Implementation
}
```

**4. Strings:**
```javascript
// Bevorzuge Template-Literals
const message = `Hello ${username}, you have ${coins} coins`;

// Statt:
const message = 'Hello ' + username + ', you have ' + coins + ' coins';
```

**5. Arrow-Functions:**
```javascript
// Bevorzuge Arrow-Functions für Callbacks
array.map(item => item.name);
array.filter(item => item.active);

// Traditionelle Functions für Klassen-Methoden
class MyClass {
    myMethod() {
        // this-Context erhalten
    }
}
```

**6. Async/Await:**
```javascript
// Bevorzuge async/await über Promises
async function fetchData() {
    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        logger.error('Fetch failed:', error);
        throw error;
    }
}

// Statt:
function fetchData() {
    return axios.get(url)
        .then(response => response.data)
        .catch(error => {
            logger.error('Fetch failed:', error);
            throw error;
        });
}
```

### Wichtige Regeln

✅ **Do:**
- Code dokumentieren (JSDoc für public API)
- Bestehende Patterns verwenden
- Error-Handling implementieren
- Logger verwenden statt `console.log`
- Config-Validierung mit Defaults
- Atomic File-Writes (`.tmp` → `rename`)

❌ **Don't:**
- Bestehende Features entfernen (nur erweitern!)
- Breaking Changes ohne Diskussion
- Hardcoded Secrets committen
- `console.log` in Production-Code
- Synchrone File-I/O (außer DB)
- Magic Numbers (nutze Konstanten)

### Code-Beispiel (Best Practice)

```javascript
/**
 * Gift-Event-Handler
 *
 * @param {Object} giftData - Gift-Event-Daten
 * @param {string} giftData.username - Sender-Username
 * @param {string} giftData.giftName - Gift-Name
 * @param {number} giftData.coins - Coin-Wert
 * @returns {Promise<void>}
 */
async function handleGiftEvent(giftData) {
    // Input-Validierung
    if (!giftData || !giftData.username) {
        logger.error('Invalid gift data received');
        return;
    }

    try {
        // Logging
        logger.info(`Gift received: ${giftData.giftName} from ${giftData.username}`);

        // Business Logic
        await updateLeaderboard(giftData.username, giftData.coins);
        await incrementGoal('coins', giftData.coins);

        // Event emittieren
        io.emit('gift:processed', {
            username: giftData.username,
            giftName: giftData.giftName,
            coins: giftData.coins
        });

    } catch (error) {
        logger.error('Gift handling failed:', error);
        // Fehler nicht verschlucken, aber auch nicht crashen
    }
}
```

---

## 🌿 Git-Workflow & Branching

### Branch-Strategie

**Main Branch:**
- `main` - Production-ready Code
- Geschützt, nur via Pull Request

**Development Branch:**
- `develop` - Development-Branch (optional)

**Feature Branches:**
- `feature/<feature-name>` - Neue Features
- `fix/<bug-name>` - Bug-Fixes
- `refactor/<component>` - Refactoring
- `docs/<section>` - Dokumentation

**Beispiele:**
```bash
feature/multi-language-support
fix/tts-queue-overflow
refactor/database-manager
docs/api-reference
```

### Workflow

**1. Feature entwickeln:**
```bash
# Von main branch starten
git checkout main
git pull origin main

# Feature-Branch erstellen
git checkout -b feature/my-new-feature

# Entwickeln, committen
git add .
git commit -m "Add: My new feature"

# Pushen
git push origin feature/my-new-feature
```

**2. Pull Request öffnen:**
- Auf GitHub: "Compare & Pull Request"
- Beschreibung ausfüllen (siehe unten)
- Reviewer zuweisen (falls Team)

**3. Code Review:**
- Änderungen von Reviewer umsetzen
- Pushen (automatisch im PR aktualisiert)

**4. Merge:**
- Nach Approval: "Squash and Merge" oder "Merge"
- Branch löschen (automatisch)

**5. Lokal aufräumen:**
```bash
git checkout main
git pull origin main
git branch -d feature/my-new-feature
```

---

## 📝 Commit-Konventionen

### Commit-Message-Format

```
<Type>: <Kurzbeschreibung> (max 72 Zeichen)

<Optionaler Body: Ausführliche Beschreibung>
- Was wurde geändert?
- Warum wurde es geändert?
- Wie wurde es implementiert?

<Optionaler Footer>
- Breaking Changes: BREAKING CHANGE: ...
- Issue-Referenzen: Closes #123
```

### Commit-Types

| Type | Beschreibung | Beispiel |
|------|--------------|----------|
| `Add` | Neue Features hinzugefügt | `Add: Multi-language support` |
| `Update` | Bestehende Features erweitert | `Update: TTS with 20 new voices` |
| `Fix` | Bug-Fixes | `Fix: TTS queue overflow` |
| `Refactor` | Code-Refactoring (keine Funktionsänderung) | `Refactor: Database module` |
| `Docs` | Dokumentation | `Docs: Update API reference` |
| `Test` | Tests hinzugefügt/geändert | `Test: Add unit tests for flows` |
| `Chore` | Build/CI-Änderungen | `Chore: Update dependencies` |
| `Style` | Code-Formatierung | `Style: Fix indentation` |
| `Perf` | Performance-Verbesserungen | `Perf: Optimize database queries` |

### Commit-Beispiele

**Gute Commits:**
```bash
git commit -m "Add: OSC-Bridge plugin for VRChat integration"

git commit -m "Fix: TTS queue overflow when 100+ messages
- Added max queue size limit (100 items)
- Oldest items are dropped when queue is full
- Added warning log when queue limit reached"

git commit -m "Update: Multi-Cam plugin with macro system
- Added macro support for multi-step actions
- Added cooldown system (per-user, global)
- Added safety limits (max switches per 30s)

Closes #42"
```

**Schlechte Commits:**
```bash
git commit -m "fixes"  # Zu kurz, kein Type
git commit -m "updated stuff"  # Zu vage
git commit -m "asdfasdf"  # Sinnlos
```

### Atomic Commits

**Regel:** Ein Commit = Eine logische Änderung

**Gut:**
```bash
# Commit 1: Feature hinzufügen
git commit -m "Add: Google TTS support"

# Commit 2: Dokumentation aktualisieren
git commit -m "Docs: Update TTS configuration"
```

**Schlecht:**
```bash
# Alles in einem Commit
git commit -m "Add Google TTS and update docs and fix bug and refactor"
```

---

## 🔀 Pull-Request-Prozess

### Pull-Request-Template

```markdown
## Beschreibung
Kurze Beschreibung der Änderungen.

## Typ der Änderung
- [ ] Bugfix (non-breaking change)
- [ ] Neues Feature (non-breaking change)
- [ ] Breaking Change (fix/feature mit Breaking Changes)
- [ ] Dokumentation

## Änderungen im Detail
- Änderung 1
- Änderung 2
- Änderung 3

## Tests
Wie wurde getestet?
- [ ] Manuelle Tests durchgeführt
- [ ] Alle bestehenden Tests laufen durch
- [ ] Neue Tests hinzugefügt

## Screenshots (falls UI-Änderungen)
![Screenshot](url)

## Checkliste
- [ ] Code folgt dem Projekt-Style
- [ ] Selbst-Review durchgeführt
- [ ] Kommentare in komplexem Code
- [ ] Dokumentation aktualisiert
- [ ] Keine Warnings generiert
- [ ] CHANGELOG.md aktualisiert (falls notwendig)

## Verwandte Issues
Closes #123
```

### Review-Kriterien

**Code-Qualität:**
- ✅ Code ist lesbar und gut dokumentiert
- ✅ Keine offensichtlichen Bugs
- ✅ Error-Handling vorhanden
- ✅ Logging konsistent

**Funktionalität:**
- ✅ Feature funktioniert wie beschrieben
- ✅ Keine Breaking Changes (oder dokumentiert)
- ✅ Edge-Cases berücksichtigt

**Tests:**
- ✅ Manuell getestet
- ✅ Bestehende Features nicht gebrochen

**Dokumentation:**
- ✅ README/Wiki aktualisiert
- ✅ CHANGELOG aktualisiert
- ✅ Code-Kommentare vorhanden

---

## 🧪 Testing

### Manuelles Testen

**Aktuell:** Keine automatisierten Tests vorhanden.

**Test-Checkliste vor PR:**

**TikTok-Verbindung:**
- [ ] Verbindung zu TikTok LIVE erfolgreich
- [ ] Gift-Events werden empfangen
- [ ] Chat-Events werden empfangen
- [ ] Follow/Subscribe/Share-Events funktionieren

**Alerts:**
- [ ] Test-Alert funktioniert
- [ ] Alert wird im Overlay angezeigt
- [ ] Sound wird abgespielt
- [ ] Alert verschwindet nach Duration

**TTS:**
- [ ] Test-TTS funktioniert
- [ ] Stimmen-Auswahl funktioniert
- [ ] Volume/Speed-Anpassungen funktionieren
- [ ] Queue funktioniert (mehrere TTS hintereinander)

**Goals:**
- [ ] Goal-Increment funktioniert
- [ ] Goal-Overlay zeigt korrekten Wert
- [ ] Goal-Reset funktioniert
- [ ] Progress-Bar aktualisiert sich

**Flows:**
- [ ] Flow-Erstellung funktioniert
- [ ] Flow-Test funktioniert
- [ ] Flow wird bei echten Events getriggert
- [ ] Actions werden korrekt ausgeführt

**Plugins:**
- [ ] Plugin kann aktiviert/deaktiviert werden
- [ ] Plugin-Config kann gespeichert werden
- [ ] Plugin funktioniert nach Neustart

### API-Testing mit Postman

**Postman Collection importieren:**

Erstelle `postman_collection.json`:
```json
{
  "info": {
    "name": "TikTok Helper API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "TikTok Connect",
      "request": {
        "method": "POST",
        "url": "http://localhost:3000/api/connect",
        "body": {
          "mode": "raw",
          "raw": "{\"username\": \"test_user\"}",
          "options": {
            "raw": {
              "language": "json"
            }
          }
        }
      }
    },
    {
      "name": "Get Settings",
      "request": {
        "method": "GET",
        "url": "http://localhost:3000/api/settings"
      }
    }
  ]
}
```

---

## 🐛 Debugging

### Node.js Debugger

**VS Code Launch Config (`.vscode/launch.json`):**
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Server",
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceFolder}/server.js",
      "env": {
        "NODE_ENV": "development",
        "LOG_LEVEL": "debug"
      }
    }
  ]
}
```

**Breakpoints setzen:**
- Klick auf Zeilennummer in VS Code
- Oder: `debugger;` im Code

**Debugging starten:**
- F5 in VS Code
- Oder: Run → Start Debugging

### Chrome DevTools (Frontend)

**Dashboard debuggen:**
1. Dashboard öffnen: `http://localhost:3000`
2. F12 → Developer Tools öffnen
3. Console-Tab: Log-Ausgaben
4. Network-Tab: HTTP-Requests/WebSocket
5. Sources-Tab: Breakpoints setzen

**Overlay debuggen:**
1. Overlay in Browser öffnen: `http://localhost:3000/overlay.html`
2. F12 → Developer Tools
3. Console → Fehler prüfen
4. Network → Socket.io-Verbindung prüfen

### Logging-Levels

```javascript
// modules/logger.js
logger.error('Kritischer Fehler');  // Immer loggen
logger.warn('Warnung');             // Production
logger.info('Info');                // Production
logger.debug('Debug-Info');         // Development only
```

**Log-Level setzen:**
```bash
LOG_LEVEL=debug npm start
```

**Log-Dateien:**
```
logs/
├── combined.log       # Alle Logs
├── error.log          # Nur Errors
└── app-YYYY-MM-DD.log # Daily Rotate (30 Tage)
```

---

## 📊 Logging

### Logger verwenden

**Import:**
```javascript
const logger = require('./modules/logger');
```

**Usage:**
```javascript
// Info-Level (Standard)
logger.info('Server started on port 3000');
logger.info(`User ${username} connected`);

// Error-Level
logger.error('Database connection failed', error);
logger.error(`Gift handling failed for ${giftId}`, error);

// Warning-Level
logger.warn('TTS queue is full');
logger.warn(`Flow ${flowId} has invalid condition`);

// Debug-Level (nur im Dev-Modus)
logger.debug('Processing gift event', giftData);
logger.debug(`Flow ${flowId} triggered`);
```

**Niemals `console.log` verwenden!**
```javascript
// ❌ Schlecht
console.log('User connected');

// ✅ Gut
logger.info('User connected');
```

### Structured Logging

```javascript
// Mit Meta-Daten
logger.info('Gift received', {
    username: data.username,
    giftName: data.giftName,
    coins: data.coins,
    timestamp: Date.now()
});
```

---

## 🚨 Error-Handling

### Try-Catch für Async-Operationen

**Regel:** Alle `async`-Funktionen müssen Try-Catch haben.

```javascript
async function myAsyncFunction() {
    try {
        const result = await someAsyncOperation();
        return result;
    } catch (error) {
        logger.error('Operation failed:', error);
        throw error; // Oder: return null, je nach Use-Case
    }
}
```

### Express-Error-Handling-Middleware

```javascript
// modules/error-handler.js
function errorHandler(err, req, res, next) {
    logger.error('Express error:', err);

    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal Server Error'
    });
}

// In server.js
app.use(errorHandler);
```

### Graceful Shutdown

```javascript
// In server.js
process.on('SIGINT', async () => {
    logger.info('Shutting down gracefully...');

    // TikTok-Verbindung trennen
    if (tiktok.connection) {
        await tiktok.disconnect();
    }

    // Server schließen
    server.close(() => {
        logger.info('Server closed');
        process.exit(0);
    });
});
```

---

## ⚡ Performance-Best-Practices

### 1. Datenbank-Optimierung

**Nutze Prepared Statements:**
```javascript
// ✅ Gut
const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
const user = stmt.get(userId);

// ❌ Schlecht (SQL-Injection-Risiko)
const user = db.prepare(`SELECT * FROM users WHERE id = ${userId}`).get();
```

**Nutze Transactions für Bulk-Inserts:**
```javascript
const insertMany = db.transaction((items) => {
    const stmt = db.prepare('INSERT INTO items (name) VALUES (?)');
    items.forEach(item => stmt.run(item.name));
});

insertMany(items); // Viel schneller als einzelne Inserts
```

### 2. Socket.io-Optimierung

**Nutze Rooms für gezielte Broadcasts:**
```javascript
// ❌ Schlecht: Broadcast an alle
io.emit('goal:update', data);

// ✅ Gut: Nur an interessierte Clients
io.to('goal:likes').emit('goal:update', data);
```

### 3. Caching

**In-Memory-Cache für häufige Abfragen:**
```javascript
const cache = new Map();

function getGiftCatalog() {
    if (cache.has('giftCatalog')) {
        return cache.get('giftCatalog');
    }

    const catalog = db.prepare('SELECT * FROM gifts').all();
    cache.set('giftCatalog', catalog);
    return catalog;
}
```

---

## 🔒 Sicherheitsrichtlinien

### 1. Input-Validierung

**Nutze modules/validators.js:**
```javascript
const { validateUsername, validateSettings } = require('./modules/validators');

app.post('/api/connect', (req, res) => {
    const { username } = req.body;

    if (!validateUsername(username)) {
        return res.status(400).json({ error: 'Invalid username' });
    }

    // ...
});
```

### 2. SQL-Injection-Schutz

**Nutze immer Prepared Statements (siehe oben).**

### 3. XSS-Schutz

**Sanitize User-Input im Frontend:**
```javascript
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Nutzen:
element.innerHTML = escapeHtml(userInput);
```

### 4. Secrets & API-Keys

**Niemals Secrets committen!**

**Nutze Umgebungsvariablen:**
```javascript
const apiKey = process.env.GOOGLE_API_KEY || '';
```

**Prüfe `.gitignore`:**
```
user_configs/
user_data/
.env
*.db
logs/
```

---

## 📚 Dokumentation

### Code-Dokumentation (JSDoc)

```javascript
/**
 * Verbindet zu TikTok LIVE
 *
 * @param {string} username - TikTok-Username (ohne @)
 * @param {Object} [options={}] - Optionen
 * @param {boolean} [options.processInitialData=true] - Initial-Daten verarbeiten
 * @returns {Promise<boolean>} - true bei Erfolg, false bei Fehler
 * @throws {Error} - Wenn Username ungültig
 * @example
 * await connectToTikTok('user123');
 */
async function connectToTikTok(username, options = {}) {
    // ...
}
```

### README/Wiki aktualisieren

**Bei neuen Features:**
1. README.md aktualisieren (Feature-Liste)
2. Wiki-Seite erstellen/aktualisieren
3. CHANGELOG.md aktualisieren

**CHANGELOG-Format:**
```markdown
## [1.0.3] - 2025-11-12

### Added
- OSC-Bridge Plugin für VRChat-Integration
- Multi-Cam Switcher mit Macro-System

### Changed
- TTS-Plugin: 20 neue Stimmen hinzugefügt
- Flow-Engine: Performance-Verbesserungen

### Fixed
- TTS-Queue-Overflow bei 100+ Nachrichten
- OBS-WebSocket-Reconnect-Bug
```

---

## 🔗 Weitere Ressourcen

- **[[Plugin-Dokumentation]]** - Plugin erstellen
- **[[API-Reference]]** - API-Endpunkte
- **[[Architektur]]** - Systemarchitektur verstehen

---

[← Architektur](Architektur) | [→ Plugin-Dokumentation](Plugin-Dokumentation)

---

*Letzte Aktualisierung: 2025-11-11*
