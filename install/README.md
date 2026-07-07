# LTTH One-Line Installer

PupCid's Little TikTool Helper (LTTH) installieren mit einem einzigen Befehl — auf Windows, macOS und Linux.

## Schnellstart

| Betriebssystem | Befehl |
|---|---|
| 🪟 Windows (PowerShell) | `iwr -useb https://raw.githubusercontent.com/Loggableim/ltth.app/main/install/install.ps1 \| iex` |
| 🍎 macOS (Terminal)     | `curl -fsSL https://raw.githubusercontent.com/Loggableim/ltth.app/main/install/install.sh \| bash` |
| 🐧 Linux (Bash)         | `curl -fsSL https://raw.githubusercontent.com/Loggableim/ltth.app/main/install/install.sh \| bash` |
| 🌐 Beliebiges OS (Node) | `curl -fsSL https://raw.githubusercontent.com/Loggableim/ltth.app/main/install/install.js \| node` |

## Was passiert?

1. **Prüfen** — Git und Node.js (>=18 <25) werden erkannt. Fehlende Tools werden via Homebrew/winget/NodeSource/apt automatisch installiert.
2. **Laden** — Das Repository wird von GitHub nach `~/.local/share/ltth` (Linux/macOS) bzw. `%LOCALAPPDATA%\LTTH` (Windows) geklont oder aktualisiert.
3. **Bauen** — `npm install` richtet alle 36 Plugins und Module ein.
4. **Starten** — Das Dashboard öffnet sich unter `http://localhost:3000/dashboard.html`.

Auf Windows legt der Installer zusaetzlich Desktop- und Startmenue-Verknuepfungen an.

## Umgebungsvariablen

| Variable | Default | Bedeutung |
|---|---|---|
| `LTTH_VERSION` | `latest` | Zu installierende Version (z.B. `v1.3.7`) |
| `LTTH_DIR` | `~/.local/share/ltth` / `%LOCALAPPDATA%\LTTH` | Installationsverzeichnis |
| `LTTH_PORT` | `3000` | HTTP-Port fürs Dashboard |
| `LTTH_NO_BROWSER` | `0` | Browser nach Start nicht öffnen (`1` = aus) |
| `LTTH_QUIET` | `0` | Reduzierte Ausgabe (`1` = still) |
| `LTTH_REPO_OWNER` | `Loggableim` | GitHub-Owner |
| `LTTH_REPO_NAME` | `ltth.app` | GitHub-Repo-Name |

### Beispiele

```bash
# Andere Version installieren
LTTH_VERSION=v1.3.20 curl -fsSL https://raw.githubusercontent.com/Loggableim/ltth.app/main/install/install.sh | bash

# Anderes Verzeichnis
LTTH_DIR=/opt/ltth curl -fsSL https://raw.githubusercontent.com/Loggableim/ltth.app/main/install/install.sh | bash

# Anderer Port
LTTH_PORT=8080 curl -fsSL https://raw.githubusercontent.com/Loggableim/ltth.app/main/install/install.sh | bash

# PowerShell (Windows)
$env:LTTH_PORT=8080; iwr -useb https://raw.githubusercontent.com/Loggableim/ltth.app/main/install/install.ps1 | iex
```

## Updates

```bash
# Linux/macOS
cd ~/.local/share/ltth/app
git pull && npm install
# Dann neu starten: kill $(cat ../ltth.pid) && cd .. && ./start.sh

# Windows (PowerShell)
cd $env:LOCALAPPDATA\LTTH\app
git pull
npm install
```

## Deinstallation

```bash
# Linux/macOS
rm -rf ~/.local/share/ltth

# Windows (PowerShell)
Remove-Item -Recurse -Force $env:LOCALAPPDATA\LTTH
```

## Sicherheit

- Alle Skripte nutzen `set -euo pipefail` (Bash) bzw. `$ErrorActionPreference = 'Stop'` (PowerShell) und brechen bei Fehlern sofort ab.
- Skripte signieren sich selbst nicht — vertraue dem TLS-Zertifikat von `ltth.app`.
- Bei Windows: SmartScreen-Warnung mit "Weitere Informationen → Trotzdem ausführen" bestätigen.
- Der Node.js-Installer (`install.js`) benötigt eine bereits installierte Node-Version.

## Source-Übersicht

| Datei | Plattform | Interpreter |
|---|---|---|
| `install.sh` | Linux + macOS | Bash >= 4.0 |
| `install.ps1` | Windows | PowerShell >= 5.0 |
| `install.js` | Plattformunabhängig | Node.js 18+ |

## Lizenz

CC-BY-NC-4.0 — siehe https://ltth.app/impressum.html
