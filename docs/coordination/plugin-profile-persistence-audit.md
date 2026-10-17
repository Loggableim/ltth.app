# Plugin-Persistenz: Kandidaten für fehlenden Profilscope

**Stand:** Read-only Quellinventar am HEAD `d65a54891f6ba1d055e95fda70d0df696d5299f0`, Windows-Arbeitskopie 2026-10-08. Keine Profile/DBs gestartet und keine Produktdateien verändert. Dies sind Review-Kandidaten, keine pauschal bestätigten Produktfehler: die fachliche Erwartung „pro Streamerprofil“ muss je Plugin vom Owner bestätigt werden.

## Top 5

### 1. Quiz Show — höchste Priorität für isolierte Regression

- **Beleg (HEAD, Datei aktuell sauber):** `app/plugins/quiz-show/main.js:270-307` erstellt `quiz_show.db` unter `ConfigPathManager.getPluginDataDir('quiz_show')` ohne Profiloption und öffnet sie mit `new Database(dbPath)`. Der Kommentar an Zeile 306 nennt die DB ausdrücklich „not scoped“.
- **Datenbedeutung:** Dieselbe Plugin-DB enthält `leaderboard_seasons` und `question_history` (Schema ab ca. Zeile 348/369), während Viewer-Punkte zusätzlich in der Hauptdatenbank und dort laut Codekommentar explizit „per-streamer“ gespeichert werden (Zeilen 310, 512-514). Plugin-lokale Saison-/History-Daten wirken dadurch profilübergreifend geteilt; Schema-/Defaultinserts und History-Cleanup laufen beim Init.
- **Evidenzgrenze:** Code belegt den globalen Pfad und persistente, potentiell profilbezogene Domänendaten. Nicht bewiesen ist, dass Quizfragen, Pakete, Saison oder Historie laut Produktvertrag tatsächlich pro Profil statt global gelten sollen.

### 2. Schnorrbecher — HEAD-Befund, Dirty-Kandidat geändert

- **Beleg (HEAD):** `app/plugins/schnorrbecher/main.js` Konstruktor verwendet `CoinJarStore(api.getPluginDataDir())`, `init()` ruft `ensurePluginDataDir()` unscoped. `lib/state-store.js` speichert Config und State als `coin-jar-config.json` / `coin-jar-state.json`; der Engine-Konstruktor löscht im Sessionmodus geladenen State. Damit teilten Profile denselben Ablageort und Start konnte gemeinsame Sessiondaten leeren.
- **Dirty-Abgrenzung:** `main.js` ist parallel verändert; der Dirty Stand verwendet inzwischen `{ profileScoped: true }` für Store und Ensure. Diese Änderung ist Kandidatenevidenz und noch keine HEAD-/Integrationsbestätigung. Die gleichzeitig dirty Legacy-Migration bleibt ein separater Reviewpunkt.
- **Evidenzgrenze:** Ursprünglicher LIVE-012-Pfadfehler ist im HEAD klar; Dirty-Kandidat adressiert ihn. Keine aktuelle A→B→A Regression in diesem Audit ausgeführt.

### 3. Minecraft Connect — Plugin-Konfiguration im globalen Plugin-Datenordner

- **Beleg (HEAD, Datei aktuell sauber):** `app/plugins/minecraft-connect/main.js:29-32` bindet `this.pluginDataDir = api.getPluginDataDir()` ohne Profiloption. `loadConfig()` liest daraus `config.json` (ca. Zeile 145); `saveConfig()` schreibt dieselbe Datei (ca. Zeile 221). Die Konfiguration enthält u.a. WebSocket host/port, Chat-/Gift-Mappings und Aktionen.
- **Risiko:** Zwei Streamerprofile teilen dieselben Minecraft-Verbindungs- und Triggerregeln; ein Profilwechsel kann die geladene Konfiguration des anderen verwenden oder Änderungen für beide sichtbar machen.
- **Evidenzgrenze:** Profilbezogene Konfiguration ist plausibel, aber ein absichtlich globaler einzelner Minecraft-Serververtrag ist möglich und muss bestätigt werden.

### 4. Emoji Rain — User-Mappings in globalen Dateien, doppelt persistiert

- **Beleg (HEAD, Datei aktuell sauber):** `app/plugins/emoji-rain/main.js:47-56` legt `users.json` im unscoped Plugin-Datenpfad an und zusätzlich `user_configs/emoji-rain/users.json` unter dem globalen User-Configs-Ordner. Die Mapping-Route schreibt beide Dateien (ca. Zeilen 1999-2006; zusätzliche Import-/Updatepfade ca. 2067-2073 und 2108-2109). Beim Start kopiert `migrateOldData()` zwischen mehreren globalen Alt-/Kanonikpfaden (ca. 1474 ff.).
- **Risiko:** Viewer→Emoji-/Animal-Mappings werden zwischen Profilen geteilt; globales Dual-Write und mtime-basierte Auflösung können Profiltrennung zusätzlich erschweren.
- **Evidenzgrenze:** Die Persistenz ist global belegt; der Produktvertrag könnte Mappings bewusst installationsweit teilen. Es wurde keine Migration oder Konfliktauflösung ausgeführt.

### 5. WebGPU Emoji Rain — gleiches globales Mapping-Muster für V3

- **Beleg (HEAD, Datei aktuell sauber):** `app/plugins/webgpu-emoji-rain/main.js:54-62` speichert V3-Uploads/Mappings/Presets in `api.getPluginDataDir()/v3` und die user-editierbare Mappingkopie in `user_configs/webgpu-emoji-rain/v3/users.json`. Die Mappingrouten schreiben beide Orte (ca. Zeilen 2080-2091, 2148-2158, 2193-2194); der Migrationspfad liest globale alte Speicherorte (ca. 1591 ff.).
- **Risiko:** dieselben Viewer-Zuordnungen und Presets teilen sich zwischen Profilen; zwei gleichzeitig verwendete Profile könnten denselben User-Mappingbestand verändern.
- **Evidenzgrenze:** Globaler Pfad und Dual-Write sind Codebelege. V3-Assets/Presets könnten absichtlich global sein; produktseitige Scoping-Anforderung ist ungeklärt.

## Genau eine Regressionsempfehlung

**Quiz Show** zuerst isoliert prüfen. Mit einem synthetischen `ConfigPathManager`-Root und zwei Profil-IDs A/B soll ein reiner Pfad-/Initialisierungstest belegen, ob beide Plugininstanzen aktuell dieselbe `quiz_show.db`-Pfadidentität erhalten. Danach als Zielvertrag (erst nach Owner-Bestätigung) getrennte A/B-Pfade, unterschiedliche synthetische Saison-/Historymarker, Reload von A mit Erhalt nur von A und bytegleiche B-Marker erwarten. Test darf `:memory:` oder isolierte temporäre Fixture-DBs nutzen; keine existierenden Nutzerpfade und kein echter Profilmanager. Da Initialisierung schema/default/cleanup ausführt, muss Fixture vor/nachher auf ihr eigenes Testroot begrenzt sein.

## Scope-Grenzen und Review-Hinweise

- Dirty-Zuordnung geprüft: Quiz Show, Minecraft Connect, beide Emoji-Rain-Hauptdateien sind am betrachteten HEAD unverändert; Schnorrbecher `main.js` ist dirty und wurde für die HEAD-Aussage aus `git show HEAD` beurteilt. Vorhandene Dirty-Dateien anderer Plugins wurden nicht als HEAD-Beleg verwendet.
- Ausdrücklich nicht als Befund gewertet: globale Audio-/Bild-Caches wie Music-Bot/Soundboard sowie uploadbare Medien allein. Ein globaler Cache ist nicht automatisch profilbezogener Zustand; bei Game Engine, Fireworks oder Gift Milestone wäre die gewünschte Trennung ohne Bestätigung der Medien-/Config-Verknüpfung spekulativ.
- Ebenfalls nicht bewertet: Talking Heads und TTS, um parallele Änderungen nicht zu prüfen oder zu beeinflussen; pluginspezifische APIs, die nur in `app.getDatabase()` persistieren, sofern dieser Zugriff an die aktive Profil-DB gebunden ist.
- Kein Test, kein Profilwechsel, keine DB-Öffnung, keine Implementierung. Vor einer Änderung braucht jeder Kandidat einen bestätigten Produktscope und eine eigene Legacy-Datenentscheidung; globale Daten dürfen nicht automatisch einem Profil zugeordnet werden.
