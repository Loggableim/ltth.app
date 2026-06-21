@echo off
REM Build script for LTTH launcher binaries
REM This script builds the launchers for Windows

echo ================================================
echo   LTTH Launcher Build Script
echo ================================================
echo.

REM Check if Go is installed
where go >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Go is not installed
    echo Please install Go 1.18 or higher from https://golang.org/
    pause
    exit /b 1
)

echo Go version:
go version
echo.

REM Navigate to build-src directory
cd /d "%~dp0"

REM Set project root (parent directory of build-src)
for %%I in ("%~dp0..") do set "PROJECT_ROOT=%%~fI"

REM Download dependencies
echo Installing dependencies...
go mod download
go mod verify
echo.

REM Build for Windows
echo Building launcher.exe (Windows GUI)...
go build -o "%PROJECT_ROOT%\launcher.exe" -ldflags "-H windowsgui -s -w" launcher-gui.go sysproc_windows.go
if %errorlevel% neq 0 (
    echo Error building launcher.exe
    pause
    exit /b 1
)
echo ✓ Built launcher.exe
echo.

echo Building launcher-console.exe (Windows CLI)...
go build -o "%PROJECT_ROOT%\launcher-console.exe" -ldflags "-s -w" launcher.go
if %errorlevel% neq 0 (
    echo Error building launcher-console.exe
    pause
    exit /b 1
)
echo ✓ Built launcher-console.exe
echo.

echo Building dev_launcher.exe (Windows GUI with console)...
go build -o "%PROJECT_ROOT%\dev_launcher.exe" -ldflags "-s -w" dev-launcher.go
if %errorlevel% neq 0 (
    echo Error building dev_launcher.exe
    pause
    exit /b 1
)
echo ✓ Built dev_launcher.exe
echo.

echo ================================================
echo   Build Complete!
echo ================================================
echo.

REM Show file sizes
cd /d "%PROJECT_ROOT%"
echo launcher.exe:
dir launcher.exe | find "launcher.exe"
echo.
echo launcher-console.exe:
dir launcher-console.exe | find "launcher-console.exe"
echo.
echo dev_launcher.exe:
dir dev_launcher.exe | find "dev_launcher.exe"
echo.

echo All launchers built successfully!
echo.
pause
