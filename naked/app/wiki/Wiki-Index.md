# Wiki Index - Little TikTool Helper v1.3.3

**VollstÃ¤ndige Dokumentation fÃ¼r PupCid's Little TikTool Helper**

---

## ðŸš€ Schnellstart

Neu hier? Starte mit diesen Seiten:

1. **[Getting Started](Getting-Started.md)** - 5-Minuten-Schnelleinstieg
2. **[Installation & Setup](Installation-&-Setup.md)** - Detaillierte Installation
3. **[Snapshot Status](Snapshot-Status.md)** - Aktueller Stand dieses lokalen Snapshots
4. **[Plugin-Liste](Plugin-Liste.md)** - Alle 36 Plugins im Ãœberblick

---

## ðŸ“š Hauptbereiche

### ðŸŽ¯ Erste Schritte

| Seite | Beschreibung | Zielgruppe |
|-------|--------------|------------|
| **[Getting Started](Getting-Started.md)** | Schnelleinstieg in 5 Minuten | AnfÃ¤nger |
| **[Snapshot Status](Snapshot-Status.md)** | Aktuelle Snapshot-Fakten und bekannte EinschrÃ¤nkungen | Alle |
| **[Installation & Setup](Installation-&-Setup.md)** | Systemanforderungen, Installation | Alle |
| **[Konfiguration](Konfiguration.md)** | Einstellungen und Config-Dateien | Fortgeschritten |
| **[FAQ & Troubleshooting](FAQ-&-Troubleshooting.md)** | HÃ¤ufige Probleme und LÃ¶sungen | Alle |

### ðŸ”Œ Plugins

| Seite | Beschreibung | Plugins |
|-------|--------------|---------|
| **[Plugin-Dokumentation](Plugin-Dokumentation.md)** | Plugin-System-Ãœbersicht | Grundlagen |
| **[Plugin-Liste](Plugin-Liste.md)** | Alle 36 Plugins mit Details | Komplett |
| **[VDO.Ninja](Plugins/VDO-Ninja.md)** | VDO.Ninja Multi-Guest-Manager | Spezifisch |

**Plugin-Status im Snapshot:**
- **36 Plugin-Manifeste** unter `app/plugins/`
- **18 standardmÃ¤ÃŸig aktiviert**, **18 standardmÃ¤ÃŸig deaktiviert**
- Die Plugin-Manifeste und der Plugin-Manager sind die aktuelle Quelle der Wahrheit.
- Einzelne Beschreibungstexte kÃ¶nnen Ã¤ltere Reifegrad- oder Versionsformulierungen enthalten.

### âœ¨ Features

| Seite | Beschreibung | Level |
|-------|--------------|-------|
| **[WebGPU Engine](Features/WebGPU-Engine.md)** | GPU-beschleunigtes Rendering | Fortgeschritten |
| **[GCCE](Features/GCCE.md)** | Global Chat Command Engine | Mittel |
| **[Emoji Rain](Features/Emoji-Rain.md)** | Emoji-Regen-Effekt | AnfÃ¤nger |
| **[Cloud Sync](Features/Cloud-Sync.md)** | Cloud-Synchronisation | Fortgeschritten |

### ðŸŽ¨ Overlays & Streaming

| Seite | Beschreibung | OBS-Kenntnisse |
|-------|--------------|----------------|
| **[Overlays & Alerts](Overlays-&-Alerts.md)** | 25+ Overlays fÃ¼r OBS Studio | AnfÃ¤nger |
| **[Advanced Features](Advanced-Features.md)** | Advanced Features & Optimierungen | Fortgeschritten |
| **[Alerts](modules/alerts.md)** | Alert-System im Detail | Mittel |
| **[Flows](modules/flows.md)** | Event-Automation-Flows | Mittel |

### ðŸ‘¨â€ðŸ’» Entwickler

| Seite | Beschreibung | Niveau |
|-------|--------------|--------|
| **[Entwickler-Leitfaden](Entwickler-Leitfaden.md)** | Coding-Standards, Workflow | Alle Devs |
| **[Architektur](Architektur.md)** | System-Architektur | Fortgeschritten |
| **[API-Reference](API-Reference.md)** | REST-API & WebSocket-Events | Alle Devs |

---

## ðŸŽ“ Thematische Guides

### Streaming-Setup

1. **[Getting Started](Getting-Started.md)** - Grundsetup
2. **[Overlays & Alerts](Overlays-&-Alerts.md)** - OBS-Overlays einrichten
3. **[TTS v2.0](Plugin-Liste.md#tts-v20)** - Text-to-Speech konfigurieren
4. **[Live Goals](Plugin-Liste.md#live-goals)** - Goals einrichten
5. **[Leaderboard](Plugin-Liste.md#leaderboard)** - Leaderboard hinzufÃ¼gen

### VRChat-Streaming

1. **[OSC-Bridge](Plugin-Liste.md#osc-bridge-vrchat)** - OSC-Bridge Setup
2. **[Multi-Device Setup](Advanced-Features.md#multi-device-setup)** - Multi-Device-Setup
3. **[ClarityHUD](Plugin-Liste.md#clarityhud)** - VR-optimiertes HUD

### Multi-Guest-Streaming

1. **[VDO.Ninja](Plugins/VDO-Ninja.md)** - VDO.Ninja einrichten
2. **[Multi-Cam Switcher](Plugin-Liste.md#multi-cam-switcher)** - Kamera-Switching
3. **[Quiz Show](Plugin-Liste.md#quiz-show)** - Quiz mit GÃ¤sten

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

## ðŸ“Š Funktionsmatrix

### Nach Use-Case

| Use-Case | Plugins | Features |
|----------|---------|----------|
| **Basis-Streaming** | TTS v2.0, Live Goals, Leaderboard | Alerts, Chat-Feed |
| **VRChat** | OSC-Bridge, ClarityHUD | OSC-Integration |
| **Multi-Guest** | VDO.Ninja, Multi-Cam | Room-Management |
| **Gamification** | Viewer XP, CoinBattle, Quiz Show | XP-System, Battles |
| **Visual Effects** | WebGPU Emoji Rain, Fireworks, Weather | GPU-Effekte |
| **InteraktivitÃ¤t** | GCCE, Soundboard, Gift Milestone | Chat-Commands |
| **Hardware** | OpenShock, Thermal Printer, OSC-Bridge | Physical Feedback |

### Nach Schwierigkeit

**AnfÃ¤nger (Plug & Play):**
- TTS v2.0
- Live Goals
- Leaderboard
- LastEvent Spotlight
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
- Stream Alchemy
- API Bridge
- GCCE (fÃ¼r Entwickler)
- Custom Plugins

---

## ðŸ”— Externe Ressourcen

### Official Links
- **GitHub Repository:** [Loggableim/ltth_desktop2](https://github.com/Loggableim/ltth_desktop2)
- **Changelog:** [CHANGELOG.md](https://github.com/Loggableim/ltth_desktop2/blob/main/CHANGELOG.md)
- **License:** CC BY-NC 4.0

### Support
- **E-Mail:** loggableim@gmail.com
- **Issues:** [GitHub Issues](https://github.com/Loggableim/ltth_desktop2/issues)

### Externe Tools
- **Node.js:** [nodejs.org](https://nodejs.org/)
- **OBS Studio:** [obsproject.com](https://obsproject.com/)
- **Eulerstream:** [eulerstream.com](https://eulerstream.com/) (TikTok LIVE API)
- **VDO.Ninja:** [vdo.ninja](https://vdo.ninja/)

---

## ðŸ†• Version 1.3.3 Highlights

### Aktueller Snapshot
- âœ… **36 integrierte Plugin-Manifeste**
- âœ… **Node/Express-Laufzeit in `app/`** als gepflegte Anwendung
- âœ… **Eulerstream- und TikFinity-Adapter** als TikTok-LIVE-Datenquellen
- âœ… **Statische Dashboard-/Overlay-OberflÃ¤chen** unter `app/public/`
- âœ… **Go-Launcher-Quellen** unter `build-src/`

### Bekannte EinschrÃ¤nkungen
- Dieser Workspace ist aktuell kein Git-Checkout.
- Die frÃ¼here Electron-Main-Process-Struktur ist in diesem Snapshot nicht vorhanden.
- Die Jest-Gesamtsuite hat bekannte Restfehler; fokussierte Tests sind bei Ã„nderungen Pflicht.
- `docs_archive/` ist historische Referenz und darf nicht als aktuelle Anleitung gelesen werden.

Siehe **[Home](Home.md)** fÃ¼r vollstÃ¤ndige Ãœbersicht.

---

## ðŸ“ Dokumentations-Status

| Bereich | Status | VollstÃ¤ndigkeit |
|---------|--------|-----------------|
| Getting Started | âœ… | 100% |
| Installation | âœ… | 100% |
| Snapshot Status | âœ… | Aktuell |
| Plugin-Liste | âœ… | Inventar 36/36, Detailtexte teils historisch |
| Feature-Docs | âœ… | 100% |
| Overlays | âœ… | 100% |
| Advanced | âœ… | 100% |
| API-Reference | âœ… | 100% |
| Developer Guide | âœ… | 100% |
| Troubleshooting | âœ… | 100% |

**Letzte groÃŸe Aktualisierung:** 2026-04-28  
**Version:** 1.3.3

---

## ðŸŽ¯ HÃ¤ufige Aufgaben - Schnellzugriff

### Setup
- **[Schnellstart](Getting-Started.md#schnellstart-5-minuten)** - Tool starten
- **[TikTok verbinden](Getting-Started.md#tiktok-verbinden)** - TikTok LIVE verbinden
- **[OBS Browser Source Setup](Overlays-&-Alerts.md#obs-browser-source-setup)** - OBS einrichten

### Konfiguration
- **[TTS v2.0](Plugin-Liste.md#tts-v20)** - TTS-Stimmen konfigurieren
- **[Live Goals](Plugin-Liste.md#live-goals)** - Goals erstellen
- **[Umgebungsvariablen](Konfiguration.md#umgebungsvariablen)** - Env-Variablen setzen

### Troubleshooting
- **[Plugin lÃ¤dt nicht](FAQ-&-Troubleshooting.md#plugin-lÃ¤dt-nicht)** - Plugin-Probleme
- **[Overlay lÃ¤dt nicht](Overlays-&-Alerts.md#overlay-lÃ¤dt-nicht)** - Overlay-Probleme
- **[TikTok Verbindung](FAQ-&-Troubleshooting.md#tiktok-verbindung-fehlgeschlagen)** - Connection-Issues

### Development
- **[Beispiel Plugin erstellen](Plugin-Dokumentation.md#beispiel-plugin-erstellen)** - Plugin erstellen
- **[REST API Endpoints](API-Reference.md#rest-api-endpoints)** - API nutzen
- **[Code Style & Standards](Entwickler-Leitfaden.md#code-style--standards)** - Coding-Standards

---

## ðŸ“– Wiki durchsuchen

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

## ðŸ—ºï¸ Wiki-Struktur

```
app/wiki/
â”œâ”€â”€ Home.md                          # Startseite
â”œâ”€â”€ Wiki-Index.md                    # Diese Seite
â”œâ”€â”€ Snapshot-Status.md               # Aktueller Snapshot-Stand
â”‚
â”œâ”€â”€ ðŸ“ Erste Schritte
â”‚   â”œâ”€â”€ Getting-Started.md           # Schnelleinstieg
â”‚   â”œâ”€â”€ Installation-&-Setup.md      # Installation
â”‚   â”œâ”€â”€ Konfiguration.md             # Konfiguration
â”‚   â””â”€â”€ FAQ-&-Troubleshooting.md     # Troubleshooting
â”‚
â”œâ”€â”€ ðŸ“ Plugins
â”‚   â”œâ”€â”€ Plugin-Dokumentation.md      # Plugin-System
â”‚   â”œâ”€â”€ Plugin-Liste.md              # Plugin-Inventar
â”‚   â””â”€â”€ Plugins/
â”‚       â””â”€â”€ VDO-Ninja.md             # VDO.Ninja-Details
â”‚
â”œâ”€â”€ ðŸ“ Features
â”‚   â”œâ”€â”€ WebGPU-Engine.md             # WebGPU-Rendering
â”‚   â”œâ”€â”€ GCCE.md                      # Chat-Commands
â”‚   â”œâ”€â”€ Emoji-Rain.md                # Emoji-Effekte
â”‚   â””â”€â”€ Cloud-Sync.md                # Cloud-Sync
â”‚
â”œâ”€â”€ ðŸ“ Overlays & Streaming
â”‚   â”œâ”€â”€ Overlays-&-Alerts.md         # 25+ Overlays
â”‚   â””â”€â”€ modules/
â”‚       â”œâ”€â”€ alerts.md                # Alert-System
â”‚       â””â”€â”€ flows.md                 # Automation-Flows
â”‚
â”œâ”€â”€ ðŸ“ Advanced
â”‚   â””â”€â”€ Advanced-Features.md         # Advanced Topics
â”‚
â””â”€â”€ ðŸ“ Entwickler
    â”œâ”€â”€ Entwickler-Leitfaden.md      # Coding-Guide
    â”œâ”€â”€ Architektur.md               # System-Architektur
    â””â”€â”€ API-Reference.md             # API-Dokumentation
```

---

## âœ… Wartungs-Checkliste

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
- [x] Snapshot-Status ergÃ¤nzt
- [ ] Einzelne historische Detailformulierungen weiter seitenweise prÃ¼fen
- [x] Branding auf "Little TikTool Helper"

---

**ZurÃ¼ck zur Startseite:** **[Home](Home.md)**

---

*Letzte Aktualisierung: 2026-04-28*  
*Version: 1.3.3*  
*Wiki-Seiten: 20+*  
*Status: funktionsfÃ¤hig, mit bekannten historischen Detailtexten*
