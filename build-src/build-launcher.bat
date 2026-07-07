@echo off
REM Build script for the LTTH Windows launcher
REM This script builds launcher.exe only

echo ================================================
echo   LTTH Launcher Build Script
echo ================================================
echo.

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

cd /d "%~dp0"
for %%I in ("%~dp0..") do set "PROJECT_ROOT=%%~fI"

echo Installing dependencies...
go mod download
go mod verify
echo.

echo Building launcher.exe (Windows GUI)...
go build -o "%PROJECT_ROOT%\launcher.exe" -ldflags "-H windowsgui -s -w" launcher-gui.go sysproc_windows.go
if %errorlevel% neq 0 (
    echo Error building launcher.exe
    pause
    exit /b 1
)
echo Built launcher.exe
echo.

echo ================================================
echo   Build Complete!
echo ================================================
echo.

cd /d "%PROJECT_ROOT%"
echo launcher.exe:
dir launcher.exe | find "launcher.exe"
echo.
echo launcher.exe built successfully!
echo.
pause
