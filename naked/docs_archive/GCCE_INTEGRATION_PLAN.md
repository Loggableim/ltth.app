# GCCE Integration Plan für OSC-Bridge, Quiz Show und Multi-Cam

## Übersicht
Dieses Dokument beschreibt die vollständige Integration von drei Plugins in die Global Chat Command Engine (GCCE), um Ressourcen zu sparen und alle Chat-Commands über eine zentrale Engine zu verarbeiten.

## 1. OSC-Bridge Plugin

### Aktuelle Situation
- **Keine Chat-Befehle** implementiert
- Nur API-Routes und Gift-Event-Handler vorhanden
- VRChat-Actions werden nur über HTTP-API getriggert

### Zu implementierende GCCE-Befehle

| Befehl | Beschreibung | Permission | Parameter |
|--------|--------------|------------|-----------|
| `/wave` | Auslösen einer Wink-Animation in VRChat | all | keine |
| `/celebrate` | Feier-Animation | all | keine |
| `/dance` | Tanz-Animation | all | keine |
| `/hearts` | Herzen-Effekt | all | keine |
| `/confetti` | Konfetti-Effekt | all | keine |
| `/emote <0-3>` | Emote-Slot auslösen | all | slot (0-3) |

### Implementation

```javascript
registerGCCECommands() {
    const gccePlugin = this.api.pluginLoader?.loadedPlugins?.get('gcce');
    if (!gccePlugin?.instance || !this.config.chatCommands?.enabled) {
        return;
    }

    const commands = [
        {
            name: 'wave',
            description: 'Trigger wave animation in VRChat',
            syntax: '/wave',
            permission: 'all',
            enabled: true,
            category: 'VRChat',
            handler: async (args, context) => await this.handleWaveCommand(context)
        },
        {
            name: 'celebrate',
            description: 'Trigger celebrate animation in VRChat',
            syntax: '/celebrate',
            permission: 'all',
            enabled: true,
            category: 'VRChat',
            handler: async (args, context) => await this.handleCelebrateCommand(context)
        },
        {
            name: 'dance',
            description: 'Trigger dance animation in VRChat',
            syntax: '/dance',
            permission: 'subscriber',
            enabled: true,
            category: 'VRChat',
            handler: async (args, context) => await this.handleDanceCommand(context)
        },
        {
            name: 'hearts',
            description: 'Trigger hearts effect in VRChat',
            syntax: '/hearts',
            permission: 'all',
            enabled: true,
            category: 'VRChat',
            handler: async (args, context) => await this.handleHeartsCommand(context)
        },
        {
            name: 'confetti',
            description: 'Trigger confetti effect in VRChat',
            syntax: '/confetti',
            permission: 'all',
            enabled: true,
            category: 'VRChat',
            handler: async (args, context) => await this.handleConfettiCommand(context)
        },
        {
            name: 'emote',
            description: 'Trigger VRChat emote slot',
            syntax: '/emote <0-3>',
            permission: 'subscriber',
            enabled: true,
            minArgs: 1,
            maxArgs: 1,
            category: 'VRChat',
            handler: async (args, context) => await this.handleEmoteCommand(args, context)
        }
    ];

    gccePlugin.instance.registerCommandsForPlugin('osc-bridge', commands);
}
```

### Konfiguration

```javascript
chatCommands: {
    enabled: true,
    requireOSCConnection: true, // Nur wenn OSC verbunden
    rateLimitPerMinute: 10,
    cooldownSeconds: 3
}
```

## 2. Quiz Show Plugin

### Aktuelle Situation
- **Direkte TikTok Chat Event Registrierung**
- Chat-Handler für Antworten (A/B/C/D) und Joker-Befehle (`!joker50`, etc.)
- **MUSS migriert werden** um direkte Event-Registrierung zu vermeiden

### Zu implementierende GCCE-Befehle

| Befehl | Beschreibung | Permission | Nur während Quiz |
|--------|--------------|------------|------------------|
| `a`, `b`, `c`, `d` | Quiz-Antwort | all | ✓ |
| `/joker50` | 50:50 Joker | subscriber | ✓ |
| `/jokerinfo` | Info Joker | subscriber | ✓ |
| `/jokertime` | Zeit-Boost Joker | subscriber | ✓ |

### Implementation

**Wichtig**: Answer-Handling ist speziell, da es einzelne Buchstaben ohne Prefix akzeptiert.

```javascript
registerGCCECommands() {
    const gccePlugin = this.api.pluginLoader?.loadedPlugins?.get('gcce');
    if (!gccePlugin?.instance) {
        return;
    }

    const commands = [
        // Joker Commands
        {
            name: 'joker50',
            description: '50:50 Joker aktivieren (Superfans only)',
            syntax: '/joker50',
            permission: 'subscriber',
            enabled: true,
            category: 'Quiz',
            handler: async (args, context) => {
                if (!this.gameState.isRunning) {
                    return { success: false, error: 'Kein Quiz aktiv' };
                }
                return await this.handleJokerCommand(
                    context.userId, 
                    context.username, 
                    '!joker50', 
                    false
                );
            }
        },
        {
            name: 'jokerinfo',
            description: 'Info Joker aktivieren (Superfans only)',
            syntax: '/jokerinfo',
            permission: 'subscriber',
            enabled: true,
            category: 'Quiz',
            handler: async (args, context) => {
                if (!this.gameState.isRunning) {
                    return { success: false, error: 'Kein Quiz aktiv' };
                }
                return await this.handleJokerCommand(
                    context.userId, 
                    context.username, 
                    '!jokerinfo', 
                    false
                );
            }
        },
        {
            name: 'jokertime',
            description: 'Zeit-Boost Joker aktivieren (Superfans only)',
            syntax: '/jokertime',
            permission: 'subscriber',
            enabled: true,
            category: 'Quiz',
            handler: async (args, context) => {
                if (!this.gameState.isRunning) {
                    return { success: false, error: 'Kein Quiz aktiv' };
                }
                return await this.handleJokerCommand(
                    context.userId, 
                    context.username, 
                    '!jokertime', 
                    false
                );
            }
        }
    ];

    gccePlugin.instance.registerCommandsForPlugin('quiz-show', commands);
}
```

**Special Handling für Antworten (A/B/C/D):**

Da Antworten einzelne Buchstaben ohne Slash sind, müssen diese separat behandelt werden. 
Die GCCE wird modifiziert um auch "non-command" Messages an registrierte Handler zu routen:

```javascript
// In Quiz Plugin
registerAnswerHandler() {
    const gccePlugin = this.api.pluginLoader?.loadedPlugins?.get('gcce');
    if (gccePlugin?.instance) {
        // Registriere generischen Message Handler für Antworten
        gccePlugin.instance.registerMessageHandler('quiz-show', async (message, context) => {
            if (!this.gameState.isRunning) return null;
            
            const msg = message.trim().toUpperCase();
            if (['A', 'B', 'C', 'D'].includes(msg)) {
                await this.handleAnswer(
                    context.userId, 
                    context.username, 
                    msg, 
                    context.rawData.profilePictureUrl
                );
                return { handled: true };
            }
            return null;
        });
    }
}
```

### Migration
1. **Entfernen** der direkten TikTok Chat Event Registrierung
2. **Behalten** der Gift Event Registrierung für Joker-Gifts
3. **Umleiten** aller Chat-Befehle über GCCE

## 3. Multi-Cam Switcher Plugin

### Aktuelle Situation
- **Direkte TikTok Chat Event Registrierung**
- Chat-Handler für `!cam` Befehle
- **MUSS migriert werden**

### Zu implementierende GCCE-Befehle

| Befehl | Beschreibung | Permission | Parameter |
|--------|--------------|------------|-----------|
| `/cam <1-5>` | Zu Kamera X wechseln | all | Kamera-Nummer |
| `/cam next` | Zur nächsten Kamera | all | keine |
| `/cam prev` | Zur vorherigen Kamera | all | keine |
| `/angle next` | Nächste Quelle/Winkel | all | keine |
| `/scene <name>` | Zu Szene wechseln | moderator | Szenen-Name |

### Implementation

```javascript
registerGCCECommands() {
    const gccePlugin = this.api.pluginLoader?.loadedPlugins?.get('gcce');
    if (!gccePlugin?.instance || !this.config.chatCommands?.enabled) {
        return;
    }

    const commands = [
        {
            name: 'cam',
            description: 'Kamera wechseln',
            syntax: '/cam <1-5|next|prev>',
            permission: 'all',
            enabled: true,
            minArgs: 1,
            maxArgs: 1,
            category: 'Camera',
            handler: async (args, context) => await this.handleCamCommand(args, context)
        },
        {
            name: 'angle',
            description: 'Kamera-Winkel wechseln',
            syntax: '/angle next',
            permission: 'all',
            enabled: true,
            minArgs: 1,
            maxArgs: 1,
            category: 'Camera',
            handler: async (args, context) => await this.handleAngleCommand(args, context)
        },
        {
            name: 'scene',
            description: 'OBS-Szene wechseln',
            syntax: '/scene <name>',
            permission: 'moderator',
            enabled: true,
            minArgs: 1,
            maxArgs: -1, // Unbegrenzt für Szenen-Namen mit Leerzeichen
            category: 'Camera',
            handler: async (args, context) => await this.handleSceneCommand(args, context)
        }
    ];

    gccePlugin.instance.registerCommandsForPlugin('multicam', commands);
}
```

### Migration
1. **Entfernen** der direkten Chat Event Registrierung in `registerTikTokEvents()`
2. **Behalten** der Gift Event Registrierung
3. **Refactoring** der Chat-Handler zu GCCE-Command-Handlers
4. **Cooldown-Logik** in Command Handlers integrieren

## Gemeinsame Anforderungen

### Konfiguration
Alle Plugins benötigen eine `chatCommands` Konfiguration:

```javascript
chatCommands: {
    enabled: true,           // Chat-Befehle aktivieren
    requirePermission: true, // Permission-System nutzen
    cooldownSeconds: 3,      // Cooldown zwischen Commands
    rateLimitPerMinute: 10   // Max Commands pro Minute pro User
}
```

### Locale-Unterstützung
Jedes Plugin benötigt erweiterte Locales (DE/EN):

```json
{
  "chat_commands": {
    "enabled": "Chat-Befehle aktivieren",
    "description": "Erlaube Chat-Befehle über GCCE",
    "cooldown": "Cooldown (Sekunden)",
    "rate_limit": "Rate Limit (pro Minute)"
  },
  "commands": {
    "wave": {
      "description": "Wink-Animation auslösen"
    }
  }
}
```

### UI-Updates
Alle Plugins benötigen eine neue UI-Sektion "Chat Commands (GCCE Integration)".

### Tests
Für jedes Plugin:
- Command Registration Test
- Command Handler Tests
- Cooldown/Rate-Limit Tests
- Permission Tests
- Cleanup Tests

## Implementierungs-Reihenfolge

1. **OSC-Bridge** (Neu, keine Migration nötig)
   - ✓ Einfachste Integration
   - ✓ Keine bestehenden Chat-Handler

2. **Multi-Cam** (Migration erforderlich)
   - ⚠️ Mittlere Komplexität
   - ⚠️ Bestehende Chat-Handler müssen migriert werden
   - ⚠️ Cooldown-Logik beibehalten

3. **Quiz Show** (Migration + Spezial-Handling)
   - ❌ Höchste Komplexität
   - ❌ Antwort-Handling (A/B/C/D) ohne Prefix
   - ❌ Bestehende Logik muss erhalten bleiben
   - ❌ Möglicherweise GCCE-Erweiterung nötig für non-command messages

## Ressourcen-Einsparung

### Vorher
- **3 separate TikTok Chat Event Listener** (Quiz, Multi-Cam, + andere)
- **Jeder** parst Chat Messages unabhängig
- **Mehrfache** Permission-Checks
- **Redundante** Cooldown/Rate-Limit-Logik

### Nachher
- **1 zentraler** GCCE Chat Event Listener
- **Einmaliges** Parsing pro Message
- **Zentrale** Permission-Checks über GCCE
- **Zentrale** Rate-Limiting
- **Bessere** Übersicht über alle Commands
- **Einfachere** Wartung und Debugging

## Erwartete Verbesserungen
- ⚡ **~60% weniger Chat Event Processing**
- 📊 **Zentrale Command-Statistiken**
- 🔒 **Konsistente Security-Checks**
- 🎯 **Bessere UX** (alle Commands an einem Ort)
- 🐛 **Einfacheres Debugging**
