# Public-overlay failure audit (2026-10-07)

## Auftrag und Grenzen

Folgeauftrag umgesetzt: Querystrings im Crawl erhalten, die Round-Leaderboard-Consumersemantik am Originalbackend geprüft und den fehlenden Parameter eng ergänzt. ClarityHUD-Multi-Deny ist eine konkrete bekannte blockierte Abhängigkeit im Crawl-Test. Keine Registry-, Projektor- oder Public-Policyänderung. Kein Serverstart, kein öffentlicher Zugriff und keine OBS-/Liveabnahme.

## Befunde

### 1. WebGPU EmojiRain config und user-mappings (zwei Matrix-Erwartungen)

Die registrierte Oberfläche `/webgpu-emoji-rain/overlay` lädt in `plugins/webgpu-emoji-rain/gpu/engine.js` tatsächlich `/api/webgpu-emoji-rain/config`, `/api/webgpu-emoji-rain/user-mappings` und `/api/webgpu-emoji-rain/overlay/state`. Die beiden ersten Pfade fehlen in der Registry. Backend-GET-Routen existieren. Der Renderer fällt bei fehlgeschlagenen Reads auf `{config:{}}` und `{mappings:{}}` zurück, wodurch er mit Defaults starten kann, aber gespeicherte Anpassungen und Nutzerzuordnungen fehlen.

Die Matrix-Erwartung `isHttpAllowed(...) === true` beweist keine sichere öffentliche Antwort: `createPublicOverlayMiddleware` besitzt für diese WebGPU-Routen derzeit keine Antwortprojektion. Der Config-Endpunkt liefert zusätzlich `commandRegistration`, das der Renderer nicht benötigt. User-Mappings enthalten nutzerbezogene Zuordnungen. Ein bloßes Hinzufügen der beiden Pfade würde somit unbegrenzt die Backendantwort öffentlich machen.

**Offener Raw-DTO-Gate:** Der Renderer hat reale, derzeit blockierte GET-Abhängigkeiten; eine sichere Freigabe ist jedoch noch nicht spezifiziert. Config braucht eine Feld-Allowlist anhand tatsächlicher Renderer-Nutzung und gesonderte Asset-Abdeckung für konfigurierbare Medien. User-Mappings benötigen eine Datenschutz-/Produktentscheidung und begrenztes DTO; bis dahin geschlossen halten. Die zwei Matrix-Erwartungen bleiben absichtlich rot und sind kein Grund, rohe Antworten freizugeben.

### 2. ClarityHUD Multi-State (Crawl)

`plugins/clarityhud/overlays/multi.js` fragt `/api/clarityhud/state/multi` nur für initiale Event-/Historienzustände ab. Die Backendantwort für `multi` enthält `multiStreamQueue`; im Unterschied zu chat/full gibt es dafür keine öffentliche State-Projektion. Der Crawler meldet die Route blockiert. Ein vorhandener Renderer-Regressionstest erwartet ausdrücklich, dass dieser Pfad nicht öffentlich ist; Live Socket-Projektionen können den Overlaybetrieb weiter versorgen.

**Umsetzung:** Die Crawl-Expectation führt `/api/clarityhud/state/multi` konkret als bekannte gesperrte Abhängigkeit. Keine Freigabe.

Der bereits vorher im geteilten Crawl-Diff ergänzte Deny für `/api/interactive-story/participants` ist ebenfalls beabsichtigt: der Overlaycode überspringt den Fetch bei `publicRenderMode`, und die Response enthält aktive/eliminierte D&D-Teilnehmer. Der ebenfalls bereits vorhandene Deny für `/api/talkingheads/config` bleibt gerechtfertigt, weil GET die rohe Plugin-Konfiguration plus Assetkatalog liefert. Diese beiden bestehenden Erwartungshunks wurden nicht von diesem Folgeauftrag eingeführt oder umgangen.

### 3. Quiz-Show Round-Leaderboard (Crawl, erster Overlay-Aufruf)

`quiz_show_overlay.js` ruft `/api/quiz-show/leaderboard?type=round` korrekt auf. Registry und Backend verlangen exakt diesen Raw-Query; das Backend weist andere Werte und Queryformen zurück. Der Crawler entfernt in `collectAbsoluteDependencies` und `collectTemplateFetchDependencies` den Query-String vor `isHttpAllowed`, weshalb er den gültigen Aufruf als unparametrisierte, gesperrte Route einstuft.

**Umsetzung:** Der Crawler erhält Querystrings für Literal- und Template-Fetches und gibt sie als Teil des Requestpfads an `isHttpAllowed` weiter. Exakte `type=round`-Regel bleibt unverändert.

### 4. Quiz-Show Leaderboard-Overlay (Crawl, zweiter Aufruf)

`quiz_show_leaderboard_overlay.html` rief `/api/quiz-show/leaderboard` ohne Query ab. Der Backendhandler verlangt `type=round`; unparametrisiert liefert er HTTP 400. `buildCurrentRoundLeaderboard()` liest das aktuelle Quiz-Rundenergebnis aus aktuellen Antworten und Punkten; die GET-Route ist display-only und ruft diese Methode auf. Deshalb passt der vorhandene exakte Round-Vertrag zum Overlay.

**Umsetzung:** Das Overlay hängt `?type=round` an und initialisiert die Anzeige als Runde statt Saison. Andere Queries bleiben verweigert.

## Umsetzungsvorschlag

1. Erledigt: Crawler querybewusst; der exakte Requeststring wird zur Registryprüfung verwendet.
2. Erledigt: ClarityHUD Multi-State als absichtlich blockierte Abhängigkeit dokumentiert und erwartet.
3. Erledigt: Quiz-Leaderboard-Overlay an den bestehenden Round-Vertrag gebunden; Registry wird nicht erweitert.
4. Offen: WebGPU-Config-/Mapping-DTOs sowie sichere Asset-/Mapping-Felder festlegen. Matrix-Erwartungen bleiben rot, bis geprüfte Projektionen existieren.

## Prüfung

Vor der Umsetzung read-only ausgeführt:

`app/runtime/node/node.exe app/node_modules/jest/bin/jest.js --runInBand --silent test/public-overlay-security-matrix.test.js test/public-overlay-dependency-crawl.test.js plugins/clarityhud/test/renderer-regressions.test.js`

Ergebnis vor Umsetzung: 3 Suites, davon 1 bestanden und 2 fehlgeschlagen; 3 Fehler bei 179 Einzeltests (176 bestanden). Die beiden Matrix-Fehler sind die WebGPU-GET-Erwartungen. Der Crawl-Test scheiterte an ClarityHUD Multi-State und den zwei Quiz-Leaderboard-Aufrufen, wobei einer durch Query-Verlust im Helfer falsch klassifiziert wurde. ClarityHUD-Renderer-Regressionen bestanden einschließlich expliziter Deny-by-default-Assertion.

Nach der Umsetzung:

- `test/public-overlay-dependency-crawl.test.js`: **1 Suite / 3 Tests PASS**, inklusive 100 manifest assets, exakter Query-Erhaltung und ClarityHUD-Multi-Deny.
- Query-spezifische Matrix-Prüfungen für ungültige Quiz-Queries und gültige exakte `type=round`-Policy: **8 Tests PASS**.
- Vollständige `test/public-overlay-security-matrix.test.js`: **169 Tests PASS / 2 FAIL**. Die einzigen Fehler sind die unveränderten rohen WebGPU `config`- und `user-mappings`-Erwartungen; sie bleiben als offener Raw-DTO-Gate stehen.
- `public-overlay-registry.test.js`, `quiz-ultra-kompakt-mode.test.js`, `plugins/quiz-show/test/round-leaderboard-readonly.test.js`: **3 Suites / 140 Tests PASS**.
- `public-overlay-dependency-crawl.test.js` plus querybezogene Matrixfälle gemeinsam: **2 Suites / 8 Tests PASS** (andere Matrixtests durch `--testNamePattern` übersprungen).
- Separater Lauf mit `quiz-overlay-improvements.test.js` hatte **1 bestehenden, unabhängigen Fehler**: der Test erwartet eine Kategoriezuweisung in `quiz_show_overlay.js`, die aktuelle Datei nicht enthält. Die geänderte Datei ist `quiz_show_leaderboard_overlay.html`; dieser Fehler liegt außerhalb der geänderten Dateien und des Round-GET-Vertrags.

## Grenzen / Risiken

Keine Registry-/Projektoränderung. Keine öffentlichen Zugriffe, keine lokalen Produktserver-Integrationstests und keine OBS-/Liveabnahme. Die genauen zulässigen WebGPU Config-Felder und eine sichere User-Mapping-Form bleiben fachlich zu entscheiden. Die noch roten WebGPU-Matrixfälle wurden nicht als erlaubt markiert und nicht durch Policyänderung umgangen.
