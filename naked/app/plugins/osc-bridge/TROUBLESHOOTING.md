# OSC Bridge Troubleshooting Guide

## Avatar Auto-Discovery funktioniert nicht

### Symptome
- "No avatar detected" Fehler
- Avatar ID wird nicht erkannt
- Auto-Discovery findet keine Parameter

### Lösungen

#### 1. VRChat nicht gestartet oder OSC nicht aktiviert
**Problem:** VRChat muss laufen und OSC muss aktiviert sein.

**Lösung:**
1. Starte VRChat
2. Gehe in-game (nicht im Menü bleiben!)
3. Öffne das Action Menu (R auf Keyboard / Y auf Controller)
4. Navigiere zu: Options → OSC → Enable
5. Stelle sicher, dass "Enable OSC" aktiviert ist

#### 2. OSCQuery nicht aktiviert in OSC-Bridge
**Problem:** OSCQuery muss in den Plugin-Einstellungen aktiviert sein.

**Lösung:**
1. Öffne die OSC-Bridge UI
2. Gehe zu Settings/Einstellungen
3. Aktiviere "OSCQuery Auto-Discovery"
4. Klicke auf "Save" / "Speichern"
5. Starte die OSC-Bridge neu

#### 3. Port 9001 blockiert
**Problem:** Ein anderes Programm nutzt bereits Port 9001.

**Lösung:**
1. Prüfe welches Programm Port 9001 nutzt:
   ```bash
   netstat -ano | findstr :9001
   ```
2. Schließe das andere Programm oder
3. Ändere den Port in den OSC-Bridge Einstellungen

#### 4. Firewall blockiert die Verbindung
**Problem:** Windows Firewall oder Antivirus blockiert die Verbindung.

**Lösung:**
1. Füge eine Ausnahme für LTTH in der Firewall hinzu
2. Oder deaktiviere die Firewall temporär zum Testen
3. Stelle sicher, dass localhost (127.0.0.1) nicht blockiert ist

#### 5. Avatar nicht vollständig geladen
**Problem:** Discovery wurde zu früh gestartet.

**Lösung:**
1. Warte bis der Avatar vollständig geladen ist (10-15 Sekunden)
2. Klicke dann auf "🔍 Avatar erkennen"
3. Das System versucht jetzt automatisch 3x mit 1 Sekunde Verzögerung, den Avatar zu erkennen
4. Prüfe die Logs für Fehler

**Hinweis:** Seit Version 1.2.3+ nutzt die Avatar-Erkennung automatische Wiederholungsversuche. Das System:
- Wartet 500ms nach der Discovery, bevor es die Avatar-ID abfragt
- Versucht bis zu 3x mit 1 Sekunde Verzögerung zwischen den Versuchen
- Dies gibt VRChat mehr Zeit, den Avatar-Parameter zu aktualisieren


### Debug-Logs prüfen

Öffne die Log-Datei: `%APPDATA%/LTTH/logs/oscBridge.log`

Suche nach:
- `✅ OSCQuery discovered X parameters` → Discovery erfolgreich
- `❌ OSCQuery discovery failed` → Discovery fehlgeschlagen
- `✅ Avatar ID detected: avtr_xxx` → Avatar erkannt
- `No avatar detected` → Avatar nicht gefunden

---

## PhysBones Control funktioniert nicht

### Symptome
- PhysBones Animationen werden nicht ausgeführt
- Tail wag / Ear twitch funktioniert nicht
- Keine sichtbare Reaktion im Avatar

### Lösungen

#### 1. PhysBones nicht aktiviert
**Problem:** PhysBones müssen in den Einstellungen aktiviert sein.

**Lösung:**
1. Öffne OSC-Bridge Einstellungen
2. Aktiviere "PhysBones Control"
3. Klicke auf "🔍 PhysBones entdecken"
4. Speichere die Einstellungen

#### 2. Avatar hat keine PhysBones
**Problem:** Nicht alle Avatare haben PhysBones.

**Lösung:**
1. Prüfe in Unity ob der Avatar PhysBones hat
2. Oder teste mit einem Avatar der definitiv PhysBones hat
3. Im VRChat Avatar Menu → Avatar Info → Components

#### 3. PhysBones Parameter nicht gefunden
**Problem:** PhysBones werden nicht automatisch erkannt.

**Lösung:**
1. Starte OSCQuery Discovery neu
2. Prüfe die entdeckten Parameter:
   - GET `/api/osc/physbones/discovered`
3. Wenn leer: Avatar hat keine PhysBones oder OSCQuery funktioniert nicht

#### 4. Falsche PhysBones Pfade
**Problem:** Verschiedene Avatare nutzen unterschiedliche Pfad-Formate.

**Lösung:**
Das Plugin sendet jetzt automatisch zu beiden Formaten:
- `/avatar/physbones/BoneName/Parameter`
- `/avatar/parameters/BoneName_Parameter`

Wenn beide nicht funktionieren:
1. Prüfe in Unity welche Parameter der Avatar tatsächlich nutzt
2. Sende manuell mit `/api/osc/send`:
   ```json
   {
     "address": "/avatar/parameters/YourBoneName_IsGrabbed",
     "args": [1]
   }
   ```

#### 5. Animation-Dauer zu kurz
**Problem:** Animation läuft aber ist zu schnell vorbei.

**Lösung:**
Erhöhe die Duration in den Animation-Parametern:
```javascript
{
  "boneName": "Tail",
  "animation": "wiggle",
  "params": {
    "duration": 5000,  // 5 Sekunden statt 1
    "amplitude": 0.8
  }
}
```

### PhysBones testen

#### Manueller Test via API:
```bash
# POST /api/osc/physbones/trigger
curl -X POST http://localhost:3000/api/osc/physbones/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "boneName": "Tail",
    "animation": "wiggle",
    "params": {
      "duration": 3000,
      "amplitude": 0.7
    }
  }'
```

#### Liste entdeckte PhysBones:
```bash
curl http://localhost:3000/api/osc/physbones/discovered
```

---

## GoGo Loco Parameter werden nicht erkannt

### Symptome
- GoGo Loco Aktionen sind nicht verfügbar
- `availableActions.gogoloco` ist leer

### Lösungen

#### 1. Avatar nutzt kein GoGo Loco
**Problem:** Nicht alle Avatare haben GoGo Loco installiert.

**Lösung:**
1. Prüfe in Unity ob GoGo Loco auf dem Avatar ist
2. Oder verwende einen Avatar mit GoGo Loco
3. Die meisten neueren Full-Body Avatare haben GoGo Loco

#### 2. GoGo Loco Parameter umbenennt
**Problem:** Custom GoGo Loco Setups nutzen andere Namen.

**Lösung:**
Suche nach den tatsächlichen Parameter-Namen:
```bash
curl http://localhost:3000/api/osc/oscquery/parameters?pattern=GGL
```

Wenn gefunden aber anders benannt, nutze Custom Parameter Mapping.

#### 3. OSCQuery nicht verbunden
**Problem:** GoGo Loco wird nur via OSCQuery erkannt.

**Lösung:**
1. Aktiviere OSCQuery (siehe oben)
2. Starte Discovery neu
3. Prüfe verfügbare Aktionen:
   ```bash
   curl http://localhost:3000/api/osc/avatar/available-actions
   ```

---

## OSC-Bridge startet nicht

### Symptome
- Status bleibt auf "Not Running"
- Port-Fehler in den Logs
- Bridge startet und stoppt sofort

### Lösungen

#### 1. Port bereits in Benutzung
**Problem:** Receive Port (9001) oder Send Port (9000) bereits belegt.

**Lösung:**
1. Prüfe welches Programm die Ports nutzt:
   ```bash
   netstat -ano | findstr :9000
   netstat -ano | findstr :9001
   ```
2. Schließe das andere Programm
3. Oder ändere die Ports in den Einstellungen:
   - Receive Port: 9002 (statt 9001)
   - Send Port: 9000 (sollte frei sein)

#### 2. VRChat OSC nicht aktiviert
**Problem:** VRChat sendet keine OSC-Daten.

**Lösung:**
Siehe "Avatar Auto-Discovery" → "VRChat nicht gestartet oder OSC nicht aktiviert"

#### 3. Netzwerk-Berechtigungen fehlen
**Problem:** Programm darf nicht auf Netzwerk zugreifen.

**Lösung:**
1. Starte LTTH als Administrator (einmalig)
2. Bestätige die Firewall-Anfrage
3. Danach sollte es auch ohne Admin-Rechte funktionieren

---

## OSC-Nachrichten werden nicht empfangen

### Symptome
- `messagesReceived` bleibt bei 0
- Keine eingehenden Events in den Logs
- VRChat → LTTH Kommunikation funktioniert nicht

### Lösungen

#### 1. Falsche IP-Adresse in VRChat
**Problem:** VRChat sendet an die falsche Adresse.

**Lösung:**
VRChat OSC sendet standardmäßig an 127.0.0.1:9001. Das sollte passen.

#### 2. Receive Port falsch konfiguriert
**Problem:** OSC-Bridge hört auf dem falschen Port.

**Lösung:**
1. Stelle sicher: Receive Port = 9001
2. VRChat sendet standardmäßig an Port 9001
3. Beide müssen übereinstimmen!

#### 3. Firewall blockiert eingehende Verbindungen
**Problem:** Firewall lässt nur ausgehende, keine eingehenden Verbindungen zu.

**Lösung:**
1. Füge eine Eingangsregel für Port 9001 hinzu
2. Oder deaktiviere die Firewall temporär zum Testen

---

## OSC-Nachrichten werden nicht gesendet

### Symptome
- `messagesSent` bleibt bei 0
- VRChat reagiert nicht auf Befehle
- LTTH → VRChat Kommunikation funktioniert nicht

### Lösungen

#### 1. Falsche Send-Konfiguration
**Problem:** Send Host oder Send Port falsch.

**Lösung:**
- Send Host: `127.0.0.1` (localhost)
- Send Port: `9000` (VRChat Standard)

#### 2. VRChat OSC Receive nicht aktiv
**Problem:** VRChat hört nicht auf Port 9000.

**Lösung:**
1. In VRChat: Action Menu → Options → OSC → Enable
2. Stelle sicher "Enable OSC" ist aktiviert
3. Neustarte VRChat wenn nötig

#### 3. Test-Signal funktioniert nicht
**Problem:** Selbst Test-Signal kommt nicht an.

**Lösung:**
```bash
# Sende Test-Signal
curl -X POST http://localhost:3000/api/osc/test \
  -H "Content-Type: application/json" \
  -d '{
    "address": "/avatar/parameters/Test",
    "value": 1
  }'
```

Prüfe im VRChat Avatar Debug Menu ob sich ein Parameter ändert.

---

## Performance-Probleme

### Symptome
- Hohe CPU-Auslastung
- Verzögerungen bei OSC-Nachrichten
- LTTH wird langsam

### Lösungen

#### 1. Message Batching deaktiviert
**Problem:** Jede Nachricht wird einzeln gesendet.

**Lösung:**
Aktiviere Message Batching in den Einstellungen:
```json
{
  "messageBatching": {
    "enabled": true,
    "batchWindow": 10
  }
}
```

#### 2. Zu viele Parameter werden überwacht
**Problem:** Live Monitoring von 300+ Parametern.

**Lösung:**
1. Deaktiviere Live Monitoring wenn nicht benötigt
2. Oder erhöhe das Update-Intervall:
   ```json
   {
     "liveMonitoring": {
       "enabled": true,
       "updateInterval": 500
     }
   }
   ```

#### 3. Zu viele PhysBones Animationen gleichzeitig
**Problem:** Mehrere 60 FPS Animationen gleichzeitig.

**Lösung:**
1. Stoppe alte Animationen bevor neue gestartet werden
2. Oder reduziere die Animationsdauer
3. Max. 2-3 gleichzeitige Animationen empfohlen

---

## Allgemeine Tipps

### Log-Level erhöhen
Für detailliertes Debugging, aktiviere Verbose Mode:
```json
{
  "verboseMode": true
}
```

### Logs prüfen
Logs befinden sich in:
- Windows: `%APPDATA%/LTTH/logs/oscBridge.log`
- Linux: `~/.config/LTTH/logs/oscBridge.log`

### Status prüfen
```bash
# Status abrufen
curl http://localhost:3000/api/osc/status

# Sollte zurückgeben:
{
  "success": true,
  "isRunning": true,
  "stats": {
    "messagesSent": 42,
    "messagesReceived": 13,
    ...
  }
}
```

### OSC-Bridge neustarten
1. Klicke auf "Stop" in der UI
2. Warte 2 Sekunden
3. Klicke auf "Start"

### VRChat neustarten
Manchmal hilft nur ein Neustart von VRChat:
1. Schließe VRChat
2. Starte VRChat neu
3. Aktiviere OSC wieder
4. Lade Avatar neu
5. Starte OSC-Bridge Discovery neu

---

## Weitere Hilfe

### Community
- GitHub Issues: https://github.com/mycommunity/ltth_desktop2/issues
- Discord: [Link zum Server]

### Logs einsenden
Wenn du Hilfe brauchst, sende bitte:
1. Die oscBridge.log Datei
2. Eine Beschreibung des Problems
3. Welche Schritte du bereits versucht hast
4. Deine OSC-Bridge Konfiguration (ohne sensible Daten)

### VRChat OSC Dokumentation
- Offizielle Docs: https://docs.vrchat.com/docs/osc-overview
- OSCQuery Spec: https://github.com/Vidvox/OSCQueryProposal
