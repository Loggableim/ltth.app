# Cloud Launcher Distribution - Anleitung

Diese Anleitung beschreibt, wie du den Cloud Launcher baust, signierst und verteilst.

## Schritt 1: Cloud Launcher bauen

### Auf Linux (empfohlen für CI/CD)

```bash
# Im launcher-Verzeichnis
cd launcher

# Build-Script ausführen
./build-cloud-launcher.sh

# Ergebnis: launcher.exe (ca. 6-8 MB)
```

### Auf Windows (direkt)

```powershell
# Im launcher-Verzeichnis
cd launcher

# PowerShell Build-Script
.\build.ps1

# Ergebnis: launcher.exe (ca. 6-8 MB)
```

## Schritt 2: Code-Signing (empfohlen)

### Warum Code-Signing?

- ✅ Keine SmartScreen-Warnungen für Benutzer
- ✅ Erhöhtes Vertrauen
- ✅ Professionelleres Image
- ✅ Schutz vor Manipulation

### Code-Signing-Zertifikat besorgen

**Empfohlene Anbieter:**
- [DigiCert](https://www.digicert.com/code-signing/) - $469/Jahr
- [Sectigo](https://sectigo.com/ssl-certificates-tls/code-signing) - $249/Jahr
- [GlobalSign](https://www.globalsign.com/code-signing-certificate) - $249/Jahr

**Günstigere Alternative:**
- [Certum](https://www.certum.eu/certum/cert,offer_en_open_source_cs.xml) - ~€100/Jahr

### Signieren mit SignTool (Windows)

```powershell
# SignTool ist in Windows SDK enthalten
# Download: https://developer.microsoft.com/windows/downloads/windows-sdk/

# Zertifikat-Datei signieren
signtool sign `
  /f "MeinZertifikat.pfx" `
  /p "DeinPasswort" `
  /t http://timestamp.digicert.com `
  /fd SHA256 `
  /v `
  launcher.exe

# Signatur verifizieren
signtool verify /pa /v launcher.exe
```

### Signieren mit osslsigncode (Linux/Mac)

```bash
# osslsigncode installieren
sudo apt install osslsigncode  # Ubuntu/Debian
brew install osslsigncode       # macOS

# Signieren
osslsigncode sign \
  -pkcs12 MeinZertifikat.pfx \
  -pass "DeinPasswort" \
  -t http://timestamp.digicert.com \
  -h sha256 \
  -in launcher.exe \
  -out launcher-signed.exe

# Signatur verifizieren
osslsigncode verify launcher-signed.exe
```

### Timestamp Server

Wichtig: Nutze einen Timestamp-Server, damit die Signatur auch nach Ablauf des Zertifikats gültig bleibt:

- DigiCert: `http://timestamp.digicert.com`
- GlobalSign: `http://timestamp.globalsign.com/tsa/r6advanced1`
- Sectigo: `http://timestamp.sectigo.com`

## Schritt 3: Upload und Distribution

### Option A: Direkter Upload (manuell)

```bash
# Via SCP/SFTP
scp launcher-signed.exe user@ltth.app:/var/www/html/downloads/launcher.exe

# Via FTP (FileZilla, WinSCP, etc.)
# Host: ltth.app
# Pfad: /downloads/launcher.exe
```

### Option B: Git-basiert

```bash
# Signierte Version zum Repo hinzufügen
git add launcher-signed.exe
git commit -m "Update cloud launcher v1.0.1 (signed)"
git push

# GitHub Actions oder manuell auf Server deployen
```

### Option C: CDN/Object Storage

```bash
# AWS S3
aws s3 cp launcher-signed.exe s3://ltth-downloads/launcher.exe --acl public-read

# Azure Blob Storage
az storage blob upload --account-name ltth --container-name downloads \
  --name launcher.exe --file launcher-signed.exe --content-type application/x-msdownload
```

## Schritt 4: Download-Link aktualisieren

### Hauptseite (index.html)

```html
<!-- In /download.html oder /index.html -->
<a href="/downloads/launcher.exe" download>
    LTTH Launcher herunterladen
</a>
```

### Version auf Website aktualisieren

```html
<!-- Version anzeigen -->
<p>Aktuelle Version: <strong>1.0.1</strong></p>
<p>Größe: <strong>6.8 MB</strong></p>
<p>Signiert: <strong>✓ Ja</strong></p>
```

## Schritt 5: Benutzer informieren

### Ankündigung

**Titel**: "Neuer Cloud Launcher verfügbar - Weißes Fenster behoben!"

**Text**:
```
Der neue LTTH Cloud Launcher v1.0.1 ist ab sofort verfügbar!

✅ Behebt das White-Screen-Problem
✅ Automatische Updates vom Repository
✅ Code-signiert (keine SmartScreen-Warnung)
✅ Nur 6.8 MB Download

Download: https://ltth.app/downloads/launcher.exe

Neue Features:
• Base64-Encoding für stabile Anzeige
• Cloud-Update-Mechanismus (lädt immer ltth_latest.zip)
• Verbesserte Fehlerbehandlung
• Deutsche und englische Oberfläche

Einfach herunterladen, ausführen und loslegen!
```

## Wartung & Updates

### Neue Launcher-Version veröffentlichen

1. **Code aktualisieren**
   ```bash
   # Version in main.go erhöhen
   vim launcher/main.go
   # Zeile 36: AppVersion = "1.0.2"
   ```

2. **Bauen**
   ```bash
   ./build-cloud-launcher.sh
   ```

3. **Signieren**
   ```bash
   signtool sign ... launcher.exe
   ```

4. **Hochladen**
   ```bash
   scp launcher.exe server:/var/www/html/downloads/
   ```

5. **README aktualisieren**
   ```bash
   vim launcher/README.md
   # Changelog erweitern
   ```

### LTTH selbst aktualisieren

1. **Neue Version erstellen**
   ```bash
   # In app/1.2.1/
   zip -r ../ltth_1.2.1.zip ltth_1.2.1/
   ```

2. **Als latest markieren**
   ```bash
   cp ltth_1.2.1.zip ltth_latest.zip
   ```

3. **version.json aktualisieren**
   ```json
   {
     "version": "1.2.1",
     "releaseDate": "2025-12-11",
     "changelog": { ... }
   }
   ```

4. **Pushen**
   ```bash
   git add app/ltth_latest.zip version.json
   git commit -m "Release LTTH v1.2.1"
   git push
   ```

5. **Launcher benachrichtigt Benutzer automatisch!**

## Checkliste für Release

- [ ] Launcher gebaut (`./build-cloud-launcher.sh`)
- [ ] Code signiert (mit Zertifikat)
- [ ] Signatur verifiziert (`signtool verify`)
- [ ] Auf Server hochgeladen (`/downloads/launcher.exe`)
- [ ] Download-Link getestet
- [ ] Version auf Website aktualisiert
- [ ] Changelog aktualisiert
- [ ] Benutzer informiert (Discord, Email, etc.)
- [ ] GitHub Release erstellt (optional)

## Monitoring

### Download-Statistiken überwachen

```bash
# Server-Logs analysieren
grep "launcher.exe" /var/log/nginx/access.log | wc -l

# Download-Zähler (falls vorhanden)
SELECT COUNT(*) FROM downloads WHERE file = 'launcher.exe';
```

### Fehlerberichte sammeln

- GitHub Issues: https://github.com/Loggableim/ltth.app/issues
- Launcher-Logs: Benutzer senden `%LOCALAPPDATA%\LTTH\launcher.log`

## Support

Bei Fragen oder Problemen:
- **GitHub Issues**: https://github.com/Loggableim/ltth.app/issues
- **Email**: support@ltth.app
- **Dokumentation**: https://ltth.app/docs.html

## Lizenz

MIT License - Siehe [../LICENSE](../LICENSE)
