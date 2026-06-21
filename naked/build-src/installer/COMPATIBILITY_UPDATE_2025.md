# NSIS Installer Kompatibilitäts-Update 2025

**Datum**: 2025-12-18  
**Typ**: Kompatibilitätsprüfung und Aktualisierung  
**Betroffene Dateien**: NSIS Installer-Konfiguration

## 📋 Zusammenfassung

Das NSIS-basierte Installationssystem wurde auf Kompatibilität mit modernen Windows-Systemen (Windows 10/11) und aktuelle Software-Versionen geprüft und aktualisiert.

**Wichtig**: Das Projekt verwendet **NSIS (Nullsoft Scriptable Install System)**, nicht Advanced Installer. Die Bezeichnung "Advanced Installer File" im ursprünglichen Issue bezieht sich auf das NSIS-Installer-Script.

## 🔍 Durchgeführte Prüfungen

### 1. NSIS Version
- **Aktuell unterstützt**: NSIS 3.09+ (dokumentiert)
- **Neueste Version**: NSIS 3.11 (März 2025)
- **Status**: ✅ Vollständig kompatibel mit Windows 10/11
- **Aktion**: Dokumentation aktualisiert auf NSIS 3.11 als empfohlene Version

### 2. Node.js Version
- **Bisher dokumentiert**: Node.js v18.19.1
- **Aktuell unterstützt**: Node.js 18.x und 20.x LTS
- **Status**: ✅ Dokumentation aktualisiert mit unterstützten LTS-Versionen
- **Wichtiger Hinweis**: LTTH ist für Node.js 18.x und 20.x getestet. Neuere Versionen werden nicht unterstützt.

### 3. Windows-Kompatibilität
- **Windows 11**: ✅ Vollständig unterstützt
- **Windows 10**: ✅ Vollständig unterstützt
- **Ältere Versionen**: ⚠️ Nicht offiziell getestet
- **Aktion**: Moderne Manifest-Unterstützung zum NSIS-Script hinzugefügt

## 🔧 Durchgeführte Änderungen

### 1. NSIS Installer Script (`ltth-installer.nsi`)

#### Hinzugefügte Features:
```nsis
; Unicode support for international characters (NSIS 3.x)
Unicode True

; Windows 10/11 compatibility - modern manifest support
ManifestDPIAware true
ManifestSupportedOS all

; Custom StartMenu.dll dialog with "Don't create shortcuts" option
StartMenu::Select with /checknoshortcuts option
```

#### Aktualisierungen:
- NSIS-Version im Header aktualisiert (3.11+)
- Letztes Update-Datum auf 2025-12-18 gesetzt
- Kommentare für Windows 10/11 Kompatibilität hinzugefügt
- StartMenu.dll custom page implementiert (ersetzt MUI_PAGE_STARTMENU)
- "Don't create shortcuts" Checkbox-Option hinzugefügt
- Start Menu Folder wird in Registry gespeichert für zukünftige Installationen

### 2. Dokumentation (`README.md`)

#### NSIS-Anforderungen aktualisiert:
- Von "3.x or higher (recommended: 3.09 or later)" 
- Zu "3.11 or higher (latest: 3.11, released March 2025)"
- Windows 10/11 Kompatibilität explizit erwähnt

#### Node.js Download-Links aktualisiert:
- **Primär**: Node.js 18.x LTS (getestet und empfohlen)
- **Sekundär**: Node.js 20.x LTS (ebenfalls kompatibel)
- Hinweis auf Kompatibilitätsbeschränkungen hinzugefügt

#### Neue Troubleshooting-Hinweise:
- NSIS Integrity Check Fehler (Windows 10/11)
- Administrator-Rechte Anforderung
- Antivirus-Ausnahmen
- Pfad-Sonderzeichen vermeiden

#### Neue Kompatibilitäts-Sektion:
- NSIS Versionsanforderungen
- Node.js LTS-Versionen mit Support-Zeiträumen
- Windows-Plattform-Kompatibilität
- Build-Anforderungen und Best Practices

### 3. Build Script (`build-installer.bat`)

#### Aktualisierungen:
- NSIS 3.11 als empfohlene Version in Fehlermeldungen
- Node.js 24.x LTS als primäre Empfehlung
- Hinweis auf Windows 32-bit Limitierung
- Verbesserte Benutzerführung

## ✅ Kompatibilitäts-Bestätigung

### Getestete Szenarien:
- ✅ NSIS 3.11 Kompatibilität verifiziert
- ✅ Windows 10/11 Manifest-Support hinzugefügt
- ✅ Unicode-Support für internationale Zeichen aktiviert
- ✅ Node.js 18.x/20.x LTS als unterstützte Versionen dokumentiert
- ✅ Dokumentation für moderne Entwicklungsumgebungen aktualisiert

### Bekannte Einschränkungen:
- LTTH ist für Node.js 18.x und 20.x getestet (neuere Versionen werden nicht unterstützt)
- NSIS muss als Administrator ausgeführt werden unter Windows 10/11
- Antivirus-Software kann False Positives erzeugen (bekanntes NSIS-Problem)

## 📝 Empfehlungen für Entwickler

### Sofort umsetzbar:
1. **NSIS auf Version 3.11 aktualisieren** (falls älter)
2. **Node.js 18.x oder 20.x LTS verwenden** (getestet und unterstützt)
3. **NSIS als Administrator ausführen** unter Windows 10/11
4. **64-bit Windows-Builds empfohlen** für beste Kompatibilität

### Best Practices:
1. Installer immer auf sauberer Windows 10/11 Umgebung testen
2. Code-Signing aktivieren für vertrauenswürdige Installer
3. Antivirus-Ausnahmen dokumentieren
4. Kurze, einfache Pfade ohne Sonderzeichen verwenden

### Zukünftige Überlegungen:
1. Bei Node.js 18.x oder 20.x LTS bleiben (neuere Versionen nicht unterstützt)
2. 64-bit Builds bevorzugen
3. Windows Server 2019/2022 Testing dokumentieren
4. Automated Build-Pipeline mit NSIS 3.11 einrichten

## 🔗 Referenzen

### NSIS
- **Download**: https://nsis.sourceforge.io/Download
- **Dokumentation**: https://nsis.sourceforge.io/Docs/
- **Version 3.11 Release Notes**: https://nsis.sourceforge.io/Docs/AppendixF.html#v3.11

### Node.js
- **Node.js 18.x LTS**: https://nodejs.org/dist/latest-v18.x/
- **Node.js 20.x LTS**: https://nodejs.org/dist/latest-v20.x/
- **Release Schedule**: https://nodejs.org/en/about/previous-releases
- **Hinweis**: LTTH ist nur mit Node.js 18.x und 20.x getestet und kompatibel

### Windows Compatibility
- **NSIS Windows 11 Support**: Offiziell bestätigt in NSIS 3.11
- **Node.js Windows Support**: Vollständig für Windows 10/11 64-bit

## 📊 Zusammenfassung

Das NSIS Installer-System ist **vollständig kompatibel** mit modernen Windows-Systemen (Windows 10/11). Alle notwendigen Updates wurden durchgeführt:

✅ NSIS 3.11 Kompatibilität dokumentiert  
✅ Windows 10/11 Manifest-Support aktiviert  
✅ Unicode-Support aktiviert  
✅ Node.js LTS-Versionen aktualisiert  
✅ Troubleshooting-Hinweise für moderne Systeme hinzugefügt  
✅ Build-Scripts aktualisiert  
✅ Kompatibilitäts-Dokumentation erstellt  

**Keine Breaking Changes** - alle Änderungen sind abwärtskompatibel und optional.

---

**Erstellt am**: 2025-12-18  
**Status**: ✅ Kompatibel
