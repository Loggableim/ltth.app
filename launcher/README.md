# LTTH Launcher

Leichtgewichtiger Windows Launcher für PupCid's Little TikTok Helper.

**Technologie:** Go + WebView2 (nur ~5-10 MB statt ~150 MB bei Electron)

## Features

- ✅ **Update-Prüfung** - Automatische Prüfung auf neue Versionen beim Start
- ✅ **Download & Installation** - Sichere Downloads mit ZIP-Extraktion
- ✅ **Erstinstallation-Wizard** - Benutzerfreundliche Pfadauswahl bei erster Nutzung
- ✅ **Konfigurationsschutz** - Automatische Sicherung von Nutzereinstellungen
- ✅ **Rollback-Funktion** - Rückkehr zur vorherigen Version bei Problemen
- ✅ **Modernes UI** - Design angelehnt an ltth.app mit Dark Mode
- ✅ **Mehrsprachig** - Deutsch und Englisch
- ✅ **Minimaler Footprint** - Nur ~5-10 MB Downloadgröße

## Systemanforderungen

- Windows 10/11 (64-bit)
- WebView2 Runtime (auf Windows 10/11 bereits vorinstalliert)
- Internetverbindung für Updates
- ~50 MB freier Speicherplatz

## Installation

### Für Endbenutzer

1. Lade `launcher.exe` von der [Download-Seite](https://ltth.app/download.html) herunter
2. Führe die Datei aus
3. Wähle bei der ersten Nutzung die Installationspfade:
   - **Installationspfad**: Wo die Programmdateien gespeichert werden
   - **Konfigurationspfad**: Wo deine persönlichen Einstellungen gespeichert werden
4. Der Launcher prüft automatisch auf Updates und installiert die neueste Version

### Für Entwickler

**Voraussetzungen:**
- Go 1.21 oder höher
- MinGW-w64 (für Cross-Compile von Linux)

```bash
# Repository klonen
git clone https://github.com/Loggableim/ltth.app.git
cd ltth.app/launcher

# Dependencies laden
go mod tidy

# Bauen (Windows)
.\build.ps1

# Bauen (Linux Cross-Compile)
./build.sh
```

**Manueller Build:**

```bash
# Windows (auf Windows)
go build -ldflags="-H windowsgui -s -w" -o launcher.exe .

# Windows (Cross-Compile von Linux)
GOOS=windows GOARCH=amd64 CGO_ENABLED=1 CC=x86_64-w64-mingw32-gcc \
  go build -ldflags="-H windowsgui -s -w" -o launcher.exe .
```

## Architektur

```
launcher/
├── main.go              # Komplette Anwendung (Go + embedded HTML/CSS/JS)
├── go.mod               # Go Module Definition
├── go.sum               # Dependency Checksums
├── build.ps1            # Windows Build Script
├── build.sh             # Linux Build Script (Cross-Compile)
├── README.md            # Diese Dokumentation
├── assets/
│   └── icon.png         # App Icon (von ltth.app/assets/ltthicon.png)
└── docs/
    ├── ARCHITECTURE.md  # Technische Details
    ├── SECURITY.md      # Sicherheitskonzept
    └── MIGRATION.md     # Config-Migration
```

### Warum Go + WebView2?

| Aspekt | Go + WebView2 | Electron |
|--------|---------------|----------|
| **Downloadgröße** | 5-10 MB | 70-150 MB |
| **RAM-Verbrauch** | ~30 MB | ~150+ MB |
| **Startzeit** | <1 Sekunde | 2-5 Sekunden |
| **UI-Qualität** | Modern (HTML/CSS/JS) | Modern (HTML/CSS/JS) |
| **Komplexität** | Gering (1 Datei) | Hoch (Node.js Ecosystem) |

WebView2 nutzt den bereits installierten Edge-Browser, daher keine zusätzliche Runtime nötig.

## Update-Mechanismus

1. **Version prüfen**: Launcher lädt `version.json` von GitHub
2. **Vergleich**: Aktuelle Version wird mit installierter verglichen
3. **Download**: Bei Update wird ZIP von `ltth.app/app/ltth_X.X.X.zip` geladen
4. **Backup**: Bestehende Konfiguration wird gesichert
5. **Extraktion**: ZIP wird in Versionsverzeichnis entpackt
6. **Rollback**: Bei Fehlern kann zur vorherigen Version zurückgekehrt werden

## Speicherorte

| Typ | Pfad (Standard) |
|-----|-----------------|
| Programm | `%LOCALAPPDATA%\LTTH\versions\<version>` |
| Konfiguration | `%LOCALAPPDATA%\LTTH\config` |
| Logs | `%LOCALAPPDATA%\LTTH\launcher.log` |
| Launcher-Config | `%APPDATA%\ltth-launcher\config.json` |

## Sicherheit

- ✅ Nur HTTPS-Verbindungen
- ✅ ZIP-Slip-Schutz bei Extraktion
- ✅ SHA256-Checksummen-Unterstützung
- ✅ Keine sensiblen Daten im Code
- ✅ Statisch kompiliert (keine Runtime-Abhängigkeiten)
- ✅ Minimale Berechtigungen angefordert

## UI-Design

Das UI orientiert sich am Design von ltth.app:

- **Primärfarbe:** `#12a116` (Brand Green)
- **Hintergrund:** `#0e0f10` (Dark Mode)
- **Oberfläche:** `#1a1b1d`
- **Text:** `#f5f7f4`
- **Abgerundete Ecken, moderne Buttons, Status-Icons**

## Fehlerbehebung

### Launcher startet nicht

1. Prüfe, ob Windows 10 oder höher installiert ist
2. Stelle sicher, dass WebView2 Runtime installiert ist
3. Prüfe, ob die Datei nicht von Antivirus blockiert wird

### WebView2 nicht gefunden

WebView2 ist auf Windows 10/11 normalerweise vorinstalliert. Falls nicht:
1. Lade WebView2 Runtime von [Microsoft](https://developer.microsoft.com/microsoft-edge/webview2/) herunter
2. Installiere die Runtime
3. Starte den Launcher erneut

### Update-Prüfung schlägt fehl

1. Prüfe die Internetverbindung
2. Prüfe, ob GitHub/ltth.app erreichbar ist
3. Schaue in die Log-Datei: `%LOCALAPPDATA%\LTTH\launcher.log`

### App startet nicht nach Installation

1. Prüfe, ob Node.js installiert ist (falls die App Node.js benötigt)
2. Prüfe die Berechtigungen im Installationsverzeichnis
3. Versuche einen Rollback zur vorherigen Version

## Lizenz

MIT License - Siehe [LICENSE](../LICENSE)

## Support

- [GitHub Issues](https://github.com/Loggableim/ltth.app/issues)
- [Dokumentation](https://ltth.app/docs.html)
- [FAQ](https://ltth.app/faq.html)
