# AnimazingPal 24/7 Production Defaults Design

## Ziel

AnimazingPal soll nach einer frischen Installation als eigenständiger, KI-gesteuerter TikTok-LIVE-Host vorkonfiguriert sein. Der Benutzer muss nur die drei installationsabhängigen Werte TikTok-Kanal, Fish.audio-Stimme und CABLE-Ausgabegerät auswählen. Bestehende Installationen behalten eigene Werte und Secrets.

## Geltungsbereich

Die Änderung vereinheitlicht:

- Plugin- und Animaze-Verbindungsdefaults
- Brain- und Live-Host-Defaults
- Ereignis-, TTS-, Audio-, Memory-, Avatar- und Diagnosedefaults
- Reset-Verhalten und Produktionspreset
- UI-Anfangswerte und Hilfetexte
- rückwärtskompatible Normalisierung bestehender Konfigurationen
- automatisierte Default-, UI-, Reset-, Migrations- und Runtime-Tests

Nicht automatisch bestimmbar und deshalb bewusst leer bleiben:

- öffentlicher TikTok-Kanal
- Fish.audio-Stimme
- Browser-ID von `CABLE Input`
- Geschenk-zu-Avatar-Bundles

Diese Werte erscheinen als blockierende Preflight-Aufgaben. Es werden keine erfundenen Geräte-, Stimmen-, Kanal- oder Avatarwerte gespeichert.

## Kanonisches Produktionsprofil

### Plugin und Animaze

| Feld | Default |
| --- | --- |
| `enabled` | `true` |
| Plattform | `animaze` |
| Host | `127.0.0.1` |
| Port | `9000` |
| Auto-Connect | `true` |
| Reconnect bei Trennung | `true` |
| Reconnect-Basisverzögerung | `5000 ms` |
| maximale Reconnect-Versuche | `0` (unbegrenzt) |
| Verbindungs-Timeout | `10000 ms` |
| Animaze-Daten automatisch aktualisieren | `true` |

Der erste fehlgeschlagene Auto-Connect und jeder weitere fehlgeschlagene Retry setzen die Retry-Kette fort. Der bestehende lineare Backoff bleibt erhalten. Ein erfolgreicher Connect setzt den Versuchszähler zurück.

### Brain und Persönlichkeit

| Feld | Default |
| --- | --- |
| Brain aktiv | `true` |
| Live Host aktiv | `true` |
| Provider | `ollama` |
| Base-URL | `https://ollama.com` |
| Modell | `nemotron-3-nano:30b-cloud` |
| Provider-Timeout | `30000 ms` |
| Retries | `2` |
| Retry-Backoff | `1000 ms` |
| Temperature | `0.8` |
| Max-Tokens | `300` |
| Presence-/Frequency-Penalty | `0.3 / 0.3` |
| Ollama Thinking | `true` |
| aktive Persönlichkeit | `entertainer` |
| Legacy-`standaloneMode` | `false` |
| Legacy-`forceTtsOnlyOnActions` | `false` |

`standaloneMode` bleibt `false`, weil dieses historische Feld im Code templatebasierte Antworten ohne KI bezeichnet. Die Eigenständigkeit gegenüber ChatPal wird durch `brain.liveHost.enabled: true` hergestellt.

### Antwortverhalten

| Feld | Default |
| --- | --- |
| Entscheidung | `auto` |
| Mindestscore | `0.55` |
| Antworten pro Minute | `4` |
| Probability-Fallback | `0.1` |
| maximale Sätze | `2` |
| maximale Zeichen | `500` |
| Sprache | `de` |
| Cache | aktiv, `300000 ms` |
| Kontext | `10` Nachrichten |
| Queue | `50`, Warnung bei `0.8` |
| Queue-Policy | `drop-lowest` |
| Sprech-Cooldown | `3000 ms` |
| Silence-Warnung | nach `5` verarbeiteten Events ohne Sprache |

Die Chat-Wahrscheinlichkeit ist nur im expliziten Probability-Modus maßgeblich. Im Defaultmodus entscheidet der Host deterministisch über Relevanz, Fragen, Erwähnungen und Viewer-Kontext.

### TikTok-Ereignisse

Alle Ereignisse haben explizite Prioritäten, Cooldowns und Mindestwerte. Ereignisspezifische Stimmen bleiben leer und erben die globale Fish-Stimme. Templates bleiben standardmäßig deaktiviert, damit Brain und Template nicht doppelt sprechen.

| Event | aktiv | Brain | Avataraktion | Priorität | Cooldown | Mindestwert |
| --- | --- | --- | --- | --- | --- | --- |
| Chat | ja | ja | ja | `40` | `3000 ms` | – |
| Gift | ja | ja | ja | `100` | `1000 ms` | `1` Gift |
| Follow | ja | ja | ja | `70` | `3000 ms` | – |
| Share | ja | ja | ja | `65` | `3000 ms` | – |
| Like | ja | nein | ja | `20` | `5000 ms` | `10` Likes |
| Subscribe | ja | ja | ja | `90` | `3000 ms` | – |
| Join | nein | nein | nein | `10` | `5000 ms` | – |

Situative Avataraktionen werden ausschließlich aus den tatsächlich von Animaze gemeldeten Emotes, Spezialaktionen und Idle-Animationen ausgewählt. Historische feste Indizes und nicht garantierte Emote-Namen werden nicht als neue Defaults verwendet.

### Fish.audio und Audio

| Feld | Default |
| --- | --- |
| TTS | aktiv |
| Engine | `fishaudio` |
| Stimme | leer, Pflicht-Setup |
| Emotion | `neutral` |
| Pitch | `0` |
| Lautstärke | `80` |
| Tempo | `1.0` |
| Streaming | aktiv |
| Priorität | `80` |
| Ducking | aktiv |
| TTS-Fallback | `silent` |
| TTS-Probe stale | `300000 ms` |
| Ausgabegerät | leer, Pflicht-Setup |
| Monitoring | aus, Lautstärke `30` |
| fehlendes Gerät | `mute` |

Ein fehlendes oder nicht mehr freigegebenes CABLE-Gerät darf nicht unbemerkt auf die Standardlautsprecher zurückfallen.

### Viewer-Memory und Datenschutz

Viewer-Memory, Schreiben, Insights und Geschenkverlauf sind aktiv. `streamerId` ist leer und wird beim Verbinden des TikTok-Kanals auf dessen normalisierten Benutzernamen gesetzt. Dadurch entsteht kein gemeinsamer `default`-Speicher und kein fremdes Testprofil wird verändert.

Es werden höchstens 20 passende Erinnerungen ab Wichtigkeit `0.25` geladen. Freigegeben sind Anzeigename, Sprache, Tags, VIP-Daten, Besuche, Kommentare, Gift-Anzahl und Coin-Summe. Interne Notizen, Geburtstag und Kontaktfelder bleiben ausgeschlossen. Prompt-Payloads werden redigiert.

### Avatarwechsel und Bewegung

Geschenkbasierter Avatarwechsel ist aktiv, wartet auf das Ende von Gift-Streaks und bleibt bis zum nächsten Switch bestehen. Der Namensfallback ist aktiv. Ohne Bundle erfolgt kein Avatarwechsel.

Idle-Motion ist aktiv und rotiert alle `15000 ms` mit `5000 ms` Jitter zwischen verfügbaren Idle-, Spezial- und Emote-Aktionen. `Motionless` wird vermieden; Explaining, Walking, Bored, Victory, Hello, Dance, Heart und Confetti werden bevorzugt. Nach Aktionen gilt ein Cooldown von `5000 ms`. Bewegung darf während Sprache weiterlaufen, weil die Webcamless-Erweiterung sonst sichtbar einfrieren kann.

### Source-Watchdog und Diagnose

| Feld | Default |
| --- | --- |
| Source Auto-Connect | aktiv, sobald ein Kanal gesetzt ist |
| Source-Watchdog | `30000 ms` |
| Event-Stale-Schwelle | `300000 ms` |
| Reconnect bei stale Events | aktiv |
| Browser-Heartbeat stale | `30000 ms` |
| Motion-Probe stale | `300000 ms` |
| Diagnoseevents | aktiv |
| letzte Fehler | `20` |
| Prompt-Inhalte loggen | aus |

## ChatPal-Abgrenzung

Die sichtbaren ChatPal-Sende- und ChatPal-Konfigurationsflächen werden entfernt. Neue Defaults setzen `chatToAvatar.enabled` auf `false`; das Produktionspreset darf es nicht reaktivieren. Bestehende gespeicherte ChatPal-Konfiguration darf für rückwärtskompatibles Einlesen bestehen bleiben, wird vom aktivierten Live-Host aber nicht verwendet. Die Live-Host-Sprachausgabe läuft ausschließlich über das TTS-Plugin und Fish.audio.

## Konfigurationsarchitektur

Ein kanonischer Builder liefert das Produktionsprofil. `getDefaultConfig()`, `buildLiveHostDefaults()`, Reset und das Produktionspreset beziehen ihre Werte daraus oder werden durch Tests auf identische Werte festgelegt. UI-HTML enthält keine widersprechenden statischen Werte.

Normalisierung arbeitet additiv:

1. kanonische Defaults erstellen;
2. bestehende Konfiguration tief darüberlegen;
3. Legacy-Felder migrieren;
4. Werte auf dokumentierte Grenzen normalisieren;
5. Secrets unverändert erhalten;
6. hardwareabhängige Leerwerte nicht erfinden.

Ein expliziter Reset darf die ausgewählte Sektion auf Produktionsdefaults setzen. API-Keys bleiben gemäß bestehender Secret-Regeln erhalten, bis der Benutzer sie ausdrücklich löscht.

## UI und Validierung

Jedes editierbare Backend-Feld muss entweder ein UI-Feld besitzen oder als interne Sicherheitskonstante dokumentiert sein. Für jedes UI-Feld werden Pfad, Default, Eingabetyp und Min-/Max-Grenzen gegen die Normalisierung geprüft.

Die UI kennzeichnet:

- `0 = unbegrenzt` beim Reconnect-Limit;
- TikTok-Kanal, Fish-Stimme und CABLE-Ausgabe als Pflicht-Setup;
- Live-Host als eigenständige KI-Ausgabe ohne ChatPal;
- gespeicherte Secrets nur als `apiKeyConfigured`;
- blockierende Preflight-Fehler mit konkreter Aktion.

## Fehlerverhalten

- Fehlender Ollama-Key: Provider-Test und Preflight melden einen Fehler; kein Secret wird geloggt.
- Fehlende Fish-Stimme: Preflight blockiert Sprache.
- Fehlendes CABLE-Gerät: TTS bleibt stumm und Preflight blockiert.
- Animaze nicht erreichbar: unbegrenzte Retry-Kette bei Limit `0`.
- TikTok-Kanal fehlt: Source-Watchdog bleibt inaktiv und Preflight blockiert.
- Keine passende Avataraktion: Eventverarbeitung und Sprache laufen weiter.
- Viewer-Profiles nicht verfügbar: Host arbeitet ohne Profilkontext weiter und diagnostiziert den Ausfall.

## Tests und Abnahme

Automatisiert werden geprüft:

- vollständiger Snapshot der Produktionsdefaults;
- Übereinstimmung von Backend, UI, Reset und Produktionspreset;
- partielle Migration ohne Überschreiben bestehender Werte;
- Secret-Erhalt und explizites Löschen;
- Port 9000 und unbegrenzter Reconnect;
- Startup-, Disconnect- und Folge-Retries;
- Provider- und Ollama-Parameter;
- alle Ereignisdefaults und Min-/Max-Grenzen;
- keine festen ungültigen Animaze-Aktionswerte in neuen Defaults;
- Fish.audio-, Audio- und Missing-Device-Verhalten;
- Viewer-Memory-Isolation anhand der TikTok-Streamer-ID;
- ChatPal bleibt im Produktionsprofil deaktiviert;
- UI-Feld-/Default-Abdeckung;
- bestehende Live-Host-Integrationstests;
- vollständige Jest-Suite, ESLint und CSS-Build.

Die manuelle Browser-Abnahme prüft anschließend die gerenderte UI, Pflichtfeldhinweise, Reset/Preset, Geräteauswahl und den 24/7-Preflight. Ein echter TikTok-LIVE-Test bleibt ausschließlich lesend und verwendet ein separates Testprofil.
