# Arena: Giganten, zielende Bomben und abgezwickte Beute

## Ziel

Arena-Spieler dürfen tatsächlich bis Masse 6500 wachsen. Bomben sollen den
größten Gegner gezielt anfliegen, riesige Ziele besonders hart schrumpfen und
einen nennenswerten Teil der verlorenen Masse als Beute für andere Spieler
zurücklassen.

## Größenskala

- Die verbindlichen Obergrenzen sind `maxMass: 6500` und `maxLives: 13100000`.
- Der Radius folgt weiter der serverautoritativen Massenformel. Ein Spieler
  mit Masse 6500 hat ungefähr Radius 322 und ist damit rund doppelt so groß
  wie die im Referenzbild markierte Figur mit Masse 1558 und Radius 158.
- Es gibt keinen reinen Rendering-Multiplikator: sichtbare Größe,
  Kollisionsfläche und Bombenrisiko bleiben konsistent.

## Zielrichtung

- Beim Auslösen von `!bomb` wird der größte andere Spieler nach aktueller
  Masse gewählt, auch wenn er gerade geschützt ist.
- Die Bombe erhält beim Wurf einen festen, normierten Richtungsvektor zum
  Ziel. Sie lenkt während des Flugs nicht nach.
- Gibt es keinen anderen Spieler oder liegen Ziel und Werfer exakt am selben
  Punkt, verwendet die Bombe weiterhin eine zufällige Himmelsrichtung.

## Schaden und Beute

- Die bisherigen drei Distanzbänder bleiben erhalten. Ihre Retention wird
  zusätzlich logarithmisch nach Opfermasse verschärft.
- Bei Masse 6500 bleiben nach einer Explosion höchstens 5 % im Kern, 18 % im
  mittleren Band und 45 % im äußeren Band. Kleine Spieler liegen näher an den
  heutigen 22 %, 45 % und 70 %.
- 45 % der tatsächlich verlorenen Masse werden als bis zu 40 hochwertige,
  verstreute `bomb`-Futterstücke erzeugt. Der Wert pro Stück wird aus der
  abgezwickten Masse abgeleitet, nicht aus dem Standard-Futterwert.
- Jedes Bomben-Futterstück trägt eine Ausschlusskennung des Werfers. Der
  Werfer kann es während seiner Lebensdauer nicht aufnehmen; andere Spieler
  können es normal nutzen.
- Der Schaden bleibt nichtletal: die bestehende Mindestmasse wird
  respektiert. Direkter Schild schützt weiterhin vor Bombenschaden.

## Tests und Abnahme

- Eine Zielbombe fliegt zum größten anderen Spieler; kein Ziel verwendet
  deterministisch den vorhandenen Zufalls-Fallback.
- Die Retention für ein großes Opfer ist in jedem Band niedriger als für ein
  kleines Opfer und erreicht am 6500er die Werte 5/18/45 %.
- Bombenbeute enthält 45 % der verlorenen Masse, ist auf 40 Stück begrenzt,
  kann vom Werfer nicht aufgenommen werden und kann von anderen aufgenommen
  werden.
- Ein 6500er erreicht den erwarteten echten Radius; Kollisions- und
  Mindestmassenregeln bleiben intakt.

Die Abnahme erfolgt mit dem fokussierten Arena-Jest-Lauf, gezieltem ESLint,
`git diff --check` und einem ausschließlich plugin-spezifischen Reload nach
lokalem Commit. Die App wird nicht neu gestartet.
