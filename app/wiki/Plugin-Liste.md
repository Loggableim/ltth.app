# Plugin-Liste - Little TikTool Helper v1.2.1

[← Plugin-Dokumentation](Plugin-Dokumentation) | [→ Entwickler-Leitfaden](Entwickler-Leitfaden)

---

## 📑 Inhaltsverzeichnis

1. [Übersicht](#übersicht)
2. [Plugin-Status Erklärung](#plugin-status-erklärung)
3. [🔴 Early Beta Plugins](#-early-beta-plugins)
4. [🟡 Beta Plugins](#-beta-plugins)
5. [🟢 Alpha Plugins](#-alpha-plugins)
6. [🔵 Final/Stable Plugins](#-finalstable-plugins)
7. [Plugin-Installation](#plugin-installation)
8. [Plugin-Konfiguration](#plugin-konfiguration)

---

## 🔍 Übersicht

Little TikTool Helper (LTTH) v1.2.1 enthält **31 integrierte Plugins**, die das Tool um vielfältige Funktionen erweitern. Alle Plugins sind modular aufgebaut und können einzeln aktiviert oder deaktiviert werden.

### Statistik

| Status | Anzahl | Beschreibung |
|--------|--------|--------------|
| 🔴 Early Beta | 6 | Experimentelle Features, aktive Entwicklung |
| 🟡 Beta | 10 | Feature-komplett, in Testphase |
| 🟢 Alpha | 8 | Stabile Features, finale Tests |
| 🔵 Final | 7 | Produktionsreif, vollständig getestet |
| **Gesamt** | **31** | **Alle Plugins** |

---

## 📊 Plugin-Status Erklärung

### 🔴 Early Beta
**Entwicklungsphase:** Aktive Feature-Entwicklung
**Stabilität:** Experimentell, kann Bugs enthalten
**Empfehlung:** Nur für Test-Streams verwenden
**Updates:** Häufige Änderungen möglich

### 🟡 Beta
**Entwicklungsphase:** Feature-komplett, in Testing
**Stabilität:** Weitgehend stabil, kleinere Bugs möglich
**Empfehlung:** Kann in Produktions-Streams verwendet werden
**Updates:** Gelegentliche Bug-Fixes

### 🟢 Alpha
**Entwicklungsphase:** Finale Testphase
**Stabilität:** Stabil, nur kleine Optimierungen ausstehend
**Empfehlung:** Produktionsreif
**Updates:** Selten, meist nur Optimierungen

### 🔵 Final/Stable
**Entwicklungsphase:** Abgeschlossen
**Stabilität:** Vollständig stabil und getestet
**Empfehlung:** Produktionsreif, empfohlen
**Updates:** Nur bei größeren Feature-Anfragen oder kritischen Fixes

---

## 🔴 Early Beta Plugins

### 1. Advanced Timer
**Status:** 🔴 Early Beta
**Version:** 1.0.0
**Autor:** Pup Cid

**Beschreibung:**
Professionelles Multi-Timer-System mit Event-Triggern, Automatisierung, Zuschauer-Interaktion und anpassbaren Overlays. Perfekt für Subathons, Challenges, Stream-Zeitpläne und Ziele.

**Features:**
- ⏱️ Mehrere unabhängige Timer (Countdown/Count-Up)
- 🎁 Event-Trigger (Gift, Follow, Subscribe, etc.)
- 🎨 Anpassbare Overlays für OBS
- 👥 Zuschauer-Interaktion über Chat-Commands
- ⚡ Flow-System-Integration
- 📊 Timer-Historie und Statistiken
- 🔊 Audio-Alerts bei Timer-Events
- 💾 Persistente Timer-Speicherung

**Endpoints:**
- `GET /api/advanced-timer/timers` - Alle Timer abrufen
- `POST /api/advanced-timer/create` - Timer erstellen
- `POST /api/advanced-timer/start/:id` - Timer starten
- `POST /api/advanced-timer/pause/:id` - Timer pausieren
- `DELETE /api/advanced-timer/delete/:id` - Timer löschen

**Overlay-URL:**
```
http://localhost:3000/advanced-timer/overlay
```

**Konfiguration:** Admin UI verfügbar unter Plugins → Advanced Timer

**Bekannte Einschränkungen:**
- ⚠️ Early Beta: Gelegentliche Timer-Desync möglich
- ⚠️ Overlay-Styling noch in Entwicklung

---

### 2. Chatango Integration
**Status:** 🔴 Early Beta
**Version:** 1.0.0
**Autor:** Pup Cid

**Beschreibung:**
Integriert Chatango-Chaträume in deinen Stream. Konfiguriere einbettbare Chat-Widgets, passe das Erscheinungsbild an und empfange Chat-Nachrichten als Events für Flows und Automatisierungen.

**Features:**
- 💬 Chatango-Chatroom-Integration
- 🎨 Anpassbares Widget-Design
- 📡 Echtzeit-Chat-Nachrichten als Events
- 🔗 Flow-System-Kompatibilität
- 👥 Moderations-Tools
- 🌐 Multi-Chatroom-Support

**Endpoints:**
- `GET /api/chatango/status` - Verbindungsstatus
- `POST /api/chatango/connect` - Chatroom verbinden
- `POST /api/chatango/disconnect` - Verbindung trennen

**Events:**
- `chatango:message` - Neue Chat-Nachricht
- `chatango:user-join` - Benutzer betritt Chatroom
- `chatango:user-leave` - Benutzer verlässt Chatroom

**Konfiguration:** Admin UI verfügbar

**Bekannte Einschränkungen:**
- ⚠️ Early Beta: Reconnection-Logic noch nicht optimiert
- ⚠️ Einige Chatango-Features noch nicht unterstützt

---

### 3. GCCE HUD Overlay
**Status:** 🔴 Early Beta
**Version:** 1.0.0
**Autor:** Pup Cid

**Beschreibung:**
Anpassbares HUD-Overlay-System mit Text- und Bildanzeige über Chat-Commands. Integriert mit der Global Chat Command Engine.

**Features:**
- 📺 Dynamische HUD-Elemente
- 🎨 Text- und Bild-Overlays
- 💬 Chat-Command-gesteuert (via GCCE)
- ⏱️ Zeitbasierte Auto-Hide-Funktion
- 🎭 Animations-Effekte
- 📍 Positionierung konfigurierbar
- 🌈 CSS-Styling-Optionen

**Commands:**
- `!hud show <text>` - Text im HUD anzeigen
- `!hud image <url>` - Bild im HUD anzeigen
- `!hud hide` - HUD ausblenden
- `!hud clear` - HUD leeren

**Overlay-URL:**
```
http://localhost:3000/gcce-hud/overlay
```

**Integration:** Benötigt GCCE-Plugin (Global Chat Command Engine)

**Bekannte Einschränkungen:**
- ⚠️ Early Beta: Performance-Optimierungen ausstehend
- ⚠️ Begrenzter Bildformat-Support

---

### 4. Stream Monsters
**Status:** 🟢 Stable
**Version:** 1.12.0
**Autor:** Pup Cid

**Beschreibung:**
Vom Creator aktivierte TikTok-Geschenke und optionale wiederkehrende Gratis-Eier speisen dieselbe faire Brut-Warteschlange. Zuschauer sammeln die 24 Season-1-Stream-Monster mit 72 gebündelten Evolutionsformen, entwickeln sie mit festen Elementwerten und neuen Skills weiter und kämpfen mit verdeckten A-, B- oder C-Entscheidungen.

**Features:**
- 🎁 Geschenk-Eier und optionale Gratis-Eier teilen drei Inkubatoren, FIFO-Warteschlange und 24-Stunden-Ablauf
- 🥚 Optionales Gratis-Ei: 60 Sekunden reserviert, danach öffentlich per `!adopt`; Cooldown 60–31.536.000 Sekunden, Standard 24 Stunden
- 🐾 24 Season-1-Stream-Monster mit Evolution I, II und III – insgesamt 72 gebündelte Formen
- ⏱️ Neue Setups: 90 Sekunden Brutzeit; gespeicherte Creator-Zeiten und vorhandene Eier bleiben unverändert
- 🌍 Deutsch und Englisch standardmäßig aktiv; ein oder zwei Overlaysprachen aus DE/EN/ES/FR
- ⚔️ Verdeckte K.-o.-Duelle: 8 Sekunden Monsterwahl, Arcade-Skillwahl 6 Sekunden bei einer bzw. 8 Sekunden bei zwei Sprachen, Statwahl 10 bzw. 12 Sekunden und vollständiges Replay
- ⚡ Standardaktionen 1,6 Sekunden, Specials 2,4 Sekunden und K.-o.-Reveals 2,8 Sekunden; Arena Collapse wird in Runde 3 angekündigt und beginnt in Runde 4
- ⚖️ Sechs Elementfamilien sowie Striker, Guardian, Trickster und Sustain mit simulatorisch geprüften Vor- und Nachteilen
- 🏆 Getrennte Collector-Score- und Arena-Rating-Ranglisten
- 📋 Gift-/siegunabhängige Daily-/Weekly-Quests; nur 10 Tagesduelle ändern Rating, jedes legitime Duell gibt Monster-XP
- 📱 Portrait-Arena mit 74 Prozent Gameplay und 26 Prozent Chat-Safe-Zone plus Landscape-Layout
- ✨ WebGPU-Effekte mit Canvas2D-Fallback und kuratiertem CC0-Audio
- 🔒 Kein Art Lab, keine KI-Bildgenerierung und kein Modell-Installer im Plugin

**Endpoints:**
- `GET /api/stream-monsters/state` - Öffentlicher aggregierter Zustand
- `GET /api/stream-monsters/battle-state` - Öffentlicher Arena-Zustand
- `GET /api/stream-monsters/battles/:battleId/replay` - Datenschutzreduziertes Replay
- `GET /api/stream-monsters/monster-catalog` - Gebündelter Monsterkatalog
- `GET /api/stream-monsters/leaderboard?type=collector|arena` - Getrennte Ranglisten

**Overlay-URL:**
```
http://localhost:3000/stream-monsters/overlay
```

**Integration:** Wenn GCCE verfügbar ist, ist es der einzige Kommando-Eingang. Prefix und Aliase sind editierbar und konfliktgeprüft; Overlay-Hinweise verwenden die aktive Konfiguration und senden keine Chatnachrichten.

**Faire Grenzen und Kompatibilität:**
- Bezahlte Gifts verbessern niemals Kampfwerte, XP-Multiplikatoren, Seltenheit oder Gewinnwahrscheinlichkeit.
- Bestehende Spielerdaten und historische Replays bleiben beim Upgrade erhalten.

---

### 5. WebGPU Emoji Rain
**Status:** 🔴 Early Beta
**Version:** 2.0.0
**Autor:** Pup Cid

**Beschreibung:**
GPU-beschleunigter Emoji-Partikel-Effekt mit WebGPU instanziertem Rendering. 1:1 funktionaler Port des originalen Emoji Rain Plugins mit deutlich besserer Performance.

**Features:**
- 🚀 WebGPU-beschleunigtes Rendering
- 🎨 Custom Emoji-Sets (konfigurierbar)
- 👤 Benutzer-spezifische Emoji-Mappings
- 🖼️ Custom Image-Upload (PNG/JPG/GIF/WebP/SVG)
- 🎁 TikTok-Event-Integration (Gift, Like, Follow, Share, Subscribe)
- ⭐ SuperFan-Burst-Effekte
- 🔗 Flow-System-Kompatibilität
- 📺 OBS-HUD-Overlay (1920x1080 Fixed)
- 💾 Persistent Storage (Update-sicher)
- 🌍 Lokalisierung (DE/EN)

**Endpoints:**
- `GET /api/webgpu-emoji-rain/status` - Status und Config
- `POST /api/webgpu-emoji-rain/config` - Config speichern
- `POST /api/webgpu-emoji-rain/toggle` - Plugin aktivieren/deaktivieren
- `POST /api/webgpu-emoji-rain/trigger` - Manueller Emoji-Burst

**Overlay-URLs:**
```
Standard (Responsiv): http://localhost:3000/webgpu-emoji-rain/overlay
OBS HUD (1920x1080): http://localhost:3000/webgpu-emoji-rain/obs-hud
```

**Performance:**
- 🎯 60 FPS konstant
- 🚀 10x schneller als Canvas-Version
- 💾 Niedriger Memory-Footprint
- 🔋 GPU-Offloading entlastet CPU

**Bekannte Einschränkungen:**
- ⚠️ Early Beta: WebGPU-Browser-Support erforderlich (Chrome 113+, Edge 113+)
- ⚠️ Safari/Firefox: Noch kein WebGPU-Support
- ⚠️ Fallback auf Canvas-Version bei fehlendem WebGPU

---

## 🟡 Beta Plugins

### 7. Minecraft Connect
**Status:** 🟡 Beta
**Version:** 1.0.0
**Autor:** Pup Cid

**Beschreibung:**
Bidirektionale Echtzeit-Integration zwischen TikTok Live Events und Minecraft (Java Edition). Verbindet Stream-Events mit In-Game-Actions.

**Features:**
- 🎮 WebSocket-Bridge zu Minecraft
- 🎁 Gift-Events → Minecraft-Aktionen
- 💬 Chat-Nachrichten synchronisiert
- 🔔 Follow/Subscribe → Spawn Items/Effekte
- ⚡ Echtzeit-Kommunikation
- 📊 Event-Mapping konfigurierbar

**Endpoints:**
- `GET /api/minecraft-connect/status` - Verbindungsstatus
- `POST /api/minecraft-connect/send` - Command zu Minecraft senden

**Setup:**
Benötigt Minecraft Mod/Plugin (WebSocket-Server) - Siehe separate Dokumentation

**Bekannte Einschränkungen:**
- ⚠️ Benötigt Minecraft Java Edition
- ⚠️ Mod/Plugin-Installation erforderlich

---

### 8. Thermal Printer
**Status:** 🟡 Beta
**Version:** 1.0.0
**Autor:** Pup Cid

**Beschreibung:**
Druckt TikTok Live Events (Chat, Gifts, Follows) physisch auf einem Thermodrucker (ESC/POS).

**Features:**
- 🖨️ ESC/POS-Thermodrucker-Support
- 🎁 Gift-Receipts (Name, Coins, Zeit)
- 💬 Chat-Druck mit Username
- 👥 Follow-Notifications
- 🎨 Customizable Templates
- 📄 QR-Code-Generierung (optional)

**Endpoints:**
- `GET /api/thermal-printer/status` - Drucker-Status
- `POST /api/thermal-printer/test` - Test-Druck
- `POST /api/thermal-printer/print` - Manueller Druck

**Setup:**
1. ESC/POS-Thermodrucker anschließen (USB/Serial)
2. Port in Config eintragen
3. Test-Druck durchführen

**Bekannte Einschränkungen:**
- ⚠️ Nur ESC/POS-kompatible Drucker
- ⚠️ Windows: USB-Treiber erforderlich

---

### 9. Quiz Show
**Status:** 🟡 Beta
**Version:** 1.0.0
**Autor:** Pup Cid

**Beschreibung:**
Interaktives Quiz-Show-Plugin für TikTok-Livestreams mit Chat-Integration, Jokern und Leaderboard.

**Features:**
- ❓ Multiple-Choice-Fragen
- 💬 Chat-basierte Antworten
- 🃏 Joker-System (50:50, Publikum, Zeitbonus)
- 🏆 Leaderboard mit Punkten
- ⏱️ Zeitlimits pro Frage
- 📊 Statistiken und Auswertungen
- 🎨 Overlay für Fragen und Antworten
- 📚 Custom Quiz-Sets

**Endpoints:**
- `GET /api/quiz-show/status` - Quiz-Status
- `POST /api/quiz-show/start` - Quiz starten
- `POST /api/quiz-show/next` - Nächste Frage
- `POST /api/quiz-show/stop` - Quiz beenden

**Overlay-URL:**
```
http://localhost:3000/quiz-show/overlay
```

**Bekannte Einschränkungen:**
- ⚠️ Beta: Joker-Balance noch in Optimierung

---

### 10. Viewer XP System
**Status:** 🟡 Beta
**Version:** 1.0.0
**Autor:** Pup Cid

**Beschreibung:**
Umfassendes Zuschauer-XP- und Leveling-System mit persistenter Speicherung, täglichen Boni, Streaks, Badges und Leaderboards. Gamifiziert Zuschauer-Engagement über mehrere Streams hinweg.

**Features:**
- ⭐ XP-System mit Levels
- 🎁 XP für Gifts, Chat, Follow, etc.
- 🔥 Daily Streaks & Boni
- 🏅 Badges und Achievements
- 🏆 Leaderboard (Top XP, Top Level)
- 💾 Persistent Storage
- 📊 Statistiken pro Benutzer
- 🎨 Overlay-Anzeige

**XP-Quellen:**
- 💬 Chat-Nachricht: 5 XP
- 🎁 Gift: Coins × 2 XP
- 👥 Follow: 50 XP
- ⭐ Subscribe: 200 XP
- 🔥 Daily Streak: Bonus XP

**Endpoints:**
- `GET /api/viewer-xp/leaderboard` - Top Zuschauer
- `GET /api/viewer-xp/user/:username` - Benutzer-Daten
- `POST /api/viewer-xp/reset` - XP zurücksetzen (Admin)

**Overlay-URL:**
```
http://localhost:3000/viewer-xp/leaderboard-overlay
```

**Bekannte Einschränkungen:**
- ⚠️ Beta: Level-Balance wird noch angepasst

---

### 11. Leaderboard
**Status:** 🟡 Beta
**Version:** 1.1.0
**Autor:** Pup Cid

**Beschreibung:**
Echtzeit-Leaderboard für Top-Gifter mit 5 Theme-Designs, Session- und All-Time-Tracking und Vorschaumodus. Zeigt Top-Contributors als OBS-Overlay mit Überholungs-Animationen.

**Features:**
- 🏆 Top Gifters (nach Coins sortiert)
- 📊 Session/All-Time-Tracking
- 🎨 5 Theme-Designs
- 🎬 Überholungs-Animationen
- 👁️ Preview-Modus
- 💾 Persistent Storage
- 📺 OBS-Overlay

**Themes:**
1. Classic Gold
2. Neon Cyberpunk
3. Minimal Modern
4. Royal Purple
5. Fire Red

**Endpoints:**
- `GET /api/leaderboard/top` - Top 10 Gifters
- `POST /api/leaderboard/reset` - Leaderboard zurücksetzen

**Overlay-URL:**
```
http://localhost:3000/leaderboard/overlay
```

**Bekannte Einschränkungen:**
- ⚠️ Beta: Theme-Customization noch begrenzt

---

### 12. OpenShock Integration
**Status:** 🟡 Beta
**Version:** 1.0.0
**Autor:** Pup Cid

**Beschreibung:**
Vollständige OpenShock API-Integration für TikTok Live Events mit Event-Mapping, Pattern-System, Safety-Layer, Queue-Management und professionellem Overlay.

**Features:**
- ⚡ OpenShock API-Integration
- 🎁 Gift-zu-Shock-Mapping
- 🎨 Pattern-System (Sequenzen)
- 🛡️ Safety-Layer (Limits, Cooldowns)
- 📊 Queue-Management
- 📺 Overlay-Anzeige
- 🔒 Permission-System

**Safety:**
- ⚠️ Maximale Intensität: 100% (konfigurierbar)
- ⏱️ Cooldown zwischen Shocks
- 🚫 Blacklist für Benutzer
- 📊 Statistiken und Logs

**Endpoints:**
- `GET /api/openshock/status` - API-Status
- `POST /api/openshock/trigger` - Manueller Trigger
- `POST /api/openshock/config` - Config speichern

**Bekannte Einschränkungen:**
- ⚠️ Beta: Pattern-Editor noch in Entwicklung
- ⚠️ Benötigt OpenShock API-Key

---

### 13. Multi-Cam Switcher
**Status:** 🟡 Beta
**Version:** 1.0.0
**Autor:** Pup Cid

**Beschreibung:**
Wechselt OBS-Szenen über Gifts oder Chat-Commands. Unterstützt Spout-Feeds und Kamera 1–5.

**Features:**
- 🎥 OBS WebSocket v5-Integration
- 💬 Chat-Commands (`!cam 1-5`)
- 🎁 Gift-Mappings
- 🎬 Macro-System
- ⏱️ Cooldowns
- 🔗 Spout-Feed-Support

**Commands:**
- `!cam 1` bis `!cam 5` - Kamera wechseln
- `!scene <name>` - Szene wechseln
- `!macro <name>` - Macro ausführen

**Endpoints:**
- `GET /api/multicam/state` - Aktueller Status
- `POST /api/multicam/connect` - OBS verbinden
- `POST /api/multicam/action` - Aktion ausführen

**Bekannte Einschränkungen:**
- ⚠️ Beta: Macro-System noch in Optimierung

---

### 14. Gift Milestone Celebration
**Status:** 🟡 Beta
**Version:** 1.0.0
**Autor:** Pup Cid

**Beschreibung:**
Feiert Coin-Meilensteine mit Custom-Animationen (GIF, MP4) und Audio. Triggert spezielle Celebrations, wenn kumulative Gift-Coins konfigurierte Schwellenwerte erreichen.

**Features:**
- 🎉 Meilenstein-Celebrations
- 🎬 GIF/MP4-Animationen
- 🔊 Audio-Support
- 📊 Kumulative Coin-Tracking
- 🎨 Custom Milestones (100, 500, 1000, etc.)
- 📺 Overlay-Anzeige

**Endpoints:**
- `GET /api/gift-milestone/progress` - Aktueller Fortschritt
- `POST /api/gift-milestone/milestones` - Milestones konfigurieren
- `POST /api/gift-milestone/reset` - Progress zurücksetzen

**Overlay-URL:**
```
http://localhost:3000/gift-milestone/overlay
```

**Bekannte Einschränkungen:**
- ⚠️ Beta: Große Video-Dateien können Performance beeinflussen

---

### 15. VDO.Ninja Multi-Guest Manager
**Status:** 🟡 Beta
**Version:** 1.0.0
**Autor:** Pup Cid

**Beschreibung:**
VDO.Ninja-Integration für Multi-Guest-Streaming. Verwaltet Räume, Guests, Layouts und Audio-Kontrollen für professionelle Multi-Cam-Setups.

**Features:**
- 🌐 VDO.Ninja Room-Management
- 👥 Guest-Verwaltung
- 📺 Layout-Kontrolle (Grid, Spotlight, Custom)
- 🔗 Guest-Link-Generierung
- 🎙️ Individuelle Audio-Kontrolle
- 🎬 OBS-Integration
- 📊 Guest-Status-Monitoring

**Endpoints:**
- `GET /api/vdoninja/rooms` - Alle Räume
- `POST /api/vdoninja/create-room` - Raum erstellen
- `POST /api/vdoninja/invite` - Guest einladen
- `DELETE /api/vdoninja/kick/:guest` - Guest kicken

**Bekannte Einschränkungen:**
- ⚠️ Beta: Layout-System noch in Entwicklung
- ⚠️ Benötigt VDO.Ninja-Account (kostenlos)

**Siehe auch:** [VDO.Ninja Plugin-Dokumentation](Plugins/VDO-Ninja)

---

### 16. Global Chat Command Engine (GCCE)
**Status:** 🟡 Beta
**Version:** 1.0.0
**Autor:** Pup Cid

**Beschreibung:**
Universaler Chat-Command-Interpreter und Framework für alle Plugins. Zentrale Verwaltung aller Chat-Commands.

**Features:**
- 📋 Zentrales Command-Registry
- 🔒 Permission-System (broadcaster > moderator > vip > subscriber > all)
- ✅ Syntax-Validierung
- ⏱️ Rate-Limiting (pro User & global)
- 📺 Overlay-Integration
- 📊 Statistik-Tracking
- ❓ Auto-generiertes Help-System
- ⚙️ Dynamic Configuration

**Plugin-Integration:**
```javascript
const gcce = this.api.pluginLoader?.loadedPlugins?.get('gcce')?.instance;
gcce.registerCommand({
  command: '!mycommand',
  description: 'Mein Custom Command',
  permission: 'all',
  handler: async (args, user, message) => {
    // Command-Logic
  }
});
```

**Endpoints:**
- `GET /api/gcce/commands` - Alle registrierten Commands
- `GET /api/gcce/stats` - Command-Statistiken

**Bekannte Einschränkungen:**
- ⚠️ Beta: Permission-System wird noch erweitert

---

## 🟢 Alpha Plugins

### 17. Weather Control
**Status:** 🟡 Open Beta
**Version:** 1.1.1
**Autor:** Pup Cid

**Beschreibung:**
Professionelles Wetter-Effekt-Plugin mit 13 Effekten, Live-Vorschau, Community-Gamification, Sequenzen, Gift-Mappings und OBS-Overlay für TikTok LIVE.

**Features:**
- 13 Canvas-Wettereffekte: Regen, Schnee, Sturm, Nebel, Donner, Sonnenstrahlen, Glitch-Wolken, Aurora, Glühwürmchen, Meteore, Sakura, Glut und Hitzeflimmern
- Qualitätsstufen, adaptives Rendering, Layering und Live-Vorschau
- TikTok-Event- und Gift-Trigger, GCCE-Chatbefehle und IFTTT-Aktion
- Permanente Effekte, Presets, Sequenzen und Community-Gamification
- Laufende OBS-Overlays übernehmen Konfigurationsänderungen ohne manuellen Reload

**Endpoints:**
- `GET /api/weather/config` - Bereinigte Konfiguration lesen
- `POST /api/weather/trigger` - Wettereffekt auslösen
- `POST /api/weather/stop` - Einen oder alle Effekte stoppen
- `POST /api/weather/sequence/trigger` - Effektsequenz auslösen
- `GET /api/weather/effects` - Unterstützte Effekte lesen
- `GET /api/weather/gamification` - Gamification-Status lesen

Schreibende Endpunkte verwenden die zentrale LTTH-Admin-Authentifizierung. Nicht-lokale Aufrufe benötigen ein gültiges `X-LTTH-Admin-Token`; der optionale Weather-API-Key kann als zusätzliche Schutzstufe aktiviert werden.

**Overlay-URL:**
```
http://localhost:3000/weather-control/overlay
```

**Bekannte Einschränkungen:**
- Open Beta: Für produktive Streams zuerst Qualität und maximale gleichzeitige Effekte im OBS-System testen.

---

### 18. Emoji Rain v2.0
**Status:** 🟢 Alpha
**Version:** 2.0.0
**Autor:** Pup Cid

**Beschreibung:**
Erweiterte Physik-basierte Emoji-Rain mit OBS HUD-Support, Game-Quality-Grafiken und 60 FPS Performance. (Canvas/Matter.js-Version)

**Features:**
- 🎨 Physik-Engine (Matter.js)
- 🎁 Gift-spezifische Emojis
- 👤 User-Emoji-Mappings
- 📺 OBS HUD-Overlay
- 🎯 60 FPS
- 💾 Persistent Configuration

**Overlay-URLs:**
```
Standard: http://localhost:3000/emoji-rain/overlay
OBS HUD: http://localhost:3000/emoji-rain/obs-hud
```

**Bekannte Einschränkungen:**
- Keine bekannten Einschränkungen

---

### 19. Soundboard Configuration
**Status:** 🟢 Alpha
**Version:** 1.0.0
**Autor:** Pup Cid

**Beschreibung:**
Gift-spezifische Sounds, Audio-Queue-Management und MyInstants-Integration für TikTok-Events.

**Features:**
- 🎵 100.000+ Sounds (MyInstants)
- 🎁 Gift-zu-Sound-Mapping
- 🎵 Event-Sounds (Follow, Subscribe, Share)
- ⚡ Like-Threshold-System
- 📦 Custom Upload (MP3)
- ⭐ Favorites & Trending
- 🔊 Volume-Kontrolle
- 📊 Queue-Management

**Endpoints:**
- `GET /api/soundboard/sounds` - Alle Sounds
- `POST /api/soundboard/play` - Sound abspielen
- `POST /api/soundboard/upload` - Custom Sound hochladen

**Bekannte Einschränkungen:**
- Keine bekannten Einschränkungen

---

### 20. ClarityHUD
**Status:** 🟢 Alpha
**Version:** 1.0.0
**Autor:** Pup Cid

**Beschreibung:**
Ultra-minimalistisches, VR-optimiertes und barrierefreies HUD-Overlay für Chat und Activity-Feeds.

**Features:**
- 📺 Minimalistisches Design
- 🥽 VR-optimiert
- ♿ Accessibility-Features
- 💬 Chat-Feed
- 📊 Activity-Feed
- 🎨 Customizable Farben
- 📱 Responsive Layout

**Overlay-URL:**
```
http://localhost:3000/clarityhud/overlay
```

**Bekannte Einschränkungen:**
- Keine bekannten Einschränkungen

---

### 21. Spotlight
**Status:** 🟢 Alpha
**Version:** 1.0.0
**Autor:** Pup Cid

**Beschreibung:**
Live-Overlays, die den letzten aktiven Benutzer für jeden Event-Typ anzeigen (Follower, Like, Chatter, Share, Gifter, Subscriber, Top Gift, Gift Streak) und mehrere Events im Multi-HUD rotieren können.

**Features:**
- 👥 Letzter Follower
- ❤️ Letzter Liker
- 💬 Letzter Chatter
- 🔗 Letzter Sharer
- 🎁 Letzter Gifter
- ⭐ Letzter Subscriber
- 💎 Top Gift des Streams
- 🔥 Gift Streak
- 📺 Multi-HUD Rotation
- 📺 Individuelle Overlays pro Event-Typ
- 🎨 Customizable Styling
- 🖼️ Profilbild-Anzeige

**Overlay-URLs:**
```
Follower: http://localhost:3000/overlay/spotlight/follower
Like: http://localhost:3000/overlay/spotlight/like
Chatter: http://localhost:3000/overlay/spotlight/chatter
Share: http://localhost:3000/overlay/spotlight/share
Gifter: http://localhost:3000/overlay/spotlight/gifter
Subscriber: http://localhost:3000/overlay/spotlight/subscriber
Top Gift: http://localhost:3000/overlay/spotlight/topgift
Gift Streak: http://localhost:3000/overlay/spotlight/giftstreak
Multi-HUD: http://localhost:3000/overlay/spotlight/multihud
```

**Konfiguration:** Plugin UI unter `http://localhost:3000/spotlight/ui`

**Bekannte Einschränkungen:**
- Keine bekannten Einschränkungen

---

### 22. TTS v2.0
**Status:** 🟢 Alpha
**Version:** 2.0.0
**Autor:** Pup Cid

**Beschreibung:**
Enterprise-Grade TTS-Plugin mit Multi-Engine-Support, Permission-System, Language-Detection, Caching und Queue-Management.

**Features:**
- 🎙️ 75+ TikTok-Stimmen (kostenlos)
- 🎙️ 30+ Google Cloud-Stimmen (optional, API-Key erforderlich)
- 👤 User-Voice-Mappings
- 📝 Auto-TTS für Chat
- 🚫 Blacklist-Filter (Wörter/Nutzer)
- 🎚️ Volume & Speed-Kontrolle
- 🔒 Permission-System
- 🌍 Language-Detection
- 💾 Audio-Caching
- 📊 Queue-Management

**Engines:**
1. TikTok TTS (Default, kostenlos)
2. Google Cloud TTS (optional)
3. Elevenlabs (geplant)

**Endpoints:**
- `GET /api/tts/voices` - Verfügbare Stimmen
- `POST /api/tts/speak` - TTS triggern
- `POST /api/tts/test` - Test-TTS

**Bekannte Einschränkungen:**
- Keine bekannten Einschränkungen

---

### 23. Live Goals
**Status:** 🟢 Alpha
**Version:** 1.0.0
**Autor:** Pup Cid

**Beschreibung:**
Komplettes Live-Goals-System mit Coin-, Likes-, Follower- und Custom-Goal-Typen. Echtzeit-Tracking mit Event-API und anpassbaren Overlays.

**Features:**
- 🪙 Coins-Goal
- ❤️ Likes-Goal
- 👥 Follower-Goal
- 🎯 Custom Goals
- 📊 Progress-Bars
- 🎨 Customizable Overlays
- 📡 Event-API
- 💾 Persistent Storage
- 🎉 Goal-Complete-Celebrations

**Endpoints:**
- `GET /api/goals/list` - Alle Goals
- `POST /api/goals/create` - Goal erstellen
- `POST /api/goals/update/:id` - Goal aktualisieren
- `DELETE /api/goals/delete/:id` - Goal löschen

**Overlay-URLs:**
```
Goal 1: http://localhost:3000/goals/goal1
Goal 2: http://localhost:3000/goals/goal2
Goal 3: http://localhost:3000/goals/goal3
Goal 4: http://localhost:3000/goals/goal4
```

**Bekannte Einschränkungen:**
- Keine bekannten Einschränkungen

---

## 🔵 Final/Stable Plugins

### 24. OSC-Bridge (VRChat)
**Status:** 🔵 Final
**Version:** 1.0.0
**Autor:** Pup Cid

**Beschreibung:**
Dauerhafte OSC-Brücke für VRChat-Integration. Ermöglicht bidirektionale Kommunikation zwischen TikTok-Events und VRChat-Avataren über standardisierte OSC-Parameter.

**Features:**
- 🔌 OSC-Protokoll-Integration
- 🎮 VRChat-Avatar-Steuerung
- 👋 Gesten-Trigger (Wave, Celebrate, Dance)
- ❤️ Effekte (Hearts, Confetti)
- 🎁 Gift-basierte Trigger
- 📊 Bidirektionale Kommunikation
- ⚙️ Custom Parameter-Support
- ⏱️ Latenz < 50 ms

**Endpoints:**
- `POST /api/osc/start` - OSC-Server starten
- `POST /api/osc/send` - OSC-Message senden
- `POST /api/osc/vrchat/wave` - Wave-Geste
- `POST /api/osc/vrchat/celebrate` - Celebrate-Animation

**VRChat Setup:**
1. VRChat OSC aktivieren
2. OSC-Port: 9000 (Standard)
3. Avatar-Parameter konfigurieren

**Bekannte Einschränkungen:**
- Keine bekannten Einschränkungen

---

### 25. Config Import Tool
**Status:** 🔵 Final
**Version:** 1.0.0
**Autor:** Pup Cid

**Beschreibung:**
Importiert Einstellungen von alten Installationspfaden zur aktuellen Config-Location. Migration-Tool für Updates.

**Features:**
- 📂 Auto-Detection alter Configs
- 🔄 Automatischer Import
- 💾 Backup vor Import
- 📊 Import-Report
- 🔒 Validierung importierter Daten

**Endpoints:**
- `GET /api/config-import/scan` - Nach alten Configs suchen
- `POST /api/config-import/import` - Import durchführen

**Bekannte Einschränkungen:**
- Keine bekannten Einschränkungen

---

### 26. Fireworks Superplugin (Canvas/WebGL)
**Status:** 🔵 Final
**Version:** 1.0.0
**Autor:** Pup Cid

**Beschreibung:**
GPU-beschleunigte Feuerwerks-Effekte mit Gift-spezifischen Displays, Combo-Systemen und interaktiven Triggern. WebGL/Canvas-basierte Fallback-Version.

**Features:**
- 🎆 WebGL/Canvas-Rendering
- 🎁 Gift-spezifische Designs
- 🔥 Combo-System
- 📈 Eskalations-Mechanik
- 🎨 Custom Shapes & Farben
- 🔊 Audio-Effekte

**Overlay-URL:**
```
http://localhost:3000/fireworks/overlay
```

**Bekannte Einschränkungen:**
- Keine bekannten Einschränkungen

**Stabilität:**
- Streamer-sichere Backpressure bei niedrigen FPS oder hoher Effektlast
- Validierte Config-, Trigger-, Finale- und Gift-Mapping-Payloads

---

### 27. API Bridge
**Status:** 🔵 Final
**Version:** 1.0.0
**Autor:** Pup Cid

**Beschreibung:**
Ermöglicht externen Anwendungen die Steuerung des Tools via HTTP und WebSocket.

**Features:**
- 🌐 REST-API
- 📡 WebSocket-API
- 🔒 API-Key-Authentication
- 📊 Event-Streaming
- 🔌 Webhook-Support

**Endpoints:**
- `GET /api/bridge/events` - Event-Stream
- `POST /api/bridge/trigger` - Event triggern
- `POST /api/bridge/webhook` - Webhook registrieren

**Bekannte Einschränkungen:**
- Keine bekannten Einschränkungen

---

### 28. CoinBattle
**Status:** 🔵 Final
**Version:** 1.0.0
**Autor:** Pup Cid

**Beschreibung:**
Live-Battle-Game-Modul, bei dem Zuschauer durch TikTok-Gifts konkurrieren, um Coins zu sammeln. Features Team-Battles, Multiplier-Events, historische Rankings, Badges und anpassbare Overlays.

**Features:**
- ⚔️ Team-Battles (2-4 Teams)
- 🪙 Coin-Collection
- 🔥 Multiplier-Events
- 🏆 Rankings & Leaderboards
- 🏅 Badges & Achievements
- 📺 Live-Overlay
- 📊 Historische Statistiken

**Endpoints:**
- `GET /api/coinbattle/status` - Battle-Status
- `POST /api/coinbattle/start` - Battle starten
- `POST /api/coinbattle/stop` - Battle beenden

**Overlay-URL:**
```
http://localhost:3000/coinbattle/overlay
```

**Bekannte Einschränkungen:**
- Keine bekannten Einschränkungen

---

### 29. Flame Overlay
**Status:** 🔵 Final
**Version:** 1.0.0
**Autor:** Pup Cid

**Beschreibung:**
Konfigurierbares WebGL-Flame-Border-Overlay für TikTok-Livestreams. Features anpassbare Farben, Intensität, Geschwindigkeit und Frame-Dicke mit transparentem Hintergrund für OBS.

**Features:**
- 🔥 WebGL-Flammen-Effekt
- 🎨 Anpassbare Farben
- ⚡ Intensität & Geschwindigkeit
- 📐 Frame-Dicke konfigurierbar
- 🎬 Transparenter Hintergrund (OBS)
- 🎁 Gift-Trigger (optional)

**Overlay-URL:**
```
http://localhost:3000/flame-overlay/overlay
```

**Bekannte Einschränkungen:**
- Keine bekannten Einschränkungen

---

### 30. Hybridshock Integration
**Status:** 🔵 Final
**Version:** 1.0.0
**Autor:** Pup Cid

**Beschreibung:**
Bidirektionale Bridge zwischen TikTok Live Events und Hybridshock API (HTTP/WebSocket). Ermöglicht das Triggern von Hybridshock-Actions durch TikTok-Events mit flexiblem Mapping-System, Action-Queue, Rate-Limiting und erweiterten Debugging-Tools.

**Features:**
- ⚡ Hybridshock API-Integration (HTTP/WS)
- 🎁 Gift-zu-Action-Mapping
- 📊 Queue-Management
- ⏱️ Rate-Limiting
- 🛡️ Safety-Layer
- 🔒 Permission-System
- 📺 Status-Overlay
- 🐛 Debug-Tools

**Endpoints:**
- `GET /api/hybridshock/status` - API-Status
- `POST /api/hybridshock/trigger` - Manueller Trigger
- `POST /api/hybridshock/config` - Config speichern

**Bekannte Einschränkungen:**
- Keine bekannten Einschränkungen

---

### 31. IFTTT Automation Flows (Geplant)
**Status:** 🔵 Final (In Planung)
**Version:** 1.0.0 (Geplant)
**Autor:** Pup Cid

**Beschreibung:**
IFTTT-Integration für erweiterte Automatisierungen. Verbindet TikTok-Events mit 700+ externen Services.

**Geplante Features:**
- 🔗 IFTTT Webhook-Integration
- 📧 E-Mail-Notifications
- 💡 Smart Home (Philips Hue, etc.)
- 📱 Mobile Push-Notifications
- 📊 Google Sheets-Logging
- 🌐 Unzählige weitere Integrationen

**Status:** In Planung für Version 1.3.0

---

## 🔧 Plugin-Installation

### Automatische Installation
Alle 35 Plugins sind bereits vorinstalliert und können direkt über das Admin-UI aktiviert werden.

### Plugin aktivieren
1. Dashboard öffnen: `http://localhost:3000`
2. Navigation → **Plugins**
3. Plugin in der Liste finden
4. **Enable**-Button klicken
5. Plugin-Konfiguration durchführen (falls erforderlich)

### Plugin deaktivieren
1. Dashboard → Plugins
2. Plugin auswählen
3. **Disable**-Button klicken

### Plugin neu laden
```bash
POST http://localhost:3000/api/plugins/reload
```

---

## ⚙️ Plugin-Konfiguration

### Via Admin UI
Die meisten Plugins bieten ein Admin-UI zur Konfiguration:

```
http://localhost:3000/plugins/<plugin-id>/ui.html
```

Beispiel:
```
http://localhost:3000/plugins/advanced-timer/ui.html
```

### Via API
Plugins können auch programmatisch konfiguriert werden:

```bash
# Config abrufen
GET /api/plugins/<plugin-id>/config

# Config speichern
POST /api/plugins/<plugin-id>/config
Body: { "key": "value" }
```

### Via Datenbank
Erweiterte Konfigurationen werden in der SQLite-Datenbank gespeichert:

Tabelle: `settings`
Key-Format: `plugin:<plugin-id>:<key>`

---

## 🔗 Weiterführende Dokumentation

- **[Plugin-Dokumentation](Plugin-Dokumentation.md)** - Entwickler-Leitfaden für eigene Plugins
- **[API-Reference](API-Reference.md)** - Vollständige API-Dokumentation
- **[Entwickler-Leitfaden](Entwickler-Leitfaden.md)** - Code-Standards und Best Practices
- **[Architektur](Architektur.md)** - System-Architektur verstehen

---

[← Plugin-Dokumentation](Plugin-Dokumentation) | [→ Entwickler-Leitfaden](Entwickler-Leitfaden)

---

*Letzte Aktualisierung: 2025-12-11*
*Version: 1.2.1*
