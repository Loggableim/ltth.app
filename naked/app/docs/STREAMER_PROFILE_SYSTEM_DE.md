# Streamer-Profile System - Benutzerhandbuch

## Übersicht

Das Streamer-Profile System ermöglicht es mehreren Streamern, dieselbe LTTH-Installation zu nutzen, wobei jeder Streamer seine eigenen komplett unabhängigen Einstellungen und Daten hat.

## Wichtige Konzepte

### Streamer-Profil vs. Viewer-Profil

- **Streamer-Profil** (User Profile): Die Konfiguration und Datenbank eines Streamers
  - Jeder Streamer hat eine eigene `.db` Datei
  - Enthält: Einstellungen, API-Keys, Viewer-XP-Daten, etc.
  - Beispiel: `streamer1.db`, `streamer2.db`

- **Viewer-Profil**: Die XP/Level-Daten eines einzelnen Zuschauers
  - Gespeichert in der `viewer_profiles` Tabelle
  - Ist Teil des Streamer-Profils
  - Ein Viewer "alice" bei Streamer1 ist komplett unabhängig von "alice" bei Streamer2

## Wie das System funktioniert

### Daten-Isolation

```
Streamer-Profil "streamer1":
├── Datei: user_configs/streamer1.db
├── Viewer XP:
│   ├── alice: Level 5, 1200 XP
│   ├── bob: Level 3, 600 XP
│   └── charlie: Level 8, 3000 XP
└── Einstellungen: API-Keys, Plugin-Configs, etc.

Streamer-Profil "streamer2":
├── Datei: user_configs/streamer2.db
├── Viewer XP:
│   ├── alice: Level 2, 200 XP  ← Unabhängig von "alice" bei streamer1!
│   ├── dave: Level 10, 5000 XP
│   └── eve: Level 1, 50 XP
└── Einstellungen: Eigene API-Keys, eigene Configs, etc.
```

### Speicherort (überlebt Updates!)

Die Profile werden in einem systemweiten Verzeichnis gespeichert:

- **Windows**: `%LOCALAPPDATA%\pupcidslittletiktokhelper\user_configs\`
- **macOS**: `~/Library/Application Support/pupcidslittletiktokhelper/user_configs/`
- **Linux**: `~/.local/share/pupcidslittletiktokhelper/user_configs/`

**Wichtig**: Dieses Verzeichnis ist AUSSERHALB des Anwendungsordners und überlebt daher alle Updates!

## Profil wechseln

### ⚠️ WICHTIG: Neustart erforderlich!

Wenn Sie das Profil wechseln, passiert folgendes:

1. **Schritt 1**: Profil-Auswahl wird gespeichert
2. **Schritt 2**: Anwendung muss neu gestartet werden
3. **Schritt 3**: Beim Neustart wird die Datenbank des neuen Profils geladen

**Warum ist ein Neustart nötig?**
- Die Datenbank wird beim Start der Anwendung geladen
- Alle Module (Plugins, TikTok-Connector, etc.) verwenden diese Datenbank
- Ein "Hot-Swap" könnte zu Datenverlust führen
- Neustart ist die sichere Methode

### 🚀 Automatischer Neustart (Optional)

Sie können den Neustart nach einem Profilwechsel automatisieren:

1. Öffnen Sie die Browser-Konsole (F12)
2. Führen Sie folgenden Befehl aus:
   ```javascript
   localStorage.setItem('profile_autoRestart', 'true')
   ```
3. Ab jetzt startet die Anwendung nach einem Profilwechsel automatisch nach 5 Sekunden neu

**Automatischen Neustart deaktivieren**:
```javascript
localStorage.removeItem('profile_autoRestart')
```

**So funktioniert es**:
- Nach dem Profilwechsel erscheint ein Countdown (5 Sekunden)
- Sie können den Countdown abbrechen, falls nötig
- Oder Sie warten einfach, und die Anwendung startet automatisch neu

### Profilwechsel Schritt-für-Schritt

```
1. Aktuelles Profil: streamer1
   └── Dashboard zeigt: Viewer XP Daten von streamer1

2. Profil wechseln zu: streamer2
   └── System speichert: "Nächstes Profil = streamer2"
   └── Warnung: "Neustart erforderlich"
   └── WICHTIG: Datenbank ist noch streamer1!

3. Anwendung neu starten
   └── System lädt: user_configs/streamer2.db
   └── Dashboard zeigt: Viewer XP Daten von streamer2 ✓
```

## Häufige Probleme und Lösungen

### Problem 1: "Viewer XP wird zwischen Profilen geteilt"

**Symptom**: Viewer "alice" hat in beiden Profilen dasselbe Level

**Ursache**: Profil wurde gewechselt, aber Anwendung nicht neu gestartet

**Lösung**:
1. Prüfen Sie, welches Profil aktiv geladen ist (im Header sichtbar)
2. Starten Sie die Anwendung neu
3. Überprüfen Sie, ob das richtige Profil geladen wurde

### Problem 2: "Viewer XP geht nach Update verloren"

**Symptom**: Nach einem Update sind alle XP-Daten weg

**Ursache**: Daten waren in alten Versionen im App-Verzeichnis gespeichert

**Lösung**:
1. Prüfen Sie den Speicherort: `user_configs/` Verzeichnis
2. Wenn alte Daten vorhanden: Migration durchführen
3. In neueren Versionen automatisch im richtigen Verzeichnis

**Migration prüfen**:
```
Alte Version: app/database.db (wird bei Update gelöscht) ❌
Neue Version: user_configs/<profil>.db (überlebt Updates) ✓
```

### Problem 3: "Ich sehe nicht, welches Profil geladen ist"

**Symptom**: Unsicherheit, ob richtiges Profil aktiv ist

**Lösung**:
1. Schauen Sie in den Header der Anwendung
2. Dort sollte das aktuelle Profil angezeigt werden
3. Bei Profilwechsel ohne Neustart: Warnung-Badge sichtbar

## Best Practices

### Für einzelne Streamer

1. **Erstellen Sie ein Profil mit Ihrem Streamer-Namen**
2. **Nutzen Sie dieses Profil konsistent**
3. **Sichern Sie Ihr Profil regelmäßig** (Backup-Funktion)

### Für geteilte Installationen

1. **Jeder Streamer bekommt sein eigenes Profil**
2. **Profil wechseln → Neustart → Weiterarbeiten**
3. **Nicht vergessen**: Nach Profilwechsel IMMER neu starten!

### Vor Updates

1. **Backup erstellen** über Admin-Panel
2. **Profil-Verzeichnis notieren**: `user_configs/`
3. **Nach Update**: Daten sollten automatisch vorhanden sein

## Technische Details

### Dateistruktur

```
user_configs/
├── .active_profile        ← Name des aktiven Profils
├── streamer1.db           ← Komplette Datenbank von Streamer1
├── streamer1.db-wal       ← SQLite Log-Datei
├── streamer1.db-shm       ← SQLite Shared Memory
├── streamer2.db           ← Komplette Datenbank von Streamer2
├── streamer2.db-wal
└── streamer2.db-shm
```

### Was ist in einer Profil-Datenbank?

Jede `.db` Datei enthält:

- ✓ Viewer XP Daten (`viewer_profiles` Tabelle)
- ✓ XP Transaktionen (`xp_transactions`)
- ✓ Badges und Level
- ✓ Tägliche Aktivität und Streaks
- ✓ Plugin-Einstellungen
- ✓ API-Keys
- ✓ TikTok-Verbindungsdaten
- ✓ Alert-Konfigurationen
- ✓ Alle anderen Einstellungen

**Alles in EINER Datei = Einfaches Backup!**

### Warum keine `streamer_id` Spalte?

In anderen Systemen gibt es oft eine `streamer_id` Spalte in jeder Tabelle:

```sql
-- Andere Systeme:
CREATE TABLE viewer_profiles (
    username TEXT,
    streamer_id TEXT,  ← Zusätzliche Spalte
    xp INTEGER,
    ...
);
```

**LTTH nutzt einen besseren Ansatz**:

```sql
-- LTTH:
CREATE TABLE viewer_profiles (
    username TEXT PRIMARY KEY,
    xp INTEGER,
    ...
);
-- Isolierung durch SEPARATE .db Dateien!
```

**Vorteile**:
- ✓ Einfachere Queries (keine JOIN auf streamer_id nötig)
- ✓ Bessere Performance (kleinere Indizes)
- ✓ Klare Trennung (physisch separate Dateien)
- ✓ Einfaches Backup (eine Datei = ein Profil)
- ✓ Kein Risiko von Datenlecks zwischen Profilen

## API-Endpunkte

Für Entwickler und Admin-Tools:

```
GET  /api/profiles              # Liste aller Profile
GET  /api/profiles/active       # Aktuell aktives Profil
POST /api/profiles              # Neues Profil erstellen
POST /api/profiles/switch       # Profil wechseln (erfordert Neustart!)
DELETE /api/profiles/:username  # Profil löschen
POST /api/profiles/:username/backup  # Profil-Backup erstellen
```

## Zusammenfassung

### ✅ Ja, Daten sind isoliert!

- Jedes Streamer-Profil = eigene `.db` Datei
- Viewer XP komplett unabhängig zwischen Profilen
- Keine gemeinsamen Daten

### ✅ Ja, Daten überleben Updates!

- Speicherort außerhalb des App-Verzeichnisses
- System-weites `user_configs/` Verzeichnis
- Migration von alten Versionen automatisch

### ⚠️ Wichtig zu beachten

- **Profil wechseln = Neustart erforderlich**
- **Nicht vergessen**: Immer richtig neu starten
- **Bei Problemen**: Profil im Header überprüfen

## Hilfe und Support

Bei Problemen:

1. **Prüfen Sie den Speicherort**: Sind die `.db` Dateien im `user_configs/` Verzeichnis?
2. **Prüfen Sie das aktive Profil**: Steht im Header das richtige Profil?
3. **Nach Profilwechsel**: Haben Sie die Anwendung neu gestartet?
4. **Backup-Check**: Existiert Ihr Profil noch in `user_configs/`?

## Version

Dieser Guide gilt für LTTH Version 1.2.1 und höher.

Ältere Versionen hatten möglicherweise Daten im App-Verzeichnis gespeichert. 
Diese sollten bei der ersten Verwendung der neuen Version automatisch migriert werden.
