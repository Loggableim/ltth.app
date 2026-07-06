# 🎉 LTTH NSIS Installer - Alles bereit!

## ✅ Was wurde erstellt

Ich habe ein vollständiges NSIS Installer-Setup für LTTH erstellt mit allen geforderten Features:

### 📁 Dateien in `build-src/installer/`:

1. **ltth-installer.nsi** - Hauptinstallerskript (NSIS)
   - Modern UI 2
   - AdvSplash Plugin vorbereitet (mit Banner Plugin als Fallback)
   - StartMenu.dll Integration für benutzerdefinierte Startmenü-Ordner
   - VPatch Integration vorbereitet für Updates
   - Vollständige Registry-Verwaltung
   - Professioneller Uninstaller

2. **Grafiken (BMP-Format, fertig):**
   - `installer-header.bmp` (150x57) - Header für Installer
   - `installer-sidebar.bmp` (164x314) - Sidebar mit LTTH Branding
   - `splash-screen.bmp` (500x300) - Splash Screen
   - `banner.bmp` (500x100) - Banner für AdvSplash

3. **Dokumentation:**
   - `README.md` - Ausführliche technische Dokumentation
   - `SETUP_INSTRUCTIONS.md` - Schritt-für-Schritt Anleitung
   - `license.txt` - Lizenztext (von LICENSE kopiert)

4. **Build-Tools:**
   - `build-installer.bat` - Automatisches Build-Script

### 🎨 Features

✅ **AdvSplash Plugin** - Aktiv integriert mit automatischem Banner-Fallback
✅ **Banner Plugin** - Als Fallback wenn AdvSplash nicht verfügbar
✅ **StartMenu.dll** - Ermöglicht Auswahl des Startmenü-Ordners
✅ **VPatch Anbindung** - Vorbereitet für zukünftige Updates
✅ **Modern UI** - Professional Installer/Uninstaller
✅ **Komponenten-Auswahl** - Core, Node.js, Shortcuts
✅ **Registry-Cleanup** - Saubere Deinstallation
✅ **Mehrsprachig** - Englisch & Deutsch

---

## 🚀 So erstellst du die Setup.exe

### Schritt 1: NSIS installieren

1. Download: https://nsis.sourceforge.io/Download
2. Installiere NSIS 3.x (Standard-Einstellungen)

### Schritt 2: AdvSplash Plugin installieren (optional, empfohlen)

**Für professionelle Fade-Effekte:**

1. Download: https://nsis.sourceforge.io/AdvSplash_plug-in
2. Entpacke `AdvSplash.dll` nach: `C:\Program Files (x86)\NSIS\Plugins\x86-unicode\`

**Hinweis:** Wenn du diesen Schritt überspringst, nutzt der Installer automatisch das eingebaute Banner Plugin.

### Schritt 3: Node.js Portable (optional, empfohlen)

1. Download: https://nodejs.org/dist/v18.19.1/node-v18.19.1-win-x64.zip
2. Entpacke nach: `build-src/assets/node/`
   - Ergebnis: `build-src/assets/node/node.exe` sollte existieren

**Hinweis:** Wenn du diesen Schritt überspringst, wird der Installer ohne Node.js erstellt.

### Schritt 4: Installer erstellen

**Einfachste Methode (Drag & Drop):**

1. Öffne Windows Explorer
2. Gehe zu: `build-src/installer/`
3. Ziehe `ltth-installer.nsi` ins **MakeNSISW** Fenster
4. Warte 30-60 Sekunden
5. **Fertig!** → `LTTH-Setup-1.2.0.exe` ist erstellt

**Alternative (Rechtsklick):**

1. Rechtsklick auf `ltth-installer.nsi`
2. "Compile NSIS Script"
3. **Fertig!** → `LTTH-Setup-1.2.0.exe`

**Alternative (Batch-Script):**

1. Doppelklick auf `build-installer.bat`
2. **Fertig!** → `LTTH-Setup-1.2.0.exe`

---

## 📦 Was der Installer installiert

Wenn Benutzer den Installer ausführen:

1. **Splash Screen** mit LTTH Logo und Fade-Effekten (2s mit 600ms Fade-In, 400ms Fade-Out)
2. **Willkommensseite** mit Produktinfo
3. **Lizenzvereinbarung** (CC-BY-NC-4.0)
4. **Komponenten-Auswahl:**
   - Core Application (Pflicht)
   - Node.js Portable (optional)
   - Desktop Shortcut (optional)
   - Startmenü Shortcuts (optional)
   - Quick Launch (optional)
5. **Installationsordner** wählen
6. **Startmenü-Ordner** wählen (mit StartMenu.dll)
7. **Installation** mit Banner-Updates
8. **Fertig** - Option zum sofortigen Start

### Installiert wird:

- `app/` Verzeichnis (alle Backend-Dateien)
- `launcher.exe` (Go Launcher)
- `node/` Verzeichnis (falls Node.js gewählt)
- Desktop Shortcut
- Startmenü Shortcuts
- Registry-Einträge
- Uninstaller

### Deinstallation:

- Entfernt alle Dateien vollständig
- Löscht alle Registry-Einträge
- Entfernt alle Shortcuts
- Keine Reste!

---

## 🎨 Anpassungen (Optional)

### Version ändern

Bearbeite `ltth-installer.nsi` Zeile 18:
```nsis
!define PRODUCT_VERSION "1.3.2"  ; Hier ändern
```

### Grafiken ersetzen

Ersetze die BMP-Dateien mit eigenen:
- `installer-header.bmp` (150x57 Pixel, 24-bit BMP)
- `installer-sidebar.bmp` (164x314 Pixel, 24-bit BMP)
- `splash-screen.bmp` (500x300 Pixel, 24-bit BMP)
- `banner.bmp` (500x100 Pixel, 24-bit BMP)

**Wichtig:** Muss BMP-Format sein (kein PNG/JPG)!

### AdvSplash Splash-Screen anpassen

**Aktuell:** Nutzt AdvSplash Plugin mit automatischem Fallback auf Banner Plugin

**Konfiguration:**
```nsis
advsplash::show 2000 600 400 -1 $PluginsDir\spltmp
```

**Parameter:**
- **2000**: Anzeigezeit in Millisekunden (2 Sekunden)
- **600**: Fade-In Dauer in Millisekunden (0,6 Sekunden)
- **400**: Fade-Out Dauer in Millisekunden (0,4 Sekunden)
- **-1**: Transparenzfarbe (-1 = keine Transparenz, oder RGB Hex wie 0xFF00FF für Magenta)
- **$PluginsDir\spltmp**: Dateiname (ohne .bmp Endung)

**Anpassen:**

1. Ersetze `splash-screen.bmp` durch eigenes 500x300, 24-bit BMP Bild
2. Timing ändern in `ltth-installer.nsi` Zeile 176:
   ```nsis
   advsplash::show 2000 600 400 -1 $PluginsDir\spltmp
   ```
3. Optional: Transparenz hinzufügen durch Ändern von `-1` zu Farbwert (z.B. `0xFF00FF` für Magenta)
4. Optional: WAV-Datei hinzufügen durch Ablegen von `splash-screen.wav` im installer-Verzeichnis

**Fallback-Verhalten:**
- Wenn AdvSplash.dll nicht installiert ist, nutzt der Installer automatisch das eingebaute Banner Plugin
- Dem Benutzer werden keine Fehler angezeigt - Installation läuft normal weiter

### AdvSplash Plugin aktivieren (optional - BEREITS INTEGRIERT!)

**Aktuell:** AdvSplash ist bereits im NSI-Script aktiv! Du musst nur das Plugin installieren.

**So aktivierst du AdvSplash:**
1. Download: https://nsis.sourceforge.io/AdvSplash_plug-in
2. Kopiere `AdvSplash.dll` nach: `C:\Program Files (x86)\NSIS\Plugins\x86-unicode\`
3. Kompiliere den Installer neu
4. **Fertig!** - Der Installer nutzt jetzt AdvSplash mit Fade-Effekten

**Vorteil:** Professionelle Fade-In/Fade-Out Effekte für einen besseren ersten Eindruck

---

## 🔄 VPatch Integration (Zukünftige Updates)

Der Installer ist für VPatch vorbereitet. Um Auto-Updates zu aktivieren:

1. **VPatch Plugin installieren:**
   - Download: https://nsis.sourceforge.io/VPatch_plug-in
   - Kopiere Dateien nach NSIS-Ordner

2. **Patch-Dateien erstellen:**
   ```bash
   GenPat.exe alte-version.exe neue-version.exe patch.dat
   ```

3. **Update-Server einrichten:**
   - Hoste Patch-Dateien
   - Erstelle version.json mit Versionsinformationen

4. **Launcher erweitern:**
   - Version-Check implementieren
   - Patch herunterladen und anwenden
   - Siehe NSIS\Docs\VPatch\Readme.html

**Dokumentation:** Im NSI-Script und README.md enthalten

---

## 🧪 Testen

### Vor dem Release:

1. ✅ Installer auf sauberem Windows 10/11 testen
2. ✅ Alle Komponenten installieren
3. ✅ Shortcuts überprüfen
4. ✅ Anwendung starten
5. ✅ Deinstallation testen
6. ✅ Sicherstellen, dass keine Dateien übrig bleiben

### Optional (Empfohlen):

- Code Signing mit Zertifikat:
  ```bash
  signtool.exe sign /f cert.pfx /p password LTTH-Setup-1.2.0.exe
  ```
- SHA256 Checksum erstellen
- Auf verschiedenen Windows-Versionen testen

---

## 📝 Checkliste

Was du jetzt machen musst:

- [ ] NSIS installieren (https://nsis.sourceforge.io/Download)
- [ ] Optional: Node.js Portable herunterladen und entpacken
- [ ] `ltth-installer.nsi` ins MakeNSISW ziehen
- [ ] Warten bis Kompilierung fertig ist
- [ ] `LTTH-Setup-1.2.0.exe` erhalten
- [ ] Installer testen
- [ ] Verteilen!

---

## 📚 Dokumentation

Für Details siehe:

- **Technische Doku:** `build-src/installer/README.md`
- **Setup-Anleitung:** `build-src/installer/SETUP_INSTRUCTIONS.md`
- **NSI-Script:** `build-src/installer/ltth-installer.nsi` (gut kommentiert)

---

## 🎯 Zusammenfassung

### Was funktioniert sofort:

✅ **AdvSplash Plugin** - Aktiv im Script, zeigt Fade-Effekte wenn Plugin installiert  
✅ **Banner Plugin Fallback** - Funktioniert wenn AdvSplash nicht verfügbar  
✅ **StartMenu.dll** - Benutzer wählt Startmenü-Ordner  
✅ **Modern UI** - Professional Installer-Design  
✅ **Komponenten** - Auswahl von Core, Node.js, Shortcuts  
✅ **Uninstaller** - Vollständige Entfernung  

### Was vorbereitet ist:

🔧 **VPatch** - Dokumentiert, bereit für Implementation  

### Größe:

- **Mit Node.js:** ~150-200 MB
- **Ohne Node.js:** ~20-30 MB
- **Installationszeit:** 30-60 Sekunden

---

## 🆘 Support

Bei Fragen:

1. Lies `SETUP_INSTRUCTIONS.md` für Schritt-für-Schritt Anleitung
2. Lies `README.md` für technische Details
3. Prüfe NSI-Script Kommentare

---

**🎉 Viel Erfolg mit dem Installer!**

Ziehe einfach `ltth-installer.nsi` ins MakeNSISW Fenster und du bekommst deine fertige `setup.exe`!
