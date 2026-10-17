# OBS Viewer-XP Renderer Fixture

Stand: 2026-10-07. Quell-/In-Process-Prüfung; keine OBS-Ausführung.

## Befund und vorab begrenzter Fixplan

- Kanonische GET-Einstiege werden in `viewer-xp-impl.js` auf die vendored Templates `xp-bar.html`, `leaderboard.html` und `level-up.html` geroutet. Das öffentliche Overlay-Register erlaubt genau diese drei GET-/HEAD-Pfade; die dazugehörigen drei HTML-Templates, den XP-i18n-Client und de/en/es/fr-Kataloge gibt es als öffentliche statische Abhängigkeiten.
- Öffentliche Socket-Anfragen/Antworten verwenden `viewer-xp:public-profile:request` / `viewer-xp:public-profile` und `viewer-xp:public-leaderboard:request` / `viewer-xp:public-leaderboard`; Aktualisierungen/Levelwechsel heißen `viewer-xp:public-update` und `viewer-xp:public-level-up`.
- Die Backendprojektion gibt nur Anzeigeattribute frei. Der echte Leaderboard-Renderer setzt `username`, `title` und `name_color` dennoch in einen `innerHTML`-String ein. Daher ist ein auf die Ranglistenanzeige begrenzter Fix vorgesehen: DOM-Knoten aufbauen, Text mit `textContent` setzen und Farbe nur als gültigen Hexwert anwenden. XP-Berechnung, Backend, Routen und Eventvertrag bleiben außerhalb des Fixes.
- Zusätzlich zum Ranglisten-Renderfix wird ein separater Lifecycle-Fix auf die drei Overlay-Clients begrenzt: nach nicht-persistiertem `pagehide` werden Socketquelle und eigene Timer idempotent beendet; verspätete Callback-Aufrufe dürfen die DOM-Anzeige nicht mehr ändern. XP-Berechnung, Backend, Routen und Eventvertrag bleiben unverändert.

## Vertragsmatrix

| Zustand | Geprüfter Vertrag | In-Process | OBS | Bildreview |
|---|---|---:|---:|---:|
| Leerer Start | XP-Bar bleibt leer bis Profil; Rangliste fordert öffentliche Liste an und zeigt leeren Zustand; Level-up wartet auf Ereignis | passed (JSDOM) | not-run | pending |
| Synthetisches Update | freigegebene Anzeigeattribute Name, Level, XP, Titel, Farbe; fake Bild fehlt absichtlich, keine Netzwerkrequests | passed (JSDOM) | not-run | pending |
| Fehler/Recovery | ungültige oder leere Rangliste ersetzt alte Zeilen; nächstes gültiges Ereignis rendert erneut | passed (JSDOM) | not-run | pending |
| Untrusted display text | Markup in Name/Titel/Reward bleibt Text und erzeugt keine Elemente/Handler | passed (JSDOM) | not-run | pending |
| Pagehide/verspätetes Ereignis | alle drei Renderer stoppen nach nicht-persistiertem pagehide eigene Timer, disconnecten ihren Socket und ignorieren verspätete Callbacks | passed (JSDOM) | not-run | pending |
| Privatsphäre | tatsächliche Serverprojektion und Renderer-DOM enthalten keine Fixture-IDs, Rohprofile, Coins oder Einstellungen | passed (JSDOM) | not-run | pending |

## Reproduktion vor Produktänderung

Mit dem tatsächlichen Inline-Script aus `leaderboard.html`, JSDOM und einem Socket-Doppel ergab der synthetische öffentliche Datensatz `Fixture <img id="injected" ...>` ein echtes `#injected`-DOM-Element. Auch ein markuphaltiger Titel wurde als Element erzeugt; `name_color: "red; background:url(javascript:1)"` wurde ungeprüft als Style-Attribut eingesetzt. Der initiale Request war korrekt `viewer-xp:public-leaderboard:request` mit `{limit:10,days:null}`. Damit ist der Befund reproduziert und der oben begrenzte Render-only-Fix begründet.

Die drei Inline-Scripts registrierten zunächst keinen Overlay-eigenen `pagehide`-Handler. Die Rangliste ließ ihr Intervall weiterlaufen; alle drei behielten ihre Socket-Callbacks. Damit konnte ein verspätetes Update nach Seitenende den DOM erneut ändern. Der zweite Fix beschränkt sich auf diese drei Renderer-Lifecycles und verändert keine shared I18n- oder Backend-Lifecycle-Logik. JSDOM bestätigt jetzt Socket-Disconnect, Timerstopp und ignorierte späte Events für nicht-persistiertes `pagehide`. Ein zusätzlicher Auftrag stellte fest, dass die zuvor hinzugefügten `once:true`-Handler beim BFCache-Eintritt verbraucht wurden. Jetzt bleiben Timer, Socket, Handler und Debounce bei `persisted:true` erhalten; die tatsächlichen Renderer werden nach `pageshow.persisted:true` erfolgreich aktualisiert. Nicht-persistiertes Hide führt danach einmalig den Cleanup aus.

Der OBS-Matrixnenner bleibt 104 Fälle aus 26 Profilen × vier Locale-Fällen. Eine Fixture erhöht keinen OBS-Zähler. `sourceFixture` und `obsStatus` bleiben getrennte Nachweise.

## Tests und verbleibende Grenzen

Gezielter Jest-Lauf für den BFCache-Nachtrag: `npm test -- --runInBand --runTestsByPath plugins/milestone-leaderboard/vendor/viewer-leaderboard/test/obs-viewerxp-fixtures.test.js -t "real i18n"` — **4/4 Locale-Tests bestanden**, je Test alle drei Originalrenderer. Die vier Läufe evaluierten den echten gemeinsamen `i18n-client.js`, echten `viewer-xp-i18n.js` und `de/en/es/fr`-Kataloge; fetch wurde strikt auf lokale Dateifixtures begrenzt. Die frühere Suite mit 12/12 bleibt vorherige Evidenz; die vollständig kombinierte Suite wurde nach diesem Nachtrag noch nicht erneut ausgeführt.

Matrixstatus bleibt 104 Fälle / 26 Profile. Viewer-XP: vier Localezeilen `in-process-renderer-fixture-passed-not-obs`, `obsStatus=not-run`, `visualReview=pending`. Der vorhandene Node-Testläufer `node --test scripts/obs-pilot/test/obs-104-matrix.test.js` scheiterte zuvor an `spawn EPERM`; der Jest-Aufruf für diese außerhalb des Jest-Roots liegende Suite fand keine Tests. OBS-Renderer, echte Socket.IO-Integration, Layoutsichtprüfung und OBS-Version bleiben ungeprüft. BFCache-Navigation ist nur im JSDOM-Vertrag, nicht im Browser/OBS verifiziert.

