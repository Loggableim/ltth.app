# LTTH Launcher - Architektur

## Übersicht

Der LTTH Launcher ist ein leichtgewichtiger Windows-Launcher, geschrieben in Go mit WebView2 für das UI. 

## Technologie-Stack

| Komponente | Technologie | Zweck |
|------------|-------------|-------|
| Backend | Go 1.21+ | Update-Logik, Dateisystem, HTTP |
| UI | WebView2 | Modernes HTML/CSS/JS Interface |
| Rendering | Edge Chromium | WebView2 Runtime |

## Komponenten

### main.go

Die komplette Anwendung ist in einer einzigen Go-Datei:

```
main.go
├── Configuration (LauncherConfig, VersionInfo)
├── Initialization (main, initLogging, loadConfig)
├── WebView Setup (createWindow, bindFunctions)
├── IPC Functions (getConfig, saveConfig, checkUpdates, ...)
├── Update Logic (downloadFile, extractZip, compareVersions)
├── UI (embedded HTML/CSS/JS)
└── Utilities (backupConfig, calculateSHA256)
```

### Embedded UI

Das komplette UI ist als String in Go eingebettet:

```go
var htmlUI = `<!DOCTYPE html>
<html>
...
</html>`
```

**Vorteile:**
- Einzelne EXE ohne externe Abhängigkeiten
- Schnellerer Start (kein File-I/O)
- Einfache Distribution

### IPC-Kommunikation

JavaScript ↔ Go Kommunikation über WebView2 Bindings:

```go
// Go-Seite
w.Bind("checkUpdates", func() string {
    // Logik
    return jsonString
})
```

```javascript
// JavaScript-Seite
const result = await checkUpdates();
const data = JSON.parse(result);
```

## Datenfluss

### Update-Prüfung

```
[Start] 
    ↓
[HTTP GET version.json]
    ↓
[Parse JSON]
    ↓
[Compare Versions]
    ↓
[Update Available?] → [Yes] → [Show Update Modal]
    ↓ No
[Show "Up to Date"]
```

### Installation

```
[User clicks "Install"]
    ↓
[Backup Config]
    ↓
[Download ZIP]
    ↓
[Extract to versions/<version>]
    ↓
[Update config.json]
    ↓
[Enable Start Button]
```

### App-Start

```
[User clicks "Start"]
    ↓
[Check installed version]
    ↓
[Find index.html or launch.js]
    ↓
[Open in Browser / Start Node.js]
    ↓
[Close Launcher]
```

## Speicherstruktur

```
%LOCALAPPDATA%\LTTH\
├── versions/
│   ├── 1.0.0/
│   │   └── [App Files]
│   ├── 1.1.0/
│   │   └── [App Files]
│   └── .temp/
│       └── [Download Temp]
├── config/
│   ├── .backup/
│   │   └── 20241203-120000/
│   └── [User Config Files]
└── launcher.log

%APPDATA%\ltth-launcher\
└── config.json (Launcher-Einstellungen)
```

## Sicherheitsmaßnahmen

### ZIP-Slip-Schutz

```go
// Prüft, ob extrahierte Pfade im Zielverzeichnis bleiben
if !strings.HasPrefix(fpath, filepath.Clean(dest)+string(os.PathSeparator)) {
    return fmt.Errorf("invalid file path: %s", fpath)
}
```

### HTTPS-Only

Alle HTTP-Anfragen gehen über HTTPS:

```go
const VersionURL = "https://raw.githubusercontent.com/..."
const AppZIPBaseURL = "https://ltth.app/app/"
```

### Keine Code-Injection

- WebView2 mit eingebettetem HTML (kein externes Laden)
- Kein `eval()` oder dynamisches Script-Laden
- Content Security Policy wird vom WebView2 verwaltet

## Performance

| Metrik | Wert |
|--------|------|
| Binary-Größe | ~5-10 MB |
| Startzeit | <1 Sekunde |
| RAM-Verbrauch | ~30 MB |
| Update-Check | ~500ms (Netzwerk) |

## Erweiterbarkeit

### Neue IPC-Funktion hinzufügen

1. Go-Funktion in `bindFunctions()`:
```go
w.Bind("myFunction", func(arg string) string {
    // Logik
    return `{"success": true}`
})
```

2. JavaScript-Aufruf:
```javascript
const result = await myFunction("argument");
```

### UI anpassen

Das eingebettete HTML in `htmlUI` bearbeiten. Nach Änderungen neu kompilieren.

## Build-Prozess

```
[Go Source] 
    ↓
[go build -ldflags="-H windowsgui -s -w"]
    ↓
[launcher.exe (~5-10 MB)]
```

Flags:
- `-H windowsgui`: Kein Konsolenfenster
- `-s`: Symbol-Tabelle entfernen
- `-w`: DWARF Debug-Infos entfernen
