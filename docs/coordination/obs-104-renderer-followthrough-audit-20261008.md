# OBS-104 Renderer-Folgebelege — Read-only Audit

Stand: 2026-10-08. Scope: nur die 68 Matrixfälle `CURRENT_PUBLIC_OVERLAY_GUIDE`. Die 32 lokalen Closed-Beta-Fälle und vier Chatango-Retirement-Kontrollen sind nicht im Nenner. Keine Test-, OBS-, VM-, Server- oder Produktprozessausführung in diesem Audit.

## Ergebnis

- **49/68 öffentliche Matrixfälle** haben im aktuellen Checkout einen konkreten Socket-/Trigger-zu-Rendererzustand- oder DOM-Nachweis im Fixtureinhalt.
- Davon **40/68** in zehn Locale-parametrisierten Suite-Gruppen mit vier Varianten: Advanced Timer, Goals, Flame Overlay, Fireworks, Viewer-XP, OpenShock, TopTier, Quiz Show, Spotlight und STT Ticker.
- Weitere **9/68** haben konkrete Locale-Folgebelege in Einzelgruppen: ClarityHUD `en/de/fr` (synthetischer Follow bleibt sichtbar und Label wechselt über shared locale), CoinBattle `en`, Emoji Rain `de/en`, Game Engine `de`, Minecraft Connect `en` und Weather Control `de` (Originalengine führt synthetisches `rain`-Event bis zu aktivem Partikelzustand).
- **2/68** sind partiell: ClarityHUD `es` wechselt im Fixture die Dokument-Locale, aber ohne passende Follow-Labelassertion; `weather-control:en` speist `weather:trigger` bis zum `startEffect`-Engine-Aufruf und prüft separat Gamification-DOM, belegt aber keine sichtbare Triggerwirkung.
- **17/68** haben in den geprüften Fixtureinhalten keinen konkreten Renderer-Folgebeleg: CoinBattle `de/es/fr`, Emoji Rain `es/fr`, Game Engine `en/es/fr`, Minecraft Connect `de/es/fr`, `weather-control:es/fr` (14) und `webgpu-fireworks:de/en/es/fr` (4). Die vorhandene WebGPU-Fireworks-Suite prüft Lifecycle/Config/GPU-Fallback, injiziert aber kein akzeptiertes Firework-Event.

Rechnung: `40 locale-parametrisierte + 9 Einzel-Locale-Belege + 2 partielle Fälle + 17 ohne Folgebeleg = 68`.

## Bewertungsmaßstab und Grenzen

Als konkreter Folgebeleg zählt eine synthetische Fixture, die den Originalrenderer lädt, das relevante Event oder den initialen öffentlichen Zustand einspeist und eine darauf folgende sichtbare DOM-Ausgabe oder Rendererzustandsänderung behauptet. Die vier neuen Flame- und Fireworks-Locales belegen Rendererzustand/Uniform-Eingabe bzw. Firework-Modell und lokalisierten Gift-Card-DOM; sie erzeugen keine echten WebGL-Pixel. Der Wetter-Engine-Aufruf ist als partiell getrennt, weil die sichtbare HUD-Ausgabe unabhängig aus einem Snapshot stammt. Testdatei-Existenz allein genügt nicht.

Der Zähler ist ein inhaltlicher Quell-/Testfixture-Audit und kein Testlaufresultat. Nicht alle geprüften Suites wurden in diesem Auftrag wiederholt. Kein Fixturepass ist OBS-, Browser-Source-, Bildreview- oder Laufzeitintegrationsnachweis. Alle 104 Matrixeinträge bleiben `NOT_TESTED` für OBS.

## Quellbelege

- Locale-parametrisierte Fixturegruppen: `app/test/obs-timer-goals-renderer-fixtures.test.js`, `app/test/obs-priority-trigger-renderer-fixtures.test.js`, `app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/test/obs-viewerxp-fixtures.test.js`, `app/plugins/openshock/test/obs-primary-overlay-fixture.test.js`, `app/plugins/toptier/test/obs-toptier-fixtures.test.js`, `app/test/obs-quiz-show-renderer-fixtures.test.js`, `app/test/obs-spotlight-renderer-fixtures.test.js`, `app/test/obs-stt-renderer-fixtures.test.js`.
- Einzelne Locale-Belege: `app/plugins/clarityhud/test/full-overlay-renderer-lifecycle.test.js`, `app/plugins/coinbattle/test/overlay-renderer-lifecycle.test.js`, `app/test/emoji-rain-obs-hud-renderer-lifecycle.test.js`, `app/test/emoji-rain-en-renderer-fixture.test.js` (synthetisch, English-locale, ein Spawn-Event bis sichtbares DOM), `app/plugins/game-engine/test/game-hud-renderer-lifecycle.test.js`, `app/plugins/minecraft-connect/test/overlay-renderer-lifecycle.test.js`, `app/test/weather-control-de-renderer-effect-fixture.test.js` (synthetisches Event bis aktive Originalengine-Partikel).
- Partielle Wettergrenze und unvollständiger WebGPU-Fireworks-Trigger: `app/test/weather-public-payload-renderer-fixture.test.js`, `app/test/webgpu-fireworks-overlay-renderer-lifecycle.test.js`.

## Status

- **Renderer-Folgebelege im Fixtureinhalt:** 49 Fälle mit direktem Rendererzustand/DOM; 2 partielle Locale-/Enginegrenzfälle; 17 ohne konkreten Folgebeleg.
- **Frisch synthetisch wiederholt:** acht Flame-/Fireworks-Fälle `app/test/obs-priority-trigger-renderer-fixtures.test.js` (1 Suite / 8 Tests PASS) sowie `emoji-rain:en` (`app/test/emoji-rain-en-renderer-fixture.test.js`, 1 Suite / 1 Test PASS). Die neue Fixture injiziert nur einen minimalen synthetischen Spawn-Payload in den Originalrenderer; sie liest keine echten Nutzerdaten und macht keine ausgehenden Socket-Aktionen.
- **OBS:** 0/104 bestanden; 104/104 `NOT_TESTED`.

## Nachtrag: Weather Control `de` (synthetisch)

- Eine neue isolierte Fixture `app/test/weather-control-de-renderer-effect-fixture.test.js` lädt Original-Overlay und Original-WeatherEngine, füttert lokale Fake-HTTP-Konfigurationen ohne Schlüssel/Nutzerkonto, und gibt ein minimales anonymes `weather:trigger`-Regenereignis ein. Die Behauptung ist der Folgezustand der Engine mit genau einem aktivem `rain`-Effekt und erzeugten Partikeln; keine echten Canvas-Pixel oder OBS-Ausgabe werden behauptet.
- Gezielter Lauf mit gebündeltem Node 22.14 aus `app/`: 1 Suite / 1 Test PASS; Syntaxcheck PASS. Diese Fixture ist synthetic-only und kein OBS-/Live-/Integrationspass.
