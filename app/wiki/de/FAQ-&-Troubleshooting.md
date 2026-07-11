# 🇩🇪 Deutsch

### 📑 Inhaltsverzeichnis

1. [Häufig gestellte Fragen](#häufig-gestellte-fragen-deutsch)
2. [Installation & Setup](#installation--setup-deutsch)
3. [TikTok-Verbindung](#tiktok-verbindung-deutsch)
4. [Alerts & TTS](#alerts--tts-deutsch)
5. [OBS-Integration](#obs-integration-deutsch)
6. [Plugin-Probleme](#plugin-probleme-deutsch)
7. [Performance-Probleme](#performance-probleme-deutsch)
8. [Datenbank-Probleme](#datenbank-probleme-deutsch)
9. [Netzwerk & Firewall](#netzwerk--firewall-deutsch)
10. [Debug-Tipps](#debug-tipps-deutsch)
11. [Support & Community](#support--community-deutsch)

---

### ❓ Häufig gestellte Fragen {#häufig-gestellte-fragen-deutsch}

#### Muss ich mich bei TikTok anmelden?

**Nein!** Das Tool nutzt nur öffentliche TikTok LIVE-Streams. Keine Login-Daten erforderlich.

#### Kostet das Tool etwas?

**Nein!** 100% kostenlos und Open Source (CC BY-NC 4.0 Lizenz).

#### Welche TikTok-Events werden unterstützt?

- ✅ Gifts (Geschenke)
- ✅ Chat (Nachrichten)
- ✅ Follows (Follower)
- ✅ Shares (Stream-Shares)
- ✅ Likes
- ✅ Subscriptions

#### Brauche ich einen API-Key?

**Nein!** Für Basis-Funktionen (TikTok TTS, Alerts, Goals) sind keine API-Keys erforderlich.

**Optional:** Google Cloud TTS API-Key für 30+ zusätzliche Stimmen.

#### Funktioniert es mit OBS Studio?

**Ja!** Volle OBS-Integration via Browser Source und OBS WebSocket v5.

#### Kann ich eigene Plugins erstellen?

**Ja!** Das Plugin-System ist vollständig dokumentiert. Siehe [Plugin-Dokumentation](./Plugin-Dokumentation.md#deutsch).

#### Ist das Tool sicher?

**Ja!** 100% lokal, keine Cloud-Services, kein Tracking. Open Source Code auf GitHub.

#### Läuft es auf Linux/macOS?

**Ja!** Cross-Platform: Windows, Linux, macOS.

---

### 🔧 Installation & Setup {#installation--setup-deutsch}

#### Problem: "node: command not found"

**Ursache:** Node.js nicht installiert oder nicht im PATH.

**Lösung:**
1. Node.js installieren: [nodejs.org](https://nodejs.org/)
2. Nach Installation: Terminal/PowerShell **neu starten**
3. Prüfen: `node --version`

---

#### Problem: "npm install" schlägt fehl

**Symptom:**
```
gyp ERR! build error
gyp ERR! stack Error: `make` failed with exit code: 2
```

**Ursache:** Build-Tools fehlen (für `better-sqlite3`).

**Lösung (Windows):**
```bash
# Als Administrator in PowerShell:
npm install --global windows-build-tools
```

**Lösung (Linux/Ubuntu):**
```bash
sudo apt-get install -y build-essential python3
```

**Lösung (macOS):**
```bash
xcode-select --install
```

---

#### Problem: Port 3000 bereits in Verwendung

**Symptom:**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Lösung Option 1 - Port ändern:**
```bash
# .env Datei bearbeiten
PORT=3001
```

**Lösung Option 2 - Prozess auf Port 3000 beenden:**

**Windows:**
```bash
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

**Linux/macOS:**
```bash
lsof -i :3000
kill -9 <PID>
```

---

### 🔗 TikTok-Verbindung {#tiktok-verbindung-deutsch}

#### Problem: Keine Verbindung zu TikTok LIVE

**Symptom:** Status bleibt "Disconnected" oder "Connecting..."

**Mögliche Ursachen:**
1. **Ungültiger Username** - Schreibweise prüfen
2. **Stream nicht live** - TikTok-Stream muss laufen
3. **Eulerstream API-Key ungültig** - Key prüfen
4. **Netzwerk blockiert** - Firewall/Antivirus blockiert Verbindung

**Lösung:**
1. TikTok-Username korrekt eingeben
2. Sicherstellen, dass TikTok LIVE-Stream läuft
3. Eulerstream API-Key validieren
4. Firewall temporär deaktivieren zum Testen
5. Browser-Konsole auf Fehlermeldungen prüfen

---

[Continues with German translations...]

---

*Letzte Aktualisierung: 2025-12-11*  
*Version: 1.2.1*

---
