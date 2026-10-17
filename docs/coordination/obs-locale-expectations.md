# OBS-Locale-Erwartungen für DE / EN / ES / FR

Stand: 2026-10-07. **Read-only-Quellenanalyse**, keine Browser-/OBS-Aufnahme, keine öffentliche oder Live-Abnahme.

## Umfang und Bewertungsgrenze

Die 26 Einträge entsprechen den 26 Plugin-Profilen im aktuellen `docs/coordination/obs-104-source-inventory.json`. Das Dokument bewertet deren Eintragsseite, Locale-Query und statische/runtime Textquellen. Es ist weder eine vollständige Liste aller Routen aus `public-overlay-registry.js` noch ein Nachweis, dass 26 Seiten visuell geprüft wurden. Insbesondere werden hier keine 104 Locale-Captures und kein OBS-Pass behauptet.

Zusätzlich ist Sidekick als separat gekennzeichneter Befund enthalten, weil sein HUD nicht zu den 26 Profilen gehört und seine Fehlertexte ausdrücklich abzugrenzen sind. Die vollständigen strukturierten Daten und Quellpfade stehen in [obs-locale-expectations.json](obs-locale-expectations.json).

## Gemeinsamer Locale-Loader

Seiten, die `/js/i18n-client.js` laden, lesen `?lang=` vor `localStorage.app_locale`; ohne beides gilt Deutsch. Unterstützt werden `de`, `en`, `es`, `fr`; Sprachregionen werden auf den Basissprachcode gekürzt, unbekannte Werte fallen auf `de` zurück. Der Client lädt `/api/i18n/translations/{locale}`. Der Server führt Root- und Plugin-Kataloge zusammen. Der gemeinsame Socket-Sync verwendet nur ein bestehendes `window.socket`, begrenzt verspätete Socket-Discovery auf 20 Prüfungen à 100 ms und behält den Zustand bei `pagehide.persisted === true` für BFCache bei. Aktueller Client-SHA-256: `aab1d9f00f2b1a8fef6d4fa31eeb65a55e071d72269de24b871fdf925387942c`.

Eine vorhandene Locale-Datei oder ein akzeptierter `lang`-Parameter belegt keine vollständige Übersetzung: Fehlende `data-i18n`-Keys behalten ihren HTML-Fallback, `t()` kann den Schlüssel selbst liefern, und eigener Runtime-Code kann Texte erneut hart codieren oder überschreiben. Daten wie Chat, Namen, generierte Fragen, Transkripte und Zähler werden nicht automatisch übersetzt.

## 26 Profil-Einträge

| Plugin | Inventar-Einstieg | Wirkung von `?lang` und erwartete Texte | Fonts / externe Assets aus Quellen |
| --- | --- | --- | --- |
| advanced-timer | `/plugins/advanced-timer/overlay/index.html` | Shared-i18n. Titel sowie Timer-Fehler-/Leer-/Verlaufstexte sind übersetzbar; Countdown/Zeitwerte und Timernamen sind Daten. | System-Fontstack; keine externe Font-URL. |
| chatango | `/plugins/chatango/ui.html` | Shared-i18n für das inventarisierte Einstellungs-/Integrations-UI. Eingebettete Chatango-Inhalte folgen dem Drittanbieter und werden von LTTH nicht lokalisiert. | Lädt `https://st.chatango.com/js/gz/emb.js`; Provider-Inhalte können weitere externe Assets laden. |
| clarityhud | `/overlay/clarity/full` | Shared-i18n plus `ClarityHUDI18n` für Status-/Event-Fallbacks. Namen, Nachrichten und Geschenkdaten bleiben roh; fehlende Runtime-Keys haben englische Quellfallbacks. | Same-origin Open Sans/OpenDyslexic-Fallback-CSS; keine externen Webfonts. |
| coinbattle | `/plugins/coinbattle/overlay/overlay.html` | Shared-i18n plus Runtime-Keys für Teams, Gewinner, Erfolge und Leerzustände. Spieler-/Teamnamen, Scores, XP und Zeit sind Daten. | System-Fontstack. Avatar-URLs können aus Runtime-Daten stammen. |
| emoji-rain | `/emoji-rain/obs-hud` | Tatsächlicher Einstieg ist `obs-hud.html` mit `emoji-rain-obs-hud.js`; Titel nutzt Shared-i18n. Das Canvas startet leer/transparent, Performance-HUD und Auflösungsindikator sind standardmäßig verborgen. Der Renderer lädt Config und User-Mappings, danach den read-only GET `/api/emoji-rain/overlay/state` mit ausschließlich `state.opacity`; Default ist sichtbar `1`. Gültige `emoji-rain:opacity`-Events mit genau einem numerischen, endlichen Wert von 0 bis 1 aktualisieren den Canvas-Container und haben Vorrang vor einer später eintreffenden GET-Antwort. Registry erlaubt den GET und das ausgehende Event; der POST-Schreibpfad ist keine öffentliche Overlayoberfläche. | Same-origin i18n-/HUD-Skripte und lokales Matter.js; keine externe Font-URL. |
| fireworks | `/plugins/fireworks/overlay.html` | Shared-i18n für Titel und Follow-Dankestext. Debug-Beschriftungen `FPS`, `Particles`, `Renderer` bleiben Englisch; Nutzernamen sind Eventdaten. | System-Fontstack. Avatar-URL kann Runtime-Datum sein. |
| flame-overlay | `/flame-overlay/overlay` | Shared-i18n ist geladen, aber die sichtbare Fläche ist primär Canvas; nur der Dokumenttitel hat einen Locale-Key. | Keine externe Font- oder Asset-URL gefunden. |
| game-engine | `/plugins/game-engine/overlay/game-hud.html` | Shared-i18n mit Runtime-Neurendern für Spielname, Status, Zug- und Spielerlabels. Spielernamen, Züge, Scores und Brettzustand sind Daten. | System-Fontstack, lokale Audio-/Game-Assets. |
| goals | `/goals/overlay` | Shared-i18n für den Titel; generierte Template-Texte wie `remaining` und `Goal Reached!` sind weiterhin englisch hardcodiert. Goal-Namen und Zahlen sind Daten. | System-Fontstack; keine externe Font-URL. |
| interactive-story | `/plugins/interactive-story/overlay.html` | Shared-i18n für Voting-, Timer-, Teilnehmer- und Statuslabels. Story-/Kapiteltext richtet sich nach Story-/Modellkonfiguration, nicht nach `?lang`. | System-Fontstack; Quellen zeigen same-origin Plugin-/API-Assets. |
| milestone-leaderboard | `/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/leaderboard.html` | Shared-i18n plus Viewer-XP-Helper für Titel, Zeitraum, Laden/Leerzustand. Namen, Rang, XP und Profilbilder sind Daten. | System-Fontstack; Profilbilder sind optionale TikTok-CDN-Daten. |
| minecraft-connect | `/plugins/minecraft-connect/overlay/minecraft_overlay.html` | Shared-i18n plus Runtime-Helper für Aktionen und „triggered by“; Fallbacks sind Englisch. Minecraft-Namen, IDs, Koordinaten, Counts und Zeiten sind Daten. | System-Fontstack; same-origin CSS/JS. |
| music-bot | `/plugins/music-bot/overlay.html` | Shared-i18n für Titel, Warte-/Leerzustand und Queue-Beschriftung. Titel, Interpret, Cover und Fortschritt sind Musikdaten. | Inter/Orbitron/Rajdhani mit System-Fallback; keine externe Fontdatei. Playback-/Cover-URLs hängen vom Provider ab. |
| openshock | `/plugins/openshock/overlay/openshock_overlay.html` | Shared-i18n und Runtime-Keys für Geräte-/Intensitäts-/Dauerbeschriftungen. Eventtyp wird aktuell aus dem kanonischen Wert großgeschrieben; Gerätenamen und Messwerte sind Daten. | System-Fontstack; keine externe Font-URL. |
| quiz-show | `/plugins/quiz-show/quiz_show_overlay.html` | Shared-i18n für Runde, Status und Timer-Chrome. Frage, Antwort und Kategorie folgen der separat konfigurierten Quizsprache; `?lang` ändert nur die Oberfläche. | System-Fontstack; lokale CSS/JS. |
| schnorrbecher | `/overlay/coincup?transparent=1` | `?lang` wird ignoriert: kein i18n-Client. Statische Labels/ARIA-Texte sind Deutsch; Hauptinhalt ist Zähler, Geschenkdaten und Animation. | Same-origin Matter.js und lokaler Impact-Sound. |
| spotlight | `/plugins/spotlight/overlays/chatter.html` | Shared-i18n plus Runtime-Template-Übersetzungen für Warte-/Event-/Anonym-/Cointexte. Namen, Geschenk- und Eventinhalt bleiben Daten. | Same-origin `/fonts/exo-2.css` mit lokalen Font-Fallbacks; keine externen Webfonts. |
| stream-monsters | `/stream-monsters/overlay` | Shared-i18n wird beim Laden angesprochen, danach kontrolliert Overlay-Konfiguration `primaryLocale`/`locales` die Präsentationssprache und Rotation. Vier Locale-Dateien sind vorhanden; Standardkonfiguration startet DE/EN. | Inter/Segoe UI/Arial-Fallback; Logo, Artwork und Audio same-origin. |
| stt-ticker | `/plugins/stt-ticker/overlay/ticker.html` | Shared-i18n für den Titel. Tickerzeilen sind Transkripttext und werden durch `?lang` nicht übersetzt oder umgesprochen. | System-Fontstack; keine externe Font-URL. |
| talking-heads | `/plugins/talking-heads/overlay.html` | Shared-i18n mit eigenem Translation-Base `/api/talkingheads/overlay/translations/{locale}` für Bühnen-/Warte-/Accessibility-Texte. Gesprochener Inhalt und Namen bleiben Daten. | System-Fontstack; Sprite/API-Assets same-origin. |
| toptier | `/plugins/toptier/overlay.html` | Shared-i18n betrifft sichtbar den Dokumenttitel. Rendererlabels `Likes`, `Gifts`, Rank-/Score-Copy bleiben Englisch; Namen und Scores sind Daten. | System-Fontstack; Placeholder-SVG lokal, Avatar-URLs optionales Profildatum. |
| visual-fx-frame-webgpu | `/visual-fx-frame-webgpu/overlay` | Shared-i18n betrifft den Titel. Ausgabe ist Canvas; optionaler Debugstatus zeigt rohe Zustands-/Fehlerwerte statt Übersetzungen. | System-UI-Font; lokale Renderer-Assets. |
| weather-control | `/plugins/weather-control/overlay.html` | Shared-i18n plus Runtime-Helper für Community-/Quest-/Streak-/Meter-Labels. Quest-/Rewardnamen sind Konfiguration; Fortschritt ist numerisch. | System-UI-Font; keine externe Font-URL. |
| webgpu-emoji-rain | `/plugins/webgpu-emoji-rain/overlay.html` | Shared-i18n für HTML-Titel/Fallback, aber `gpu/engine.js` überschreibt Laufzeitstatus mit festem Deutsch (`READY · WEBGPU`, `WEBGPU NICHT VERFÜGBAR`, `WEBGPU-GERÄT VERLOREN`, `WEBGPU-FEHLER`, `INITIALISIERE WEBGPU`). | Inter/Segoe-UI-Fallback; keine externe Font-URL. |
| webgpu-fireworks | `/webgpu-fireworks/overlay` | Shared-i18n für Titel und Follow-Dankestext. Debuglabels FPS/Particles/Renderer bleiben Englisch; Eventnamen/Avatare sind Daten. | System-Fontstack; Avatar optionales Eventdatum. |
| webgpu-weather-control | `/webgpu-weather-control/overlay` | `?lang` wird ignoriert: kein i18n-Client. Community-Weather/Meter/Quest/Streak/Reward und optionale Debugdiagnostik sind Englisch; Werte und Questnamen sind Daten. | System-UI-Font; same-origin WebGPU-Skripte. |

## Sidekick-Zusatzbefund

Sidekick ist kein Eintrag der 26 Profilinventare. Der echte Einstieg `/overlay/sidekick/hud` liefert `sidekick-hud.html` unverändert. Die Seite setzt zwar `<html lang="de">`, liest aber `?lang` nicht und lädt weder `i18n-client.js` noch ein HUD-Locale-Bundle. Der Titel und die Statlabels sind teils Englisch; „Sidekick status unavailable“ und „Event feed unavailable“ sind statische englische Strings. `app/plugins/sidekick/locales/{de,en,es,fr}.json` gehört zum Admin-UI und wird von diesem HUD nicht konsumiert. Daher darf eine DE/ES/FR/EN-URL nicht als lokalisierte Sidekick-HUD-Variante ausgewiesen werden.

## Fonts und Abnahmegrenzen

In den 26 statischen Einstiegspunkten wurde kein externes Webfont-Downloadziel festgestellt. ClarityHUD und Spotlight laden same-origin CSS, das auf lokal installierte Systemfonts zurückfällt. Chatango ist die einzige fest referenzierte externe statische Ressource: sein Widget-Script; eingebettete Provider-Inhalte können weitere Netzwerkassets anfordern. Datenabhängige Profil-/Cover-/Avatar-URLs sind keine allgemeinen Pflichtfonts und müssen pro Capture-Fixture bewertet werden.

Offen bleibt die sichtbare Prüfung aller Sprachvarianten, einschließlich lang-query-Wirkung, tatsächlicher Texte, Font-Fallback und Layout. Diese Analyse hat keine Browser oder OBS gestartet und ersetzt keine spätere Bildsichtung.
