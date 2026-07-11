# AnimazingPal Stream Readiness

## Stream-Ready Preset

Das Preset `stream-ready` ist für schnellere, unterhaltsamere Live-Reaktionen gedacht:

- Aktiviert die KI-Antwortschicht
- Verkürzt Reaktions-Cooldowns
- Schaltet Chat-Weiterleitung an ChatPal ein
- Setzt stärkere Standard-Auto-Responses für Follow, Gift, Share und Subscribe
- Hebt Like-Reaktionen an, ohne den Stream mit zu vielen Antworten zu überfluten

Es ist bewusst ein Startpunkt für Live-Tuning, kein statischer Endzustand.

## Verbleibende Lücken

### VTube Studio

- Hotkey-Mapping hängt weiterhin vom konkreten Modell ab und muss pro Avatar verifiziert werden.
- Auth-Token-Erzeugung und Erneuerung ist nicht vollständig automatisiert.
- Es gibt aktuell nur den direkt nutzbaren Model-Load-Pfad, aber noch kein fein abgestuftes Expressions- oder Parameter-Management.
- Falls das Modell keine passenden Hotkeys mitbringt, fallen manche Event-Aktionen sichtbar schwächer aus.

### VSeeFace

- VMC/OSC-Pfade sind implementiert, aber Avatar-spezifische Bone-/Expression-Reaktionen müssen pro Rig validiert werden.
- Manche VRM-Rigs reagieren auf Motion- oder Reset-Pakete unterschiedlich stark.
- Eine explizite Calibrate-/Calibration-Wizard-Schicht fehlt noch.
- Es gibt noch keine modellabhängige Expressions-Matrix oder Pose-Bibliothek.

### Plattformübergreifend

- ChatPal-TTS und AI-Voice-Flows sind noch nicht komplett plattformneutral abstrahiert.
- Die Reaktionslogik ist jetzt plattformfähig, aber das Timing muss im echten Stream noch feinjustiert werden.
- Es gibt noch keinen automatischen Fallback pro Event, wenn eine Plattform einen Action-Typ nicht sauber unterstützt.

## Live-Testplan

### 1. Startbereit machen

- AnimazingPal starten
- Zielplattform auswählen
- Prüfen, dass `stream-ready` angewendet ist
- In der Statusansicht prüfen:
  - aktive Plattform
  - Host/Port
  - Preset-Werte

### 2. Verbindung testen

- `Animaze`: Verbindung herstellen und Daten neu laden
- `VTube Studio`: Hotkey-Trigger und Model-Load testen
- `VSeeFace`: OSC/VMC-Verbindung prüfen und Reset-/Motion-Pakete senden

### 3. Event-Szenarien

- Follow auslösen und prüfen, ob eine schnelle Reaktion sichtbar ist
- Gift auslösen und prüfen, ob Emote + Chat-Reaktion passiert
- Share auslösen und prüfen, ob eine stärkere Reaktion erfolgt
- Subscribe auslösen und prüfen, ob eine markantere Reaktion passiert
- Chat posten und prüfen, ob AI-/ChatPal-Reaktion sinnvoll und kurz genug ist

### 4. Unterhaltungs-Check

- Prüfen, ob der Avatar nicht nur reagiert, sondern abwechslungsreich wirkt
- Prüfen, ob Reaktionen nicht zu spammy sind
- Prüfen, ob Follow/Gift/Subscribe visuell unterscheidbar sind
- Prüfen, ob Chat-Antworten nicht die Events überdecken

### 5. Tuning-Schleife

- Reaktions-Cooldowns anpassen
- Persona-Texte kürzen oder schärfen
- EventActions pro Plattform nachschärfen
- Hotkeys/Expressions/Motions je Plattform vereinheitlichen

