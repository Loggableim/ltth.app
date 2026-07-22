# Talking Heads

Lokale, modulare 2D-Figuren mit synchroner TTS-Mundanimation fuer TikTok und OBS. Das Plugin verwendet ausschliesslich mitgelieferte Asset-Pakete und fuehrt keine Bildgenerierung oder externe Bild-API-Aufrufe aus.

## Enthaltene Figurenbibliotheken

- **Boba Animals**: tierische Charaktere als fertige Figuren.
- **Kenney Monster Builder**: kombinierbare Monster-Koerper und Augen.
- **Vector Character Builder**: Kopf, Haare, Augen und Mund als frei kombinierbare Ebenen.

Jede Auswahl wird lokal als fuenf SVG-Sprites materialisiert: Leerlauf, Blinzeln sowie drei Mundpositionen fuer TTS.

## Einrichtung

1. Oeffne `/plugins/talking-heads/ui.html`.
2. Waehle Bibliothek, Basisfigur und gegebenenfalls Augen, Haare oder Mund.
3. Aktiviere Talking Heads und speichere die Auswahl.
4. Fuege `/plugins/talking-heads/overlay.html` als Browserquelle in OBS hinzu.
5. Nutze **Frames erzeugen & pruefen** oder **Animation testen**, um die Ausgabe vor dem Stream zu pruefen.

## Geschenk-Avatar-Lotterie

Die Lotterie ist standardmaessig aktiv. Als Namen fuer das ausloesende Geschenk sind `Heart Me`, `Team Heart` und `Team Herz` hinterlegt. Alternativ kann eine konkrete Geschenk-ID gesetzt werden; diese hat Vorrang vor den Namen.

Bei einem passenden Geschenk:

1. Das Overlay zeigt eine kurze Slot-Animation.
2. Eine zufaellige lokale Figur wird dem Zuschauer zugeordnet.
3. Die Infobox erklaert die Chat-Befehle.

| Zuschaueraktion | Ergebnis |
| --- | --- |
| Kein Befehl | Das naechste passende Geschenk lost erneut aus. |
| `!keep` | Die aktuelle Figur bleibt fuer kuenftige TTS-Animationen erhalten. |
| `!reroll` | Hebt `!keep` auf; das naechste passende Geschenk lost wieder aus. |

Die Auswahl wird in der lokalen Tabelle `talking_heads_avatar_lottery` gespeichert. Es werden keine Avatar-Bilder an externe Dienste gesendet.

## Betriebshinweise

- Die Asset-Pakete bleiben im Plugin gebuendelt, die daraus erzeugten SVG-Sprites liegen im Plugin-Datenverzeichnis.
- Die Gewinnfigur hat fuer die TTS-Animation des Zuschauers Vorrang vor der allgemeinen Standardfigur.
- Eine Geschenk-ID ist am stabilsten, falls TikTok die sichtbare Geschenkbezeichnung lokalisiert oder aendert.
