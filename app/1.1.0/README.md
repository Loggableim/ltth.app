# Pup Cids Little TikTool Helper

Ein einfach zu bedienendes Tool für TikTok LIVE Streaming mit Overlays, Alerts, Text-to-Speech und mehr.

---

## 🚀 Schnellstart

### Voraussetzungen

- **Node.js 18 oder höher** muss installiert sein
  - Download: [https://nodejs.org](https://nodejs.org)
  - Empfohlen: LTS Version (Long Term Support)

### Installation & Start

#### Windows:
1. Doppelklick auf `launcher.exe` (Grafischer Launcher mit Hintergrundbild und Fortschrittsanzeige)
2. Das war's! Der Launcher installiert automatisch alle benötigten Abhängigkeiten und öffnet das Dashboard

**Alternative:** Bei Problemen mit dem grafischen Launcher:
- Verwende `launcher-backup.exe` (Minimalistischer Launcher mit detailliertem Logging)
- Erstellt automatisch eine `launcher-debug.log` Datei zur Fehleranalyse
- Zeigt alle Schritte im Terminal-Fenster an
- Terminal bleibt geöffnet, um Fehler zu sehen

#### Linux:
1. Doppelklick auf `start-linux` (oder im Terminal: `./start-linux`)
2. Das war's! Das Tool installiert automatisch alle benötigten Abhängigkeiten und startet sich

#### Mac:
1. Doppelklick auf `start-mac` (oder im Terminal: `./start-mac`)
2. Das war's! Das Tool installiert automatisch alle benötigten Abhängigkeiten und startet sich

---

## 📖 Was macht der Launcher?

Der Launcher (`launcher.exe` für Windows, `start-linux` für Linux, `start-mac` für Mac) übernimmt automatisch:

✅ Prüft ob Node.js installiert ist  
✅ Installiert alle benötigten Abhängigkeiten (beim ersten Start)  
✅ Startet das Tool  
✅ Öffnet automatisch das Dashboard im Browser  

### Features des grafischen Launchers (launcher.exe):

- **Hintergrundbild**: Zeigt das Hintergrundbild `launcherbg.png` in voller Größe an
- **Fortschrittsbalken**: Prozentualer Fortschrittsbalken im unteren linken Bereich
- **Status-Updates**: Zeigt aktuelle Status-Meldungen während des Startvorgangs
- **Auto-Redirect**: Leitet automatisch zum Dashboard weiter, sobald das Tool gestartet ist
- **Hinweise**: Zeigt wichtige Hinweise (z.B. "npm install kann einige Minuten dauern")  

---

## 🔧 Weitere Informationen

- **Vollständige Dokumentation:** Siehe `../app/README.md`
- **Features, Konfiguration, Troubleshooting:** Alle Details in `../app/README.md`
- **Launcher Build-Anleitung:** Siehe `../build-src/README.md`
- **Support:** [loggableim@gmail.com](mailto:loggableim@gmail.com)

---

## 🤖 KI-Unterstützung / Engineering-Agent

Dieses Projekt verfügt über einen definierten **Engineering-Agent** für KI-Tools wie GitHub Copilot.

- **Agent-Dokumentation:** Siehe [`ENGINEERING_AGENT.md`](ENGINEERING_AGENT.md)
- **Repository-Analyse:** Siehe [`ANALYSIS.md`](ANALYSIS.md)

**Wichtig:** KI-Assistenten sollten nur unter Einhaltung der Regeln in `/infos/ENGINEERING_AGENT.md` eingesetzt werden, um Architektur und Plugins nicht zu beschädigen. Der Agent ist darauf trainiert:

- Keine Features zu entfernen
- Nur bestätigte Probleme zu reparieren
- Produktionsreife Lösungen zu liefern
- Die bestehende Projektstruktur zu respektieren

---

## 🎨 Branding

Das Tool verwendet das ltthappicon.png (Hund mit Brille und TikTok-Rahmen) als:
- **Launcher-Icon:** Windows-Programmsymbol für `launcher.exe`
- **Dashboard-Logo:** Seitennavigation im Browser-UI
- **Favicon:** Browser-Tab-Symbol

Icon-Datei: `../app/ltthappicon.png`

---

## ⚠️ Hinweis

Wenn Node.js nicht installiert ist, erscheint eine Fehlermeldung mit Download-Link.

**Bei Problemen:**
1. **Node.js Version:** Verwende Node.js v20 LTS (empfohlen) statt v24+
2. **Backup-Launcher:** `launcher-backup.exe` erstellt eine `launcher-debug.log` Datei mit detaillierten Informationen
3. **Troubleshooting Guide:** Siehe `TROUBLESHOOTING.md` für detaillierte Lösungen
4. **App-Dokumentation:** Siehe `../app/README.md` für weitere Informationen
5. **Support:** loggableim@gmail.com

### Problemlösung mit dem Backup-Launcher

Wenn `launcher.exe` ein Terminal-Fenster öffnet, das sich sofort wieder schließt:
1. Verwende stattdessen `launcher-backup.exe`
2. Das Terminal bleibt geöffnet und zeigt alle Schritte an
3. Prüft automatisch Node.js Version Kompatibilität
4. Eine `launcher-debug.log` Datei wird erstellt mit detaillierten Informationen
5. Die Log-Datei kann zur Fehleranalyse an den Support geschickt werden

### Häufiges Problem: Node.js v24+ Installation

**Symptom:** npm install schlägt fehl mit "gyp ERR! find VS" Fehler

**Ursache:** Node.js v24+ benötigt Visual Studio Build Tools 2019+

**Lösung (Einfach):**
- Installiere Node.js v20 LTS statt v24+
- Download: https://nodejs.org/en/download/

**Details:** Siehe `TROUBLESHOOTING.md`
