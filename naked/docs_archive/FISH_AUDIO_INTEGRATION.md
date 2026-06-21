# Fish.audio TTS Integration - Vollständige Dokumentation

## Übersicht

Die Fish.audio TTS Engine wurde vollständig in das TTS-System integriert und nutzt das **Fish Audio S1 Modell** (neueste Generation).

## Wichtige Funktionen

### 1. Audio S1 Engine
- **Modell**: Fish Audio S1 (latest generation)
- **API Endpoint**: `https://api.fish.audio/v1/tts`
- **Format**: JSON (MessagePack wird auch unterstützt)
- **Audioformate**: MP3, WAV, OPUS, PCM

### 2. Emotionen (64+ unterstützte Emotionen)

#### Basic Emotions (24)
- neutral, happy, sad, angry, excited, calm, nervous, confident
- surprised, satisfied, delighted, scared, worried, upset, frustrated
- depressed, empathetic, embarrassed, disgusted, moved, proud, relaxed
- grateful, curious, sarcastic

#### Advanced Emotions (25)
- disdainful, unhappy, anxious, hysterical, indifferent, uncertain
- doubtful, confused, disappointed, regretful, guilty, ashamed
- jealous, envious, hopeful, optimistic, pessimistic, nostalgic
- lonely, bored, contemptuous, sympathetic, compassionate, determined, resigned

#### Tone Markers (5)
- in a hurry tone, shouting, screaming, whispering, soft tone

#### Audio Effects (10+)
- laughing, chuckling, sobbing, crying loudly, sighing
- groaning, panting, gasping, yawning, snoring
- break, long-break, breath, laugh, cough, lip-smacking, sigh
- audience laughing, background laughter, crowd laughing

### 3. Verwendung von Emotionen

**Wichtig**: Emotionen müssen am Satzanfang stehen (für Englisch und alle unterstützten Sprachen).

```javascript
// Korrekt
(happy) What a beautiful day!
(sad) I'm sorry to hear that.

// Falsch
What a (happy) wonderful day!
```

**Ton-Marker und Effekte können überall im Text stehen:**
```javascript
Let me tell you (whispering) a secret.
We did it! (laughing) Ha ha ha!
```

### 4. Prosody Control (Feinabstimmung)

Die Engine unterstützt detaillierte Steuerung von:
- **Speed**: 0.5 - 2.0 (Sprechgeschwindigkeit)
- **Volume**: -20 bis 20 (Lautstärke)
- **Pitch**: -1.0 bis 1.0 (Tonhöhe) - wird via `defaultFishaudioPitch` konfiguriert

### 5. Fine-grained Control

#### Phoneme Control
```javascript
// Englisch (CMU Arpabet)
"I am an <|phoneme_start|>EH N JH AH N IH R<|phoneme_end|>."

// Chinesisch (Pinyin)
"我是一个<|phoneme_start|>gong1<|phoneme_end|><|phoneme_start|>cheng2<|phoneme_end|><|phoneme_start|>shi1<|phoneme_end|>。"
```

#### Paralanguage
- `(break)` - Kurze Pause
- `(long-break)` - Lange Pause
- `(breath)` - Atemgeräusch
- `(laugh)` - Lachen
- `(cough)` - Husten
- `(lip-smacking)` - Lippenschmatzen
- `(sigh)` - Seufzen

### 6. API Parameter

Die Engine unterstützt folgende Parameter:
- `text`: Text für Synthese (unterstützt Emotion-Marker)
- `reference_id`: Stimmen-Modell-ID
- `format`: Audio-Format (mp3, wav, opus, pcm)
- `chunk_length`: Zeichen pro Chunk (100-300, Standard: 200)
- `normalize`: Text normalisieren (Standard: true)
- `latency`: Latenz-Modus ('normal' oder 'balanced')
- `mp3_bitrate`: MP3-Bitrate (64, 128, 192)
- `opus_bitrate`: Opus-Bitrate
- `emotion`: Emotion (wird automatisch in Text eingefügt)
- `pitch`: Tonhöhe (-1.0 bis 1.0)
- `volume`: Lautstärke (0.0 bis 2.0)

## Konfiguration

### TTS Config Parameter

In der Datenbank-Konfiguration:

```javascript
{
  defaultEngine: 'fishspeech',  // Fish.audio als Standard-Engine
  defaultFishaudioEmotion: 'neutral',  // Standard-Emotion
  defaultFishaudioPitch: 0,  // Standard-Tonhöhe
  defaultFishaudioVolume: 1.0,  // Standard-Lautstärke
  fishaudioApiKey: 'your_api_key_here',  // Fish.audio API Key
  enableFishSpeechFallback: true  // Als Fallback aktivieren
}
```

### API Keys

Die Engine unterstützt zwei API-Key-Formate:

1. **Neu (offiziell)**: `fishaudioApiKey` für Fish.audio Official API
2. **Legacy**: `fishspeechApiKey` für SiliconFlow API (rückwärtskompatibel)

Wenn beide vorhanden sind, hat `fishaudioApiKey` Vorrang.

### Stimmen (Voices)

Beispiel-Stimmen aus Fish.audio Discovery:

```javascript
{
  'fish-egirl': {
    name: 'E-girl (Energetic Female)',
    reference_id: '8ef4a238714b45718ce04243307c57a7'
  },
  'fish-sarah': {
    name: 'Sarah (Warm Female)',
    reference_id: '933563129e564b19a115bedd57b7406a'
  },
  'fish-adrian': {
    name: 'Adrian (Professional Male)',
    reference_id: 'bf322df2096a46f18c579d0baa36f41d'
  }
}
```

**Hinweis**: Benutzer können eigene Stimmen von https://fish.audio/discovery verwenden.

## Verwendung im Story Plugin

Die Fish.audio Engine ist speziell für den Story Plugin optimiert:

### Beispiel: Multi-Character Storytelling

```javascript
const storyText = `
(narrator)(calm) Chapter One: The Beginning
(mysterious)(whispering) The old house stood silent in the moonlight.
(scared) "Is anyone there?" she called out.
(relieved)(sighing) No one answered. Phew.
(excited) Suddenly, the door burst open!
`;

// Emotion wird automatisch verarbeitet
await ttsEngine.synthesize(storyText, 'fish-sarah', 1.0, {
  format: 'mp3',
  normalize: true,
  latency: 'balanced',
  chunk_length: 200
});
```

### Beispiel: Emotionale Übergänge

```javascript
const emotionalArc = `
(happy) I got the promotion!
(uncertain) But... it means moving away.
(sad) I'll miss everyone here.
(hopeful) Though it's a great opportunity.
(determined) I'm going to make it work!
`;
```

### Beispiel: Atmosphärische Effekte

```javascript
const atmosphericText = `
The comedy show was amazing (audience laughing)
Everyone was having fun (background laughter)
The crowd loved it (crowd laughing)
`;
```

## Best Practices

### Dos:
✅ Emotionen am Satzanfang platzieren
✅ Eine Hauptemotion pro Satz verwenden
✅ Kombinationen testen (z.B. `(sad)(whispering)`)
✅ Passenden Text nach Sound-Effekten hinzufügen (z.B. "Ha ha" nach `(laughing)`)
✅ Natürliche Ausdrücke verwenden

### Don'ts:
❌ Emotionen in der Satzmitte platzieren (bei Englisch)
❌ Zu viele Tags in kurzem Text verwenden
❌ Widersprüchliche Emotionen mischen
❌ Eigene Tags erstellen (nur unterstützte verwenden)
❌ Klammern vergessen

## Performance-Modus

Die Engine unterstützt drei Performance-Modi:

1. **Fast**: Timeout 8s, 1 Retry (für Low-Resource PCs)
2. **Balanced**: Timeout 15s, 2 Retries (Standard)
3. **Quality**: Timeout 30s, 3 Retries (für beste Qualität)

## Fehlerbehandlung

Die Engine hat eingebaute Fehlerbehandlung mit:
- Exponential Backoff bei Retries (1s, 2s, 4s...)
- Automatisches Retry bei Server-Fehlern (5xx)
- Keine Retries bei Client-Fehlern (4xx)
- Detaillierte Fehler-Logging

## API-Endpunkte

Die Integration fügt keine neuen Endpunkte hinzu. Fish.audio wird über die existierenden TTS-Endpunkte verwendet:

- `GET /api/tts/voices?engine=fishspeech` - Stimmen abrufen
- `POST /api/tts/speak` - Text synthesieren
- `GET /api/tts/config` - Konfiguration abrufen
- `POST /api/tts/config` - Konfiguration aktualisieren

## Sprachunterstützung

Fish.audio S1 unterstützt 13+ Sprachen:
- English (EN)
- Deutsch (DE)
- Chinese / 中文 (ZH)
- Japanese / 日本語 (JA)
- Spanish / Español (ES)
- French / Français (FR)
- Korean / 한국어 (KO)
- Arabic / العربية (AR)
- Russian / Русский (RU)
- Dutch / Nederlands (NL)
- Italian / Italiano (IT)
- Polish / Polski (PL)
- Portuguese / Português (PT)

## Zukünftige Erweiterungen

Geplante Funktionen für zukünftige Versionen:
- [ ] Voice Cloning Support (eigene Stimmen hochladen)
- [ ] WebSocket Streaming für Echtzeit-Audio
- [ ] Erweiterte Prosody-Steuerung über UI
- [ ] Emotion-Presets für häufige Szenarien
- [ ] Multi-Character Voice Switching im Story Plugin

## Ressourcen

- **Official Documentation**: https://docs.fish.audio/developer-guide/getting-started/introduction
- **Models**: https://docs.fish.audio/developer-guide/models-pricing/models-overview
- **Emotions**: https://docs.fish.audio/developer-guide/core-features/emotions
- **Fine-grained Control**: https://docs.fish.audio/developer-guide/core-features/fine-grained-control
- **Best Practices**: https://docs.fish.audio/developer-guide/best-practices/emotion-control
- **Discovery Page**: https://fish.audio/discovery (Stimmen finden)
- **API Keys**: https://fish.audio/app/api-keys (API-Schlüssel verwalten)

## Support

Bei Fragen oder Problemen:
- **Discord**: https://discord.gg/fish-audio
- **Email**: support@fish.audio
- **GitHub Issues**: Dieses Repository

---

**Implementiert**: 14. Dezember 2024
**Version**: 1.0.0
**Status**: ✅ Produktionsbereit
