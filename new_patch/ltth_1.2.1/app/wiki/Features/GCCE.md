# Global Chat Command Engine (GCCE)

[← WebGPU Engine](WebGPU-Engine) | [→ Cloud Sync](Cloud-Sync)

---

## 📑 Inhaltsverzeichnis

1. [Übersicht](#übersicht)
2. [Features](#features)
3. [Architektur](#architektur)
4. [Plugin-Integration](#plugin-integration)
5. [Permission-System](#permission-system)
6. [Command-Registrierung](#command-registrierung)
7. [Verwendung](#verwendung)
8. [Beispiele](#beispiele)
9. [API-Reference](#api-reference)

---

## 🔍 Übersicht

Die **Global Chat Command Engine (GCCE)** ist ein universaler Chat-Command-Interpreter und Framework für Little TikTool Helper. Sie eliminiert die Notwendigkeit für einzelne Plugins, eigene Command-Parsing-, Validierungs- und Permission-Systeme zu implementieren.

**Status:** 🟡 Beta  
**Version:** 1.0.0  
**Plugin-ID:** `gcce`

### Hauptvorteile

✅ **Zentralisiert** - Eine einzige Command-Registry für alle Plugins  
✅ **Permission-basiert** - Hierarchisches Rollen-basiertes Zugriffssystem  
✅ **Auto-Validierung** - Automatische Argument-Validierung und Fehler-Messages  
✅ **Rate-Limiting** - Per-User und globales Rate-Limiting gegen Spam  
✅ **Statistiken** - Command-Usage-Tracking und Analytics  
✅ **Help-System** - Auto-generierte Help-Menüs und Dokumentation

---

## ✨ Features

### 1. Zentrales Command-Registry
Alle Chat-Commands werden zentral verwaltet. Plugins registrieren ihre Commands bei GCCE.

**Vorteile:**
- Keine Command-Kollisionen
- Übersicht über alle verfügbaren Commands
- Zentrale Command-Verwaltung

### 2. Permission-System
Hierarchisches Rollen-basiertes System mit 5 Levels:

```
broadcaster > moderator > vip > subscriber > all
```

Jeder Benutzer mit höherem Permission-Level kann Commands niedrigerer Levels ausführen.

### 3. Syntax-Validierung
Automatische Validierung von Command-Argumenten:

```javascript
{
  command: '!timer',
  args: [
    { name: 'action', type: 'string', required: true },
    { name: 'duration', type: 'number', required: false }
  ]
}
```

GCCE validiert automatisch:
- Argument-Anzahl
- Argument-Typen
- Required/Optional-Status

### 4. Rate-Limiting
Verhindert Spam durch:
- **Per-User Rate-Limiting** - Max. X Commands pro Minute pro User
- **Global Rate-Limiting** - Max. X Commands pro Minute insgesamt
- **Command-spezifisches Rate-Limiting** - Individuell konfigurierbar

### 5. Overlay-Integration
Unified Overlay-System für Command-Feedback:

```javascript
gcce.showOverlay({
  type: 'success',
  message: 'Timer gestartet!',
  duration: 3000
});
```

### 6. Statistik-Tracking
Automatisches Tracking von:
- Command-Usage (welcher Command wie oft)
- User-Activity (wer nutzt welche Commands)
- Success/Failure-Rate
- Response-Times

### 7. Help-System
Auto-generierte Help-Ausgabe:

```
!help                    → Alle Commands auflisten
!help <command>          → Details zu spezifischem Command
!commands                → Alias für !help
```

**Beispiel-Output:**
```
Verfügbare Commands:
!timer start <duration>  → Timer starten (Broadcaster, Mod)
!cam <1-5>              → Kamera wechseln (All)
!hud show <text>        → HUD-Text anzeigen (VIP+)
...
```

---

## 🏗️ Architektur

### Core-Komponenten

```
┌─────────────────────────────────────┐
│      Global Chat Command Engine     │
├─────────────────────────────────────┤
│  1. Command Registry                │
│     └─ Stores all commands          │
│                                     │
│  2. Command Parser                  │
│     └─ Parses chat & routes         │
│                                     │
│  3. Permission Checker              │
│     └─ Validates permissions        │
│                                     │
│  4. Rate Limiter                    │
│     └─ Prevents spam                │
│                                     │
│  5. Statistics Tracker              │
│     └─ Tracks usage                 │
└─────────────────────────────────────┘
           │
           ├──────────────┬──────────────┐
           ▼              ▼              ▼
    ┌──────────┐   ┌──────────┐  ┌──────────┐
    │ Plugin A │   │ Plugin B │  │ Plugin C │
    └──────────┘   └──────────┘  └──────────┘
```

### Data Flow

```
Chat Message → Parser → Permission Check → Rate Limit → Handler → Response
                  │            │                │           │
                  ▼            ▼                ▼           ▼
            Extract Args   Check Role      Check Quota   Execute
                                                           Action
```

---

## 🔌 Plugin-Integration

### Command registrieren

Plugins können Commands registrieren, indem sie auf die GCCE-Instanz zugreifen:

```javascript
// In Plugin's init() method
async init() {
  // GCCE-Instanz holen
  const gccePlugin = this.api.pluginLoader?.loadedPlugins?.get('gcce');
  
  if (gccePlugin?.instance) {
    const gcce = gccePlugin.instance;
    
    // Command registrieren
    gcce.registerCommand({
      command: '!mytimer',
      description: 'Starts a custom timer',
      usage: '!mytimer <duration>',
      permission: 'moderator',
      args: [
        {
          name: 'duration',
          type: 'number',
          required: true,
          description: 'Timer duration in seconds'
        }
      ],
      rateLimit: {
        maxCalls: 5,
        windowMs: 60000 // 5 calls per minute
      },
      handler: async (args, user, message) => {
        const duration = args[0];
        
        // Timer-Logic hier
        this.startTimer(duration);
        
        // Response zurückgeben
        return {
          success: true,
          message: `Timer gestartet: ${duration}s`
        };
      }
    });
  }
}
```

### Command deregistrieren

```javascript
async destroy() {
  const gcce = this.api.pluginLoader?.loadedPlugins?.get('gcce')?.instance;
  
  if (gcce) {
    gcce.unregisterCommand('!mytimer');
  }
}
```

---

## 🔒 Permission-System

### Permission-Hierarchie

```
Level 5: broadcaster  (Streamer selbst)
Level 4: moderator    (Mods)
Level 3: vip          (VIPs)
Level 2: subscriber   (Subs)
Level 1: all          (Alle Zuschauer)
```

**Vererbung:** Ein Broadcaster kann alle Commands ausführen, ein Moderator alle außer broadcaster-only, usw.

### Permission-Prüfung

GCCE prüft automatisch bei jedem Command:

```javascript
// Benutzer-Permission aus TikTok-Event-Daten
const userRole = getUserRole(user); // 'broadcaster', 'moderator', 'vip', 'subscriber', 'all'

// Command-Permission-Requirement
const commandPermission = command.permission; // z.B. 'moderator'

// Prüfung
if (!hasPermission(userRole, commandPermission)) {
  return {
    success: false,
    message: 'Insufficient permissions'
  };
}
```

### Custom Permission-Logic

Plugins können auch Custom-Permission-Checks implementieren:

```javascript
gcce.registerCommand({
  command: '!admin',
  permission: 'custom',
  customPermissionCheck: async (user) => {
    // Custom Logic
    const isAdmin = await checkAdminStatus(user.username);
    return isAdmin;
  },
  handler: async (args, user) => {
    // Admin-Command
  }
});
```

---

## 📝 Command-Registrierung

### Vollständiges Beispiel

```javascript
gcce.registerCommand({
  // Command-String (mit !)
  command: '!weather',
  
  // Beschreibung für Help-System
  description: 'Trigger weather effects',
  
  // Usage-String
  usage: '!weather <effect> [duration]',
  
  // Permission-Level
  permission: 'vip',
  
  // Argumente
  args: [
    {
      name: 'effect',
      type: 'string',
      required: true,
      description: 'Weather effect (rain, snow, storm)',
      choices: ['rain', 'snow', 'storm', 'fog']
    },
    {
      name: 'duration',
      type: 'number',
      required: false,
      default: 10,
      description: 'Duration in seconds'
    }
  ],
  
  // Rate-Limiting
  rateLimit: {
    maxCalls: 3,
    windowMs: 60000 // 3 calls per minute per user
  },
  
  // Global Rate-Limiting
  globalRateLimit: {
    maxCalls: 10,
    windowMs: 60000 // 10 calls per minute total
  },
  
  // Handler-Function
  handler: async (args, user, message) => {
    const [effect, duration = 10] = args;
    
    try {
      await triggerWeatherEffect(effect, duration);
      
      return {
        success: true,
        message: `${effect} effect triggered for ${duration}s`
      };
    } catch (error) {
      return {
        success: false,
        message: `Error: ${error.message}`
      };
    }
  },
  
  // Optional: Cooldown pro User
  cooldown: 5000, // 5 Sekunden
  
  // Optional: Aliases
  aliases: ['!wetter', '!wx']
});
```

---

## 🎮 Verwendung

### User-Perspektive (Chat)

**Command ausführen:**
```
!timer start 60
!cam 3
!hud show Hello World
!weather rain
```

**Help anfordern:**
```
!help
!help timer
!commands
```

**Beispiel-Dialog:**
```
User: !timer start 120
Bot:  Timer gestartet: 120 Sekunden

User: !weather rain 30
Bot:  Rain effect triggered for 30s

User: !help weather
Bot:  !weather <effect> [duration]
      Trigger weather effects (rain, snow, storm, fog)
      Permission: VIP+
      Cooldown: 5s
```

### Plugin-Perspektive

**Command empfangen:**
```javascript
// Wird automatisch von GCCE gecallt
handler: async (args, user, message) => {
  console.log('Command received from:', user.username);
  console.log('Arguments:', args);
  console.log('Full message:', message);
  
  // Logic hier
  
  return { success: true, message: 'Done!' };
}
```

---

## 💡 Beispiele

### Beispiel 1: Simple Timer-Command

```javascript
gcce.registerCommand({
  command: '!timer',
  description: 'Control stream timer',
  usage: '!timer <start|stop|pause|reset> [duration]',
  permission: 'moderator',
  args: [
    { name: 'action', type: 'string', required: true },
    { name: 'duration', type: 'number', required: false }
  ],
  handler: async (args, user) => {
    const [action, duration] = args;
    
    switch (action) {
      case 'start':
        if (!duration) {
          return { success: false, message: 'Duration required' };
        }
        startTimer(duration);
        return { success: true, message: `Timer started: ${duration}s` };
      
      case 'stop':
        stopTimer();
        return { success: true, message: 'Timer stopped' };
      
      case 'pause':
        pauseTimer();
        return { success: true, message: 'Timer paused' };
      
      case 'reset':
        resetTimer();
        return { success: true, message: 'Timer reset' };
      
      default:
        return { success: false, message: 'Unknown action' };
    }
  }
});
```

### Beispiel 2: HUD-Command mit Choices

```javascript
gcce.registerCommand({
  command: '!hud',
  description: 'Control HUD overlay',
  permission: 'vip',
  args: [
    {
      name: 'action',
      type: 'string',
      required: true,
      choices: ['show', 'hide', 'clear', 'image']
    },
    {
      name: 'content',
      type: 'string',
      required: false
    }
  ],
  handler: async (args, user) => {
    const [action, content] = args;
    
    switch (action) {
      case 'show':
        if (!content) {
          return { success: false, message: 'Text required' };
        }
        showHUD(content);
        return { success: true, message: `HUD: ${content}` };
      
      case 'hide':
        hideHUD();
        return { success: true, message: 'HUD hidden' };
      
      case 'clear':
        clearHUD();
        return { success: true, message: 'HUD cleared' };
      
      case 'image':
        if (!content) {
          return { success: false, message: 'URL required' };
        }
        showHUDImage(content);
        return { success: true, message: 'Image displayed' };
    }
  }
});
```

### Beispiel 3: Multi-Cam-Command

```javascript
gcce.registerCommand({
  command: '!cam',
  description: 'Switch camera',
  permission: 'all',
  args: [
    {
      name: 'camera',
      type: 'number',
      required: true,
      min: 1,
      max: 5
    }
  ],
  rateLimit: {
    maxCalls: 5,
    windowMs: 60000
  },
  handler: async (args, user) => {
    const [camera] = args;
    
    await switchCamera(camera);
    
    return {
      success: true,
      message: `Switched to Camera ${camera}`
    };
  }
});
```

---

## 🔌 API-Reference

### registerCommand(config)

Registriert einen neuen Chat-Command.

**Parameter:**
```typescript
interface CommandConfig {
  command: string;              // Command-String (z.B. '!timer')
  description: string;           // Beschreibung
  usage?: string;                // Usage-String
  permission: Permission;        // 'broadcaster', 'moderator', 'vip', 'subscriber', 'all'
  args?: Argument[];             // Argument-Definitionen
  rateLimit?: RateLimit;         // Per-User Rate-Limit
  globalRateLimit?: RateLimit;   // Global Rate-Limit
  cooldown?: number;             // Cooldown in ms
  aliases?: string[];            // Alternative Command-Namen
  handler: CommandHandler;       // Handler-Function
  customPermissionCheck?: (user) => Promise<boolean>;
}
```

### unregisterCommand(command)

Entfernt einen registrierten Command.

```javascript
gcce.unregisterCommand('!mytimer');
```

### getCommands()

Gibt alle registrierten Commands zurück.

```javascript
const commands = gcce.getCommands();
// [ { command: '!timer', ... }, { command: '!cam', ... }, ... ]
```

### getStatistics()

Gibt Command-Usage-Statistiken zurück.

```javascript
const stats = gcce.getStatistics();
// {
//   '!timer': { calls: 150, successes: 145, failures: 5 },
//   '!cam': { calls: 320, successes: 320, failures: 0 },
//   ...
// }
```

---

## 🔗 Weiterführende Ressourcen

### Plugin-Dokumentation
- **[[Plugin-Liste#gcce]]** - GCCE Plugin-Details
- **[[Plugin-Liste#gcce-hud-overlay]]** - GCCE HUD Overlay Plugin

### Verwandte Features
- **[[Features/WebGPU-Engine]]** - WebGPU Rendering Engine
- **[[modules/flows]]** - Event-Automation-System

### API-Reference
- **[[API-Reference]]** - Vollständige API-Dokumentation
- **[[Plugin-Dokumentation]]** - Plugin-Entwicklung

---

[← WebGPU Engine](WebGPU-Engine) | [→ Cloud Sync](Cloud-Sync)

---

*Letzte Aktualisierung: 2025-12-11*  
*Version: 1.2.1*
