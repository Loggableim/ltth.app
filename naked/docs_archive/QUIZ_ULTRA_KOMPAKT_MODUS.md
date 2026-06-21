# Quiz Ultra-Kompakt-Modus

## Übersicht

Der **Ultra-Kompakt-Modus** ist eine neue Display-Option für das Quiz-Show-Plugin, die speziell für kleine OBS-Overlays entwickelt wurde. Im Ultra-Kompakt-Modus wird das Quiz-Overlay auf **600 x 350 Pixel** optimiert.

## Hauptmerkmale

### 1. Kompakte Darstellung (600x350px)
- Gesamtes Quiz-Overlay passt in einen Bereich von 600 Pixel Breite × 350 Pixel Höhe
- Optimierte Schriftgrößen und Abstände für beste Lesbarkeit
- 2×2 Grid-Layout für Antworten statt 4-spaltig
- Timer wird kompakt in der oberen rechten Ecke angezeigt

### 2. Question-First-Ansatz
Im Ultra-Kompakt-Modus wird die Frage **zuerst** angezeigt, und die Antworten erscheinen **nach einer konfigurierbaren Verzögerung**.

**Ablauf:**
1. Frage wird angezeigt
2. Wartezeit (Standard: 3 Sekunden) - ideal für TTS-Ansage der Frage
3. Antworten werden eingeblendet mit Fade-Animation
4. Timer startet wie gewohnt

**Vorteil:** 
- Zuschauer hören/lesen erst die Frage vollständig
- Dann erscheinen die Antwortmöglichkeiten
- Bessere Fokussierung und weniger Ablenkung

### 3. Kompaktes Leaderboard
Im Ultra-Kompakt-Modus zeigt das Leaderboard automatisch nur die **Top 4** Spieler:
- Reduzierte Schriftgrößen
- Kompaktere Abstände
- Nur die besten 4 Platzierungen werden angezeigt
- Perfekt für kleine Overlays

## Einstellungen

### Aktivierung
1. Öffne die Quiz-Show-Plugin-Einstellungen
2. Navigiere zum Tab **"Einstellungen"**
3. Scrolle zum Abschnitt **"Spiel Einstellungen"**
4. Aktiviere die Checkbox **"Ultra-Kompakt-Modus (600x350)"**
5. Optional: Passe die **"Antwort-Verzögerung"** an (1-10 Sekunden)

### Konfigurationsoptionen

| Option | Standardwert | Beschreibung |
|--------|--------------|--------------|
| **Ultra-Kompakt-Modus** | Aus | Aktiviert die 600x350px Darstellung |
| **Antwort-Verzögerung** | 3 Sekunden | Zeit zwischen Frage-Anzeige und Antwort-Anzeige |

## OBS-Einrichtung

### Browser-Source für Quiz-Overlay
```
URL: http://localhost:3000/plugins/quiz_show/quiz_show_overlay.html
Breite: 600
Höhe: 350
```

### Browser-Source für Leaderboard
```
URL: http://localhost:3000/plugins/quiz_show/quiz_show_leaderboard_overlay.html
Breite: 600
Höhe: 350
```

**Wichtig:** Aktiviere "Shutdown source when not visible" um Ressourcen zu sparen.

## Unterschiede zum Standard-Modus

| Feature | Standard-Modus | Ultra-Kompakt-Modus |
|---------|----------------|---------------------|
| **Größe** | 1920×1080 (Full HD) | 600×350 |
| **Antworten** | Sofort sichtbar | Nach Verzögerung |
| **Layout** | 4-spaltig horizontal | 2×2 Grid |
| **Leaderboard** | Alle Einträge | Top 4 |
| **Voter Icons** | Angezeigt | Ausgeblendet (Platzersparnis) |
| **Hintergrund-Effekte** | Glow Orbs aktiv | Deaktiviert |
| **Joker-Info-Overlay** | Angezeigt | Ausgeblendet (Platzersparnis) |

## CSS-Anpassungen

Die Ultra-Kompakt-Modus-Styles werden automatisch angewendet, wenn das Overlay-Container das Attribut `data-ultra-kompakt="true"` hat.

### Wichtige CSS-Klassen
```css
/* Container wird auf 600x350 begrenzt */
.overlay-container[data-ultra-kompakt="true"] {
    width: 600px !important;
    height: 350px !important;
}

/* Kompakte Frage-Darstellung */
.overlay-container[data-ultra-kompakt="true"] .question-text {
    font-size: 1.1rem;
}

/* 2x2 Grid für Antworten */
.overlay-container[data-ultra-kompakt="true"] .answers-grid {
    grid-template-columns: 1fr 1fr;
}

/* Leaderboard Top 4 */
.leaderboard-container.ultra-kompakt .leaderboard-item:nth-child(n+5) {
    display: none; /* Automatisch durch slice(0,4) gefiltert */
}
```

## Technische Details

### Backend (main.js)
```javascript
config: {
    ultraKompaktModus: false,
    ultraKompaktAnswerDelay: 3
}
```

### State Update
Der Modus wird über das `quiz-show:state-update` Socket-Event an das Overlay übertragen:
```javascript
{
    ultraKompaktModus: true,
    ultraKompaktAnswerDelay: 3
}
```

### Overlay-Logik (quiz_show_overlay.js)
```javascript
// Antworten initial verstecken
answersSection.style.opacity = '0';
answersSection.style.display = 'none';

// Nach Delay einblenden
setTimeout(() => {
    displayAnswers(gameData.answers);
    answersSection.style.opacity = '1';
}, gameData.ultraKompaktAnswerDelay * 1000);
```

## Best Practices

### Verwendung mit TTS
Für optimale Ergebnisse bei Verwendung mit Text-to-Speech:
1. Aktiviere TTS in den Quiz-Einstellungen
2. Setze die Antwort-Verzögerung auf mindestens 3 Sekunden
3. TTS liest die Frage → Antworten erscheinen → Zuschauer haben Zeit zum Antworten

### Empfohlene Einstellungen
```
Antwort-Verzögerung: 3-5 Sekunden (je nach Fragelänge)
Rundendauer: 20-30 Sekunden (etwas kürzer als im Standard-Modus)
TTS aktiviert: Ja (für beste UX)
```

## Troubleshooting

### Antworten erscheinen nicht
- Prüfe, ob die Antwort-Verzögerung nicht zu lang ist
- Stelle sicher, dass der Timer nicht vor dem Erscheinen der Antworten abläuft
- Check Browser-Konsole auf JavaScript-Fehler

### Layout passt nicht
- Stelle sicher, dass die OBS Browser-Source exakt 600×350 ist
- Deaktiviere "Custom CSS" wenn konfiguriert
- Lade die Seite im Browser neu (F5)

### Leaderboard zeigt mehr als 4 Einträge
- Prüfe, ob das Ultra-Kompakt-Modus im Admin-Panel aktiviert ist
- Speichere die Einstellungen und lade die Leaderboard-Seite neu
- Prüfe Browser-Konsole auf die Meldung "ultra-kompakt" Klassenzuweisung

## Changelog

### Version 1.0.0 (2025-12-17)
- ✅ Initiale Implementation des Ultra-Kompakt-Modus
- ✅ Question-First Display-Logik
- ✅ 600×350 CSS-Constraints
- ✅ Top-4 Leaderboard-Filterung
- ✅ Konfigurierbare Antwort-Verzögerung
- ✅ UI-Steuerelemente im Admin-Panel

## Support

Bei Fragen oder Problemen:
1. Prüfe die Browser-Konsole auf Fehler
2. Stelle sicher, dass alle Dateien aktualisiert wurden
3. Erstelle ein Issue mit Screenshots und Fehlermeldungen
