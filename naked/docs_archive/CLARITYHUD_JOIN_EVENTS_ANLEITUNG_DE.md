# ClarityHUD Benutzer-Anleitung: Beitretende User anzeigen

## Zusammenfassung

Das ClarityHUD **bietet bereits die Option**, beitretende User (joining users) anzuzeigen. Diese Funktion ist **standardmäßig aktiviert** im Full Activity HUD.

## Wo finde ich die Einstellung?

### Schritt-für-Schritt Anleitung:

#### 1. Öffne das ClarityHUD Dashboard
- Navigiere zu: `http://localhost:PORT/clarityhud/ui`
- Du siehst zwei HUD-Optionen:
  - **Chat HUD** - Nur Chat-Nachrichten
  - **Full Activity HUD** - Alle Events inkl. beitretende User

#### 2. Öffne die Einstellungen für das Full Activity HUD
- Klicke auf den Button **"⚙️ Settings"** in der Karte "Vollständiges Aktivitäts-HUD"
- Ein Einstellungsdialog öffnet sich

#### 3. Navigiere zum Events-Tab
- Im Einstellungsdialog siehst du mehrere Tabs:
  - Appearance (Aussehen)
  - **Events** ← HIER!
  - Layout
  - Animation
  - Styling
  - Accessibility (Barrierefreiheit)

#### 4. Finde die "Show User Joins" Einstellung
Im **Events-Tab** findest du folgende Checkboxen:

```
Event Visibility
├─ ☑ Show Chat Messages
├─ ☑ Show Follows
├─ ☑ Show Shares
├─ ☑ Show Likes
├─ ☑ Show Gifts
├─ ☑ Show Subscriptions
├─ ☑ Show Treasure Chests
└─ ☑ Show User Joins  ← DIES IST DIE OPTION FÜR BEITRETENDE USER!
```

#### 5. Aktiviere oder Deaktiviere die Option
- Die Checkbox **"Show User Joins"** ist **standardmäßig aktiviert** (☑)
- Wenn du sie deaktivierst, werden keine beitretenden User mehr angezeigt
- Wenn du sie aktivierst, werden beitretende User mit einem 👋 Icon angezeigt

#### 6. Speichere die Einstellungen
- Klicke auf den Button **"Save Settings"** am unteren Rand
- Die Einstellungen werden gespeichert und sofort übernommen

## Wie sieht es im Overlay aus?

### Im Full Activity HUD Overlay:

Wenn ein User dem Stream beitritt, erscheint:

```
👋 TestUser Joined
```

Die Anzeige erfolgt zusammen mit anderen Events wie:
- 💬 Chat-Nachrichten
- ❤️ Follows
- 🔄 Shares
- 👍 Likes
- 🎁 Gifts
- ⭐ Subscriptions
- 💎 Treasure Chests
- 👋 Joins (beitretende User)

## Wichtige Hinweise:

### ⚠️ Nur im Full Activity HUD verfügbar!

Die Option "Show User Joins" ist **nur im Full Activity HUD** verfügbar, **nicht im Chat HUD**.

- ❌ **Chat HUD** (`/overlay/clarity/chat`): Zeigt nur Chat-Nachrichten
- ✅ **Full Activity HUD** (`/overlay/clarity/full`): Zeigt alle Events inkl. Joins

Das ist beabsichtigt! Das Chat HUD ist minimalistisch und zeigt nur Nachrichten.

### OBS Integration

Füge das Full Activity HUD zu OBS hinzu:

1. Erstelle eine neue **Browser-Quelle** in OBS
2. URL: `http://localhost:PORT/overlay/clarity/full`
3. Empfohlene Auflösung: 1920x1080 oder höher
4. Aktiviere Hardware-Beschleunigung im Browser-Source

### Test-Funktion

Du kannst die Anzeige testen:

1. Im ClarityHUD Dashboard
2. Klicke auf **"Test Event"** beim Full Activity HUD
3. Es werden Test-Events generiert, inkl. Join-Events

## Technische Details

- **Standardwert:** Aktiviert (`showJoins: true`)
- **Icon:** 👋 (waving hand)
- **Label:** "Joined"
- **WebSocket Event:** `clarityhud.update.join`
- **TikTok Event:** `join`

## Fehlerbehebung

### Problem: Ich sehe die Option nicht
**Lösung:** Stelle sicher, dass du die Einstellungen des **Full Activity HUD** öffnest, nicht des Chat HUD. Nur das Full Activity HUD hat einen "Events"-Tab.

### Problem: Join-Events werden nicht angezeigt
**Lösung:**
1. Überprüfe, ob die Checkbox "Show User Joins" aktiviert ist
2. Stelle sicher, dass du das Full Activity HUD Overlay verwendest (`/overlay/clarity/full`)
3. Teste mit dem "Test Event" Button
4. Überprüfe, ob TikTok überhaupt Join-Events sendet (nicht alle Streams erhalten diese)

### Problem: Zu viele Join-Events
**Lösung:** Deaktiviere die Checkbox "Show User Joins" in den Einstellungen, wenn du keine Join-Events sehen möchtest.

## Zusammenfassung

Die Funktion zum Anzeigen beitretender User ist:
- ✅ Vollständig implementiert
- ✅ Standardmäßig aktiviert
- ✅ Einfach zu finden (Events-Tab im Full HUD)
- ✅ Einfach zu (de)aktivieren
- ✅ Sofort wirksam nach dem Speichern

**Die Funktion existiert bereits und muss nicht neu entwickelt werden!**
