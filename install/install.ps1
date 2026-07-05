# ==============================================================================
#  LTTH One-Line Installer (Windows PowerShell)
#  PupCid's Little TikTool Helper -- https://ltth.app
#
#  Verwendung (PowerShell):
#    iwr -useb https://raw.githubusercontent.com/Loggableim/ltth.app/main/install/install.ps1 | iex
#
#  Optionale Umgebungsvariablen:
#    $env:LTTH_VERSION     - zu installierende Version (Default: latest)
#    $env:LTTH_DIR         - Installationsverzeichnis (Default: $env:LOCALAPPDATA\LTTH)
#    $env:LTTH_PORT        - HTTP-Port (Default: 3000)
#    $env:LTTH_NO_BROWSER  - Browser nach Start nicht oeffnen
#    $env:LTTH_NO_LAUNCHER - Launcher nach Installation nicht starten
#    $env:LTTH_QUIET       - Reduzierte Ausgabe
#    $env:LTTH_NO_PAUSE    - Bei Fehler nicht auf Enter warten
# ==============================================================================

$ErrorActionPreference = 'Stop'

# ---------- Konfiguration ----------
$LTTHRepoOwner = if ($env:LTTH_REPO_OWNER) { $env:LTTH_REPO_OWNER } else { 'Loggableim' }
$LTTHRepoName  = if ($env:LTTH_REPO_NAME)  { $env:LTTH_REPO_NAME  } else { 'ltth.app' }
$LTTHVersion   = if ($env:LTTH_VERSION) { $env:LTTH_VERSION } else { 'latest' }
$script:LTTHVersion = $LTTHVersion
$LTTHDir       = if ($env:LTTH_DIR)         { $env:LTTH_DIR         } else { Join-Path $env:LOCALAPPDATA 'LTTH' }
$LTTHPort      = if ($env:LTTH_PORT)        { $env:LTTH_PORT        } else { '3000' }
$LTTHNoBrowser = if ($env:LTTH_NO_BROWSER)  { $env:LTTH_NO_BROWSER  } else { '0' }
$LTTHNoLauncher = if ($env:LTTH_NO_LAUNCHER) { $env:LTTH_NO_LAUNCHER } else { '0' }
$LTTHQuiet     = if ($env:LTTH_QUIET)       { $env:LTTH_QUIET       } else { '0' }
$LTTHNoPause   = if ($env:LTTH_NO_PAUSE)    { $env:LTTH_NO_PAUSE    } else { '0' }
$script:LTTHInstallerLog = Join-Path ([System.IO.Path]::GetTempPath()) ("ltth-installer-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + ".log")

# ---------- Hilfsfunktionen ----------
function Write-InstallerLine {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Line,
        [string]$Color = 'White',
        [bool]$Always = $false
    )

    try {
        Add-Content -LiteralPath $script:LTTHInstallerLog -Value $Line -Encoding UTF8
    } catch { }

    if ($Always -or $LTTHQuiet -ne '1') {
        Write-Host $Line -ForegroundColor $Color
    }
}

function Log($msg)  { Write-InstallerLine -Line "[ltth] $msg" -Color Cyan }
function Ok($msg)   { Write-InstallerLine -Line "[OK] $msg" -Color Green }
function Warn($msg) { Write-InstallerLine -Line "[!] $msg" -Color Yellow -Always $true }
function Err($msg)  { Write-InstallerLine -Line "[X] $msg" -Color Red -Always $true }
function Fail($msg) { throw $msg }

function Pause-On-Error {
    if ($LTTHNoPause -eq '1') { return }

    try {
        if ([Environment]::UserInteractive -and $Host.Name -match 'ConsoleHost') {
            Write-Host ""
            Read-Host "Fehler sichtbar. Druecke Enter zum Schliessen"
        }
    } catch { }
}

function Invoke-Git {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [string]$WorkingDirectory
    )

    if ([string]::IsNullOrWhiteSpace($WorkingDirectory)) {
        $WorkingDirectory = (Get-Location).Path
    }

    $gitLogBase = Join-Path ([System.IO.Path]::GetTempPath()) ("ltth-git-" + [guid]::NewGuid().ToString('N'))
    $stdoutLog = "$gitLogBase.out.log"
    $stderrLog = "$gitLogBase.err.log"

    try {
        $proc = Start-Process -FilePath 'git' `
                              -ArgumentList $Arguments `
                              -WorkingDirectory $WorkingDirectory `
                              -RedirectStandardOutput $stdoutLog `
                              -RedirectStandardError $stderrLog `
                              -NoNewWindow `
                              -PassThru `
                              -Wait
    } catch {
        throw "Git konnte nicht gestartet werden: $($_.Exception.Message)"
    }

    try {
        if ($proc.ExitCode -ne 0) {
            $stdoutRaw = if (Test-Path $stdoutLog) { Get-Content -Path $stdoutLog -Raw } else { '' }
            $stderrRaw = if (Test-Path $stderrLog) { Get-Content -Path $stderrLog -Raw } else { '' }
            $stdout = if ($null -ne $stdoutRaw) { $stdoutRaw.Trim() } else { '' }
            $stderr = if ($null -ne $stderrRaw) { $stderrRaw.Trim() } else { '' }
            $details = @($stderr, $stdout) | Where-Object { $_ }

            if ($null -ne $details -and $details.Count -gt 0) {
                throw ("git {0} fehlgeschlagen: {1}" -f ($Arguments -join ' '), ($details -join ' | '))
            }

            throw ("git {0} fehlgeschlagen (ExitCode {1})" -f ($Arguments -join ' '), $proc.ExitCode)
        }
    } finally {
        Remove-Item -LiteralPath $stdoutLog, $stderrLog -Force -ErrorAction SilentlyContinue
    }
}

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
                Fail "Konnte neueste Version nicht ermitteln: $_"
            }
        }

        if (-not $resolved) {
            Fail "Konnte neueste Version nicht ermitteln."
        }

        $script:LTTHVersion = $LTTHVersion
        Ok "Neueste Version: v$LTTHVersion"
    } else {
        Ok "Verwende angegebene Version: v$LTTHVersion"
    }
}

# ---------- Git pruefen ----------
function Ensure-Git {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Err "Git ist nicht installiert."
        Err "Bitte installiere Git: https://git-scm.com/download/win"
        Err "Oder verwende den LTTH Cloud Launcher: https://ltth.app/downloads/launcher.exe"
        Fail "Git ist nicht installiert."
    }
}

# ---------- Node.js pruefen / installieren ----------
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
            Fail "Node.js konnte nicht automatisch installiert werden. Bitte manuell installieren: https://nodejs.org/"
        }
    } else {
        Fail "winget fehlt. Bitte installiere Node.js manuell: https://nodejs.org/"
    }
}

# ---------- Download ----------
function Download-Source {
    $repoUrl = "https://github.com/$LTTHRepoOwner/$LTTHRepoName.git"
    if (Test-Path (Join-Path $LTTHDir '.git')) {
        Log "Bestehende Installation gefunden -- aktualisiere..."
        try {
            Invoke-Git -Arguments @('fetch', '--tags', '--prune') -WorkingDirectory $LTTHDir
        } catch {
            Warn "Git Fetch fehlgeschlagen, verwende vorhandene lokale Branch-Struktur..."
        }
        $tagCheckedOut = $false
        try {
            Invoke-Git -Arguments @('fetch', '--depth', '1', 'origin', "refs/tags/v${LTTHVersion}:refs/tags/v${LTTHVersion}") -WorkingDirectory $LTTHDir
            Invoke-Git -Arguments @('checkout', '--quiet', "v$LTTHVersion") -WorkingDirectory $LTTHDir
            $tagCheckedOut = $true
        } catch {
        }
        if (-not $tagCheckedOut) {
            try {
                Invoke-Git -Arguments @('fetch', '--depth', '1', 'origin', "refs/tags/${LTTHVersion}:refs/tags/${LTTHVersion}") -WorkingDirectory $LTTHDir
                Invoke-Git -Arguments @('checkout', '--quiet', "$LTTHVersion") -WorkingDirectory $LTTHDir
                $tagCheckedOut = $true
            } catch {
            }
        }
        if (-not $tagCheckedOut) {
            try {
                Invoke-Git -Arguments @('checkout', '--quiet', "v$LTTHVersion") -WorkingDirectory $LTTHDir
                $tagCheckedOut = $true
            } catch {
            }
        }
        if (-not $tagCheckedOut) {
            Warn "Gewuenschte Version nicht gefunden, nutze Standard-Branch main..."
            Invoke-Git -Arguments @('checkout', '--quiet', 'main') -WorkingDirectory $LTTHDir
        }
    } else {
        Log "Klone Repository nach $LTTHDir..."
        if (Test-Path $LTTHDir) {
            Warn "Bestehendes Zielverzeichnis gefunden, aber keine Git-Installation. Bereinige..."
            Remove-Item -Path $LTTHDir -Recurse -Force
        }
        New-Item -ItemType Directory -Force -Path $LTTHDir | Out-Null
        try {
            Invoke-Git -Arguments @('clone', '--depth', '1', $repoUrl, $LTTHDir)

            try {
                Invoke-Git -Arguments @('fetch', '--depth', '1', 'origin', "refs/tags/v${LTTHVersion}:refs/tags/v${LTTHVersion}") -WorkingDirectory $LTTHDir
                Invoke-Git -Arguments @('checkout', '--quiet', "v$LTTHVersion") -WorkingDirectory $LTTHDir
            } catch {
                try {
                    Invoke-Git -Arguments @('fetch', '--depth', '1', 'origin', "refs/tags/${LTTHVersion}:refs/tags/${LTTHVersion}") -WorkingDirectory $LTTHDir
                    Invoke-Git -Arguments @('checkout', '--quiet', "$LTTHVersion") -WorkingDirectory $LTTHDir
                } catch {
                    Warn "Tag nicht verfuegbar, nutze Standard-Branch..."
                }
            }
        } catch {
            Warn "Tag-basiertes Klonen fehlgeschlagen, klone main..."
            if (Test-Path $LTTHDir) {
                Warn "Zielverzeichnis fuer Haupt-Branch bereinigen..."
                Remove-Item -Path $LTTHDir -Recurse -Force
            }
            try {
                Invoke-Git -Arguments @('clone', '--depth', '1', $repoUrl, $LTTHDir)
            } catch {
                Fail "Repository konnte nicht geklont werden: $($_.Exception.Message)"
            }
        }
    }
    Ok "Quellcode bereit in $LTTHDir"
}
# ---------- Dependencies ----------
function Install-Deps {
    Log "Installiere npm-Abhaengigkeiten (kann einige Minuten dauern)..."
    $appDir = Join-Path $LTTHDir 'app'
    Push-Location $appDir
    try {
        $npmArgs = @('install', '--no-audit', '--no-fund', '--loglevel=error')
        $npmCommand = Get-Command npm -ErrorAction SilentlyContinue
        $npmExecutable = $null

        if ($npmCommand -and $npmCommand.Source -like '*.ps1') {
            $npmCmdPath = Join-Path (Split-Path $npmCommand.Source) 'npm.cmd'
            if (Test-Path $npmCmdPath) {
                $npmExecutable = $npmCmdPath
            }
        }
        if ($npmCommand -and $npmCommand.Source -and $npmCommand.Source -notlike '*.ps1') {
            $npmExecutable = $npmCommand.Source
        }
        if (-not $npmExecutable) {
            $npmExecutable = 'npm.cmd'
        }

        $npmLogBase = Join-Path $LTTHDir ("ltth-npm-" + [guid]::NewGuid().ToString('N'))
        $stdoutLog = "$npmLogBase.out.log"
        $stderrLog = "$npmLogBase.err.log"

        $previousErrorActionPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            & $npmExecutable @npmArgs 1>$stdoutLog 2>$stderrLog
            $npmExitCode = $LASTEXITCODE
        } catch {
            Fail "npm konnte nicht gestartet werden: $($_.Exception.Message)"
        } finally {
            $ErrorActionPreference = $previousErrorActionPreference
        }

        if ($npmExitCode -ne 0) {
            Err "npm install fehlgeschlagen (ExitCode $npmExitCode)."
            if (Test-Path $stderrLog) {
                Get-Content $stderrLog -Tail 40 | ForEach-Object { Write-Host $_ }
            }
            if (Test-Path $stdoutLog) {
                Get-Content $stdoutLog -Tail 20 | ForEach-Object { Write-Host $_ }
            }
            Fail "npm install fehlgeschlagen. Siehe npm-Logs im Installationsverzeichnis."
        }

        Remove-Item -Path $stdoutLog, $stderrLog -Force -ErrorAction SilentlyContinue
    } finally {
        Pop-Location
    }
    Ok "Abhaengigkeiten installiert"
}

# ---------- Launcher ----------
function Install-Launcher {
    $launcherPath = Join-Path $LTTHDir 'launcher.exe'
    $launcherUrl = 'https://github.com/Loggableim/ltth.app/raw/main/launcher.exe'

    try {
        if (-not (Test-Path $launcherPath)) {
            Log "Lade LTTH Cloud Launcher herunter..."
            Invoke-WebRequest -UseBasicParsing -Uri $launcherUrl -OutFile $launcherPath -TimeoutSec 60
        }

        if (-not (Test-Path $launcherPath)) {
            throw "Launcher-Datei fehlt nach Installation."
        }

        $launcherInfo = Get-Item -LiteralPath $launcherPath
        if ($launcherInfo.Length -lt 1048576) {
            throw "Launcher-Datei wirkt unvollstaendig ($($launcherInfo.Length) Bytes)."
        }

        Ok "Launcher bereit: $launcherPath"
        return $launcherPath
    } catch {
        Warn "Launcher konnte nicht eingerichtet werden: $($_.Exception.Message)"
        Warn "Verwende direkten Node-Start als Fallback."
        return $null
    }
}

function Create-DesktopShortcut {
    param(
        [Parameter(Mandatory = $true)]
        [string]$LauncherPath
    )

    try {
        $desktopPath = [Environment]::GetFolderPath('DesktopDirectory')
        if ([string]::IsNullOrWhiteSpace($desktopPath)) {
            $desktopPath = Join-Path $env:USERPROFILE 'Desktop'
        }
        New-Item -ItemType Directory -Force -Path $desktopPath | Out-Null

        $shortcutPath = Join-Path $desktopPath 'LTTH.lnk'
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = $LauncherPath
        $shortcut.WorkingDirectory = $LTTHDir
        $shortcut.IconLocation = $LauncherPath
        $shortcut.Description = "PupCid's Little TikTool Helper"
        $shortcut.Save()

        Ok "Desktop-Verknuepfung erstellt: $shortcutPath"
        return $shortcutPath
    } catch {
        Warn "Desktop-Verknuepfung konnte nicht erstellt werden: $($_.Exception.Message)"
        return $null
    }
}

function Start-Launcher {
    param(
        [Parameter(Mandatory = $true)]
        [string]$LauncherPath
    )

    if ($LTTHNoLauncher -eq '1') {
        Warn "Launcher-Start uebersprungen (LTTH_NO_LAUNCHER=1)."
        return $true
    }

    try {
        Log "Starte LTTH Cloud Launcher..."
        $p = Start-Process -FilePath $LauncherPath `
                           -WorkingDirectory $LTTHDir `
                           -WindowStyle Normal `
                           -PassThru
        Ok "Launcher gestartet (PID $($p.Id))"
        return $true
    } catch {
        Warn "Launcher konnte nicht gestartet werden: $($_.Exception.Message)"
        Warn "Verwende direkten Node-Start als Fallback."
        return $false
    }
}

# ---------- Fallback-Start ----------
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
        Fail "LTTH konnte nicht gestartet werden. Siehe $logFile und $logFile.err"
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
    $launcherPath = Install-Launcher
    $shortcutPath = $null
    $launcherStarted = $false

    if ($launcherPath) {
        $shortcutPath = Create-DesktopShortcut -LauncherPath $launcherPath
        $launcherStarted = Start-Launcher -LauncherPath $launcherPath
    }

    if (-not $launcherStarted) {
        Start-App
        Open-Browser
    }

    Write-Host ""
    Ok "Installation abgeschlossen!"
    Write-Host ""
    if ($launcherPath) {
        Write-Host "  Launcher:   $launcherPath"
    }
    if ($shortcutPath) {
        Write-Host "  Desktop:    $shortcutPath"
        Write-Host "  Starten:    Doppelklick auf die Desktop-Verknuepfung 'LTTH'"
    }
    Write-Host "  App-Ordner: $LTTHDir"
    Write-Host "  Dashboard:  http://localhost:$LTTHPort/dashboard.html"
    if (-not $launcherStarted) {
        Write-Host "  Log-Datei:  $LTTHDir\ltth.log"
        Write-Host "  Stoppen:    Stop-Process -Id (Get-Content $LTTHDir\ltth.pid)"
    }
    Write-Host ""
}

try {
    Main
} catch {
    Write-Host ""
    Err "Installation abgebrochen: $($_.Exception.Message)"
    Write-Host ""
    Write-Host "  Installer-Log: $script:LTTHInstallerLog" -ForegroundColor Yellow
    Write-Host "  Installationsverzeichnis: $LTTHDir" -ForegroundColor Yellow
    Write-Host ""
    Pause-On-Error
}
