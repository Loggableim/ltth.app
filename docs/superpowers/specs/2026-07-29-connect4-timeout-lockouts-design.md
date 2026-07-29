# Connect 4 Timeout-Sperren – Entwurf

**Status:** vom Streamer freigegeben am 2026-07-29

## Ziel

Nach einem Connect-4-Spieler-Timeout soll die Sperrdauer im Streamer-Dashboard festlegbar sein. Das Dashboard zeigt alle aktiven Sperren an und erlaubt dem Streamer, einzelne Spieler sofort wieder freizuschalten.

## Bestehender Befund

`GameEnginePlugin._applyViewerTimeoutLockout()` verwendet heute die feste Konstante `24 * 60 * 60 * 1000`. Die Sperren liegen persistent in `game_player_lockouts`; abgelaufene Einträge werden bislang nur bei einem Zugriffsversuch dieses Spielers entfernt. Es gibt keine Verwaltungsoberfläche und keine Möglichkeit zum gezielten Entsperren.

## Architektur

- Die Connect-4-Konfiguration erhält `timeoutLockoutMinutes`. Der gültige Bereich ist ganzzahlig `0..10080`; `0` bedeutet, dass ein Spieler-Timeout keine Sperre erzeugt. Der rückwärtskompatible Standard bleibt `1440` Minuten.
- Der Timeout-Pfad liest diese Dauer ausschließlich aus der serverseitig normalisierten Connect-4-Konfiguration.
- `GameEngineDatabase` bekommt Methoden zum Auflisten und gezielten Löschen aktiver Sperren. Beim Listen werden abgelaufene Zeilen bereinigt; damit verschwinden sie auch ohne einen erneuten Spielversuch.
- Das Dashboard ruft `GET /api/game-engine/connect4/lockouts` und `DELETE /api/game-engine/connect4/lockouts/:username` auf.
- Die Connect-4-Einstellungen erhalten ein Zahlenfeld für die Dauer und eine Tabelle der aktiven Sperren. Nutzernamen werden mit DOM-APIs und `textContent`, nicht per dynamischem HTML, gerendert.

## Grenzen

- Die Verwaltung bleibt im bestehenden Streamer-Dashboard. Es gibt keinen Chat- oder Overlay-Befehl zum Entsperren.
- Host-/Streamer-Identitäten bleiben von Timeout-Sperren ausgenommen.
- Das Entsperren ist idempotent: Bereits abgelaufene oder entfernte Einträge liefern einen aktuellen Listenstand.
- Neue sichtbare Texte werden in Deutsch, Englisch, Spanisch und Französisch ergänzt.

## Tests

1. Datenbank: Ablaufbereinigung, aktive Liste und gezieltes Löschen.
2. Plugin: Konfiguration `0..10080`, konfigurierte Dauer und deaktivierte Sperre.
3. Route/UI: serverautoritatives Listen und Entsperren sowie DOM-sicheres Rendern.

