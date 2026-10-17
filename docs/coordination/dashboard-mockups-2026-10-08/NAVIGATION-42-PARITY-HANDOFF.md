# Handoff – 42-View-Navigation in den drei Dashboard-Mockups

Datum: 08.10.2026

## Ergebnis

Alle drei lokalen, synthetischen Mockups enthalten jeden der 42 aktuellen `data-view`-Navigationsziele genau einmal. 01 und 02 erhalten die sieben vorhandenen Navigationsgruppen und unterscheiden sich über Einbettung (Startfläche vs. Dialog in der Live-Rail). 03 fasst dieselben Ziele in sechs aufgabenorientierte Gruppen um. Alle drei unterstützen Suche, auf-/zuklappbare Gruppen, Auswahlvorschau und Tastaturbedienung.

Die Auswahl ist nur ein Mockup-Zustand. Sie ändert keinen Produktzustand und löst keine echte Funktion aus. Die drei Informationsarchitekturen bleiben bewusst unterscheidbar; keine Richtung wurde gewählt.

## Prüfnachweise

- `node verify-view-parity.cjs`: 42/42 eindeutige aktuelle IDs pro Mockup; 12 Locale-Läufe; 320/390/720/1280/1440 CSS px; Tag/Nacht; 120 Überlauf- und 120 Suche/Auswahlchecks; 72 Screenshots; keine JS-Fehler oder externen Requests.
- `node verify-responsive.cjs`: 15 Variante/Breite-Paare, Tag/Nacht, 30 Screenshots; kein horizontaler Überlauf; sichtbarer 3-px-Fokusrahmen.
- `node verify-design-colors.cjs`: 124 Kontrastpaare, alle mindestens 4,5:1.
- `node verify-gallery.cjs`: Galerie und Mockup-Links, vier Locales, Tastatur/ARIA und 24 Tag/Nacht-Überlaufchecks bestanden.

Screenshots: `view-directory-check/` und `responsive-check/`.

## Umfang

Nur Dateien unter `docs/coordination/dashboard-mockups-2026-10-08/` wurden für diese Folgeiteration bearbeitet. Produktdashboard, Navigation und Backend bleiben unverändert. Die begleitende Vergleichsdokumentation steht in `README-Vergleich.md`.
