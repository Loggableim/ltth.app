# Slot Machine Sound Effects

## Overview

Die Slot Machine Funktion nutzt drei verschiedene Sound-Events, um die Animation zu unterstützen:

1. **slot_machine_spin** - Spielt beim Start der Slot Machine Animation
2. **slot_machine_stop** - Spielt wenn die Animation stoppt
3. **slot_machine_win** - Spielt wenn die gewählte Kategorie angezeigt wird

## Sound-Dateien hinzufügen

### Methode 1: Über die Datenbank (Empfohlen für Entwickler)

Sie können Sound-Dateien direkt in die `game_sounds` Tabelle einfügen:

```sql
-- Slot Machine Spin Sound
INSERT INTO game_sounds (event_name, file_path, volume) 
VALUES ('slot_machine_spin', '/pfad/zu/spin_sound.mp3', 0.8);

-- Slot Machine Stop Sound
INSERT INTO game_sounds (event_name, file_path, volume) 
VALUES ('slot_machine_stop', '/pfad/zu/stop_sound.mp3', 0.9);

-- Slot Machine Win Sound
INSERT INTO game_sounds (event_name, file_path, volume) 
VALUES ('slot_machine_win', '/pfad/zu/win_sound.mp3', 1.0);
```

### Methode 2: Über die API (Für zukünftige UI-Integration)

Zukünftig könnte eine UI zum Upload von Sound-Dateien hinzugefügt werden.

## Empfohlene Sound-Eigenschaften

- **Format:** MP3 oder WAV (MP3 empfohlen für kleinere Dateigröße)
- **Qualität:** 128-192 kbps für MP3
- **Dauer:**
  - Spin: 0.5-2 Sekunden (Loop-fähig während der Spin-Dauer)
  - Stop: 0.3-0.5 Sekunden (kurzer "Klick" oder "Thud")
  - Win: 1-3 Sekunden (triumphaler Sound)
- **Lautstärke:** Normalisiert, Peaks bei -3dB

## Wo finde ich passende Sounds?

### Kostenlose Quellen:
- **Freesound.org** - Große Sammlung von CC-lizenzierten Sounds
- **ZapSplat** - Kostenlose Sound-Effekte (mit Quellenangabe)
- **SoundBible** - Gemeinfreie und CC-Sounds

### Such-Keywords:
- "slot machine spin"
- "casino reel"
- "mechanical click"
- "winner bell"
- "jackpot sound"

## Beispiel-Workflow

1. Finden Sie passende Sound-Dateien (z.B. auf Freesound.org)
2. Laden Sie die Sounds herunter und speichern Sie sie im Plugin-Datenverzeichnis
3. Fügen Sie die Sound-Events zur Datenbank hinzu (siehe oben)
4. Testen Sie die Slot Machine im Overlay

## Hinweise

- Sounds werden über Socket.io an das Overlay gesendet
- Die Lautstärke kann in der Datenbank von 0.0 (stumm) bis 1.0 (volle Lautstärke) eingestellt werden
- Wenn kein Sound gefunden wird, läuft die Animation trotzdem ab (ohne Audio)
- Die Sounds sollten nicht urheberrechtlich geschützt sein oder Sie benötigen die entsprechende Lizenz
