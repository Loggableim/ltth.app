# EmojiRain Stream-Farbrotation – Design

## Ziel

Sowohl das klassische `emoji-rain`-Plugin als auch `webgpu-emoji-rain` ordnen bei aktivierten Herzballons jedem Like-User eine Farbe zu. Diese Farbe bleibt innerhalb eines bestätigten TikTok-LIVE-Streams stabil. Beim nächsten bestätigten Stream wird die Palette neu zufällig gemischt und die Zuordnungen werden verworfen.

## Abgrenzung

- Gilt ausschließlich für die Herzballons der Like-Events.
- Gilt für beide gegenseitig exklusiven EmojiRain-Plugins mit identischem Verhalten.
- Speichert keine Farbzuordnungen in Datenbank, Konfiguration oder Plugin-Dateien.
- Ändert weder die Herzballon-Anzahl noch andere Emoji-Rain-, Geschenk- oder Profilbild-Funktionen.

## Zustandsmodell

Jede Plugin-Instanz hält nur flüchtigen Sitzungszustand:

- `heartBalloonUserColors`: Zuordnung vom normalisierten Usernamen zur gewählten Hexfarbe.
- `heartBalloonColorPool`: für den aktuellen Stream zufällig gemischte Kopie der bestehenden Palette.
- `heartBalloonColorIndex`: Position der nächsten noch freien Farbe.
- `lastHeartBalloonStreamIdentity`: zuletzt verarbeitete bestätigte Stream-ID zur Deduplizierung des Lifecycle-Signals.

Beim ersten Like einer Person wird die nächste Farbe aus dem Pool zugeordnet und in der Map gehalten. Bei weiteren Likes derselben Person liefert die Map unverändert dieselbe Farbe. Erst wenn der Pool vollständig verbraucht ist, beginnt die Vergabe wieder am Anfang; dadurch werden Farben erst nach einem vollständigen Palettendurchlauf erneut vergeben.

## Sitzungsgrenzen

Das Plugin registriert `streamSessionStarted` als primäres TikTok-Lifecycle-Ereignis. Der Connector erzeugt dieses Ereignis nur für eine bestätigte neue Stream-Identität (Room-ID-Wechsel); Reconnects derselben LIVE-Sitzung lösen keine neue Farbrotation aus.

Der `connected`-Handler dient nur als Fallback für Plugins, die während des Starts das primäre Ereignis verpasst haben. Er akzeptiert ausschließlich eine bestätigte neue Stream-Identität und wird über `lastHeartBalloonStreamIdentity` dedupliziert. Ein Payload mit `isNewStream: false`, ein Reconnect oder eine fehlende Stream-ID verändert die Farben nicht.

Bei einem akzeptierten neuen Stream leert `resetHeartBalloonColors()` die User-Map, mischt eine frische Kopie der Palette mit Fisher-Yates, setzt den Index auf null und merkt die Stream-ID. Damit bekommen alle Nutzer beim nächsten Like eine Sitzungsfarbe aus der neu gemischten Reihenfolge.

## Fehlerbehandlung

Lifecycle-Payloads ohne verlässliche Stream-ID werden ignoriert, damit ein unvollständiges Connect-Ereignis keine laufende Farbzuordnung zerstören kann. Die vorhandene initiale Zufallsmischung im Konstruktor stellt sicher, dass das Verhalten auch vor dem ersten bestätigten Lifecycle-Ereignis funktioniert.

## Tests

Für beide Plugin-Testdateien werden Regressionstests ergänzt, die belegen:

1. Eine Person behält ihre Farbe über mehrere Likes im selben Stream.
2. Die ersten Nutzer eines Streams erhalten Farben ohne Wiederholung, bis die Palette ausgeschöpft ist.
3. Ein bestätigtes `streamSessionStarted` löscht die alte Zuordnung und startet einen frischen zufällig gemischten Pool.
4. Ein Reconnect bzw. `isNewStream: false` lässt die bestehende Zuordnung unangetastet.

Die bestehenden Herzballon-Tests bleiben der gemeinsame Nachweis für die ausgelösten Overlay-Nachrichten beider Renderer.
