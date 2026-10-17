# Handoff – Read-only Audit der echten Dashboard-Navigation

Datum: 08.10.2026  
Umfang: Produktnavigation in app/public/dashboard.html, app/public/js/navigation.js, app/public/css/navigation.css, app/public/css/themes.css und app/public/js/theme-manager.js. Es wurden keine Produktdateien geändert und kein App-Profil gestartet.

## Ergebnis und Beleggrenze

Die statische DOM-Prüfung zählt **42 eindeutige data-view-Links und 42 zugehörige view-*-Container**. Alle 42 Links haben sichtbaren Text als zugänglichen Namen; es gibt keine verwaisten Views oder doppelten Navigations-IDs. Das belegt die Struktur der aktuellen Arbeitskopie, nicht die dynamische Sichtbarkeit nach Plugin-Inventar, die Browser-Fokusreihenfolge oder die gerenderte Darstellung.

Keine Produkt-App und kein Profil wurden geöffnet. Es wurden deshalb keine echten Laufzeit-Screenshots oder Laufzeit-Keyboard-Tests erstellt. Die nachfolgenden Laufzeitfolgen sind aus DOM/CSS/JS statisch abgeleitet und als solche gekennzeichnet. Kontrastwerte wurden aus den aktuellen Theme-Tokens rechnerisch bestimmt. Die geprüften Quelldateien waren bereits vor diesem Audit als geändert markiert; sie blieben unangetastet.

## Blockierende bzw. wesentliche Befunde

### P1 – Eingeklappte Navigationsgruppen lassen unsichtbare Links im Tab-Verlauf

Die Kategorieüberschriften werden in navigation.js als div[role=button][tabindex=0] initialisiert und bekommen aria-expanded, aber weder aria-controls noch eine programmatische Beziehung zur Linkliste (navigation.js:379-413). Der eingeklappte Zustand setzt in navigation.css lediglich max-height: 0 und opacity: 0; die Linkliste selbst wird weder display:none noch visibility:hidden gesetzt und ihre Links erhalten kein inert/tabindex=-1 (navigation.css:534-544). **Statisch belegte Folge:** Links einer als eingeklappt gespeicherten Gruppe bleiben potenziell per Tab erreichbar, obwohl sie visuell abgeschnitten sind. Screenreader erhalten ebenfalls keinen expliziten Hidden-State für diese Liste. Das macht Fokusstandorte schwer auffindbar.

**Minimale Empfehlung:** Kategorien als echte button-Steuerung mit aria-expanded und aria-controls auszeichnen; beim Schließen Linkliste hidden/inert setzen (oder Links aus dem Tab-Verlauf nehmen) und beim Öffnen wiederherstellen. aria-expanded muss den sichtbaren Zustand spiegeln.

### P1 – Mobile Menüöffnung benennt den Auslöser nicht und versetzt Fokus nicht in den Drawer

Der mobile Menüknopf wird zur Laufzeit als Button mit Icon erzeugt, jedoch ohne sichtbaren Text, aria-label, aria-controls oder aria-expanded; sein Click-Handler toggelt nur .mobile-open (navigation.js:1199-1225). Der Button wird in .topbar-left eingefügt, während das Sidebar-aside samt Navigation im DOM davor steht (dashboard.html:2382-2417, 2662-2674). Bei schmalen Viewports wird die Sidebar visuell über den Inhalt geschoben (navigation.css:2765-2780).

**Statisch belegte Folge:** Screenreader bekommen keinen sinnvollen Namen/Zustand für den Menüknopf. Beim Öffnen bleibt der Fokus auf dem Auslöser hinter dem Drawer; der nächste Vorwärtsschritt folgt der späteren Topbar-DOM-Reihenfolge, nicht den davor liegenden Links. Ein Escape-Handler bzw. Fokusmanagement für diesen Drawer ist im untersuchten Handler nicht vorhanden. Das ist ein erheblicher Tastatur- und Orientierungsbruch für die mobile Navigation.

**Minimale Empfehlung:** Button mit lokalisiertem Namen, aria-controls und synchronem aria-expanded; Fokus beim Öffnen in den Drawer/auf den ersten sinnvollen Eintrag setzen, Escape schließen und Fokus zurückstellen. Klären, ob der Drawer modal sein soll; falls ja, Hintergrund-Fokus während des offenen Zustands sperren.

### P2 – Aktiver Menüeintrag unterschreitet WCAG-Textkontrast in den wählbaren Tag-/Nacht-Themes

themes.css erzwingt für den aktiven Eintrag weißen Text auf --brand-primary (themes.css:481-485). Die Basisnavigation setzt denselben aktiven Zustand (navigation.css:583-586). Berechneter Kontrast normaler weißer Beschriftung gegen den aktuellen grünen Hintergrund:

| Theme | Hintergrund / Text | Verhältnis |
|---|---|---:|
| Day | #12a116 / #ffffff | 3,42:1 |
| Night | #12a116 / #ffffff | 3,42:1 |
| Cid (Standard) | #4ade80 / #ffffff | 1,74:1 |
| Contrast | #14c91f / #ffffff | 2,23:1 |
| Vision Impaired | #fbbf24 / #000000 | 12,58:1 |

Die Werte für Day, Night, Cid und Contrast unterschreiten 4,5:1 für normalen Text. Andere geprüfte Sidebar-Texte liegen im Tagmodus über dem Grenzwert: normaler Menütext 7,58:1, Gruppentitel 4,76:1; Night 9,85:1 bzw. 5,71:1.

**Minimale Empfehlung:** Für aktive Links eine dunklere Vordergrundfarbe auf hellem Akzenthintergrund oder einen dunkleren, kontrastgeprüften Hintergrund mit weißem Text festlegen; für alle auswählbaren Themes automatisiert mindestens 4,5:1 prüfen.

### P2 – Navigation-Landmarks sind nicht benannt; es existieren zwei unbeschriftete nav-Bereiche

Die Hauptnavigation ist nav.sidebar-nav ohne aria-label/aria-labelledby (dashboard.html:2417). Ein weiterer, ebenfalls unbenannter nav#wiki-nav ist vorhanden (dashboard.html:3780). **Statische Folge:** In der Landmark-Navigation sind beide Bereiche nur als „Navigation“ unterscheidbar bzw. bei manchen Screenreadern nicht sinnvoll benannt.

**Minimale Empfehlung:** Hauptnavigation und Wiki-Navigation mit je einem passenden, lokalisierten Namen benennen.

### P2 – Aktiver View wird nur visuell markiert; Viewwechsel signalisiert den neuen Inhalt nicht

Beim Wechsel wird nur die active-Klasse am Link und am View umgeschaltet; aria-current wird nicht gesetzt und der Fokus/Screenreader-Cursor wird nicht in den neuen View verschoben (navigation.js:617-648). Die Anker verwenden durchgehend href=# und werden durch JavaScript abgefangen (dashboard.html:2425-2435, navigation.js:522-531).

**Statisch belegte Folge:** Der visuelle aktive Eintrag ist für assistive Technik nicht als aktueller Bereich gekennzeichnet. Nach Auswahl kann der Fokus im Navigationslink bleiben, ohne dass der neue Viewtitel angekündigt wird. In der Produktansicht ist damit ein Wechsel der Hauptfläche für Screenreader-Nutzende weniger eindeutig.

**Minimale Empfehlung:** aria-current="page" am aktiven Link synchronisieren und beim Viewwechsel eine benannte Hauptüberschrift fokussieren oder eine knappe Statusmeldung ausgeben. Für Links, die ausschließlich Viewwechsel steuern, die Link-/Button-Semantik bewusst festlegen.

## Positiv geprüfte Punkte

- 42/42 Navigations-IDs sind eindeutig, textuell benannt und haben einen passenden View-Container.
- Die Kategorie-Steuerung akzeptiert Enter und Space; aria-expanded wird bei Auf-/Zuklappen aktualisiert (navigation.js:402-412, 496-513).
- Die Theme-Auswahl nutzt eine benannte Radiogroup, aria-checked, Roving Tabindex, Pfeiltasten, Home/End und Escape; der Schalter aktualisiert aria-expanded und stellt beim Schließen Fokus wieder her (theme-manager.js:125-200, 299-307, 343-373).
- Die Sidebar wird im geschlossenen mobilen Zustand mit visibility:hidden aus Darstellung und Fokus genommen (navigation.css:2765-2780).

## Responsive / Laufzeit-Abdeckung

Der CSS-Quelltext enthält mobile Regeln bei 1024 px und 480 px und einen vertikal scrollbaren Sidebar-Navigationsbereich (navigation.css:359-395, 441-469, 2765-2793). Das ist **keine** browsergestützte Bestätigung für 320 px oder 200%-Zoom. Es gab hier keine App-Laufzeitprüfung, keine synthetische DOM-Installation in den echten Produktkontext und keine Profil-/Kontointeraktion. Vor einer Umsetzung sollten die Empfehlungen isoliert per lokaler Browserprüfung mit leerem Testprofil validiert werden, insbesondere Drawer-Fokus, Kategorien im gespeicherten Collapse-Zustand, 320–390 CSS px und 200%-Zoom.

## Reproduzierbarer statischer Prüfansatz

Der DOM wurde mit dem vorhandenen jsdom-Paket aus app/node_modules gegen dashboard.html geparst. Geprüft wurden Anzahl/Eindeutigkeit der data-view-Links, Textnamen, nav-Landmarks und 1:1-Zuordnung zu view-*. Kontrastwerte wurden anhand der Theme-CSS-Variablen und der aktiven Navigationsregel nach WCAG-Formel berechnet. Nicht geprüft wurden dynamische Plugin-Sichtbarkeit, tatsächliche assistive-Technik-Ausgabe oder gerenderte Browser-Fokusreihenfolge.

## Nachtrag: Umsetzung und Regressionen (08.10.2026)

Die eng begrenzten Navigation-/ARIA-Fixes wurden inzwischen in der Arbeitskopie umgesetzt. Vorhandene, fremde Dirty-Hunks in `dashboard.html`, `navigation.css`, `themes.css` und den Locale-Dateien wurden erhalten. Hinzu kamen ausschließlich die folgenden passenden Stellen:

- `app/public/dashboard.html`: sieben Kategorieüberschriften sind native Buttons mit `aria-controls`/`aria-expanded`; ihre Linklisten haben kontrollierte IDs. Haupt- und Wiki-Navigation sind benannt. Die Dashboard-Startansicht markiert den aktuellen Link; ein höflicher Statusbereich kündigt Viewwechsel an.
- `app/public/js/navigation.js`: gespeicherte Gruppen werden per `hidden` aus Darstellung und Tab-Reihenfolge genommen; Zustand und `aria-expanded` bleiben synchron. Der mobile Menübutton ist benannt und steuert die Sidebar, Fokus geht beim Öffnen in die Navigation, Escape und Viewwechsel schließen den Drawer mit Fokus-Rückgabe. Viewwechsel setzen `aria-current` und aktualisieren die Statusmeldung.
- `app/public/css/navigation.css`: Kategoriebuttons erhalten native Button-Reset-Stile; Links, Gruppen, Sidebar-Toggle und Topbar-Buttons haben einen expliziten `:focus-visible`-Ring.
- `app/public/css/themes.css`: aktive Links nutzen im Kontrast-Theme den dunklen Aktionsgrünton statt des bisherigen hellen Brand-Grüns. Andere Theme-Werte wurden nicht unnötig ersetzt.
- `app/locales/{de,en,es,fr}.json`: lokalisierte Namen für Haupt-/Wiki-Landmark und mobilen Navigationstoggle.
- `app/test/dashboard-navigation-accessibility.test.js`: neue synthetische DOM-, Fokus-, Status-, Locale- und Kontrastregressionen.

### Korrektur des vorherigen Kontrastbefunds

Der frühere Abschnitt „P2 – Aktiver Menüeintrag unterschreitet WCAG-Textkontrast“ übersah die spätere, wirksame Theme-Regel in `themes.css` (vorherige Datei-Zeilen 1973–1982). Für Day, Night und Cid setzt diese Regel tatsächlich weißen Text auf Violett `#7c3aed`; rechnerisch ergibt das **5,70:1**. Diese drei Themes brauchten daher keine Kontraständerung. Nur das Contrast-Theme hatte einen zu hellen aktiven Hintergrund; es nutzt nun `#166534` mit Weiß und erreicht **7,13:1**. Beide Werte erfüllen WCAG 2.1 AA für normalen Text (>=4,5:1). Die Regression liest die verwendete Regel und den Theme-Token aus CSS ein und berechnet das Verhältnis.

### Verifikation und Grenzen

Ausgeführt aus `app/`:

- `npx jest --runInBand test/dashboard-navigation-accessibility.test.js test/navigation-sidebar-visibility.test.js test/dashboard-responsive-accessibility.test.js test/dashboard-theme-palette.test.js` — **4 Suites, 35 Tests bestanden**.
- `node --check public/js/navigation.js` — bestanden.
- JSON-Parse der vier Locale-Dateien — **4/4 bestanden**.
- `git diff --check` auf den betroffenen Dateien — bestanden; Git meldete nur den bestehenden LF/CRLF-Hinweis für `themes.css`.

Die Tastatur-/Fokusbelege stammen aus JSDOM und synthetischen Browser-ähnlichen Events, nicht aus einer geöffneten Produkt-App. Es gab keine echte Screenreader-Prüfung. 200%-Zoom und gerenderte Browserdarstellung sind weiterhin nicht verifiziert; dafür sollte ein separater, statischer Fixture-Browsertest folgen. Es wurden keine Profile, Konten, externen Daten oder Netz-Endpunkte verwendet.

## Nachtrag: Sprachwechsel DE/EN/ES/FR (08.10.2026)

Der Sprachwechsel wurde mit dem echten `dashboard.html`, `i18n-client.js`, `navigation.js` und `init-language-switchers.js` in vier isolierten JSDOM-Sessions geprüft. Es liefen keine Produkt-App, kein Backend und kein Nutzerprofil. Der Fetch-Zugriff war durch einen synthetischen Adapter auf die vier lokalen Locale-JSON-Dateien und eine synthetische lokale Plugin-Inventarliste begrenzt; unerwartete URLs hätten den Prüflauf fehlschlagen lassen.

**Ergebnis: 71 Assertions bestanden.** In einer Session wurden die Sprachen über den oberen Selektor von DE nach EN, ES, FR und zurück nach DE umgeschaltet; anschließend erfolgte ein FR-Wechsel über den Settings-Selektor. Geprüft wurden direkte Aktualisierung von `document.documentElement.lang`, statischem Sidebar-Label `navigation.events`, synchronisierter Wert beider Selektoren und Persistenz in `localStorage.app_locale`. Für jede Sprache wurde danach ein frischer DOM-Kontext mit dem gespeicherten Wert als Reload-/Neustart-Simulation initialisiert und Locale, HTML-`lang`, beide Selektoren sowie der Navigationstext erneut geprüft.

Zusätzlich wurden die dynamische Navigation-Ankündigung nach `switchView('events')` sowie der vom Navigation-Listener neu gerenderte Verbindungsstatus nach jeder Sprachumschaltung geprüft. Diese aktualisierten sich passend zur jeweiligen Locale. **Kein reproduzierbarer Fehler gefunden; keine Produktdatei oder Testdatei geändert.**

Die Reload-/Neustart-Simulation belegt nur das Verhalten des i18n-Clients bei vorhandenem `localStorage.app_locale`; sie beweist keine echte Electron-/Browser-Prozessneustart-Persistenz oder backendseitige Locale-Synchronisierung. Der Lauf prüfte keine echte Browserdarstellung, Screenreader-Ausgabe, Übersetzungsabdeckung aller dynamisch asynchron nachgeladenen Plugin-Inhalte oder Netzwerk-/Socket-Interaktionen. Sämtliche Daten blieben synthetisch/lokal.

## Nachtrag: Browserprüfung Ereignisverlauf und Demo-Profilwechsel (08.10.2026)

Die Prüfung lief in einem frischen Chromium-Kontext auf `http://127.0.0.1:3000/dashboard.html`. Der bereits laufende Server lieferte ausschließlich statische Dashboard-Dateien. **Alle `/api/*`-Routen waren vor dem ersten Request abgefangen** und lieferten lokale Fixtures; Socket.IO war gestubbt, externe Requests wurden blockiert. Es wurden keine echten Profilendpunkte, Nutzerdaten, Konten oder Geräte verwendet und kein zweiter Server gestartet. Das Live-Ereignisprotokoll wurde nur im isolierten Kontext per synthetischem `/api/settings`-Wert aktiviert, weil die reale UI die Ereignisansicht bei deaktivierter Präferenz aus Navigation und Darstellung ausblendet.

**24 Browser-Assertions bestanden; keine unhandled JavaScript-Fehler.** Der Ereignisverlauf zeigte zunächst den Ladezustand, danach eine synthetische 503-Fehleransicht mit Retry. Der Fehlertext aktualisierte sich bei DE/EN/ES/FR sofort. Der Retry wechselte anschließend zu einem leeren Fixture; der Retry-Button verschwand korrekt. Die synthetischen Profile `DEMO-A-local` und `DEMO-B-local` wurden in beide Richtungen über den echten Frontend-Switch-/Restart-Poll-/Reload-Ablauf umgeschaltet. Nach jedem Reload aktualisierten sich aktive Profilanzeige und Event-History-Fixture unmittelbar; für Profil B wurde genau eine synthetische Zeile geladen, für Profil A die leere Historie. Die dynamische Switch-Beschriftung wurde in allen vier Locales geprüft. Als einzige mutierenden Requests gingen zweimal `POST /api/profiles/switch` an den Test-Router; `POST /api/server/restart`, Profilanlage/-löschung/-backup und alle echten API-Schreibzugriffe wurden nicht ausgeführt.

### Reproduzierbare Fehler und enge Fixes

- Ein erfolgreicher Demo-Switch brach vor der Aktivierung des Restart-Flows ab: `hideProfileModal()` dereferenzierte `#profile-modal`, das in der eingebetteten Settings-Profilverwaltung nicht existiert. In `app/public/js/dashboard.js` ist das Ausblenden nun null-sicher. Der Regressionstest führt `switchProfile()` bei fehlendem Modal aus und bestätigt, dass ausgewählte Demo-ID gespeichert und der Restart-Manager aufgerufen wird.
- Im echten Browser blieb der Retry-Button nach leerer Event-History sichtbar: die `.btn`-Darstellungsregel setzte `display:flex`, wodurch das native `hidden`-Attribut überstimmt wurde. `app/public/dashboard.html` hat nun eine eng auf die beiden Profil-/Event-Retry-Buttons begrenzte `[hidden]`-Regel. Die Chromium-Prüfung bestätigt, dass der Button bei Fehler erscheint und nach erfolgreicher leerer Antwort verborgen ist.

Die beiden Regressionstests in `app/test/dashboard-profile-switch-embedded-ui.test.js` liefen mit Jest **2/2 bestanden**. Die Browserprüfung beweist ausschließlich Frontend-Verhalten mit abgefangenen synthetischen Antworten. Sie belegt keine echte Backend-Profile-Isolation, persistenten Datenbankwechsel, serverseitigen Neustart, reale Event-Historie oder Nutzerprofil-Datenkorrektheit.


