# Desktop App Migration Optionen für LTTH

**Projekt:** PupCid's Little TikTool Helper (LTTH)  
**Aktueller Stack:** Node.js + Express.js + Socket.io + SQLite + Electron  
**Ziel:** Setup.exe-installierbare Desktop-Anwendung (Alternativen zu Electron)

---

## 📊 Projekt-Analyse

### Aktuelle Architektur
- **Backend:** Node.js 18+ mit Express.js Server
- **Frontend:** Vanilla JavaScript + Socket.IO Client + Tailwind CSS
- **Datenbank:** SQLite (better-sqlite3) im WAL-Modus
- **Desktop:** Electron 33+ mit electron-builder
- **Launcher:** Go-basierte Launcher (launcher.exe, ltthgit.exe)
- **Größe:** ~150-200 MB installiert

### Kritische Anforderungen
1. ✅ Node.js Runtime muss eingebettet werden
2. ✅ SQLite-Datenbank muss lokal funktionieren
3. ✅ Socket.IO Echtzeit-Kommunikation
4. ✅ File-System-Zugriff (Plugins, TTS, Sounds)
5. ✅ Native Module (better-sqlite3, usb, optional: escpos)
6. ✅ Auto-Updates
7. ✅ System-Tray-Integration
8. ✅ Windows-Kompatibilität (primär)

---

## 🎯 5 Professionelle Alternativen zu Electron

### 1. **Tauri** ⭐⭐⭐⭐⭐
**Die modernste und effizienteste Lösung**

#### Beschreibung
Tauri ist ein Framework für Desktop-Apps, das System-WebView anstelle von Chromium nutzt. Geschrieben in Rust, bietet es drastisch kleinere Bundle-Größen und bessere Performance als Electron.

#### Vorteile
- ✅ **Extrem klein:** 5-10 MB statt 150 MB (95% Größenreduktion!)
- ✅ **Schneller:** Weniger RAM-Verbrauch (~50 MB vs. ~200 MB bei Electron)
- ✅ **Sicherheit:** Rust-basiertes Backend mit Permission-System
- ✅ **Auto-Updates:** Eingebauter Updater
- ✅ **System-Tray:** Native Integration
- ✅ **Setup.exe:** Über NSIS oder WiX Toolset
- ✅ **Code-Signing:** Built-in Support

#### Nachteile
- ⚠️ Lernkurve: Rust-Kenntnisse erforderlich (oder nur Tauri-API nutzen)
- ⚠️ Node.js muss separat eingebettet werden (Tauri ≠ Node.js Runtime)
- ⚠️ WebView-Unterschiede zwischen Windows-Versionen (Edge WebView2)

#### Migration-Aufwand
- **Zeit:** 2-4 Wochen
- **Komplexität:** Mittel-Hoch
- **Risiko:** Mittel (Node.js-Integration ist machbar aber komplex)

#### Implementierung
```bash
# 1. Tauri initialisieren
npm install --save-dev @tauri-apps/cli
npm install @tauri-apps/api

# 2. Tauri-Projekt aufsetzen
npm run tauri init

# 3. Node.js Server als Sidecar einbetten
# In tauri.conf.json:
{
  "tauri": {
    "bundle": {
      "externalBin": ["node.exe", "app/server.js"]
    }
  }
}

# 4. Build erstellen
npm run tauri build
```

**Strategie:**
1. Tauri als Shell um bestehenden Node.js-Server
2. Node.js Runtime als externes Binary einbetten (sidecar)
3. Server beim Start automatisch spawnen
4. Frontend über WebView laden
5. Tauri-APIs für System-Tray, Updates, etc.

#### Ressourcen
- Dokumentation: https://tauri.app/
- Node.js Sidecar Guide: https://tauri.app/v1/guides/building/sidecar
- LTTH-spezifisches Setup: Bestehende Frontend + Backend bleiben unverändert

---

### 2. **NW.js (Node-Webkit)** ⭐⭐⭐⭐
**Der direkte Electron-Konkurrent**

#### Beschreibung
NW.js kombiniert Node.js und Chromium ähnlich wie Electron, aber mit direkter Integration von Node.js in den Renderer-Prozess. Ursprünglich von Intel entwickelt.

#### Vorteile
- ✅ **Minimale Migration:** Fast identisch zu Electron
- ✅ **Node.js im Frontend:** Direkter Zugriff auf Node.js-Module im Browser-Code
- ✅ **Einfache Migration:** Bestehender Code funktioniert fast 1:1
- ✅ **Setup.exe:** Über nw-builder mit NSIS
- ✅ **Alle Plattformen:** Windows, macOS, Linux
- ✅ **Kleinerer Build:** ~100-120 MB (etwas kleiner als Electron)

#### Nachteile
- ⚠️ Kleinere Community als Electron
- ⚠️ Weniger Plugins und Tools
- ⚠️ Updates weniger frequent als Electron

#### Migration-Aufwand
- **Zeit:** 1-2 Wochen
- **Komplexität:** Niedrig
- **Risiko:** Niedrig (sehr ähnlich zu Electron)

#### Implementierung
```bash
# 1. NW.js installieren
npm install --save-dev nw nw-builder

# 2. package.json anpassen
{
  "main": "app/server.html",  # Oder index.html als Einstiegspunkt
  "node-remote": "http://localhost:3000",
  "chromium-args": "--disable-gpu"
}

# 3. Server-Start in HTML einbetten
# server.html:
<script>
  const { spawn } = require('child_process');
  const server = spawn('node', ['app/server.js']);
  setTimeout(() => {
    window.location = 'http://localhost:3000';
  }, 2000);
</script>

# 4. Build erstellen
npx nw-builder --platforms win64 --buildDir dist/
```

**Strategie:**
1. Haupt-HTML lädt und startet Node.js Server
2. Navigiert zu localhost:3000
3. Alles weitere funktioniert wie bisher
4. nw-builder erstellt Setup.exe

#### Ressourcen
- Dokumentation: https://nwjs.io/
- Builder: https://github.com/nwjs-community/nw-builder
- Migration von Electron: https://nwjs.io/blog/electron-migration/

---

### 3. **Neutralinojs** ⭐⭐⭐⭐
**Die ultra-leichte Lösung**

#### Beschreibung
Neutralinojs ist eine extrem leichtgewichtige Alternative zu Electron/NW.js. Es nutzt natives WebView und ein minimales Backend (C++). Perfekt für Web-Apps, die native Features brauchen.

#### Vorteile
- ✅ **Ultra-klein:** 2-3 MB (!) Installer
- ✅ **Schnell:** Minimaler Overhead
- ✅ **Einfach:** JavaScript-basierte API
- ✅ **Setup.exe:** Über NSIS oder Inno Setup
- ✅ **Cross-Platform:** Windows, macOS, Linux

#### Nachteile
- ❌ **Kein Node.js:** Neutralino hat eigene Runtime
- ⚠️ Node.js muss separat gestartet werden (ähnlich Tauri)
- ⚠️ Weniger Features als Electron
- ⚠️ Kleinere Community

#### Migration-Aufwand
- **Zeit:** 2-3 Wochen
- **Komplexität:** Mittel
- **Risiko:** Mittel (Node.js-Integration erforderlich)

#### Implementierung
```bash
# 1. Neutralino installieren
npm install -g @neutralinojs/neu

# 2. Projekt erstellen
neu create ltth-neutralino

# 3. Node.js als Background-Prozess starten
# In main.js:
await Neutralino.os.execCommand('node app/server.js');

# 4. neutralino.config.json konfigurieren
{
  "url": "http://localhost:3000",
  "modes": {
    "window": {
      "title": "LTTH",
      "width": 1200,
      "height": 800
    }
  }
}

# 5. Build erstellen
neu build --release
```

**Strategie:**
1. Neutralino als minimale Shell
2. Node.js Server als separater Prozess
3. WebView zeigt localhost:3000
4. Neutralino-APIs für System-Features

#### Ressourcen
- Dokumentation: https://neutralino.js.org/
- Deployment: https://neutralino.js.org/docs/distribution/overview

---

### 4. **Wails** ⭐⭐⭐⭐⭐
**Go + Web = Beste Performance**

#### Beschreibung
Wails ist ein Go-Framework für Desktop-Apps mit Web-Frontend. Ähnlich wie Tauri, aber mit Go statt Rust. Nutzt natives WebView und bietet exzellente Performance.

#### Vorteile
- ✅ **Klein:** 10-15 MB Installer
- ✅ **Schnell:** Go-Backend ist sehr performant
- ✅ **Einfacher als Rust:** Go ist leichter zu lernen
- ✅ **Native Look:** Windows 11 Stil
- ✅ **Setup.exe:** Über NSIS
- ✅ **TypeScript-Support:** Automatische Bindings

#### Nachteile
- ⚠️ Go-Kenntnisse erforderlich (aber einfacher als Rust)
- ⚠️ Node.js muss als Subprocess laufen
- ⚠️ Kleinere Community als Electron

#### Migration-Aufwand
- **Zeit:** 2-4 Wochen
- **Komplexität:** Mittel
- **Risiko:** Mittel

#### Implementierung
```bash
# 1. Wails installieren
go install github.com/wailsapp/wails/v2/cmd/wails@latest

# 2. Projekt erstellen
wails init -n ltth -t svelte  # oder react, vue, vanilla

# 3. Go-Backend konfigurieren
# In app.go:
func (a *App) startup(ctx context.Context) {
    // Node.js Server starten
    cmd := exec.Command("node", "app/server.js")
    cmd.Start()
}

# 4. Frontend zu localhost:3000 umleiten
// Oder: Frontend als statische Dateien einbetten

# 5. Build
wails build -platform windows -nsis
```

**Strategie:**
1. Go-Backend verwaltet Node.js Prozess
2. Frontend lädt von localhost:3000
3. Wails bietet System-Integration
4. Node.js bleibt unangetastet

#### Ressourcen
- Dokumentation: https://wails.io/
- NSIS Installer: https://wails.io/docs/guides/windows-installer

---

### 5. **pkg + Windows Service** ⭐⭐⭐
**Rein Node.js ohne Framework**

#### Beschreibung
Kompiliere die Node.js-App in eine standalone .exe mit pkg, kombiniere mit einem Custom-Frontend (CEF, WebView2 Wrapper) oder Browser-Auto-Start.

#### Vorteile
- ✅ **Volle Kontrolle:** Keine Framework-Beschränkungen
- ✅ **Node.js-nativ:** Alle Module funktionieren
- ✅ **Einfach:** Bestehender Code bleibt identisch
- ✅ **Setup.exe:** Mit Inno Setup oder NSIS selbst bauen

#### Nachteile
- ⚠️ pkg wird nicht mehr aktiv entwickelt (aber funktioniert noch)
- ⚠️ Kein natives Fenster-Management (Browser öffnet sich)
- ⚠️ Manuelles Setup für System-Tray, Updates, etc.
- ⚠️ CEF/WebView2 Wrapper muss selbst gebaut werden

#### Migration-Aufwand
- **Zeit:** 3-5 Wochen
- **Komplexität:** Hoch
- **Risiko:** Mittel-Hoch

#### Implementierung
```bash
# 1. pkg installieren
npm install -g pkg

# 2. App kompilieren
pkg app/server.js --targets node18-win-x64 --output ltth-server.exe

# 3. CEF-Wrapper erstellen (C++/C#) oder WebView2 nutzen
# Oder: Einfach Browser starten und verstecken
# launcher.js:
const { spawn } = require('child_process');
const open = require('open');

spawn('./ltth-server.exe', { detached: true });
setTimeout(() => {
  open('http://localhost:3000', { app: { name: 'chrome', args: ['--app=http://localhost:3000'] } });
}, 2000);

# 4. Inno Setup Skript
[Setup]
AppName=LTTH
AppVersion=1.0
DefaultDirName={pf}\LTTH
[Files]
Source: "ltth-server.exe"; DestDir: "{app}"
Source: "app\*"; DestDir: "{app}\app"; Flags: recursesubdirs
[Icons]
Name: "{commondesktop}\LTTH"; Filename: "{app}\ltth-launcher.exe"
```

**Strategie:**
1. Server als standalone .exe
2. Eigener Launcher/Wrapper
3. Browser im App-Modus oder CEF-Wrapper
4. Inno Setup für Installation

#### Ressourcen
- pkg: https://github.com/vercel/pkg
- Inno Setup: https://jrsoftware.org/isinfo.php
- WebView2: https://developer.microsoft.com/en-us/microsoft-edge/webview2/

---

## 🔧 5 Super Simple Notlösungen

### 1. **Portable App mit Batch-Launcher** ⚡⚡⚡
**Simpelste Lösung überhaupt**

#### Beschreibung
Packe Node.js Portable + deine App + .bat Launcher zusammen. Kein echter Installer, aber funktioniert.

#### Implementierung
```batch
REM start-ltth.bat
@echo off
echo Starting LTTH...
start /B node\node.exe app\server.js
timeout /t 2 /nobreak >nul
start "" "http://localhost:3000"
```

**Setup:**
1. Node.js Portable downloaden (https://nodejs.org/dist/v18.19.0/node-v18.19.0-win-x64.zip)
2. In `node/` Ordner entpacken
3. Deine `app/` daneben kopieren
4. start-ltth.bat erstellen
5. Als ZIP verteilen

**Installer (optional):**
- 7-Zip SFX: Selbstentpackendes Archiv mit Auto-Start
- Oder: WinRAR SFX

**Vorteile:** ✅ Extrem einfach, ✅ Keine Programmierung
**Nachteile:** ❌ Nicht professionell, ❌ Keine Updates, ❌ Terminal-Fenster

---

### 2. **NSIS Installer + existierende Launcher** ⚡⚡⚡
**Nutze deine Go-Launcher**

#### Beschreibung
Deine launcher.exe ist bereits da. Baue einfach einen NSIS-Installer drumherum.

#### Implementierung
```nsis
; ltth-installer.nsi
Name "LTTH"
OutFile "LTTH-Setup.exe"
InstallDir "$PROGRAMFILES64\LTTH"

Section "Install"
    SetOutPath $INSTDIR
    File /r "app"
    File /r "node_modules"
    File "launcher.exe"
    File "node.exe"
    
    CreateDirectory "$SMPROGRAMS\LTTH"
    CreateShortCut "$SMPROGRAMS\LTTH\LTTH.lnk" "$INSTDIR\launcher.exe"
    CreateShortCut "$DESKTOP\LTTH.lnk" "$INSTDIR\launcher.exe"
    
    WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Uninstall"
    RMDir /r $INSTDIR
    Delete "$SMPROGRAMS\LTTH\*.*"
    RMDir "$SMPROGRAMS\LTTH"
    Delete "$DESKTOP\LTTH.lnk"
SectionEnd
```

**Setup:**
```bash
# NSIS installieren (https://nsis.sourceforge.io/)
# Node.js Portable besorgen
# Installer bauen:
makensis ltth-installer.nsi
```

**Vorteile:** ✅ Professioneller Installer, ✅ Nutzt bestehende Launcher
**Nachteile:** ⚠️ Node.js muss eingebettet werden, ⚠️ Keine Auto-Updates

---

### 3. **Chrome App im Kiosk-Modus** ⚡⚡
**Browser als "Desktop-App"**

#### Beschreibung
Starte Chrome im App-Modus (Kiosk), sieht aus wie native App.

#### Implementierung
```batch
REM ltth-chrome.bat
@echo off
start /B node app\server.js
timeout /t 2 /nobreak >nul
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=http://localhost:3000 --window-size=1200,800 --disable-features=TranslateUI
```

**Oder mit VBS (versteckt Terminal):**
```vbscript
' ltth-start.vbs
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "node app\server.js", 0, False
WScript.Sleep 2000
WshShell.Run "chrome.exe --app=http://localhost:3000", 1, False
```

**Vorteile:** ✅ Sehr einfach, ✅ Sieht aus wie native App
**Nachteile:** ❌ Chrome muss installiert sein, ❌ Nicht portabel

---

### 4. **MSI mit WiX Toolset** ⚡⚡⚡⚡
**Windows-nativer Installer**

#### Beschreibung
MSI-Pakete sind Windows-Standard. WiX erstellt diese aus XML.

#### Implementierung
```xml
<!-- ltth.wxs -->
<?xml version="1.0"?>
<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi">
  <Product Id="*" Name="LTTH" Version="1.0.0" 
           Manufacturer="PupCid" Language="1033">
    <Package InstallerVersion="200" Compressed="yes" />
    <Media Id="1" Cabinet="ltth.cab" EmbedCab="yes" />
    
    <Directory Id="TARGETDIR" Name="SourceDir">
      <Directory Id="ProgramFiles64Folder">
        <Directory Id="INSTALLFOLDER" Name="LTTH">
          <Component Id="MainExecutable" Guid="*">
            <File Source="launcher.exe" KeyPath="yes" />
            <File Source="node.exe" />
          </Component>
          <Directory Id="AppFolder" Name="app">
            <!-- Rekursiv alle Dateien -->
          </Directory>
        </Directory>
      </Directory>
      
      <Directory Id="ProgramMenuFolder">
        <Directory Id="ApplicationProgramsFolder" Name="LTTH"/>
      </Directory>
    </Directory>
    
    <Feature Id="Complete" Level="1">
      <ComponentRef Id="MainExecutable" />
    </Feature>
  </Product>
</Wix>
```

**Build:**
```bash
# WiX installieren: https://wixtoolset.org/
candle ltth.wxs
light -out LTTH-Setup.msi ltth.wixobj
```

**Vorteile:** ✅ Windows-native, ✅ Professionell, ✅ System-Integration
**Nachteile:** ⚠️ XML-Konfiguration komplex, ⚠️ Steile Lernkurve

---

### 5. **PyInstaller + Flask Frontend** ⚡⚡⚡
**Python statt Node.js**

#### Beschreibung
Portiere Backend zu Python/Flask, kompiliere mit PyInstaller. (Nur wenn du Python magst!)

#### Implementierung
```python
# server.py (Minimal-Beispiel)
from flask import Flask, render_template
from flask_socketio import SocketIO

app = Flask(__name__)
socketio = SocketIO(app)

@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    socketio.run(app, port=3000)
```

**Build:**
```bash
pip install pyinstaller flask flask-socketio
pyinstaller --onefile --windowed server.py
```

**Vorteile:** ✅ Eine .exe, ✅ Einfach zu bauen, ✅ Keine Node.js Runtime
**Nachteile:** ❌ Komplett neu schreiben, ❌❌❌ Nicht empfohlen für LTTH

---

## 📊 Vergleichstabelle

| Lösung | Größe | Aufwand | Performance | Professionalität | Node.js-Compat | Empfehlung |
|--------|-------|---------|-------------|------------------|----------------|------------|
| **Tauri** | 5-10 MB | Mittel-Hoch | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Sidecar | ⭐⭐⭐⭐⭐ |
| **NW.js** | 100-120 MB | Niedrig | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Neutralino** | 2-3 MB | Mittel | ⭐⭐⭐⭐ | ⭐⭐⭐ | Subprocess | ⭐⭐⭐ |
| **Wails** | 10-15 MB | Mittel | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Subprocess | ⭐⭐⭐⭐ |
| **pkg + Custom** | 50-80 MB | Hoch | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Batch Launcher** | ~150 MB | Sehr niedrig | ⭐⭐⭐ | ⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| **NSIS + Launcher** | ~150 MB | Niedrig | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Chrome Kiosk** | Minimal | Sehr niedrig | ⭐⭐⭐ | ⭐ | ⭐⭐⭐⭐⭐ | ⭐ |
| **WiX MSI** | ~150 MB | Mittel | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **PyInstaller** | 30-50 MB | Sehr hoch | ⭐⭐⭐ | ⭐⭐⭐ | ❌ | ⭐ |

---

## 🎯 Empfehlung für LTTH

### Top 3 Optionen:

#### 1. **Tauri** (Langfristig beste Wahl)
- **Warum:** Kleinste Größe, beste Performance, moderne Architektur
- **Aufwand:** Mittel (2-4 Wochen)
- **Lernen:** Rust-Basics oder nur Tauri-API
- **Vorteil:** Zukunftssicher, super Performance
- **Ideal für:** Professionelle Weiterentwicklung

#### 2. **NW.js** (Schnellste Migration)
- **Warum:** Fast identisch zu Electron, minimaler Aufwand
- **Aufwand:** Niedrig (1-2 Wochen)
- **Lernen:** Minimal (fast wie Electron)
- **Vorteil:** Funktioniert sofort
- **Ideal für:** Schnelle Umstellung ohne große Änderungen

#### 3. **NSIS + bestehende Go-Launcher** (Pragmatisch)
- **Warum:** Nutzt bereits vorhandene launcher.exe
- **Aufwand:** Niedrig (1 Woche)
- **Lernen:** NSIS-Scripting (einfach)
- **Vorteil:** Funktioniert mit bestehendem Setup
- **Ideal für:** Schnelle professionelle Installer-Lösung

---

## 🚀 Migrations-Roadmap

### Phase 1: Quick Win (1-2 Wochen)
**NSIS Installer mit bestehenden Launchern**
1. Node.js Portable einbetten
2. NSIS-Skript schreiben
3. Installer bauen und testen
4. → Setup.exe funktioniert ✅

### Phase 2: Optimierung (2-4 Wochen)
**Migration zu NW.js**
1. package.json für NW.js anpassen
2. Entry-Point umstellen
3. Build-Prozess mit nw-builder
4. → Kleinere Bundles, bessere Integration ✅

### Phase 3: Modernisierung (Langfristig)
**Migration zu Tauri**
1. Tauri-Projekt aufsetzen
2. Node.js als Sidecar integrieren
3. System-Integration (Tray, Updates) migrieren
4. → Ultra-kleine Bundles, beste Performance ✅

---

## 📚 Zusätzliche Ressourcen

### Vergleiche & Benchmarks
- [Electron vs Tauri vs NW.js](https://github.com/Elanis/web-to-desktop-framework-comparison)
- [Tauri Benchmarks](https://tauri.app/v1/references/benchmarks/)

### Tools für Setup.exe
- **NSIS:** https://nsis.sourceforge.io/ (einfach, weit verbreitet)
- **Inno Setup:** https://jrsoftware.org/isinfo.php (sehr mächtig)
- **WiX Toolset:** https://wixtoolset.org/ (Windows MSI Standard)
- **Advanced Installer:** https://www.advancedinstaller.com/ (GUI-basiert, kommerziell)

### Node.js Portable
- https://nodejs.org/dist/latest-v18.x/ (ZIP Downloads)
- Oder: https://github.com/crazy-max/nodejs-portable

### Testing
- **Sandboxie:** Teste Installer in isolierter Umgebung
- **VirtualBox:** Fresh Windows für Tests
- **AppVeyor:** CI/CD für Windows-Builds

---

## ⚙️ Nächste Schritte

### Sofort umsetzbar:
1. **NSIS Installer erstellen** (1-2 Tage)
   - NSIS downloaden
   - Node.js Portable einbetten
   - Installer-Skript schreiben
   - Testen auf frischem Windows

2. **NW.js testen** (1 Woche)
   - Kleines Proof-of-Concept
   - Performance-Tests
   - Bundle-Größe checken

3. **Tauri evaluieren** (2 Wochen)
   - Tauri Tutorial durcharbeiten
   - Node.js Sidecar-Integration testen
   - Entscheiden ob langfristig machbar

### Fragen zu klären:
- ❓ Ist kleinere Bundle-Größe wichtiger oder schnelle Migration?
- ❓ Soll die App moderner werden (Tauri) oder pragmatisch bleiben (NSIS)?
- ❓ Ist Rust/Go lernen eine Option oder lieber bei JavaScript bleiben?
- ❓ Auto-Update-Funktion zwingend erforderlich?

---

## 💡 Fazit

**Für LTTH empfehle ich:**

1. **Kurzfristig (jetzt):** NSIS Installer mit bestehenden Go-Launchern
   - Funktioniert sofort
   - Nutzt vorhandene Infrastruktur
   - Professioneller Installer

2. **Mittelfristig (nächste 3 Monate):** Migration zu NW.js
   - Minimaler Aufwand
   - Bessere Integration als jetzt
   - Kleinere Bundles

3. **Langfristig (Zukunft):** Evaluierung von Tauri
   - Modernste Technologie
   - Beste Performance
   - Kleinste Bundles
   - Aber: Nur wenn Zeit für ordentliche Migration da ist

**Die pragmatischste Lösung für LTTH ist eine Kombination:**
- Jetzt: NSIS Installer (nutzt launcher.exe + Node.js Portable)
- Später: Reevaluierung basierend auf Nutzer-Feedback

---

**Fragen oder weitere Informationen benötigt?**  
→ [loggableim@gmail.com](mailto:loggableim@gmail.com)
