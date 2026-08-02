# Arena: Masse 2000 und vollständiger Schildschutz

## Ziel

Spieler sollen bis zu Masse 2000 wachsen können, dabei mit zunehmender Masse
spürbar langsamer werden und durch den aktiven Chat-Schild oder ein aktives
Schild-Pickup vollständig vor dem Gefressenwerden geschützt sein.

## Ausgangslage

Die Live-Konfiguration hat zwar `maxMass: 999`, begrenzt die zugrunde liegenden
Leben aber auf 22.000. Mit der bestehenden Umrechnung (`Masse = 1,8 *
sqrt(Leben)`) sind damit nur etwa 267 Masse erreichbar. Der aktive
Chat-Schild blockiert das Verschlingen im Servercode bereits, ist im Overlay
jedoch nicht klar als aktiv zu erkennen. Das Schild-Pickup erhöht bisher nur
den erforderlichen Größenunterschied und ist daher kein vollständiger Schutz.

## Wachstum und Bewegung

- Die Standardobergrenzen werden auf `maxMass: 2000` und `maxLives: 1250000`
  gesetzt. Das Lebenslimit liegt über den für Masse 2000 benötigten rund
  1.234.568 Leben; `maxMass` bleibt die verbindliche Endgrenze.
- Die bekannten vollständigen Standardprofile werden gezielt migriert,
  einschließlich des aktuell lokal verwendeten Profils `999 / 22000 / 1 / 1`.
  Teilweise oder bewusst abweichende Profile bleiben unverändert.
- Die Größenbremse verwendet oberhalb der Basismasse eine logarithmische
  Kurve statt einer auf das neue Maximum gestreckten linearen Kurve. Das
  verhindert, dass bereits große Spieler durch die höhere Obergrenze
  versehentlich schneller werden.
- Zielwerte für unbewaffnete Spieler bei neutraler Energie und neutralem
  Verhalten sind ungefähr: Masse 18 = 100 %, 100 = 78 %, 250 = 63 %, 500 =
  51 %, 1000 = 38 %, 2000 = 25 % der Grundgeschwindigkeit. Der vorhandene
  Vorteil unterhalb der Basismasse bleibt erhalten.

## Schildvertrag

Eine zentrale Schutzabfrage entscheidet, ob ein Spieler gegen Verschlingen
geschützt ist. Sie ist wahr, wenn entweder der direkte `!shield`-Zustand aktiv
ist oder der Spieler ein noch nicht abgelaufenes Schild-Pickup trägt.

Dieser Schutz gilt für normale Absorption, Dash und Chainsaw. Trifft ein
fressfähiger Spieler auf einen geschützten Spieler, wird keine Eliminierung,
kein Lebens- oder Massentransfer und keine Kill-Belohnung ausgelöst. Stattdessen
werden die Figuren serverautoritativ sanft getrennt. So kann ein großer Spieler
nicht auf dem geschützten Spieler warten, bis der Schutz endet.

Der Schutz erweitert das Schild-Pickup ausdrücklich nicht zu allgemeiner
Schadensimmunität: Laser, Bomben, Pulse und weitere Waffen behalten ihre
bisherigen Regeln. Der direkte Chat-Schild behält seine bestehende Immunität
gegen direkte Schadens-, Push- und Slow-Effekte.

## Sichtbarkeit und Rückmeldung

Der Lade-Ring bleibt ein Cooldown-Indikator. Ein aktiver `!shield` erhält
zusätzlich eine klar erkennbare pulsierende blaue Aura. Das Schild-Pickup
behält seine eigene Hexagon-Optik, sodass beide Schutzquellen unterscheidbar
bleiben.

Bei einem abgelehnten `!shield` wegen Cooldown sendet die Simulation ein
kurzes, spielerbezogenes Feedback-Ereignis. Das Overlay zeigt direkt am
betroffenen Spieler beispielsweise `SCHILD: 34s CD`. Erfolgreiche Aktivierung
und aktiver Schutz sind damit ohne Deutung eines unklaren Rings nachvollziehbar.

## Tests und Abnahme

Die fokussierten Arena-Tests prüfen:

- Erreichbarkeit und exakte Kappung bei Masse 2000 samt gekoppeltem
  Lebenslimit und gezielter Migration.
- Monotone Geschwindigkeitswerte an den festgelegten Größenpunkten.
- Vollständigen Fressschutz für Chat-Schild und Schild-Pickup, unabhängig von
  Paarreihenfolge und Angriffsart (normal, Dash, Chainsaw).
- Trennung ohne Belohnung sowie erneute Verletzbarkeit nach Ablauf.
- Aktiv-Aura und Cooldown-Feedback als Overlay-Verträge.

Die Abnahme umfasst den fokussierten Jest-Lauf für Arena, gezielten ESLint,
`git diff --check` sowie eine read-only Prüfung der laufenden Arena-API. Ein
Plugin-Reload oder App-Neustart erfolgt nur nach ausdrücklicher Freigabe.
