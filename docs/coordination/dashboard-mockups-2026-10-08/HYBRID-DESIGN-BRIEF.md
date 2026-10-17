# Hybrid-Designbrief: ruhiger Creator-Start mit aufgabenorientierter Navigation

**Zweck:** Umsetzbare Gestaltungsgrundlage für eine mögliche vierte Richtung. Sie verbindet die ruhige, priorisierte Startfläche von Mockup 01 mit der aufgabenorientierten Navigation von Mockup 03. Dieser Brief wählt keine der drei Richtungen als finales Produktdesign aus.

**Rahmen:** Grün, Weiß und Violett bleiben die prägenden Markenfarben. Tag und Nacht passen Kontrast und neutrale Flächen sinnvoll an. Die Startfläche soll weniger Kartenkonkurrenz haben, trotzdem die wichtigsten Live-Informationen und Handlungen zeigen. Alle 42 bestehenden Dashboard-Views bleiben erreichbar. Community-Chat/Chatango bleibt vollständig abwesend. Closed-Beta-Apps dürfen nicht mit einer öffentlichen Downloadmöglichkeit verwechselt werden.

## Designprinzip

Die Navigation erklärt, **wofür** eine Funktion da ist; der Startbereich zeigt nur, **was jetzt wichtig** ist. Die Startseite verwendet eine klare, vertikale Hierarchie statt eines gleichgewichtigen Kachelrasters. Plugins liegen in aufgabenorientierten, durchsuchbaren Gruppen. Häufige Aktionen sind gepinnt; der vollständige Funktionsumfang bleibt über Navigation und Suche zugänglich.

## Informationsarchitektur

### App-Rahmen

- **Kopfzeile:** LTTH-Marke, Verbindungsstatus mit Text, Theme-Schalter, Sprache, Profil und System-/Power-Aktion. Status und Profil bleiben auf allen Views erkennbar.
- **Aufgabennavigation:** permanente, einklappbare linke Leiste auf breiten Ansichten. Sie enthält einen klar beschrifteten Such-/Filtereingang, optionale Favoriten und die sieben vorhandenen Gruppen. Jede der 42 Views ist über eine eindeutige Menüzeile erreichbar. Gruppen zeigen Namen und Anzahl; offene/geschlossene Zustände sind sichtbar und semantisch ausgezeichnet.
- **Hauptfläche:** Startübersicht oder gewählte View, mit einer H1 pro Ansicht. Die Navigation bleibt konsistent, damit Nutzer nicht zwischen Startseite und Plugin-Modulen die Orientierung verlieren.
- **Keine rechte Community-Spalte:** Kein Chatango, Community-Chat-Panel, Chat-iframe, Chat-Eingabefeld oder Community-Chat-Navigationspunkt. TikTok-Chatereignisse können nur im bestehenden Events-/Statistikbereich erscheinen, falls ihre Parität bestätigt wird.

### Startfläche

Reihenfolge für die erste Ansicht:

1. **Kompakter Begrüßungs-/Arbeitskontext:** ein kurzer Titel und erklärender Satz; keine große Profilkarte.
2. **Verbindungsleiste:** Verbindung, klarer Online-/Offline-Status, Verbinden/Trennen. SessionID-Extraktion/-Import, Diagnose, Streamzeit-Debug und Healthdetails in einem beschrifteten Verbindungs-Detailbereich.
3. **Ein segmentierter KPI-Streifen statt sechs Karten:** Laufzeit, Zuschauer, Likes, Münzen, Follower, Geschenke. Alle Werte bleiben gleichrangig lesbar; bei schmaler Breite umbrechen sie in ein kompaktes Raster.
4. **Eine primäre Live-Zeile:** aktives Ziel plus Fortschritt, daneben höchstens drei letzte Ereignisse als einfache Zeilen. Vollständiges Protokoll und weitere Zielverwaltung sind klare Weiterwege.
5. **Gepinnte Aktionen:** maximal vier redaktionell sichtbare Schnellaktionen. Ein „Alle Aktionen“-Weg öffnet die vorhandenen Schalter und Details. Der OpenShock-Notstopp bleibt als separate, sofort erreichbare Sicherheitsaktion sichtbar, solange die Integration aktiv ist; er darf nicht zwischen normalen Pins verschwinden.
6. **Sekundäre Hinweise in einer ruhigen Zeile oder einklappbaren Region:** Updates/Release Notes und dynamische Tools/Plugins erhalten einen klaren Einstieg, aber keine konkurrierenden großen Kachelgitter.

Das Layout verwendet Abstände, Typografie und leichte Trennlinien zur Gruppierung. Keine durchgehende Karte pro Plugin, KPI oder Ereignis. Farbe kennzeichnet Status, Primäraktionen und sekundäre Akzente und ersetzt keine Beschriftung.

### Aufgabenbereiche und View-Parität

Die bisherigen sieben Funktionsgruppen bleiben als Startpunkt bestehen, erhalten aber nutzerorientierte, lokalisierbare Namen und sichtbare Such-/Filterbarkeit. Die folgenden 42 View-IDs müssen in mindestens einer Gruppe als navigierbares Ziel vorhanden sein:

| Bereich im Navigationsmodell | Bestehende Views, vollständig zu erhalten |
|---|---|
| **Start / Core Functions** | Dashboard, ClarityHUD, Sidekick, Spotlight |
| **Automationen & Ziele** | Events, Flows, Goals, Advanced Timer |
| **Audio & Sprache** | TTS, Music Bot, Soundboard, Talking Heads, STT Ticker |
| **Visuals & Effekte** | Emoji Rain, Schnorrbecher, WebGPU Emoji Rain, Fireworks, WebGPU Fireworks, Flame Overlay, Visual FX Frame WebGPU |
| **Games & Engagement** | Quiz Show, Interactive Story, CoinBattle, Game Engine, Milestone Leaderboard, Gift Milestone, Gift Catalog, TopTier |
| **Integrationen** | Multi-Guest/VDO.Ninja, Multicam, OSC Bridge, OpenShock, Weather Control, WebGPU Weather Control, Stream Monsters, GCCE, Thermal Printer, AnimazingPal |
| **Verwaltung & Hilfe** | Plugin Store, Wiki, Settings, Config Import |

Diese Zuordnung ist eine Informationsarchitektur-Hypothese. Produktnamen können als sichtbare Untereinträge bestehen bleiben; Gruppennamen und Labels müssen lokalisiert werden. Suche darf Views filtern, aber keine davon aus dem vollständigen Navigationsbestand entfernen. Favoriten sind ein zusätzlicher Weg, kein Ersatz für den vollständigen Katalog.

**Paritäts-IDs aus dem aktuellen HTML (42):** advanced-timer, animazingpal, clarityhud, coinbattle, config-import, dashboard, emoji-rain, events, fireworks, flame-overlay, flows, game-engine, gcce, gift-catalog, gift-milestone, goals, interactive-story, milestone-leaderboard, multi-guest, multicam, music-bot, openshock, osc-bridge, plugins, quiz-show, schnorrbecher, settings, sidekick, soundboard, spotlight, stream-monsters, stt-ticker, talking-heads, thermal-printer, toptier, tts, visual-fx-frame-webgpu, weather-control, webgpu-emoji-rain, webgpu-fireworks, webgpu-weather-control, wiki.

## Closed-Beta-Apps und Verfügbarkeit

Eine Closed-Beta-Kennzeichnung muss aussagen, ob eine Funktion bereits lokal vorhanden oder noch nicht verfügbar ist. „Beta“ darf keine Download- oder Installationszusage implizieren.

- **Lokal vorhanden:** Badge „Lokal · Closed Beta“ plus kurzer Hilfetext „In dieser LTTH-Installation verfügbar; kein öffentlicher Download.“ Nur eine passende lokale Öffnen-/Details-Aktion zeigen.
- **Noch nicht verfügbar:** Badge „Coming soon · Closed Beta“ plus „Noch nicht verfügbar; kein Download.“ Keine Download-, Store- oder Install-Schaltfläche und keine Interaktion, die wie eine öffentliche Freigabe wirkt.
- **Status getrennt modellieren:** Zugangsklasse Closed Beta und Verfügbarkeit lokal/coming soon sind unterschiedliche Informationen. Das UI braucht eine eindeutige Statusquelle; die vorhandene Zugangsklasse allein sagt nicht automatisch, ob ein Paket lokal installiert oder künftig verfügbar ist.
- Badges müssen sowohl als Text als auch über ein Icon/Shape erkennbar sein. Farbe allein reicht nicht. Der Status bleibt auf der Plugin-Karte und in der Detailansicht identisch.
- Closed-Beta-Apps erscheinen nicht als „downloadbare Produkte“ in Start-Shortcuts. Die Navigation kann zu lokal vorhandenen Funktionen führen; kommende Funktionen zeigen eine nicht ausführbare Detail-/Statusansicht.

Die genaue Liste lokaler Closed-Beta-Apps und geplanter Apps ist vor einer Umsetzung zu bestätigen; dieser Brief erfindet keine Verfügbarkeit pro Plugin.

## Farb- und Theme-Regeln

- **Grün:** primäre Aktion, aktive Verbindung und positive Zustände.
- **Weiß/helle neutrale Flächen:** Text und Lesefläche im Tagmodus; im Nachtmodus werden diese Flächen zu dunklen, entsättigten Grün-/Graphitflächen und Haupttext wird hell.
- **Violett:** sekundäre Hervorhebung, Fortschritt und Fokusakzent; nicht für Fehler- oder Sicherheitswarnungen zweckentfremden.
- Für kleine Texte eigene dunkle Akzenttöne verwenden, nicht denselben hellen Grünton wie bei großen Aktionsflächen. Tag-/Nachtpalette jeweils getrennt prüfen.
- Status verwendet zusätzlich Text und Form/Icon. Online/Offline, Closed Beta, Coming soon, Gefahr und deaktiviert müssen ohne Farberkennung unterscheidbar bleiben.

## Responsive und Interaktionsregeln

- **Breit (ab ca. 1100 CSS px):** permanente Aufgabenleiste und großzügige zentrale Startfläche; keine zweite Chat-/Werbespalte.
- **Mittel (ca. 700–1099 px):** Leiste kann auf beschriftete schmale Rail reduziert werden; Gruppen bleiben über Namen/Tooltip und Suche erreichbar. Start-KPIs umbrechen, statt horizontalen Seiten-Scroll einzuführen.
- **Schmal (320–699 px):** Navigation wird zu einem eindeutig beschrifteten Drawer/Overlay mit Suche und Gruppen; beim Navigieren schließt sie zuverlässig und der Fokus kehrt sinnvoll zurück. Hauptinhalt einspaltig, KPI-Streifen in zwei oder drei Spalten, Aktionen als umbrochene Zeilen.
- Bei 320 CSS px kein horizontaler Seitenüberlauf. Lange Plugin-Namen, Status-Badges und deutsche Übersetzungen umbrechen ohne Abschneiden; Bedienelemente bleiben vollständig sichtbar.
- Jede der 42 Views ist über mindestens einen dokumentierten Weg erreichbar: Suche oder Gruppenliste. Direkte Favoriten und Startpins sind Zusatzwege.
- Chatango-/Community-Chat-Routen und -Einbettungen dürfen weder im Desktop- noch im mobilen Layout auftauchen.

## Accessibility-Abnahmekriterien

- Semantische Landmarks: benannte Hauptnavigation, Hauptinhalt, Kopfbereich und sinnvoll benannte Bereiche; genau eine H1 je View, logisch verschachtelte Abschnittsüberschriften.
- Alle Navigationsziele sind native Links oder Buttons. Aktive View mit `aria-current="page"`; einklappbare Gruppen mit `aria-expanded`; Theme-Schalter mit zugänglichem Namen und aktuellem Zustand.
- Vollständige Tastaturbedienung ohne Maus: Skip-Link, sichtbare Fokusreihenfolge von Navigation zu Inhalt, Suche, Gruppen, Pins und Aktionen. Fokusindikator mindestens 3 px klar kontrastierend und nicht abgeschnitten; beim Öffnen/Schließen des mobilen Drawers Fokus sinnvoll setzen und zurückgeben.
- Normaler Text erreicht mindestens 4,5:1 Kontrast; großer Text mindestens 3:1. Fokusindikatoren, Icons und nichttextuelle Zustände erreichen mindestens 3:1 zur angrenzenden Fläche. Tag und Nacht werden getrennt rechnerisch und visuell geprüft.
- Touch-/Klickziele sind komfortabel, nicht nur die Icon-Pixel. Icon-only-Aktionen erhalten eindeutige zugängliche Namen. Bewegung respektiert `prefers-reduced-motion`.
- Zoom/Reflow bei 200 % und Breiten 320, 390, 768 und 1280 CSS px: kein Verlust von Inhalt/Funktion und kein horizontaler Seiten-Scroll.
- Statusänderungen wie Verbindung, Beta-Verfügbarkeit und Fehler werden als lesbarer Text und bei dynamischen Updates mit passender Live-Region angekündigt, ohne unnötige Ansagen.

## Funktionale Paritäts-Abnahme

- Vollständiger Nachweis der 42 View-IDs in Navigation/Suche; jede öffnet die zugehörige bestehende View ohne neuen Produktbereich zu erfinden.
- Startfläche bietet weiterhin Verbindung plus Session-/Diagnoseweg, sechs KPIs, Events/Statistikdetails, Updates, dynamische Plugin-Shortcuts und Flow-/Zielverwaltung über klare Folgewege.
- Alle sieben Original-Schnellaktionen bleiben auffindbar. OpenShock-Notstopp bleibt im aktiven Kontext sofort erreichbar und klar von normalen Aktionen getrennt.
- TikTok-Chatereignisse werden, falls beibehalten, ausschließlich im Events-/Statistikbereich geführt; kein Chatango- oder Community-Chat-UI.
- Closed-Beta-Zustände zeigen „lokal“ oder „coming soon“ klar, enthalten keinen User-Download und lassen keine falsche öffentliche Installierbarkeit vermuten.
- Lokale Beispieldaten und reale Live-/Kontodaten sind visuell eindeutig getrennt.

## Offene Annahmen und Tradeoffs

1. Die sieben vorhandenen Gruppen werden als Ausgangspunkt genutzt; konkrete neue deutsche Gruppennamen und die Zuordnung einzelner Views müssen mit Nutzern und Produktverantwortlichen validiert werden.
2. Ein globales Suchfeld macht 42 Ziele auffindbarer, verlangt aber gute Namen, Synonyme, Tastaturbedienung und Lokalisierung. Es ersetzt nicht die sichtbare Gruppennavigation.
3. Vier Startpins reduzieren Konkurrenz, aber Nutzer mit anderem Workflow brauchen eine konfigurierbare Auswahl oder Favoriten. Die Begrenzung darf keine bestehende Funktion verstecken, ohne Such-/Gruppenweg.
4. Die sechs Kennzahlen in einer Zeile sind kompakter, können aber weniger visuelle Prominenz als einzelne Karten haben. Wichtigkeit und Reihenfolge brauchen Produktfeedback.
5. Das Verbergen von Diagnose auf der Startseite vereinfacht den Einstieg, verlängert im Fehlerfall aber den Weg. Der Verbindungsstatus muss den Detailzugang sichtbar halten.
6. Der dauerhaft erreichbare Notstopp konkurriert mit dem Ziel einer ruhigen Startfläche; Sicherheitszugriff und visuelle Zurückhaltung müssen gemeinsam gestaltet werden.
7. Für Closed-Beta-Apps braucht es getrennte Statusdaten für Zugangsgruppe, lokale Installation und kommende Verfügbarkeit. Welche App in welchem Status ist, bleibt ungeklärt.
8. Chatango ist in den Mockups und im Hybrid vollständig abwesend. Die fachliche Fortführung von TikTok-Chat-Ereignisdetails ist eine separate Paritätsentscheidung.

## Kein Richtungsentscheid

Dieser Brief beschreibt eine mögliche Verbindung der zwei gewünschten Stärken. Er erklärt keine der drei bestehenden Richtungen zur Gewinnerin und autorisiert keine Produkt-/Quellcodeänderung.
