# Pup Cids Little TikTok Helper - Wiki

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![Version](https://img.shields.io/badge/version-1.0.3-blue)](https://github.com/yourusername/pupcidslittletiktokhelper)
[![Status](https://img.shields.io/badge/status-active-success)](https://github.com/yourusername/pupcidslittletiktokhelper)

---

## 📑 Navigation

### Erste Schritte
- **[[Installation & Setup]]** - Systemanforderungen, Installation und erste Schritte
- **[[Konfiguration]]** - Einstellungen, Config-Dateien und Umgebungsvariablen
- **[[FAQ & Troubleshooting]]** - Häufige Probleme, Lösungen und Debug-Tipps

### Entwickler-Ressourcen
- **[[Architektur]]** - Technische Architektur, Module und Datenflüsse
- **[[Entwickler-Leitfaden]]** - Coding-Standards, Workflow und Contribution-Richtlinien
- **[[API-Reference]]** - REST-API-Endpunkte und WebSocket-Events

### Plugins & Features
- **[[Plugin-Dokumentation]]** - Plugin-System, verfügbare Plugins und eigene Plugins erstellen
- **[[Plugins/VDO-Ninja]]** - Multi-Guest-Streaming mit VDO.Ninja
- **[[Features/Emoji-Rain]]** - Emoji-Regen-Effekt im Overlay
- **[[Features/Cloud-Sync]]** - Automatische Cloud-Synchronisation für User-Configs

---

## 📖 Inhaltsverzeichnis

1. [Über das Projekt](#über-das-projekt)
2. [Hauptfunktionen](#hauptfunktionen)
3. [Screenshots](#screenshots)
4. [Technologie-Stack](#technologie-stack)
5. [Quick Start](#quick-start)
6. [Features im Detail](#features-im-detail)
7. [Community & Support](#community--support)
8. [Contributor-Richtlinien](#contributor-richtlinien)
9. [Lizenz](#lizenz)

---

## 🎯 Über das Projekt

**Pup Cids Little TikTok Helper** ist ein professionelles Open-Source-Tool für TikTok LIVE-Streaming mit umfangreichen Features für Content-Creator. Das Tool bietet eine vollständige Integration von TikTok LIVE-Events in OBS Studio mit Overlays, Alerts, Text-to-Speech, Soundboard und Event-Automatisierung.

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
- 📚 **7 Plugins vorinstalliert** - TTS, Soundboard, Multi-Cam, OSC-Bridge, etc.

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
git clone https://github.com/yourusername/pupcidslittletiktokhelper.git
cd pupcidslittletiktokhelper
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

Weitere Details findest du unter **[[Installation & Setup]]**.

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
- **🐛 Bug-Reports:** [GitHub Issues](https://github.com/yourusername/pupcidslittletiktokhelper/issues)
- **💬 Diskussionen:** [GitHub Discussions](https://github.com/yourusername/pupcidslittletiktokhelper/discussions)
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
git clone https://github.com/dein-username/pupcidslittletiktokhelper.git
cd pupcidslittletiktokhelper
```

### 2. Feature-Branch erstellen

```bash
git checkout -b feature/dein-feature-name
```

### 3. Änderungen vornehmen

- **Code-Style beachten** - Siehe [[Entwickler-Leitfaden]]
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

Mehr Details: **[[Entwickler-Leitfaden]]**

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

Dieses Projekt ist unter der **MIT-Lizenz** lizenziert.

```
MIT License

Copyright (c) 2024 Pup Cids Little TikTok Helper Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Siehe [LICENSE](../LICENSE) für vollständige Details.

---

## 🗺️ Nächste Schritte

Abhängig von deinem Ziel, wähle die passende Seite:

- **Neueinsteiger?** → **[[Installation & Setup]]**
- **Konfiguration ändern?** → **[[Konfiguration]]**
- **Architektur verstehen?** → **[[Architektur]]**
- **Entwickeln?** → **[[Entwickler-Leitfaden]]**
- **Plugin erstellen?** → **[[Plugin-Dokumentation]]**
- **API nutzen?** → **[[API-Reference]]**
- **Probleme?** → **[[FAQ & Troubleshooting]]**

---

**Viel Erfolg mit deinem TikTok LIVE-Stream! 🚀**

---

*Letzte Aktualisierung: 2025-11-11*
*Version: 1.0.2*
