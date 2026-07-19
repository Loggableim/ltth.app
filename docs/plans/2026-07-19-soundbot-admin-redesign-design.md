# Soundbot Admin UI Redesign

## Ziel

Der Soundbot erhält eine vollständig neu strukturierte Adminoberfläche für den integrierten LTTH-Browser. Das Redesign behebt gleichzeitig die im Live-Test bestätigten Funktions-, Diagnose-, Übersetzungs- und Accessibility-Fehler, ohne bestehende APIs, DOM-Funktions-IDs oder gespeicherte Nutzerdaten zu brechen.

## Gestaltungsprinzipien

- Die laufende Musik bleibt die wichtigste Information. Titel, Requester, Position, Transport und Queue-Stand sind ohne Scrollen erkennbar.
- Live-Sicherheit bleibt dauerhaft erreichbar, nimmt aber nicht mehr den größten Teil des ersten Viewports ein.
- Jeder Navigationspunkt besitzt genau ein eigenes, semantisch korrekt verknüpftes Panel. Player und Queue werden getrennt.
- Kritische Aktionen sind klar von häufigen Aktionen getrennt. Not-Aus bleibt rot; Reset, Testton und Diagnoseexport sind sekundär.
- Die Oberfläche nutzt ein kompaktes Broadcast-Console-Design: dunkle Flächen, gut lesbare Kontraste, Cyan/Violett als Akzent, klare Statusfarben und reduzierte visuelle Unruhe.
- Desktop verwendet eine kompakte seitliche beziehungsweise sticky Navigation; auf schmalen Viewports wird sie horizontal scrollbar. Bei 390 Pixeln darf kein Seiten-Overflow entstehen.
- Alle interaktiven Ziele sind mindestens 44 Pixel hoch beziehungsweise besitzen eine mindestens 44 Pixel große klickbare Fläche. Native Checkboxen sind mindestens 20 Pixel sichtbar.
- Bewegungen respektieren `prefers-reduced-motion`.

## Informationsarchitektur

Die vorhandenen Funktionsbereiche bleiben erhalten, werden aber neu gruppiert und visuell vereinheitlicht:

1. Kopfzeile mit Soundbot-Identität, tatsächlichem Playback-Zustand, MPV-Status und Queue-Zahl.
2. Kompakte Live-Sicherheitsleiste mit Lock-Zustand, Not-Aus und Diagnosezugang.
3. Navigation mit eigenen Panels für Player, Queue, Auto-DJ, History, Katalog, Playlists, Einstellungen, Aliases, Moderation und Overlay.
4. Player-Panel als zweispaltige Arbeitsfläche: Suche/Vorschau sowie Now Playing/Transport. Auf kleinen Viewports wird daraus eine Spalte.
5. Queue-Panel als eigenständiger Arbeitsbereich mit Zähler, Leerzustand und Drag-and-drop-Liste.
6. Diagnosewerte als kompakte Kartenmatrix unter der Sicherheitsleiste; sensible oder signierte Medienfragmente werden niemals angezeigt.

## Verhaltenskorrekturen

- Ein Viewer-Request während pausierter Wiedergabe wird eingereiht und ersetzt den pausierten Track nicht. Das gilt für Dashboard und Chat.
- Idle-Autoplay bleibt unverändert: Ist wirklich kein Playback belegt, startet ein Request sofort.
- Der Diagnosewert für den tatsächlichen MPV-Titel fällt bei signatur- oder tokenartigen Medienbezeichnungen auf den kanonischen Tracktitel zurück.
- Player- und Queue-Navigation schalten echte, getrennte Panels. Ein Wechsel zum Player zeigt den Playerbereich statt die alte Queue-Scrollposition.
- Die Soundbot-Initialisierung wartet auf `window.i18n.ready`; dadurch entstehen beim Cold Boot keine vorzeitigen Übersetzungswarnungen.
- Die sichtbare Adminoberfläche verwendet benannte Übersetzungsschlüssel in Deutsch, Englisch, Spanisch und Französisch. Historische `generated.*`-Schlüssel bleiben nur dort bestehen, wo sie außerhalb der neu gestalteten Adminoberfläche weiterhin gebraucht werden.
- MutationObserver werden nur an gültige Element-Knoten gebunden. Das gilt für den Soundbot-Frame und den Dashboard-Bootstrap.

## Kompatibilität und Rollout

- Bestehende API-Routen, Socket-Events, Statusfelder und Funktions-IDs bleiben erhalten.
- Queue, History, Bans, Katalog, Playlists und Einstellungen werden nicht migriert oder gelöscht.
- Der laufende LTTH-Prozess wird nicht neu gestartet.
- Nach vollständiger automatischer Abnahme werden die Dateien in den aktiven `main`-Worktree integriert und ausschließlich `music-bot` neu geladen. Anschließend wird die Oberfläche im integrierten Browser erneut geprüft.

## Abnahme

- Dashboard- und Chat-Requests bei Pause bleiben in Queue-Position 1; der aktive Playback-Vorgang und seine Position bleiben identisch.
- Jede Tab-Schaltfläche kontrolliert genau ein vorhandenes Panel, jedes Panel verweist auf genau eine Tab-ID, und Pfeil/Home/End-Navigation funktioniert.
- Seek, Pause/Resume, History-Votes, Katalogsuche und Playlist-CRUD bleiben funktionsfähig.
- Kein sichtbarer signierter Medien-URL-Teil erscheint in Health oder Diagnoseexport.
- DE/EN/ES/FR werden vollständig und ohne Mischsprache gerendert.
- Alle Music-Bot-Suites, Lint, CSS-Build und `git diff --check` bestehen; bekannte globale Baselinefehler werden separat ausgewiesen.
