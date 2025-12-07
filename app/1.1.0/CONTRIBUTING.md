# Contributing to PupCid's Little TikTool Helper

Vielen Dank für dein Interesse, zu diesem Projekt beizutragen! / Thank you for your interest in contributing to this project!

---

## 📋 Contribution Guidelines

### Bevor du beiträgst / Before Contributing

1. **Lies die Dokumentation:**
   - [`ANALYSIS.md`](ANALYSIS.md) – Repository-Analyse und Architekturübersicht
   - [`llm_start_here.md`](llm_start_here.md) – Technischer Einstiegspunkt

2. **Verstehe die Architektur:**
   - Express + Socket.io + SQLite Backend
   - Plugin-System mit Lifecycle-Management
   - OBS-kompatible Overlays

3. **Halte dich an bestehende Patterns:**
   - Keine Features entfernen
   - Logger nutzen statt console.log
   - Try-Catch für alle Async-Operationen

---

## 🎨 Code-Style & Architektur

### Allgemeine Regeln

- **Sprache:** Code und Kommentare auf Englisch, Dokumentation auf Deutsch (außer README)
- **Formatierung:** 2 Spaces für Einrückung, keine Tabs
- **Keine Feature-Entfernung:** Nur ergänzen/patchen, niemals löschen
- **Error-Handling:** Immer Try-Catch für Async-Operationen
- **Config-Validierung:** Immer Defaults setzen, wenn Config fehlt

### Plugin-Entwicklung

Alle Plugins folgen dieser Struktur:

```
plugins/<plugin-id>/
├── plugin.json       # Metadata (id, name, version, entry)
├── main.js           # Plugin-Klasse mit init() und destroy()
├── ui.html           # Optional: Admin-UI
└── assets/           # Optional: CSS, JS, Images
```

**Plugin-Klasse Beispiel:**

```javascript
class MyPlugin {
  constructor(api) {
    this.api = api;
  }

  async init() {
    // Routes/Sockets/Events registrieren
    // Config laden
  }

  async destroy() {
    // Cleanup (Connections schließen, Timers löschen)
  }
}

module.exports = MyPlugin;
```

### Changelog-Updates

Nach jeder Änderung:

1. **CHANGELOG.txt** aktualisieren (Datum, Dateien, Beschreibung)
2. **llm_start_here.md** synchronisieren (falls relevant)

---

## 🤖 Nutzung von GitHub Copilot / KI-Agents

### Engineering-Agent

Dieses Projekt verfügt über einen definierten **Engineering-Agent** für KI-Tools.

**Bitte lies zuerst:** [`ENGINEERING_AGENT.md`](ENGINEERING_AGENT.md)

### Regeln für KI-gestützte Änderungen

1. **Analyse vor Aktion:**
   - Zuerst vollständige Analyse des Problems durchführen
   - Reparaturplan erstellen und reviewen lassen
   - Erst danach Code-Änderungen vornehmen

2. **Keine Plugin-APIs brechen:**
   - Bestehende Routen und Events nicht ändern
   - Rückwärtskompatibilität wahren
   - Dokumentierte Schnittstellen respektieren

3. **Produktionsreife Lösungen:**
   - Keine TODOs oder Platzhalter
   - Vollständig funktionsfähiger Code
   - Keine halben Snippets

4. **Repository-Wahrheit:**
   - ANALYSIS.md und /infos als maßgeblich betrachten
   - Dokumentierte Architekturentscheidungen respektieren

### Kurzprompt für Copilot Chat

Wenn du Copilot für dieses Projekt nutzt, starte mit:

> Du bist der Engineering-Agent für „PupCid's Little TikTool Helper". Lies zuerst `/infos/ENGINEERING_AGENT.md` und `ANALYSIS.md` und halte dich strikt an diese Vorgaben. Führe zunächst nur eine Analyse des Problems durch und schlage einen Reparaturplan vor, bevor du Code änderst.

---

## 📝 Pull Request Process

1. **Fork** das Repository
2. **Branch** erstellen: `feature/meine-aenderung` oder `fix/bug-beschreibung`
3. **Änderungen** durchführen (Code-Style beachten!)
4. **Testen** – Funktionalität prüfen
5. **Dokumentieren** – CHANGELOG.txt aktualisieren
6. **Pull Request** erstellen mit klarer Beschreibung

---

## 🧪 Testen / Testing

### Testinfrastruktur

Tests befinden sich in `app/test/` und können mit folgenden Befehlen ausgeführt werden:

Tests are located in `app/test/` and can be run with the following commands:

```bash
# Im app-Verzeichnis / In the app directory
cd ../app

# Einzelne Tests ausführen / Run individual tests
node test/plugin-state-persistence.test.js
node test/tts-autofallback.test.js
```

### Testanforderungen für Pull Requests

- **Neue Features:** Sollten mit Tests abgedeckt sein, wenn möglich
- **Bug Fixes:** Reproduktionstest empfohlen
- **Keine Breaking Changes:** Bestehende Tests müssen weiterhin bestehen

---

## 🐛 Bug Reports

Bug Reports bitte mit folgenden Informationen:

- **Beschreibung:** Was passiert? Was erwartest du?
- **Schritte zur Reproduktion:** Wie kann ich den Bug reproduzieren?
- **Environment:** Node.js Version, OS, Browser
- **Logs:** Relevante Konsolenfehler oder Logdateien

---

## 💬 Kontakt

- **Support:** [loggableim@gmail.com](mailto:loggableim@gmail.com)
- **Issues:** GitHub Issues für Bug Reports und Feature Requests

---

*Vielen Dank für deinen Beitrag! / Thank you for your contribution!*
