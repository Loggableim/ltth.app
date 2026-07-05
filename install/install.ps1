# ==============================================================================
#  LTTH One-Line Installer (Windows PowerShell)
#  PupCid's Little TikTool Helper — https://ltth.app
#
#  Verwendung (PowerShell):
#    iwr -useb https://ltth.app/install/install.ps1 | iex
#
#  Optionale Umgebungsvariablen:
#    $env:LTTH_VERSION     - zu installierende Version (Default: latest)
#    $env:LTTH_DIR         - Installationsverzeichnis (Default: $env:LOCALAPPDATA\LTTH)
#    $env:LTTH_PORT        - HTTP-Port (Default: 3000)
#    $env:LTTH_NO_BROWSER  - Browser nach Start nicht öffnen
#    $env:LTTH_QUIET       - Reduzierte Ausgabe
# ==============================================================================

$ErrorActionPreference = 'Stop'

# ---------- Konfiguration ----------
$LTTHRepoOwner = if ($env:LTTH_REPO_OWNER) { $env:LTTH_REPO_OWNER } else { 'Loggableim' }
$LTTHRepoName  = if ($env:LTTH_REPO_NAME)  { $env:LTTH_REPO_NAME  } else { 'ltth.app' }
$LTTHVersion   = if ($env:LTTH_VERSION)     { $env:LTTH_VERSION     } else { 'latest' }
$LTTHDir       = if ($env:LTTH_DIR)         { $env:LTTH_DIR         } else { Join-Path $env:LOCALAPPDATA 'LTTH' }
$LTTHPort      = if ($env:LTTH_PORT)        { $env:LTTH_PORT        } else { '3000' }
$LTTHNoBrowser = if ($env:LTTH_NO_BROWSER)  { $env:LTTH_NO_BROWSER  } else { '0' }
$LTTHQuiet     = if ($env:LTTH_QUIET)       { $env:LTTH_QUIET       } else { '0' }

# ---------- Hilfsfunktionen ----------
function Log($msg)  { if ($LTTHQuiet -ne '1') { Write-Host "[ltth] $msg" -ForegroundColor Cyan } }
function Ok($msg)   { if ($LTTHQuiet -ne '1') { Write-Host "[OK] $msg" -ForegroundColor Green } }
function Warn($msg) { Write-Host "[!] $msg" -ForegroundColor Yellow }
function Err($msg)  { Write-Host "[X] $msg" -ForegroundColor Red }

# ---------- Version ermitteln ----------
function Resolve-Version {
    if ($LTTHVersion -eq 'latest') {
        Log "Ermittle neueste Version von GitHub..."
        $resolved = $false

        try {
            $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$LTTHRepoOwner/$LTTHRepoName/releases/latest" -TimeoutSec 15 -ErrorAction Stop
            if ($release -and $release.tag_name) {
                $LTTHVersion = $release.tag_name -replace '^v', ''
                $resolved = $true
            }
        } catch { }

        if (-not $resolved) {
            Warn "Kein GitHub Release gefunden; verwende neuesten Tag..."
            try {
                $tags = Invoke-RestMethod -Uri "https://api.github.com/repos/$LTTHRepoOwner/$LTTHRepoName/tags?per_page=1" -TimeoutSec 15 -ErrorAction Stop
                if ($null -eq $tags -or @($tags).Count -eq 0) {
                    throw "Keine Tags gefunden."
                }
                $LTTHVersion = $tags[0].name -replace '^v', ''
                $resolved = $true
            } catch {
                Err "Konnte neueste Version nicht ermitteln: $_"
                exit 1
            }
        }

        if (-not $resolved) {
            Err "Konnte neueste Version nicht ermitteln."
            exit 1
        }

        Ok "Neueste Version: v$LTTHVersion"
    } else {
        Ok "Verwende angegebene Version: v$LTTHVersion"
    }
}

# ---------- Git prüfen ----------
function Ensure-Git {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Err "Git ist nicht installiert."
        Err "Bitte installiere Git: https://git-scm.com/download/win"
        Err "Oder verwende den LTTH Cloud Launcher: https://ltth.app/downloads/launcher.exe"
        exit 1
    }
}

# ---------- Node.js prüfen / installieren ----------
function Ensure-Node {
    if (Get-Command node -ErrorAction SilentlyContinue) {
        $v = node --version
        $major = [int]($v -replace '^v(\d+)\..*', '$1')
        if ($major -ge 18 -and $major -lt 25) {
            Ok "Node.js $v gefunden"
            return
        }
        Warn "Node.js $v ausserhalb des unterstuetzten Bereichs (>=18 <25)"
    }

    Log "Installiere Node.js LTS 22 via winget..."
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
        $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')
        if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
            Err "Node.js konnte nicht automatisch installiert werden. Bitte manuell installieren: https://nodejs.org/"
            exit 1
        }
    } else {
        Err "winget fehlt. Bitte installiere Node.js manuell: https://nodejs.org/"
        exit 1
    }
}

# ---------- Download ----------
function Download-Source {
    if (Test-Path (Join-Path $LTTHDir '.git')) {
        Log "Bestehende Installation gefunden -- aktualisiere..."
        Push-Location $LTTHDir
        try {
            git fetch --tags --prune 2>&1 | Out-Null
            git checkout "v$LTTHVersion" 2>&1 | Out-Null
        } catch {
            git checkout $LTTHVersion 2>&1 | Out-Null
        }
        Pop-Location
    } else {
        Log "Klone Repository nach $LTTHDir..."
        if (Test-Path $LTTHDir) {
            Warn "Bestehendes Zielverzeichnis gefunden, aber keine Git-Installation. Bereinige..."
            Remove-Item -Path $LTTHDir -Recurse -Force
        }
        New-Item -ItemType Directory -Force -Path $LTTHDir | Out-Null
        $ok = $false
        try {
            git clone --branch "v$LTTHVersion" --depth 1 "https://github.com/$LTTHRepoOwner/$LTTHRepoName.git" $LTTHDir 2>&1 | Out-Null
            $ok = $true
        } catch {
            try {
                git clone --branch $LTTHVersion --depth 1 "https://github.com/$LTTHRepoOwner/$LTTHRepoName.git" $LTTHDir 2>&1 | Out-Null
                $ok = $true
            } catch {
                Warn "Tag-basiertes Klonen fehlgeschlagen, klone main..."
                git clone --depth 1 "https://github.com/$LTTHRepoOwner/$LTTHRepoName.git" $LTTHDir 2>&1 | Out-Null
                $ok = $true
            }
        }
    }
    Ok "Quellcode bereit in $LTTHDir"
}

# ---------- Dependencies ----------
function Install-Deps {
    Log "Installiere npm-Abhaengigkeiten (kann einige Minuten dauern)..."
    Push-Location (Join-Path $LTTHDir 'app')
    try {
        npm install --no-audit --no-fund --loglevel=error 2>&1 | Out-Null
    } finally {
        Pop-Location
    }
    Ok "Abhaengigkeiten installiert"
}

# ---------- Start ----------
function Start-App {
    Log "Starte LTTH im Hintergrund auf Port $LTTHPort..."
    $appDir = Join-Path $LTTHDir 'app'
    $logFile = Join-Path $LTTHDir 'ltth.log'

    Push-Location $appDir
    try {
        $p = Start-Process -FilePath 'node' `
                           -ArgumentList 'launch.js' `
                           -WorkingDirectory $appDir `
                           -RedirectStandardOutput $logFile `
                           -RedirectStandardError "$logFile.err" `
                           -WindowStyle Hidden `
                           -PassThru
        $p.Id | Out-File (Join-Path $LTTHDir 'ltth.pid') -Encoding ascii
    } finally {
        Pop-Location
    }

    Start-Sleep -Seconds 3
    $proc = Get-Process -Id (Get-Content (Join-Path $LTTHDir 'ltth.pid')) -ErrorAction SilentlyContinue
    if ($proc) {
        Ok "LTTH laeuft (PID $($proc.Id)) auf Port $LTTHPort"
    } else {
        Err "LTTH konnte nicht gestartet werden. Siehe $logFile"
        exit 1
    }
}

# ---------- Browser ----------
function Open-Browser {
    if ($LTTHNoBrowser -eq '1') { return }
    $url = "http://localhost:$LTTHPort/dashboard.html"
    Log "Oeffne $url ..."
    Start-Process $url
}

# ---------- Hauptprogramm ----------
function Main {
    Write-Host ""
    Write-Host "  ============================================================" -ForegroundColor Magenta
    Write-Host "   PupCid's Little TikTool Helper -- One-Line Installer (Win)" -ForegroundColor Magenta
    Write-Host "  ============================================================" -ForegroundColor Magenta
    Write-Host ""

    Log "Installationsverzeichnis: $LTTHDir"
    Log "Port:                     $LTTHPort"

    Ensure-Git
    Ensure-Node
    Resolve-Version
    Download-Source
    Install-Deps
    Start-App
    Open-Browser

    Write-Host ""
    Ok "Installation abgeschlossen!"
    Write-Host ""
    Write-Host "  Dashboard:   http://localhost:$LTTHPort/dashboard.html"
    Write-Host "  Log-Datei:   $LTTHDir\ltth.log"
    Write-Host "  Stoppen:     Stop-Process -Id (Get-Content $LTTHDir\ltth.pid)"
    Write-Host "  Updates:     cd $LTTHDir\app && git pull && npm install"
    Write-Host ""
    Write-Host "  Alternative (GUI):  Lade den LTTH Cloud Launcher herunter:" -ForegroundColor DarkGray
    Write-Host "    https://ltth.app/downloads/launcher.exe" -ForegroundColor DarkGray
    Write-Host ""
}

Main
