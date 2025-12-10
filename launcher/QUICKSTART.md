# LTTH Cloud Launcher - Schnellstart

## Für Endbenutzer

### Download

Lade den LTTH Cloud Launcher herunter:
- **Direkt**: https://ltth.app/downloads/launcher.exe
- **Download-Seite**: https://ltth.app/download.html

### Erste Schritte

1. **Launcher starten**
   - Doppelklick auf `launcher.exe`
   - Windows SmartScreen: Klicke "Weitere Informationen" → "Trotzdem ausführen"

2. **Ersteinrichtung**
   - Wähle Installationspfad (Standard: `C:\Users\<User>\AppData\Local\LTTH\versions`)
   - Wähle Konfigurationspfad (Standard: `C:\Users\<User>\AppData\Local\LTTH\config`)
   - Klicke "Weiter"

3. **Automatische Installation**
   - Launcher prüft auf Updates
   - Lädt automatisch die neueste Version herunter
   - Installiert LTTH
   - Klicke "Starten" um LTTH zu öffnen

### Updates

Der Launcher prüft automatisch beim Start auf neue Versionen:
- **Automatisch**: Updates werden beim Start geprüft (kann deaktiviert werden)
- **Manuell**: Klicke "Jetzt prüfen" in den Einstellungen
- **Installation**: Ein Klick auf "Update installieren"

### Rollback

Falls nach einem Update Probleme auftreten:
1. Öffne den Launcher
2. Einstellungen → Versionen
3. Wähle vorherige Version aus der Liste
4. Klicke "Rollback"

---

## Für Entwickler

### Cloud Launcher bauen

**Voraussetzungen:**
- Go 1.21+ installiert
- MinGW für Cross-Compile (Linux)

**Build auf Linux:**
```bash
cd launcher
./build-cloud-launcher.sh
```

**Build auf Windows:**
```powershell
cd launcher
.\build.ps1
```

**Ausgabe:**
- Datei: `launcher.exe` (~6-8 MB)
- Bereit für Code-Signing

### Code Signing (empfohlen)

```powershell
# Windows mit SignTool
signtool sign /f "MeinZertifikat.pfx" /p "Passwort" /t http://timestamp.digicert.com launcher.exe

# Oder mit osslsigncode (Linux)
osslsigncode sign -pkcs12 MeinZertifikat.pfx -pass "Passwort" \
  -t http://timestamp.digicert.com \
  -in launcher.exe -out launcher-signed.exe
```

### Distribution

1. Baue den Launcher
2. Signiere die EXE (optional aber empfohlen)
3. Lade hoch nach `ltth.app/downloads/launcher.exe`

---

## Technische Details

### Was der Cloud Launcher macht

1. **Version prüfen**
   - Lädt `version.json` von GitHub
   - Vergleicht mit installierter Version

2. **Download**
   - Lädt immer `ltth_latest.zip` von `https://ltth.app/app/`
   - Kein versionsspezifischer Download nötig

3. **Installation**
   - Extrahiert zu `%LOCALAPPDATA%\LTTH\versions\<version>\`
   - Erstellt automatisch Backup der Konfiguration

4. **Launch**
   - Startet LTTH aus dem Versionsverzeichnis
   - Öffnet in Browser oder startet Node.js App

### Dateipfade

| Typ | Pfad |
|-----|------|
| Launcher Config | `%APPDATA%\ltth-launcher\config.json` |
| Installationen | `%LOCALAPPDATA%\LTTH\versions\` |
| Konfiguration | `%LOCALAPPDATA%\LTTH\config\` |
| Logs | `%LOCALAPPDATA%\LTTH\launcher.log` |

### URLs

| Zweck | URL |
|-------|-----|
| Version-Info | `https://raw.githubusercontent.com/Loggableim/ltth.app/main/version.json` |
| Download | `https://ltth.app/app/ltth_latest.zip` |

---

## Fehlerbehebung

### Weißes Fenster
**Lösung**: Stelle sicher, dass Version 1.0.1+ verwendet wird (bereits behoben)

### WebView2 nicht gefunden
**Lösung**: Installiere [WebView2 Runtime](https://go.microsoft.com/fwlink/p/?LinkId=2124703)

### Update schlägt fehl
**Prüfe**:
- Internetverbindung
- Firewall/Antivirus
- Logs in `%LOCALAPPDATA%\LTTH\launcher.log`

### SmartScreen-Warnung
**Ursache**: Launcher ist nicht code-signiert

**Lösung**:
1. Klicke "Weitere Informationen"
2. Klicke "Trotzdem ausführen"

**Oder**: Verwende signierte Version (nach dem Signieren)

---

## Support

- **Issues**: https://github.com/Loggableim/ltth.app/issues
- **Docs**: https://ltth.app/docs.html
- **FAQ**: https://ltth.app/faq.html
