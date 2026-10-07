# Zielbild 1: praktische Abnahme der sechs Prioritäten

Auftrag vom 07.10.2026. Eigentümer: Rechte/Ereignisse, Chat `01a10da8-bf44-7452-9547-8fd7edcc740a`. Koordinator: CEO. Dieses Dokument ist der dauerhafte Arbeitsauftrag; im Eigentümerchat zusätzlich als persistentes Goal anlegen. Status: zur Bearbeitung freigegeben.

## Ziel und Reihenfolge

Die folgenden sechs Punkte werden exakt in dieser Reihenfolge abgeschlossen. Kein späterer Punkt wird vorgezogen, um einen Blocker zu umgehen. Innerhalb eines Punktes dürfen die zwei bestehenden Fachworker helfen. Source- oder Mocktests ersetzen keine praktische Abnahme.

1. **Music Bot / echte MPV-Wiedergabe.** Vorhandene MPV-Installation und Safetylock-Vertrag prüfen. In einem isolierten Testprofil echten Audiopfad, Suche, Queue-Reihenfolge, Pause/Resume, Seek, Lautstärke, Heartbeat und Stop/Destroy testen. Tatsächlich hörbare Ausgabe von technischer Wiedergabetelemetrie trennen; falls Hören durch den Agenten nicht belegbar ist, gezielte Nutzerprüfung erforderlich. Sperren nicht umgehen. Eigene Prozesse mit PID und Cleanup nachweisen.
2. **OBS-Abnahme.** Das aktuelle Inventar von 104 Quellen aus dem QA-Report übernehmen und vor Beginn gegen den Quellstand prüfen. Für jede Quelle Laden, sichtbare Darstellung, passende Aktualisierung, Fehlerzustand und Lifecycle in einer eigenen Testszene dokumentieren. OBS-/WebGPU-Version und Einschränkungen festhalten. Vorhandene produktive Szenen nicht ändern. Die 860 gültigen Dokumentationsreceipts sind kein OBS-Nachweis. Fehlende OBS-Bedienmöglichkeit konkret melden, keine Browserprobe als OBS-Pass ausgeben.
3. **Öffentliche Overlays und Tunnel.** In isolierter Umgebung jede relevante öffentliche Quelle auf Laden/Assets, Updates, Zugriffsschutz und Datenprojektion prüfen. Tunnelabbruch, Wiederverbindung, geänderte URL und tatsächliche Clipboard-Kopie testen. Nur die bereits freigegebenen begrenzten Viewer-XP-/Sidekick-Anzeigedaten öffentlich übertragen; interne IDs, Rohpayloads und Einstellungen ausschließen. Kein Publishing und keine Eingriffe in produktive Tunnel.
4. **Eulerstream SuperFan.** Aktuelle offizielle Event-/Badge-Verträge recherchieren; echte Rohfelder über Adapter, Rechteprüfung und UI verfolgen. Fanclub/Subscriber/Teamlevel nicht als SuperFan erfinden. Zuerst ohne Liveverbindung mit belastbaren Fixtures debuggen; anschließend bei Bedarf passiv einen öffentlichen aktiven Stream testen. Fallback-Schlüssel erst nach ausstehender ausdrücklicher Bestätigung verwenden. Keine Schlüssel oder identifizierenden Rohdaten in Berichten. Kein Chat/Gift/Kauf. Abschluss verlangt Feldvertrag, positive/negative Fälle und belegte Darstellung; fehlende echte positive Events als Lücke ausweisen.
5. **Dashboard.** Ereignisverlauf, Initialladen, leere Zustände, Lade-/Fehlerfälle, Connect/Disconnect, Profilwechsel nach vorgesehenem Neustart und sofortige Sprachumschaltung praktisch testen. Zähler/Anzeige mit isolierten Backendereignissen abgleichen und alte Stream-/Profilanzeige ausschließen.
6. **DE/EN/ES/FR und Layouts.** Dashboard und aktive Pluginoberflächen inventarisieren; alle vier Sprachen praktisch prüfen, auch dynamische Status, Formulare, Fehler und Overlaytexte. Speichern, Reload und eigener App-Neustart müssen Auswahl/Werte erhalten. Abgeschnittene Texte, Überlagerung, fehlende Übersetzungen und ungültige Eingaben mit konkreter Oberfläche dokumentieren und reparieren.

## Arbeitsweise und Abschluss

- Vor jeder Änderung aktuelle Berichte, Gitdiff und Modul lesen; fremde Talking-Heads-/TTS-Arbeit erhalten. Bundled Node 22 verwenden.
- Praktische Tests nur eigene temporäre Profile, Szenen, Daten und Prozesse. Kein Push, Release, Publishing, fremde Profile oder unzuordenbare Prozesse.
- Reproduzierte Fehler eng beheben und passend nachprüfen. Keine nutzlosen wiederholten Testläufe. Erforderliche Popupantworten bis fünf Minuten offen lassen; Zeitablauf ist keine Zustimmung.
- Pro Punkt in `prioritaeten-fortschritt.md` Iststand, Schritte, Evidenzpfade, Testergebnis, Cleanup und Restlücken pflegen. Status: offen / in Arbeit / blockiert / CEO-geprüft abgeschlossen. Blockierte Schritte niemals stillschweigend überspringen.
- Eigentümer bleibt proaktiv am aktuellen Punkt; meldet konkrete Blocker samt nächster notwendiger Handlung an CEO. Neue Worker ausschließlich durch Nutzererstellung.
- CEO prüft Ergebnisse unabhängig. Ziel 1 ist erst fertig, wenn alle sechs Punkte praktisch belegt und vom CEO abgenommen sind. Erst dann gibt CEO Ziel 2 frei; bloßer Workerabschluss oder Budgetende reichen nicht.

## Startstand

Punkt 1 offen. Punkte 2–6 warten auf Vorgänger. OBS bisher 0/104; Schlüsselbestätigung offen. Keine Gesamtfreigabe aus bisherigen fokussierten Tests.
