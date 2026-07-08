# LTTH One-Line Installer

PupCid's Little TikTool Helper (LTTH) installieren mit einem einzigen Befehl — auf Windows, macOS und Linux.

## Schnellstart

| Betriebssystem | Befehl |
|---|---|
| 🪟 Windows (PowerShell) | `$installer = [Text.Encoding]::UTF8.GetString((New-Object Net.WebClient).DownloadData('https://ltth.app/install/install.ps1')); iex ($installer.TrimStart([char]0xFEFF))` |
| 🍎 macOS (Terminal)     | `curl -fsSL https://ltth.app/install/install.sh \| bash` |
| 🐧 Linux (Bash)         | `curl -fsSL https://ltth.app/install/install.sh \| bash` |
| 🌐 Beliebiges OS (Node) | `curl -fsSL https://ltth.app/install/install.js \| node` |

## Was passiert?

1. **Prüfen** — Git wird erkannt und bei Bedarf installiert.
2. **Laden** — Das Repository wird von GitHub nach `~/.local/share/ltth` (Linux/macOS) bzw. `%LOCALAPPDATA%\LTTH` (Windows) geklont oder aktualisiert.
3. **Bootstrap** — Der Launcher übernimmt beim ersten Start Node.js 22.14.0, `npm install` und den Native-Module-Rebuild.
4. **Starten** — Das Dashboard öffnet sich unter `http://localhost:3000/dashboard.html`.

Auf Windows legt der Installer zusaetzlich Desktop- und Startmenue-Verknuepfungen an.

Der Windows-One-Liner fordert bei der ersten Ausfuehrung Admin-Freigabe an und installiert fehlendes Git automatisch nach. Der Launcher uebernimmt danach Node.js 22.14.0, `npm install` und Native-Module-Rebuilds beim ersten Start. Wenn `winget` fehlt, nutzt der Installer die offiziellen Git-for-Windows-Installer als Fallback. Waehren langer Schritte zeigt der Windows-Installer einen rotierenden Status-Indikator und Download-Fortschritt an, damit er nicht wie eingefroren wirkt.

Der Windows-Befehl trimmt eine moegliche UTF-8-BOM aus dem Raw-Download, damit PowerShell den ersten Token sauber auswertet.

Der Bash-One-Liner installiert fehlendes Git automatisch nach und zieht Node.js auf eine aktuelle LTS-Version nach; auf macOS wird Homebrew bei Bedarf automatisch eingerichtet.

Der Node-Fallback (`install.js`) benoetigt einen vorhandenen Node-Interpreter zum Start, installiert aber fehlendes Git automatisch nach.

Hinweis fuer Windows: Der PowerShell-Installer uebergibt die Node/npm-Arbeit an den Launcher, damit der Terminal-Installer schneller fertig wird und der Launcher den ersten Bootstrap mit sichtbarem Status uebernimmt.

## Umgebungsvariablen

| Variable | Default | Bedeutung |
|---|---|---|
| `LTTH_VERSION` | `latest` | Zu installierende Version (z.B. `v1.3.21`) |
| `LTTH_DIR` | `~/.local/share/ltth` / `%LOCALAPPDATA%\LTTH` | Installationsverzeichnis |
| `LTTH_PORT` | `3000` | HTTP-Port fürs Dashboard |
| `LTTH_NO_BROWSER` | `0` | Browser nach Start nicht öffnen (`1` = aus) |
| `LTTH_QUIET` | `0` | Reduzierte Ausgabe (`1` = still) |
| `LTTH_REPO_BRANCH` | `main` | Git-Branch für Repository-Checkout und Versionsermittlung |
| `LTTH_REPO_OWNER` | `Loggableim` | GitHub-Owner |
| `LTTH_REPO_NAME` | `ltth.app` | GitHub-Repo-Name |

Der Installer liest `version.json` standardmäßig aus `main`. Für Legacy- oder Experiment-Branches kannst du `LTTH_REPO_BRANCH` explizit überschreiben.

### Beispiele

```bash
# Andere Version installieren
LTTH_VERSION=v1.3.21 curl -fsSL https://ltth.app/install/install.sh | bash

# Anderes Verzeichnis
LTTH_DIR=/opt/ltth curl -fsSL https://ltth.app/install/install.sh | bash

# Anderer Port
LTTH_PORT=8080 curl -fsSL https://ltth.app/install/install.sh | bash

# PowerShell (Windows)
$env:LTTH_PORT=8080; $installer = [Text.Encoding]::UTF8.GetString((New-Object Net.WebClient).DownloadData('https://ltth.app/install/install.ps1')); iex ($installer.TrimStart([char]0xFEFF))
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
# Windows (PowerShell)
iex ((iwr -useb https://ltth.app/install/uninstall.ps1).Content.TrimStart([char]0xFEFF))

# Linux/macOS
curl -fsSL https://ltth.app/install/uninstall.sh | bash
```

Der Uninstaller fragt vor dem Loeschen der lokalen Daten und Configs nach. Standard ist, nur die LTTH-Installation zu entfernen und die Benutzerkonfiguration zu behalten.

### Optionen fuer die Deinstallation

| Variable | Bedeutung |
|---|---|
| `LTTH_REMOVE_DATA=1` | Loescht die aktive LTTH-Konfiguration zusaetzlich ohne Rueckfrage |
| `LTTH_KEEP_DATA=1` | Behält lokale Daten und Configs explizit bei |

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
| `install.js` | Plattformunabhängig | Node.js 18/20/22/24 LTS |
| `uninstall.sh` | Linux + macOS | Bash >= 4.0 |
| `uninstall.ps1` | Windows | PowerShell >= 5.0 |

## Lizenz

CC-BY-NC-4.0 — siehe https://ltth.app/impressum.html
