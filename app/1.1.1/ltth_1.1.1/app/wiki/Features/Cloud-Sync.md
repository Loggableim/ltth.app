# Cloud Sync

> **Automatische Synchronisation aller User-Konfigurationen mit Cloud-Speichern**

## 📋 Übersicht

Cloud Sync ist ein optionales Feature, das die automatische Synchronisation aller User-Konfigurationen mit Cloud-Speicherdiensten wie OneDrive, Google Drive und Dropbox ermöglicht. Die Synchronisation erfolgt bidirektional und vollständig transparent im Hintergrund.

## ✨ Hauptmerkmale

### Vollständig optional
- Standardmäßig **deaktiviert** - der User muss Sync bewusst aktivieren
- Jederzeit aktivierbar/deaktivierbar ohne Datenverlust
- Lokale Daten bleiben bei Deaktivierung unberührt

### Unterstützte Cloud-Anbieter
- **Microsoft OneDrive**
- **Google Drive**
- **Dropbox**

### Synchronisierte Daten
Das System synchronisiert automatisch alle Dateien im `user_configs/` Verzeichnis:
- ✅ User-Settings (alle Einstellungen)
- ✅ Plugin-Konfigurationen
- ✅ TTS-Profile und Stimmen-Zuweisungen
- ✅ Flow-Automationen (IFTTT)
- ✅ HUD-Layouts (ClarityHUD, Goals, etc.)
- ✅ Emoji-Mappings
- ✅ Custom-Assets
- ✅ Soundboard-Konfigurationen
- ✅ Alle anderen persistenten Daten

### Bidirektionale Synchronisation
- **Local → Cloud**: Lokale Änderungen werden automatisch hochgeladen
- **Cloud → Local**: Cloud-Änderungen werden automatisch übernommen
- **Echtzeit**: File-Watcher überwachen beide Verzeichnisse kontinuierlich

### Intelligente Konfliktlösung
- Timestamp-basierte Entscheidung
- Neuere Datei gewinnt automatisch
- Keine manuellen Eingriffe erforderlich
- Statistiken über gelöste Konflikte

### Maximale Datensicherheit
- **Atomare Schreibvorgänge**: Verhindert Datenverlust bei Schreibfehlern
- **Kein Datenverlust**: Selbst bei Fehlern bleiben lokale Daten erhalten
- **Keine direkten API-Calls**: Nutzt nur lokale Ordner-Synchronisation
- **Volle Kontrolle**: Alle Daten bleiben in deinem Cloud-Speicher

## 🚀 Verwendung

### Aktivierung

1. Öffne **Settings** in der Sidebar
2. Scrolle zum Bereich **"Cloud Sync (Optional)"**
3. Klicke auf **"Auswählen"**
4. Gib den vollständigen Pfad zu deinem Cloud-Ordner ein
5. Klicke auf **"Cloud Sync aktivieren"**

**Beispiel-Pfade:**
```
Windows OneDrive:   C:\Users\DeinName\OneDrive\TikTokHelper
macOS Google Drive: /Users/DeinName/Google Drive/TikTokHelper
Linux Dropbox:      /home/username/Dropbox/TikTokHelper
```

### Status-Übersicht

Nach der Aktivierung werden folgende Informationen angezeigt:

| Information | Beschreibung |
|------------|--------------|
| **Status** | Ob Cloud Sync aktiv ist |
| **Letzte Synchronisation** | Zeitpunkt des letzten Syncs |
| **Dateien hochgeladen** | Anzahl hochgeladener Dateien |
| **Dateien heruntergeladen** | Anzahl heruntergeladener Dateien |
| **Konflikte gelöst** | Automatisch gelöste Konflikte |
| **Erfolgreiche Syncs** | Gesamtzahl erfolgreicher Syncs |

### Manueller Sync

Du kannst jederzeit einen manuellen Sync triggern:
- Klicke auf **"Manueller Sync"**
- Nützlich nach großen Änderungen
- Zeigt sofortiges Feedback

### Deaktivierung

1. Klicke auf **"Cloud Sync deaktivieren"**
2. Bestätige die Aktion
3. Die Synchronisation wird gestoppt
4. **Lokale Daten bleiben unberührt**

## 🔧 Technische Details

### Funktionsweise

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│  Local Storage  │ ←─────→ │  Sync Engine     │ ←─────→ │  Cloud Folder   │
│  user_configs/  │  Watch  │  (File Watcher)  │  Watch  │  (OneDrive/etc) │
└─────────────────┘         └──────────────────┘         └─────────────────┘
                                      │
                                      ↓
                            ┌──────────────────┐
                            │  Timestamp-Based │
                            │  Conflict Mgmt   │
                            └──────────────────┘
```

### Sync-Prozess

1. **Initialer Sync beim Start**
   - Vergleicht alle Dateien in beiden Verzeichnissen
   - Lädt neuere Cloud-Dateien herunter
   - Lädt neuere lokale Dateien hoch
   - Löst Konflikte automatisch

2. **Echtzeit-Überwachung**
   - File-Watcher auf lokalem Verzeichnis
   - File-Watcher auf Cloud-Verzeichnis
   - Debounced Synchronisation (1 Sekunde)
   - Verhindert Sync-Schleifen

3. **Konfliktlösung**
   - Vergleich der Timestamps (`mtime`)
   - Neuere Datei überschreibt ältere
   - Konflikte werden protokolliert

### Sicherheitsaspekte

#### Keine Cloud-API-Aufrufe
- Das Tool macht **keine direkten API-Aufrufe** an Cloud-Anbieter
- Nutzt ausschließlich lokale Ordner-Synchronisation
- Cloud-Anbieter übernehmen die eigentliche Cloud-Synchronisation

#### Datensicherheit
- **Atomare Schreibvorgänge**: Temporäre Dateien + Rename
- **Kein Datenverlust**: Fehlerbehandlung bei jedem Schritt
- **Timestamp-Preservierung**: Für korrekte Konfliktlösung

#### Datenschutz
- Alle Daten bleiben in deinem Cloud-Speicher
- Keine Übertragung an Dritte
- Volle Kontrolle über deine Daten

## 📊 Logging

Alle Sync-Operationen werden im Terminal protokolliert:

```log
[CloudSync] Initializing cloud sync engine...
[CloudSync] Configuration loaded: enabled=false, cloudPath=not set
[CloudSync] Enabling sync with cloud path: /path/to/cloud
[CloudSync] Starting initial sync...
[CloudSync] Initial sync completed: 5 uploaded, 0 downloaded, 0 conflicts resolved
[CloudSync] Starting file watchers...
[CloudSync] Cloud sync enabled successfully
[CloudSync] New local file, uploaded to cloud: test-config.json
[CloudSync] Cloud change detected, downloaded to local: settings.json
```

## ❓ Troubleshooting

### Cloud Sync lässt sich nicht aktivieren

**Problem**: Der "Cloud Sync aktivieren" Button bleibt deaktiviert oder die Aktivierung schlägt fehl.

**Lösung**:
1. Überprüfe, ob der angegebene Pfad existiert
2. Stelle sicher, dass du Schreib-/Leserechte hast
3. Prüfe, ob der Cloud-Client (OneDrive/Google Drive/Dropbox) läuft
4. Validiere den Pfad mit dem "Auswählen" Button

### Dateien werden nicht synchronisiert

**Problem**: Änderungen werden nicht zwischen lokal und Cloud synchronisiert.

**Lösung**:
1. **Warte kurz**: Sync hat 1 Sekunde Debounce-Zeit
2. **Prüfe Logs**: Überprüfe Console-Output für Fehler
3. **Manueller Sync**: Trigger einen manuellen Sync
4. **Cloud-Client prüfen**: Stelle sicher, dass der Cloud-Client läuft

### Viele Konflikte

**Problem**: Die Statistik zeigt viele Konflikte.

**Lösung**:
- Konflikte werden automatisch gelöst (neuere Datei gewinnt)
- Normal bei gleichzeitiger Nutzung auf mehreren Geräten
- Überprüfe, ob nur ein Gerät aktiv schreibt
- Bei Bedarf: Deaktiviere Sync, lösche Cloud-Ordner, aktiviere neu

### Performance-Probleme

**Problem**: Das Tool läuft langsamer mit aktiviertem Cloud Sync.

**Lösung**:
- File-Watcher sind ressourcenschonend
- Nur geänderte Dateien werden synchronisiert
- Bei Problemen: Deaktiviere Sync temporär
- Überprüfe Cloud-Client Performance

## 💡 Best Practices

1. **Dedizierter Ordner**: Erstelle einen separaten Ordner für TikTok Helper
2. **Regelmäßige Backups**: Cloud-Sync ersetzt keine Backups
3. **Teste zuerst**: Aktiviere Sync erst nach erfolgreicher Konfiguration
4. **Überwache Statistiken**: Behalte Sync-Stats im Auge
5. **Bei Problemen deaktivieren**: Deaktiviere Sync bei Problemen
6. **Ein Gerät aktiv**: Nutze nicht gleichzeitig auf mehreren Geräten

## 🔗 API-Endpunkte

Für Entwickler stehen folgende API-Endpunkte zur Verfügung:

| Endpunkt | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/cloud-sync/status` | GET | Status abrufen |
| `/api/cloud-sync/enable` | POST | Cloud Sync aktivieren |
| `/api/cloud-sync/disable` | POST | Cloud Sync deaktivieren |
| `/api/cloud-sync/manual-sync` | POST | Manuellen Sync durchführen |
| `/api/cloud-sync/validate-path` | POST | Cloud-Pfad validieren |

Details siehe [API-Reference](../API-Reference.md).

## 📚 Weitere Informationen

- **Technische Dokumentation**: [CLOUD_SYNC_DOCUMENTATION.md](../../CLOUD_SYNC_DOCUMENTATION.md)
- **Entwickler-Guide**: [Entwickler-Leitfaden](../Entwickler-Leitfaden.md)
- **Konfiguration**: [Konfiguration](../Konfiguration.md)

---

**Version**: 1.0.0  
**Letzte Aktualisierung**: 2025-11-17
