# WebGPU Emoji Rain: stabile Emoji-Kollisionen

## Final solver contract

This contract supersedes the earlier adjacent-cell and per-cell candidate-cap
wording below. The renderer uses the 128-byte shared frame ABI with
`maxCollisionRadius` at float offset 30. JavaScript writes a conservative
radius from the largest permitted Gift/API spawn size (2048px), including the
maximum depth scale (1.18) and intensity scale (2.4), with a minimum of 128px.

- Grid reach is calculated per axis from `(collisionRadius +
  maxCollisionRadius) / cellSize`; it is not capped at two cells. The bounded
  grid-edge ranges still prevent duplicate boundary cells.
- Every linked-list candidate in every visited cell is inspected. The solver
  reads only the source particle state while it accumulates position and
  velocity corrections, then writes one constrained result to the destination
  buffer. Atomic insertion order therefore cannot alter later contact geometry;
  this is geometry-order independent, not a promise of bitwise-identical sums.
- Wall and enabled-floor limits participate in contact sharing. A particle
  blocked along its correction normal receives no correction, while its movable
  partner receives the full separation. The final position is projected inside
  the walls and, for floor-constrained kinds only, the floor. Balloon kinds 1
  and 12 remain outside floor constraints during both integration and solving;
  spark kind 3 remains floor-constrained.
- Collision radius remains `max(3, size * 0.46)`. Boundary radius retains the
  sticker exception `max(3, size * 0.38)` for non-colliding kind 5 sprites.
- The two buffered passes remain primary-to-scratch and scratch-to-primary.
  Disabling collisions is still an unchanged source-to-destination copy path.

## Ziel

Emoji-Figuren sollen sich gegenseitig abstoßen, sich höchstens an ihren
Rändern berühren und nie sichtbar ineinanderfallen. Die Kontaktauflösung darf
den laufenden Overlay-Renderer nicht ausbremsen. Sämtliche Impact-Effekte
werden entfernt, auch bei Bodenkontakt.

## Ausgangslage

Der aktuelle `simulate`-Pass integriert die Bewegung und löst danach
Kollisionen gegen ein Raster auf, das noch vor der Bewegung gebaut wurde. Jede
GPU-Invocation schreibt ihren eigenen Partikelzustand direkt zurück und liest
gleichzeitig Nachbarn aus diesem Puffer. Dadurch hängt das Ergebnis vom
Ausführungszeitpunkt ab. Zusätzlich gelten unterschiedliche Kollisionsradien
für den aktiven und den gelesenen Partikel, die Korrektur findet nur einmal
statt und der Scan endet nach 14 Nachbarn. Das führt bei dichterem Regen zu
Zittern und sichtbaren Überschneidungen.

## Betrachtete Ansätze

1. Die bestehende Korrektur nur stärker machen. Das wäre klein, bliebe aber
   bei Kettenkontakten und niedriger Framerate instabil.
2. Einen getrennten, gepufferten GPU-Kollisionssolver einsetzen. Bewegung,
   Rasteraufbau und zwei symmetrische Kontaktiterationen laufen mit klaren
   Lese-/Schreibphasen. Das ist die gewählte Lösung: stabil,
   geometrie-ordnungsunabhängig und für das Limit von 256 sichtbaren Emojis
   günstig.
3. Auf CPU-/Matter.js-Physik wechseln. Das wäre funktional, verlagert aber
   unnötig Arbeit auf die CPU und wäre für den WebGPU-Overlay ein Rückschritt.

## Technisches Design

1. Der Bewegungs-Pass integriert Gravitation, Wind, Grenzen und Lebensdauer
   in einen Zielpuffer. Er erzeugt keine Kollisionsreaktion und keinen Impact.
2. Der Raster-Pass indexiert die bereits integrierten Positionen und wird vor
   jeder der zwei Solver-Iterationen aktualisiert.
3. Zwei Solver-Pässe lesen jeweils aus einem stabilen Quellpuffer und schreiben
   in einen separaten Zielpuffer. Jeder Partikel berechnet dieselbe
   Kollisionsradius-Funktion für sich und den Nachbarn, trennt eine
   Überschneidung mit halber Penetrationskorrektur und wendet einen Impuls nur
   an, wenn sich beide aufeinander zubewegen. Dadurch addieren sich die zwei
   Seiten einer Berührung exakt bis zur Randberührung.
4. Der räumliche Scan bleibt auf die angrenzenden Zellen begrenzt. Er priorisiert
   die nächsten Kontakte und begrenzt die Arbeit pro Partikel, damit die
   Framerate auch bei maximalem Regen stabil bleibt.
5. Die `impact`-Komponente wird nicht mehr erzeugt oder gerendert. Glow und
   Bloom bleiben davon unabhängig erhalten.

## Erfolgskriterien

- Zwei gleich große Emojis, die sich treffen, bleiben nach der Solver-Auflösung
  mindestens einen gemeinsamen Kollisionsradius voneinander entfernt.
- Unterschiedlich große Emojis werden anhand derselben Radiusfunktion getrennt.
- Emoji-Kontakte und Bodenkontakte erzeugen keine visuellen Impact-Pulse,
  Strahlen oder Größenblitze.
- Der Renderer bleibt bei aktiviertem Kollisionsmodus innerhalb seines
  existierenden WebGPU-Framebudgets; die Arbeitsmenge pro Partikel ist begrenzt.
- Die Änderung ist über fokussierte Tests und die Renderer-Statusdaten nach
  einem Plugin-Reload prüfbar, ohne die laufende LTTH-Instanz neu zu starten.

## Nicht im Umfang

- Keine Änderung an Chat-Commands, Superfan-Freischaltung, Emoji-Auswahl oder
  allgemeinen visuellen Profilen.
- Keine Änderung am globalen Serverprozess oder am Stream.
