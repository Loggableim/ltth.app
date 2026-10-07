# Aktuelle Host-Prüfungen

Stand: 2026-10-07. Diese Nachweise ergänzen die OBS-Prüfung; sie ersetzen sie nicht.

| Bereich | Unabhängiger Nachweis | Noch offen |
| --- | --- | --- |
| STT | Aktueller Socket-Fix: elf unabhängige Originalrenderer-Tests bestanden. Browserbeleg DE→FR mit sechs geprüften Quellenhashes und zwei PNGs: Dokumenttitel und Sprache wechseln, synthetische Transkription bleibt erhalten. Der sichtbare Titelchip ist ausdrücklich Testinstrumentierung | Sichtbare Produktionsbeschriftungen nicht durch den Testchip bewiesen; OBS und tatsächlicher STT-Backendbetrieb |
| Advanced Timer | Originale kanonische Route, vier Sprachen, Tick, Reset, fehlende/ungültige ID; Pause/Fortsetzen sichtbar. Fünf Host-Tests und 26 Timer-/Goals-Jest-Tests bestanden. Neuer Reconnect-Browserlauf: verpasster Zustand ohne Tick nachgeladen, 01:15 orange; zwei PNGs und zwölf Quellenhashes unabhängig geprüft | OBS und tatsächlicher Backendbetrieb |
| Spotlight Chatter | Vier Sprachen sichtbar, Update und Wiederverbindung; kontrastreicher synthetischer Hintergrund | OBS, Live-Ereignisse und Tunnel |
| Goals | Restbetrag und Ziel-erreicht-Anzeige vier Sprachen im Browser; Originalconsumer-Tests einschließlich Fehler→Löschung→verspätete Übersetzung→Sprachwechsel. Nach Socket-Korrektur im unveränderten Browser-Tab FR „Il reste 75“ sichtbar; nach Löschung und Wechsel zu ES bleibt die Anzeige leer | Finale Quellenbindung und Worker-Abschlussprüfung; OBS |
| Quiz | Frage/Runde bleiben beim Laden in EN/FR erhalten; sechs Host-/Originalconsumer-Tests bestanden, einschließlich Punktebeschriftungen und verborgener Bestenliste bei Sprachwechsel | Weitere praktische Sprachwechselnachweise; OBS |
| Music Bot Overlay | Frühere Layoutaufnahmen belegen Queue-Anzahl und 28 px Fullwidth-Abstand. Aktueller Socket-/Sprachfix: 19 unabhängige Tests bestanden; vier quellengebundene PNGs aus derselben URL DE→FR→Clear→ES leer→neuer Track→EN geprüft. Vorhandene fremde Socket-Referenzen bleiben erhalten | Card-Queue-Doppelanzeige als optionaler Layoutbefund; OBS und tatsächlicher Backendbetrieb |

Die Music-Bot-Overlayprüfung verwendet synthetische Ereignisse und erzeugt kein Audio. Der bereits separat erbrachte MPV-Hörnachweis wird dadurch weder wiederholt noch ersetzt.

Echter Advanced-Timer-Backendlauf: zehn tatsächliche API-Aufrufe für Anlegen, Lesen, Umbenennen, Start, Pause, Reset und Löschen bestanden; Socket.IO lieferte 89.9 im Running-Zustand. Vier Kernquellen und deren isolierte Kopien stimmen überein. Eigener Prozess beendet, Port geschlossen. Windows-SIGTERM belegt Prozessende, keinen geordneten App-Shutdown. Der Originalrenderer gegen dieses Backend und OBS sind noch nicht abgenommen. Receipt: `evidence/actual-timer-backend-probe.json`.

ViewerXP: 22 unabhängige Originalrenderer-Tests bestanden. Alle drei Ansichten wechseln per eingehendem Socketereignis nach FR und erhalten Namen sowie XP-/Levelzahlen. Der neue Browserbeleg umfasst sechs geprüfte PNGs und zehn vor/nach dem Lauf stabile Quellen; der eigene Host schloss mit null Clients und Exit 0. Receipt: `evidence/viewerxp-browser-20261007.json`.

Der aktuelle gemeinsame Timer/Goals-, Quiz- und Story-Lauf besteht unabhängig mit 41/41 Tests. Storys eigene Timer werden beim endgültigen Schließen beendet; eine verspätete Konfigurationsantwort verändert danach weder die Darstellung noch startet sie Folgeanfragen. Timer erhält im laufenden Progress-Template 01:30 und den Running-Zustand beim Sprachwechsel. Quiz erhält Frage, Antworten, Runde und Countdown, übernimmt Updates nach BFCache und ignoriert späte Ereignisse nach endgültigem Schließen. Weitere Browserbelege für diese finalen Quellstände stehen aus.

Alle hier beschriebenen temporären Browser-Hostserver wurden nach der jeweiligen Prüfung geschlossen. Der erste hängende Music-Testlauf wurde über seine Toolsitzung beendet. Nach Korrektur der verzögerten Übersetzungsfixture bestand ein neuer unabhängiger Lauf mit 13/13 und Exitcode 0.

OBS bleibt bei **0/104** akzeptierten Fällen. Die tatsächliche Computer-Use-Freigabe für `obs64` ist noch nicht bestätigt. Keine Umgehung dieser Freigabe, keine Änderung produktiver OBS-Profile.

Screenshots und vorhandene strukturierte Nachweise liegen unter `docs/coordination/evidence/host-browser-*/`. Der fortlaufende Detailbericht bleibt `CEO_HANDOFF.md`.

Der Quellaudit hat weitere fehlende Standalone-Anbindungen an `window.socket` gefunden. Startsprachen-Tests beweisen hier keinen späteren Sprachwechsel: Rechte/Ereignisse prüft Timer und Quiz, Overlays prüft Spotlight und Interactive Story, Profile/Datensicherheit prüft die drei ViewerXP-Ansichten. Erforderlich sind echte `locale-changed`-Ereignisse bei erhaltenen Anzeigedaten, Schutz fremder Socket-Referenzen und getrennte BFCache-/Final-Cleanup-Prüfungen. Bei Interactive Story fehlte zusätzlich eine renderer-eigene Aufräumung; das Schließen des Testhelpers ersetzt diesen Nachweis nicht. Diese Punkte bleiben bis zu neuen Originalconsumer-Ergebnissen offen.
