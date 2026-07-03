# LTTH Launcher - Konfigurationsmigration

## Übersicht

Dieses Dokument beschreibt, wie Benutzerkonfigurationen bei Updates geschützt und migriert werden.

## Konfigurationsschutz

### Automatische Sicherung

Bei jedem Update werden bestehende Konfigurationsdateien automatisch gesichert:

```
%LOCALAPPDATA%\LTTH\config\
├── .backup/
│   ├── 20241203-120000/
│   │   ├── config.json
│   │   ├── settings.json
│   │   └── user-preferences.json
│   └── 20241204-153000/
│       └── ...
├── config.json
└── settings.json
```

### Backup-Prozess

1. **Trigger:** Vor dem Entpacken einer neuen Version
2. **Backup-Ordner:** Zeitstempel-basiert (YYYYMMDD-HHMMSS)
3. **Inhalt:** Alle Nicht-versteckten Dateien im Config-Ordner
4. **Aufbewahrung:** Unbegrenzt (manuelle Löschung möglich)

```go
func backupConfig() error {
    backupDir := filepath.Join(config.ConfigPath, ".backup", 
                               time.Now().Format("20060102-150405"))
    os.MkdirAll(backupDir, 0755)
    
    entries, _ := os.ReadDir(config.ConfigPath)
    for _, entry := range entries {
        if !entry.IsDir() && !strings.HasPrefix(entry.Name(), ".") {
            // Kopiere Datei zum Backup
        }
    }
    return nil
}
```

## Geschützte Dateien

Diese Dateien werden **niemals** automatisch überschrieben:

| Datei | Beschreibung |
|-------|--------------|
| `user-config.json` | Benutzereinstellungen |
| `config.json` | Allgemeine Konfiguration |
| `settings.json` | App-Einstellungen |
| `*.db` | Datenbank-Dateien |
| `tokens.json` | API-Tokens (wenn vorhanden) |

## Migration bei Format-Änderungen

### Automatische Migration

Wenn sich das Config-Format zwischen Versionen ändert, sollte die Hauptanwendung (nicht der Launcher) die Migration durchführen.

**Empfohlenes Pattern in der App:**

```javascript
// Beim Start der App
function migrateConfig(config, currentVersion) {
    const configVersion = config.version || "1.0.0";
    
    if (semver.lt(configVersion, "1.1.0")) {
        // Migration von 1.0.x auf 1.1.0
        config.newFeatureEnabled = config.oldFeature ?? true;
        delete config.oldFeature;
    }
    
    if (semver.lt(configVersion, "1.2.0")) {
        // Migration auf 1.2.0
        // ...
    }
    
    config.version = currentVersion;
    return config;
}
```

### Migrations-Changelog

Dokumentiere Config-Änderungen in der `version.json`:

```json
{
    "version": "1.2.0",
    "changelog": {
        "1.2.0": {
            "changes": [
                "BREAKING: Renamed 'soundVolume' to 'audioVolume'"
            ],
            "configMigration": {
                "renamedFields": {
                    "soundVolume": "audioVolume"
                }
            }
        }
    }
}
```

## Benutzer-Bestätigung

### Wann ist eine Bestätigung nötig?

- **Nicht nötig:** Neue Felder hinzufügen, Felder umbenennen
- **Nötig:** Felder löschen, die Benutzereinstellungen enthalten

### UI für Bestätigung (zukünftig)

```
┌─────────────────────────────────────────────┐
│  Konfigurationsänderung                     │
├─────────────────────────────────────────────┤
│  Die neue Version ändert folgende           │
│  Einstellungen:                             │
│                                             │
│  • 'soundVolume' → 'audioVolume'            │
│  • 'legacyMode' wird entfernt               │
│                                             │
│  Deine aktuelle Konfiguration wird          │
│  vor der Migration gesichert.               │
│                                             │
│  [Backup ansehen]  [Abbrechen]  [Fortfahren]│
└─────────────────────────────────────────────┘
```

## Manuelles Backup/Restore

### Backup erstellen

1. Öffne den Logs-Ordner (Button "Logs")
2. Navigiere zu `%LOCALAPPDATA%\LTTH\config`
3. Kopiere den gesamten Ordner an einen sicheren Ort

### Backup wiederherstellen

1. Schließe die App
2. Kopiere die Backup-Dateien nach `%LOCALAPPDATA%\LTTH\config`
3. Starte die App neu

### Über den Launcher

```
Einstellungen > Konfig-Pfad
→ Zeigt den Pfad zur Konfiguration
```

## Export/Import (für Benutzer)

### Config exportieren

Die App sollte einen Export-Button bieten:

```javascript
function exportConfig() {
    const config = loadConfig();
    const blob = new Blob([JSON.stringify(config, null, 2)], 
                          {type: 'application/json'});
    // Download-Dialog
}
```

### Config importieren

```javascript
function importConfig(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const config = JSON.parse(e.target.result);
        // Validierung und Migration
        saveConfig(config);
    };
    reader.readAsText(file);
}
```

## Best Practices

1. **Versionierung:** Jede Config-Datei sollte eine `version` enthalten
2. **Rückwärtskompatibilität:** Neue Felder mit Defaults hinzufügen
3. **Keine Breaking Changes:** Wenn möglich, alte Felder beibehalten
4. **Dokumentation:** Änderungen im Changelog dokumentieren
5. **Testen:** Config-Migration automatisiert testen

## Troubleshooting

### Config wurde überschrieben

1. Prüfe `.backup`-Ordner für vorherige Versionen
2. Wähle das passende Backup (nach Zeitstempel)
3. Kopiere Dateien zurück

### Config ist korrupt

1. Lösche die fehlerhafte Datei
2. Starte die App neu (erstellt Defaults)
3. Oder: Wiederherstellen aus Backup

### Migration fehlgeschlagen

1. Prüfe App-Logs für Fehlermeldungen
2. Versuche manuelles Backup/Restore
3. Kontaktiere Support mit Fehlermeldung
