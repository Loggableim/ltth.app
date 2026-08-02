# Arena: Konsolidierte Live-Balance

## Ziel

Die Arena erhält die bereits freigegebenen, zusammenhängenden Balance- und
Interaktionsänderungen als serverautoritativen Patch. Der laufende Stream
bleibt dabei unangetastet: erst nach lokaler Prüfung und Commit wird nur das
Plugin neu geladen.

## Verbindliche Regeln

- `maxMass` ist 6500 und `maxLives` 13100000. Radius, Kollision und sichtbare
  Größe folgen weiter derselben realen Massenformel; es gibt keinen
  Darstellungs-Trick.
- Große Figuren werden monoton langsamer und erreichen bei Maximalmasse den
  konfigurierten Mindestmultiplikator 0,25.
- Direktes Schild und ein aktives Schild-Pickup blockieren vollständig jede
  Spielerabsorption, Dash- und Chainsaw-Absorption. Sie blockieren keine
  sonstigen Waffeneffekte außer dem bereits bestehenden direkten Schildschutz.
- `!bomb` startet in einer zufälligen Himmelsrichtung. Nach Reichweite oder
  Feldrand bleibt sie als Mine liegen und detoniert erst bei Kontakt eines
  anderen, nicht geschützten Spielers oder bei Ablauf ihrer Armierungszeit.
- Jeder von einer Bombe im Explosionsradius getroffene, nicht geschützte
  Spieler verliert exakt 50 Prozent seiner aktuellen Masse, nie unter der
  bestehenden Mindestmasse. Der Abstand entscheidet nur über Treffer oder
  Nichttreffer.
- 45 Prozent der durch eine Bombe verlorenen Masse werden als höchstens 40
  hochwertige `bomb`-Futterstücke verteilt. Der Bombenwerfer darf diese
  Stücke während ihrer Lebensdauer nicht einsammeln; alle anderen Spieler
  schon.
- Während eine offensive Waffe aktiv ist (Laser, Pulse, Freeze, Dash, Magnet,
  Vampire, Missile, Mine, Blackhole, Chainsaw), priorisiert die KI einen
  erreichbaren, attackierbaren Spieler über Futter und Wandern. Speed und
  Schild lösen keine Jagdpflicht aus; tödliche Bedrohungen behalten Vorrang.
- Die Standard-Pickups enthalten alle genannten Waffen und spawnen häufiger.
  Der laufende Wert (14 Slots, 2800 ms, 85 Prozent) wird als Standard
  übernommen. Chainsaw bleibt seltener als die Summe der übrigen Waffen.
- Nahrung erscheint in kleinen, ruhigen Batches und verschwindet zeitversetzt;
  Fressgewinne skalieren weiter mit der Masse, damit das Fressen anderer
  Spieler spürbar mehr lohnt als Standardnahrung.
- Der untere Info-Rotator zeigt die drei lesbaren Karten fuer `!boost`,
  `!schild`/`!shield` und `!bomb`. Die obere Legende ist optional und standardmäßig aus.

## Tests und Abnahme

Fokussierte Jest-Tests beweisen die Massen- und Geschwindigkeitsgrenzen,
vollständigen Schildschutz, die feste 50-Prozent-Bombenwirkung, Beute- und
Eigentümersperre, Zufallsrichtung/Minenzustand, Waffenjagd und Pickup-Pool.
Danach folgen ESLint, `git diff --check`, lokaler Commit auf `main`, ein
Plugin-only-Reload und lesende Prüfungen der laufenden Konfiguration und des
Arena-Status.
