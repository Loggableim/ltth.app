#!/usr/bin/env pwsh
# LTTH one-line uninstaller (Windows PowerShell).
# Keeps the install tree removal and optional config cleanup in one place.

$ErrorActionPreference = 'Stop'

$LTTHDir = if ($env:LTTH_DIR) { $env:LTTH_DIR } else { Join-Path $env:LOCALAPPDATA 'LTTH' }
$script:LTTHUninstallLog = Join-Path ([System.IO.Path]::GetTempPath()) ("ltth-uninstall-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + ".log")

function Write-UninstallLine {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Line,
        [string]$Color = 'White',
        [bool]$Always = $false
    )

    try {
        Add-Content -LiteralPath $script:LTTHUninstallLog -Value $Line -Encoding UTF8
    } catch { }

    if ($Always -or $env:LTTH_QUIET -ne '1') {
        Write-Host $Line -ForegroundColor $Color
    }
}

function Log($msg)  { Write-UninstallLine -Line "[ltth] $msg" -Color Cyan }
function Ok($msg)   { Write-UninstallLine -Line "[OK] $msg" -Color Green }
function Warn($msg) { Write-UninstallLine -Line "[!] $msg" -Color Yellow -Always $true }
function Err($msg)  { Write-UninstallLine -Line "[X] $msg" -Color Red -Always $true }

function Test-Interactive {
    try {
        return [Environment]::UserInteractive -and $Host.Name -match 'ConsoleHost'
    } catch {
        return $false
    }
}

function Get-DefaultConfigDir {
    $base = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $env:USERPROFILE 'AppData\Local' }
    return Join-Path $base 'ltth.app'
}

function Get-InstallCustomConfigDir {
    $settingsFile = Join-Path (Join-Path $LTTHDir 'app') '.config_path'
    if (-not (Test-Path -LiteralPath $settingsFile)) {
        return $null
    }

    try {
        $customPath = (Get-Content -LiteralPath $settingsFile -Raw).Trim()
        if ([string]::IsNullOrWhiteSpace($customPath)) {
            return $null
        }
        return $customPath
    } catch {
        Warn "Custom config path could not be read: $($_.Exception.Message)"
        return $null
    }
}

function Get-ConfigTargets {
    $targets = New-Object System.Collections.Generic.List[string]
    $custom = Get-InstallCustomConfigDir
    $default = Get-DefaultConfigDir

    if ($custom) {
        $targets.Add($custom)
    }

    if (-not $custom -or ($custom -ne $default)) {
        $targets.Add($default)
    }

    return $targets
}

function Should-RemoveData {
    if ($env:LTTH_REMOVE_DATA -eq '1') {
        return $true
    }

    if ($env:LTTH_KEEP_DATA -eq '1') {
        return $false
    }

    if (-not (Test-Interactive)) {
        return $false
    }

    Write-Host ""
    Write-Host "Lokale LTTH-Daten und Configs koennen zusaetzlich entfernt werden." -ForegroundColor Yellow
    Write-Host "Das betrifft die aktive LTTH-Konfiguration unterhalb von ltth.app." -ForegroundColor Yellow
    $answer = Read-Host "Alles loeschen? [j/N]"
    return $answer -match '^(j|ja|y|yes)$'
}

function Test-SafeDeletePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PathToDelete
    )

    if ([string]::IsNullOrWhiteSpace($PathToDelete)) {
        return $false
    }

    $blockedExact = @(
        [Environment]::GetFolderPath('UserProfile'),
        $env:LOCALAPPDATA,
        $env:APPDATA,
        [Environment]::GetFolderPath('CommonApplicationData'),
        (Join-Path $env:SystemDrive 'Windows'),
        (Join-Path $env:SystemDrive 'Program Files'),
        (Join-Path $env:SystemDrive 'Program Files (x86)')
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

    foreach ($blocked in $blockedExact) {
        if ($PathToDelete.TrimEnd('\') -ieq $blocked.TrimEnd('\')) {
            return $false
        }
    }

    if ($PathToDelete -match '^[A-Za-z]:\\?$') {
        return $false
    }

    if ($PathToDelete -eq '/' -or $PathToDelete -eq '\') {
        return $false
    }

    return $true
}

function Remove-PathSafely {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PathToDelete
    )

    if (-not (Test-Path -LiteralPath $PathToDelete)) {
        return
    }

    if (-not (Test-SafeDeletePath -PathToDelete $PathToDelete)) {
        Warn "Skipping unsafe delete target: $PathToDelete"
        return
    }

    Remove-Item -LiteralPath $PathToDelete -Recurse -Force
    Ok "Entfernt: $PathToDelete"
}

function Stop-LtthProcesses {
    $pidFile = Join-Path $LTTHDir 'ltth.pid'

    if (Test-Path -LiteralPath $pidFile) {
        try {
            $pidText = (Get-Content -LiteralPath $pidFile -Raw).Trim()
            if ($pidText) {
                Stop-Process -Id ([int]$pidText) -Force -ErrorAction Stop
                Ok "Beendet: LTTH-Prozess $pidText"
            }
        } catch {
            Warn "LTTH-Prozess konnte nicht ueber ltth.pid beendet werden: $($_.Exception.Message)"
        }
    }

    try {
        $launcherPath = [System.IO.Path]::Combine($LTTHDir, 'launcher.exe')
        $processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue

        foreach ($proc in $processes) {
            $cmd = $proc.CommandLine
            $exe = $proc.ExecutablePath
            $matchesLaunchJs = $cmd -and $cmd -match 'launch\.js'
            $matchesLauncher = ($exe -and $launcherPath -and ($exe -ieq $launcherPath))

            if ($matchesLaunchJs -or $matchesLauncher) {
                try {
                    Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
                    Ok "Beendet: Prozess $($proc.ProcessId)"
                } catch {
                    Warn "Prozess $($proc.ProcessId) konnte nicht beendet werden: $($_.Exception.Message)"
                }
            }
        }
    } catch {
        Warn "Prozesssuche fuer LTTH konnte nicht ausgefuehrt werden: $($_.Exception.Message)"
    }
}

function Remove-WindowsShortcuts {
    $desktopPath = [Environment]::GetFolderPath('DesktopDirectory')
    if ([string]::IsNullOrWhiteSpace($desktopPath)) {
        $desktopPath = Join-Path $env:USERPROFILE 'Desktop'
    }

    $startMenuPath = [Environment]::GetFolderPath('Programs')
    if ([string]::IsNullOrWhiteSpace($startMenuPath)) {
        $startMenuPath = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
    }

    foreach ($shortcutPath in @(
        (Join-Path $desktopPath 'LTTH.lnk'),
        (Join-Path $startMenuPath 'LTTH.lnk')
    )) {
        if (Test-Path -LiteralPath $shortcutPath) {
            try {
                Remove-Item -LiteralPath $shortcutPath -Force
                Ok "Shortcut entfernt: $shortcutPath"
            } catch {
                Warn "Shortcut konnte nicht entfernt werden ($shortcutPath): $($_.Exception.Message)"
            }
        }
    }
}

function Main {
    Write-Host ""
    Write-Host "  ============================================================" -ForegroundColor Magenta
    Write-Host "   PupCid's Little TikTool Helper -- One-Line Uninstaller (Win)" -ForegroundColor Magenta
    Write-Host "  ============================================================" -ForegroundColor Magenta
    Write-Host ""

    Log "Installationsverzeichnis: $LTTHDir"

    $removeData = Should-RemoveData
    if ($removeData) {
        Ok "Lokale Daten und Configs werden mit entfernt."
    } else {
        Ok "Lokale Daten und Configs bleiben erhalten."
    }

    Stop-LtthProcesses
    Remove-WindowsShortcuts
    Remove-PathSafely -PathToDelete $LTTHDir

    if ($removeData) {
        foreach ($target in Get-ConfigTargets) {
            if ($target) {
                Remove-PathSafely -PathToDelete $target
            }
        }
    }

    Write-Host ""
    Ok "Deinstallation abgeschlossen."
    Write-Host ""
    Write-Host "  Uninstall-Log: $script:LTTHUninstallLog" -ForegroundColor Yellow
    Write-Host "  Installationsverzeichnis: $LTTHDir" -ForegroundColor Yellow
    Write-Host ""
}

try {
    Main
} catch {
    Write-Host ""
    Err "Deinstallation abgebrochen: $($_.Exception.Message)"
    Write-Host ""
    Write-Host "  Uninstall-Log: $script:LTTHUninstallLog" -ForegroundColor Yellow
    Write-Host "  Installationsverzeichnis: $LTTHDir" -ForegroundColor Yellow
    Write-Host ""
    throw
}
