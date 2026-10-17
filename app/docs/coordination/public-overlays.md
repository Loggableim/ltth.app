# Öffentliche Overlayoberflächen

Stand: 2026-10-07. Diese Matrix beschreibt den aktuellen Registry- und Public-Projektorquellstand. Sie ist keine Laufzeit-, Tunnel- oder OBS-Abnahme.

## Aktuelle Quellzählung

- **48** Public-Entrypoints.
- **36** erlaubte eingehende Socket-Events.
- **315** erlaubte ausgehende Socket-Events.
- **97** der registrierten Outgoing-Eventnamen haben einen expliziten zentralen Projektorfall; **218** haben derzeit keinen solchen Fall und bleiben für Public-Sockets Pass-through, sofern sie von einem Producer ausgelöst werden.

Die Zählung wurde mit dem gebündelten Node 22.14 gegen `public-overlay-registry.js` und die `case`-Namen von `projectPublicOverlayPayload()` erzeugt. Pass-through ist eine Klassifizierung, kein pauschaler Befund eines Datenlecks. Ein konkreter Datenschutz-/Funktionsbefund erfordert den realen Producer und den Originalconsumer.

## Familienstatus aus aktuellem Quellstand

| Familie | Aktueller Public-Vertrag | Evidenz und verbleibender Prüfbedarf |
|---|---|---|
| Advanced Timer | Entrypoint und Timer-/Rotator-/Threshold-Reads vorhanden; Events nicht zentral projiziert. | Lifecycle- und Manifest-Fixtures belegen einzelne Rendererpfade. Keine vollständige Ereignisfeldinventur oder OBS-Abnahme. |
| AnimazingPal Stream Assistant | Status-GET zentral minimiert; Status-/Reset-Events nicht vollständig als Renderer-Minimalvertrag projiziert. | Original-HUD und Statusproducer wurden für den GET-Vertrag geprüft. Eventfelder bedürfen eigener Producer-/Consumerprüfung. |
| ClarityHUD | Settings- und Anzeigeereignisse zentral begrenzt; rohe Plattform-IDs werden für Live/History lokal korreliert und öffentlich entfernt. | Public-/Local-Producer-, Originalconsumer-, Cache-/Lifecycle- und Security-Fixtures bestanden; kein Tunnel-/OBS-Beleg. |
| CoinBattle | Drei Leaderboard-GETs und alle 11 registrierten Outgoing-Events zentral projiziert. | SQLite-Producer und Originaloverlay-Consumer-Fixtures belegen minimalen Feldfluss; lokale Payloads bleiben unverändert. |
| EmojiRain / WebGPU EmojiRain | Mapping-GET und Legacy-Mapping-Update werden öffentlich auf leere Zuordnungen projiziert; weitere Eventfamilien haben teilweise Pass-through. | Originalrenderer-Fallback und Producer-/Local-vs-Public-Fixtures geprüft. Nicht jede Spawn-/Config-Variante einzeln auditiert. |
| Fireworks / WebGPU Fireworks | Classic-Fireworks-Flächen vorhanden; WebGPU-Fireworks-Ereignisse sind nicht freigegeben. | Originalentry/lifecycle mit GPU-/Audio-Doubles geprüft; kein GPU-, Audio- oder OBS-Start. WebGPU-Fireworks wird nicht als funktionierendes Public-Datenoverlay behauptet. |
| Flame Overlay / Visual FX Frame WebGPU | Config-GETs und Trigger-Events mit zentralen Feldprojektionen; lokale Configantworten bleiben original. | Producer-/Originalengine-Fixtures laufen ohne reale GPU. Keine Live- oder Browserdarstellung geprüft. |
| Game Engine / Arena | Ausgewählte Current-State-, Timer-, Audio- und Media-Events zentral projiziert; andere Spiel- und Arenaevents sind Pass-through. | Die ausgewählten Eventverträge haben Producer-/Consumer-Fixtures. `arena:state` bleibt ein konkreter großer Snapshot zur Producer-/Consumer-Minimalinventur; siehe `docs/coordination/HighestResidual.md`. |
| GCCE | HUD Show/Remove/Clear, Rotatorupdate und Rotator-GET zentral projiziert. | Producer, Public-/Local-Route, Original-HUD-Consumer und negative URL-/Shape-Fixtures geprüft. |
| Goals / Multigoals | Zentrale Projektion für ZappieHell-Goals; klassische Goals-/Multigoals-Events bleiben teilweise Pass-through. | Keine vollständige Producer-/Consumer-Matrix für die klassischen Eventfamilien. |
| Interactive Story | Configantwort zentral minimiert; Story-, Vote- und Generationsevents bleiben teilweise Pass-through. | Configproducer und Originalrenderer-Fixture geprüft; keine Provider-/TTS-Ausgabe gestartet. |
| Music Bot / Soundboard | Now-playing, Playback-Sync, Queue, Vote-/Skip-Anzeige und Soundboard-Audio zentral minimiert. Direkte Music-Bot-Statusantworten an einen Public-Socket nutzen denselben Projektionseintritt; Runtime-/Resolver-/Health-Events sind nicht öffentlich erlaubt. | Tatsächlicher Music-Bot-Statushandler, Soundboard-Producer, Overlay- und Audio-Consumer wurden CPU-only getestet. Keine Audioausgabe, MPV-/Live- oder OBS-Abnahme. |
| Sidekick | Public-Status-GET/Request über eigene Public-Statusprojektion. | Status-/Egress-/HUD-Fixtures aus früherer Arbeit vorhanden; keine Live-/VNYAN-Aktion. Eventhistorie bleibt nicht Bestandteil der Public-Statusantwort. |
| Spotlight / LastEvent | Entrypoints und Settings-/Updateevents vorhanden; übrige Eventfelder sind teilweise Pass-through. | Einzelne Locale-, Reconnect- und Lifecycle-Fixtures bestehen. Vollständige Eventpayload-Auditierung offen. |
| Stream Monsters / StreamAlchemy | HTTP-Reads werden credential-redaktiert; kritische Outboxereignisse werden durch den Plugin-Projektor auf Verbraucherfelder reduziert. | 21 kritische Ereignistypen quellenbasiert klassifiziert; dedizierte und Stage-Fixtures inkl. SQLite/Replay-Abgrenzung geprüft. Battle-/sonstige Eventfamilien bleiben getrennt zu auditieren. |
| STT Ticker | Transcript-/Interim-/Clear-Events sind registriert und Pass-through. | Synthetische Locale-/Renderer-Fixtures vorhanden; echter STT-Provider, Mikrofon und Live-Transkript nicht gestartet. |
| Talking Heads | Overlay-/Assetpfade und Events sind registriert; allgemeine Socketfelder bleiben quellenabhängig. | Scope dieser Matrix ist nur Inventur. Keine Änderungen an Talking Heads oder TTS. |
| TopTier | Board, Rangwechsel, Leaderwechsel und Decay sind zentral projiziert. | Echter Score-/Decayproducer und Originaloverlay-Animationen als CPU-Fixtures geprüft; keine Datenbank-/OBS-Liveabnahme. |
| Viewer-XP | Public Entrypoints, getrennte Public-Requests und Producer-Allowlist/-Projektionen vorhanden. | Producerfilter belegt; kein zusätzlicher zentraler Socketprojektor. Kein echter Zuschauer-/Profilbetrieb. |
| Weather Control / WebGPU Weather Control | Config-/Gamification-/Trigger-/Stopfelder zentral projiziert. | Producer, Original-HUD/Canvas und lokale/Public-Trennung mit CPU-/GPU-Doubles geprüft; keine Audio-/GPU-/OBS-Ausgabe. |

## Behoben und geprüft in der aktuellen Folge

- Music-Bot-`request-status` liefert am realen Handler nur die für den ausgelieferten Overlayconsumer nötigen Now-playing-, Queue-, Lautstärke- und Next-song-Vote-Payloads. Runtime-, Resolver- und Healthdiagnostik werden von der Public-Outgoing-Allowlist abgewiesen. Öffentliche Track-/Queue-/Vote-Payloads entfernen URLs zu tatsächlichen Medienstreams, Provider-/Kanal-/Queue-IDs, Gewinner- und Diagnosemetadaten; Queue-Preview ist auf die ersten drei Titel begrenzt.
- `soundboard:play` ist auf Playback-URL, Lautstärke, Label, Eventtyp, Playbackziel und erforderliche Gift-Wiederholungszahl reduziert. Der Projektor beschränkt lokale Audio-URLs auf `/sounds/<Dateiname>` mit bekanntem Audio-Suffix, erlaubt HTTP(S)-Audioquellen ohne URL-Credentials und verwirft ungültige Volumes, Ziele, Eventtypen und Wiederholungszahlen.
- Localhost behält die Producerpayload. Public-Adapter und direkte Public-Socketemits wenden die zentrale Projektion an; nicht registrierte Diagnostik bleibt blockiert.

## Höchster verbleibender konkreter Quellkandidat

`arena:state` wird vom echten Arena-Producer als Snapshot mit voller Konfiguration und serialisierten Spielerobjekten gesendet. Der Originalrenderer verwendet Positions-/Darstellungs-, Score-, Lebens-/Fähigkeits- und Arena-Konfigurationsfelder. Die vollständige Anzeige-Allowlist und die Semantik aller interaktiven Unterpfade sind noch nicht zusammen in einer neuen Fixture geprüft. Daher bleibt dies der nächste Public-Projektor-Kandidat; die aktuelle Runde hat dafür keine Codeänderung oder Registryfreigabe vorgenommen. Keine pauschale Leakbehauptung.

## Verifikation und offene Gates

- Der aktuelle Music-Bot-/Soundboard-Public-Projektorlauf: 5 gezielte Suites / 253 Tests bestanden; enthalten sind Projektor, Public Access, Socketadapter, Security-Matrix, echte Music-Bot-Statusantwort, echter Soundboard-Manager und ausgelieferte Consumer-DOMs.
- Lokale `node --check`- und zielbezogene `git diff --check`-Ergebnisse sind Teil des Abschlussrapports in `docs/coordination/permissions-events.md`.
- **Nicht geprüft:** vollständige Jest-Suite, laufender App-Server, Browser/Tunnel, OBS/TikTok Studio, echte Socket.IO-Verteilung und echte Live-Events. Das Workspace-OBS-Beweisinventar bleibt 0/104 praktische Captures.
- Keine Registryerweiterung, keine Producer-/Renderer-/TikTok-Adapter-/TTS-Änderung, keine echten Zuschauer-/Guthaben-/Rollendaten und keine Veröffentlichung oder Push.
