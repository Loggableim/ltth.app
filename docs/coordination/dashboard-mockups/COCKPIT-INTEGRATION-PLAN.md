# Cockpit: read-only Integrationsplan

Stand: 8. Oktober 2026. Quelle ist der aktuelle, bereits umfangreich veränderte Checkout von `Loggableim/ltth.app`, nicht nur HEAD. Dieser Auftrag hat ausschließlich diesen Bericht angelegt. Keine HTTP-Anfragen, Socket-Verbindungen, Profilwechsel oder Live-Aktionen; keine Produktänderung und kein Testlauf. Die früheren 288 Browserprüfungen gelten den simulierten Mockups, nicht der nachfolgenden Produktintegration.

## Entscheidung und Umfang

Das Cockpit lässt sich als neue Anordnung der vorhandenen Dashboard-Elemente implementieren. Bestehende IDs und ihre Handler behalten; keine zweite Socket.IO-Verbindung, keine duplizierten IDs und keine aus DOM-Text zurückgelesenen Zahlen. `initializeSocketListeners()` bleibt für TikTok-Ereignisse der Einstieg; ein gemeinsames Cockpit-Viewmodel normalisiert Status, Kennzahlen und Frische. Bestehende Dashboardnavigation, Plugin-Verfügbarkeit, i18n und Profil-Neustartablauf weiterverwenden.

Vor einer Umsetzung müssen drei Entscheidungen fallen: TTS wirklich pausieren oder korrekt als Deaktivieren kennzeichnen; Kennzahlen bei Verbindungsverlust ausblenden oder als letzten Snapshot zeigen; „aktive Automationen“ als konfigurierte eingeschaltete Flows oder tatsächlich ausführbare Flows definieren. Die unten genannten Regeln sind Integrationsvorschläge, keine bereits vorhandenen API-Felder.

## Sichtbare Karte → DOM → Quelle

Alle Zeilen beziehen sich auf `01-cockpit.html`; die Musterwerte bleiben reine Mockdaten.

| Cockpitfläche | Aktuelle Produkt-DOM-/JS-Bindung | Socket-/HTTP-Vertrag | Umsetzung und offene Semantik |
|---|---|---|---|
| Marke LTTH.app | Sidebar-/Topbar-Branding in `dashboard.html`, bestehende Logos | Kein Kennzahlenvertrag; Pluginbranding wird im HTML über `/api/plugins` aufgelöst | Bestehende Assets verwenden; Mockup-Schriftmarke ist kein Ersatz für das Produktlogo. |
| Verbindungsbadge | `#connection-status`; `NavigationManager.updateConnectionStatus`; `#connection-info`; zusätzlich `#transport-status` | `tiktok:status` `{status,username,...}`; Socket `connect`/`disconnect`; `GET /api/connection-health` mit `connectionState`; `GET /api/status` nur mit `isConnected` | Transport und TikTok trennen; vier Zustände nach der nächsten Tabelle ableiten. Kein grüner Live-Badge allein durch Socketverbindung. |
| Profil im Kopf und Kontext | `#current-profile-name`, `#active-profile-display`, `loadActiveProfileStatus()` | `GET /api/profiles/active` `{activeProfile,pendingProfile?,requiresRestart,restartState,restartFailure,port}`; `profile:switched` | Immer geladenes `activeProfile` anzeigen. Pending-Profil mit Neustarthinweis; Mockup-Select ist kein Produktionsvertrag für sofortiges Umschalten. |
| Sprache | `#topbar-language-selector`, Einstellung `#language-selector`; `window.i18n.setLocale()` | `GET /api/i18n/locales`; Übersetzungsabruf durch i18n-Client; `app_locale` in localStorage | Produkt-`data-i18n`-Schlüssel verwenden, vorhandene Locale-Normalisierung und Async-Requestschutz erhalten. Keine eingebettete Mockup-Wörterliste übernehmen. |
| Tag/Nacht | vorhandener ThemeManager und sein Designmenü; CSS `themes.css` | Browserpräferenz `dashboard-theme`; kein Live-HTTP-Vertrag für reine Themeauswahl | Day/Night sind nur zwei von vorhandenen Designs. Kontrast-/Sehbehinderungsdesigns nicht entfernen. |
| Zuschauer `248` | `#stat-viewers`, `updateStats(stats)` | `tiktok:stats.viewers`; HTTP `GET /api/live-stats` → `stats.viewers`; `GET /api/status` → `stats.viewers` | Zahl der aktuellen Zuschauer, keine kumulative Besuchersumme. 0 ist gültig; fehlendes Feld ist unbekannt, nicht 0. |
| Zuschauertrend `↗18 %` | Keine verifizierte bestehende Prozentanzeige für diese Karte | Kein geprüftes Backendfeld für Vergleichsfenster/Basiswert | Weglassen bis Zeitfenster und Baseline definiert sind. Alternativ lokal ab Sitzungshydration sammeln, ausdrücklich seit Öffnen dieses Dashboards. Keine erfundenen 18 %. |
| Likes `12.4k` | `#stat-likes`, `updateStats(stats)` | `tiktok:stats.likes`; beide HTTP-Snapshots `stats.likes` | Adapter nutzt je nach Eingang Gesamtlikes oder addierte Like-Events. Nicht als garantiert reine Seit-Verbindung-Zahl benennen. Produktlocale beim Formatieren verwenden. |
| Like-Rate `+320/min` | Kein geprüfter entsprechender DOM-/Ratenvertrag | Kein Backend-Ratenfeld; Differenzen aus `likes` wären nur eine Ableitung | Erst mit monotonic window und Sessionreset-Regel einführen; Resets und nachgelieferte Gesamtwerte dürfen keine negativen oder künstlichen Spitzen erzeugen. MVP ohne Rate. |
| Münzen `1.840` | `#stat-coins`, `updateStats(stats)` | Socket und `/api/status`: `totalCoins`; `/api/live-stats`: `stats.coins` | Explizite Feldnormalisierung erforderlich. Virtueller Gift-Münzzähler, keine Geld-/Auszahlungsanzeige. Sessionpersistenz berücksichtigen. |
| Unterzeile „Diese Session“ | Kein separates DOM-Feld nötig | Adapter hält/persistiert streamgebundene Stats und Streamidentität; `tiktok:status` kann `streamIdentity`/`roomId` liefern | Nur nach bestätigter Sessionidentität so beschriften. Vorher „Letzter Snapshot“/unbekannt. Timestamp allein ist keine Session-ID. |
| Neue Follower `32` | `#stat-followers` | `tiktok:stats.followers`; HTTP `stats.followers` | Adapter inkrementiert Follow-Events, kann Stats auch von gelieferten Gesamtfeldern setzen. „Neue Follower“ ist deshalb ein zu bestätigender Vertrag; zunächst bestehendes Label „Follower“ erhalten. |
| Laufzeit `01:24:08` | `#stat-runtime`; Socket `tiktok:streamTimeInfo` für Debug | `tiktok:stats.streamDuration`; `/api/live-stats` → `stats.streamDuration` und `stats.runtime`; `/api/status.getStats()` liefert nicht denselben Laufzeitvertrag | Sekunden in HH:MM:SS formatieren. `streamStartTime` kann unbekannt sein; 0 ist bei aktiver, unbekannter Startzeit kein Beleg für einen gerade gestarteten Stream. Laufzeitquelle vereinheitlichen. |
| Nicht im Cockpit gezeigte Geschenke | bestehend `#stat-gifts` | `tiktok:stats.gifts` und HTTP `stats.gifts` | Kennzahl weiterhin in bestehender Detail-/Eventansicht verfügbar halten. Keine Regression durch Entfernen der ID ohne Anpassung des Consumers. |
| Live-Steuerung / TTS-Schalter | `#quick-tts-btn`, Sidebar `#sidebar-quick-tts`; `dashboard-enhancements.js` | `GET /api/settings.tts_enabled`; Verfügbarkeit aus `GET /api/plugins`/`plugins:changed`; Mutation siehe unten | Label „pausieren/fortsetzen“ passt nicht zum vorhandenen Deaktivieren-und-Leeren. Zentrale Aktionsbindung weiterverwenden und Plugin-disabled/error getrennt behandeln. |
| Soundboard-Schaltfläche | `#quick-soundboard-btn` ist Toggle; Soundboard hat eigene View und `dashboard-soundboard.js` | Toggle `soundboard_enabled`; Soundboarddaten/Audioplayback durch eigenes Modul | Mockup ist mehrdeutig: UI öffnen oder global ein-/ausschalten? Für MVP ausdrücklich „Soundboard öffnen“ als Navigation planen. Kein unbezeichneter Klick, der Audio deaktiviert. |
| Overlays-Schaltfläche | Kein eindeutig verifiziertes generisches Cockpit-Overlay-Panel | Plugin-spezifische Overlay-URLs; vorhandener TikTok-Studio-URL-Workflow separat | Für MVP Zielansicht definieren oder Aktion entfernen. URL kopieren ist nicht automatisch rein lokal/read-only: TikTok-Studio-URL-Workflow kann Tunnelbereitstellung starten. |
| „OBS · bereit“ | Keine Cockpit-Badge-Bindung vorhanden; `obs-websocket.js` | `GET /api/obs/status` `{success,connected,enabled,host,port}`; `obs:connected`, `obs:disconnected`, `obs:error` | Badge aus `connected && enabled` ableiten, genauer „OBS verbunden“. Das beweist keine funktionierende Szene, keine vorhandenen Quellen und keine Aufnahme-/Streambereitschaft. Host/Port nicht unnötig im Cockpit ausgeben. |
| TTS-Warteschlange `3 Nachrichten` | Kein vorhandenes Cockpit-Zählerfeld; TTS-Pluginroute verfügbar | `GET /api/tts/queue` → `{success,queue:{size,maxSize,isProcessing,currentItem,nextItems},stats}`; Socket-Anfrage `tts:queue:status` → Antwort gleichen Namens mit nacktem QueueInfo | `queue.size` zählt wartende Elemente; `currentItem` separat. Kein erwiesener kontinuierlicher Pushvertrag: Plugin-gated, begrenztes Polling oder klarer neuer Pushvertrag nötig. Bei fehlendem Plugin „nicht verfügbar“, nicht 0. |
| „Automationen · 8 aktiv“ | `#flows-list`; `loadFlows()` | `GET /api/flows` liefert nacktes Array mit `enabled`; `GET /api/settings.flows_enabled`; `/api/ifttt/stats` existiert als separater Engine-Vertrag | Konfigurierte aktive Flows als `enabled===1` zählen, globales `flows_enabled !== 'false'` zusätzlich anzeigen. Nicht als acht laufende Jobs interpretieren. Aktualisierung nach Flowänderung; kein hier nachgewiesener einheitlicher Count-Push. |
| Verbindung & Diagnose | `#connection-details-panel`; `#connection-info`, `#connection-health`, Session-/Diagnosepanels | `GET /api/connection-health`; `GET /api/diagnostics?username=...`; `GET /api/session/status` | Disclosure beibehalten. Öffnen selbst UI-Aktion; Diagnoserequest separat bewusst auslösen. Diagnose-/Sessionpayload nicht ungefiltert im Cockpit, Bericht oder Logs darstellen. |
| Letzte Aktivitäten: Gift, Follow, Share und Uhrzeit | `handleLiveEvent()` / `addEventToLog()`; `#event-log`; eigener Eventlog optional ausgeblendet | Live `tiktok:event` `{type,data}`; History `GET /api/event-logs?limit=100` → `{success,count,logs}` | Kleine neue Projektion des vorhandenen Ereignispuffers, kein zweiter Listener mit doppeltem Einfügen. Gift-/Follow-/Share-Formatter wiederverwenden. History lädt `event_type` (Fallback `eventType`), geparstes `data` und `timestamp`; Live-Ereignisse haben keinen garantierten Envelope-Timestamp/ID-Vertrag. Uhrzeit ggf. als lokale Empfangszeit markieren. |
| Mockup-Footer: Demo-Zustand, Toast, Konzeptlinks | Ausschließlich lokale Mockup-Controls | Kein Produkt-API-Vertrag | Demo-Zustandsselect und Simulationsbanner nicht in Produktion übernehmen. Toast durch vorhandene Notification/i18n-Konvention; Konzeptlinks sind Reviewnavigation, keine endgültige Appnavigation. |

Quellanker: `dashboard.html:2682–2756,2864–2965,3186–3198`; `dashboard.js:579–608,857–1030,1033–1100,1214–1290,1437ff,2533ff,3299ff`; `dashboard-enhancements.js:325–350,418–490`; `server.js:1748–1796,1845ff,2111ff,2249ff,2699ff,3182ff,3567–3592`; `tts/main.js:2440–2466,2888–2911`; `tts/utils/queue-manager.js:714ff`; `EulerstreamAdapter.js:3122–3170,3692–3730`.

## Vier Cockpit-Zustände: verbindliche Ableitungsregel für die Umsetzung

Ein Zustand ist eine UI-Projektion, kein neues freies Backendfeld. Quelle des Detailstatus bleibt `tiktok:status.status`, normalisiert mit `GET /api/connection-health.connectionState`. `/api/status.isConnected` und `/api/live-stats.isConnected` allein reichen nicht: `isActive()` gibt `isConnected` zurück, und das wird bereits bei `live_identity_pending` wahr.

| Cockpit | Reale Quellen | Anzeige und erlaubte Bedienung |
|---|---|---|
| Offline / getrennt | `idle`, `disconnected`, `offline`, `stream_ended`; bestätigte Health-`connectionState` | Grund erhalten („Stream beendet“ ist kein allgemeiner Fehler). Kein Live-Badge. Neues Verbinden nur nach Username-/Plugin-/Neustartprüfung. |
| Laden / wartet | initiale Statushydration; `connecting`, `validating`, `live_identity_pending`, `retrying` beziehungsweise Health `retry_wait`; Profil-/Serverneustart | Phase und Wiederholungsdetails anzeigen. `live_identity_pending` heißt „LIVE bestätigt, Stream-ID ausstehend“, bleibt für sessiongebundene Cockpitwerte pending. Keine Zeitsteuerung, die selbstständig einen Connect-POST auslöst. |
| Fehler | `error`, `connection_error`, `configuration_error`, `auth_error`, `validation_failed`, `identity_error`, `circuit_open`, `fallback_keys_exhausted`; mutierende HTTP-Anfrage gescheitert | Fehlerursache, `retryable`, `retryAllowedAt` behalten; letzter Wert stale oder „—“. Circuit-Open/Consent sind keine gewöhnlichen Retryknöpfe. HTTP-401/403 als Zugriff, 429 als Begrenzung, 503 mit `restarting` als Neustart differenzieren. |
| Live | Socket `connected` beziehungsweise Health `connectionState==='live'`, bestätigte Streamidentität/Roomkontext und funktionsfähiger Dashboardtransport | Statistiken nur nach gültigem aktuellen Snapshot frisch nennen. OBS und TTS können unabhängig fehlen. `tiktok:stats` allein beweist weder Livezustand noch vollständige Freshness. |

Transport separat führen: Socket `connect` bedeutet Backend erreichbar, nicht TikTok-Live. Socket `disconnect` bedeutet unbekannter/unterbrochener Datenkanal, nicht nachgewiesenes Streamende. Für ein zwingend vierteiliges Hauptbadge kann Transportausfall als Fehler mit Untertitel „Dashboardverbindung verloren“ erscheinen; den letzten TikTokzustand intern bewahren. Nach Socket-Reconnect zunächst „Laden“ bis Status/Health-Snapshot da ist. Pending-Profil-/Neustartzustand hat vor grüner Liveanzeige Vorrang.

`connection-health.status` ist eine Diagnosequalität (`healthy`, `degraded`, `critical`, `reconnecting` etc.), **nicht** der kanonische Verbindungszustand; `connectionState` verwenden. Nicht jeden degraded-Wert in Offline umdeuten.

Frischemodell für die Umsetzung: lokale Empfangszeit plus Herkunft (Socket/HTTP), Sessionkontext und stale/pending flag pro Datensatz. Transportverlust setzt stale; neuer Live-Snapshot gleicher bestätigter Session kann es zurücknehmen. HTTP-Snapshot und Socketereignisse sequenziert anwenden, ältere HTTP-Antwort darf neuere Socketdaten nicht überschreiben. Fehlende Zahlen als unbekannt behandeln, endliche nichtnegative Werte validieren. Timeout-Schwelle ist ein offener Produktvertrag: Stats ohne Ereignisse sind nicht zwingend kaputt; keinen frei erfundenen kurzen Timeout als Streamende behandeln.

MVP-Empfehlung: beim reinen Transportverlust letzte Werte mit explizitem „Letzter Stand, nicht live“ bewahren; bei unbekanntem Profil/Sessionwechsel „—“. Das bestehende Dashboard bewahrt bereits Teile des Snapshots, während die Mockups die Werte ausblenden. Eine Entscheidung statt beider Regeln gleichzeitig umsetzen.

## Reale Kontrollaktionen und Mutation

| Aktion | Bestehender Effekt | Cockpitvertrag |
|---|---|---|
| TTS ein/aus | `POST /api/settings` `{tts_enabled:'true'|'false'}` persistiert; beim Ausschalten zusätzlich `POST /api/tts/queue/clear`, ggf. laufendes Rendererplayback als fehlgeschlagen beenden | Echte Mutation. Für erste Integration „TTS deaktivieren“ statt „Pause“. Eine echte Pause/Resume-Route mit Queueerhalt ist nicht nachgewiesen und muss separat entworfen werden. |
| Soundboard Schnellaktion | `POST /api/settings` `{soundboard_enabled:...}`; beeinflusst globales Gift-/Audioplayback | Echte Mutation. „Öffnen“ muss zur Soundboardview navigieren und darf nicht denselben Togglehandler bekommen. Tests/Previews in der View können Audio auslösen. |
| Flows Schnellaktion | `POST /api/settings` `{flows_enabled:...}`; Backend lädt IFTTT-Timer neu | Echte Mutation; „8 aktiv“ als Anzeige selbst ist read-only. Einzelne Flow-Toggles `POST /api/flows/:id/toggle`, Create/Update/Delete und Tests ändern Zustand bzw. lösen Aktionen aus. |
| Verbinden | `POST /api/connect` `{username,fallbackKeyConfirmed}`; kann Profile automatisch wechseln und Neustart erfordern | Echte Live-/Profilaktion. Bestehenden Consent-/Restartpfad nicht umgehen; HTTP-success bei Profilwechsel ist kein Livebeweis. |
| Trennen | `POST /api/disconnect` | Beendet reale Verbindung, keine lokale Badgeänderung. |
| Profilwechsel | `POST /api/profiles/switch` `{username}`, danach obligatorischer Neustartablauf; ggf. `POST /api/server/restart` | Echte persistente Mutation. Loaded/pending auseinanderhalten; Mockup-Instantwechsel nicht übernehmen. |
| Sprache und Theme | i18n lädt Übersetzungen, setzt `app_locale`; ThemeManager setzt `dashboard-theme` in localStorage | Lokale persistente UI-Präferenzen, keine TikTok-/Profilmutation. Mockups speichern diese absichtlich nicht. |
| Diagnose-Disclosure / Modulnavigation | Disclosure oder bestehende Viewauswahl | UI-Aktion; nachgeladene GETs möglich. Kein implizites Connect/Play/Install. |
| Session extrahieren/importieren/löschen | `POST /api/session/extract-manual`, `/import-manual`, `/clear`; Browser-/Sessionpfad | Reale Zugangsdaten-/Browseraktion. In erweiterten Verbindungsdetails behalten; nicht zur automatisch ausgeführten Cockpit-Hydration machen. |
| OBS verbinden/trennen/Szene/Quelle | `POST /api/obs/connect`, `/disconnect`, `/scene/:sceneName`, `/source/:sourceName/visibility` | Reale externe OBS-Mutation. OBS-Badge selbst nur GET/Statusverbraucher. |
| Overlays / TikTok-Studio-URL | Mockup nur Toast; bestehende Plugin-/URLworkflows können Kopieren, Tools/Tunnelbereitstellung enthalten | Konkretes Navigationsziel und Aktionsname erst definieren. Keine vermeintlich harmlose automatische Tunnelaktion. |
| Cockpit-Demoaktion | Mockup-`data-action` verändert nur lokale Texte/`aria-pressed`; Zustandsselect ändert fiktive Zahlen | Ausschließlich Simulation. Kein existierender APIvertrag dadurch bewiesen. |

## Fehlende und mehrdeutige Verträge vor dem Implementieren

1. **Statusaliasse:** Adapter speichert `live`, sendet `connected`; `retry_wait` sendet `retrying`; ein Fehlerpfad speichert `connection_error`, sendet `error`. Bootstrap kann den internen Zustand senden. Zentrale Normalisierung mit unbekanntem Zustand → pending/unbekannt statt grün. Navigation und `updateConnectionStatus()` decken nicht überall denselben Satz ab.
2. **Snapshotform:** Socket/`/api/status` haben `totalCoins`; `/api/live-stats` hat `coins`, formatierten Runtime und Timestamp. Kein gemeinsamer typed DTO mit Version, Session-ID, Seq und sourceTimestamp vorhanden. Anpassung als kleine explizite Frontendnormalisierung planbar; API-Erweiterung getrennt spezifizieren.
3. **Runtimekonflikt:** `dashboard-enhancements.js:789–794` hört `tiktok:connected`/`tiktok:disconnected`, während die geprüften Adapter-/Serverstellen `tiktok:status` senden. Keine entsprechenden Emittenten in diesen zwei Dateien gefunden. Seine lokale Date.now-Laufzeit kann außerdem den Socketwert in `#stat-runtime` überschreiben. Einen Runtimeconsumer behalten; Emittervertrag projektweit abschließend prüfen, keine scheinbare Laufzeit aus Browserstart erzeugen.
4. **Live-/History-IDs und Zeit:** Live-Envelope `{type,data}` bietet kein garantiertes gemeinsames Event-ID-/Timestampfeld. History/Live während Laden wird bereits abgeglichen; bestehende Buffer-/Dedupelogik nutzen. Keine Garantie für genau-einmal-Delivery aus der kleinen Cockpitliste ableiten.
5. **Statsemantik:** Follower und Likes werden sowohl aus Einzelereignissen als auch aus gelieferten Zählerfeldern aktualisiert (`EulerstreamAdapter.js:1638,1738–1743,2330–2379`). „Neu“, Raten und prozentuale Trends erfordern einen gesonderten Definitionsvertrag. Persistenz und Sessionresets prüfen.
6. **Pausevertrag:** Queue hat Clear/Skip, kein geprüfter verlustfreier Pause-/Resume-APIvertrag. Bloßes `audio.pause()` wäre kein globaler TTS-Pausenzustand und könnte Rendererwatchdog-/Acknowledgementpfade beeinflussen. Neue Pause nur mit Queue-/Playbackzustandsdesign.
7. **Queueaktualisierung:** `tts:queue:status` ist request/reply, kein Beleg für automatische kontinuierliche Broadcasts. HTTP-Antwort hat Wrapper, Socket nacktes QueueInfo. Plugin disabled, 404, leere Queue und Requestfehler unterscheidbar modellieren.
8. **Flowscount:** Enabled-Arraycount, globaler Flows-Schalter und tatsächlicher Enginezustand sind unterschiedliche Größen. Label für MVP „8 eingeschaltet · global aktiv/inaktiv“. Fehlende/fehlerhafte GET-Antwort nicht als Nullcount behandeln.
9. **OBSbereit:** `connected` und `enabled` reichen nur für „OBS verbunden“. Eine „Bereit“-Abnahme mit Szene/Quellen/Streamingstatus fehlt in diesem Cockpitvertrag.
10. **Overlayziel:** generisches Dashboard-Overlaypanel nicht eindeutig zugeordnet. Vor Verdrahtung Ziel und rein navigative Bedeutung festlegen.
11. **Stale-/Restartvertrag:** `/api/status` meldet `restarting/restartFailure`; Health gibt bei Neustart 503 zurück; Profile haben active/pending. Keine Liveanzeige während unbestätigter neuer Profilsession. Ältere Stats dürfen neuen Profilkontext nicht übernehmen.

## Umsetzungsfolge mit begrenztem Umfang

1. Quelle neu verifizieren und separaten Implementierungsbranch/worktree verwenden; der bestehende Checkout ist dirty. Cockpit-MVP auf Kennzahlen, Status, Navigation, OBS-Verbindungsbadge und beschriftete Schnellaktionen begrenzen. Trends/Raten, echte TTS-Pause und generisches Overlaypanel aus MVP herauslassen, bis Verträge feststehen.
2. Kleine reine Mapper für Snapshot und Status anlegen. Ein Viewmodel hält transport, TikTokphase, active/pendingProfile, sessionIdentity, numericStats, freshness und pluginAvailability. Bestehende Bootstrap-Socketevents verwenden; optionale GET-Hydration für Health/Profile/Queue/Flows/OBS nur gezielt, begrenzt und fehlerbewusst. Keine Sessiondiagnose-/Connect-POSTs beim Laden.
3. `dashboard.html` umordnen, vorhandene Kennzahlen-IDs und Status-/Connect-/Quickactioncontrols behalten. Main-/Stat-/Steuerungs-/Aktivitätsfolge wie Cockpit; Release Notes einklappbar nachrangig. Bestehende Einstellungen, Eventlog, Wiki und Pluginviews erhalten. Keine zweite IDs-Kopie für Mobile.
4. `dashboard.js` an das gemeinsame Viewmodel binden; `navigation.js`-Badge und Transporthinweis aus derselben Zustandsprojektion. Renderer-/Soundboardlistener nicht neu registrieren. Laufzeitkonflikt mit `dashboard-enhancements.js` auflösen; Queue-/Flows-/OBS-Badges pluginabhängig ergänzen.
5. Aktionsnamen eindeutig machen: „TTS deaktivieren (Warteschlange wird geleert)“, „Soundboard öffnen“, „Verbindungsdetails“. Backendmutationen über bestehende Handler, mit Busy-/Fehler-/Rollbackbehandlung; danach bestätigtes Settings-/Statusrefresh. Kein optimistisches grünes Live allein aus Klickerfolg.
6. Texte in vorhandenen DE/EN/ES/FR-Produktlocales und Themevariablen integrieren; keyboard skip/focus und DOM-Reihenfolge übertragen. Mockup-Demoselector, Beispielstatistiken und Inline-Simulationscode entfernen. Inline-Script-/CSP-Regeln und bestehende CSP-Tests bei einer Umsetzung berücksichtigen.

## Vorgesehene Abnahme, in diesem Auftrag nicht ausgeführt

- Mappertests mit echten **source-shaped Fixtures**, ohne Verbindung: sämtliche Statusaliasse, identity_pending, unbekannter Status, Transportverlust/Reconnect, Status/Stats-Order, Profilepending, stale HTTP response, 0 versus missing/nonfinite, Coinsaliasse, Runtime unknown/reset.
- Integration mit abgefangenen HTTP-/Socketquellen: Klick auf „Soundboard öffnen“ sendet keinen POST; TTS-Deaktivierung zeigt Queueclearwirkung; Profilrestartbehaviour bleibt erhalten; Plugin disabled/404/401/429/503/error nicht grün oder Nullsuccess.
- Activitytests: History-Live-Überlappung, maximale Listenlänge, gift series/follow/share, Timestampfallback, keine doppelten Listener; Usertext per sicherer DOM-API, keine ungeprüfte HTML-Injektion.
- 320/390/1440 Pixel, vier Sprachen, Day/Night plus vorhandene Accessibilitythemes; Keyboard/Screenreader und bei Umsetzung auch 200-%-Zoom/Textabstand. Screenshotprüfung des **integrierten** Dashboards separat vom Mockup.
- Nächste Produktchecks erst nach autorisierter Implementierung: eng passende Dashboard-/Profile-/TTS-/CSP-Tests, `npm run build:css`, Lint und erforderliche breitere Checks. Die bisherigen Mockupruns ersetzen keine hiervon.
- Reale Live-/OBS-/Audiobestätigung bleibt eine spätere, ausdrücklich autorisierte Abnahme. Dieser Plan behauptet ausschließlich aktuelle Quellzuordnung.

## Nachvollziehbare Quellbasis

Die folgenden SHA-256-Werte wurden beim Berichtsschreiben aus den aktuellen Dateien berechnet. Sie helfen Drift seit dem Bericht zu erkennen; sie beweisen keinen Laufzeitzustand. HEAD: d65a54891f6ba1d055e95fda70d0df696d5299f0.

| Datei | SHA-256 |
|---|---|
| `app/public/dashboard.html` | `fba7fd948f8f9c98f975479e36ec79e1644e2504936ab91a54dce874389b1c9b` |
| `app/public/js/dashboard.js` | `be281164512ac4e506580f7f3f9707b12d949f23e4c6b81c0f896917d7a7c988` |
| `app/public/js/dashboard-enhancements.js` | `cd5656b3b8996ad1acdb468acb8b8e31f2ed8f396ee2f9a980c6329c75e5d7af` |
| `app/public/js/dashboard-soundboard.js` | `0d06e519a90474aebad7e01bd25cf0e39c947d67c59d3ab2ec015478bbebb473` |
| `app/public/js/navigation.js` | `2e3a9fccdc45acff7d54d9e45b559fccc66ff2bcd799e0d3c6cb02ebbb344e8f` |
| `app/public/js/profile-manager.js` | `dac3d9dad3662cefe366ebb93723edd3cb7e82766b3e4afe2dcb8653e1b35525` |
| `app/public/js/theme-manager.js` | `29884dfb2537469f0dacd7bb564d94ec2f64beb0d8d68825156d6eef305692f2` |
| `app/public/js/i18n-client.js` | `9ac397769f1615ac48e266bc14b0c6d95ac48b13837b94f9787a90607394307f` |
| `app/server.js` | `cde809257cd43e505306c427cc4a231e4c1e5d32f0976f9a95e8aac5732c13f3` |
| `app/modules/tiktok.js` | `ed4dd32c534b58decd3b16126aabe407cda6356d9a565c6dac24247e7741c5ec` |
| `app/modules/adapters/EulerstreamAdapter.js` | `4252537c1481bfc3aa4a481ce79682e427a47d4664c5f541c7bc7e68d0023347` |
| `app/modules/obs-websocket.js` | `02e1c7566505a046b6e4e3efe6f563ef3e11b95ed2ac87e7fa2462e33133915b` |
| `app/modules/database.js` | `483f24d4f0066a2fddcfe68eca517b98c57aaf8d490efc31806317970d76982c` |
| `app/plugins/tts/main.js` | `1adbd48d41b7e7b07834ecc15c356879aa96223f82bc749af24d930ec586b661` |
| `app/plugins/tts/utils/queue-manager.js` | `2dc21c6a1680b6d52bc61007661ab04dba816b490688ec7ee08865472c5d330d` |
