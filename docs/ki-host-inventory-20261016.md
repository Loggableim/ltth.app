# KI-Host Bestandsaufnahme (2026-10-16)

Status: Nur Dokument. Kein Code geändert. Basis: `c400fc8229904ce5fbf14cbcc2a950a8735e9cd7` (Merge #140).

Begriff: „KI-Host“ bezeichnet hier den AnimazingPal-Live-Host, also den Teil, der Stream-Ereignisse über ein LLM beantwortet und an die lokale Ausgabe (Konsole, HUD, Animaze) gibt. Die Bestandsaufnahme umfasst nur den Code unter `app/plugins/animazingpal/` sowie die Tests, die diesen Code abdecken.

Keine API-Keys in diesem Dokument. Beispiele nutzen Platzhalter.

## 1. Dateien

Laufzeit (Kern):

| Datei | Rolle |
|---|---|
| `app/plugins/animazingpal/main.js` | Plugin-Einstieg, Routen, Verdrahtung. Lädt `BrainEngine` (Zeile 47) und die Konfigurationsfunktionen aus `live-host-config` (Zeile 63). Provider-Liste für Tests/Routen bei Zeile 2802. |
| `app/plugins/animazingpal/brain/brain-engine.js` | Entscheidungs- und Antwortlogik. Lädt `GPTBrainService` (Zeile 19). Provider-Pflicht über `providerRequiresApiKey` (Zeile 27-30): `openai`, `gemini`, `openrouter` brauchen einen Key, `ollama` nicht. |
| `app/plugins/animazingpal/brain/gpt-brain-service.js` | Hält den Provider-Client. Erzeugt ihn bei Zeile 33 mit `createLLMProvider(legacyConfig, logger)`. |
| `app/plugins/animazingpal/brain/llm-providers.js` | Provider-Adapter: `OpenAICompatibleProvider` (OpenAI und OpenRouter), `GeminiProvider`, `OllamaProvider`. Factory `createLLMProvider` bei Zeile 169. |
| `app/plugins/animazingpal/brain/live-host-config.js` | Defaults und Normalisierung. Provider-Liste (Zeile 3), `providerDefaults` (Zeile 34), Default-Modelle (Zeile 98-103), Modell-Normalisierung (Zeile 355). |
| `app/plugins/animazingpal/brain/response-engine.js`, `relevance-engine.js`, `event-deduper.js`, `outbox-batcher.js`, `speech-state.js`, `mic-state.js` | Antwortsteuerung, Relevanz, Dedupe, Sprach- und Mikrofonstatus. |
| `app/plugins/animazingpal/brain/memory-database.js`, `vector-memory.js`, `viewer-memory-adapter.js` | Gedächtnis für Zuschauer- und Verlaufsdaten. |
| `app/plugins/animazingpal/brain/audio-devices.js` | Audioausgabe. |
| `app/plugins/animazingpal/platforms/*.js` | Adapter für VSeeFace, VTube Studio und Basis-Adapter. |
| `app/plugins/animazingpal/live-host-ui.js`, `ui.js`, `ui.html`, `overlay/stream-assistant-hud.html` | Bedienoberfläche und lokales HUD. |

Tests (direkt betroffen):

| Datei | Abdeckung |
|---|---|
| `app/test/animazingpal-llm-providers.test.js` | Mapping für `openai`, `openrouter`, `gemini`, `ollama`. Modell `configured-model`. |
| `app/test/animazingpal-live-host-config.test.js` | Normalisierung der Provider-Konfiguration (Zeile 299-303). |
| `app/test/animazingpal-brain-provider-config.test.js` | Provider-Konfiguration des Brain-Dienstes. |
| `app/test/animazingpal-live-host-ui.test.js`, `app/test/animazingpal-live-host-integration.test.js` | UI und Integration. |
| `app/plugins/animazingpal/test/*.test.js` | Plugin-eigene Tests (i18n, Memory-Suche). |

Nebenstrecke (nicht Teil des AnimazingPal-Hosts, aber gleiche Provider-Namen):

| Datei | Hinweis |
|---|---|
| `app/plugins/interactive-story/engines/openai-llm-service.js` | Eigener OpenAI-/OpenRouter-Client der Interactive Story. Nicht über `llm-providers.js`. |

## 2. Einstiegspunkt (Ablauf)

1. `main.js` lädt `BrainEngine` (Zeile 47).
2. `BrainEngine` lädt `GPTBrainService` (`brain-engine.js:19`).
3. `GPTBrainService` erzeugt den Provider über `createLLMProvider` (`gpt-brain-service.js:33`).
4. `createLLMProvider` wählt Adapter (`llm-providers.js:169-178`). `openrouter` nutzt `OpenAICompatibleProvider` mit Basis-URL `https://openrouter.ai/api/v1` und Endpunkt `/chat/completions`.
5. Der Request setzt `Authorization: Bearer <Key>` sowie `HTTP-Referer` und `X-Title` (`llm-providers.js:85-88`).

## 3. Openrouter und `openrouter/free`

Befund aus dem Code (nicht live geprüft, es wurde kein Netzwerkaufruf gemacht):

- Default: `openrouter` nutzt `openrouter/free` (`live-host-config.js:102`).
- Das Modell wird unverändert in den Request übernommen (`llm-providers.js:93`, `model: options.model || this.config.model`). Es gibt keine Prüfung, ob das Modell kostenlos ist.
- Die Modell-Normalisierung (`live-host-config.js:355`) kürzt nur auf 200 Zeichen und setzt den Default, wenn das Feld leer ist. Sie lehnt keine Modelle ab.
- Die Antwort nutzt `response.model || this.config.model` (`llm-providers.js:103`). Damit wird das tatsächlich verwendete Modell zurückgemeldet, wenn OpenRouter es liefert.

Einordnung:

- `openrouter/free` wird als Modellstring sauber übergeben. Es gibt keinen Konflikt mit der Provider-Logik.
- Eine Garantie, dass nur Gratis-Modelle genutzt werden, gibt es nicht. Ein Nutzer kann im Profil jedes Modell eintragen, auch kostenpflichtige. Die Tests (`animazingpal-llm-providers.test.js`) prüfen nur `configured-model`, nicht `openrouter/free`.
- Die Gratis-Eigenschaft von `openrouter/free` ist extern bei OpenRouter zu bestätigen. Das wurde hier nicht geprüft.

## 4. Lücken

1. **Keine Gratis-Prüfung.** Kein Code verhindert, dass ein kostenpflichtiges Modell gewählt wird.
2. **Kein Test für `openrouter/free`.** Der Default ist nicht abgedeckt.
3. **Zwei Provider-Pfade.** AnimazingPal (`llm-providers.js`) und Interactive Story (`openai-llm-service.js`) implementieren OpenRouter getrennt. Änderungen müssen an beiden Stellen geprüft werden.
4. **Key-Handling.** Der Key liegt in der Konfiguration (`apiKey`), wird nur im Header gesetzt. Fehlerpfade wurden hier nicht auf Key-Leaks geprüft.
5. **Keine Live-Verifikation.** Die Antwortqualität und Latenz von `openrouter/free` sind nicht gemessen.

## 5. Empfehlungen (nicht umgesetzt)

- Test ergänzen: `openrouter` mit Default-Modell `openrouter/free` wird unverändert gesendet.
- Entscheiden, ob ein Gratis-Modus eine Modell-Allowlist braucht. Das wäre ein eigener Auftrag.
- Zwei OpenRouter-Pfade zusammenführen oder gegenseitig testen.
