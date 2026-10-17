# Wheel: Plan für serverautoritative Ergebnisfreigabe

Stand: 2026-10-07. Reviewplan, keine Produktimplementierung und keine Public-DTO-Freigabe.

## Ziel

Das Ergebnis eines Wheel-Spins soll allein aus dem bei Spinstart gespeicherten serverseitigen Snapshot folgen. Ein Overlay darf Animation und gemessene Landung melden, aber weder Preiswahl noch XP, Persistenz, OpenShock-Aktion oder Queueabschluss auslösen beziehungsweise überschreiben. Der Server soll einen terminalen Ergebniszeitpunkt und eine einzige, idempotente Finalisierung steuern.

Der aktuelle Quellstand hat bereits `activeSpins`-Snapshot und `_claimSpinFinalization()` als Einmal-Gate (`app/plugins/game-engine/games/wheel.js:553-560, 680-715`). `finalizeSpin()` verwendet grundsätzlich `winningSegmentIndex` des Snapshots (`:725-818`), fällt bei ungültigem Serverindex im normalen Overlaypfad aber auf einen vom Overlay gemeldeten Segmentindex zurück (`:751-766`). `handleSpinComplete()` finalisiert beim Client-ACK, plant danach gegebenenfalls Shock und emittiert das Ergebnis (`:840-935`). Der Safety-Timer ruft nach seiner Frist `forceCompleteSpin()` auf; der Timeoutpfad finalisiert, emittiert aber ein anderes Event und führt den normalen Shock-/Queue-Delaypfad nicht aus (`:602-619, 955-985`).

## Vorgeschlagener Zustands-/Zeitvertrag

1. **Spinstart (Server):** Server validiert Segment-Snapshot und Gewinnerindex vor Öffnung des Spins. Ein ungültiger Snapshot beendet den Spin serverseitig als Fehler ohne Clientindex-Fallback, Gewinnpersistenz, XP oder SHOCK. Server speichert unveränderlich `spinId`, `startedAt`, `segments`, `winningSegmentIndex`, Spielerdaten, Wheel-/Settings-Snapshot, normalisierte Dauer und Resultat-/Queuepolicy. Der bestehende Einmal-Finalizer bleibt der einzige Weg in einen terminalen Zustand.
2. **Animation (Renderer):** `wheel:spin-start` startet die Anzeige. Der Renderer sendet am Animationsende weiterhin eine Rolle-Overlay-Nachricht mit opaker Spinreferenz und optional gemessenem Landungsindex. Diese Nachricht ist ausschließlich Diagnose/Taktungsbeobachtung; sie kann den Gewinnerindex oder Ergebnisdatensatz nie ersetzen. Die Public-Incoming-Allowlist behält `wheel:spin-complete` gesperrt, bis ein enges, folgenloses ACK-Protokoll separat reviewt ist.
3. **Ein serverseitiger Reveal-Timer:** Startzeitpunkt und Frist werden serverseitig gesetzt. Deadline soll die Renderer-Einleitungsverzögerung (derzeit 1.000 ms), `spinDuration` und einen kleinen festen Zustellpuffer enthalten. Der exakte Puffer ist ein zentraler konfigurierter/benannter Wert und Teil des Tests, kein aus Gewinneranzeige-/Info-Screen-Settings abgeleiteter Clientfreigabezeitpunkt. ACK kann den Timer weder stoppen noch vorziehen. Wenn Anzeige-/Info-Screen-Dauern nur die Queuefolge steuern, werden sie nach der Ergebnisfreigabe serverseitig angewandt; sie dürfen Ergebnis/Ressourcenpfad nicht entscheiden.
4. **Terminale Servertransaktion:** Deadline ruft denselben serialisierten Finalizer wie Shutdown-/Fehlerpfade auf. Er nimmt Preistext, Preisfarbe, Niete-/SHOCK-Attribute und XP ausschließlich aus dem validierten Start-Snapshot. `recordWheelWin`, Viewer-XP und Status setzen genau einmal; danach wird ein einzelnes Resultat-Event aus dem serverseitigen Ergebnis emittiert. Doppelte/verspätete ACKs und konkurrierender Timer verlieren am `_claimSpinFinalization()`-Gate und ändern Ergebnis oder Belohnungen nicht.
5. **SHOCK- und Queuezeitpunkt:** SHOCK wird nach erfolgreicher serverseitiger Finalisierung genau einmal aus dem gespeicherten Segment und nur mit den gespeicherten/validierten Intensitäts-, Dauer-, Typ- und Gerätewerten geplant. Keine Rendererbestätigung darf SHOCK auslösen oder verschieben. Queuefreigabe ist eine serverseitige Terminierung relativ zum Ergebniszeitpunkt plus definierte Anzeige-/Infozeit, mit eigener Einmal-/Cleanup-Sicherung.
6. **Event-/DTO-Sicherheit bleibt separat:** Diese Arbeit kann lokale Ergebnissemantik definieren, gewährt aber keine Public-Ausgabe. Aktuell sind alle neun `wheel:*`-Outgoing-Events im Public-Projektor fail-closed. Eine spätere Public-Anzeige erfordert eigenen minimalen DTO-Plan, Projektionstests und explizite Produktfreigabe. `wheel:spin-start` darf öffentlich kein Winner-/SHOCK-/Geräte-Detail durchreichen; auch `totalRotation` plus Segmente verrät den Zielsektor, deshalb ist jede künftige Public-Funktion ein bewusst offenes Ergebnisfreigabeprodukt.

## Klärung vor einer Umsetzung

- Wann soll die lokale Ergebnisanzeige starten: beim Server-Deadline-Event oder eine feste kurze Zeit nach dem Ende der Rendereranimation? Vorgeschlagener Ausgangspunkt ist Deadline = 1.000 ms Einleitung + Spinzeit + 500 ms Empfangs-/Renderpuffer.
- Soll der lokale ACK vollständig nur Diagnose sein oder wird eine eng definierte Telemetrie für gemessene Landungsabweichungen gebraucht? In beiden Fällen darf sie nie den Preisindex ersetzen.
- Wie wird Overlay-Reconnect/kein lokaler Renderer behandelt? Serverpersistenz/-XP müssen trotzdem nach Deadline stattfinden; Ergebnisemission darf von keinem Client abhängen.
- Welche Queuezeit gilt bei Info-Screen, Niete und SHOCK? Die Regel muss eindeutig sein und getrennt vom Ergebnisfinalizer laufen.
- Wie wird ein echter Serverstart-/Timerfehler abgefangen? Der Error-/Shutdownpfad muss einmalig finalisieren oder sicher abbrechen und darf keine Teilbelohnung hinterlassen.
- Muss `winningSegmentIndex` aus `wheel:spin-start` lokal überhaupt noch übertragen werden, sobald Renderer-Landung rein visuell diagnostiziert wird? Das Entfernen aus lokalen Ereignissen ist separat zu planen; `totalRotation` bleibt mathematisch ableitbar.

## Gezielte Testmatrix vor Implementierung

- Kein ACK: Deadline finalisiert gespeicherten Gewinner und emittiert ein serverseitiges Resultat.
- ACK vor Deadline: nur Diagnose; Ergebnis/XP/SHOCK/Queue bleiben bis zur Deadline unverändert.
- Ungültige, manipulierte, doppelte und verspätete ACKs: weder Preis noch XP noch Shock-/Queuezeitpunkt ändert sich.
- Ungültiger Serverindex/Snapshot: kein gemeldeter Clientindex wird als Preisquelle verwendet; eindeutige Fehler-/Cleanupsemantik.
- Gültiger Spin mit geänderter Live-Konfiguration nach Start: Ergebnis verwendet ausschließlich den alten Snapshot.
- Timer/ACK-Race und Resultat-Doppelaufruf: genau eine DB-Persistenz, XP-Gutschrift, Shockplanung, Ergebnisemission und Queuefreigabe.
- Fehlendes Overlay, Reconnect und Servercleanup: keine Hänger/Lecks; Fristen anhand FakeClock statt reale Wartezeiten.
- Lokaler UI-Vertrag und bestehende Testfälle für Niete, normale Preise und Shock bleiben bewusst getrennt von jeder Public-DTO-Projektion.

## Scope und Grenze

Keine Umsetzung dieses Plans in diesem Auftrag. Insbesondere bleiben Wheel-GameEngine-Produzenten, ACK-Handler, Finalizer, Rewards, SHOCK-Integration, TTS und andere Game-Engine-Events unverändert. Es wurde kein Server und keine Public-Verbindung gestartet. Umsetzung benötigt nach CEO-Review einen eigenen begrenzten Auftrag.
