# Wiki Index - Little TikTool Helper v1.3.3

**Vollständige Dokumentation für PupCid's Little TikTool Helper**

---

## 🚀 Schnellstart

Neu hier? Starte mit diesen Seiten:

1. **[Getting Started](Getting-Started.md)** - 5-Minuten-Schnelleinstieg
2. **[Installation & Setup](Installation-&-Setup.md)** - Detaillierte Installation
3. **[Snapshot Status](Snapshot-Status.md)** - Aktueller Stand dieses lokalen Snapshots
4. **[Plugin-Liste](Plugin-Liste.md)** - Alle 35 Plugins im Überblick

---

## 📚 Hauptbereiche

### 🎯 Erste Schritte

| Seite | Beschreibung | Zielgruppe |
|-------|--------------|------------|
| **[Getting Started](Getting-Started.md)** | Schnelleinstieg in 5 Minuten | Anfänger |
| **[Snapshot Status](Snapshot-Status.md)** | Aktuelle Snapshot-Fakten und bekannte Einschränkungen | Alle |
| **[Installation & Setup](Installation-&-Setup.md)** | Systemanforderungen, Installation | Alle |
| **[Konfiguration](Konfiguration.md)** | Einstellungen und Config-Dateien | Fortgeschritten |
| **[FAQ & Troubleshooting](FAQ-&-Troubleshooting.md)** | Häufige Probleme und Lösungen | Alle |

### 🔌 Plugins

| Seite | Beschreibung | Plugins |
|-------|--------------|---------|
| **[Plugin-Dokumentation](Plugin-Dokumentation.md)** | Plugin-System-Übersicht | Grundlagen |
| **[Plugin-Liste](Plugin-Liste.md)** | Alle 35 Plugins mit Details | Komplett |
| **[VDO.Ninja](Plugins/VDO-Ninja.md)** | VDO.Ninja Multi-Guest-Manager | Spezifisch |

**Plugin-Status im Snapshot:**
- **35 Plugin-Manifeste** unter `app/plugins/`
- **18 standardmäßig aktiviert**, **18 standardmäßig deaktiviert**
- Die Plugin-Manifeste und der Plugin-Manager sind die aktuelle Quelle der Wahrheit.
- Einzelne Beschreibungstexte können ältere Reifegrad- oder Versionsformulierungen enthalten.

### ✨ Features

| Seite | Beschreibung | Level |
|-------|--------------|-------|
| **[WebGPU Engine](Features/WebGPU-Engine.md)** | GPU-beschleunigtes Rendering | Fortgeschritten |
| **[GCCE](Features/GCCE.md)** | Global Chat Command Engine | Mittel |
| **[Emoji Rain](Features/Emoji-Rain.md)** | Emoji-Regen-Effekt | Anfänger |
| **[Cloud Sync](Features/Cloud-Sync.md)** | Cloud-Synchronisation | Fortgeschritten |

### 🎨 Overlays & Streaming

| Seite | Beschreibung | OBS-Kenntnisse |
|-------|--------------|----------------|
| **[Overlays & Alerts](Overlays-&-Alerts.md)** | 25+ Overlays für OBS Studio | Anfänger |
| **[Advanced Features](Advanced-Features.md)** | Advanced Features & Optimierungen | Fortgeschritten |
| **[Alerts](modules/alerts.md)** | Alert-System im Detail | Mittel |
| **[Flows](modules/flows.md)** | Event-Automation-Flows | Mittel |

### 👨‍💻 Entwickler

| Seite | Beschreibung | Niveau |
|-------|--------------|--------|
| **[Entwickler-Leitfaden](Entwickler-Leitfaden.md)** | Coding-Standards, Workflow | Alle Devs |
| **[Architektur](Architektur.md)** | System-Architektur | Fortgeschritten |
| **[API-Reference](API-Reference.md)** | REST-API & WebSocket-Events | Alle Devs |

---

## 🎓 Thematische Guides

### Streaming-Setup

1. **[Getting Started](Getting-Started.md)** - Grundsetup
2. **[Overlays & Alerts](Overlays-&-Alerts.md)** - OBS-Overlays einrichten
3. **[TTS v2.0](Plugin-Liste.md#tts-v20)** - Text-to-Speech konfigurieren
4. **[Live Goals](Plugin-Liste.md#live-goals)** - Goals einrichten
5. **[Leaderboard](Plugin-Liste.md#leaderboard)** - Leaderboard hinzufügen

### VRChat-Streaming

1. **[OSC-Bridge](Plugin-Liste.md#osc-bridge-vrchat)** - OSC-Bridge Setup
2. **[Multi-Device Setup](Advanced-Features.md#multi-device-setup)** - Multi-Device-Setup
3. **[ClarityHUD](Plugin-Liste.md#clarityhud)** - VR-optimiertes HUD

### Multi-Guest-Streaming

1. **[VDO.Ninja](Plugins/VDO-Ninja.md)** - VDO.Ninja einrichten
2. **[Multi-Cam Switcher](Plugin-Liste.md#multi-cam-switcher)** - Kamera-Switching
3. **[Quiz Show](Plugin-Liste.md#quiz-show)** - Quiz mit Gästen

### Performance-Optimierung

1. **[WebGPU Engine](Features/WebGPU-Engine.md)** - GPU-Rendering nutzen
2. **[Performance Optimierungen](Advanced-Features.md#performance-optimizations)** - Optimierungen
3. **[Performance & Skalierung](Architektur.md#performance--skalierung)** - Skalierungs-Strategien

### Plugin-Entwicklung

1. **[Plugin-Dokumentation](Plugin-Dokumentation.md)** - Plugin-Basics
2. **[Entwickler-Leitfaden](Entwickler-Leitfaden.md)** - Best Practices
3. **[API-Reference](API-Reference.md)** - API-Methoden
4. **[Plugin Data Storage](Advanced-Features.md#plugin-data-storage)** - Daten-Speicherung

---

## 📊 Funktionsmatrix

### Nach Use-Case

| Use-Case | Plugins | Features |
|----------|---------|----------|
| **Basis-Streaming** | TTS v2.0, Live Goals, Leaderboard | Alerts, Chat-Feed |
| **VRChat** | OSC-Bridge, ClarityHUD | OSC-Integration |
| **Multi-Guest** | VDO.Ninja, Multi-Cam | Room-Management |
| **Gamification** | Viewer XP, CoinBattle, Quiz Show | XP-System, Battles |
| **Visual Effects** | WebGPU Emoji Rain, Fireworks, Weather | GPU-Effekte |
| **Interaktivität** | GCCE, Soundboard, Gift Milestone | Chat-Commands |
| **Hardware** | OpenShock, Thermal Printer, OSC-Bridge | Physical Feedback |

### Nach Schwierigkeit

**Anfänger (Plug & Play):**
- TTS v2.0
- Live Goals
- Leaderboard
- Spotlight
- Soundboard

**Mittel (Konfiguration erforderlich):**
- Multi-Cam Switcher
- VDO.Ninja
- Quiz Show
- Viewer XP System
- Gift Milestone

**Fortgeschritten (Setup & Tuning):**
- WebGPU Emoji Rain
- Fireworks Superplugin
- OSC-Bridge
- OpenShock
- GCCE HUD

**Expert (Development/Customization):**
- Stream Monsters
- API Bridge
- GCCE (für Entwickler)
- Custom Plugins

---

## 🔗 Externe Ressourcen

### Official Links
- **GitHub Repository:** [Loggableim/ltth.app](https://github.com/Loggableim/ltth.app)
- **Changelog:** [CHANGELOG.md](https://github.com/Loggableim/ltth.app/blob/main/CHANGELOG.md)
- **License:** CC BY-NC 4.0
- **Terms of Service:** [https://ltth.app/terms-of-service](https://ltth.app/terms-of-service)
- **Privacy Policy:** [https://ltth.app/privacy-policy](https://ltth.app/privacy-policy)
- **Terms of Service (Wiki):** [#wiki:terms-of-service](#wiki:terms-of-service)
- **Privacy Policy (Wiki):** [#wiki:privacy-policy](#wiki:privacy-policy)

### Support
- **E-Mail:** loggableim@gmail.com
- **Issues:** [GitHub Issues](https://github.com/Loggableim/ltth.app/issues)

### Externe Tools
- **Node.js:** [nodejs.org](https://nodejs.org/)
- **OBS Studio:** [obsproject.com](https://obsproject.com/)
- **Eulerstream:** [eulerstream.com](https://eulerstream.com/) (TikTok LIVE API)
- **VDO.Ninja:** [vdo.ninja](https://vdo.ninja/)

---

## 🆕 Version 1.3.3 Highlights

### Aktueller Snapshot
- ✅ **36 integrierte Plugin-Manifeste**
- ✅ **Node/Express-Laufzeit in `app/`** als gepflegte Anwendung
- ✅ **EulerStream-Adapter** als TikTok-LIVE-Datenquellen
- ✅ **Statische Dashboard-/Overlay-Oberflächen** unter `app/public/`
- ✅ **Go-Launcher-Quellen** unter `build-src/`

### Bekannte Einschränkungen
- Dieser Workspace ist aktuell kein Git-Checkout.
- Die frühere Electron-Main-Process-Struktur ist in diesem Snapshot nicht vorhanden.
- Die Jest-Gesamtsuite hat bekannte Restfehler; fokussierte Tests sind bei Änderungen Pflicht.
- `docs_archive/` ist historische Referenz und darf nicht als aktuelle Anleitung gelesen werden.

Siehe **[Home](Home.md)** für vollständige Übersicht.

---

## 📝 Dokumentations-Status

| Bereich | Status | Vollständigkeit |
|---------|--------|-----------------|
| Getting Started | ✅ | 100% |
| Installation | ✅ | 100% |
| Snapshot Status | ✅ | Aktuell |
| Plugin-Liste | ✅ | Inventar 36/36, Detailtexte teils historisch |
| Feature-Docs | ✅ | 100% |
| Overlays | ✅ | 100% |
| Advanced | ✅ | 100% |
| API-Reference | ✅ | 100% |
| Developer Guide | ✅ | 100% |
| Troubleshooting | ✅ | 100% |

**Letzte große Aktualisierung:** 2026-04-28
**Version:** 1.3.3

---

## 🎯 Häufige Aufgaben - Schnellzugriff

### Setup
- **[Schnellstart](Getting-Started.md#schnellstart-5-minuten)** - Tool starten
- **[TikTok verbinden](Getting-Started.md#tiktok-verbinden)** - TikTok LIVE verbinden
- **[OBS Browser Source Setup](Overlays-&-Alerts.md#obs-browser-source-setup)** - OBS einrichten

### Konfiguration
- **[TTS v2.0](Plugin-Liste.md#tts-v20)** - TTS-Stimmen konfigurieren
- **[Live Goals](Plugin-Liste.md#live-goals)** - Goals erstellen
- **[Umgebungsvariablen](Konfiguration.md#umgebungsvariablen)** - Env-Variablen setzen

### Troubleshooting
- **[Plugin lädt nicht](FAQ-&-Troubleshooting.md#plugin-lädt-nicht)** - Plugin-Probleme
- **[Overlay lädt nicht](Overlays-&-Alerts.md#overlay-lädt-nicht)** - Overlay-Probleme
- **[TikTok Verbindung](FAQ-&-Troubleshooting.md#tiktok-verbindung-fehlgeschlagen)** - Connection-Issues

### Development
- **[Beispiel Plugin erstellen](Plugin-Dokumentation.md#beispiel-plugin-erstellen)** - Plugin erstellen
- **[REST API Endpoints](API-Reference.md#rest-api-endpoints)** - API nutzen
- **[Code Style & Standards](Entwickler-Leitfaden.md#code-style--standards)** - Coding-Standards

---

## 📖 Wiki durchsuchen

**Nach Stichwort:**
- **TikTok:** [Getting Started](Getting-Started.md), [Installation & Setup](Installation-&-Setup.md), [FAQ & Troubleshooting](FAQ-&-Troubleshooting.md)
- **OBS:** [Overlays & Alerts](Overlays-&-Alerts.md), [OBS einrichten](Getting-Started.md#obs-einrichten)
- **Plugins:** [Plugin-Liste](Plugin-Liste.md), [Plugin-Dokumentation](Plugin-Dokumentation.md)
- **WebGPU:** [WebGPU Engine](Features/WebGPU-Engine.md), [WebGPU Emoji Rain](Plugin-Liste.md#webgpu-emoji-rain)
- **VRChat:** [OSC-Bridge](Plugin-Liste.md#osc-bridge-vrchat), [ClarityHUD](Plugin-Liste.md#clarityhud)
- **Performance:** [Performance Optimierungen](Advanced-Features.md#performance-optimizations), [WebGPU Engine](Features/WebGPU-Engine.md)
- **Chat Commands:** [GCCE](Features/GCCE.md), [GCCE](Plugin-Liste.md#gcce)
- **Automation:** [Flows](modules/flows.md), [Flow System](Advanced-Features.md#flow-system)

---

## 🗺️ Wiki-Struktur

```
app/wiki/
├── Home.md                          # Startseite
├── Wiki-Index.md                    # Diese Seite
├── Snapshot-Status.md               # Aktueller Snapshot-Stand
│
├── 📁 Erste Schritte
│   ├── Getting-Started.md           # Schnelleinstieg
│   ├── Installation-&-Setup.md      # Installation
│   ├── Konfiguration.md             # Konfiguration
│   └── FAQ-&-Troubleshooting.md     # Troubleshooting
│
├── 📁 Plugins
│   ├── Plugin-Dokumentation.md      # Plugin-System
│   ├── Plugin-Liste.md              # Plugin-Inventar
│   └── Plugins/
│       └── VDO-Ninja.md             # VDO.Ninja-Details
│
├── 📁 Features
│   ├── WebGPU-Engine.md             # WebGPU-Rendering
│   ├── GCCE.md                      # Chat-Commands
│   ├── Emoji-Rain.md                # Emoji-Effekte
│   └── Cloud-Sync.md                # Cloud-Sync
│
├── 📁 Overlays & Streaming
│   ├── Overlays-&-Alerts.md         # 25+ Overlays
│   └── modules/
│       ├── alerts.md                # Alert-System
│       └── flows.md                 # Automation-Flows
│
├── 📁 Advanced
│   └── Advanced-Features.md         # Advanced Topics
│
└── 📁 Entwickler
    ├── Entwickler-Leitfaden.md      # Coding-Guide
    ├── Architektur.md               # System-Architektur
    └── API-Reference.md             # API-Dokumentation
```

---

## ✅ Wartungs-Checkliste

### Dokumentiert
- [x] Plugin-Inventar mit 36 Manifesten
- [x] Alle Features (WebGPU, GCCE, etc.)
- [x] Alle 25+ Overlays
- [x] Installation & Setup
- [x] Getting Started Guide
- [x] Snapshot-Status
- [x] Troubleshooting
- [x] API-Reference
- [x] Developer Guide
- [x] Architecture
- [x] Performance-Optimierungen
- [x] Security-Features
- [x] Multi-Device-Setup
- [x] Plugin Data Storage

### Version-Updates
- [x] Startseite auf v1.3.3 aktualisiert
- [x] Snapshot-Status ergänzt
- [ ] Einzelne historische Detailformulierungen weiter seitenweise prüfen
- [x] Branding auf "Little TikTool Helper"

---

**Zurück zur Startseite:** **[Home](Home.md)**

---

*Letzte Aktualisierung: 2026-04-28*
*Version: 1.3.3*
*Wiki-Seiten: 20+*
*Status: funktionsfähig, mit bekannten historischen Detailtexten*
