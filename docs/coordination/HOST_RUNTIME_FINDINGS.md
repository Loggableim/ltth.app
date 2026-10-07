# Aktuelle Host-Prüfungen

Stand: 2026-10-07. Diese Nachweise ergänzen die OBS-Prüfung; sie ersetzen sie nicht.

| Bereich | Unabhängiger Nachweis | Noch offen |
| --- | --- | --- |
| STT | Originalrenderer im Browser DE/EN/ES/FR, Clear und Wiederverbindung auf dem früheren Quellstand | Nach Änderung des gemeinsamen Übersetzungsclients: fünf fehlgeschlagene Retry-/Cleanup-Prüfungen untersuchen; OBS und tatsächlicher STT-Backendbetrieb |
| Advanced Timer | Originale kanonische Route, vier Sprachen, Tick, Reset, fehlende/ungültige ID; Pause/Fortsetzen sichtbar. Fünf Host-Tests und 26 Timer-/Goals-Jest-Tests bestanden. Neuer Reconnect-Browserlauf: verpasster Zustand ohne Tick nachgeladen, 01:15 orange; zwei PNGs und zwölf Quellenhashes unabhängig geprüft | OBS und tatsächlicher Backendbetrieb |
| Spotlight Chatter | Vier Sprachen sichtbar, Update und Wiederverbindung; kontrastreicher synthetischer Hintergrund | OBS, Live-Ereignisse und Tunnel |
| Goals | Restbetrag und Ziel-erreicht-Anzeige vier Sprachen im Browser; Originalconsumer-Tests einschließlich Fehler→Löschung→verspätete Übersetzung→Sprachwechsel. Nach Socket-Korrektur im unveränderten Browser-Tab FR „Il reste 75“ sichtbar; nach Löschung und Wechsel zu ES bleibt die Anzeige leer | Finale Quellenbindung und Worker-Abschlussprüfung; OBS |
| Quiz | Frage/Runde bleiben beim Laden in EN/FR erhalten; sechs Host-/Originalconsumer-Tests bestanden, einschließlich Punktebeschriftungen und verborgener Bestenliste bei Sprachwechsel | Weitere praktische Sprachwechselnachweise; OBS |
| Music Bot Overlay | Frühere Layoutaufnahmen belegen Queue-Anzahl und 28 px Fullwidth-Abstand. Aktueller Socket-/Sprachfix: 19 unabhängige Tests bestanden; vier quellengebundene PNGs aus derselben URL DE→FR→Clear→ES leer→neuer Track→EN geprüft. Vorhandene fremde Socket-Referenzen bleiben erhalten | Card-Queue-Doppelanzeige als optionaler Layoutbefund; OBS und tatsächlicher Backendbetrieb |

Die Music-Bot-Overlayprüfung verwendet synthetische Ereignisse und erzeugt kein Audio. Der bereits separat erbrachte MPV-Hörnachweis wird dadurch weder wiederholt noch ersetzt.

Alle hier beschriebenen temporären Browser-Hostserver wurden nach der jeweiligen Prüfung geschlossen. Der erste hängende Music-Testlauf wurde über seine Toolsitzung beendet. Nach Korrektur der verzögerten Übersetzungsfixture bestand ein neuer unabhängiger Lauf mit 13/13 und Exitcode 0.

OBS bleibt bei **0/104** akzeptierten Fällen. Die tatsächliche Computer-Use-Freigabe für `obs64` ist noch nicht bestätigt. Keine Umgehung dieser Freigabe, keine Änderung produktiver OBS-Profile.

Screenshots und vorhandene strukturierte Nachweise liegen unter `docs/coordination/evidence/host-browser-*/`. Der fortlaufende Detailbericht bleibt `CEO_HANDOFF.md`.
