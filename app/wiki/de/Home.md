# 🇩🇪 Deutsch

Willkommen bei **PupCid's Little TikTool Helper**!

Dies ist ein kostenloses Open-Source-Tool für professionelles TikTok LIVE-Streaming mit umfangreichen Features für Content-Creator.

### Schnellzugriff
- [Erste Schritte](./Getting-Started.md#deutsch)
- [Installation](./Installation-&-Setup.md#deutsch)
- [Plugin-Liste](./Plugin-Liste.md#deutsch)
- [FAQ](./FAQ-&-Troubleshooting.md#deutsch)

### 🎯 Über das Projekt

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

### 🚀 Hauptfunktionen

#### 1. TikTok LIVE Integration

Echtzeit-Verbindung zu TikTok LIVE-Streams mit allen Events:

- ✅ **Gifts** - Geschenke mit Coins, Combo-Tracking, Gift-Katalog
- ✅ **Chat** - Nachrichten mit Profilbildern und Badges
- ✅ **Follows** - Neue Follower mit Follow-Role-Tracking
- ✅ **Shares** - Stream-Shares mit Nutzerinformationen
- ✅ **Likes** - Like-Events mit Like-Counts
- ✅ **Subscriptions** - Subscriber mit Tier-Levels

#### 2. Text-to-Speech (TTS)

Professionelles TTS-System mit 100+ Stimmen:

- 🎙️ **75+ TikTok-Stimmen** - Kostenlos, keine API-Keys erforderlich
- 🎙️ **30+ Google Cloud-Stimmen** - Optional mit API-Key
- 👤 **User-Voice-Mappings** - Nutzer bekommen eigene Stimmen zugewiesen
- 📝 **Auto-TTS für Chat** - Automatisches Vorlesen von Chat-Nachrichten
- 🚫 **Blacklist-Filter** - Wörter/Nutzer ausschließen
- 🎚️ **Volume & Speed** - Lautstärke und Geschwindigkeit anpassen

#### 3. Alert-System

Anpassbare Alerts für alle TikTok-Events:

- 🔊 **Sound + Text + Animation** - Vollständig konfigurierbare Alerts
- 🖼️ **Bilder & GIFs** - Custom Alert-Graphics
- ⏱️ **Dauer-Kontrolle** - Alert-Display-Dauer einstellen
- 🎨 **Custom Templates** - Platzhalter wie `{username}`, `{giftName}`, `{coins}`
- 🧪 **Test-Modus** - Alerts vor dem Stream testen

#### 4. Soundboard

100.000+ Sounds mit Gift-Mapping:

- 🔍 **MyInstants-Integration** - Zugriff auf riesige Sound-Library
- 🎁 **Gift-zu-Sound-Mapping** - Rose → Sound A, Lion → Sound B
- 🎵 **Event-Sounds** - Sounds für Follow, Subscribe, Share
- ⚡ **Like-Threshold-System** - Sounds ab X Likes triggern
- 📦 **Custom Upload** - Eigene MP3s hochladen
- ⭐ **Favorites & Trending** - Sounds organisieren

#### 5. Goals & Progress Bars

4 separate Goals mit Browser-Source-Overlays:

- 📊 **Likes Goal** - Like-Ziel mit Progress-Bar
- 👥 **Followers Goal** - Follower-Ziel mit Tracking
- 💎 **Subscriptions Goal** - Subscriber-Ziel
- 🪙 **Coins Goal** - Coin-Ziel (Donations)
- 🎨 **Custom Styles** - Farben, Gradient, Labels anpassen
- ➕ **Add/Set/Increment** - Flexible Modus-Auswahl

#### 6. Event-Automation (Flows)

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

### 💻 Technologie-Stack

| Kategorie | Technologie | Version |
|-----------|-------------|---------|
| **Backend** | Node.js | >=18.0.0 <25.0.0 |
| **Web-Framework** | Express | ^4.18.2 |
| **Real-time** | Socket.io | ^4.6.1 |
| **Datenbank** | SQLite (better-sqlite3) | ^11.9.0 |
| **TikTok-API** | EulerStream SDK | App-Adapter |
| **OBS-Integration** | obs-websocket-js | ^5.0.6 |
| **OSC-Protocol** | osc | ^2.4.5 |
| **Logging** | winston | ^3.18.3 |
| **Frontend** | Bootstrap 5 | 5.3 |
| **Icons** | Font Awesome | 6.x |

### ⚡ Quick Start

1. Node.js 18-23 installieren
2. Repository klonen: `git clone https://github.com/Loggableim/ltth.app.git`
3. In den Runtime-Ordner wechseln: `cd app`
4. Dependencies installieren: `npm install`
5. Server starten: `npm start`
6. Dashboard öffnen: `http://localhost:3000/dashboard.html`
6. Mit TikTok LIVE verbinden (Username eingeben)

**Fertig!** 🎉 Alle Events werden jetzt live angezeigt.

### 📄 Lizenz

Dieses Projekt ist unter der **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)** Lizenz lizenziert.

---

*Letzte Aktualisierung: 2026-07-22*
*Version: 1.4.0*

---
