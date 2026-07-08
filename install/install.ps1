# ==============================================================================
#  LTTH One-Line Installer (Windows PowerShell)
#  PupCid's Little TikTool Helper -- https://ltth.app
#
#  Verwendung (PowerShell):
#    $installer = [Text.Encoding]::UTF8.GetString((New-Object Net.WebClient).DownloadData('https://ltth.app/install/install.ps1')); iex ($installer.TrimStart([char]0xFEFF))
#    Laedt den Installer als Bytes und decodiert ihn explizit, damit der Bootstrap
#    in Windows PowerShell und PowerShell 7 gleich laeuft.
#
#  Optionale Umgebungsvariablen:
#    $env:LTTH_VERSION     - zu installierende Version (Default: latest)
#    $env:LTTH_DIR         - Installationsverzeichnis (Default: $env:LOCALAPPDATA\LTTH)
#    $env:LTTH_PORT        - HTTP-Port (Default: 3000)
#    $env:LTTH_NO_BROWSER  - Browser nach Start nicht oeffnen
#    $env:LTTH_NO_LAUNCHER - Launcher nach Installation nicht starten
#    $env:LTTH_QUIET       - Reduzierte Ausgabe
#    $env:LTTH_NO_PAUSE    - Bei Fehler nicht auf Enter warten
#    $env:LTTH_REPO_BRANCH - Git-Branch fuer die Installation (Default: main)
# ==============================================================================

$ErrorActionPreference = 'Stop'

# ---------- Konfiguration ----------
$LTTHRepoOwner = if ($env:LTTH_REPO_OWNER) { $env:LTTH_REPO_OWNER } else { 'Loggableim' }
$LTTHRepoName  = if ($env:LTTH_REPO_NAME)  { $env:LTTH_REPO_NAME  } else { 'ltth.app' }
$LTTHRepoBranch = if ($env:LTTH_REPO_BRANCH) { $env:LTTH_REPO_BRANCH } else { 'main' }
$LTTHBranchRefSpec = "+refs/heads/$LTTHRepoBranch:refs/remotes/origin/$LTTHRepoBranch"
$LTTHVersion   = if ($env:LTTH_VERSION) { $env:LTTH_VERSION } else { 'latest' }
$script:LTTHInstallMode = if ($LTTHVersion -eq 'latest') { 'latest' } else { 'pinned' }
$script:LTTHVersion = $LTTHVersion
$LTTHDir       = if ($env:LTTH_DIR)         { $env:LTTH_DIR         } else { Join-Path $env:LOCALAPPDATA 'LTTH' }
$LTTHPort      = if ($env:LTTH_PORT)        { $env:LTTH_PORT        } else { '3000' }
$LTTHNoBrowser = if ($env:LTTH_NO_BROWSER)  { $env:LTTH_NO_BROWSER  } else { '0' }
$LTTHNoLauncher = if ($env:LTTH_NO_LAUNCHER) { $env:LTTH_NO_LAUNCHER } else { '0' }
$LTTHQuiet     = if ($env:LTTH_QUIET)       { $env:LTTH_QUIET       } else { '0' }
$LTTHNoPause   = if ($env:LTTH_NO_PAUSE)    { $env:LTTH_NO_PAUSE    } else { '0' }
$env:GIT_HTTP_VERSION = if ($env:GIT_HTTP_VERSION) { $env:GIT_HTTP_VERSION } else { 'HTTP/1.1' }
$script:LTTHNodePath = $null
$script:LTTHLauncherNodeMajor = 22
$script:LTTHLauncherNodeVersion = '22.14.0'
$script:LTTHInstallerLog = Join-Path ([System.IO.Path]::GetTempPath()) ("ltth-installer-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + ".log")
$script:LTTHSystemNetHttpReady = $false

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

# Windows PowerShell 5.1 laedt System.Net.Http nicht immer von selbst.
function Ensure-SystemNetHttp {
    if ($script:LTTHSystemNetHttpReady) {
        return $true
    }

    try {
        if (-not ([Type]::GetType('System.Net.Http.HttpClientHandler, System.Net.Http', $false))) {
            Add-Type -AssemblyName System.Net.Http -ErrorAction Stop
        }

        $script:LTTHSystemNetHttpReady = $true
        return $true
    } catch {
        return $false
    }
}

function Get-InstallerScriptUrl {
    if (
        $LTTHRepoOwner -eq 'Loggableim' -and
        $LTTHRepoName -eq 'ltth.app' -and
        $LTTHRepoBranch -eq 'main'
    ) {
        return 'https://ltth.app/install/install.ps1'
    }

    return "https://github.com/$LTTHRepoOwner/$LTTHRepoName/raw/$LTTHRepoBranch/install/install.ps1"
}

function Get-VersionJsonUrl {
    if (
        $LTTHRepoOwner -eq 'Loggableim' -and
        $LTTHRepoName -eq 'ltth.app' -and
        $LTTHRepoBranch -eq 'main'
    ) {
        return 'https://ltth.app/version.json'
    }

    return "https://raw.githubusercontent.com/$LTTHRepoOwner/$LTTHRepoName/$LTTHRepoBranch/version.json"
}

function Get-LauncherDownloadUrl {
    if (
        $LTTHRepoOwner -eq 'Loggableim' -and
        $LTTHRepoName -eq 'ltth.app' -and
        $LTTHRepoBranch -eq 'main'
    ) {
        return 'https://ltth.app/launcher.exe'
    }

    return "https://github.com/$LTTHRepoOwner/$LTTHRepoName/raw/$LTTHRepoBranch/launcher.exe"
}

function ConvertTo-CommandLineArgument {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Argument
    )

    if ([string]::IsNullOrEmpty($Argument)) {
        return '""'
    }

    if ($Argument -notmatch '[\s"]') {
        return $Argument
    }

    $builder = New-Object System.Text.StringBuilder
    [void]$builder.Append('"')
    $backslashes = 0

    foreach ($char in $Argument.ToCharArray()) {
        if ($char -eq '\') {
            $backslashes++
            continue
        }

        if ($char -eq '"') {
            [void]$builder.Append(('\' * ($backslashes * 2 + 1)))
            [void]$builder.Append('"')
            $backslashes = 0
            continue
        }

        if ($backslashes -gt 0) {
            [void]$builder.Append(('\' * $backslashes))
            $backslashes = 0
        }

        [void]$builder.Append($char)
    }

    if ($backslashes -gt 0) {
        [void]$builder.Append(('\' * ($backslashes * 2)))
    }

    [void]$builder.Append('"')
    return $builder.ToString()
}

function Join-CommandLineArguments {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    return ($Arguments | ForEach-Object { ConvertTo-CommandLineArgument -Argument $_ }) -join ' '
}

function Wait-ProcessWithSpinner {
    param(
        [Parameter(Mandatory = $true)]
        [System.Diagnostics.Process]$Process,
        [Parameter(Mandatory = $true)]
        [string]$Activity,
        [string]$Detail = ''
    )

    if ($LTTHQuiet -eq '1' -or -not [Environment]::UserInteractive) {
        $Process.WaitForExit()
        return
    }

    $frames = @('|', '/', '-', '\')
    $index = 0
    $lineWidth = 0

    try {
        while (-not $Process.HasExited) {
            $Process.Refresh()
            $frame = $frames[$index % $frames.Count]
            $message = if ([string]::IsNullOrWhiteSpace($Detail)) { $Activity } else { "${Activity}: $Detail" }
            $line = "[$frame] $message"
            if ($line.Length -lt $lineWidth) {
                $line = $line + (' ' * ($lineWidth - $line.Length))
            } else {
                $lineWidth = $line.Length
            }

            Write-Host -NoNewline ("`r$line")
            Start-Sleep -Milliseconds 120
            $index++
        }
    } finally {
        if ($LTTHQuiet -ne '1' -and [Environment]::UserInteractive) {
            Write-Host -NoNewline ("`r" + (' ' * 160) + "`r")
            Write-Host ""
        }
    }
}

function Invoke-DownloadFileWithProgress {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Uri,
        [Parameter(Mandatory = $true)]
        [string]$OutFile,
        [Parameter(Mandatory = $true)]
        [string]$Activity
    )

    if (-not (Ensure-SystemNetHttp)) {
        Log "$Activity - verwende Fallback-Download ohne HttpClient..."
        $fallbackParams = @{
            Uri = $Uri
            OutFile = $OutFile
            TimeoutSec = 120
            ErrorAction = 'Stop'
        }
        if ($PSVersionTable.PSVersion.Major -lt 6) {
            $fallbackParams.UseBasicParsing = $true
        }
        Invoke-WebRequest @fallbackParams
        return
    }

    $handler = $null
    $client = $null
    $handler = New-Object System.Net.Http.HttpClientHandler
    $handler.AllowAutoRedirect = $true
    $client = New-Object System.Net.Http.HttpClient($handler)
    $client.Timeout = [TimeSpan]::FromMinutes(20)
    $client.DefaultRequestHeaders.UserAgent.ParseAdd('ltth-installer')

    $response = $null
    $input = $null
    $output = $null
    try {
        $response = $client.GetAsync($Uri, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
        if (-not $response.IsSuccessStatusCode) {
            throw "HTTP $([int]$response.StatusCode) fuer $Uri"
        }

        $contentLength = $response.Content.Headers.ContentLength
        $input = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
        $output = [System.IO.File]::Open($OutFile, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
        $buffer = New-Object byte[] 65536
        $totalBytes = [int64]0
        $frames = @('|', '/', '-', '\')
        $index = 0
        $lineWidth = 0

        while (($read = $input.Read($buffer, 0, $buffer.Length)) -gt 0) {
            $output.Write($buffer, 0, $read)
            $totalBytes += $read

            if ($LTTHQuiet -eq '1' -or -not [Environment]::UserInteractive) {
                continue
            }

            $frame = $frames[$index % $frames.Count]
            $index++
            $receivedMb = [math]::Round($totalBytes / 1MB, 1)
            if ($contentLength -and $contentLength -gt 0) {
                $totalMb = [math]::Round($contentLength / 1MB, 1)
                $percent = [math]::Min(100, [math]::Round(($totalBytes / $contentLength) * 100, 0))
                $line = "[$frame] ${Activity}: $percent% ($receivedMb MB / $totalMb MB)"
            } else {
                $line = "[$frame] ${Activity}: $receivedMb MB"
            }

            if ($line.Length -lt $lineWidth) {
                $line = $line + (' ' * ($lineWidth - $line.Length))
            } else {
                $lineWidth = $line.Length
            }

            Write-Host -NoNewline ("`r$line")
            Start-Sleep -Milliseconds 30
        }
    } finally {
        if ($null -ne $output) {
            $output.Dispose()
        }
        if ($null -ne $input) {
            $input.Dispose()
        }
        if ($null -ne $response) {
            $response.Dispose()
        }
        if ($null -ne $client) {
            $client.Dispose()
        }
        if ($null -ne $handler) {
            $handler.Dispose()
        }
        if ($LTTHQuiet -ne '1' -and [Environment]::UserInteractive) {
            Write-Host -NoNewline ("`r" + (' ' * 160) + "`r")
            Write-Host ""
        }
    }
}

function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-CurrentPowerShellExecutable {
    $processPath = (Get-Process -Id $PID -ErrorAction SilentlyContinue).Path
    if (-not [string]::IsNullOrWhiteSpace($processPath) -and (Test-Path -LiteralPath $processPath)) {
        return $processPath
    }

    $pwshCommand = Get-Command pwsh -ErrorAction SilentlyContinue
    if ($pwshCommand -and -not [string]::IsNullOrWhiteSpace($pwshCommand.Source)) {
        return $pwshCommand.Source
    }

    $powershellCommand = Get-Command powershell -ErrorAction SilentlyContinue
    if ($powershellCommand -and -not [string]::IsNullOrWhiteSpace($powershellCommand.Source)) {
        return $powershellCommand.Source
    }

    return 'powershell.exe'
}

function Restart-InstallerAsAdministrator {
    # Website-Antworten koennen eine fuehrende UTF-8-BOM enthalten, daher vor `iex` trimmen.
    $installerCommand = "`$installer = [Text.Encoding]::UTF8.GetString((New-Object Net.WebClient).DownloadData('$(Get-InstallerScriptUrl)')); iex (`$installer.TrimStart([char]0xFEFF))"
    $encodedCommand = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($installerCommand))
    $psExe = Get-CurrentPowerShellExecutable

    Log "Fordere Admin-Freigabe an..."
    try {
        Start-Process -FilePath $psExe `
            -Verb RunAs `
            -ArgumentList @(
                '-NoProfile',
                '-ExecutionPolicy',
                'Bypass',
                '-EncodedCommand',
                $encodedCommand
            ) `
            | Out-Null
        Warn "Admin-Fenster gestartet. Die Installation laeuft dort weiter."
    } catch {
        Fail "Admin-Freigabe abgebrochen oder Elevation fehlgeschlagen: $($_.Exception.Message)"
    }
}

function Ensure-Administrator {
    if (Test-Administrator) {
        return $true
    }

    Restart-InstallerAsAdministrator
    return $false
}

function Refresh-ProcessPath {
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
}

function Test-SupportedNodeMajor {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Major
    )

    return ($Major -eq $script:LTTHLauncherNodeMajor)
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

function Get-NodeInstallerInfo {
    # Match the launcher runtime line so Windows installs do not fetch a second Node branch later.
    return [pscustomobject]@{
        Version = $script:LTTHLauncherNodeVersion
        Major = $script:LTTHLauncherNodeMajor
    }
}

function Get-PreferredGitInfo {
    $candidates = New-Object System.Collections.Generic.List[string]

    $gitCommand = Get-Command git -ErrorAction SilentlyContinue
    if ($gitCommand) {
        foreach ($candidate in @($gitCommand.Source, $gitCommand.Path, $gitCommand.Definition)) {
            if (-not [string]::IsNullOrWhiteSpace($candidate) -and $candidate -match 'git(\.exe)?$') {
                $candidates.Add($candidate)
            }
        }
    }

    foreach ($basePath in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA)) {
        if (-not [string]::IsNullOrWhiteSpace($basePath)) {
            foreach ($relativePath in @(
                'Git\cmd\git.exe',
                'Git\bin\git.exe',
                'Git\usr\bin\git.exe',
                'Programs\Git\cmd\git.exe',
                'Programs\Git\bin\git.exe'
            )) {
                $candidates.Add((Join-Path $basePath $relativePath))
            }
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

        try {
            if (-not (Test-Path -LiteralPath $normalized)) {
                continue
            }
            $versionText = & $normalized --version
            if ([string]::IsNullOrWhiteSpace($versionText)) {
                continue
            }

            return [pscustomobject]@{
                Path = $normalized
                Version = $versionText
            }
        } catch {
            continue
        }
    }

    return $null
}

function Set-PreferredGitEnvironment {
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$GitInfo
    )

    $gitDir = Split-Path -Parent $GitInfo.Path
    if (-not [string]::IsNullOrWhiteSpace($gitDir)) {
        $env:Path = "$gitDir;$env:Path"
    }
}

function Install-GitViaWinget {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        return $false
    }

    Log "Installiere Git via winget..."
    try {
        $process = Start-Process -FilePath 'winget' `
            -ArgumentList @(
                'install',
                '--id', 'Git.Git',
                '-e',
                '--source', 'winget',
                '--silent',
                '--accept-package-agreements',
                '--accept-source-agreements'
            ) `
            -WindowStyle Hidden `
            -PassThru

        Wait-ProcessWithSpinner -Process $process -Activity 'Git via winget wird installiert'

        if ($process.ExitCode -ne 0) {
            throw "winget install Git.Git fehlgeschlagen (ExitCode $($process.ExitCode))."
        }
    } catch {
        Warn "winget-Git-Installation fehlgeschlagen: $($_.Exception.Message)"
        return $false
    }

    Refresh-ProcessPath
    return [bool](Get-PreferredGitInfo)
}

function Get-GitInstallerDownloadUrl {
    $installPage = Invoke-WebRequest -Uri 'https://git-scm.com/install/windows' -TimeoutSec 30 -ErrorAction Stop
    $html = if ($null -ne $installPage.Content) { [string]$installPage.Content } else { [string]$installPage }
    $architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()

    if ($architecture -eq 'arm64') {
        $pattern = 'https://github\.com/git-for-windows/git/releases/download/[^"]+/Git-[^"]+-arm64\.exe'
    } else {
        $pattern = 'https://github\.com/git-for-windows/git/releases/download/[^"]+/Git-[^"]+-64-bit\.exe'
    }

    $match = [regex]::Match($html, $pattern)
    if (-not $match.Success) {
        throw "Konnte den offiziellen Git-for-Windows-Downloadlink nicht ermitteln."
    }

    return $match.Value
}

function Install-GitFromOfficialSource {
    Log "Installiere Git ueber die offizielle Git-for-Windows-Quelle..."

    $downloadUrl = Get-GitInstallerDownloadUrl
    $installerPath = Join-Path ([System.IO.Path]::GetTempPath()) ("git-installer-" + [guid]::NewGuid().ToString('N') + ".exe")
    $installDir = Join-Path $env:LOCALAPPDATA 'Programs\Git'
    $arguments = @(
        '/VERYSILENT',
        '/NORESTART',
        '/NOCANCEL',
        '/SP-',
        '/CLOSEAPPLICATIONS',
        '/RESTARTAPPLICATIONS',
        '/COMPONENTS=icons,ext\reg\shellhere,assoc,assoc_sh',
        "/DIR=$installDir"
    )

    try {
        Invoke-DownloadFileWithProgress -Uri $downloadUrl -OutFile $installerPath -Activity 'Git-Installer wird heruntergeladen'
        $process = Start-Process -FilePath $installerPath `
            -ArgumentList $arguments `
            -WindowStyle Hidden `
            -PassThru

        Wait-ProcessWithSpinner -Process $process -Activity 'Git-Installer wird ausgeführt'

        if ($process.ExitCode -ne 0) {
            throw "Git-Installer fehlgeschlagen (ExitCode $($process.ExitCode))."
        }
    } finally {
        Remove-Item -LiteralPath $installerPath -Force -ErrorAction SilentlyContinue
    }

    Refresh-ProcessPath
    return [bool](Get-PreferredGitInfo)
}

function Install-GitAutomatically {
    if (Install-GitViaWinget) {
        return $true
    }

    try {
        return Install-GitFromOfficialSource
    } catch {
        Warn "Offizielle Git-for-Windows-Installation fehlgeschlagen: $($_.Exception.Message)"
        return $false
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
    $stdout = ''
    $stderr = ''
    $proc = $null

    try {
        $startInfo = New-Object System.Diagnostics.ProcessStartInfo
        $startInfo.FileName = 'git'
        $startInfo.Arguments = Join-CommandLineArguments -Arguments $Arguments
        $startInfo.WorkingDirectory = $WorkingDirectory
        $startInfo.UseShellExecute = $false
        $startInfo.RedirectStandardOutput = $true
        $startInfo.RedirectStandardError = $true
        $startInfo.CreateNoWindow = $true
        $startInfo.EnvironmentVariables['GIT_HTTP_VERSION'] = if ($env:GIT_HTTP_VERSION) { $env:GIT_HTTP_VERSION } else { 'HTTP/1.1' }

        $proc = [System.Diagnostics.Process]::Start($startInfo)
        Wait-ProcessWithSpinner -Process $proc -Activity ("git " + ($Arguments -join ' ')) -Detail $WorkingDirectory

        $stdout = $proc.StandardOutput.ReadToEnd()
        $stderr = $proc.StandardError.ReadToEnd()
        $proc.WaitForExit()

        if (-not [string]::IsNullOrWhiteSpace($stdout)) {
            Set-Content -LiteralPath $stdoutLog -Value $stdout -Encoding UTF8
        }
        if (-not [string]::IsNullOrWhiteSpace($stderr)) {
            Set-Content -LiteralPath $stderrLog -Value $stderr -Encoding UTF8
        }
    } catch {
        throw "Git konnte nicht gestartet werden: $($_.Exception.Message)"
    }

    try {
        if ($proc.ExitCode -ne 0) {
            $stdoutRaw = if (-not [string]::IsNullOrWhiteSpace($stdout)) { $stdout } elseif (Test-Path $stdoutLog) { Get-Content -Path $stdoutLog -Raw } else { '' }
            $stderrRaw = if (-not [string]::IsNullOrWhiteSpace($stderr)) { $stderr } elseif (Test-Path $stderrLog) { Get-Content -Path $stderrLog -Raw } else { '' }
            $stdout = if ($null -ne $stdoutRaw) { $stdoutRaw.Trim() } else { '' }
            $stderr = if ($null -ne $stderrRaw) { $stderrRaw.Trim() } else { '' }
            $details = @($stderr, $stdout) | Where-Object { $_ }

            if ($null -ne $details -and $details.Count -gt 0) {
                throw ("git {0} fehlgeschlagen: {1}" -f ($Arguments -join ' '), ($details -join ' | '))
            }

            throw ("git {0} fehlgeschlagen (ExitCode {1})" -f ($Arguments -join ' '), $proc.ExitCode)
        }
    } finally {
        if ($null -ne $proc) {
            $proc.Dispose()
        }
        Remove-Item -LiteralPath $stdoutLog, $stderrLog -Force -ErrorAction SilentlyContinue
    }
}

function Invoke-GitClone {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoUrl
    )

    Log "Klone Repository nach $LTTHDir..."
    $cloneArgs = @('clone', '--depth', '1', '--branch', $LTTHRepoBranch, '--single-branch', '--no-tags', '--filter=blob:none', $RepoUrl, $LTTHDir)
    try {
        Invoke-Git -Arguments $cloneArgs
    } catch {
        Warn "Gefilterter Git-Clone fehlgeschlagen; versuche Standard-Clone..."
        if (Test-Path -LiteralPath $LTTHDir) {
            Remove-Item -LiteralPath $LTTHDir -Recurse -Force -ErrorAction SilentlyContinue
        }
        Invoke-Git -Arguments @('clone', '--depth', '1', '--branch', $LTTHRepoBranch, '--single-branch', '--no-tags', $RepoUrl, $LTTHDir)
    }

    if ($script:LTTHInstallMode -ne 'latest') {
        try {
            Invoke-Git -Arguments @('fetch', '--depth', '1', 'origin', "refs/tags/v${LTTHVersion}:refs/tags/v${LTTHVersion}") -WorkingDirectory $LTTHDir
            Invoke-Git -Arguments @('checkout', '--quiet', "v$LTTHVersion") -WorkingDirectory $LTTHDir
        } catch {
            try {
                Invoke-Git -Arguments @('fetch', '--depth', '1', 'origin', "refs/tags/${LTTHVersion}:refs/tags/${LTTHVersion}") -WorkingDirectory $LTTHDir
                Invoke-Git -Arguments @('checkout', '--quiet', "$LTTHVersion") -WorkingDirectory $LTTHDir
            } catch {
                Warn "Tag nicht verfuegbar, nutze Branch $LTTHRepoBranch..."
            }
        }
    }
}

function Restore-RepositoryFromFreshClone {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoUrl,
        [string]$Reason
    )

    $reasonText = if ([string]::IsNullOrWhiteSpace($Reason)) { '' } else { " ($Reason)" }
    $parentDir = Split-Path -Parent $LTTHDir
    $leafDir = Split-Path -Leaf $LTTHDir
    $backupDir = Join-Path $parentDir ($leafDir + '.broken-' + [guid]::NewGuid().ToString('N'))
    $backupCreated = $false

    Warn "Bestehende Installation ist nicht sauber aktualisierbar$reasonText; erstelle frische Kopie..."

    try {
        if (Test-Path -LiteralPath $backupDir) {
            Remove-Item -LiteralPath $backupDir -Recurse -Force -ErrorAction SilentlyContinue
        }
        Move-Item -LiteralPath $LTTHDir -Destination $backupDir -Force
        $backupCreated = $true
    } catch {
        Warn "Bestehende Installation konnte nicht in ein Backup verschoben werden; ueberschreibe sie direkt."
        if (Test-Path -LiteralPath $LTTHDir) {
            Remove-Item -LiteralPath $LTTHDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    try {
        Invoke-GitClone -RepoUrl $RepoUrl
        if ($backupCreated) {
            Remove-Item -LiteralPath $backupDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    } catch {
        if (Test-Path -LiteralPath $LTTHDir) {
            Remove-Item -LiteralPath $LTTHDir -Recurse -Force -ErrorAction SilentlyContinue
        }
        if ($backupCreated -and (Test-Path -LiteralPath $backupDir)) {
            Move-Item -LiteralPath $backupDir -Destination $LTTHDir -Force
        }
        throw
    }
}

# ---------- Version ermitteln ----------
function Resolve-Version {
    if ($script:LTTHInstallMode -eq 'latest') {
        Log "Ermittle neueste Version vom Branch $LTTHRepoBranch..."
        try {
            $versionInfo = Invoke-RestMethod -Uri (Get-VersionJsonUrl) -TimeoutSec 15 -ErrorAction Stop
            $resolvedVersion = $null
            if ($versionInfo -and $versionInfo.downloadVersion) {
                $resolvedVersion = $versionInfo.downloadVersion
            } elseif ($versionInfo -and $versionInfo.version) {
                $resolvedVersion = $versionInfo.version
            }

            if ([string]::IsNullOrWhiteSpace($resolvedVersion)) {
                throw "version.json liefert keine installierbare Version."
            }

            $LTTHVersion = $resolvedVersion
            Ok "Neueste Version aus Branch ${LTTHRepoBranch}: v$LTTHVersion"
        } catch {
            Fail "Konnte version.json von Branch $LTTHRepoBranch nicht laden: $($_.Exception.Message)"
        }
    } else {
        Ok "Verwende angegebene Version: v$LTTHVersion"
    }

    $script:LTTHVersion = $LTTHVersion
}

# ---------- Git pruefen ----------
function Ensure-Git {
    $gitInfo = Get-PreferredGitInfo
    if ($gitInfo) {
        Set-PreferredGitEnvironment -GitInfo $gitInfo
        Ok "Git $($gitInfo.Version) gefunden"
        return
    }

    Log "Git fehlt - installiere es automatisch..."
    if (Install-GitAutomatically) {
        $gitInfo = Get-PreferredGitInfo
        if ($gitInfo) {
            Set-PreferredGitEnvironment -GitInfo $gitInfo
            Ok "Git $($gitInfo.Version) gefunden"
            return
        }
    }

    Err "Git konnte nicht automatisch installiert werden."
    Err "Installationslog: $script:LTTHInstallerLog"
    Err "Bei Bedarf kannst du Git manuell installieren: https://git-scm.com/download/win"
    Fail "Git konnte nicht bereitgestellt werden."
}

# ---------- Node.js fallback helpers (not used by Windows main path) ----------
function Install-NodeViaWinget {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        return $false
    }

    $nodeInfo = Get-NodeInstallerInfo
    Log "Installiere Node.js $($nodeInfo.Version) via winget..."
    try {
        $process = Start-Process -FilePath 'winget' `
            -ArgumentList @(
                'install',
                '--id', 'OpenJS.NodeJS.LTS',
                '--version', $nodeInfo.Version,
                '-e',
                '--source', 'winget',
                '--silent',
                '--accept-package-agreements',
                '--accept-source-agreements'
            ) `
            -WindowStyle Hidden `
            -PassThru

        Wait-ProcessWithSpinner -Process $process -Activity 'Node.js via winget wird installiert'

        if ($process.ExitCode -ne 0) {
            throw "winget install OpenJS.NodeJS.LTS fehlgeschlagen (ExitCode $($process.ExitCode))."
        }
    } catch {
        Warn "winget-Node-Installation fehlgeschlagen: $($_.Exception.Message)"
        return $false
    }

    Refresh-ProcessPath
    return [bool](Get-PreferredNodeInfo)
}

function Install-NodeFromOfficialSource {
    $nodeInfo = Get-NodeInstallerInfo
    Log "Installiere Node.js $($nodeInfo.Version) ueber die offizielle Node.js-Quelle..."
    $architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
    if ($architecture -eq 'arm64') {
        $archLabel = 'arm64'
    } else {
        $archLabel = 'x64'
    }

    $version = $nodeInfo.Version
    $downloadUrl = "https://nodejs.org/dist/v$version/node-v$version-$archLabel.msi"
    $msiPath = Join-Path ([System.IO.Path]::GetTempPath()) ("node-installer-" + [guid]::NewGuid().ToString('N') + ".msi")

    try {
        Invoke-DownloadFileWithProgress -Uri $downloadUrl -OutFile $msiPath -Activity 'Node.js-Installer wird heruntergeladen'
        $process = Start-Process -FilePath 'msiexec.exe' `
            -ArgumentList @('/i', $msiPath, '/qn', '/norestart') `
            -WindowStyle Hidden `
            -PassThru

        Wait-ProcessWithSpinner -Process $process -Activity 'Node.js MSI wird installiert'

        if ($process.ExitCode -ne 0) {
            throw "Node.js MSI-Installer fehlgeschlagen (ExitCode $($process.ExitCode))."
        }
    } finally {
        Remove-Item -LiteralPath $msiPath -Force -ErrorAction SilentlyContinue
    }

    Refresh-ProcessPath
    return [bool](Get-PreferredNodeInfo)
}

function Install-NodeAutomatically {
    if (Install-NodeViaWinget) {
        return $true
    }

    try {
        return Install-NodeFromOfficialSource
    } catch {
        Warn "Offizielle Node.js-Installation fehlgeschlagen: $($_.Exception.Message)"
        return $false
    }
}

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
        Warn "Node.js $installedVersion ist zwar installiert, aber LTTH braucht Node.js 22 LTS."
    }

    Log "Node.js fehlt - installiere es automatisch..."
    if (Install-NodeAutomatically) {
        $nodeInfo = Get-PreferredNodeInfo
        if ($nodeInfo) {
            Set-PreferredNodeEnvironment -NodeInfo $nodeInfo
            Ok "Node.js $($nodeInfo.Version) gefunden"
            return
        }
    }

    Err "Node.js konnte nicht automatisch installiert werden."
    Err "Installationslog: $script:LTTHInstallerLog"
    Err "Bei Bedarf kannst du Node.js manuell installieren: https://nodejs.org/"
    Fail "Node.js konnte nicht bereitgestellt werden."
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
            Invoke-DownloadFileWithProgress -Uri (Get-LauncherDownloadUrl) -OutFile $tmpLauncher -Activity 'Launcher.exe wird repariert'
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
        $refreshRequired = $false
        $refreshReason = ''
        try {
            Invoke-Git -Arguments @('fetch', '--tags', '--prune', 'origin', $LTTHBranchRefSpec) -WorkingDirectory $LTTHDir
        } catch {
            $refreshRequired = $true
            $refreshReason = $_.Exception.Message
            Warn "Git Fetch fehlgeschlagen ($refreshReason); pruefe frische Kopie..."
        }

        if (-not $refreshRequired) {
            if ($script:LTTHInstallMode -eq 'latest') {
                try {
                    Invoke-Git -Arguments @('checkout', '--quiet', $LTTHRepoBranch) -WorkingDirectory $LTTHDir
                } catch {
                    try {
                        Invoke-Git -Arguments @('checkout', '--quiet', '-B', $LTTHRepoBranch, "origin/$LTTHRepoBranch") -WorkingDirectory $LTTHDir
                    } catch {
                        $refreshRequired = $true
                        $refreshReason = $_.Exception.Message
                        Warn "Branch-Checkout fehlgeschlagen ($refreshReason); pruefe frische Kopie..."
                    }
                }
            } else {
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
                    try {
                        Warn "Gewuenschte Version nicht gefunden, nutze Standard-Branch $LTTHRepoBranch..."
                        Invoke-Git -Arguments @('checkout', '--quiet', $LTTHRepoBranch) -WorkingDirectory $LTTHDir
                    } catch {
                        $refreshRequired = $true
                        $refreshReason = $_.Exception.Message
                        Warn "Branch-Checkout fehlgeschlagen ($refreshReason); pruefe frische Kopie..."
                    }
                }
            }
        }

        if ($refreshRequired) {
            Restore-RepositoryFromFreshClone -RepoUrl $repoUrl -Reason $refreshReason
        }
    } else {
        try {
            Invoke-GitClone -RepoUrl $repoUrl
        } catch {
            Fail "Repository konnte nicht vom Branch $LTTHRepoBranch geklont werden: $($_.Exception.Message)"
        }
    }
    Ok "Quellcode bereit in $LTTHDir"
}
# ---------- Fallback Dependencies ----------
function Install-Deps {
    Log "Installiere npm-Abhaengigkeiten fuer den direkten Node-Fallback (kann einige Minuten dauern)..."
    $appDir = Join-Path $LTTHDir 'app'
    Push-Location $appDir
    try {
        $npmArgs = @('install', '--no-audit', '--no-fund', '--loglevel=error')
        $npmExecutable = Get-NpmExecutable -NodePath $script:LTTHNodePath

        $npmLogBase = Join-Path $LTTHDir ("ltth-npm-" + [guid]::NewGuid().ToString('N'))
        $stdoutLog = "$npmLogBase.out.log"
        $stderrLog = "$npmLogBase.err.log"
        $npmStdout = ''
        $npmStderr = ''
        $process = $null

        try {
            $startInfo = New-Object System.Diagnostics.ProcessStartInfo
            $startInfo.FileName = $npmExecutable
            $startInfo.Arguments = Join-CommandLineArguments -Arguments $npmArgs
            $startInfo.WorkingDirectory = $appDir
            $startInfo.UseShellExecute = $false
            $startInfo.RedirectStandardOutput = $true
            $startInfo.RedirectStandardError = $true
            $startInfo.CreateNoWindow = $true

            $process = [System.Diagnostics.Process]::Start($startInfo)

            Wait-ProcessWithSpinner -Process $process -Activity 'npm install wird ausgefuehrt'

            $npmStdout = $process.StandardOutput.ReadToEnd()
            $npmStderr = $process.StandardError.ReadToEnd()
            $process.WaitForExit()

            if (-not [string]::IsNullOrWhiteSpace($npmStdout)) {
                Set-Content -LiteralPath $stdoutLog -Value $npmStdout -Encoding UTF8
            }
            if (-not [string]::IsNullOrWhiteSpace($npmStderr)) {
                Set-Content -LiteralPath $stderrLog -Value $npmStderr -Encoding UTF8
            }
            $npmExitCode = $process.ExitCode
        } catch {
            Fail "npm konnte nicht gestartet werden: $($_.Exception.Message)"
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
        if ($null -ne $process) {
            $process.Dispose()
        }
        Pop-Location
    }
    Ok "Abhaengigkeiten installiert"
}

# ---------- Launcher ----------
function Install-Launcher {
    $launcherPath = Join-Path $LTTHDir 'launcher.exe'
    $downloadLauncherPath = Join-Path $LTTHDir 'downloads\launcher.exe'
    $launcherUrl = Get-LauncherDownloadUrl
    $tmpLauncher = Join-Path ([System.IO.Path]::GetTempPath()) ("ltth-launcher-" + [guid]::NewGuid().ToString('N') + ".exe")

    try {
        $launcherMatchesDownloads = $false
        if ((Test-Path $launcherPath) -and (Test-Path $downloadLauncherPath)) {
            $launcherMatchesDownloads = ((Get-FileHash -Algorithm SHA256 -LiteralPath $launcherPath).Hash -eq (Get-FileHash -Algorithm SHA256 -LiteralPath $downloadLauncherPath).Hash)
        }

        if ((-not (Test-Path $launcherPath)) -or $launcherMatchesDownloads) {
            Log "Lade LTTH Windows Launcher herunter..."
            Invoke-DownloadFileWithProgress -Uri $launcherUrl -OutFile $tmpLauncher -Activity 'LTTH Launcher wird heruntergeladen'
            Move-Item -LiteralPath $tmpLauncher -Destination $launcherPath -Force
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
        return $null
    } finally {
        Remove-Item -LiteralPath $tmpLauncher -Force -ErrorAction SilentlyContinue
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

    return $null
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

    if (-not (Ensure-Administrator)) {
        return
    }

    Ensure-Git
    Resolve-Version
    Download-Source
    $launcherPath = Install-Launcher
    if (-not $launcherPath) {
        Fail "Launcher konnte nicht bereitgestellt werden. Der Windows-Installer installiert Node.js nicht mehr selbst; bitte Launcher-Log und Netzwerkzugriff pruefen."
    }

    Log "Windows-Installer uebergibt jetzt an den Launcher; Node.js, npm install und Native-Module-Rebuilds laufen dort beim ersten Start."

    $launcherStarted = Start-Launcher -LauncherPath $launcherPath
    if (-not $launcherStarted) {
        Fail "Launcher konnte nicht gestartet werden. Der Windows-Installer installiert Node.js nicht mehr selbst; bitte launcher.exe manuell starten und die Launcher-Logs pruefen."
    }

    $desktopShortcutPath = $null
    $startMenuShortcutPath = $null

    $shortcutConfig = Get-ShortcutConfig -LauncherPath $launcherPath
    if ($shortcutConfig) {
        $desktopShortcutPath = Create-DesktopShortcut -ShortcutConfig $shortcutConfig
        $startMenuShortcutPath = Create-StartMenuShortcut -ShortcutConfig $shortcutConfig
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
