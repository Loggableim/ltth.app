# Interactive Story – Schnellstart

## 1. Plugin und Ollama Cloud vorbereiten

1. Aktiviere **Interactive Story** unter **Plugins**.
2. Öffne die zentralen LTTH-Einstellungen und hinterlege den Ollama-Cloud-Schlüssel einmalig. Interactive Story nutzt `ollama_cloud_api_key` bevorzugt und akzeptiert auch `ollama_api_key` oder `tts_ollama_api_key`.
3. Öffne **Plugins & Tools → Interactive Story**. Der Schlüssel wird dort nicht erneut gespeichert oder angezeigt; ein vorhandener Schlüssel erscheint nur als `***configured***`.

Der Cloud-Standard ist `https://api.ollama.com/v1` mit `qwen3.5:cloud`. Das Speichern der Einstellungen bestätigt keine externe Provider-Verbindung.

## 2. Studio konfigurieren

1. Wähle den LLM-Provider und das Modell.
2. Lass **Auto-generate Images** aus, wenn du keine Kapitelbilder brauchst. Das ist der Standard; die Story läuft dann textbasiert weiter.
3. Falls du Bilder verwenden möchtest, aktiviere die Option bewusst und wähle Image-Provider und Modell.
4. Für Stimme wähle Fish.audio, **S2.1 Pro** oder **S1**, sowie den gewünschten Emotionsmodus. S1 spricht `(emotion)`-Cues, S2.1 Pro `[emotion]`-Cues; im Overlay bleibt der Text ohne diese Marker.
5. Speichere die Konfiguration.

## 3. OBS-Overlay hinzufügen

Füge in OBS eine Browserquelle mit 1920 × 1080 hinzu:

```text
http://localhost:3000/plugins/interactive-story/overlay.html
```

Der normale Overlay-Link ist nur zum Anzeigen. Für eine öffentliche Quick-Tunnel-URL gilt ebenfalls: anzeigen ja, bearbeiten und Layout speichern nein.

## 4. Layout lokal bearbeiten

Öffne für das Einrichten eine lokale Browser-Ansicht mit `?edit=1`:

```text
http://localhost:3000/plugins/interactive-story/overlay.html?edit=1
```

Ziehe Titel, Inhalt, Voting, Generierung, Ergebnis und Teilnehmerliste an die gewünschte Position. Mit **Save** wird das responsive v2-Layout gespeichert; **Reset** setzt es zurück, **Snap** rastet beim Ziehen ein. Die Schreibfunktionen sind ausschließlich in diesem lokalen Edit-Modus aktiv.

## 5. Story starten

1. Wähle ein Theme und optional ein Outline.
2. Klicke **Start Story**.
3. Zuschauer stimmen mit `!a`, `!b`, `!c` und weiteren aktiven Buchstaben ab.
4. Nach Ende der Abstimmung erzeugt das Plugin das nächste Kapitel. Ein fehlendes oder fehlgeschlagenes optionales Bild blockiert diesen Ablauf nicht.

## Optional: Pen-and-Paper-Runde

1. Stelle im Studio den Story-Modus auf Pen-and-Paper.
2. Lass das Join-Kommando auf `!join` oder setze ein eigenes Kommando, bevor du die Session startest.
3. Zuschauer treten mit dem Kommando bei und erhalten eine Rolle.
4. Wer an einer berechtigten Runde nicht abstimmt, erhält einen Fehlrunden-Zähler. Bei zwei aufeinanderfolgenden Fehlrunden wird die Rolle standardmäßig ausgeschieden; jede gültige Stimme setzt den Zähler zurück. Neue Teilnehmer werden für ihre Beitrittsrunde nicht bestraft.

Die Einstellungen dieser Runde werden beim Start an der Session fixiert. Änderungen im Studio betreffen deshalb erst neue Sessions.

## Wenn etwas nicht funktioniert

- **Cloud-Schlüssel fehlt:** zentrale Ollama-Einstellungen prüfen, nicht im Plugin nach einem unmaskierten Schlüssel suchen.
- **Keine Bilder:** normal bei ausgeschaltetem Auto-generate Images oder Text-only; optionalen Provider erst bei bewusst aktivierter Bildfunktion prüfen.
- **Keine Sprache:** Fish-Modell und Emotionsmodus im Studio prüfen; Cues gehören nur in die TTS-Fassung, nicht in den sichtbaren Kapiteltext.
- **Kein Speichern im Layouteditor:** sicherstellen, dass die URL lokal ist und `?edit=1` enthält.
