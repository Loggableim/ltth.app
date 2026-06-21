# 🏠 Home / Startseite / Inicio / Accueil

[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc/4.0/)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![Version](https://img.shields.io/badge/version-1.2.1-blue)](https://github.com/Loggableim/ltth_desktop2)
[![Status](https://img.shields.io/badge/status-active-success)](https://github.com/Loggableim/ltth_desktop2)

---

## Language Selection / Sprachauswahl / Selección de idioma / Sélection de la langue

- [🇬🇧 English](#english)
- [🇩🇪 Deutsch](#deutsch)
- [🇪🇸 Español](#español)
- [🇫🇷 Français](#français)

---

## 🇬🇧 English

### 📑 Navigation

**[Wiki Index](Wiki-Index.md#english|Wiki Index)** - Complete wiki overview with all pages

#### Getting Started
- **[Getting Started](Getting-Started.md#english|Getting Started)** - Quick start in 5 minutes
- **[Installation & Setup](Installation-&-Setup.md#english|Installation & Setup)** - System requirements, installation and first steps
- **[Konfiguration](Konfiguration.md#english|Configuration)** - Settings, config files and environment variables
- **[FAQ & Troubleshooting](FAQ-&-Troubleshooting.md#english|FAQ & Troubleshooting)** - Common problems, solutions and debug tips

#### Developer Resources
- **[Architektur](Architektur.md#english|Architecture)** - Technical architecture, modules and data flows
- **[Entwickler-Leitfaden](Entwickler-Leitfaden.md#english|Developer Guide)** - Coding standards, workflow and contribution guidelines
- **[API-Reference](API-Reference.md#english|API Reference)** - REST API endpoints and WebSocket events

#### Plugins & Features
- **[Plugin-Dokumentation](Plugin-Dokumentation.md#english|Plugin Documentation)** - Plugin system, available plugins and creating your own plugins
- **[Plugin-Liste](Plugin-Liste.md#english|Plugin List)** - Complete list of all 31 plugins with status and features
- **[Overlays & Alerts](Overlays-&-Alerts.md#english|Overlays & Alerts)** - 25+ OBS overlays for alerts, goals, leaderboards, effects

### 📖 Table of Contents

1. [About the Project](#about-the-project-english)
2. [Main Features](#main-features-english)
3. [Screenshots](#screenshots-english)
4. [Technology Stack](#technology-stack-english)
5. [Quick Start](#quick-start-english)
6. [Features in Detail](#features-in-detail-english)
7. [Community & Support](#community--support-english)
8. [Contributor Guidelines](#contributor-guidelines-english)
9. [License](#license-english)

---

## 🎯 Über das Projekt

**PupCid's Little TikTool Helper** ist ein professionelles Open-Source-Tool für TikTok-kompatibles LIVE-Streaming mit umfangreichen Features für Content-Creator. Das Tool bietet eine vollständige Integration von TikTok LIVE-Events in OBS Studio mit Overlays, Alerts, Text-to-Speech, Soundboard und Event-Automatisierung.

### ✨ Besonderheiten

- **🔒 100% Lokal** - Keine Cloud-Services, keine Login-Daten erforderlich
- **🎨 Professionelle Overlays** - Full-HD Browser Sources für OBS Studio
- **🔌 Modulares Plugin-System** - Einfach erweiterbar durch Plugins
- **🌍 Multi-Sprachen** - Deutsche und englische Benutzeroberfläche
- **⚡ Echtzeit-Updates** - WebSocket-basierte Live-Kommunikation
- **🎭 Event-Automation** - Wenn-Dann-Regeln ohne Code

### 🎤 Für wen ist das Tool geeignet?

- **TikTok LIVE Streamer** - Professionelle Overlays und Alerts
- **Content Creator** - Event-Automatisierung und Interaktivität
- **VRChat Streamer** - OSC-Integration für Avatar-Steuerung
- **Multi-Guest Streamer** - VDO.Ninja Integration für Interviews
- **Entwickler** - Modulares Plugin-System zum Erweitern

---

## 🚀 Hauptfunktionen

### 1. TikTok LIVE Integration

Echtzeit-Verbindung zu TikTok LIVE-Streams mit allen Events:

- ✅ **Gifts** - Geschenke mit Coins, Combo-Tracking, Gift-Katalog
- ✅ **Chat** - Nachrichten mit Profilbildern und Badges
- ✅ **Follows** - Neue Follower mit Follow-Role-Tracking
- ✅ **Shares** - Stream-Shares mit Nutzerinformationen
- ✅ **Likes** - Like-Events mit Like-Counts
- ✅ **Subscriptions** - Subscriber mit Tier-Levels

### 2. Text-to-Speech (TTS)

Professionelles TTS-System mit 100+ Stimmen:

- 🎙️ **75+ TikTok-Stimmen** - Kostenlos, keine API-Keys erforderlich
- 🎙️ **30+ Google Cloud-Stimmen** - Optional mit API-Key
- 👤 **User-Voice-Mappings** - Nutzer bekommen eigene Stimmen zugewiesen
- 📝 **Auto-TTS für Chat** - Automatisches Vorlesen von Chat-Nachrichten
- 🚫 **Blacklist-Filter** - Wörter/Nutzer ausschließen
- 🎚️ **Volume & Speed** - Lautstärke und Geschwindigkeit anpassen

### 3. Alert-System

Anpassbare Alerts für alle TikTok-Events:

- 🔊 **Sound + Text + Animation** - Vollständig konfigurierbare Alerts
- 🖼️ **Bilder & GIFs** - Custom Alert-Graphics
- ⏱️ **Dauer-Kontrolle** - Alert-Display-Dauer einstellen
- 🎨 **Custom Templates** - Platzhalter wie `{username}`, `{giftName}`, `{coins}`
- 🧪 **Test-Modus** - Alerts vor dem Stream testen

### 4. Soundboard

100.000+ Sounds mit Gift-Mapping:

- 🔍 **MyInstants-Integration** - Zugriff auf riesige Sound-Library
- 🎁 **Gift-zu-Sound-Mapping** - Rose → Sound A, Lion → Sound B
- 🎵 **Event-Sounds** - Sounds für Follow, Subscribe, Share
- ⚡ **Like-Threshold-System** - Sounds ab X Likes triggern
- 📦 **Custom Upload** - Eigene MP3s hochladen
- ⭐ **Favorites & Trending** - Sounds organisieren

### 5. Goals & Progress Bars

4 separate Goals mit Browser-Source-Overlays:

- 📊 **Likes Goal** - Like-Ziel mit Progress-Bar
- 👥 **Followers Goal** - Follower-Ziel mit Tracking
- 💎 **Subscriptions Goal** - Subscriber-Ziel
- 🪙 **Coins Goal** - Coin-Ziel (Donations)
- 🎨 **Custom Styles** - Farben, Gradient, Labels anpassen
- ➕ **Add/Set/Increment** - Flexible Modus-Auswahl

### 6. Event-Automation (Flows)

"Wenn-Dann"-Automatisierungen ohne Code:

- 🔗 **Trigger** - Gift, Chat, Follow, Subscribe, Share, Like
- ⚙️ **Conditions** - Bedingungen mit Operatoren (==, !=, >=, <=, contains)
- ⚡ **Actions** - TTS, Alert, OBS-Szene, OSC, HTTP-Request, Delay
- 🧩 **Multi-Step** - Mehrere Actions hintereinander
- ✅ **Test-Modus** - Flows vor dem Stream testen

**Beispiel-Flow:**
```
Trigger: Gift == "Rose"
Actions:
  1. TTS: "Danke {username} für die Rose!"
  2. OBS-Szene wechseln zu "Cam2"
  3. OSC: Wave-Geste in VRChat
```

### 7. OBS-Integration

Professionelle OBS Studio-Integration:

- 🖥️ **Browser Source Overlay** - Transparentes Full-HD-Overlay
- 🔌 **OBS WebSocket v5** - Szenen, Sources, Filter steuern
- 📹 **Multi-Cam Switcher** - Automatischer Kamerawechsel via Gifts/Chat
- 🎥 **Scene & Source Control** - Szenen wechseln, Sources ein/ausblenden

### 8. Plugin-System

Modulares Erweiterungssystem:

- 🔌 **Hot-Loading** - Plugins ohne Server-Neustart laden
- 📦 **ZIP-Upload** - Plugins via Web-UI hochladen
- 🛠️ **Plugin-API** - Express-Routes, Socket.io, TikTok-Events
- 🎨 **Admin-UI** - Plugins mit eigenem Web-Interface
- 📚 **31 Plugins integriert** - TTS v2.0, WebGPU Emoji Rain, Fireworks, GCCE, Viewer XP, etc.
- 🎮 **WebGPU-Engine** - GPU-beschleunigtes Rendering für Partikel-Effekte
- 🌐 **GCCE** - Global Chat Command Engine für alle Plugins

### 9. Multi-Profile-System

Mehrere Datenbanken für verschiedene Setups:

- 👤 **Profile erstellen** - Mehrere Streaming-Setups verwalten
- 🔄 **Schneller Wechsel** - Profile on-the-fly wechseln
- 💾 **Backup & Restore** - Profile sichern und wiederherstellen
- 📁 **Isolierte Daten** - Jedes Profil hat eigene Datenbank

### 10. Leaderboard & Statistiken

Tracking und Anzeige von Top-Giftern:

- 🏆 **Top Gifters** - Sortiert nach Total Coins
- 🔥 **Longest Streaks** - Gift-Combo-Streaks
- 💰 **Recent Donors** - Letzte Spender
- 📊 **Browser Source** - Leaderboard-Overlay für OBS

---

## 📸 Screenshots

### Dashboard
![Dashboard](https://via.placeholder.com/800x450.png?text=Dashboard+Screenshot)

Das Haupt-Dashboard bietet Übersicht über:
- Verbindungsstatus
- Live-Stream-Statistiken
- Event-Log
- Quick-Actions

### OBS-Overlay
![OBS Overlay](https://via.placeholder.com/800x450.png?text=OBS+Overlay+Screenshot)

Transparentes Overlay mit:
- Alerts (Gifts, Follows, etc.)
- Goal Progress Bars
- Leaderboard
- HUD-Elemente

### Plugin-Manager
![Plugin Manager](https://via.placeholder.com/800x450.png?text=Plugin+Manager+Screenshot)

Plugin-Verwaltung:
- Installierte Plugins
- Enable/Disable
- Upload neuer Plugins
- Plugin-Konfiguration

---

## 💻 Technologie-Stack

| Kategorie | Technologie | Version |
|-----------|-------------|---------|
| **Backend** | Node.js | >=18.0.0 <24.0.0 |
| **Web-Framework** | Express | ^4.18.2 |
| **Real-time** | Socket.io | ^4.6.1 |
| **Datenbank** | SQLite (better-sqlite3) | ^11.9.0 |
| **TikTok-API** | tiktok-live-connector | ^2.1.0 |
| **OBS-Integration** | obs-websocket-js | ^5.0.6 |
| **OSC-Protocol** | osc | ^2.4.5 |
| **Logging** | winston | ^3.18.3 |
| **Frontend** | Bootstrap 5 | 5.3 |
| **Icons** | Font Awesome | 6.x |

---

## ⚡ Quick Start

### 1. Voraussetzungen prüfen

```bash
# Node.js Version prüfen (sollte 18-23 sein)
node --version

# npm Version prüfen
npm --version
```

### 2. Repository klonen

```bash
git clone https://github.com/Loggableim/ltth_desktop2.git
cd ltth_desktop2
```

### 3. Dependencies installieren

```bash
npm install
```

### 4. Server starten

**Windows:**
```bash
start.bat
```

**Linux/macOS:**
```bash
./start.sh
```

**Oder manuell:**
```bash
node launch.js
```

### 5. Dashboard öffnen

Der Browser öffnet sich automatisch auf:
```
http://localhost:3000
```

### 6. TikTok LIVE verbinden

1. Gehe zu Dashboard → "Connect to TikTok LIVE"
2. Gib deinen TikTok-Username ein
3. Klicke "Connect"
4. Warte auf grünen Status "Connected"

**Fertig!** 🎉 Alle Events werden jetzt live angezeigt.

Weitere Details findest du unter **[Installation & Setup](Installation & Setup.md)**.

---

## 🎨 Features im Detail

### HUD-Konfigurator

Anpassbares HUD-Overlay mit Drag & Drop:

- 📍 **Positionierung** - Elemente frei verschieben
- 🎨 **Styling** - Farben, Schriftarten, Transparenz
- 👁️ **Sichtbarkeit** - Elemente ein/ausblenden
- 📱 **Responsive** - Automatische Anpassung an Auflösung

### VRChat OSC-Integration

VRChat-Avatar-Steuerung via OSC-Protokoll:

- 👋 **Wave-Geste** - Avatar winkt bei Gifts
- 🎉 **Celebrate-Animation** - Feier-Animation bei großen Gifts
- 💃 **Dance-Trigger** - Dance-Animation triggern
- ❤️ **Hearts-Effekt** - Hearts spawnen
- 🎊 **Confetti-Effekt** - Confetti spawnen
- 🎭 **Custom Parameter** - Beliebige OSC-Parameter senden

### VDO.Ninja Multi-Guest

Multi-Guest-Streaming für Interviews:

- 🌐 **Room-Management** - Räume erstellen und verwalten
- 👥 **Guest-Verwaltung** - Gäste hinzufügen/entfernen
- 📺 **Layout-Kontrolle** - Grid, Spotlight, Custom-Layouts
- 🔗 **Direkt-Links** - Guest-Links generieren
- 🎙️ **Audio-Routing** - Individuelle Audio-Kontrolle

### Update-System

Automatisches Update-Management:

- 🔍 **Update-Check** - Automatischer Check auf neue Versionen
- 📥 **Ein-Klick-Update** - Updates direkt aus dem Dashboard
- 🔄 **Git & ZIP** - Git-Pull oder ZIP-Download
- 📜 **CHANGELOG** - Anzeige der Änderungen
- 🛡️ **Backup** - Automatisches Backup vor Update

---

## 🌐 Community & Support

### Hilfe bekommen

- **📧 E-Mail:** [loggableim@gmail.com](mailto:loggableim@gmail.com)
- **🐛 Bug-Reports:** [GitHub Issues](https://github.com/Loggableim/ltth_desktop2/issues)
- **💬 Diskussionen:** [GitHub Discussions](https://github.com/Loggableim/ltth_desktop2/discussions)
- **📖 Dokumentation:** Dieses Wiki

### Feature-Requests

Feature-Requests sind willkommen! Bitte öffne ein GitHub Issue mit:

1. **Beschreibung** - Was soll das Feature tun?
2. **Use-Case** - Wofür brauchst du es?
3. **Mockups/Skizzen** - Falls vorhanden

### Bug-Reports

Wenn du einen Bug findest, öffne bitte ein Issue mit:

1. **Beschreibung** - Was ist das Problem?
2. **Steps to Reproduce** - Wie kann man den Bug reproduzieren?
3. **Expected vs. Actual** - Was erwartest du vs. was passiert?
4. **Logs** - Console-Output oder Log-Dateien
5. **Environment** - Node.js-Version, Betriebssystem, Browser

---

## 👥 Contributor-Richtlinien

Wir freuen uns über Contributions! So kannst du beitragen:

### 1. Fork & Clone

```bash
# Repository forken auf GitHub
# Dann klonen:
git clone https://github.com/Loggableim/ltth_desktop2.git
cd ltth_desktop2
```

### 2. Feature-Branch erstellen

```bash
git checkout -b feature/dein-feature-name
```

### 3. Änderungen vornehmen

- **Code-Style beachten** - Siehe [Entwickler-Leitfaden](Entwickler-Leitfaden.md)
- **Tests durchführen** - Manuelle Tests vor Commit
- **Dokumentation aktualisieren** - README, Wiki, CHANGELOG

### 4. Committen

```bash
git add .
git commit -m "Add: Beschreibung deiner Änderung"
```

**Commit-Message-Format:**
```
<Type>: <Kurzbeschreibung>

<Optionale ausführliche Beschreibung>

<Optionale Footer (Breaking Changes, Issues)>
```

**Types:** `Add`, `Update`, `Fix`, `Refactor`, `Docs`, `Test`, `Chore`

### 5. Push & Pull Request

```bash
git push origin feature/dein-feature-name
```

Dann auf GitHub einen Pull Request öffnen.

### Richtlinien

✅ **Do:**
- Code dokumentieren
- Bestehende Patterns verwenden
- Error-Handling implementieren
- Logger verwenden statt `console.log`
- Config-Validierung mit Defaults

❌ **Don't:**
- Bestehende Features entfernen (nur erweitern)
- Breaking Changes ohne Diskussion
- Hardcoded Secrets committen
- Unnötige Dependencies hinzufügen

Mehr Details: **[Entwickler-Leitfaden](Entwickler-Leitfaden.md)**

---

## 📋 Wiki-Synchronisierung

**Wichtig:** Dieses Wiki wird mit jedem Release-Tag synchronisiert. Bei Änderungen am Code sollte auch das Wiki aktualisiert werden.

**Workflow:**
1. Code-Änderungen in Feature-Branch
2. Wiki-Änderungen in `wiki/`-Verzeichnis
3. Commit beider Änderungen zusammen
4. Pull Request mit Code + Wiki-Updates

**Versionshistorie:** Siehe [CHANGELOG.md](../CHANGELOG.md) im Hauptrepository.

---

## 📄 Lizenz

Dieses Projekt ist unter der **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)** Lizenz lizenziert.

```
Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)

Copyright (c) 2025 Pup Cid / Loggableim

You are free to:
- Share — copy and redistribute the material in any medium or format
- Adapt — remix, transform, and build upon the material

Under the following terms:
- Attribution — You must give appropriate credit
- NonCommercial — You may not use the material for commercial purposes

Full license: https://creativecommons.org/licenses/by-nc/4.0/
```

Siehe [LICENSE](../LICENSE) für vollständige Details.

---

## 🗺️ Nächste Schritte

Abhängig von deinem Ziel, wähle die passende Seite:

- **Neueinsteiger?** → **[Installation & Setup](Installation & Setup.md)**
- **Konfiguration ändern?** → **[Konfiguration](Konfiguration.md)**
- **Architektur verstehen?** → **[Architektur](Architektur.md)**
- **Entwickeln?** → **[Entwickler-Leitfaden](Entwickler-Leitfaden.md)**
- **Plugin erstellen?** → **[Plugin-Dokumentation](Plugin-Dokumentation.md)**
- **API nutzen?** → **[API-Reference](API-Reference.md)**
- **Probleme?** → **[FAQ & Troubleshooting](FAQ & Troubleshooting.md)**

---

**Viel Erfolg mit deinem TikTok LIVE-Stream! 🚀**

---

*Letzte Aktualisierung: 2025-12-11*
*Version: 1.2.1*
