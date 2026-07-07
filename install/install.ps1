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
$script:LTTHNodePath = $null
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

function Test-SupportedNodeMajor {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Major
    )

    return ($Major -ge 18 -and $Major -lt 25 -and ($Major % 2 -eq 0))
}

function Get-NodeVersionInfo {
    param(
        [Parameter(Mandatory = $true)]
        [string]$NodePath
    )

    if ([string]::IsNullOrWhiteSpace($NodePath) -or -not (Test-Path -LiteralPath $NodePath)) {
        return $null
    }

    try {
        $versionText = & $NodePath --version
        if ([string]::IsNullOrWhiteSpace($versionText)) {
            return $null
        }

        $major = [int]($versionText -replace '^v(\d+)\..*', '$1')
        if (-not (Test-SupportedNodeMajor -Major $major)) {
            return $null
        }

        return [pscustomobject]@{
            Path = $NodePath
            Version = $versionText
            Major = $major
        }
    } catch {
        return $null
    }
}

function Get-PreferredNodeInfo {
    $candidates = New-Object System.Collections.Generic.List[string]

    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeCommand) {
        foreach ($candidate in @($nodeCommand.Source, $nodeCommand.Path, $nodeCommand.Definition)) {
            if (-not [string]::IsNullOrWhiteSpace($candidate) -and $candidate -match 'node(\.exe)?$') {
                $candidates.Add($candidate)
            }
        }
    }

    foreach ($basePath in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) {
        if (-not [string]::IsNullOrWhiteSpace($basePath)) {
            $candidates.Add((Join-Path $basePath 'nodejs\node.exe'))
        }
    }

    $seen = @{}
    foreach ($candidate in $candidates) {
        try {
            $normalized = [System.IO.Path]::GetFullPath($candidate)
        } catch {
            $normalized = $candidate
        }

        if ($seen.ContainsKey($normalized)) {
            continue
        }
        $seen[$normalized] = $true

        $info = Get-NodeVersionInfo -NodePath $normalized
        if ($info) {
            return $info
        }
    }

    return $null
}

function Set-PreferredNodeEnvironment {
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$NodeInfo
    )

    $script:LTTHNodePath = $NodeInfo.Path
    $nodeDir = Split-Path -Parent $NodeInfo.Path
    if (-not [string]::IsNullOrWhiteSpace($nodeDir)) {
        $env:Path = "$nodeDir;$env:Path"
    }
}

function Get-NpmExecutable {
    param(
        [string]$NodePath
    )

    if (-not [string]::IsNullOrWhiteSpace($NodePath)) {
        $nodeDir = Split-Path -Parent $NodePath
        foreach ($candidate in @(
            (Join-Path $nodeDir 'npm.cmd')
        )) {
            if (Test-Path -LiteralPath $candidate) {
                return $candidate
            }
        }
    }

    $npmCommand = Get-Command npm -ErrorAction SilentlyContinue
    if ($npmCommand -and $npmCommand.Source -like '*.ps1') {
        $npmCmdPath = Join-Path (Split-Path $npmCommand.Source) 'npm.cmd'
        if (Test-Path $npmCmdPath) {
            return $npmCmdPath
        }
    }
    if ($npmCommand -and $npmCommand.Source -and $npmCommand.Source -notlike '*.ps1') {
        return $npmCommand.Source
    }
    return 'npm.cmd'
}

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
        Err "Oder verwende den LTTH Windows Launcher: https://ltth.app/downloads/launcher.exe"
        Fail "Git ist nicht installiert."
    }
}

# ---------- Node.js pruefen / installieren ----------
function Ensure-Node {
    $nodeInfo = Get-PreferredNodeInfo
    if ($nodeInfo) {
        Set-PreferredNodeEnvironment -NodeInfo $nodeInfo
        Ok "Node.js $($nodeInfo.Version) gefunden"
        return
    }

    $installedNode = Get-Command node -ErrorAction SilentlyContinue
    if ($installedNode) {
        $installedVersion = & $installedNode.Source --version
        Warn "Node.js $installedVersion ist zwar installiert, aber LTTH braucht ein LTS-Build (18/20/22/24)."
    }

    Log "Installiere Node.js LTS via winget..."
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
        $machinePath = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
        $userPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
        $pathParts = @()
        if (-not [string]::IsNullOrWhiteSpace($machinePath)) {
            $pathParts += $machinePath
        }
        if (-not [string]::IsNullOrWhiteSpace($userPath)) {
            $pathParts += $userPath
        }
        $env:Path = ($pathParts -join ';')

        $nodeInfo = Get-PreferredNodeInfo
        if (-not $nodeInfo) {
            Fail "Node.js konnte nicht automatisch auf ein LTS-Build aktualisiert werden. Bitte Node.js 18/20/22/24 LTS manuell installieren: https://nodejs.org/"
        }
        Set-PreferredNodeEnvironment -NodeInfo $nodeInfo
        Ok "Node.js $($nodeInfo.Version) gefunden"
    } else {
        Fail "winget fehlt. Bitte installiere Node.js manuell: https://nodejs.org/"
    }
}

# ---------- Launcher-Reparatur vor Git-Checkout ----------
function Repair-LauncherFile {
    $launcherPath = Join-Path $LTTHDir 'launcher.exe'
    $downloadLauncherPath = Join-Path $LTTHDir 'downloads\launcher.exe'

    if (-not (Test-Path $launcherPath) -or -not (Test-Path $downloadLauncherPath)) {
        return
    }

    try {
        $launcherHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $launcherPath).Hash
        $downloadHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $downloadLauncherPath).Hash

        if ($launcherHash -ne $downloadHash) {
            return
        }

        Warn "Falscher downloads/launcher.exe im Root erkannt; repariere launcher.exe..."
        $tmpLauncher = Join-Path ([System.IO.Path]::GetTempPath()) ("ltth-launcher-" + [guid]::NewGuid().ToString('N') + ".exe")
        try {
            Invoke-WebRequest -UseBasicParsing -Uri "https://raw.githubusercontent.com/$LTTHRepoOwner/$LTTHRepoName/main/launcher.exe" -OutFile $tmpLauncher -TimeoutSec 60
            Move-Item -LiteralPath $tmpLauncher -Destination $launcherPath -Force
        } finally {
            Remove-Item -LiteralPath $tmpLauncher -Force -ErrorAction SilentlyContinue
        }
    } catch {
        Warn "Launcher-Reparatur vor Update fehlgeschlagen: $($_.Exception.Message)"
    }
}

# ---------- Download ----------
function Download-Source {
    $repoUrl = "https://github.com/$LTTHRepoOwner/$LTTHRepoName.git"
    if (Test-Path (Join-Path $LTTHDir '.git')) {
        Repair-LauncherFile
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
        $npmExecutable = Get-NpmExecutable -NodePath $script:LTTHNodePath

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
    $downloadLauncherPath = Join-Path $LTTHDir 'downloads\launcher.exe'
    $launcherUrl = 'https://github.com/Loggableim/ltth.app/raw/main/launcher.exe'

    try {
        $launcherMatchesDownloads = $false
        if ((Test-Path $launcherPath) -and (Test-Path $downloadLauncherPath)) {
            $launcherMatchesDownloads = ((Get-FileHash -Algorithm SHA256 -LiteralPath $launcherPath).Hash -eq (Get-FileHash -Algorithm SHA256 -LiteralPath $downloadLauncherPath).Hash)
        }

        if ((-not (Test-Path $launcherPath)) -or $launcherMatchesDownloads) {
            Log "Lade LTTH Windows Launcher herunter..."
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

function Get-ShortcutIconPath {
    foreach ($candidate in @(
        (Join-Path $LTTHDir 'build-src\icon.ico'),
        (Join-Path $LTTHDir 'icon.ico'),
        (Join-Path $LTTHDir 'app\public\favicon.ico')
    )) {
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }

    return $null
}

function Get-ShortcutConfig {
    param(
        [string]$LauncherPath
    )

    $description = "PupCid's Little TikTool Helper"
    $iconPath = Get-ShortcutIconPath

    if (-not [string]::IsNullOrWhiteSpace($LauncherPath) -and (Test-Path -LiteralPath $LauncherPath)) {
        return [pscustomobject]@{
            TargetPath = $LauncherPath
            Arguments = ''
            WorkingDirectory = $LTTHDir
            IconLocation = if ($iconPath) { $iconPath } else { $LauncherPath }
            Description = $description
        }
    }

    $nodePath = $script:LTTHNodePath
    if ([string]::IsNullOrWhiteSpace($nodePath)) {
        $nodeInfo = Get-PreferredNodeInfo
        if ($nodeInfo) {
            $nodePath = $nodeInfo.Path
        }
    }

    if ([string]::IsNullOrWhiteSpace($nodePath)) {
        return $null
    }

    return [pscustomobject]@{
        TargetPath = $nodePath
        Arguments = 'launch.js'
        WorkingDirectory = (Join-Path $LTTHDir 'app')
        IconLocation = if ($iconPath) { $iconPath } else { $nodePath }
        Description = $description
    }
}

function Create-WindowsShortcut {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ShortcutPath,
        [Parameter(Mandatory = $true)]
        [pscustomobject]$ShortcutConfig
    )

    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ShortcutPath) | Out-Null

    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($ShortcutPath)
    $shortcut.TargetPath = $ShortcutConfig.TargetPath
    $shortcut.WorkingDirectory = $ShortcutConfig.WorkingDirectory
    if (-not [string]::IsNullOrWhiteSpace($ShortcutConfig.Arguments)) {
        $shortcut.Arguments = $ShortcutConfig.Arguments
    }
    if (-not [string]::IsNullOrWhiteSpace($ShortcutConfig.IconLocation)) {
        $shortcut.IconLocation = $ShortcutConfig.IconLocation
    }
    $shortcut.Description = $ShortcutConfig.Description
    $shortcut.Save()

    return $ShortcutPath
}

function Create-DesktopShortcut {
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$ShortcutConfig
    )

    try {
        $desktopPath = [Environment]::GetFolderPath('DesktopDirectory')
        if ([string]::IsNullOrWhiteSpace($desktopPath)) {
            $desktopPath = Join-Path $env:USERPROFILE 'Desktop'
        }
        if ([string]::IsNullOrWhiteSpace($desktopPath)) {
            throw "Desktop path could not be resolved."
        }

        $shortcutPath = Join-Path $desktopPath 'LTTH.lnk'
        $createdPath = Create-WindowsShortcut -ShortcutPath $shortcutPath -ShortcutConfig $ShortcutConfig

        Ok "Desktop-Verknuepfung erstellt: $createdPath"
        return $createdPath
    } catch {
        Warn "Desktop-Verknuepfung konnte nicht erstellt werden: $($_.Exception.Message)"
        return $null
    }
}

function Create-StartMenuShortcut {
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$ShortcutConfig
    )

    try {
        $startMenuPath = [Environment]::GetFolderPath('Programs')
        if ([string]::IsNullOrWhiteSpace($startMenuPath)) {
            $startMenuPath = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
        }
        if ([string]::IsNullOrWhiteSpace($startMenuPath)) {
            throw "Start menu path could not be resolved."
        }

        $shortcutPath = Join-Path $startMenuPath 'LTTH.lnk'
        $createdPath = Create-WindowsShortcut -ShortcutPath $shortcutPath -ShortcutConfig $ShortcutConfig

        Ok "Startmenueeintrag erstellt: $createdPath"
        return $createdPath
    } catch {
        Warn "Startmenueeintrag konnte nicht erstellt werden: $($_.Exception.Message)"
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
        Log "Starte LTTH Windows Launcher..."
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
        $nodeExecutable = if (-not [string]::IsNullOrWhiteSpace($script:LTTHNodePath)) { $script:LTTHNodePath } else { 'node' }
        $p = Start-Process -FilePath $nodeExecutable `
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
    $shortcutConfig = Get-ShortcutConfig -LauncherPath $launcherPath
    $desktopShortcutPath = $null
    $startMenuShortcutPath = $null
    $launcherStarted = $false

    if ($shortcutConfig) {
        $desktopShortcutPath = Create-DesktopShortcut -ShortcutConfig $shortcutConfig
        $startMenuShortcutPath = Create-StartMenuShortcut -ShortcutConfig $shortcutConfig
    }

    if ($launcherPath) {
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
    if ($desktopShortcutPath) {
        Write-Host "  Desktop:    $desktopShortcutPath"
    }
    if ($startMenuShortcutPath) {
        Write-Host "  Startmenue: $startMenuShortcutPath"
    }
    if ($desktopShortcutPath -or $startMenuShortcutPath) {
        Write-Host "  Starten:    Doppelklick auf die Desktop-Verknuepfung 'LTTH' oder den Startmenueeintrag"
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
