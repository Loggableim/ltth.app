# OBS-104 Produktpayload-Inventar

Stand: 2026-10-07. Read-only Quellinventar; es wurde kein Payload gebaut oder gestartet. Reproduzierbares Detailinventar: [obs-104-payload-inventory.json](obs-104-payload-inventory.json), erzeugt von [inventory-104-renderer-payload.js](../../scripts/obs-pilot/inventory-104-renderer-payload.js).

## Abdeckung und Fehlbestand im bestehenden Sidekick-Transfer

- Matrix: SHA-256 `0463f02d25c85db0282a10a157a5aadf589badd387bace0dd4e54e0800e76f0f`; 104 eindeutige Plugin-/Localefälle, 26 Plugins, je 26 Fälle in de/en/es/fr. Status: 84 `blocked-before-practical-capture`, 16 In-Process-Renderer-Fixture-only, 4 bereit für Fixture-Review. Echte OBS-Fälle bleiben 0/104.
- 71 eindeutige `evidenceSources` mit 3.638.254 Bytes fehlen vollständig aus der Sidekick-Guest-Allowlist.
- Alle 104 Pluginlocale-Dateien `app/plugins/<plugin>/locales/<de|en|es|fr>.json` existieren lokal und haben zusammen 2.963.340 Bytes. Keine davon ist Teil der Sidekick-Allowlist.
- Statischer HTML-Scan löst 76 unterschiedliche lokale `src`-/`href`-Assets mit 3.998.850 Bytes auf. Evidence-Sources und diese direkten Assets umfassen zusammen 126 Dateien / 6.495.130 Bytes. Das ist eine Untergrenze: dynamische JS-Imports, CSS-URLs, GPU-/Audioassets, API-/Socketverträge und Serverabhängigkeiten sind nicht vollständig transitiv aufgelöst.
- Ein externer HTML-Eintrag ist bekannt: `https://st.chatango.com/js/gz/emb.js` in der Chatango-Einstellungsseite. Die Chatango-Matrixfälle sind bereits blockiert und verlangen, dass externe Netzzugriffe offline bleiben.

Der aktuelle Sidekick-Transfer hat Quellmanifest-SHA `e3f475badac6b1ee51fd873654f310c79d3213b768612164dddf6ed9c633c0ed`, 544 effektive Guestdateien; die bereits validierte normalisierte Liste bleibt 2.651 Dateien / 490.389.602 Bytes mit SHA-256 `f9750454f55466d648197ea74c536d716cebde8491b3a1d35e5109993413ed5b`. Sie wurde nicht neu berechnet, kopiert oder geändert.

## Warum Sidekick-Runtime nicht für 104 reicht

Der bestehende `run-pilot.js` steuert allein die Sidekick-HUD und deren synthetisches HTTP-/Socket-Fixture. Für 104 fehlen die normalen Produktanker, u. a. `app/server.js`, `app/routes/plugin-routes.js`, `app/modules/plugin-loader.js`, `app/modules/public-overlay-registry.js` und `app/public/js/i18n-client.js`. Einige Socket.IO Client-/Serverdateien sind im Sidekick-Transfer enthalten; daraus folgt weder komplette Appserver-Abhängigkeit noch Plugin-Producerintegration.

Der vorhandene Dokumentations-Capture-Plugin-Fixture kopiert einzelne Pluginverzeichnisse in ein Temp-Profil, verlinkt aber `modules` und `node_modules` über Junctions/Symlinks mit dem Hostcheckout. Diese Form kann nicht als portabler Guesttransfer verwendet werden. Das Servermodul hat zusätzliche Core-/Datenbankinitialisierung; `app/package.json` beschreibt breitere Abhängigkeiten als 104 Renderer benötigen.

## Minimale Aufbauoptionen

1. **Renderer-only OBS-Paket:** Node 22, die 26 Plugin-Static-Trees, 104 Locale-Dateien, nachgewiesene gemeinsame Assets und einen loopbackgebundenen HTTP-/Socket-Fixture übertragen. Ein neuer pro-Plugin-/Locale-Runner liefert für jeden Fall genau die Matrixstimuli und getrennte vier Evidencephasen. Das kann Browser-Source-Rendering und sichtbare Locale belegen; es kann keinen echten Plugin-Backend-/Produktintegrationspass behaupten.
2. **Isolierte Produktintegration:** vorhandenen Docs-Capture-Schutzpfad mit strengem Plugin-Allowlistmodus jeweils einzeln je Case nutzen, aber `modules`, `node_modules`, server/routes, Locale und gewählte Pluginabhängigkeiten physisch und allowlisted in einen Gastbundle materialisieren. Vor Verwendung sind startup side effects, Datenbankpfade, keine dotenv-/Connector-/Providerstarts und alle erlaubten Pluginwrites CPU-only regressionszuprüfen. Danach erst ein getrennt reviewed Guestmanifest/Transfer/OBS-Runner erstellen. Dieser Weg bleibt größer und benötigt zusätzliche Sicherheits-/Runtimeprüfung.

Für beide Wege ausgeschlossen: `app/.env`, `app/user_configs`, `app/logs`, `app/archive`, Datenbanken, Cache/Uploads, Konten und sonstiger Nutzer-/Laufzeitstate. Die minimale Rendereroption ist die engste Ausgangsbasis; für Matrixfälle, die Produktintegration verlangen, müssen weitere getrennte Belege geliefert werden.

## Status

Das erweiterte CPU-only statische Asset-/Contract-Inventar und ein begrenztes Advanced-Timer Renderer-Fixturemanifest stehen in [obs-104-renderer-closure.md](obs-104-renderer-closure.md), [obs-104-renderer-closure.json](obs-104-renderer-closure.json) und [obs-104-advanced-timer-fixture.json](obs-104-advanced-timer-fixture.json). Es wurde kein Produktpayload gebaut, kein Listener gestartet und kein OBS-Fall ausgeführt. Dynamische Assetclosure, sichere Pluginstart-Reihenfolge, Gastgröße/Runtime, OBS-Portabilität und unabhängige Bildreview bleiben offen.

