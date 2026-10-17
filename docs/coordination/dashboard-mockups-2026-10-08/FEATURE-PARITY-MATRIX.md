# Feature-Paritätsmatrix: LTTH Dashboard und drei Mockup-Richtungen

Erfasst am 8. Oktober 2026 aus dem aktuellen lokalen Dashboard-Markup und dem referenzierten Screenshot. Dies ist eine Entscheidungsgrundlage, keine Produktempfehlung. Die Zuordnungen sind konzeptionell; die HTML-Demos haben inzwischen lokale, synthetische Routen für drei Testaufgaben, aber keine Produktnavigation oder echten Pluginaktionen. Soundboard, Diagnose/Notstopp und WebGPU Weather zeigen reine Mockup-Ansichten.

Legende: **Start** = auf der Startfläche sichtbar; **Bereich/Detail** = thematisch gruppiert oder in einer Detailansicht; **Sekundär** = hinter „Mehr“, Werkzeuge oder einem weiteren Navigationsschritt; **Entfallen** = bewusst nicht dargestellt. 01 = Creator-Überblick, 02 = Live-Konsole, 03 = Arbeitsbereiche. „Nicht verdrahtet“ bedeutet, dass der gezeigte Weg im HTML-Mockup noch keine Produktansicht öffnet.

## Aktuelle Funktionsblöcke und Wege

| Funktionsblock | Aktueller sichtbarer Weg | Umfang / Anmerkung |
|---|---|---|
| Hauptnavigation | Permanente linke Sidebar mit sieben Gruppen: Core Functions, Automations & Goals, Audio & Voice, Visual FX, Games & Engagement, Integrations und Management; Gruppen einklappbar. | 42 unterschiedliche Inhaltsansichten sind im HTML als Views markiert. Meist ein Klick aus einer geöffneten Gruppe. |
| Dashboard-Start | Dashboard-View: TikTok Live Connection, Quick Actions, Live Statistics, Release Notes & Updates, Tools & Plugins. | Verbindung und Schnellaktionen stehen vor den weiteren Startblöcken. |
| TikTok-LIVE-Verbindung | Startseite → Connection: Nutzername, Verbinden/Trennen, SessionID extrahieren/importieren, Verbindungsdetails, Diagnose, Streamzeit-Debug, Healthstatus. | Die drei Mockups zeigen nur Status und Verbinden-CTA. |
| Schnellaktionen | Startseite: TTS, Soundboard, Flows, Emoji Rain, WebGPU Emoji Rain, OSC Bridge, OpenShock-Notstopp. Weitere Quick-Icons bei eingeklappter Sidebar. | Sieben Schalter; der Notstopp ist ein besonders wichtiger Zugriff. |
| Live-Kennzahlen | Startseite: Laufzeit, Zuschauer, Likes, Münzen, Follower, Geschenke. | Im Events-Bereich weitere Statistikdetails: Viewer, TikTok-Chatereignisse, Likes, Münzen, Follower, Subscribers/Superfans, Gifts. |
| Ereignisprotokoll | Sidebar → Events; Eventliste und auswählbare Statistikdetails. | TikTok-Chat als Ereigniskategorie ist nicht das Community-Chat-/Chatango-Fenster. |
| Updates | Startseite → Release Notes & Updates, ausblendbar, zusätzlicher Changelog. | In keinem Mockup sichtbar. |
| Tools & Plugins | Startseite → dynamisches Shortcut-Raster. | Inhalt hängt von installierten Plugins ab; Mockups zeigen feste Beispiele. |
| Flows | Sidebar → Flows; Editor/Wizard, JSON-Import und Sammelaktionen. | Ein Schnellschalter ersetzt diese Verwaltung nicht. |
| Profil/System | Kopfzeile: Theme, Sprache, Benutzer/Profil, Power/Systemsteuerung. | Mockups vereinfachen die Kopfzeile; Sprache, Profilwechsel und Power fehlen teils. |
| Community-Chat / Chatango | Im Referenz-Screenshot als rechtes Chatfenster und Sidebar-Eintrag sichtbar. Im aktuell geprüften dashboard.html, navigation.css und dashboard.js kein Chatango-/Community-Chat-Markup oder Label gefunden. | Screenshot zeigt einen früheren oder abweichenden Stand. In allen Mockups **bewusst entfallen**. |

## Zuordnung der Startblöcke

| Aktueller Block | 01 – Creator-Überblick | 02 – Live-Konsole | 03 – Arbeitsbereiche | Mehrklicks / möglicher Verlust |
|---|---|---|---|---|
| Startübersicht | **Start:** Verbindung, 4 KPIs, Ziel, Schnellzugriffe, letzte Ereignisse. | **Start:** Status, 4 KPIs, Verlauf, Eventstrom, Ziele/Systemstatus. | **Start:** Workspace, Verbindung, 3 KPIs, Bereichskarten, Aktivität. | 01 ruhiger Einstieg; 02 Betriebsansicht; 03 Aufgabenfindung. Lokale Demo-Routen verdrahtet; echte Produktaktionen bleiben **nicht verdrahtet**. |
| Verbindung | **Start:** Verbinden-CTA. | **Start:** prominenter Stream-Eingang. | **Start:** Offline-Status und CTA. | SessionID, Diagnose, Debug fehlen; künftig mindestens **Bereich/Detail**. |
| Schnellaktionen | **Start:** Soundboard, TTS, Automationen, Events; Rest **Sekundär** hinter „Mehr“. | **Start:** Soundboard, TTS, generische Schnellaktion; Werkzeuge **Sekundär**. | **Start:** Automationen, Soundboard, ClarityHUD als Pins; Rest **Bereich/Sekundär**. | Keiner zeigt die sieben Schalter vollständig. OpenShock-Notstopp fehlt überall; direkte Emoji-Rain-, WebGPU- und OSC-Schalter ebenfalls. |
| Live-KPIs | **Start:** Viewer, Likes, Münzen, Follower; Laufzeit/Gifts fehlen. | **Start:** Viewer, Likes, Gifts, Laufzeit; Münzen/Follower fehlen. | **Start:** Viewer, Likes, Münzen; Laufzeit/Follower/Gifts fehlen. | Jede Richtung verliert mindestens zwei der sechs aktuellen Startkennzahlen. |
| Event-Details | **Sekundär:** Protokolllink. | **Bereich/Detail:** Eventstrom und Vollprotokoll-Link; Stat-Panels fehlen. | **Sekundär:** Events-Link und letzte Ereignisse. | Die sieben aktuellen Statistikdetails brauchen Protokoll- plus Detailauswahl. 02 liegt am nächsten am bisherigen Zugang. |
| Updates/Changelog | **Entfallen** | **Entfallen** | **Entfallen** | Kein Ersatzweg sichtbar. |
| Dynamische Tool-Shortcuts | **Sekundär:** „Mehr“; nur feste Aktionen am Start. | **Sekundär:** Werkzeuge-Icon; keine Pluginliste. | **Start:** 3 Pins; übrige via „Alle anzeigen“. | Dynamische installierte Shortcuts sind nicht abgebildet; mehr Klicks und geringere Auffindbarkeit möglich. |
| Flows | **Start:** Automationen-Schnellzugriff. | **Start:** generische Aktion; Werkzeuge-Navigation. | **Start:** Automationen-Pin/Bereich. | Wizard, Import und Bulk-Aktionen bleiben **Bereich/Detail**. |
| Ziele/Timer | **Start:** ein Followerziel; übrige Ziele/Timer **Sekundär**. | **Start:** Fortschritt; Timer **Bereich/Detail**. | **Bereich:** Stream & Ziele. | Zielkonfiguration und Advanced Timer sind nicht auf der Startfläche. |
| Systemstatus | **Sekundär:** nur Verbindungsstatus. | **Start:** Overlay-, Audio- und Prüfstatus. | **Sekundär:** Verbindungsstatus. | 01/03 verlieren schnellen Diagnoseblick; 02 ist am vollständigsten. |
| Community-Chat/Chatango | **Entfallen** | **Entfallen** | **Entfallen** | Absichtliche UI-Entfernung. TikTok-Chatereignisse in Events separat bewerten. |

## Plugin- und View-Parität

Alle aktuell erfassten Sidebar-Funktionsgruppen und ihre einzelnen Views sind nachfolgend benannt. Die Zielorte sind Konzeptvorschläge, keine fertige Navigation.

| Aktuelle Gruppe und Views | 01 – Creator-Überblick | 02 – Live-Konsole | 03 – Arbeitsbereiche | Mehrklicks / Verlust |
|---|---|---|---|---|
| **Core Functions:** ClarityHUD, Sidekick, Spotlight | ClarityHUD/Spotlight **Sekundär** via „Mehr“; Sidekick **Sekundär**. | Alle **Sekundär** via Werkzeuge. | ClarityHUD **Start**-Pin; Spotlight **Bereich** Visuals; Sidekick **Bereich** Plugins & Integrationen. | Spotlight/Sidekick kosten voraussichtlich mindestens einen zusätzlichen Gruppenklick. |
| **Automations & Goals:** Events, Flows, Goals, Advanced Timer | Events/Flows/Goals **Start** kuratiert; Timer **Sekundär**. | Events/Flows/Goals **Start**; Timer **Bereich/Detail**. | Events **Start**-Link, Flows **Start**-Pin, Goals/Timer **Bereich** Stream & Ziele. | Tiefe Flow-/Zielverwaltung nicht gezeigt. |
| **Audio & Voice:** TTS, Music Bot, Soundboard, Talking Heads, STT Ticker | TTS/Soundboard **Start**, Rest **Sekundär**. | TTS/Soundboard **Start**, Rest **Sekundär**. | Alle **Bereich** Audio & Sprache; Soundboard **Start**-Pin. | Drei von fünf verlieren Startzugriff. |
| **Visual FX:** Emoji Rain, Schnorrbecher, WebGPU Emoji Rain, Fireworks, WebGPU Fireworks, Flame Overlay, Visual FX Frame WebGPU | Alle **Sekundär** via „Mehr“. | Alle **Sekundär** via Werkzeuge. | Alle **Bereich** Visuals. | Sieben direkte Einzelfunktionen werden gruppiert. |
| **Games & Engagement:** Quiz Show, Interactive Story, CoinBattle, Game Engine, Milestone Leaderboard, Gift Milestone, Gift Catalog, TopTier | Alle **Sekundär**. | Alle **Sekundär** via Werkzeuge. | **Bereich** Plugins & Integrationen; Meilenstein-/Giftziele ggf. Stream & Ziele. | Acht Views ohne eigenen Startzugriff; Gruppierung erhöht Klicktiefe. |
| **Integrations:** Multi-Guest/VDO.Ninja, Multicam, OSC Bridge, OpenShock, Weather Control, WebGPU Weather Control, Stream Monsters, GCCE, Thermal Printer, AnimazingPal | Alle **Sekundär** via „Mehr“. | Alle **Sekundär** via Werkzeuge. | **Bereich** Plugins & Integrationen; einzelne Werkzeuge ggf. Visuals/Audio. | Zehn Views stark gebündelt; OSC/OpenShock verlieren sichtbaren Einzelzugriff, Notstopp fehlt. |
| **Management:** Plugin Store, Wiki, Settings, Config Import | Store/Wiki/Import **Sekundär**; Settings-Zahnrad **Start**. | Store/Wiki/Import **Sekundär**; Settings im Rail. | Plugins & Integrationen, Hilfe & Wiki, Settings oben/Verwaltung, Import **Bereich/Detail**. | Kein Mockup zeigt Store-Suche, Importdialog oder Wiki-Inhalte. |

### Vollständige View-ID-Inventarliste (42 verschiedene IDs)

advanced-timer · animazingpal · clarityhud · coinbattle · config-import · dashboard · emoji-rain · events · fireworks · flame-overlay · flows · game-engine · gcce · gift-catalog · gift-milestone · goals · interactive-story · milestone-leaderboard · multi-guest · multicam · music-bot · openshock · osc-bridge · plugins · quiz-show · schnorrbecher · settings · sidekick · soundboard · spotlight · stream-monsters · stt-ticker · talking-heads · thermal-printer · toptier · tts · visual-fx-frame-webgpu · weather-control · webgpu-emoji-rain · webgpu-fireworks · webgpu-weather-control · wiki.

## Relative Klicktiefe und offene Paritätsfragen

- **Aktuell:** Eine Ansicht ist typischerweise mit einem Klick aus der geöffneten Sidebar-Gruppe erreichbar; eingeklappte Gruppen brauchen einen zusätzlichen Klick. Schnellschalter und sechs KPIs liegen direkt auf der Startfläche.
- **01:** Verbindung, Ziel und vier Aktionen bleiben sofort sichtbar. Viele Plugins wären hinter dem nur angedeuteten „Mehr“-Weg; Folgeklicks sind nicht spezifiziert.
- **02:** Live-Aktionen/Ereignisse sind sichtbar. Einzelplugins liegen hinter Werkzeuge; Zusatzklicks hängen von einer noch nicht gezeigten Zwischenansicht ab.
- **03:** Erst Themenbereich, dann Funktion; gegenüber der Sidebar typischerweise ein Klick mehr, dafür weniger gleichrangige Navigationspunkte.

Klickdifferenzen sind aus den Entwürfen abgeleitet, nicht gemessene Interaktionszeiten. Die Demos verdrahten lokale Ansichten und Rückwege; Produkt-/Pluginaktionen bleiben nicht verdrahtet.

Offene Paritätsfragen: Soll der OpenShock-Notstopp dauerhaft sichtbar bleiben? Welche sechs KPIs müssen auf dem Start bleiben? Müssen SessionID und Diagnose unmittelbar erreichbar sein? Soll TikTok-Chat als Eventdetail bestehen bleiben, obwohl Chatango verschwindet? Sind dynamische Plugin-Shortcuts erforderlich? Welche Einzelviews brauchen weiterhin einen Ein-Klick-Zugang? Diese Matrix entscheidet die Fragen nicht.
