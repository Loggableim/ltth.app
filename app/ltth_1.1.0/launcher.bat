@echo off
REM ================================================
REM   TikTok Stream Tool - Launcher
REM ================================================
echo.
echo ================================================
echo   TikTok Stream Tool - Launcher
echo ================================================
echo.

REM Check if Node.js is installed
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ===============================================
    echo   FEHLER: Node.js ist nicht installiert!
    echo ===============================================
    echo.
    echo Bitte installiere Node.js von:
    echo https://nodejs.org
    echo.
    echo Empfohlen: Node.js LTS Version 18 oder 20
    echo.
    pause
    exit /b 1
)

REM Show Node.js version
echo Node.js Version:
node --version
echo.

REM Get current directory
set "APP_DIR=%~dp0app"

REM Check if app directory exists
if not exist "%APP_DIR%" (
    echo Fehler: app Verzeichnis nicht gefunden in %~dp0
    echo.
    pause
    exit /b 1
)

REM Check if node_modules exists
if not exist "%APP_DIR%\node_modules" (
    echo Installiere Abhaengigkeiten... (Das kann beim ersten Start ein paar Minuten dauern)
    cd /d "%APP_DIR%"
    call npm install --cache false
    if %errorlevel% neq 0 (
        echo.
        echo ===============================================
        echo   FEHLER: Installation fehlgeschlagen
        echo ===============================================
        echo.
        pause
        exit /b 1
    )
    echo.
    echo Installation erfolgreich abgeschlossen!
    echo.
)

REM Start the tool
echo Starte Tool...
echo.
cd /d "%APP_DIR%"
node launch.js

REM Pause before exit
echo.
pause
