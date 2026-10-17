# OBS-104 Gast-Runbook (nur nach Wiederaufnahme)

Stand: 2026-10-08. **Dieses Runbook autorisiert keinen Start.** P2 bleibt pausiert: derzeit keine OBS-, VM-, Produkt-, Profil- oder Prozessaktion. Der Nutzer muss P2 ausdrücklich wiederaufnehmen; der CEO muss den konkreten Isolations- und Prüfablauf bestätigen.

## Vorbedingungen

1. Nutzerbestätigung zur Wiederaufnahme von P2 und explizite CEO-Disposition für den Gastlauf und Browser-Source-Mutationen liegen schriftlich vor. Ohne beide Bestätigungen stoppen.
2. Nutzer startet den eigens vorgesehenen isolierten Gast selbst. Kein OBS auf dem Host starten und keine fremde oder produktive VM/OBS-Konfiguration lesen oder ändern.
3. Vor jeder Mutation im Gast read-only belegen: richtige VM-Identität, isolierter Zustand, alle Netzwerkadapter deaktiviert, Shared Folders/Clipboard/Drag-and-drop/USB/VRDE aus, eigene portable OBS-Konfiguration, Stream/Record aus. Bei Abweichung stoppen; keine Firewall- oder VM-Einstellungen spontan ändern.
4. Den freigegebenen Source-/Asset-/Locale-Stand gegen [obs-104-current-source-audit-20261008.json](obs-104-current-source-audit-20261008.json) und die genehmigte Transfermanifest-SHA prüfen. Fehlende oder geänderte Dateien sperren den Lauf.
5. Nur loopbackgebundene synthetische HTTP-/Socket-Fixtures, lokale Platzhalterbilder und künstliche IDs/Namen verwenden. Keine TikTok-/Eulerstream-/Providerverbindungen, Zuschauer, Konten, Rollen, Guthaben, Tokens, Schlüssel, Geräte, Game-/TTS-Aktionen oder externen Assets.

## Pilot und 104 Fälle

1. Vor dem Batch genau einen separat freigegebenen sicheren Pilotfall ausführen. Anfangszustand, Fixtureantworten/-events, Fehlerzustand, Screenshot, Console/Netzwerklog und Cleanup vollständig belegen. Stream/Record bleibt aus.
2. Nach dem Pilot OBS/Fixtureprozesse beenden, Szenen-/Quellenbaseline und PIDs/Ports/Cleanup prüfen und CEO-Sichtprüfung abwarten. Erst nach dokumentierter unabhängiger Pilotabnahme darf der CEO den Batch ausdrücklich freigeben.
3. Matrix in 26 Gruppen × de/en/es/fr bearbeiten. Die vier Chatango-Einträge sind Retirement-Kontrollen, keine Rendererfälle und keine OBS-Pässe. Sie bleiben im 104er-Denominator und dürfen nicht als erfolgreich markiert werden.
4. Pro aktivem Fall zunächst leere Baseline, dann genau den synthetischen Falltrigger, Update, Negativ-/Fehlerzustand und Lifecycle/Cleanup prüfen. Auflösung, URL/Query, Locale, tatsächliches HTML/Assetziel, unveränderte Produktprofile, Console, Netzwerk und Bild sichern.
5. Nur ein unabhängig geprüfter Screenshot plus vollständiger Laufzeit-/Cleanupbeleg darf den betreffenden Fall auf bestanden setzen. CPU-Fixture, HTML-Datei, Route oder JSON-Matrix allein sind kein Browser-Source- oder Sichtpass.
6. Bei externer Netzwerkanfrage, unerwartetem Prozess/Listener, Produkt-DB-Zugriff, nichtsynthetischen Daten, Stream/Record oder abweichender Isolation sofort stoppen; Fall als blockiert protokollieren und CEO informieren. Keine automatische Fortsetzung.

## Nachweis und Abschluss

- Für jeden Fall eindeutige `plugin:locale`-ID, Version/Hashes, URL/Query, Source/Assetauflösung, initialer und aktualisierter Screenshot, Fehler-/Cleanupbeleg und unabhängiger Reviewerentscheid.
- Abschlusszähler bleiben auf **0/104** bis die reale Prüfung und CEO-Sichtabnahme für den jeweiligen Scope tatsächlich erfolgt sind. Retirement-Kontrollen zählen nicht als OBS-Erfolg.
- Nach jedem Batch alle eigenen Prozesse/Ports schließen, temporäre Fixturedateien bereinigen und Baseline bestätigen. Keine Veröffentlichung, kein Push und keine Änderungen an Produktdaten.
