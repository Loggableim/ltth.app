# Aktuelle Host-Prüfungen

Stand: 2026-10-07. Diese Nachweise ergänzen die OBS-Prüfung; sie ersetzen sie nicht.

| Bereich | Unabhängiger Nachweis | Noch offen |
| --- | --- | --- |
| STT | Originalrenderer im Browser DE/EN/ES/FR, Clear und Wiederverbindung | OBS und tatsächlicher STT-Backendbetrieb |
| Advanced Timer | Originale kanonische Route, vier Sprachen, Tick, Reset, fehlende/ungültige ID; Pause orange und Fortsetzen mit nächstem Tick grün im deutschen Browser geprüft | Nachholen verpasster Zustände nach Wiederverbindung; OBS |
| Spotlight Chatter | Vier Sprachen sichtbar, Update und Wiederverbindung; kontrastreicher synthetischer Hintergrund | OBS, Live-Ereignisse und Tunnel |
| Goals | Restbetrag und Ziel-erreicht-Anzeige vier Sprachen im Browser; 25 Originalconsumer-Tests bestanden plus gezielter Ersatztext-Test, einschließlich Fehler→Löschung→verspätete Übersetzung→Sprachwechsel | Sprachwechsel über Socket im selben Browser-Tab fehlgeschlagen: gemeinsame Socket-Anbindung fehlt; Korrektur läuft. Quellstand zum Aufnahmezeitpunkt nicht separat gebunden |
| Quiz | Frage/Runde bleiben beim Laden in EN/FR erhalten; sechs Host-/Originalconsumer-Tests bestanden, einschließlich Punktebeschriftungen und verborgener Bestenliste bei Sprachwechsel | Weitere praktische Sprachwechselnachweise; OBS |
| Music Bot Overlay | Kartenlayout im Browser DE/EN/ES/FR; zusätzlich Minimal-, Kompakt- und breites Layout auf Deutsch inspiziert; 13 unabhängige Tests bestanden | Breites Layout: Queue-Anzahl fehlt und Zusatzbox überlagert rechten Bereich; Sprachwechsel im selben Tab; OBS |

Die Music-Bot-Overlayprüfung verwendet synthetische Ereignisse und erzeugt kein Audio. Der bereits separat erbrachte MPV-Hörnachweis wird dadurch weder wiederholt noch ersetzt.

Alle hier beschriebenen temporären Browser-Hostserver wurden nach der jeweiligen Prüfung geschlossen. Der erste hängende Music-Testlauf wurde über seine Toolsitzung beendet. Nach Korrektur der verzögerten Übersetzungsfixture bestand ein neuer unabhängiger Lauf mit 13/13 und Exitcode 0.

OBS bleibt bei **0/104** akzeptierten Fällen. Die tatsächliche Computer-Use-Freigabe für `obs64` ist noch nicht bestätigt. Keine Umgehung dieser Freigabe, keine Änderung produktiver OBS-Profile.

Screenshots und vorhandene strukturierte Nachweise liegen unter `docs/coordination/evidence/host-browser-*/`. Der fortlaufende Detailbericht bleibt `CEO_HANDOFF.md`.
