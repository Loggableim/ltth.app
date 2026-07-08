# LTTH One-Line Installer

PupCid's Little TikTool Helper (LTTH) installieren mit einem einzigen Befehl â€” auf Windows, macOS und Linux.

## Schnellstart

| Betriebssystem | Befehl |
|---|---|
| ðŸªŸ Windows (PowerShell) | `$installer = [Text.Encoding]::UTF8.GetString((New-Object Net.WebClient).DownloadData('https://ltth.app/install/install.ps1')); iex ($installer.TrimStart([char]0xFEFF))` |
| ðŸŽ macOS (Terminal)     | `curl -fsSL https://ltth.app/install/install.sh \| bash` |
| ðŸ§ Linux (Bash)         | `curl -fsSL https://ltth.app/install/install.sh \| bash` |
| ðŸŒ Beliebiges OS (Node) | `curl -fsSL https://ltth.app/install/install.js \| node` |

## Was passiert?

1. **Pruefen** - Der Installer validiert nur die minimale Startumgebung fuer die gewaehlte Plattform.
2. **Laden** - Der Windows-Pfad laedt das App-Bundle direkt als ZIP und entpackt es; macOS/Linux nutzen weiterhin den Repo-Checkout.
3. **Bootstrap** - Der Launcher uebernimmt beim ersten Start Node.js 22.14.0, `npm install` und den Native-Module-Rebuild.
4. **Starten** - Das Dashboard oeffnet sich unter `http://localhost:3000/dashboard.html`.

Auf Windows legt der Installer zusaetzlich Desktop- und Startmenue-Verknuepfungen an.

Der Windows-One-Liner fordert bei der ersten Ausfuehrung Admin-Freigabe an. Der offizielle Windows-Pfad laedt das App-Bundle direkt als ZIP und startet danach den Launcher; Node.js 22.14.0, `npm install` und Native-Module-Rebuilds uebernimmt der Launcher beim ersten Start. Wenn auf einem Legacy- oder Custom-Installationspfad Git benoetigt wird und `winget` fehlt, nutzt der Installer die offiziellen Git-for-Windows-Installer als Fallback. Waehren langer Schritte zeigt der Windows-Installer einen rotierenden Status-Indikator und Download-Fortschritt an, damit er nicht wie eingefroren wirkt.

Der Windows-Befehl trimmt eine moegliche UTF-8-BOM aus dem Raw-Download, damit PowerShell den ersten Token sauber auswertet.

Der Bash-One-Liner installiert fehlendes Git automatisch nach und zieht Node.js auf eine aktuelle LTS-Version nach; auf macOS wird Homebrew bei Bedarf automatisch eingerichtet.

Der Node-Fallback (`install.js`) benoetigt einen vorhandenen Node-Interpreter zum Start, installiert aber fehlendes Git automatisch nach.

Hinweis fuer Windows: Der PowerShell-Installer uebergibt die Node/npm-Arbeit an den Launcher, damit der Terminal-Installer schneller fertig wird und der Launcher den ersten Bootstrap mit sichtbarem Status uebernimmt.
## Umgebungsvariablen

| Variable | Default | Bedeutung |
|---|---|---|
| `LTTH_VERSION` | `latest` | Zu installierende Version (z.B. `v1.3.21`) |
| `LTTH_DIR` | `~/.local/share/ltth` / `%LOCALAPPDATA%\LTTH` | Installationsverzeichnis |
| `LTTH_PORT` | `3000` | HTTP-Port fÃ¼rs Dashboard |
| `LTTH_NO_BROWSER` | `0` | Browser nach Start nicht Ã¶ffnen (`1` = aus) |
| `LTTH_QUIET` | `0` | Reduzierte Ausgabe (`1` = still) |
| `LTTH_REPO_BRANCH` | `main` | Git-Branch fÃ¼r Repository-Checkout und Versionsermittlung |
| `LTTH_REPO_OWNER` | `Loggableim` | GitHub-Owner |
| `LTTH_REPO_NAME` | `ltth.app` | GitHub-Repo-Name |

Der Installer liest `version.json` standardmÃ¤ÃŸig aus `main`. FÃ¼r Legacy- oder Experiment-Branches kannst du `LTTH_REPO_BRANCH` explizit Ã¼berschreiben.

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

# Windows (PowerShell, nur fuer Legacy-/Custom-Git-Installationen)
cd $env:LOCALAPPDATA\LTTH\app
git pull
npm install
```

Der offizielle Windows-ZIP-Installationspfad laesst Updates vom Launcher verwalten, statt manuell `git pull` zu verwenden.
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
| `LTTH_KEEP_DATA=1` | BehÃ¤lt lokale Daten und Configs explizit bei |

## Sicherheit

- Alle Skripte nutzen `set -euo pipefail` (Bash) bzw. `$ErrorActionPreference = 'Stop'` (PowerShell) und brechen bei Fehlern sofort ab.
- Skripte signieren sich selbst nicht â€” vertraue dem TLS-Zertifikat von `ltth.app`.
- Bei Windows: SmartScreen-Warnung mit "Weitere Informationen â†’ Trotzdem ausfÃ¼hren" bestÃ¤tigen.
- Der Node.js-Installer (`install.js`) benÃ¶tigt eine bereits installierte Node-Version.
- Git ist fuer den offiziellen Windows-Pfad nicht mehr erforderlich, bleibt aber fuer Legacy-/Custom-Installationen relevant.

## Source-Ãœbersicht

| Datei | Plattform | Interpreter |
|---|---|---|
| `install.sh` | Linux + macOS | Bash >= 4.0 |
| `install.ps1` | Windows | PowerShell >= 5.0 |
| `install.js` | PlattformunabhÃ¤ngig | Node.js 18/20/22/24 LTS |
| `uninstall.sh` | Linux + macOS | Bash >= 4.0 |
| `uninstall.ps1` | Windows | PowerShell >= 5.0 |

## Lizenz

CC-BY-NC-4.0 â€” siehe https://ltth.app/impressum.html
