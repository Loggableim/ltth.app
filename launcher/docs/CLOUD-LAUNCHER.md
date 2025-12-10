# LTTH Cloud Launcher Documentation

## Übersicht

Der LTTH Cloud Launcher ist eine eigenständige Windows-Anwendung (launcher.exe), die automatisch die neueste Version von LTTH vom Repository herunterlädt und installiert. Es fungiert als "Cloud Launcher", da es immer die aktuellste Version aus dem Repository bezieht.

## Architektur

```
┌─────────────────────────────────────────────────┐
│           launcher.exe (Cloud Launcher)         │
│  - WebView2-basierte GUI (6-8 MB)              │
│  - Prüft version.json von GitHub               │
│  - Lädt ltth_latest.zip von ltth.app           │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  version.json (GitHub Raw)                      │
│  https://raw.githubusercontent.com/.../main/... │
│  - Aktuelle Version (z.B. "1.2.0")             │
│  - Release-Datum                                │
│  - Changelog                                    │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  ltth_latest.zip (ltth.app)                     │
│  https://ltth.app/app/ltth_latest.zip          │
│  - Immer die neueste stabile Version            │
│  - Wird bei jedem Release aktualisiert          │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  Lokale Installation                            │
│  %LOCALAPPDATA%\LTTH\versions\1.2.0\           │
│  - Versionsspezifisches Verzeichnis             │
│  - Ermöglicht Rollback                          │
└─────────────────────────────────────────────────┘
```

## Features

### ✅ Gelöste Probleme

#### White Screen Issue (Hauptproblem)
- **Problem**: Launcher zeigte nur weißes Fenster ohne Inhalt
- **Ursache**: HTML wurde nicht korrekt URL-encodiert im `data:text/html,` Schema
- **Lösung**: Verwendung von Base64-Encoding: `data:text/html;base64,<encoded_html>`
- **Code-Änderung**:
  ```go
  // Vorher (fehlerhaft):
  w.Navigate("data:text/html," + htmlUI)
  
  // Nachher (korrekt):
  encodedHTML := base64.StdEncoding.EncodeToString([]byte(htmlUI))
  w.Navigate("data:text/html;base64," + encodedHTML)
  ```

#### Cloud Update Mechanism
- **Immer aktuell**: Lädt `ltth_latest.zip` statt versionsspezifischer Dateien
- **Einfache Wartung**: Nur eine URL muss gepflegt werden
- **Code-Änderung**:
  ```go
  // Vorher:
  zipURL := fmt.Sprintf("%sltth_%s.zip", AppZIPBaseURL, version)
  
  // Nachher:
  zipURL := AppZIPBaseURL + "ltth_latest.zip"
  ```

### 🚀 Funktionalität

1. **Automatische Update-Prüfung**
   - Beim Start wird `version.json` geladen
   - Vergleich mit installierter Version
   - Benutzer wird bei Updates benachrichtigt

2. **Download & Installation**
   - Download von `ltth_latest.zip`
   - Extraktion in versionsspezifisches Verzeichnis
   - Automatisches Backup der Konfiguration

3. **Rollback-Funktion**
   - Bis zu 5 vorherige Versionen werden gespeichert
   - Ein-Klick-Rollback bei Problemen

4. **Konfigurationsschutz**
   - Automatisches Backup vor Updates
   - Zeitstempel-basierte Backup-Ordner
   - Keine Datenverluste bei Updates

## Build-Prozess

### Voraussetzungen

**Auf Linux (Cross-Compile):**
```bash
# Go installieren (1.21+)
sudo apt install golang-go

# MinGW für Windows Cross-Compile
sudo apt install gcc-mingw-w64-x86-64
```

**Auf Windows:**
```powershell
# Go von https://golang.org/dl/ installieren
# MinGW nicht nötig (nativer Build)
```

### Cloud Launcher Bauen

**Option 1: Build-Script (empfohlen)**
```bash
cd launcher
./build-cloud-launcher.sh
```

**Option 2: Manuell**
```bash
cd launcher

# Linux → Windows Cross-Compile
export GOOS=windows
export GOARCH=amd64
export CGO_ENABLED=1
export CC=x86_64-w64-mingw32-gcc
go build -ldflags="-H windowsgui -s -w" -o launcher.exe .

# Windows Native
go build -ldflags="-H windowsgui -s -w" -o launcher.exe .
```

### Ergebnis
- Datei: `launcher.exe`
- Größe: ~6-8 MB
- Format: PE32+ executable (GUI) x86-64

## Distribution

### 1. Build

```bash
cd launcher
./build-cloud-launcher.sh
```

### 2. Code Signing (optional aber empfohlen)

```powershell
# Mit eigenem Code-Signing-Zertifikat
signtool sign /f "cert.pfx" /p "password" /t http://timestamp.digicert.com launcher.exe
```

### 3. Upload

```bash
# Signierte Version hochladen
scp launcher.exe server:/var/www/ltth.app/downloads/launcher.exe

# Oder via Git (wenn in Repo)
git add launcher.exe
git commit -m "Update cloud launcher (signed)"
git push
```

### 4. Benutzer-Download

Benutzer laden herunter von:
- `https://ltth.app/downloads/launcher.exe`
- Direkt-Link auf Download-Seite

## Repository-Integration

### Dateistruktur

```
ltth.app/
├── version.json                    # Versionsinformationen
├── app/
│   ├── ltth_latest.zip            # Immer aktuelle Version
│   ├── ltth_1.2.0.zip             # Archive (optional)
│   └── ltth_1.1.1.zip             # Archive (optional)
├── launcher/
│   ├── main.go                     # Launcher-Code
│   ├── build-cloud-launcher.sh    # Build-Script
│   └── README.md                   # Dokumentation
└── downloads/
    └── launcher.exe                # Signierte Version (nach Build)
```

### version.json Format

```json
{
  "version": "1.2.0",
  "releaseDate": "2025-12-08",
  "status": "stable",
  "changelog": {
    "1.2.0": {
      "date": "2025-12-08",
      "changes": [
        "NEW: Feature X",
        "FIXED: Bug Y",
        "IMPROVED: Performance Z"
      ]
    }
  }
}
```

### Update-Workflow

1. **Neue Version entwickeln**
   - Code-Änderungen in LTTH
   - Version in package.json erhöhen

2. **Release vorbereiten**
   ```bash
   # ZIP erstellen
   cd app/1.2.0
   zip -r ../ltth_1.2.0.zip ltth_1.2.0/
   
   # Als latest markieren
   cp ../ltth_1.2.0.zip ../ltth_latest.zip
   ```

3. **version.json aktualisieren**
   ```bash
   # Version und Changelog eintragen
   vim version.json
   git add version.json app/ltth_latest.zip
   git commit -m "Release version 1.2.0"
   git push
   ```

4. **Launcher benachrichtigt automatisch**
   - Beim nächsten Start sehen Benutzer das Update
   - Ein-Klick-Installation

## Sicherheit

### Implementierte Schutzmaßnahmen

1. **HTTPS-Only**
   - Alle Downloads über HTTPS
   - Keine unverschlüsselten Verbindungen

2. **ZIP-Slip Protection**
   - Validierung aller Pfade bei Extraktion
   - Verhindert Directory Traversal

3. **Path Validation**
   - Sanitization aller Benutzereingaben
   - Verhindert Path Injection

4. **Code Signing (empfohlen)**
   - Launcher sollte signiert werden
   - Verhindert SmartScreen-Warnungen
   - Erhöht Vertrauenswürdigkeit

### Empfohlene Code-Signing-Anbieter

- [DigiCert](https://www.digicert.com/code-signing/)
- [GlobalSign](https://www.globalsign.com/code-signing-certificate)
- [Sectigo](https://sectigo.com/ssl-certificates-tls/code-signing)

## Troubleshooting

### White Screen Issue
**Symptom**: Launcher öffnet, aber zeigt nur weißes Fenster

**Lösung**:
1. Stelle sicher, dass Version 1.0.1+ verwendet wird
2. Prüfe, ob WebView2 Runtime installiert ist
3. Schaue in die Logs: `%LOCALAPPDATA%\LTTH\launcher.log`

### Update schlägt fehl
**Symptom**: "Download failed" Fehler

**Lösung**:
1. Prüfe Internetverbindung
2. Prüfe ob `https://ltth.app/app/ltth_latest.zip` erreichbar ist
3. Prüfe Firewall/Antivirus-Einstellungen

### WebView2 nicht gefunden
**Symptom**: "Failed to create WebView2 window"

**Lösung**:
1. Installiere [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)
2. WebView2 ist auf Windows 10/11 normalerweise vorinstalliert

## Support

- **GitHub Issues**: https://github.com/Loggableim/ltth.app/issues
- **Dokumentation**: https://ltth.app/docs.html
- **FAQ**: https://ltth.app/faq.html

## Lizenz

MIT License - Siehe [../LICENSE](../LICENSE)
