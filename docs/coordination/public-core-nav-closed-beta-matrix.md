# Public Core-Nav / Closed-Beta Mini-Matrix

Stand: 2026-10-07 · Quellstand `a937f60270653d1e501e32c270d836f2c73efb50`

## Befund

`app/config/plugin-release-policy.json` listet elf Closed-Beta-IDs. Die Policy wirkt nur bei `config/distribution-mode.json` mit `channel: "public"`; die Datei fehlt im aktuellen Quellcheckout, der lokale Developer-Modus bleibt daher absichtlich ungefiltert.

Im Public-Modus filtert `PluginLoader.buildPluginInventory()` die Beta-Manifeste vor dem GET `/api/plugins`; der Route-Handler gibt dieses gefilterte Inventory zurück. Die Plugin-Request-Guard antwortet für `/plugins/{id}` und `/api/plugins/{id}` mit neutralem 404. Der offizielle Store-Registry-Pfad filtert die Policy ebenfalls.

Im zunächst auditierten Stand (vor dem Fix unten) wurden statische Sidebar-Einträge nach erfolgreichem `/api/plugins`-Abruf ausgeblendet, wenn ihre ID nicht in der gefilterten Liste enthalten war. Zwei Ausnahmen blieben sichtbar und klickbar: `initializeShortcuts()` rendert Stream Monsters und WebGPU EmojiRain als `shortcut-card`s. Die allgemeine Sichtbarkeitsroutine markierte ihre statischen Content-Views als `missing-active-view`, weil die Views selbst vorhanden sind. `isViewVisible()` blockierte nur `disabled` und `missing`; ein Shortcut-Klick rief `switchView()` auf und lud das Plugin-iFrame. Im Public-Paket ist dessen Route bzw. Asset gesperrt oder nicht registriert. Erwartetes Ergebnis war ein leerer/404-View. HTTP wurde nicht ausgeführt.

Vor dem Fix wurde Hash-/`active-view`-Navigation vor dem asynchronen Plugin-Visibility-Abruf verarbeitet. Ein aus einem lokalen Lauf gespeicherter Beta-View konnte deshalb zunächst ebenfalls in die statische iFrame-Hülle laden; die spätere Sichtbarkeitsaktualisierung setzte den View auf `missing-active-view`, was `isViewVisible()` weiterhin zuließ.

Vor dem Fix wurden nur OSC-Bridge und WebGPU EmojiRain als Beta-Quick-Action-Knöpfe (je ein Hauptknopf und ein Sidebar-Mini-Icon) behandelt. Bei erfolgreichem Public-Mode-Abruf fehlten sie in der aktiven Pluginmenge; beide Knöpfe wurden deaktiviert, blieben aber sichtbar mit generischem Hinweis „Plugin disabled“. WebGPU EmojiRain zielte auf `/api/webgpu-emoji-rain/toggle`; OSC Bridge schrieb über `/api/settings`. Der letztere Pfad ist ein allgemeiner Settings-Schreibpfad, keine Closed-Beta-ID-Route. UI-Deaktivierung und bestehende Admin-Schreibauth blieben relevant.

| Policy-ID | Statische Sidebar | Dashboard-Shortcut | Quick Action | Public-Mode-Befund vor Fix |
|---|---|---|---|---|
| `animazingpal` | vorhanden | keine | keine | Sidebar nach erfolgreichem API-Abruf verborgen; gespeicherter View/Hash kann die statische iFrame-Hülle erreichen. |
| `interactive-story` | vorhanden | keine | keine | Sidebar verborgen; gespeicherter View/Hash kann die statische iFrame-Hülle erreichen. |
| `music-bot` | vorhanden | keine | keine | Sidebar verborgen; gespeicherter View/Hash kann die statische iFrame-Hülle erreichen. |
| `osc-bridge` | vorhanden | keine | Hauptknopf + Mini-Icon | Sidebar verborgen; Quick Actions deaktiviert, aber sichtbar; gespeicherter View/Hash kann die iFrame-Hülle erreichen. |
| `schnorrbecher` | vorhanden | keine | keine | Sidebar verborgen; gespeicherter View/Hash kann die statische iFrame-Hülle erreichen. |
| `sidekick` | keine | keine | keine | In der Core-Navigation/Quick Actions kein statischer Einstieg gefunden. |
| `stream-monsters` | vorhanden | **sichtbar/klickbar** | keine | Sidebar verborgen; Shortcut kann den gesperrten bzw. nicht registrierten `/stream-monsters/ui`-View laden. Alias `streamalchemy` ist serverseitig kanonisiert/gefiltert. |
| `talking-heads` | vorhanden | keine | keine | Sidebar verborgen; gespeicherter View/Hash kann die statische iFrame-Hülle erreichen. View-Ziel liegt unter `/plugins/talking-heads/` und fällt unter die Request-Guard. |
| `visual-fx-frame-webgpu` | vorhanden | keine | keine | Sidebar verborgen; gespeicherter View/Hash kann die statische iFrame-Hülle erreichen. |
| `webgpu-emoji-rain` | vorhanden | **sichtbar/klickbar** | Hauptknopf + Mini-Icon | Sidebar verborgen; Shortcut kann `/webgpu-emoji-rain/ui` ansteuern; Quick Actions sind deaktiviert, aber sichtbar. |
| `webgpu-weather-control` | vorhanden | keine | keine | Sidebar verborgen; gespeicherter View/Hash kann die statische iFrame-Hülle erreichen. |

Im ursprünglichen Stand setzte ein erfolgreicher policy-gefilterter API-Abruf normale Sidebar-Einträge auf verborgen. Falls `/api/plugins` nach allen Retries fehlschlug, kehrte `initializePluginVisibility()` ohne Fallback-Verbergen zurück; statische Sidebar-Einträge blieben sichtbar. Quick Actions fielen bei API-Fehlern auf eine leere aktive Menge zurück und blieben deaktiviert.

## Policy-DTO-/Frontend-Änderung

1. GET `/api/plugins` ergänzt ein kleines, nicht sensibles Feld `distributionMode: "public" | "local"`, aus demselben Policy-Snapshot wie das Inventory. Keine Liste gesperrter IDs, Manifestdaten oder internen Pfade ergänzen.
2. Bei `distributionMode === "public"` blendet das Frontend plugin-gebundene Sidebar-Einträge, Shortcut-Kacheln und Quick-Action-Controls aus, deren ID im bereits policy-gefilterten `plugins`-Array fehlt. Statische Content-Views ohne erlaubten Inventory-Eintrag werden als gesperrt/hidden markiert; `isViewVisible()` muss den Zustand ablehnen. Wenn der aktuelle View danach gesperrt ist, auf Dashboard zurückschalten.
3. Bei `distributionMode === "local"` bleibt die bisherige lokale Developer-Anzeige vollständig erhalten. Fehlende lokale Views/Manifeste werden nicht anhand einer fest kodierten Closed-Beta-Liste weggefiltert.
4. Bei API-Fehlern bleibt der Modus unbekannt und plugin-gebundene Navigation pending/verborgen; es wird kein Public-/Local-Modus geraten. Keine statischen Beta-ID-Listen ans Frontend oder an Public-Overlays ausgeben.
5. Regressionen prüfen Public-Mode-DTO plus verborgene Controls/abgelehnte Restore-Views und Local-Mode mit allen elf weiterhin vorhandenen Developer-Einstiegen. Keine Runtime-/Overlay-Daten oder Schreibschnittstellen hinzufügen.

## Umsetzung

- `GET /api/plugins` liefert jetzt nur das zusätzliche, nicht sensitive `distributionMode: "public" | "local"`. Die Release-Policy bleibt alleinige Quelle; keine Block-ID-Liste oder zusätzliche Manifestdaten werden ergänzt.
- Plugin-gebundene Navigation startet synchron im Zustand `pending` und bleibt verborgen, bis ein gültiges Inventory samt Modus angekommen ist. Fehlende/ungültige Antworten führen zu verzögerten Retries; unbekannter Modus wird nicht als Local interpretiert. Core-Views ohne `data-plugin` bleiben benutzbar.
- Im Public-Modus werden Controls/Views ohne Eintrag im gefilterten Inventory als `blocked` verborgen. `switchView()` und gespeicherter View/Hash-Restore lehnen `pending`/`blocked` ab; ein gesperrter initialer View fällt auf Dashboard zurück.
- Im Local-Modus greift keine Closed-Beta-ID-Liste im Frontend; gelistete lokale Apps und vorhandene Developer-Views bleiben zugänglich.
- Main Quick Actions und Sidebar-Mini-Icons bleiben pending/disabled bis zum gültigen DTO. Im Public-Modus werden nicht gelistete Actions verborgen; Local-Modus aktiviert gelistete aktive Plugins. Pluginstatus-Endpunkte werden nur für aktive Plugins abgefragt.
- Der Local-Mode-Regressionsfall lädt alle elf IDs aus der Policy-Liste als lokales Inventory und bestätigt, dass jede Sidebar-/View-Ansicht offen und navigierbar bleibt.

## Regression und Verifikation

- `navigation-sidebar-visibility.test.js`: Public-Hide/Blocked-Views, Local-Developer-Zugriff mit allen elf Policy-IDs, gespeicherter View, Hash-Restore, API-Ausfall/Core-Navigation sowie Legacyantwort ohne Modusmarker mit Retry.
- `dashboard-enhancements-public-inventory.test.js`: Public-Hide, Local-Aktivierung und Quick-Action-Retry nach initialem Abruffehler.
- `plugin-inventory-mode-route.test.js`: Public-/Local-DTO-Wert, keine gesonderten `closedBeta`-/`blockedIds`-Felder und valides leeres Inventory.
- Gezielte Jest-Runde: 4 Suites, 17 Tests bestanden. `node --check` für alle geänderten JS-Dateien und scoped `git diff --check` bestanden.
- Keine Live-App, kein installierter Public-Build und keine OBS-/HTTP-Abnahme gestartet.

## Folgeprüfung gegen HEAD 468c132bd

- Prüfbasis ist `468c132bd7627c3d8d8d0c6aa58074418441b50`; die Public-Policy-Konfiguration (`app/config/plugin-release-policy.json`) stimmt mit diesem HEAD überein.
- Der Dashboard-Enhancement-Diff betrifft den Inventar-/Quick-Action-Vertrag. Dashboard-HTML und vorbestehende Chatango-/Emoji-Darstellungshunks wurden nicht in diesen Patch aufgenommen.
- Die Route ermittelt das Inventar aus Manifestdateien auf Disk, nicht aus `pluginLoader.plugins`. `server.js` lädt Plugins, bevor es `listen()` aufruft. Daher gibt es im regulären Startup keinen erreichbaren Zwischenzustand mit erfolgreichem, aber noch leerem Inventory, nur weil Plugin-Instanzen noch nicht geladen sind. Ein valides leeres Inventory wird als erfolgreiches Ergebnis behandelt und blockiert plugin-gebundene Public-Einstiege; spätere `plugins:changed`-Socketevents lösen einen erneuten Inventoryabruf aus.
- Eine ältere laufende Serverinstanz ohne `distributionMode`-Feld ist für diese Frontend-Version kein Local-Modus: die Antwort wird verworfen, Controls bleiben `pending`/verborgen und der Abruf wird erneut versucht. Der Serverprozess wurde nicht neu gestartet.
- Diese Folgeprüfung ist Quellcode- und fokussierte Testprüfung. Es wurde kein isolierter Server gestartet.

## Quellen und Prüfgrenze

- Release-Liste: `app/config/plugin-release-policy.json`.
- Inventory-Filter: `app/modules/plugin-loader.js` (`buildPluginInventory`).
- Read-API: `app/routes/plugin-routes.js` (`GET /api/plugins`).
- Guard/Store-Filter: `app/modules/plugin-release-policy.js`; Store-Registry-Ausgabe in `app/modules/plugin-store.js`.
- Statische Core-Views/Quick Actions: `app/public/dashboard.html`.
- Sichtbarkeit, dynamische Shortcuts und View-Zustand: `app/public/js/navigation.js`.
- Quick-Action-Deaktivierung und Toggle-Ziele: `app/public/js/dashboard-enhancements.js`.

Die gezielten Tests bestätigen den lokalen Quellvertrag. Kein Server oder installierter Public-Build gestartet; keine HTTP-/Browser-/OBS-Liveprüfung. Dies ist keine Bestätigung eines ausgelieferten Public-Pakets.
