# Music Bot: Radio-Mix Auto-DJ und sichere Stream-Recovery

## Ziel

Auto-DJ soll einen abwechslungsreichen, zum bisherigen Geschmack passenden
Radio-Mix liefern: standardmäßig 80 Prozent aus der bewährten Music-Bot-History
und 20 Prozent passende YouTube-Radio-Ergänzungen. Titel und Künstler dürfen
innerhalb von zwölf Stunden nicht erneut gewählt werden. Wenn ein Auto-DJ-Stream
fehlschlägt, darf der aktive Titel niemals bei Sekunde 0 erneut gestartet
werden; stattdessen wird genau ein anderer zulässiger Titel gewählt.

## Umfang und Kompatibilität

- Der neue Auto-DJ-Modus heißt `mix`; die Modi `history`, `playlist` und
  `random` bleiben unverändert.
- Neue Konfigurationswerte sind `mixHistoryPercent` (Vorgabe `80`) und
  `repeatCooldownHours` (Vorgabe `12`). Bestehende Konfigurationen bleiben
  gültig und behalten ihren bisherigen Modus.
- Der Auto-DJ-Tab bietet `Radio-Mix` als Modus sowie Eingaben für Mix-Anteil
  und Wiederholungssperre. Status und Detailtext erklären Auswahlquelle,
  Filter und Fallback.
- Die Sperre gilt für Titel aus Zuschauer-Requests und Auto-DJ gleichermaßen,
  weil beide in der vorhandenen Music-Bot-History erfasst werden.

## Auswahlablauf

1. Auto-DJ lädt geeignete History-Kandidaten mit der bestehenden
   Mindest-Play-Anzahl.
2. Kandidaten werden gegen die letzten `repeatCooldownHours` aus
   `plugin_music_bot_history` gefiltert. Verglichen werden YouTube-ID sowie
   normalisierte Titel- und Künstler-Schlüssel; bei fehlendem Künstler bleibt
   die Titel-Sperre wirksam.
3. Per gewichteter Auswahl wird mit `mixHistoryPercent` ein History-Kandidat
   oder eine Ergänzung angefordert. Ergänzungs-Seeds werden aus zulässigen
   History-Titeln rotiert, nicht dauerhaft vom zuletzt gespielten Track
   übernommen.
4. Ergänzungen aus dem YouTube-Radio durchlaufen dieselbe Sperre. Gibt es für
   die gewählte Quelle keinen zulässigen Titel, wird auf die andere Quelle
   ausgewichen. Eine Sperre wird dafür nie aufgeweicht.
5. Ein regulär beendeter Titel wird wie bisher in die History geschrieben;
   die laufende Auto-DJ-Sitzung sperrt ihn zusätzlich sofort. Die Statusdaten
   nennen Auswahlquelle, Sperrdauer und Anzahl verworfener Kandidaten.

## Fehlertoleranz bei Auto-DJ-Streams

Der bisherige Wiedergabe-Watchdog startet nach zwei fehlgeschlagenen
Positionsabfragen den aktuellen Track erneut. Das ist für einen Auto-DJ-Stream
nicht akzeptabel, weil ein kurz hängender YouTube-Stream dadurch erneut bei
Sekunde 0 beginnt.

- Die Recovery unterscheidet Auto-DJ an `requestedBy: 'AutoDJ'`.
- Fehlende Positionsantworten allein lösen bei Auto-DJ keinen Neustart des
  aktuellen Titels aus. Der Vorfall wird mit Track-ID, Quelle, Position,
  Prozesszustand und IPC-Fehler geloggt.
- Ein verifizierter MPV-Crash oder `end-file`-Fehler eines Auto-DJ-Titels
  sperrt diesen Titel für zwölf Stunden und fordert genau einen nächsten
  zulässigen Auto-DJ-Titel an. Der fehlerhafte Titel wird nicht als
  erfolgreich gespielte History gezählt.
- Eine pro Track-ID geschützte Recovery verhindert, dass Watchdog, Crash und
  `end-file` parallel mehrere Folgeauswahlen starten.
- Die Sperre fehlgeschlagener Streams wird in einer kleinen persistenten
  Music-Bot-Tabelle mit Ablaufzeit und Grund abgelegt. Sie überlebt einen
  App-Neustart und wird vor der Auswahl bereinigt bzw. gefiltert.
- Für Zuschauer-Requests bleibt die bestehende Wiedergabe-Recovery erhalten;
  ihr Verhalten ändert sich nicht durch den Auto-DJ-Fix.

## Komponenten

| Komponente | Verantwortung |
| --- | --- |
| `lib/auto-dj.js` | Konfigurationsstandardwerte, Mix-Kandidaten, Normalisierung, zwölfstündige Filter, Seed-Rotation, Auswahlstatus und Fehlersperren. |
| `lib/queue-manager.js` | Persistente Tabelle für abgelaufene bzw. aktive Auto-DJ-Fehlersperren. |
| `main.js` | Unterscheidung der Recovery nach Track-Herkunft, einmaliger Folgewechsel und diagnostische Logs. |
| `ui.html` und `assets/ui.js` | Radio-Mix und die zwei neuen Einstellungen laden, speichern und im Status darstellen. |
| Music-Bot-Tests | Deterministische Auswahl-, Sperr-, Recovery- und UI-Regressionen. |

## Fehlerbehandlung und Beobachtbarkeit

- Resolver-Fehler oder leere Radio-Ergebnisse fallen auf die jeweils andere
  Auswahlquelle zurück. Erst wenn beide Quellen keine zulässigen Kandidaten
  liefern, beendet Auto-DJ die Auswahl mit einem nachvollziehbaren Status.
- Eine fehlende oder unvollständige Künstlerangabe lässt keine Wiederholung der
  Video-ID oder des Titels zu.
- Diagnoselogs enthalten mindestens Track-ID, Auto-DJ-Quelle, Ereignis,
  Prozess-/IPC-Zustand und gewählte Folgeaktion; sie enthalten keine
  nutzerfremden Zugangsdaten.

## Abnahme und Tests

1. Unit-Tests prüfen die 12-Stunden-Sperre für gleiche Video-ID, Titel und
   Künstler sowie das Ablaufen der Sperre.
2. Unit-Tests prüfen die gewichtete 80/20-Auswahl, Seed-Rotation und die
   Fallback-Reihenfolge ohne Wiederholung.
3. Unit-Tests prüfen, dass defekte Auto-DJ-Titel persistent ausgeschlossen und
   nicht als erfolgreich gespielte Titel gezählt werden.
4. Eine Runtime-Regression simuliert zwei fehlgeschlagene Positionsabfragen.
   Bei einem Auto-DJ-Titel darf weder `restart()` noch `play(currentTrack)`
   aufgerufen werden; ein bestätigter Fehler wechselt genau einmal auf einen
   neuen Auto-DJ-Titel.
5. Die bestehende Runtime-Regression für die Wiederherstellung eines
   Zuschauer-Requests bleibt grün.
6. UI-Tests prüfen Speicherung und Wiederherstellung der neuen Felder. Danach
   laufen die gezielten Music-Bot-Suiten, `npm test`, CSS-Build und Lint.

## Nicht-Ziele

- Keine Änderung am Verhalten von Zuschauer-Requests oder manuellen
  Playlist-Modi.
- Keine personenbezogene Geschmacksprofilierung außerhalb der bereits lokalen
  Music-Bot-History.
- Keine Änderungen an der globalen Wiedergabe- oder MPV-Installation.
