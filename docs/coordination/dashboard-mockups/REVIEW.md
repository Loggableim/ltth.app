# Dashboard-Mockups · 8. Oktober 2026

## Vorschau

`index.html` direkt im Browser öffnen. Alle drei HTML-Dateien enthalten CSS und JavaScript vollständig lokal, ohne externe Abhängigkeiten, Netzwerkaufrufe oder Persistenz.

- `01-cockpit.html`: kompakte Arbeitsfläche, schmale linke Navigation, Kennzahlen zuerst, dichte Steuerung und Aktivitätsspalte. Vorteil: schneller Überblick im laufenden Stream. Nachteil: weniger Raum für Modulentdeckung.
- `02-studio.html`: horizontale Navigation, große modulare Karten, Bereitschaft und Community-Ziel. Vorteil: klarer Einstieg und bessere Erweiterbarkeit. Nachteil: längere mobile Seite.
- `03-creator.html`: große Creator-Bühne, Now-Playing-Motiv, wenige direkte Aktionen und Community-Puls. Vorteil: ruhiger Fokus während des Streams. Nachteil: großzügige Creator-Bühne benötigt mehr Platz; Musikmotiv ist dekorativ und kein Player. Kennzahlen stehen nach dem Folgeauftrag vor der Bühne, das Musikmotiv entfällt mobil.

Empfehlung: Cockpit als Standard im laufenden Betrieb. Studio als Vorbereitung; Creator als optionaler Fokusmodus. Die Konzeptlinks dienen dem Vergleich und sind keine vorgeschlagene finale Produktnavigation.

## Aktuelle sichtbare Oberfläche

Geprüft auf dem bestehenden Server unter http://localhost:3000/dashboard.html, getrennte TikTok-Verbindung. Keine Verbindung, Profilumschaltung, Session-Import-, Stop- oder Live-Aktion ausgeführt.

- Desktop: breiter Verbindungsblock und Release Notes prägen den ersten Bildschirm; Kennzahlen beginnen erst unten. Session-Extraktion und Import wirken wie alltägliche Hauptaktionen.
- Navigation: zahlreiche leere Kategorien bleiben sichtbar, während im geprüften Lauf nur wenige Module angezeigt werden. Diese Beobachtung hängt vom aktuellen Plugin-/Serverzustand ab.
- Lesbarkeit: grünes Grundthema und violetter aktiver Menüeintrag sind erkennbar; viele gleichgewichtige Karten und Überschriften erschweren die Priorisierung. Release Notes sind trotz deutscher Auswahl teilweise Englisch.
- Zustände: „Getrennt“ und „Dashboard reconnected. Waiting for live TikTok status data.“ stehen gleichzeitig im Kopfbereich. Die Meldung benennt vermutlich die Dashboard-/Socket-Verbindung, grenzt sie aber nicht klar von der TikTok-Verbindung ab.
- Mobil bei 390 × 844: Sidebar wird zum Menü; Profil erscheint als Symbol ohne Namen. Verbindung und Schnellaktionen beanspruchen den ersten Bildschirm nahezu vollständig. Ein breiter englischer Statushinweis konkurriert mit den Bedienelementen.
- Profil-/Sprachwechsel: tatsächliche Bedienelemente sichtbar; echter Wechsel wurde nicht ausgeführt. Die Mockups demonstrieren einen lokalen Profilnamenwechsel und vollständige sichtbare DE/EN/ES/FR-Beschriftungen. Echtes Laden von Profileinstellungen und Produktübersetzungen sind kein Ergebnis dieser Prüfung.
- Lauf meldete Browserwarnungen und Fehler; deren Ursachen wurden in diesem Designauftrag nicht diagnostiziert. Screenshots sind Beleg des vorhandenen Laufzustands, keine Release-Abnahme.

## Verifikation

Alle drei Dateien im Chromium-Browser über Playwright CLI gerendert: 1440 × 1000 und 390 × 1000, keine horizontale Dokumentüberbreite. Desktop- und Mobilbilder sowie invertierte Mobilbilder aufgenommen und visuell geprüft. Tag/Nacht, Demo-Profilwechsel, DE/EN-Auswahl und Fehlerzustand lokal bedient. Kennzahlen werden bei nicht verbundenen Zuständen als Strich dargestellt; Creator-On-Air-Anzeige wird zurückgenommen. Andere Modulkarten enthalten weiterhin explizit fiktive Beispieldaten.

Screenshots im Repository unter `output/playwright/`:

- `dashboard-before.png`, `dashboard-before-mobile.png`
- `01-cockpit-1440.png`, `01-cockpit-390.png`, `01-cockpit-inverted-mobile.png`
- `02-studio-1440.png`, `02-studio-390.png`, `02-studio-inverted-mobile.png`
- `03-creator-1440.png`, `03-creator-390.png`, `03-creator-inverted-mobile.png`

Produktdateien und vorhandene Mockups wurden nicht bearbeitet. Kein Commit, keine Veröffentlichung, keine Profil-/Live-Aktion. Der Checkout war bereits vor Beginn umfangreich verändert; parallele Änderungen wurden nicht zurückgesetzt. Diese Mockups beweisen weder Backendintegration noch OBS-/Device-/Live-Akzeptanz.


## Folgeauftrag: Sprachen und Zugänglichkeit

Stand: 8. Oktober 2026, abschließender lokaler Chromium-Lauf. Alle Änderungen beschränken sich auf diesen Ordner und `output/playwright/`.

### Übersetzungen und konkrete Korrekturen

Vollständige sichtbare DE/EN/ES/FR-Beschriftungen in den drei Mockups und der Übersichtsseite: Navigation, Profiloptionen, Karten, Aktivitäten, Diagnose, Auswahlzustände, Zustandsmeldungen, Aktionsfeedback, Sprunglink und zugängliche Beschriftungen. Produktnamen, Handles, Zeitangaben und technische Dateibezeichnungen bleiben Eigennamen. Kennzahlen verwenden `Intl.NumberFormat`; dekorative Beispieldaten im Ziel bleiben fest. Die HTML-Dateien enthalten ihre Übersetzungen und Logik weiterhin eingebettet und funktionieren unabhängig von `translations.json`, das als lesbare Übersetzungsreferenz dient.

Korrigiert wurden zu schwache Eingabefeldgrenzen, weißes Musiksymbol auf hellem Grün, fehlender Sprunglink, verlorene Abstände bei Textübersetzungen und die TTS-Pausenanzeige. TTS-Schalter zeigt nun eine passende Fortsetzen-/Pausieren-Aktion und aktualisiert den Status der Studiokarte. Sprachwechsel erhält Profil, Design, Verbindungszustand und TTS-Schalter.

Creator-Lesereihenfolge im DOM und visuell: Kopfbereich → Navigation → Profilkontext → Kennzahlen → Creator-Steuerung → Community-Puls → Aktivitäten → Demo-Zustand. Das dekorative Musikmotiv entfällt mobil. Cockpit und Studio folgen derselben Reihenfolge wie ihr DOM, ohne CSS-Umsortierung. Eingabefelder und Schaltflächen erhalten mindestens 44 Pixel Höhe; lange Übersetzungen umbrechen. Die horizontale Konzeptnavigation darf bei 320/390 Pixeln intern scrollen, ohne Dokumentüberbreite.

### Messwerte und Browserbelege

`verification.json` dokumentiert den abschließenden Lauf; `browser-check.js` enthält den ausführbaren lokalen Prüfschritt. Aus `output/playwright/` aufrufen:

```powershell
npx --yes --package @playwright/cli playwright-cli run-code --filename ../../docs/coordination/dashboard-mockups/browser-check.js
```

Ein zuvor geöffnetes Playwright-CLI-Browserfenster ist erforderlich. Der Code prüft ausschließlich lokale HTML-Mockups.

- **288 Zustands-/Layoutkombinationen bestanden:** 3 Mockups × 4 Sprachen × 2 Designs × 3 Breiten (320, 390, 1440) × 4 Zustände (Offline, Laden, Fehler, Live). Keine horizontale Dokumentüberbreite; nicht verbundene Zustände zeigen Striche statt aktueller Kennzahlen. Keine JavaScript-Laufzeitfehler erfasst.
- **Profil-/Aktionsprüfung:** beide Profile pro Sprache gewechselt; angezeigter Profilname stimmt mit übersetzter Auswahl überein. Aktionsfeedback vorhanden.
- **Tastatur:** Tab zum sichtbaren Sprunglink und Enter zum Hauptinhalt; Enter für Designwechsel; Leertaste für TTS; Pfeiltasten für Sprach-, Profil- und Zustandsauswahl; Leertaste öffnet Cockpit-Diagnose. Violetter Fokusrahmen ist sichtbar, unter anderem auf dem französischen Fehler-Screenshot.
- **Kontrast nach WCAG-Luminanzformel:** gemeinsame Farbvariablen aller drei Varianten in beiden Designs gemessen. Textpaare über 4,5:1, Eingabefeldgrenzen und Fokuspaare über 3:1.

| Farbpaare | Tag | Nacht |
|---|---:|---:|
| Haupttext / Karte | 15,40:1 | 15,14:1 |
| Nebentext / Karte | 6,28:1 | 8,63:1 |
| Nebentext / Hintergrund | 5,81:1 | 10,03:1 |
| Grüner Text / Karte | 7,13:1 | 8,89:1 |
| Violett / weiche Fläche | 6,27:1 | 5,50:1 |
| Violett / Karte (Fokus) | 7,10:1 | 5,69:1 |
| Eingabefeldgrenze / Karte | 3,86:1 | 4,87:1 |
| Weiß / primärer grüner Button | 7,13:1 | 7,13:1 |

### Aktualisierte Screenshots

48 Sprach-/Design-/Breitenbilder: `output/playwright/{01-cockpit,02-studio,03-creator}-{de,en,es,fr}-{day,night}-{390,1440}.png`. Zusätzlich neun französische Zustandsbilder: `{Konzept}-fr-{offline,loading,error}-390.png`. Die neun bisherigen Konzeptbilder (`-1440`, `-390`, `-inverted-mobile`) wurden ebenfalls aktualisiert. Die früheren Produkt-Dashboard-Screenshots bleiben unangetastet.

Visuell geprüft: französisches Studio bei 1440 Pixeln, spanischer Creator bei 390 Pixeln/Nacht und französisches Cockpit im Fehlerzustand mit sichtbarem Diagnosefokus. Die Übersetzungen sind vollständig erstellt, jedoch nicht durch Muttersprachler abgenommen.

### Grenzen

Dies ist eine gezielte Kontrast-, Tastatur- und Layoutprüfung, keine vollständige WCAG-Zertifizierung. Kein Screenreader, kein Betriebssystem-Kontrastmodus, kein Browser-Zoom-/Textabstands-Audit und keine geräteübergreifende Abnahme. Farbwerte wurden für ausgewählte gemeinsame Paare geprüft, nicht jedes gerenderte Pixel. Dekorative Kartenrahmen sind bewusst subtil. Plugin-/OBS-Bereitschaft, Aktivitäten, Warteschlangen und Zielwerte bleiben fiktive Beispieldaten und dürfen nicht als aktuelle Appzustände gelesen werden. Keine echten Profile, Zugangsdaten, Produktdateien oder Live-Aktionen wurden verwendet oder geändert.
