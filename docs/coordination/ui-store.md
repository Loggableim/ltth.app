# UI, Locale und Store-Korrekturen

Stand: 2026-10-06

## Befund und Umsetzung

- **GCCE:** Die Ausführungsstatistik blieb leer, und feste Filteroptionen deckten registrierte Kategorien sowie Berechtigungen wie `vip` nicht ab. Das UI zeigt jetzt `totalExecuted`, erstellt Filterwerte aus den tatsächlich geladenen Befehlen und unterscheidet leere Ergebnisse von einer leeren Befehlsliste.
- **Weather Control:** Vom Server gespeicherte Standardpresets erschienen neben den eingebauten Presets doppelt. Die Auswahl dedupliziert Namen ohne Groß-/Kleinschreibung und erhält echte eigene Presets. Die TikTok-Studio-Schaltfläche verwendet jetzt den gemeinsamen Locale-Key.
- **WebGPU Weather Control:** Beschädigte UTF-8-Zeichen wurden in der Oberfläche und den deutschen Fallbacktexten korrigiert. Intensitätsregler erhalten Hundertstelwerte und zeigen zwei Nachkommastellen. Das gemeinsame Feldmapping setzt `fogColor`; die aktive Liste verarbeitet auch Effektaktionen, die der Diagnosekanal als Stringnamen sendet.
- **Visual FX Frame WEBGPU:** Der dynamische Noise-Octaves-Wert hatte einen statischen Übersetzungsschlüssel und wurde beim Lokalisieren überschrieben. Der Wert ist jetzt dynamisch.
- **Plugin Store:** Open-Beta ist kein Funktionsbereich mehr, der Utilities ausschließt. Für den Advanced-Timer-Galeriepfad wurde das vorhandene Screenshot-Asset nach `app/public/screenshots/features/advanced-timer.png` gespiegelt. Fehlgeschlagene Bildladevorgänge zeigen einen verständlichen Status.
- **Sidekick:** Alle sechs Tabs, Einstellungs-/Playground-/Memory-/Analytics-Labels und Leerzustände haben Locale-Keys. API-gebundene Bereiche werden nach `i18n.ready` erneut geladen, damit dynamische Leerzustände beim Start die ausgewählte Sprache verwenden. de/en/es/fr enthalten eigene Übersetzungen; der IAB-Probe bestätigte die Navigation und dynamischen Leerzustände in en/es/fr. In den sichtbaren Einstellungswerten bleiben technische VNyan-Emotionsnamen (`Neutral`, `Happy`, `Joy`, `Blush`, `Surprised`, `Thinking`, `Angry`, `Sad`) sowie einzelne kanonische Eventnamen (`Follow`, `Share`, `Like`) bewusst als Integrationswerte stehen.
- **Plugin-Guides:** Die aktive Sidekick-Integration fehlte im Guide-Inventar. Eine Sidekick-Definition ergänzt jetzt einen sicheren UI-only Status-Schritt; sie öffnet die Statusansicht ohne Verbindung, Avataraktion oder TTS. Der Guide wurde für vier Sprachen generiert und bleibt Teil des Vertrags-Audits.

## Geänderte Dateien

- `app/plugins/gcce/ui.html`
- `app/plugins/gcce/locales/{de,en,es,fr}.json`
- `app/plugins/weather-control/ui.html`
- `app/plugins/webgpu-weather-control/ui.html`
- `app/plugins/visual-fx-frame-webgpu/ui/settings.html`
- `app/public/js/plugin-manager.js`
- `app/public/screenshots/features/advanced-timer.png` (identische Kopie des vorhandenen Root-Screenshots)
- `app/plugins/sidekick/ui.html`
- `app/plugins/sidekick/locales/{de,en,es,fr}.json`
- `app/test/gcce-all-commands-display.test.js`
- `app/test/weather-control-ui-smoke-regression.test.js`
- `app/test/visual-fx-frame-webgpu-ui.test.js`
- `app/test/plugin-manager-listing.test.js`
- `app/test/sidekick-ui-i18n.test.js`
- `app/test/webgpu-weather-control-ui-regressions.test.js`
- `scripts/plugin-guides/sidekick.js`, `scripts/plugin-guides/index.js`
- `docs/plugins/sidekick.html`, Guide-Locale-Bundles, Guide-Inventar und Sitemap (generierte Guide-Dateien)
- Sidekick Guide-Vertrags-/Katalog-/E2E-Tests und `app/test/animazingpal-live-host-integration.test.js`

## Öffentliche Oberflächen und Berechtigungen

Diese UI-Runde fügt keine HTTP- oder Socket-Oberfläche hinzu und ändert keine Admin-/Schreibroute. Die Plugin-Einstellungsseiten bleiben Verwaltungsoberflächen. Das Advanced-Timer-Bild ist ein statisches Asset unter dem bereits verwendeten Galeriepfad. Die öffentlichen Overlay-Allowlisten und Projektionen werden separat in `public-overlays.md` dokumentiert.

## Prüfungen

**Behoben und geprüft:**

- Aus der vorherigen Runde: sechs fokussierte Jest-Suites mit 44 Tests bestanden.
- In dieser Runde: `plugin-manager-listing.test.js` mit 12/12 Tests bestanden, einschließlich der beiden GET-API-Assertions und der veralteten Warnmeldung; `sidekick-ui-i18n.test.js` mit 14/14 Tests bestanden. Die sechs fokussierten UI/Store-Suites bestanden 52/52 Tests.
- Isolierter IAB-Harness auf loopback geprüft. EN, ES und FR: alle sechs Tabs und API-gebundenen Leerzustände wurden nach `i18n.ready` sichtbar geprüft und waren übersetzt. DE: Status, Avatar und Einstellungen wurden geprüft; Memory, Analytics und Events wurden in diesem Lauf nicht erneut sichtbar geprüft.
- Der Store-Detail-Drawer-Test bestand gezielt; die neue Assetdatei existiert und hat dieselbe Größe wie die Root-Vorlage.
- Sidekick Public-Status-Integration: `vnyan-integration.test.js` bestand 8/8. Das Socket-Testdouble implementiert jetzt `io.to(room).emit(...)` und prüft die projizierte Room-Ausgabe. AnimazingPal-Integration bestand mit gebündeltem Node 22 (94 Tests); die gezielte `--detectOpenHandles`-Wiederholung endet regulär mit Exit 0 und ohne Open-Handle-Warnung. Das Fixture-Teardown bereinigt nach jedem Test ausschließlich noch laufende synthetische Speech-Playback-Timer und Fixturemap-Einträge; Produktcode und Sidekick-/AnimazingPal-Vertragsassertions blieben unverändert. Die 65 EventDeduper-Intervalle waren bereits `unref()`’d.
- Guide-Prüfungen: fünf fokussierte Suites mit 24 Tests bestanden; `scripts/build-plugin-docs.js --audit-contracts` meldet 39 Guides und null Vertragsfehler. Der Locale-Verifier besteht. Die Guide-Capture-Metadaten sind teilweise veraltet: 28 Receipts verwenden noch `streamalchemy__...` statt des aktuellen `stream-monsters__...`-Inventars; zusätzlich fehlen vier Sidekick-Statusvarianten. Insgesamt müssen 32 Locale-Captures echt neu erzeugt werden.
- Frische Locale-Triage vor dem zeitgleichen STT-Ticker-Fix: `translation-contract`, `plugin-i18n-small-plugin-regression`, `config-import-translation-contract`, `advanced-timer-ui-i18n` und `sidekick-ui-i18n` bestanden (27 Tests gesamt). `plugin-static-form-controls-i18n` meldete damals den fehlenden Key am STT-Ticker-Platzhalter `LTTH, TikTok`; der Profil-Fachagent hat inzwischen den namespaced Platzhalter in de/en/es/fr ergänzt und berichtet 1/1 Suite bestanden sowie Übersetzungsvalidator 0 Befunde. Dieser Fehler ist damit als fremd behoben markiert.
- Inline-JavaScript aus GCCE, Weather-Control, WebGPU Weather und Sidekick wurde mit `vm.Script` geparst.
- Die JSON-Dateien von GCCE und Sidekick wurden durch Jest eingelesen; Sidekick-Übersetzungen wurden zusätzlich über den App-i18n-Katalog in allen vier Sprachen geprüft.

**Teilweise geprüft:**

- Sidekick-IAB: EN/ES/FR sind über alle Tabs geprüft. Für Deutsch wurden drei von sechs Tabs im aktuellen IAB-Lauf geprüft. Die technischen Emotion-/Eventwerte bleiben als Integrationsschlüssel englisch; weitere redaktionelle Sprachprüfung ist nicht erfolgt.

**Nicht geprüft:**

- Keine Browser-/OBS-Liveabnahme und kein Start der Nutzeranwendung. Die Tests belegen Quell-/DOM-Verträge, keine reale Streamdarstellung.

## Teilweise geprüft und blockiert

- Die aktuelle Guide-Spezifikation erwartet 860 CaptureReceipts; das Manifest enthält 856. Davon sind 28 Stream-Monsters-Receipts veraltet (`streamalchemy__...` IDs und alte Pfade), und 32 aktuelle Varianten fehlen (28 Stream-Monsters plus vier Sidekick). `playwright` samt gebündeltem Chromium ist vorhanden, aber der headless Browserstart endet mit `spawn EPERM`; der offizielle Capturer erwartet Puppeteer, das nicht installiert ist. Es wurde keine Abhängigkeit nachinstalliert und kein Screenshot/Receipt umbenannt oder erfunden. Der detaillierte Inventarvergleich steht in `store-inventory-triage.md`.
- Der STT-Ticker-Platzhalterfehler ist inzwischen durch den Profil-Fachagenten behoben; dessen gezielter Suite- und Validatorlauf bestand. Dieser Status ersetzt den vorangehenden offenen Triagebefund.

## Verbleibende Risiken

- Die Assetkopie muss bei späterer Screenshot-Aktualisierung mit der Root-Datei synchronisiert werden.
