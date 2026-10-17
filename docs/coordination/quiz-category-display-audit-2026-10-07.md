# Quiz Show Kategorieanzeige (2026-10-07)

## Ergebnis

Der Fehler im Test `test/quiz-overlay-improvements.test.js` war eine veraltete Testbehauptung. Der einzelne rote Assertion-Text forderte direkte `categoryText.textContent = gameData.category`-Zuweisung, während der aktuelle Renderer bewusst `setRuntimeText(categoryText, gameData.category)` nutzt. Diese fragile Quelltextprüfung wurde entfernt und durch echte DOM-Vertragsabdeckung ersetzt.

Daneben besteht ein Produktfehler im realen Datenpfad: `handleStateUpdate()` kopiert `state.currentQuestion.category` nach `gameData.category` und zeigt die Kategorie bei vorhandenem Wert. Der Backend-Producer `buildGameStatePayload()` sendet für `currentQuestion` aber nur `question` und `answers`; auch `quiz-show:get-public-state` verwendet genau diesen Builder. Daher erreicht eine Kategorie aus der aktuellen gespeicherten Frage den Renderer weder beim laufenden Broadcast noch beim öffentlichen State-Reconnect.

## Konkreter Auslöser / Reproduktion

User startet ein Quiz mit einer Frage, deren `category` nicht leer ist. Der Backendzustand enthält z. B. `currentQuestion.category = "Science"`. `broadcastGameState()` emittiert danach den Payload aus `buildGameStatePayload()`; dieser enthält trotzdem nur die Keys `question` und `answers`. Der Renderer erhält daher kein `gameData.category` und setzt `#categoryDisplay` auf `display: none`.

Ein isolierter One-off-Aufruf verwendete den echten `QuizShowPlugin.prototype.buildGameStatePayload` und die bestehende JSDOM-Overlayfixture. Ergebnis: `sourceCategory: "Science"`, `emittedCategory: null`, `categoryDisplay: "none"`. Derselbe Overlayfixture-Pfad mit synthetisch mitgelieferter `category: "Science"` zeigte `display: "flex"` und Text `Science`. Kein Produktserver gestartet.

## Umsetzung

- `buildGameStatePayload().currentQuestion` ergänzt `category` nur, wenn der Quellwert ein String ist, und begrenzt ihn mit `slice(0, 1000)` auf die bestehende Public-Projektionsgrenze. Andere Fragefelder bleiben unberührt.
- Die stale Assertion wurde entfernt. `quiz-show-public-projection.test.js` verbindet den Original-Builder, `projectPublicOverlayPayload()` und den originalen Overlay-DOM und prüft normale, HTML-artige, fehlende, leere und überlange Kategorien.
- Die HTML-artige Eingabe bleibt Text (`<img>`-Element wird nicht erzeugt); fehlende/leere Werte halten das Element verborgen; lange Werte werden vor der Projektion auf 1000 Zeichen begrenzt.

## Prüfung / Grenzen

- Vor Fix reproduzierte Kategorie-Lücke; nach Fix wurde das Producer→Public-Projektor→DOM-Verhalten getestet.
- `quiz-show-public-projection.test.js`, `quiz-overlay-improvements.test.js`, `quiz-show-public-reconnect.test.js`, `obs-quiz-show-renderer-fixtures.test.js`: **4 Suites / 46 Tests PASS**.
- `node --check` für `main.js` und die beiden Tests: PASS.
- Keine HTML-/CSS-, Registry-, Public-Policy- oder Shared-Projectoränderung; kein Server, Tunnel, OBS oder LIVE.
