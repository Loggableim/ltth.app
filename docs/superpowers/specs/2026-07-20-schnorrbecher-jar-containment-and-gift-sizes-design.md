# Schnorrbecher: Glasbegrenzung und Geschenkgrößen

## Ziel

Das transparente Schnorrbecher-Overlay soll keine über den sichtbaren Glasrand
ragenden Kollisionswände mehr erzeugen. TikTok-Geschenk-Icons erhalten feste,
im Admin-UI konfigurierbare Pixelgrößen je Coin-Wertbereich. Das maximale
Limit physischer Geschenk-Icons wird auf 3.000 angehoben.

## Glasbegrenzung

`calculateJarWallSegments` liefert nur die beiden schrägen Seitenwände der
jeweiligen sichtbaren Innenkontur. Die bisher 160 Pixel hohen, vertikalen
Schutzwände oberhalb der Öffnung entfallen.

Normale Geschenk-Icons bleiben durch die sichtbaren Seitenwände und den Boden
im Glas. Falls ein nicht als Überlauf markiertes Icon durch eine numerische
Physikabweichung seitlich aus dem Innenbereich gerät, wird es bei der
Aktualisierung auf eine gültige Position innerhalb der Glasinnenform
zurückgesetzt. Diese Korrektur greift erst ab der Öffnung und erzeugt keine
virtuelle Wand über dem sichtbaren Rand. Absichtlich als Überlauf markierte
Icons bleiben davon ausgenommen.

## Feste Geschenkgrößen

Die Konfiguration enthält folgende feste Basisgrößen in Pixeln:

| Coin-Wert | Konfigurationsfeld | Standard |
| --- | --- | ---: |
| 1 | `giftSize1` | 32 px |
| 2–10 | `giftSize2To10` | 40 px |
| 11–29 | `giftSize11To29` | 50 px |
| 30–99 | `giftSize30To99` | 62 px |
| 100–199 | `giftSize100To199` | 76 px |
| 200–499 | `giftSize200To499` | 92 px |
| 500–999 | `giftSize500To999` | 110 px |
| 1000–1999 | `giftSize1000To1999` | 132 px |
| 2000–4999 | `giftSize2000To4999` | 158 px |
| 5000+ | `giftSize5000Plus` | 180 px |

Ein Geschenk bekommt exakt die Basisgröße seines Bereichs. Der bestehende
globale Regler `iconScale` wird anschließend auf alle Bereiche angewendet.
Jede einzelne Größenangabe wird auf 16 bis 240 px begrenzt; die finale
physikalische Größe bleibt auf 16 bis 240 px begrenzt, damit große Objekte
den Becher nicht überdecken.

## Konfiguration und Grenzen

`maxPhysicalIcons` bleibt standardmäßig 300 und akzeptiert Werte von 20 bis
3.000. Die Grenze gilt einheitlich in der Backend-Normalisierung, dem Overlay,
dem Browser-Source-Parameter `maxCoins` und dem Admin-Formular. Bei Erreichen
des konfigurierten Limits greift weiterhin nur die bestehende visuelle
Verdichtung; der Gesamtwert bleibt unverändert.

## Admin-UI

Unterhalb der allgemeinen Icon-Skalierung zeigt die Konfiguration zehn
Nummerneingaben mit eindeutigen Coin-Wert-Labels. Die Werte werden wie die
anderen Plugin-Einstellungen gespeichert und an bereits geöffnete Overlays
übermittelt.

## Tests

- Die Wandsegment-Hilfe erzeugt keine Kollisionssegmente oberhalb der
  Öffnung.
- Ein seitlich ausgebrochenes, normales Geschenk wird in die sichtbare
  Innenkontur zurückgeführt; ein Überlauf-Geschenk nicht.
- Jede der zehn Wertstufen liefert die konfigurierte feste Basisgröße.
- Die globale `iconScale` skaliert alle festen Basisgrößen gleichermaßen.
- Ungültige Größenwerte werden auf sichere Standardwerte bzw. Grenzen
  normalisiert.
- Backend, Overlay und Formular akzeptieren höchstens 3.000 physische Icons.
