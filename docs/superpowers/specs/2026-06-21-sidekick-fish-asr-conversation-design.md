# Sidekick Fish-ASR Conversation Design

## Ziel

AnimazingPal unterstützt zwei gegenseitig ausgeschlossene Betriebsarten:

- **Standalone Host:** AnimazingPal bewertet TikTok-Ereignisse selbst, erzeugt Antworten mit dem konfigurierten Brain und spricht über Fish.audio.
- **Sidekick / Streamer-Assistent:** Sidekick bewertet Viewer-Ereignisse und hört dem menschlichen Host über ein separates Mikrofon zu. AnimazingPal erzeugt weiterhin alle intelligenten Antworten, nutzt Viewer Profiles als Langzeitgedächtnis, steuert Avataraktionen und spricht über Fish.audio.

ChatPal und eine zweite Animaze-WebSocket-Verbindung sind nicht Teil der Zielarchitektur.

## Betriebsmodus und Besitz

AnimazingPal bleibt Eigentümer von Brain, Persönlichkeit, Viewer-Profiles-Anbindung, Avatar, Animaze-Verbindung, Fish-TTS und Audio-Routing. Sidekick ist Eigentümer von Relevanzbewertung, Host-Mikrofon, Fish-ASR, Gesprächskoordination und seinen Session-Metriken.

Wenn das Sidekick-Plugin aktiv ist, übernimmt es zur Laufzeit die Antwortentscheidung. AnimazingPal verarbeitet TikTok-Ereignisse dann nicht autonom, kann aber weiterhin explizit delegierte Sidekick-Ereignisse beantworten. Beim Stoppen von Sidekick wird die Laufzeitübernahme entfernt und AnimazingPal fällt automatisch auf Standalone zurück. Es gibt keinen persistenten Zustand, der AnimazingPal bei fehlendem Sidekick stumm lassen kann.

## Host-Audio und Fish.audio ASR

Die Sidekick-UI erfasst ein separat auswählbares Host-Mikrofon mit `getUserMedia()`. Der Produktionsstandard darf kein CABLE-/Loopback-Gerät als Hostquelle akzeptieren, ohne eine deutliche Warnung und explizite Bestätigung anzuzeigen.

Ein Browser-Audio-Analyser erkennt Sprache. `MediaRecorder` erstellt WebM/Opus-Segmente, die mindestens eine Sekunde und standardmäßig höchstens 15 Sekunden lang sind. Die UI sendet nur abgeschlossene Sprachsegmente an eine lokale, authentifizierte Sidekick-Route. Das Backend validiert MIME-Typ, Größe und Dauergrenzen im Rahmen der technisch verfügbaren Metadaten und leitet das Segment als Multipart-Anfrage an `POST https://api.fish.audio/v1/asr` weiter.

Der Fish-Key wird ausschließlich aus der bestehenden TTS-Plugin-Konfiguration gelesen. Er wird weder an den Browser zurückgegeben noch in Sidekick dupliziert. Die ASR-Antwort wird auf Text, Dauer und Zeitsegmente normalisiert. Temporäre Audiodaten werden nur im Arbeitsspeicher gehalten und nach der Anfrage verworfen.

## Echo- und Rückkopplungsschutz

Mehrere unabhängige Sperren verhindern Selbstgespräche:

1. Mikrofonsegmentierung pausiert, solange AnimazingPal/Fish.audio spricht.
2. Nach dem Sprachende gilt eine konfigurierbare Nachlaufsperre.
3. Transkripte werden mit den zuletzt gesprochenen Sidekick-Texten normalisiert verglichen; identische oder stark ähnliche Texte werden verworfen.
4. Bereits verarbeitete Transkripte werden über eine kurze Signatur-TTL dedupliziert.
5. CABLE-, Stereo-Mix- und Loopback-Geräte lösen im sicheren Preset eine Blockierung statt einer stillen Freigabe aus.

Die Sperren und ihre letzten Entscheidungen sind in den Diagnosen sichtbar.

## Gesprächskoordination

Host-Transkripte erhalten eine eigene Ereignisart `hostSpeech` und standardmäßig höchste Gesprächspriorität. Sidekick wartet das Ende einer Äußerung ab und reicht den Text an AnimazingPal weiter. AnimazingPal nutzt eine dedizierte Brain-Methode für Hostsprache, damit der Host nicht als Viewer in Viewer Profiles gespeichert wird.

Der Brain-Prompt enthält:

- aktive Avatarpersönlichkeit und Systemprompt,
- die letzten konfigurierbaren Host-/Sidekick-Turns,
- ausgewählte aktuelle Viewer-Chats und Streamereignisse,
- relevante Viewer-Profile nur für tatsächlich erwähnte oder beteiligte Viewer,
- die Rolle als kurzer, natürlicher Co-Host statt als Chat-Echo.

Viewer-Ereignisse folgen weiterhin Sidekicks Relevanz-, Dedupe- und Rate-Limit-Entscheidung. Nach einer positiven Entscheidung ruft Sidekick AnimazingPals delegierte Event-Pipeline auf. Dadurch werden Persönlichkeit, Viewer-Memory, Geschenk-Avatar-Mapping, situative Aktionen und Fish-Stimme auch im Assistentenmodus identisch zum Standalone-Modus genutzt.

Standardmäßig antwortet Sidekick auf vollständige Hostäußerungen im Modus `auto`: Fragen, direkte Ansprachen und inhaltliche Gesprächsbeiträge werden beantwortet; Fülllaute, einzelne Fragmente und erkannte Selbst-Echos nicht. Alternativ sind `always` und `wake-word` konfigurierbar.

## Konfiguration und UI

Sidekick erhält einen Bereich **Host-Gespräch** mit folgenden editierbaren Werten:

- Aktivierung und Antwortmodus (`auto`, `always`, `wake-word`)
- Hostname, Wake-Words, Antwortsprache und eigener Gesprächsprompt
- Eingabegerät und gespeicherte Gerätebezeichnung
- Mikrofon-Test, Pegelanzeige und End-to-End-ASR-Test
- Sprache für Fish-ASR oder automatische Erkennung
- VAD-Schwelle, Mindestsprachdauer, End-of-Speech-Stille
- minimale und maximale Segmentdauer sowie maximale Uploadgröße
- ASR-Timeout, Retries und Backoff
- Nachlaufsperre nach TTS, Echo-Ähnlichkeit und Dedupe-TTL
- Gesprächskontextgröße, Viewer-Kontextgröße und Turn-TTL
- Host-, Viewer-, Gift- und Systemprioritäten
- Verhalten bei fehlendem Mikrofon, fehlendem Fish-Key oder ASR-Ausfall

Die UI zeigt Mikrofonberechtigung, ausgewähltes Gerät, Aufnahmezustand, ASR-Latenz, letztes Transkript, letzte Antwortentscheidung, Echo-Sperren und Fehler. Secret-Werte werden nie angezeigt.

Animaze-, Fish-TTS-, Stimme-, Persönlichkeit-, Avatar- und Ausgabe-Einstellungen bleiben ausschließlich in AnimazingPal. Sidekick zeigt dazu Status und Deep-Link, aber keine zweite Konfiguration.

## Defaults

Das sichere Sidekick-Preset verwendet:

- Host-Gespräch aktiv, Modus `auto`
- separates Standard-Kommunikationsmikrofon, niemals automatisch CABLE/Loopback
- Sprache `de`, mit optionaler Fish-Autoerkennung
- Mindestsegment 1 Sekunde, Maximum 15 Sekunden
- End-of-Speech-Stille 700 ms
- TTS-Nachlaufsperre 1200 ms
- Echo-Ähnlichkeit 0,86 und Dedupe-TTL 30 Sekunden
- ASR-Timeout 30 Sekunden, zwei Retries mit Backoff
- acht Gesprächsturns und bis zu fünf aktuelle Viewer-Beiträge
- Join-Antworten aus; Gifts, Follows, Shares und relevante Chats aktiv

Alle Werte bleiben nach Anwendung des Presets editierbar.

## Fehlerbehandlung

- Ohne Sidekick fällt AnimazingPal auf Standalone zurück.
- Ohne AnimazingPal erzeugt Sidekick keine Ersatz-/Echoantwort, sondern meldet einen klaren Fehler.
- Ohne Fish-Key startet ASR nicht; bestehende TTS-Secrets bleiben erhalten.
- Mikrofonverlust stoppt die Aufnahme und bietet eine erneute Geräteauswahl an.
- ASR-Fehler blockieren nicht die Verarbeitung von TikTok-Ereignissen.
- TTS-Fehler verändern keine Conversation-History als erfolgreich gesprochenen Turn.
- Warteschlangen sind begrenzt; bei Überlast werden niedrig priorisierte Viewer-Turns vor Host-Turns verworfen.

## Datenschutz und Sicherheit

Die Mikrofonaufnahme startet nur nach explizitem Browserklick und sichtbarer Berechtigungsfreigabe. Die UI zeigt dauerhaft, wenn aufgenommen wird. Audio wird ausschließlich an die lokale LTTH-Route und von dort an Fish.audio gesendet. Es gibt keine dauerhafte Audiodatei. Transkript-Logging und Prompt-Logging folgen den vorhandenen Redaktions- und Diagnoseeinstellungen.

TikTok bleibt eine reine eingehende Ereignisquelle; Sidekick sendet keine Nachrichten oder Aktionen an fremde TikTok-Kanäle.

## Tests und Abnahme

Automatisierte Tests decken ab:

- Konfigurationsnormalisierung, Migration und vollständige UI-Feldabdeckung
- Entfernen aller ChatPal- und doppelten Animaze-Pfade
- Fish-Key-Redaktion und ASR-Requestparameter
- Upload-Typ-/Größenlimits, Timeout, Retry und Fehlerisolation
- VAD-Segmentierung, Mindestdauer und Gerätewechsel
- TTS-Pause, Nachlaufsperre, Textähnlichkeit und Dedupe
- Modusübernahme und automatischen Standalone-Fallback
- Hostturns ohne falsches Viewer-Profil
- Viewerturns über AnimazingPal Brain, Persönlichkeit und Viewer Profiles
- Prioritäten, Kontextgrenzen und Queue-Überlast
- Metriken erst nach tatsächlich erfolgreicher Ausgabe

Die Live-Abnahme benötigt einen manuellen Mikrofonberechtigungsklick. Danach werden Mikrofontest, Fish-ASR-Test, eine Hostfrage, ein anschließender Viewerbezug, Fish-TTS, CABLE-Routing, Animaze-Lipsync und Rückkopplungsfreiheit geprüft. Der Test nutzt weiterhin das separate Testprofil und verändert keine PupCid-Statistiken.
