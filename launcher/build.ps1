# Build-Script für LTTH Launcher
# Erstellt launcher.exe für Windows x64

param(
    [switch]$Debug = $false,
    [switch]$DownloadIcon = $false
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  LTTH Launcher Build Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Prüfe Go Installation
Write-Host "[1/5] Prüfe Go Installation..." -ForegroundColor Yellow
try {
    $goVersion = go version
    Write-Host "  ✓ $goVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Go ist nicht installiert!" -ForegroundColor Red
    Write-Host "  Bitte installiere Go von https://golang.org/dl/" -ForegroundColor Yellow
    exit 1
}

# Icon herunterladen (optional)
if ($DownloadIcon) {
    Write-Host "[2/5] Lade Icon herunter..." -ForegroundColor Yellow
    $iconUrl = "https://ltth.app/assets/ltthicon.png"
    $iconPath = "assets/icon.png"
    
    if (!(Test-Path "assets")) {
        New-Item -ItemType Directory -Path "assets" | Out-Null
    }
    
    try {
        Invoke-WebRequest -Uri $iconUrl -OutFile $iconPath
        Write-Host "  ✓ Icon gespeichert: $iconPath" -ForegroundColor Green
    } catch {
        Write-Host "  ⚠ Icon konnte nicht heruntergeladen werden" -ForegroundColor Yellow
    }
} else {
    Write-Host "[2/5] Icon-Download übersprungen (nutze -DownloadIcon)" -ForegroundColor Gray
}

# Dependencies herunterladen
Write-Host "[3/5] Lade Dependencies..." -ForegroundColor Yellow
go mod tidy
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ Fehler beim Laden der Dependencies!" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ Dependencies geladen" -ForegroundColor Green

# Build-Flags setzen
Write-Host "[4/5] Baue Launcher..." -ForegroundColor Yellow

$ldflags = "-H windowsgui"
if (!$Debug) {
    $ldflags = "-H windowsgui -s -w"  # Strip debug info für kleinere Datei
}

$env:GOOS = "windows"
$env:GOARCH = "amd64"
$env:CGO_ENABLED = "1"

$outputFile = "launcher.exe"

# Build ausführen
go build -ldflags="$ldflags" -o $outputFile .

if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ Build fehlgeschlagen!" -ForegroundColor Red
    exit 1
}

# Ergebnis prüfen
Write-Host "[5/5] Build abgeschlossen!" -ForegroundColor Yellow
$fileInfo = Get-Item $outputFile
$sizeMB = [math]::Round($fileInfo.Length / 1MB, 2)

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Build erfolgreich!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Datei: $outputFile" -ForegroundColor White
Write-Host "  Größe: $sizeMB MB" -ForegroundColor White
Write-Host ""

if ($Debug) {
    Write-Host "  ⚠ Debug-Build (größere Datei)" -ForegroundColor Yellow
} else {
    Write-Host "  ✓ Release-Build (optimiert)" -ForegroundColor Green
}

Write-Host ""
Write-Host "Nächste Schritte:" -ForegroundColor Cyan
Write-Host "  1. Teste den Launcher: .\launcher.exe" -ForegroundColor White
Write-Host "  2. Für Distribution: Kopiere launcher.exe zum Benutzer" -ForegroundColor White
Write-Host ""
