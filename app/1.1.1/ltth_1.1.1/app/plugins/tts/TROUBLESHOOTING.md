# TTS Plugin - Fehlerbehebung (Troubleshooting)

## ✅ Behobene Probleme (2025-01-14)

### 1. **Stimmzuweisung funktioniert jetzt korrekt**
**Problem**: Voice wurde im GUI zugewiesen und in der Datenbank gespeichert, aber TTS nutzte nur die Standardstimme.

**Ursache**: Inkonsistente `userId` zwischen GUI-Zuweisung und TikTok-Events:
- TikTok-Events verwendeten: `data.userId || data.uniqueId`
- GUI-Zuweisung verwendete: `username`
- Resultat: Datenbank speicherte unter `username`, aber TTS suchte unter einer anderen `userId`

**Lösung**:
- TikTok `uniqueId` wird jetzt konsistent als primäre `userId` verwendet
- Sowohl in TikTok-Events als auch bei manueller Voice-Zuweisung
- `main.js:527` - Normalisierung der userId
- `tts-admin-production.js:508` - Verwendung von username als userId

### 2. **User-Suche entfernt**
**Problem**: User-Suche funktionierte nicht zuverlässig.

**Lösung**:
- User-Suchfeld aus dem UI entfernt
- Benutzer können jetzt direkt über die Filter-Buttons gefiltert werden
- Verbesserte Benutzer-Darstellung mit User ID und zugewiesener Engine

### 3. **Verbesserte User-Liste Anzeige**
**Änderungen**:
- User ID wird jetzt sichtbar angezeigt
- Engine wird bei zugewiesenen Stimmen angezeigt
- Bessere Debugging-Ausgaben in der Browser-Konsole

### 4. **Umfangreiches Debug-Logging**
**Neu**:
- SPEAK_STEP4 zeigt jetzt detaillierte Informationen:
  - Ob User Settings gefunden wurden
  - Zugewiesene Voice und Engine
  - User ID und Username
  - Alle relevanten Fallbacks

**Verwendung**:
1. Öffnen Sie das Admin Panel: `http://localhost:3000/plugins/tts/ui/admin-panel.html`
2. Gehen Sie zum Tab "🐛 Debug Logs"
3. Filtern Sie nach "SPEAK_STEP4" um Voice-Zuweisungs-Details zu sehen

## 🔧 Wie man Stimmen zuweist

### Schritt-für-Schritt Anleitung:

1. **TikTok-Username ermitteln**:
   - Der Username ist der `@username` auf TikTok
   - **WICHTIG**: Groß-/Kleinschreibung beachten!
   - Beispiel: Wenn TikTok zeigt `@MaxMustermann`, dann genau `MaxMustermann` eingeben

2. **Voice zuweisen im Admin Panel**:
   - Tab "User Management" öffnen
   - Unter "Manual Voice Assignment":
     - Username eingeben (z.B. `MaxMustermann`)
     - Engine auswählen (TikTok, Google, Speechify)
     - Voice auswählen
     - "Assign Voice" klicken

3. **Verifizierung**:
   - User sollte jetzt in der User-Liste erscheinen
   - Voice und Engine sollten angezeigt werden
   - User ist automatisch auf "Allowed" gesetzt

4. **Test**:
   - Lassen Sie den User im TikTok-Chat eine Nachricht schreiben
   - Gehen Sie zum "Debug Logs" Tab
   - Filtern Sie nach "SPEAK_STEP4"
   - Prüfen Sie:
     - `userSettingsFound: true`
     - `assignedVoice: [Ihre zugewiesene Voice]`
     - `selectedVoice: [Ihre zugewiesene Voice]`

## 🐛 Debugging-Tipps

### Problem: Voice wird nicht verwendet

1. **Prüfen Sie die Debug Logs** (Tab: Debug Logs):
   ```
   Filter: SPEAK_STEP4
   ```
   Schauen Sie nach:
   - `userSettingsFound`: Muss `true` sein
   - `userId` und `username`: Müssen mit dem TikTok-User übereinstimmen
   - `assignedVoice`: Muss Ihre zugewiesene Voice sein
   - `selectedVoice`: Sollte gleich `assignedVoice` sein

2. **Prüfen Sie die User-Liste**:
   - Ist der User in der Liste?
   - Ist die richtige Voice angezeigt?
   - Ist die richtige Engine angezeigt?

3. **Prüfen Sie die userId**:
   - Debug Logs → TIKTOK_EVENT
   - Schauen Sie nach `normalizedUserId` und `normalizedUsername`
   - Diese müssen mit der User ID in der User-Liste übereinstimmen

### Problem: User-Liste ist leer

**Ursache**: Users werden automatisch erstellt, wenn sie zum ersten Mal TTS verwenden.

**Lösung**:
- Stellen Sie sicher, dass `enabledForChat` aktiviert ist (Config Tab)
- Lassen Sie einen User im TikTok-Chat schreiben
- User sollte automatisch in der Liste erscheinen
- Oder: Weisen Sie manuell eine Voice zu (erstellt den User)

### Problem: API Keys funktionieren nicht

**Google Cloud TTS**:
1. API Key korrekt eingegeben?
2. Google Cloud TTS API aktiviert?
3. Billing-Account verknüpft?
4. Debug Logs → Filter: SPEAK_STEP5
   - Schauen Sie nach Fehlermeldungen

**Speechify**:
1. Gültiger API Key von https://speechify.com/api ?
2. Ausreichend Credits?
3. Debug Logs → Filter: SPEAK_STEP5

## 📊 Empfohlene Einstellungen

### Für beste Performance:

```javascript
{
  "defaultEngine": "tiktok",  // Kostenlos und zuverlässig
  "enabledForChat": true,
  "autoLanguageDetection": true,  // Erkennt Sprache automatisch
  "teamMinLevel": 0,  // Alle dürfen TTS nutzen
  "rateLimit": 3,  // Max 3 Nachrichten
  "rateLimitWindow": 60,  // Pro 60 Sekunden
  "maxTextLength": 300
}
```

### Für Premium-Qualität:

```javascript
{
  "defaultEngine": "speechify",  // oder "google"
  "defaultVoice": "george",  // Speechify's beste Stimme
  "enabledForChat": true,
  "autoLanguageDetection": false  // Manuelle Voice-Zuweisung bevorzugt
}
```

## 📝 Technische Details

### userId-Normalisierung (main.js:527):
```javascript
const userId = data.uniqueId || data.nickname || data.userId;
const username = data.uniqueId || data.nickname;
```

### Voice-Zuweisung-Logik (main.js:702-704):
```javascript
const userSettings = this.permissionManager.getUserSettings(userId);
let selectedEngine = engine || userSettings?.assigned_engine || this.config.defaultEngine;
let selectedVoice = voiceId || userSettings?.assigned_voice_id;
```

### Fallback-Kette:
1. Explizit angeforderte Voice (`voiceId` Parameter)
2. User's zugewiesene Voice (`userSettings.assigned_voice_id`)
3. Automatische Spracherkennung (wenn `autoLanguageDetection = true`)
4. Standard-Voice (`config.defaultVoice`)

## 🚀 Nächste Schritte

Nach dem Update:
1. ✅ Server neu starten
2. ✅ Admin Panel öffnen
3. ✅ Debug Logs Tab öffnen
4. ✅ Test-Nachricht im TikTok-Chat senden
5. ✅ SPEAK_STEP4 Logs prüfen
6. ✅ Voice manuell zuweisen
7. ✅ Erneut testen

## 📞 Support

Bei Problemen:
1. Browser-Konsole öffnen (F12)
2. Debug Logs Tab öffnen
3. Screenshots von relevanten Fehlermeldungen machen
4. Issue auf GitHub erstellen
