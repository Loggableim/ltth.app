# User Configuration Storage - Überlebende Updates

## Übersicht

Ab dieser Version werden alle Benutzereinstellungen, Profile, TTS-Zuweisungen, Geschenk-Animationen, Flows und andere Konfigurationen **außerhalb des Anwendungsverzeichnisses** gespeichert. Dies stellt sicher, dass deine Einstellungen bei Updates **automatisch erhalten bleiben**.

## Standard-Speicherorte

Die Anwendung verwendet plattformspezifische Standard-Speicherorte:

### Windows
```
%LOCALAPPDATA%\pupcidslittletiktokhelper
Beispiel: C:\Users\DeinName\AppData\Local\pupcidslittletiktokhelper
```

### macOS
```
~/Library/Application Support/pupcidslittletiktokhelper
Beispiel: /Users/DeinName/Library/Application Support/pupcidslittletiktokhelper
```

### Linux
```
~/.local/share/pupcidslittletiktokhelper
Beispiel: /home/DeinName/.local/share/pupcidslittletiktokhelper
```

## Was wird gespeichert?

In diesem Verzeichnis findest du:

- **user_configs/** - Alle Benutzerprofile und Datenbanken
  - ⚡ **API-Keys** (Eulerstream, ElevenLabs, Google TTS, OpenAI, Speechify)
  - TTS-Voice-Zuweisungen
  - Geschenk-Sounds und Animationen
  - Alert-Konfigurationen
  - HUD-Element-Positionen
  - Flow-Automatisierungen
  - Plugin-Konfigurationen
  
- **user_data/** - Zusätzliche Benutzerdaten
  - TikTok-Session-Informationen
  - Flow-Logs
  - Weitere temporäre Daten

- **uploads/** - Hochgeladene Dateien
  - Animationen
  - Benutzerdefinierte Assets

- **plugins/[plugin-name]/data/** - Plugin-spezifische Daten

## API-Keys und Authentifizierung bleiben erhalten! 🔐

Alle API-Keys und Authentifizierungsdaten werden sicher in der Datenbank gespeichert, die sich im persistenten Konfigurationsverzeichnis befindet:

**API-Keys:**
- **Eulerstream API Key** (`tiktok_euler_api_key`)
- **ElevenLabs API Key**
- **Google Cloud TTS API Key**
- **OpenAI API Key**
- **Speechify API Key**

**Authentifizierungsdaten:**
- **TikTok Session ID**

Diese Daten werden **NICHT** im Anwendungsverzeichnis gespeichert und bleiben daher bei Updates erhalten.

## Automatische Migration

Beim ersten Start nach dem Update werden deine vorhandenen Konfigurationen **automatisch** vom alten Speicherort (im Anwendungsverzeichnis) zum neuen persistenten Speicherort migriert. Du musst nichts tun!

## Eigenen Speicherort festlegen (Optional)

Du kannst einen benutzerdefinierten Speicherort festlegen, z.B. in einem Cloud-Ordner für automatische Backups:

### Über die Benutzeroberfläche

1. Öffne **Settings** (Einstellungen) in der Seitenleiste
2. Scrolle zu **"Configuration Storage Location"**
3. Gib deinen gewünschten Pfad ein, z.B.:
   - `D:\Google Drive\pupcidslittletiktokhelper`
   - `C:\Users\DeinName\OneDrive\pupcidslittletiktokhelper`
   - `E:\Dropbox\pupcidslittletiktokhelper`
4. Klicke auf **"Set Path"**
5. **Starte die Anwendung neu**

### Zurück zum Standard

Um zum Standard-Speicherort zurückzukehren:

1. Öffne **Settings** → **"Configuration Storage Location"**
2. Klicke auf **"Reset to Default"**
3. **Starte die Anwendung neu**

## Cloud Backup (Empfohlen)

### Methode 1: Eigener Speicherort in Cloud-Ordner

Lege den Speicherort direkt in deinem Cloud-Ordner fest:
- Google Drive: `C:\Users\DeinName\Google Drive\pupcidslittletiktokhelper`
- OneDrive: `C:\Users\DeinName\OneDrive\pupcidslittletiktokhelper`
- Dropbox: `C:\Users\DeinName\Dropbox\pupcidslittletiktokhelper`

**Vorteil**: Automatische Cloud-Sicherung aller Einstellungen

### Methode 2: Cloud Sync Feature

Nutze das integrierte Cloud-Sync-Feature:
1. Öffne **Settings** → **Cloud Sync**
2. Aktiviere Cloud Sync
3. Wähle deinen Cloud-Ordner

Das System synchronisiert dann automatisch zwischen lokalem und Cloud-Speicher.

## Vorteile

✅ **Update-Sicher**: Deine Einstellungen überleben alle Updates  
✅ **Automatische Migration**: Keine manuelle Arbeit erforderlich  
✅ **Cloud-Backup**: Einfache Integration mit Cloud-Diensten  
✅ **Mehrere Profile**: Jedes Profil wird separat gespeichert  
✅ **Keine Datenverluste**: Konfigurationen sind sicher außerhalb der App  

## Fehlerbehebung

### "Pfad existiert nicht" Fehler

Stelle sicher, dass der Ordner existiert, bevor du ihn als benutzerdefinierten Pfad festlegst. Erstelle den Ordner manuell:

```
Windows: Rechtsklick → Neu → Ordner
```

### Einstellungen erscheinen nicht nach Update

1. Überprüfe, ob die Migration erfolgreich war (beim Start werden Meldungen angezeigt)
2. Schaue im Standard-Speicherort nach, ob die Dateien dort sind
3. Falls nötig, kopiere die alten Dateien manuell vom Backup

### Cloud-Ordner wird nicht synchronisiert

1. Stelle sicher, dass der Cloud-Dienst läuft
2. Überprüfe, ob der Pfad korrekt ist
3. Teste mit einem Neustart der Anwendung

## API für Entwickler

### Config Path Info abrufen
```javascript
GET /api/config-path
```

Antwort:
```json
{
  "success": true,
  "platform": "win32",
  "defaultConfigDir": "C:\\Users\\...\\AppData\\Local\\pupcidslittletiktokhelper",
  "customConfigDir": null,
  "activeConfigDir": "C:\\Users\\...\\AppData\\Local\\pupcidslittletiktokhelper",
  "isUsingCustomPath": false
}
```

### Benutzerdefinierten Pfad setzen
```javascript
POST /api/config-path/custom
Content-Type: application/json

{
  "path": "D:\\Google Drive\\pupcidslittletiktokhelper"
}
```

### Auf Standard zurücksetzen
```javascript
POST /api/config-path/reset
```

## Hinweise

⚠️ **Neustart erforderlich**: Änderungen am Speicherort erfordern einen Neustart der Anwendung  
⚠️ **Schreibrechte**: Stelle sicher, dass du Schreibrechte für den gewählten Ordner hast  
⚠️ **Cloud-Konflikte**: Bei Cloud-Ordnern kann es zu Synchronisations-Konflikten kommen, wenn die App auf mehreren Geräten läuft  

## Support

Bei Problemen oder Fragen:
- Überprüfe die Logs in der Konsole beim Start
- Schaue im Settings-Bereich nach der aktuellen Konfiguration
- Erstelle ein Issue auf GitHub mit Details zum Problem
