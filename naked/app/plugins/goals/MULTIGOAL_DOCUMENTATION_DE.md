# MultiGoal Feature - Dokumentation

## Übersicht

Das MultiGoal Feature ermöglicht es, mehrere Live-Ziele in einem rotierenden Overlay mit modernen WebGL-Animationen anzuzeigen. Dies ist ideal für Streamer, die mehrere Ziele gleichzeitig verfolgen möchten, ohne mehrere Overlays in OBS zu verwenden.

## Funktionen

### Kernfunktionen
- ✅ **Multi-Ziel Rotation**: Wähle beliebig viele bestehende Live-Ziele aus
- ✅ **Anpassbare Rotation**: Stelle das Rotationsintervall in Sekunden ein (1-60 Sekunden)
- ✅ **5 WebGL Animationen**: Moderne, flüssige Übergänge zwischen Zielen
- ✅ **Echtzeit Updates**: Live-Aktualisierung der Zielwerte während der Rotation
- ✅ **Individuelle Overlays**: Jedes MultiGoal erhält eine eigene Overlay-URL

### Verfügbare WebGL Animationen

1. **Slide Transition** - Sanftes Gleiten von einem Ziel zum nächsten
2. **Fade Transition** - Weiches Überblenden zwischen Zielen
3. **Cube Rotation** - 3D-Würfel-Flip-Effekt
4. **Wave Distortion** - Wellenförmiger Verzerrungseffekt
5. **Particle Transition** - Partikel-Auflösungseffekt

## Installation & Einrichtung

### 1. Zugriff auf die UI

Navigiere zu: `http://localhost:3000/goals/ui`

### 2. MultiGoal erstellen

1. Klicke auf den **"MultiGoals"** Tab in der Seitenleiste
2. Klicke auf **"+ Create MultiGoal"**
3. Konfiguriere das MultiGoal:
   - **Name**: Wähle einen aussagekräftigen Namen
   - **Rotationsintervall**: Wie viele Sekunden jedes Ziel angezeigt werden soll (1-60s)
   - **WebGL Animation**: Wähle eine der 5 verfügbaren Animationen
   - **Overlay-Größe**: Breite und Höhe in Pixeln
   - **Ziele auswählen**: Wähle mindestens 2 Ziele aus der Liste aus

4. Klicke auf **"Save MultiGoal"**

### 3. In OBS hinzufügen

1. Kopiere die Overlay-URL aus der MultiGoal-Karte
2. Füge in OBS eine neue **"Browser Source"** hinzu
3. Füge die URL ein: `http://localhost:3000/goals/multigoal-overlay?id={multigoalId}`
4. Stelle die Breite/Höhe entsprechend deiner Konfiguration ein
5. Positioniere die Quelle in deiner Szene

## Verwendung

### MultiGoal bearbeiten

1. Klicke auf **"✏️ Edit"** auf der MultiGoal-Karte
2. Ändere die gewünschten Einstellungen
3. Klicke auf **"Save MultiGoal"**

Die Änderungen werden sofort im Overlay übernommen.

### MultiGoal löschen

1. Klicke auf **"🗑️ Delete"** auf der MultiGoal-Karte
2. Bestätige die Löschung

### Rotation im Overlay

- Das Overlay rotiert automatisch durch die ausgewählten Ziele
- Jedes Ziel wird für die konfigurierte Anzahl an Sekunden angezeigt
- WebGL-Animationen werden zwischen den Zielen angezeigt
- Die Zielwerte werden in Echtzeit aktualisiert

## API Endpunkte

### MultiGoals verwalten

```http
GET    /api/multigoals              # Alle MultiGoals abrufen
POST   /api/multigoals              # Neues MultiGoal erstellen
GET    /api/multigoals/:id          # Spezifisches MultiGoal abrufen
PUT    /api/multigoals/:id          # MultiGoal aktualisieren
DELETE /api/multigoals/:id          # MultiGoal löschen
```

### Metadaten

```http
GET /api/multigoals/meta/animations  # Verfügbare WebGL-Animationen
```

## WebSocket Events

### Client → Server

```javascript
socket.emit('multigoals:subscribe', multigoalId);    // Abonnieren
socket.emit('multigoals:unsubscribe', multigoalId);  // Abbestellen
socket.emit('multigoals:get-all');                   // Alle abrufen
```

### Server → Client

```javascript
socket.on('multigoals:all', data);           // Alle MultiGoals
socket.on('multigoals:created', data);       // MultiGoal erstellt
socket.on('multigoals:updated', data);       // MultiGoal aktualisiert
socket.on('multigoals:deleted', data);       // MultiGoal gelöscht
socket.on('multigoals:subscribed', data);    // Erfolgreich abonniert
socket.on('multigoals:config-changed', data); // Konfiguration geändert
```

## Technische Details

### Datenbankschema

#### multigoals Tabelle
- `id` - Eindeutige MultiGoal-ID
- `name` - MultiGoal-Name
- `enabled` - Aktivierungsstatus
- `rotation_interval` - Rotationsintervall in Sekunden
- `animation_type` - Ausgewählte WebGL-Animation
- `overlay_width` - Overlay-Breite in Pixeln
- `overlay_height` - Overlay-Höhe in Pixeln
- `created_at` - Erstellungszeitpunkt
- `updated_at` - Aktualisierungszeitpunkt

#### multigoal_goals Tabelle
- `multigoal_id` - Referenz zum MultiGoal
- `goal_id` - Referenz zum Ziel
- `display_order` - Anzeigereihenfolge

### WebGL Shader-System

Das MultiGoal-Overlay verwendet WebGL 2.0 / WebGL 1.0 für hardwarebeschleunigte Animationen:

- **Vertex Shader**: Gemeinsamer Shader für alle Animationen
- **Fragment Shader**: Spezifische Shader für jede Animation
- **Textur-Interpolation**: Bilineare Filterung für glatte Übergänge
- **Blending**: Alpha-Blending für Transparenzeffekte

### Performance

- **WebSocket Latenz**: <50ms für Echtzeit-Updates
- **Animationsleistung**: 60 FPS mit requestAnimationFrame
- **GPU-Beschleunigung**: WebGL nutzt Hardware-Beschleunigung
- **Speichereffizient**: Textures werden nach jedem Übergang freigegeben

## Beispiel-Workflow

### Szenario: Stream mit mehreren Zielen

1. **Erstelle Ziele** (falls noch nicht vorhanden):
   - Coin-Ziel: 10.000 Coins
   - Likes-Ziel: 5.000 Likes
   - Follower-Ziel: 100 neue Follower

2. **Erstelle MultiGoal**:
   - Name: "Stream-Ziele Rotation"
   - Interval: 7 Sekunden
   - Animation: "Cube Rotation"
   - Größe: 600x120 Pixel
   - Ziele: Alle 3 Ziele auswählen

3. **In OBS einrichten**:
   - Browser-Quelle hinzufügen
   - MultiGoal-Overlay-URL einfügen
   - Position im unteren Bildschirmdrittel

4. **Live gehen**:
   - Das Overlay rotiert automatisch alle 7 Sekunden
   - Zuschauer sehen alle Ziele mit Würfel-Animation
   - Werte aktualisieren sich live

## Fehlerbehebung

### MultiGoal wird nicht angezeigt

1. Überprüfe, ob mindestens 2 Ziele ausgewählt sind
2. Stelle sicher, dass die ausgewählten Ziele noch existieren
3. Überprüfe die Browser-Konsole auf Fehler

### WebGL-Animationen funktionieren nicht

1. Überprüfe, ob WebGL im Browser unterstützt wird
2. Stelle sicher, dass Hardware-Beschleunigung aktiviert ist
3. Probiere eine andere Animation (z.B. "Fade" ist am einfachsten)

### Zielwerte aktualisieren sich nicht

1. Überprüfe die WebSocket-Verbindung
2. Stelle sicher, dass die Ziele aktiviert sind
3. Überprüfe, ob TikTok-Events empfangen werden

## Best Practices

### Empfohlene Einstellungen

- **Rotationsintervall**: 5-10 Sekunden (genug Zeit zum Lesen)
- **Anzahl der Ziele**: 2-5 Ziele (nicht zu viele)
- **Animation**: "Slide" oder "Fade" für weniger ablenkende Übergänge
- **Overlay-Größe**: 500x100 bis 800x150 Pixel

### Performance-Tipps

- Verwende nicht zu viele gleichzeitige MultiGoals
- Aktiviere nur die Ziele, die du wirklich brauchst
- Verwende angemessene Overlay-Größen (nicht zu groß)

## Lizenz

Teil von PupCid's Little TikTool Helper
Lizenz: CC-BY-NC-4.0

## Support

Bei Fragen oder Problemen:
1. Überprüfe diese Dokumentation
2. Schaue in die Browser-Konsole für Fehler
3. Erstelle ein Issue auf GitHub
