# Stream Monsters Docs-Capture Backend Gate

Stand: 2026-10-06. Quellenprüfung und unit-/plugin-scope Regressionen only. Keine App-, Server-, Plugin- oder Browser-Capturestarts; keine Temp-Seed-/UI-/Guideänderung vorgenommen.

## Quellreview: Planabgleich und Befund

Der Plan beschreibt die relevanten Initmutationen zutreffend, sollte aber `GET` nicht automatisch als read-only werten:

- `init()` normalisiert Config und kann `persistSanitizedConfigIfNeeded()`/`api.setConfig()` ausführen; `ensureDefaultStreamMonstersGiftMapping()` kann eine Defaultmapping-Zeile einfügen.
- `StreamMonstersDatabase.initialize()` legt Schema an und führt Migrations-/Datenkorrektur-SQL aus. Das ist nur auf der isolierten temporären App-Datenbank vertretbar.
- `StreamMonstersBattleMatchService` pausiert reconnect charges bereits im Konstruktor. `start()` ruft sofort `safeSweep()` auf und kann überfällige Battlezustände ändern.
- Free-Egg, Retention, Battle-Match und Deadline Services starten Scheduler/Timer; der normale Init flush’t außerdem die Event-Outbox und registriert TikTok-, GCCE- und Lifecycle-Handler.
- Ein normaler Creator-State-GET war nicht schreibfrei: `store.getStreamHype()` führt `INSERT OR IGNORE` aus; `ProgressionService.getCurrentSeason()` nutzt `ensureSeason()`; `getStreamMetrics()` legt Metricszeilen an. Der Capturepfad muss diese Aufrufe vermeiden.
- `GET /api/streammonsters/avatar/:token` kann Netzwerkzugriff auslösen. Overlay-Heartbeat ist POST und aktualisiert State. Beide sind im Capture nicht freizugeben.
- Die `stream-monsters` Creator-UI lädt die im Captureplan genannten Status-/Creator-/Gift-/Catalog-/Leaderboard-GETs und wiederholt Status/Creator-State-Polling; optional folgen Creator-Catalog/State-GETs, wenn ein Username geliefert wird. Die UI-Aktionen selbst werden nicht automatisch ausgelöst. Statische lokale Skripte/Bilder/72 Stage-Assets sind separate Core-Static-Requests und bleiben in der Capture-Networkpolicy des Overlayowners.

`protectAdmin` bleibt auch im Capturepfad aktiv. `createAdminAuth` erlaubt direkte Loopbackrequests ohne Forwardingheader gemäß bestehendem Verhalten; es gibt keinen Capture-Auth-Bypass.

## Umsetzung

- `api.isDocsCapture === true` ist im Plugin und Route-Objekt als nicht beschreibbare Capability kopiert.
- Vor `StreamMonstersDatabase.initialize()` muss das Plugin jetzt `api.assertDocsCaptureDatabasePath(appDatabase.dbPath)` aufrufen. Der PluginAPI-Helper erhält `docsCaptureProfileRoot` unveränderlich aus dem Ergebnis der erfolgreich validierten Capture-Umgebungsrichtlinie. Im Capturemodus erlaubt er nur den absoluten Seedpfad `<profileRoot>/ltth.app/user_configs/default.db`; er prüft echte Pfade von System-Temp, Profil, Konfigurationsordner, `user_configs` und DB-Datei und weist fehlende, relative, `:memory:`- und symlink-escape-Pfade mit `DOCS_CAPTURE_DATABASE_PATH_DENIED` ab. Im normalen Runtime-Modus ist der Helper ein No-op.
- Früher, eigener Capture-Initpfad: liest Config in-memory, persistiert sie nicht, initialisiert nur die Plugin-DB für lokale Reads, baut einen inerten Engine-Kontext und registriert Routes. Er konstruiert keine Gift-/Retention-/Battle-/Deadline-/Onboarding-/Progression-Services, startet keine Timer, installiert keine TikTok-/GCCE-/Plugin-Events, sendet keine Socketevents und flusht keine Outbox. Der Default-Giftmapping-Schreibpfad wird übersprungen.
- `updateConfig()` wirft im Capturemodus `STREAM_MONSTERS_DOCS_CAPTURE_READ_ONLY`.
- Backend-Routes lassen nur die Creator-UI und die expliziten lokalen Creator-GETs durch: creator-state, creator-catalog, gift-catalog, gift-mappings, monster-catalog und leaderboard. Alle anderen registrierten Routehandler werden im Capturemodus vor Ausführung mit 404 `docs_capture_route_disabled` blockiert. Das umfasst Mutationsmethoden, Avatarproxy, Overlay-/Heartbeat- und sonstige unfreigegebene GETs.
- Der Capture-Routeaufbau übergibt `giftCatalogProvider: locale => this.getStreamMonstersGiftCatalog(locale)`. Diese liest via `api.getDatabase()` aus derselben validierten Capture-Profil-DB; `DatabaseManager.getGiftCatalog(locale)` ist ein SELECT-Pfad mit bestehendem Locale-Fallback. Die normalen Routes und API-Semantik bleiben unverändert.
- Creator-State liest Hype im Capturemodus per SELECT und gibt bei leerem Tempbestand einen synthetischen Nullstand zurück. Progression/Collection/Battle Services fehlen absichtlich, daher erfolgen weder Season-Erstellung noch Metrics-/Hype-Initialisierung.
- Die geplanten Seeds gehören dem Overlayowner: `api.getDatabase()` und der Stream-Monsters-Store lesen dessen temporäre App-DB bzw. Plugin-DB; ein einziges dort gesätes anonymes Giftmapping wird normal über `getGiftMappings()` gerendert. Kein Plugin-Init-Seed und keine echte Zuschauer-ID.
- Normale Runtime verzweigt weiterhin in den bestehenden Initpfad.

## Geänderte Dateien

- `app/plugins/stream-monsters/index.js`
- `app/plugins/stream-monsters/backend/streammonsters/routes.js`
- `app/modules/docs-capture-policy.js`
- `app/modules/plugin-loader.js`
- `app/server.js`
- `app/test/streammonsters-docs-capture-safety.test.js`
- `app/test/streammonsters-docs-capture-seed-schema.test.js`
- `app/test/docs-capture-policy.test.js`
- `app/test/docs-capture-plugin-api.test.js`
- `docs/coordination/streammonsters-capture-backend.md` (dieser Bericht)

UI, Guide, Runner und Seedformat blieben außerhalb meiner Änderung. Die Capture-Policy-, Server- und PluginAPI-Pfadübergabe wurde mit dem Orchestrierungs- und Profilowner abgestimmt; am zentralen TikTok-Adapter wurde nichts geändert.

## Prüfung

- Bestanden mit gebündeltem Node 22.14.0: gemeinsamer fokussierter Lauf aus `app/`, 8 Suites / 69 Tests (PluginAPI-Pfadguard, Seed, Capture-Safety inklusive Guard-vor-Initialize/falscher-Pfad, Seed-Schema-/Gift-GET-Kompatibilität, normale Integration, Routes-Security und Config-Transaction sowie Capture-Policy).
- Der synthetische Child-Prozess-Roundtrip wurde ausgelassen, nachdem `spawnSync` für den gebündelten `node.exe` in der Sandbox mit `EPERM` blockiert wurde. Die übrigen Policy-, Symlink- und Server-Wiring-Assertions liefen erfolgreich.
- `StreamMonstersDatabase.initialize()` liest nach dem Seed das synthetische `gift_catalog`-Objekt und `streammonsters_gift_mappings`-Objekt, ohne den Seed zu verlieren. Die Regression führt den Seed über die echte `DatabaseManager`-Klasse, initialisiert das Plugin und ruft den registrierten Capture-GET-Handler direkt auf; `Documentation Heart` erscheint mit `locale=de` trotz leerer `names_by_locale`-Spalte durch den vorhandenen Fallback, während das aktive Mapping erhalten bleibt.
- **LTTH-LIVE (Capture-Giftkatalog) behoben und isoliert geprüft:** Der Capture-Routekonstruktor hatte keinen `giftCatalogProvider`; `StreamMonstersRoutes` fiel deshalb auf `() => []` zurück und `/api/stream-monsters/gift-catalog` gab `total: 0` aus. Der Capturepfad nutzt jetzt den bereits vorhandenen reinen App-DB-Readcallback; weder Provider/Netzwerkzugriff noch Writer oder Änderung der normalen API sind hinzugekommen.
- Kenney-Befund korrigiert: `app/plugins/stream-monsters/assets/kenney-monster-builder/PNG/Default/leg_redA.png` ist vorhanden. `app/test/streammonsters-plugin-integration.test.js` bildet `pluginDir` aus `process.cwd()/plugins/stream-monsters`; ein Lauf vom Repository-Root zeigt daher auf einen nicht existierenden Pfad unter `repo/plugins/`. Mit dem geforderten App-Arbeitsverzeichnis lief die vollständige Integration erfolgreich. Der frühere „fehlender Asset“-Fehler war ein CWD-bedingter Testaufruf, kein fehlendes Produktasset.
- Bestanden: scoped ESLint mit gebündeltem Node aus `app/`; `node --check` der geänderten Policy-, Loader-, Server-, Plugin- und neuen Regressionstestdateien; `git diff --check`.

## Offen / nicht geprüft

- Keine App-/Capturelaufzeit, echten HTTP-/Network-Allowlist-/Socket-/PID-/Temp-Profil-Lifecycle- oder Screenshotbelege gesammelt. Die jetzt ergänzte Pfadguard-Regression ist Methoden-/API-Test, kein realer Serverstart.
- Der frühere `automation-rule`-Screenshot wurde nicht neu erstellt und zeigt weiterhin den damaligen leeren Katalogzustand. Ein späterer Capture erfordert separate Freigabe; die Regression belegt nur den isolierten Handlerpfad.
- Capture-GET-Networkmatrix, Polling und statische 72 Assetrequests bleiben im Verantwortungsbereich des Capture-/Overlayowners. Kein Capture gestartet.
- Der erste volle Versuch des Policy-Tests kann den Subprozess nicht starten (`spawnSync ... node.exe EPERM`). Die in-process-Policytests bestehen; der child-env-Roundtrip ist deshalb nicht bestätigt.
