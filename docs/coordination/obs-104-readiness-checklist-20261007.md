# OBS-104 Readiness Checklist

Stand: 2026-10-07. Read-only Scope-/Case-Vorbereitung; kein OBS-, VM- oder Produktprozess gestartet. Punkt 2 bleibt auf ausdrücklicher Nutzerentscheidung pausiert.

## Ergebnis

- Die historischen 104 Case-IDs bleiben unverändert: **68 Public-Guide-Fälle + 32 lokale Closed-Beta-Fälle + 4 Chatango-Retirement-Kontrollen**. Die 100 aktiven IDs stimmen exakt mit der aktuellen 100-Fall-Matrix überein. Praktische OBS-Evidenz bleibt **0/104**; die vier Retirement-Kontrollen sind keine OBS-Pässe.
- Der aktuelle Store hat 24 Einträge: 23 App-Pakete und Store Admin. Aktuell sind 26 öffentliche Top-Level-Manifeste und 11 Closed-Beta-IDs vorhanden. Davon sind 17 öffentliche Overlay-Guideprofile (68 Fälle) und 8 Beta-Overlayprofile (32 Fälle).
- Drei öffentliche Runtime-Manifeste haben keine Store-ZIP: `gift-catalog`, `minecraft-connect`, `webgpu-fireworks`. Zwei davon haben OBS-Guideziele (`minecraft-connect`, `webgpu-fireworks`); die Store-, Runtime- und Guide-Zugehörigkeit sind getrennte Verträge. Die historischen Public-Cases bleiben erhalten.
- Drei Closed-Beta-IDs besitzen kein aktuelles OBS-Overlayziel: `animazingpal`, `osc-bridge`, `sidekick`. Acht Beta-Overlayprofile bleiben lokale Tests; sie sind keine Public-Store- oder Tunnel-Freigabe.
- Nur 11 von 25 aktiven Matrix-URLs sind selbst registrierte Public-Overlay-Einstiegspunkte. 14 Matrix-URLs sind nicht direkt registriert; für 13 gibt es einen registrierten Alternativpfadkandidaten. `minecraft-connect` hat keinen bestätigten registrierten Public-Overlay-Pfad. Das betrifft Tunnel-Exposition; es beweist keinen Fehler einer lokalen OBS Browser Source und autorisiert keine Registryänderung.
- Für alle 100 aktiven Profile zeigen die aktuellen Source-Routen auf vorhandene HTML-Dateien und Guide-Definitionen. Die vier Chatango-Ziele sind bewusst ausgemustert: das Verzeichnis ist leer, `plugin.json`, `main.js` und `ui.html` fehlen. Ein früher isolierter 404-Beleg bleibt ein Retirement-Control, kein OBS-Pass.

## Case-Checkliste

Die maschinenlesbare [104-Fall-Checkliste](obs-104-readiness-checklist-20261007.json) bewahrt jede Case-ID und ergänzt pro Fall:

- Scopezuordnung zu Public-Guide, lokaler Closed Beta oder Chatango-Retirement.
- Testvoraussetzungen, Fixture-Trigger, Initial-/Update-/Negativerwartung und Cleanup aus der aktuellen Matrix.
- Handler-/HTML-Auflösung, Dateiexistenz, Guide-Definition, Store-/Beta-Zugehörigkeit und Public-Overlay-Registryvergleich.
- Erforderliche spätere HTTP-, Browser-Source-, Screenshot-, Prozess-/Cleanup- und unabhängige Sichtprüfungsbelege.
- Bestehende Fixture-Notizen mit klarer Kennzeichnung, dass diese nicht erneut geprüft wurden und keinen OBS-Pass darstellen.

## Offene Gates und Zuständigkeiten

- **Nutzer/CEO:** explizite Wiederaufnahme und etwaige OBS-Bedienfreigabe. Bis dahin kein OBS-/VM-Start.
- **OBS-Profilverantwortlicher:** bei Wiederaufnahme ausschließlich eigene portable Config, eigener Prozess, WebSocket aus, keine Nicht-Loopback-Listener und vollständiger Cleanup-Beleg.
- **Guide-/Public-Overlay-Verantwortlicher:** vor Tunnel-Aussagen die 14 nicht registrierten Matrixpfade zuordnen; lokale OBS-Routbarkeit davon getrennt beurteilen. Keine Registryänderung in diesem Auftrag.
- **Pluginverantwortlicher je Case:** synthetische Zustände und Abhängigkeiten aus dem Case-Record prüfen; reale Konten, Zuschauer, Guthaben, Rollen, Provider, Geräte und Produktdaten ausgeschlossen halten.
- **CEO:** unabhängige Sichtprüfung jedes aktiven Screenshots und Verhaltensnachweises.

## Quellen und Prüfung

- Historische Matrix: `docs/coordination/output/obs-104-scope-review-3f6bb84f9/reconciled-104-matrix.json`, Basis `3f6bb84f9`.
- Aktuelle Matrix: `docs/coordination/obs-104-acceptance-matrix.json` (100 aktive Fälle).
- Scope-/Routenquellen: `docs/coordination/output/obs-104-scope-review-3f6bb84f9/scope-summary.json`, `docs/coordination/obs-route-resolution.json`, `docs/coordination/obs-104-renderer-readiness.json`, `docs/plugin-docs-qa/report.json`, `plugin-store.json`, `app/config/plugin-release-policy.json` und `app/modules/public-overlay-registry.js`.
- JSON-Parsing und programmatische Scope-/Identitätsprüfung: 104 IDs eindeutig, Klassen 68/32/4, 25 aktive Profile je Locale, 100 aktive IDs deckungsgleich. Alle aktiven Guide-Definitionen, HTML-Ziele und referenzierten Evidence-Dateien sind vorhanden.
- Keine Tests, OBS-/VM-/Appstarts, Netzwerktunnel, Provider-, GPU-, Audio- oder Liveaktionen ausgeführt. Die aktuelle OBS-Abnahme wurde nicht fortgesetzt.
