# Game Engine: Einzelsounds, lesbare Spielernamen und aktive Timer

## Ziel

Die Game Engine soll jeden vorhandenen Connect-4-, Wheel- und Slot-Sound einzeln stummschalten können, in Leaderboards lesbare Spielernamen statt stabiler numerischer TikTok-IDs anzeigen und Timer ausschließlich für die aktuell im Overlay sichtbare interaktive Partie laufen lassen.

Die Umsetzung bleibt serverautoritativ, erhält bestehende Daten und ist für einen isolierten Reload des Game-Engine-Plugins geeignet.

## Einzelsound-Steuerung

- Jeder bestehende Connect-4-, Wheel- und Slot-Audioevent erhält einen eigenen An/Aus-Schalter.
- Der globale `soundEnabled`-Schalter bleibt als Master-Schalter bestehen.
- Ein deaktivierter Event bleibt vollständig stumm. Insbesondere darf ein deaktivierter Custom-Sound nicht auf den Standardsound zurückfallen.
- Aktivierung und Audioquelle sind getrennte Zustände:
  - Upload ersetzt die Quelle durch eine Custom-Datei.
  - „Standard wiederherstellen“ entfernt nur die Custom-Datei.
  - An/Aus ändert nur die Aktivierung.
- Fehlt ein gespeicherter Aktivierungswert, gilt der Sound aus Kompatibilitätsgründen als aktiviert.
- Änderungen werden sofort per Socket an offene direkte und Unified-Overlays verteilt.
- Status, Schalter und Rückmeldungen werden in DE/EN/ES/FR lokalisiert.

Die Aktivierung wird additiv gespeichert. Bestehende Custom-Audio-Datensätze und Dateien werden nicht migriert oder gelöscht.

## Spieleridentität und Leaderboards

- Die stabile TikTok-ID bleibt der interne Schlüssel für Sessions, Statistik, ELO und Deduplizierung.
- Zusätzlich wird der lesbare Zuschauername durch den gesamten interaktiven Startpfad getragen und an der Session gespeichert.
- Leaderboard-Antworten lösen numerische interne Schlüssel in einen lesbaren Namen auf.
- Für historische interaktive Partien wird der bereits gespeicherte `viewer_display_name` verwendet.
- Neue Events bevorzugen den verfügbaren TikTok-Username; der Anzeigename ist der Fallback. Nur wenn keine lesbare Identität existiert, bleibt die interne ID als letzter Fallback erhalten.
- Bestehende `game_sessions`- und `game_player_stats`-Schlüssel werden nicht umgeschrieben, damit ELO und Historie unverändert zusammengehören.

## Sichtbarkeit und Timer-Lifecycle

Der `InteractiveDisplayRouter` ist die alleinige Autorität dafür, welche Partie sichtbar und damit zeitaktiv ist.

Auswahlreihenfolge:

1. Ein wartender Host-Zug am Kopf der gemeinsamen Connect-4-/Schach-FIFO hat Vorrang.
2. Wenn kein Host-Zug wartet, wird die älteste aktive Zuschauerzug-Partie angezeigt.
3. Resultat- und Leaderboard-Phasen behalten ihre bereits definierte kurze Präsentation; wartende Host-Bretter verdrängen nach dem Resultat weitere Präsentationen.

Timerregeln:

- Nur eine sichtbare Partie in der Phase `playing` darf einen laufenden Timer besitzen.
- Bei Wechsel auf ein anderes Board, Animation, Resultat, Leaderboard oder Suspension wird der aktuelle Timer pausiert.
- Für Zuschauerzüge werden Restzeit und absolute Deadline getrennt behandelt:
  - sichtbar: absolute Deadline gesetzt und Timeout geplant,
  - verborgen: Timeout gelöscht, Deadline leer und Restzeit persistent gespeichert.
- Beim erneuten Anzeigen wird aus der gespeicherten Restzeit eine neue Deadline berechnet.
- Ein neu entstandener Zuschauerzug startet erst nach Ende der Zuganimation und nur dann, wenn genau diese Partie ausgewählt wurde.
- Beim Pluginstart werden zunächst alle wiederhergestellten Zuschauer-Timer pausiert rekonstruiert; erst die vom Router ausgewählte Partie wird fortgesetzt.
- Der Timeout-Callback prüft Status, Zugrolle, Session-Revision, Deadline und aktuelle Display-Session erneut, bevor er einen Zugverlust auslöst.
- Bei deaktiviertem Connect-4-Timer bleiben Deadline und Restzeit leer und es wird kein Timeout geplant.

Direkte Overlays dürfen keine eigene Ersatz-Displayauswahl mehr erfinden. Sie rendern ausschließlich den autoritativen Display-State des Servers.

## Daten und Schnittstellen

- Die Audio-Settings-Endpunkte liefern pro Event mindestens `enabled`, `isCustom` und die vorhandenen Quelldaten.
- Ein validierter Admin-Endpunkt setzt den Aktivierungsstatus eines einzelnen Audioevents und gibt stabile Fehlercodes für unbekannten Spieltyp, Scope oder Event zurück.
- Das Update-Socket-Ereignis enthält Spieltyp, Scope, Audioevent und Aktivierungsstatus.
- Der persistierte interaktive State erhält additiv `viewer_time_remaining_ms`.
- Session- und Display-Snapshots liefern `viewerDeadlineMs` nur für den laufenden sichtbaren Timer sowie `viewerTimeRemainingMs` für Diagnose und Dashboard.
- Leaderboard-Zeilen behalten den kompatiblen Feldnamen `username`, enthalten darin aber den aufgelösten lesbaren Namen. Der interne Schlüssel kann separat als `playerId` geliefert werden.

## Fehlerbehandlung

- Ungültige Audio-Schaltanfragen liefern HTTP 400 mit stabilem Fehlercode und verändern keinen Zustand.
- Scheitert Custom-Audio beim Abspielen, darf nur bei aktiviertem Event auf den Standardsound zurückgefallen werden.
- Ein verspäteter Timer-Callback für ein nicht mehr sichtbares Board ist wirkungslos.
- Kann ein historischer Spielername nicht aufgelöst werden, bleibt die ID sichtbar, statt den Leaderboard-Eintrag zu verlieren.

## Tests

- Datenbanktests für Default-Aktivierung, Einzelschalter, Custom/Default-Erhalt und additive Timer-Restzeit.
- Route- und Overlaytests für jeden Connect-4-, Wheel- und Slot-Audiotyp sowie „deaktiviert bedeutet kein Fallback“.
- Leaderboardtests für aktuelle und historische numerische IDs, lesbare Namen und unveränderte Aggregation.
- Router-/Controllertests für mehrere parallele Partien, Host-Priorität, ältesten Zuschauerzug, Pause/Fortsetzung, Animation, Resultat, Suspension, Restart-Recovery und verspätete Timeouts.
- Direkte und Unified-Overlaytests, die ausschließlich den autoritativen Display-State akzeptieren.
- Vollständige Game-Engine-Suite, ESLint, CSS-Build und abschließend die vollständige App-Test-Suite.

## Rollout

- Änderungen bleiben auf Game Engine und die zugehörigen Locale-Dateien begrenzt.
- Nach erfolgreicher Verifikation wird der fokussierte Commit direkt nach `origin/main` gepusht.
- Danach wird ausschließlich das laufende Game-Engine-Plugin neu geladen; die gesamte App und fremde EmojiRain-Arbeit bleiben unberührt.
- Live-State, Leaderboard-Antworten und Pluginstatus werden anschließend read-only geprüft.
