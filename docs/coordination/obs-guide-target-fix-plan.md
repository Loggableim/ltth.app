# OBS-Guide-Ziele und synthetische Query-IDs

Stand: 2026-10-07. Quellprüfung/Fixtureplan; keine Produkt-API-, Registry- oder Datenänderung und keine OBS-Ausführung.

## Chatango: Guide-Zielentscheidung offen

`app/plugins/chatango/ui.html` ist nach aktuellem Guide (`scripts/plugin-guides/chatango.js`, `mode: "ui"`) eine Einstellungs-/Dashboardseite mit Chatango-Widget-Vorschau. Der Pluginordner enthält keine separate Overlay-HTML-Datei. Das Dokument bindet `https://st.chatango.com/js/gz/emb.js` ein. Es gibt daher derzeit keinen belegten separaten lokalen Overlaypfad.

Schmaler Fixplan: Guide-Metadaten klar als UI-/Previewziel kennzeichnen und aus einer künftigen OBS-Overlay-Zielauswahl herausnehmen, bis der Modulowner einen echten lokalen Overlay-Entrypoint und dessen Transportvertrag benennt. Die hier bestätigte 104er Abnahmegrundgesamtheit wird nicht reduziert; für `chatango:{de,en,es,fr}` bleibt das Matrixziel bis zu dieser Entscheidung blockiert. Keine öffentliche Overlay-Registry ändern.

## Advanced Timer: Guide-Vertrag ist vorhanden

`scripts/plugin-guides/advanced-timer.js` definiert `create-demo-timer-overlay` und die Postcondition `query: {lang, timer: "non-empty"}`. Der Overlay-Client liest `timer` und verarbeitet `advanced-timer:tick` nur bei passender ID. Die Matrix kann deshalb je Locale `timer=fixture-timer-{locale}` verwenden. Fixture-Anforderung: derselbe Wert im synthetischen Event, ausschließlich fake HTTP/Socket-Endpunkte, kein Timer-Backend und kein Datensatz.

## Goals: Guide-Vertrag ist vorhanden, Produktionshandler bleibt ausgeschlossen

`scripts/plugin-guides/goals.js` definiert `create-demo-goal` und `query: {id: "non-empty", lang}`. Der Overlay-Client sendet `goals:subscribe` mit dem Querywert. Der aktuelle Produktionshandler `app/plugins/goals/backend/websocket.js` fragt anschließend die DB ab. Deshalb verwendet die Matrix `id=fixture-goal-{locale}` ausschließlich mit einem Fake-Socket, das die quellkonformen synthetischen `goals:subscribed`-/Update-Ereignisse bedient. `create-demo-goal`, GoalsWebSocket und DB werden nicht gestartet; keine API-Anpassung ist erforderlich.

## Gate und nächste Entscheidung

- Die Matrix behält 104 Fälle (26 Guides × 4 Locales). Korrigierte Timer-/Goals-URLs sind Fixture-Verträge, keine OBS-Pässe.
- Matrixeinträge mit `ready-for-isolated-fixture-review` bleiben vor praktischer Rendererabnahme.
- Für Chatango ist vom Guide-/Pluginowner zu entscheiden, ob ein echter Overlay-Entrypoint fehlt oder eine benannte Preview ausdrücklich zum Prüfumfang gehört. Die vier Fälle bleiben bis dahin im Gate.
