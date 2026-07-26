# Connect4 Viewer-Priority Matchmaking Design

## Ziel

Mehrere Chat-Zuschauer sollen bei `connect4` zuverlässig und in FIFO-Reihenfolge zu Zuschauer-gegen-Zuschauer-Partien gepaart werden. Erst wenn ein Zuschauer nach 30 serverautoritativen Sekunden ungepaart bleibt, wird seine Partie gegen den Streamer erzeugt.

## Ursache

Die aktuelle Persistenz erzwingt mit dem partiellen Unique-Index `game_interactive_one_open_challenge` genau eine offene Connect4-Challenge. Der Controller und das Plugin verwenden außerdem nur einen offenen Challenge-Datensatz und einen einzelnen Ablauf-Timer. Deshalb gibt es keine wartende Zuschauer-Pipeline und keine Darstellung mehrerer Suchender.

## Datenmodell und Pairing

- Jede berechtigte Zuschaueranfrage erhält eine persistente Challenge mit absolutem Ablaufzeitpunkt `createdAt + 30000`.
- Beim Eintreffen einer Anfrage wird atomar die älteste noch offene, berechtigte Challenge eines anderen Zuschauers beansprucht. Beide erhalten unmittelbar eine Zuschauer-gegen-Zuschauer-Session.
- Gibt es keinen berechtigten wartenden Zuschauer, wird eine neue Challenge erzeugt. Aktive Teilnehmer, Selbstpaarungen, Sperren und doppelte Chatevents bleiben abgewiesen, ohne bestehende Challenges zu verändern.
- Jeder offene Datensatz erhält einen eigenen Ablauf-Timer. Beim Ablauf wird genau diese Challenge nur dann in eine Streamer-Partie überführt, wenn sie noch offen ist; bereits gepaarte oder ungültige Challenges werden nicht erneut gestartet.
- Beim Pluginstart werden alle offenen Challenges wiederhergestellt: zukünftige werden erneut terminiert, abgelaufene werden einzeln gegen den Streamer gestartet.

## Präsentation

Der interaktive State bleibt zu bestehenden Verbrauchern kompatibel: `connect4Matchmaking` beschreibt weiterhin die älteste offene Challenge. Er ergänzt `pendingCount` und eine minimierte Liste offener Challenges. Direkte und Unified-OBS zeigen den ältesten Suchenden, seinen aus Serverzeit und absolutem Ablaufzeitpunkt abgeleiteten Countdown sowie bei Bedarf `+N weitere suchen`.

## Begrenzungen und Fehlerbehandlung

Die bestehende Obergrenze aktiver interaktiver Sessions bleibt maßgeblich. Offene Challenges reservieren keinen zusätzlichen aktiven Session-Slot. Wenn ein Pairing oder Fallback keinen Slot erzeugen kann, bleibt die offene Challenge erhalten und wird beim nächsten regulären Verarbeitungspunkt erneut versucht; sie wird nicht fälschlich als Streamer-Partie oder verloren markiert.

## Tests

Regressionen decken mindestens vier Zuschauer als zwei sofortige Sessions, drei Zuschauer mit einem wartenden Countdown/Fallback, FIFO-Reihenfolge, Selbst-/Sperr-/Aktiv-Ablehnung, doppelte Events, einzelne Ablauf-Timer, Reload-Recovery und Direct-/Unified-Overlay mit Restzeit und Zusatzanzahl ab.
