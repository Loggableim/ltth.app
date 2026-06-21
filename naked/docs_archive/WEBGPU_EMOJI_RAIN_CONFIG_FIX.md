# WebGPU Emoji Rain - Konfiguration Persistenz Fix

## Problem (behoben)

**Symptom:** Die Konfiguration des WebGPU Emoji Rain Plugins wurde bei jedem Neustart der Anwendung auf die Standardwerte zurückgesetzt. Alle benutzerdefinierten Einstellungen gingen verloren.

**Betroffene Einstellungen:**
- Emoji-Set (benutzerdefinierte Emojis)
- OBS HUD Auflösung (Breite/Höhe)
- FPS-Ziel
- Visuelle Effekte (Glow, Particles, Depth)
- Wind-Simulation (Stärke, Richtung)
- Bounce-Physik
- Farbmodi (Rainbow, Pixel)
- SuperFan Burst Einstellungen
- Toaster-Modus
- Alle anderen benutzerdefinierten Werte

## Ursache

Die `initializeEmojiRainDefaults()` Methode in der Datenbank wurde bei jedem App-Start ausgeführt und hatte einen Fehler in der Merge-Logik:

```javascript
// VORHER (FALSCH):
const migratedConfig = {
    ...defaultConfig,  // ❌ Standard-Werte zuerst
    // Nur einige wenige spezifische Felder wurden bewahrt
    ...(oldConfig.width_px && { width_px: oldConfig.width_px }),
    ...(oldConfig.emoji_set && { emoji_set: oldConfig.emoji_set }),
    // etc.
};
```

Diese Logik bedeutete:
1. **Alle** Standard-Werte werden zuerst eingesetzt
2. Nur **einige wenige** alte Werte werden explizit zurückgeschrieben
3. **Alle anderen** Benutzereinstellungen gehen verloren

## Lösung

Die Merge-Reihenfolge wurde korrigiert, sodass Benutzereinstellungen Priorität haben:

```javascript
// NACHHER (KORREKT):
const migratedConfig = {
    ...defaultConfig,     // Standards für fehlende Felder
    ...oldConfig,         // ✅ ALLE Benutzereinstellungen überschreiben Standards
    // Alte Feld-Namen werden zu neuen gemappt (falls nötig)
};
```

Diese Logik bedeutet:
1. Standard-Werte werden als Basis geladen
2. **Alle** Benutzereinstellungen überschreiben die Standards
3. Nur **fehlende** Felder werden mit Standards ergänzt
4. Alte Feld-Namen werden automatisch zu neuen migriert

## Was ändert sich für den Benutzer?

### ✅ Nach dem Fix:
- **Alle Einstellungen werden dauerhaft gespeichert**
- Konfiguration überlebt App-Neustarts
- Profil-spezifische Einstellungen bleiben erhalten
- Neue Features erhalten automatisch Standard-Werte
- Alte Feld-Namen werden automatisch migriert

### 📝 Hinweis:
Wenn Sie Ihre Einstellungen bereits vor dem Fix verloren haben, müssen Sie diese **einmal neu konfigurieren**. Danach bleiben alle Änderungen dauerhaft gespeichert.

## Technische Details

### Betroffene Dateien:
- `app/modules/database.js` - Zeile 1261-1295 (Merge-Logik)

### Test-Abdeckung:
8 automatische Tests decken folgende Szenarien ab:
1. ✅ Initialisierung mit Standard-Werten
2. ✅ Persistenz nach Update
3. ✅ Erhaltung nach Datenbank-Reload
4. ✅ Einstellungen über mehrere Neustarts
5. ✅ Neue Felder ohne Überschreiben alter Werte
6. ✅ Keine Reset auf Standards (kritischer Test)
7. ✅ Toaster-Modus Persistenz
8. ✅ SuperFan Burst Einstellungen Persistenz

### Getestet mit:
- Mehrfache Datenbank-Reloads
- Profil-Wechsel
- Migration von alten Konfigurationen
- Neue App-Installation vs. Upgrade

## Migration

Keine manuelle Migration erforderlich! Der Fix:
- Ist automatisch aktiv nach dem Update
- Bewahrt bestehende Konfigurationen
- Funktioniert mit allen Profilen
- Benötigt keine Benutzeraktion

## Changelog

**Version:** Mit PR #XXX integriert
**Datum:** 2025-12-26
**Typ:** Bugfix (Critical)
**Impact:** Hoch - Betrifft alle WebGPU Emoji Rain Nutzer

### Änderungen:
- Fix: Benutzereinstellungen werden jetzt korrekt gespeichert
- Fix: Merge-Logik respektiert Benutzer-Priorität
- Tests: 8 neue Tests für Config-Persistenz
- Docs: Diese Dokumentation

## Verwandte Informationen

- User Profile System: `app/modules/user-profiles.js`
- Config Path Manager: `app/modules/config-path-manager.js`
- WebGPU Emoji Rain Plugin: `app/plugins/webgpu-emoji-rain/`
- Test Suite: `app/test/webgpu-emoji-rain-config-persistence.test.js`

## Support

Bei Fragen oder Problemen:
1. Prüfen Sie, ob das Update installiert ist
2. Konfigurieren Sie Ihre Einstellungen neu (falls vor dem Fix verloren)
3. Erstellen Sie ein GitHub Issue mit Details, falls Probleme bestehen
