# SiliconFlow API Key Centralization - Implementation Summary

## Problem
Der Benutzer meldete zwei Probleme:
1. **TTS Engine nicht verfügbar**: `Engine not available - selectedEngine: fishspeech`
2. **API Key nicht zentralisiert**: Der SiliconFlow API Key wurde separat für Fish Speech TTS (`tts_fishspeech_api_key`) und StreamAlchemy (`streamalchemy_siliconflow_api_key`) gespeichert, obwohl er für alle SiliconFlow APIs genutzt wird.

## Lösung

### 1. Zentraler API Key
Ein neuer zentraler `siliconflow_api_key` Setting wurde eingeführt, der von beiden Plugins verwendet wird:
- **TTS Plugin**: Fish Speech 1.5 TTS Engine
- **StreamAlchemy Plugin**: FLUX.1-schnell Bildgenerierung

### 2. Abwärtskompatibilität
Die Implementierung prüft mehrere Keys in dieser Priorität:
1. `siliconflow_api_key` (neu, zentral)
2. `tts_fishspeech_api_key` (legacy TTS)
3. `streamalchemy_siliconflow_api_key` (legacy StreamAlchemy)

Beim Speichern eines neuen Keys wird sowohl der zentrale als auch der Legacy-Key aktualisiert, um volle Kompatibilität zu gewährleisten.

### 3. Geänderte Dateien

#### TTS Plugin (`app/plugins/tts/main.js`)
- `_loadConfig()`: Lädt von zentralem Key mit Fallback
- API Key Speicherlogik: Schreibt in zentralen und Legacy-Key

#### StreamAlchemy Plugin (`app/plugins/streamalchemy/index.js`)
- Neue Methode `getSiliconFlowApiKey()`: Lädt zentral mit Fallback
- `init()`: Übergibt `siliconFlowApiKey` an FusionService
- API Key Speicherlogik: Schreibt in zentralen und Legacy-Key

#### UI Dateien
- **dashboard.html**: Label geändert zu "SiliconFlow API Key" mit Beschreibung für TTS + Bildgenerierung
- **dashboard.js**: Speichert in zentralen Key, prüft beide Keys beim Laden
- **streamalchemy/ui.html**: Hinweis hinzugefügt, dass Key mit TTS geteilt wird

### 4. Tests
Neue Test-Suite erstellt: `app/test/siliconflow-api-key-centralization.test.js`
- ✅ Zentrale Key-Priorität
- ✅ Fallback zu Legacy TTS Key
- ✅ Fallback zu Legacy StreamAlchemy Key
- ✅ Null-Rückgabe wenn kein Key
- ✅ Speichern in beide Keys

Alle bestehenden Tests bestanden:
- ✅ FishSpeech Integration Tests (10/10)
- ✅ TTS API Key Update Tests (8/8)
- ✅ SiliconFlow Centralization Tests (5/5)

### 5. Sicherheit
- ✅ Code Review: Keine Probleme gefunden
- ✅ CodeQL Scan: Keine Sicherheitslücken gefunden

## Ergebnis

### Vor der Änderung
```
❌ TTS Engine nicht verfügbar: fishspeech
❌ API Key separat für TTS und StreamAlchemy
❌ Verwirrende UI-Labels
```

### Nach der Änderung
```
✅ TTS FishSpeech Engine korrekt initialisiert
✅ Zentraler SiliconFlow API Key für beide Plugins
✅ Klare UI-Labels mit Beschreibung der gemeinsamen Nutzung
✅ Vollständig abwärtskompatibel
✅ Alle Tests bestanden
✅ Keine Sicherheitsprobleme
```

## Migration
Keine manuelle Migration erforderlich! Die Implementierung:
1. Prüft automatisch alle Key-Varianten
2. Migriert beim nächsten Speichern automatisch zum zentralen Key
3. Behält Legacy-Keys für Kompatibilität bei

## Verwendung

### Für Benutzer
1. Dashboard öffnen → TTS API Keys
2. Einen SiliconFlow API Key eingeben (wird für TTS + Bildgenerierung verwendet)
3. Speichern → Key wird zentral gespeichert

### Für Entwickler
```javascript
// TTS Plugin
const db = this.api.getDatabase();
const apiKey = db.getSetting('siliconflow_api_key') || 
               db.getSetting('tts_fishspeech_api_key') || 
               db.getSetting('streamalchemy_siliconflow_api_key');

// StreamAlchemy Plugin  
const apiKey = this.getSiliconFlowApiKey(); // Verwendet gleiche Logik
```

## Getestete Szenarien
1. ✅ Neue Installation mit zentralem Key
2. ✅ Update von Legacy TTS Key
3. ✅ Update von Legacy StreamAlchemy Key
4. ✅ Gemischte Legacy Keys
5. ✅ Kein Key vorhanden

## Dokumentation
- Inline Code-Kommentare hinzugefügt
- UI-Beschreibungen aktualisiert
- Test-Suite als Referenz

---

**Status**: ✅ Vollständig implementiert und getestet
**Datum**: 2025-12-12
**Branch**: `copilot/fix-tts-engine-error`
