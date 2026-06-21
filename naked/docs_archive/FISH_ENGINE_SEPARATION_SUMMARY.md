# Fish.audio und SiliconFlow Engine Trennung - Implementierungs-Zusammenfassung

## Übersicht

Das Problem war, dass Fish.audio und SiliconFlow als eine Engine ("fishspeech") behandelt wurden, obwohl sie zwei separate, unabhängige TTS-Services sind:

- **Fish.audio**: Offizielle Fish.audio API (`https://api.fish.audio`) mit dem Fish Audio S1 Modell
- **SiliconFlow**: Separater Service, der Fish Speech 1.5 über seine API (`https://api.siliconflow.com`) anbietet

## Durchgeführte Änderungen

### 1. Neue SiliconFlow Engine Erstellt
**Datei**: `app/plugins/tts/engines/siliconflow-engine.js`

- OpenAI-kompatible API-Implementierung
- Endpoint: `https://api.siliconflow.com/v1/audio/speech`
- Modell: `fishaudio/fish-speech-1.5`
- Unterstützt Stimmen: `siliconflow-default`, `siliconflow-female`, `siliconflow-male`
- Speed-Kontrolle: 0.25 - 4.0
- Audio-Formate: MP3, WAV, OPUS, FLAC

### 2. Fish.audio Engine Klargestellt
**Datei**: `app/plugins/tts/engines/fishspeech-engine.js`

Die bestehende `fishspeech-engine.js` verwendet bereits korrekt die offizielle Fish.audio API:
- API-Endpoint: `https://api.fish.audio/v1/tts`
- Modell: Fish Audio S1 (neueste Generation)
- 64+ Emotionen unterstützt
- Stimmen: `fish-sarah`, `fish-egirl`, `fish-adrian`, etc.
- Prosody-Kontrolle (Pitch, Volume)

### 3. TTS Plugin Haupt-Datei Aktualisiert
**Datei**: `app/plugins/tts/main.js`

#### Engine-Definitionen
- `fishspeech` → `fishaudio` (offizielle Fish.audio API)
- Neu: `siliconflow` (SiliconFlow Fish Speech 1.5)

#### Konfiguration
```javascript
// Neue Config-Parameter
fishaudioApiKey: null,        // Fish.audio offizieller API-Key
siliconflowApiKey: null,      // SiliconFlow API-Key
enableFishAudioFallback: false,
enableSiliconFlowFallback: false
```

#### API-Key-Laden (Priorität)
**Fish.audio**:
1. `tts_fishaudio_api_key` (DB)
2. `fishaudio_api_key` (DB)

**SiliconFlow**:
1. `siliconflow_api_key` (DB - zentral für TTS + StreamAlchemy)
2. `tts_fishspeech_api_key` (DB - Legacy)
3. `streamalchemy_siliconflow_api_key` (DB - Legacy)

#### Fallback-Ketten Aktualisiert
Beide Engines sind jetzt unabhängig in den Fallback-Ketten:
```javascript
'fishaudio': ['siliconflow', 'openai', 'tiktok', 'google', ...]
'siliconflow': ['fishaudio', 'openai', 'tiktok', 'google', ...]
```

### 4. Admin-UI Aktualisiert
**Dateien**:
- `app/plugins/tts/ui/admin-panel.html`
- `app/plugins/tts/ui/tts-admin-production.js`

#### Engine-Auswahlmenü
Vorher:
- `Fish Speech 1.5 (SiliconFlow)`

Nachher:
- `Fish.audio TTS (Official API)`
- `SiliconFlow TTS (Fish Speech 1.5)`

#### Fallback-Engines
Vorher:
- `enableFishSpeechFallback` (gemischt)

Nachher:
- `enableFishAudioFallback` (Fish.audio offiziell)
- `enableSiliconFlowFallback` (SiliconFlow)

### 5. Tests Aktualisiert/Erstellt
**Dateien**:
- `app/test/fishspeech-integration.test.js` - Aktualisiert für Fish.audio API
- `app/test/siliconflow-integration.test.js` - Neu erstellt

#### Test-Ergebnisse
```
Fish.audio Tests: ✅ 10/10 bestanden
SiliconFlow Tests: ✅ 10/10 bestanden
```

## API-Key-Verwaltung

### Settings UI
Benutzer konfigurieren API-Keys in den globalen Settings:

1. **Fish.audio API Key**: `Settings → TTS Engine API Keys → Fish.audio`
   - Gespeichert als: `tts_fishaudio_api_key` und `fishaudio_api_key`
   
2. **SiliconFlow API Key**: `Settings → TTS Engine API Keys → SiliconFlow`
   - Gespeichert als: `siliconflow_api_key`
   - Zentral für TTS + StreamAlchemy Plugins

### Rückwärtskompatibilität
Die Implementierung bleibt rückwärtskompatibel:
- Alte `fishspeech`-Konfigurationen werden zu `siliconflow` migriert
- Legacy API-Key-Felder werden weiterhin unterstützt

## Verwendung

### Als Haupt-Engine

#### Fish.audio
```javascript
defaultEngine: 'fishaudio'
fishaudioApiKey: 'your-fish-audio-key'
```

#### SiliconFlow
```javascript
defaultEngine: 'siliconflow'
siliconflowApiKey: 'your-siliconflow-key'
```

### Als Fallback-Engine
Beide Engines können unabhängig als Fallback aktiviert werden:
```javascript
enableFishAudioFallback: true    // Fish.audio als Fallback
enableSiliconFlowFallback: true  // SiliconFlow als Fallback
```

## Wichtige Unterschiede

| Feature | Fish.audio (Official) | SiliconFlow |
|---------|----------------------|-------------|
| API-Endpoint | `https://api.fish.audio/v1/tts` | `https://api.siliconflow.com/v1/audio/speech` |
| Modell | Fish Audio S1 | fishaudio/fish-speech-1.5 |
| Emotionen | 64+ Emotionen | Keine direkte Unterstützung |
| Stimmen-Referenzen | Reference IDs | Einfache Voice-Namen |
| Request-Format | Fish.audio-spezifisch | OpenAI-kompatibel |

## Migration für Benutzer

1. **Wenn Fish.audio bereits verwendet wird**: 
   - Nichts zu tun - läuft weiter als `fishaudio`
   
2. **Wenn SiliconFlow verwendet wurde**:
   - API-Key wird automatisch erkannt
   - Engine-Name wird zu `siliconflow`
   - Funktioniert weiterhin wie zuvor

3. **Wenn beide verwendet werden sollen**:
   - Fish.audio API-Key in Settings konfigurieren
   - SiliconFlow API-Key separat konfigurieren
   - Beide Engines sind unabhängig verfügbar

## Verifizierung

Die Implementierung wurde getestet:
- ✅ JavaScript-Syntax korrekt
- ✅ Fish.audio Engine-Tests bestanden
- ✅ SiliconFlow Engine-Tests bestanden
- ✅ UI zeigt beide Engines separat
- ✅ Rückwärtskompatibilität gewährleistet

## Nächste Schritte

Die Implementierung ist vollständig. Benutzer können jetzt:
1. Fish.audio für erweiterte Emotionen und Prosody-Kontrolle verwenden
2. SiliconFlow für einfache TTS mit Fish Speech 1.5 verwenden
3. Beide Engines gleichzeitig als Haupt- und Fallback-Engines nutzen

---

**Status**: ✅ Implementierung abgeschlossen
**Datum**: 14. Dezember 2024
