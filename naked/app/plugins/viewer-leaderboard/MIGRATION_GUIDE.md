# Plugin Migration Guide: Leaderboard & Viewer XP

## Migration zum Master-Plugin "viewer-leaderboard"

Dieses Dokument erklärt die Migration von den separaten Plugins `leaderboard` und `viewer-xp` zum kombinierten Master-Plugin `viewer-leaderboard`.

## 🎯 Warum das Master-Plugin?

Das neue `viewer-leaderboard` Master-Plugin bietet mehrere Vorteile:

1. **Keine Route-Konflikte**: Automatische Erkennung und Vermeidung von Duplikaten
2. **Einheitliche Verwaltung**: Ein Plugin statt zwei separate
3. **Optimierte Performance**: Shared Database-Zugriffe
4. **Nahtlose Integration**: Beide Systeme arbeiten zusammen
5. **Einfachere Updates**: Zentrale Wartung

## 📋 Migrationsschritte

### Option 1: Master-Plugin verwenden (Empfohlen)

1. **Deaktiviere die alten Plugins** im Dashboard:
   - `viewer-xp` → Deaktivieren
   - `leaderboard` → Deaktivieren

2. **Aktiviere das Master-Plugin**:
   - `viewer-leaderboard` → Aktivieren

3. **Alle Daten bleiben erhalten**:
   - XP-Daten werden aus der bestehenden Datenbank gelesen
   - Leaderboard-Daten bleiben persistent
   - Keine Datenmigration notwendig

4. **URLs bleiben identisch**:
   - Alle `/viewer-xp/*` URLs funktionieren weiter
   - Alle `/leaderboard/*` URLs funktionieren weiter
   - OBS-Overlays müssen nicht geändert werden

### Option 2: Einzelne Plugins weiter verwenden

Falls du nur eines der Systeme benötigst, kannst du die einzelnen Plugins weiterhin verwenden:

**Nur Viewer XP System:**
- `viewer-xp` → Aktiviert
- `leaderboard` → Deaktiviert
- `viewer-leaderboard` → Deaktiviert

**Nur Gifter Leaderboard:**
- `viewer-xp` → Deaktiviert
- `leaderboard` → Aktiviert
- `viewer-leaderboard` → Deaktiviert

**Beide Systeme zusammen (Empfohlen):**
- `viewer-xp` → Deaktiviert
- `leaderboard` → Deaktiviert
- `viewer-leaderboard` → Aktiviert ✅

## ⚠️ Wichtige Hinweise

### Route-Konflikte vermeiden

**NIEMALS gleichzeitig aktivieren:**
- ❌ `viewer-xp` + `viewer-leaderboard`
- ❌ `leaderboard` + `viewer-leaderboard`
- ❌ Alle drei zusammen

Das Master-Plugin erkennt aktive Standalone-Plugins und überspringt deren Initialisierung automatisch, aber es ist besser, sie komplett zu deaktivieren.

### Datenbank-Kompatibilität

- Alle drei Plugins nutzen die gleiche Datenbank
- Keine Datenmigration erforderlich
- Wechsel zwischen Plugins ist jederzeit möglich
- Daten gehen beim Wechsel **nicht** verloren

### OBS-Overlays

Alle Overlay-URLs funktionieren unabhängig vom verwendeten Plugin:

**Viewer XP Overlays:**
```
http://localhost:3000/overlay/viewer-xp/xp-bar
http://localhost:3000/overlay/viewer-xp/leaderboard
http://localhost:3000/overlay/viewer-xp/level-up
http://localhost:3000/overlay/viewer-xp/user-profile
```

**Leaderboard Overlays:**
```
http://localhost:3000/leaderboard/overlay
```

### Chat-Befehle (GCCE)

Die GCCE-Integration funktioniert mit allen Varianten:
- `/xp`, `/rank`, `/profile`, `/stats`, `/top`, `/leaderboard`
- `/coins`, `/currency`, `/richest`

## 🔍 Fehlerbehebung

### "Route already registered" Fehler

**Problem:** Zwei Plugins versuchen, die gleichen Routes zu registrieren.

**Lösung:**
1. Deaktiviere alle drei Plugins
2. Starte den Server neu
3. Aktiviere nur das gewünschte Plugin

### Daten werden nicht angezeigt

**Problem:** Plugin zeigt keine Daten an.

**Lösung:**
1. Prüfe, ob das richtige Plugin aktiviert ist
2. Checke Server-Logs für Fehler
3. Verifiziere Datenbank-Zugriffsrechte
4. Teste mit Preview/Test-Modus

### Performance-Probleme

**Problem:** System läuft langsam.

**Lösung:**
- Verwende das Master-Plugin statt einzelne Plugins
- Optimierte Shared Database-Zugriffe
- Weniger Event-Handler durch Deduplication

## 📊 Feature-Vergleich

| Feature | viewer-xp | leaderboard | viewer-leaderboard |
|---------|-----------|-------------|-------------------|
| XP System | ✅ | ❌ | ✅ |
| Level & Badges | ✅ | ❌ | ✅ |
| Gifter Leaderboard | ❌ | ✅ | ✅ |
| Session Tracking | ❌ | ✅ | ✅ |
| GCCE Commands | ✅ | ❌ | ✅ |
| IFTTT Integration | ✅ | ❌ | ✅ |
| Multiple Themes | ❌ | ✅ (5 Themes) | ✅ (5 Themes) |
| Currency System | ✅ | ✅ | ✅ |
| Watch Time | ✅ | ❌ | ✅ |
| Route Conflicts | Möglich | Möglich | Nein ✅ |

## 🚀 Empfehlung

**Für neue Installationen:**
- Verwende direkt `viewer-leaderboard`
- Aktiviere keine Standalone-Plugins

**Für bestehende Installationen:**
- Wechsle zu `viewer-leaderboard` wenn du beide Systeme nutzt
- Behalte Standalone-Plugins wenn du nur eines brauchst
- Migration ist jederzeit ohne Datenverlust möglich

## 📝 Support

Bei Fragen oder Problemen:
1. Prüfe Server-Logs (`app/logs/`)
2. Teste mit Preview/Test-Modus
3. Erstelle ein Issue im GitHub-Repository
4. Checke die Plugin-README-Dateien

---

**Letzte Aktualisierung:** 2025-12-16  
**Plugin-Version:** viewer-leaderboard v1.0.0
