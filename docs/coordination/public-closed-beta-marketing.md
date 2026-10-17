# Öffentliche Closed-Beta-Marketingseiten (2026-10-07)

## Befund

Die Release-Policy enthält 11 Closed-Beta-IDs. Die Website-Featureübersicht prüfte bisher Alias-Slugs nicht kanonisch; dadurch konnte Stream Monsters trotz `streamalchemy`-Storealias ohne Status erscheinen. Der spezielle `/streammonsters` Guide führte außerdem einen Download-CTA, ZIP-Dateinamen, Subscriber-Access-Metadaten und ein direkt geladenes Plugin-Runtime-Pacing-Skript.

## Umsetzung

- Feature-Hub berücksichtigt jetzt kanonische Plugin-Aliase aus der Release-Policy und zeigt übersetzte Closed-Beta-Status an.
- Homepage listet die 11 Apps mit lokalisiertem Closed-Beta-/Coming-Soon-Status; lokale Entwicklung wird als fortlaufend bezeichnet.
- Betroffene Feature-Detailseiten verwenden Closed-Beta-Hinweise ohne App-Download-CTA.
- Stream Monsters Public Guide behält den reinen Dokumentationslink, zeigt Closed Beta auf Deutsch/Englisch/Spanisch/Französisch und enthält weder ZIP-/Access-Angaben noch Plugin-Runtime-Script-Verweis. Die drei Pacing-Zahlen sind statische Werte zur Darstellung des Guides.
- Der Stream-Monsters-Syncgenerator erhält dieselbe Public-Projektionsgrenze, damit spätere Synchronisierung ZIP-/Subscriber-Metadaten nicht wieder in die öffentliche Guide-Seite schreibt. Interne Plugin-/Store-Projektionen bleiben davon unberührt.
- Neue gezielte Marketing-Contract-Tests prüfen Policy-IDs, Homepage-Liste, Aliasstatus und Stream-Monsters-Ausschlüsse.

## Geänderte Dateien

Website-Quellen und Generatoren: `index.html`, `css/home.css`, `features/catalog-data.js`, `scripts/build-features-hub.js`, `features/*.html` (betroffene Detailseiten), `features/index.html`, `features-en.html`, `features-es.html`, `features-fr.html`, `locales/de.json`, `locales/en.json`, `locales/es.json`, `locales/fr.json`, `streammonsters/index.html`, `js/streammonsters-guide.js`, `scripts/sync-streammonsters-product.js`.

Prüfung: `app/test/public-closed-beta-marketing.test.js`.

## Erlaubte öffentliche Oberflächen

Statische Featureübersicht und Marketing-Detailseiten mit Statusangabe; Stream Monsters Guide einschließlich lokalisierter Closed-Beta-Hinweise und Link zu technischer Dokumentation. Keine Plugin-Download-/Installations-CTA oder direkte Runtime-Datei im Stream-Monsters-Guide. Die globale Website-Downloadseite bleibt separat.

## Tests und Prüfungen

- `node scripts/build-features-hub.js`: erfolgreich, vier Sprachen generiert.
- Gezielte Jest-Suites `public-closed-beta-marketing` und `plugin-release-policy`: 2 Suites, 12 Tests bestanden.
- `npm run website:features:locales:check`, `npm run website:locales:check`, `node --check js/streammonsters-guide.js`, `node scripts/sync-streammonsters-product.js --check` und scoped `git diff --check`: erfolgreich.
- `streammonsters-product-contract.test.js`: nicht ausführbar, weil dessen `spawnSync`-Unterprozesse in dieser Umgebung mit `EPERM` blockiert werden. Der direkte Generator-Check selbst lief erfolgreich.
- Keine Website-Bundle-Erstellung, Veröffentlichung oder öffentliche/OBS-Abnahme.

## Verbleibende Risiken

- Feature-Hub-Build und statische/Jest-Prüfungen bestätigen nur den lokalen Quellstand, keine veröffentlichte Website.
- Die Sonderseite nutzt dokumentierende Timingwerte, unabhängig vom Plugin-Runtime-Pacingmodul; Änderungen am Produktablauf müssen den Guide künftig separat aktualisieren.
- Globale Website-Downloadoberflächen bleiben bewusst unverändert und sind keine Freigabe der elf Closed-Beta-Plugins.


## Folgeauftrag: Closed-Beta-Marketingmatrix und Locale-Cache (2026-10-07)

| Policy-ID | Homepage | Hub-Slug / Status | Detailseite / Status | App-spezifischer Download-CTA |
|---|---|---|---|---|
| `animazingpal` | AnimazingPal | `animazingpal` / Closed Beta | `/features/animazingpal.html` / Closed Beta | keiner |
| `interactive-story` | Interactive Story | `interactive-story` / Closed Beta | `/features/interactive-story.html` / Closed Beta | keiner |
| `music-bot` | Music Bot | `plugin-music-bot` / Closed Beta | `/features/plugin-music-bot.html` / Closed Beta | keiner |
| `osc-bridge` | OSC Bridge | `osc-bridge` / Closed Beta | `/features/osc-bridge.html` / Closed Beta | keiner |
| `schnorrbecher` | Schnorrbecher | kein Hub-Eintrag | keine Detailseite | entfällt |
| `sidekick` | Sidekick | kein Hub-Eintrag | keine Detailseite | entfällt |
| `stream-monsters` | Stream Monsters | `plugin-stream-alchemy` via Alias `streamalchemy` / Closed Beta | `/features/plugin-stream-alchemy.html` / Closed Beta; eigener Guide `/streammonsters/` | keiner |
| `talking-heads` | Talking Heads | `talking-heads` / Closed Beta | `/features/talking-heads.html` / Closed Beta | keiner |
| `visual-fx-frame-webgpu` | Visual FX Frame WebGPU | kein Hub-Eintrag | keine Detailseite | entfällt |
| `webgpu-emoji-rain` | WebGPU EmojiRain | `emoji-rain` / Closed Beta | `/features/emoji-rain.html` / Closed Beta | keiner |
| `webgpu-weather-control` | WebGPU Weather Control | kein Hub-Eintrag | keine Detailseite | entfällt |

### Laufzeitursache und Cachekorrektur

Die Closed-Beta-Copy war in allen vier Root-Locales unter `home.closedBeta` abgelegt. Das Homepage-Markup fragt `homeV2.closedBeta.*` ab; der bestehende i18n-Resolver läuft ausschließlich über diesen Pfad. Texte wurden in `homeV2` verschoben. Der Regressionstest lädt jede echte Locale-Datei und ruft den tatsächlichen `I18n.t('homeV2.closedBeta.title')`-Resolver auf.

Der Service Worker cache-first behandelte `/locales/*.json`, sodass bereits gecachte Locale-Dateien die neue Copy verdecken konnten. Cache wurde von `ltth-v1.3.3` auf `ltth-v1.3.4` angehoben; Locale-Requests verwenden jetzt Network-first mit Cache-Fallback für Offlinebetrieb. Die Aktivierung löscht nur alte `ltth-*`-Caches und lässt fremde Caches desselben Ursprungs bestehen.

### Grenze und Status

Alle sieben vorhandenen Detailseiten tragen den Closed-Beta-Hinweis und enthalten keinen `/download.html`-Link. Die vier genannten Apps haben derzeit keine Hub- oder Detailseite, nur den Homepage-Eintrag. Homepage und Hub besitzen weiterhin allgemeine LTTH-Download-CTAs außerhalb der einzelnen Closed-Beta-Karten; diese wurden nicht als app-spezifische Angebote behandelt.

Im aktuellen Source-Checkout gibt es keinen Service-Worker-Registrierungsaufruf. Die aktualisierte Workerdatei und ihr Cacheverhalten sind geprüft, eine installierte Website-Instanz wurde nicht getestet. `website:features:locales:check` meldet aktuell fehlende Store-Quellen für `talking-heads` und `music-bot`; der parallel bearbeitete Plugin-Store-Checkout enthält deren Entfernung. `plugin-store.json` blieb außerhalb dieses Scopes.

Regression: `public-closed-beta-marketing.test.js` und `plugin-release-policy.test.js`, 2 Suites / 17 Tests bestanden. Website-Allgemeinlocale-Check, Feature-Hub-Generator und JS-Syntaxchecks bestanden. Kein öffentlicher Preview-/OBS-Nachweis.

## Laufzeitkorrektur und Detailmatrix (Nachprüfung, 2026-10-07)

### Closed-Beta-Verzeichnis

| Policy-ID | Homepage | Hub-Slug / Status | Detailseite / Status | App-spezifischer Downloadlink |
|---|---|---|---|---|
| `animazingpal` | AnimazingPal | `animazingpal` / Closed Beta | `/features/animazingpal.html` / Closed Beta | nein |
| `interactive-story` | Interactive Story | `interactive-story` / Closed Beta | `/features/interactive-story.html` / Closed Beta | nein |
| `music-bot` | Music Bot | `plugin-music-bot` / Closed Beta | `/features/plugin-music-bot.html` / Closed Beta | nein |
| `osc-bridge` | OSC Bridge | `osc-bridge` / Closed Beta | `/features/osc-bridge.html` / Closed Beta | nein |
| `schnorrbecher` | Schnorrbecher | kein Hub-Eintrag | keine Detailseite | entfällt |
| `sidekick` | Sidekick | kein Hub-Eintrag | keine Detailseite | entfällt |
| `stream-monsters` | Stream Monsters | `plugin-stream-alchemy` via Alias `streamalchemy` / Closed Beta | `/features/plugin-stream-alchemy.html` / Closed Beta; Guide `/streammonsters/` | nein |
| `talking-heads` | Talking Heads | `talking-heads` / Closed Beta | `/features/talking-heads.html` / Closed Beta | nein |
| `visual-fx-frame-webgpu` | Visual FX Frame WebGPU | kein Hub-Eintrag | keine Detailseite | entfällt |
| `webgpu-emoji-rain` | WebGPU EmojiRain | `emoji-rain` / Closed Beta | `/features/emoji-rain.html` / Closed Beta | nein |
| `webgpu-weather-control` | WebGPU Weather Control | kein Hub-Eintrag | keine Detailseite | entfällt |

Die Homepage-Sektion listet alle elf Namen. Sieben vorhandene Detailseiten tragen einen Statushinweis ohne app-spezifischen `/download.html`-CTA. Der Hub enthält zusätzlich allgemeine LTTH-Download-CTAs außerhalb der einzelnen Karten; diese Nachprüfung hat sie nicht als app-spezifische Beta-Links eingestuft. Stream-Monsters Guide verlinkt ausschließlich auf technische Dokumentation.

### Korrigierter Homepage-i18n-Pfad

Die deutsche Browseranzeige blieb englisch, weil die vier Closed-Beta-Locale-Objekte unter dem alten Namespace `home.closedBeta` statt `homeV2.closedBeta` lagen. In allen vier Dateien verschoben. Ein Jest-Test führt das echte `js/i18n.js` mit jeder echten Locale-Datei aus und prüft `I18n.t('homeV2.closedBeta.title')`.

### Service-Worker-Locale-Cache

`sw.js` verwendet jetzt `ltth-v1.3.4` und Network-first für `/locales/*`, mit Cache-Fallback bei Netzwerkausfall. Die Aktivierung löscht nur alte `ltth-*`-Caches, keine fremden Cache-Namen auf derselben Origin. Ein Laufzeittest führt den echten Service-Worker-Handler aus und prüft Netzwerkpriorität sowie Cache-Bereinigung.

### Nachweise und offene Grenze

- Closed-Beta- und Policy-Suites: 2 Suites / 18 Tests grün.

### Nachprüfung nach ergänzten Übersichtslinks (2026-10-08)

- Die sieben vorhandenen Beta-Detailseiten erhalten einen lokalisierten Link zurück zur Feature-Übersicht; DE/EN/ES/FR-Ziele folgen der gewählten Sprache.
- Fokussierter `closed-beta-locale-availability.test.js`: 1 Suite / 12 Tests grün; alle vier Locale-JSON-Dateien parsen.
- Review-Patch mit ausschließlich Link-/Locale-Hunks: `C:\Users\logga\AppData\Local\Temp\ltth-pages-review-0d62dfe0c920451dba1c22cf3a7d6c09\closed-beta-overview-links.patch`; Manifest daneben, Basis `d65a54891f6ba1d055e95fda70d0df696d5299f0`, SHA-256 `2eed2db2e36079462192415a9d84165cace794e3e22b278c6f205c0967500ff8`.
- Kandidat ist nur ein Review-Patch; die gemischten Änderungen an Pages-Workflow, Bundle-Builder, Allowlist, Release-Policy, Store, Homepage, Plugin-Hub und Sitemap sind nicht in diesen Link-Hunks integriert. Vor Produktion muss der CEO diese Änderungen separat reviewen und zusammenführen lassen; kein Commit, Push oder Deploy erfolgte.
- Öffentliche Sonderrouten: `/streammonsters/` zeigt lokal Closed Beta und einen Link zur Music-Bot/Stream-Monsters-Übersicht; `/streamalchemy-theme-test.html` bleibt eine interne Testseite ohne Beta-Download, darf aber nicht als öffentlicher Feature-Einstieg beworben werden. `/obs-webgpu.html` bleibt eine eigenständige OBS-WebGPU-Installationsseite; Zuordnung zur separaten Closed-Beta-App ist nicht eindeutig und wurde hier nicht geändert. Chatango-Detailroute ist im lokalen Bundle nicht vorgesehen; der vorhandene Bundle-Builder muss sie beim finalen Build weiter herausfiltern.
