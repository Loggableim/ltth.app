# Handoff: Implementierungsmatrix Dashboard-Mockups

Statische Gegenüberstellung der drei Designrichtungen mit realen Dashboard-Komponenten, Navigations-/Plugin-Verträgen, Aufwand/Risiko, abhängigen i18n-/Datenfragen und Anforderungsabdeckung: `IMPLEMENTIERUNGSMATRIX.md`.

Bestätigte Integrationsanker: Home hat fünf Hauptbereiche und sechs Live-Statistiken; der Produktcode enthält sieben Navigationsgruppen mit 42 View-Links und 42 View-Containern. `navigation.js` verwaltet aktive Views, lokalen Navzustand, Lazy-Loading und Plugin-Inventar/Gating. Store-Code unterscheidet Closed-Beta-Zugang von installierten/catalog-only/Package-Status; die Prototyp-Verzeichnisse kennzeichnen die elf IDs aus der Release-Policy mit `Closed Beta · Coming Soon` und bieten dafür keine Download-/Installationsaktion. Diese Mockup-Badges spiegeln die lokale Policy, aber nicht live geprüfte Verfügbarkeit oder Account-Berechtigungen.

Die statischen Mockups enthalten alle 42 View-IDs und machen die elf Closed-Beta-Einträge sichtbar kenntlich; Browserprüfung und automatisierte Assertions bestätigen Darstellung, Locale, Suche und lokale Mockup-Ziele. Sie belegen keine Produkt-/Backendintegration, keine tatsächliche Store-Zugänglichkeit und keine Download-Sperre im laufenden Produkt. Alle zeigen die Markenpalette/Tag-Nacht-Variante und lassen Chatango weg. Aufwandseinschätzung: Richtung 01 niedriger bis mittel bei Erhalt der bestehenden Sidebar, Richtung 02 mittel bis hoch wegen Console-/Realtime-Komposition, Richtung 03 hoch wegen vollständiger Navigation-Neuzuordnung und Suche. Das ist eine relative technische Einschätzung, keine Designentscheidung.

README-Abschnitt mit Kurzvergleich ergänzt: `README-Vergleich.md`. Keine Produktdateien geändert, keine Richtung ausgewählt.
