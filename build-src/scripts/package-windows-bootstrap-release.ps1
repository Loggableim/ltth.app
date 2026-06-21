param(
  [Parameter(Mandatory = $true)]
  [string]$Version,

  [Parameter(Mandatory = $true)]
  [string]$Repository,

  [string]$NodeRuntimeVersion = "22.14.0",

  [switch]$PayloadSigned,

  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
)

$ErrorActionPreference = 'Stop'

$distDir = Join-Path $ProjectRoot 'dist'
$payloadRoot = Join-Path $distDir 'payload-windows-amd64'
$runtimeDir = Join-Path $payloadRoot 'runtime'
$nodeDir = Join-Path $runtimeDir 'node'
$nodeZipUrl = "https://nodejs.org/dist/v$NodeRuntimeVersion/node-v$NodeRuntimeVersion-win-x64.zip"
$nodeZipPath = Join-Path $runtimeDir 'node-portable.zip'
$excludeConfigPath = Join-Path $ProjectRoot 'build-src\payload-app-excludes.json'

Remove-Item -Recurse -Force $payloadRoot -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $payloadRoot | Out-Null
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

Copy-Item (Join-Path $ProjectRoot 'launcher.exe') (Join-Path $payloadRoot 'launcher.exe')
Copy-Item (Join-Path $ProjectRoot 'ltth-bootstrapper.exe') (Join-Path $distDir 'ltth-bootstrapper.exe')
Copy-Item (Join-Path $ProjectRoot 'icon.ico') (Join-Path $payloadRoot 'icon.ico')
Copy-Item (Join-Path $ProjectRoot 'CHANGELOG.md') (Join-Path $payloadRoot 'CHANGELOG.md')
Copy-Item -Recurse (Join-Path $ProjectRoot 'app') (Join-Path $payloadRoot 'app')
Copy-Item -Recurse (Join-Path $ProjectRoot 'build-src\assets') (Join-Path $payloadRoot 'assets')
Copy-Item -Recurse (Join-Path $ProjectRoot 'build-src\locales') (Join-Path $payloadRoot 'locales')

$excludeConfig = Get-Content -Raw $excludeConfigPath | ConvertFrom-Json
foreach ($relativePath in $excludeConfig.paths) {
  $candidate = Join-Path $payloadRoot "app\$relativePath"
  if (Test-Path $candidate) {
    Remove-Item -Recurse -Force $candidate
  }
}

Invoke-WebRequest -Uri $nodeZipUrl -OutFile $nodeZipPath
Expand-Archive -Path $nodeZipPath -DestinationPath $runtimeDir -Force
Remove-Item $nodeZipPath -Force

$expandedNodeRoot = Get-ChildItem -Path $runtimeDir -Directory | Where-Object { $_.Name -like 'node-v*-win-x64' } | Select-Object -First 1
if (-not $expandedNodeRoot) {
  throw 'Portable Node.js archive did not extract as expected.'
}

if (Test-Path $nodeDir) {
  Remove-Item -Recurse -Force $nodeDir
}
Move-Item $expandedNodeRoot.FullName $nodeDir
Set-Content -Path (Join-Path $nodeDir 'version.txt') -Value $NodeRuntimeVersion -NoNewline

$payloadName = "ltth-payload-windows-amd64-$Version.zip"
$payloadPath = Join-Path $distDir $payloadName
if (Test-Path $payloadPath) {
  Remove-Item $payloadPath -Force
}
Compress-Archive -Path (Join-Path $payloadRoot '*') -DestinationPath $payloadPath

$sha = (Get-FileHash -Path $payloadPath -Algorithm SHA256).Hash.ToLowerInvariant()
$size = (Get-Item $payloadPath).Length
$payloadUrl = "https://github.com/$Repository/releases/download/v$Version/$payloadName"

$manifest = @{
  version = $Version
  channel = 'stable'
  notes = 'Windows payload for LTTH thin bootstrapper installs.'
  payloads = @(
    @{
      platform = 'windows'
      arch = 'amd64'
      payloadUrl = $payloadUrl
      payloadSha256 = $sha
      payloadSize = $size
      minBootstrapVersion = '0.1.0'
      archiveFormat = 'zip'
      signed = [bool]$PayloadSigned
    }
  )
} | ConvertTo-Json -Depth 6

Set-Content -Path (Join-Path $distDir 'stable.json') -Value $manifest

Write-Host "Created:"
Write-Host " - $payloadPath"
Write-Host " - $(Join-Path $distDir 'stable.json')"
Write-Host " - $(Join-Path $distDir 'ltth-bootstrapper.exe')"
