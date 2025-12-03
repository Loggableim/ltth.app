@echo off
:: ============================================================================
:: LTTH Electron Installer Builder - Ultra-Robust Version
:: ============================================================================
:: WICHTIG: Dieses Skript schliesst NIEMALS das Fenster automatisch!
:: ============================================================================

:: Sofort Titel setzen damit man sieht dass es läuft
title LTTH Installer Builder - Bitte warten...

:: Direkt ins Skript-Verzeichnis wechseln (MUSS zuerst passieren)
cd /d "%~dp0"

:: Einfache Log-Datei im aktuellen Verzeichnis
set "LOG_FILE=%~dp0build-output.log"

:: Alles was ab jetzt kommt wird sowohl auf Bildschirm als auch in Log geschrieben
echo.
echo ============================================================================
echo   LTTH Electron Installer Builder
echo ============================================================================
echo.
echo   Arbeitsverzeichnis: %CD%
echo   Log-Datei: %LOG_FILE%
echo.
echo   WICHTIG: Dieses Fenster schliesst sich NICHT automatisch!
echo.
echo ============================================================================
echo.

:: Log-Datei starten
echo ============================================================================ > "%LOG_FILE%"
echo LTTH Build gestartet: %DATE% %TIME% >> "%LOG_FILE%"
echo Verzeichnis: %CD% >> "%LOG_FILE%"
echo ============================================================================ >> "%LOG_FILE%"

:: ============================================================================
:: SCHRITT 1: Node.js pruefen
:: ============================================================================
echo [1/5] Pruefe Node.js...
echo. >> "%LOG_FILE%"
echo [STEP 1] Pruefe Node.js >> "%LOG_FILE%"

node -v > nul 2>&1
if errorlevel 1 (
    echo.
    echo   FEHLER: Node.js ist nicht installiert!
    echo   Bitte installiere Node.js von: https://nodejs.org
    echo.
    echo FEHLER: Node.js nicht gefunden >> "%LOG_FILE%"
    goto :ende_fehler
)

for /f "tokens=*" %%v in ('node -v 2^>nul') do echo   Node.js Version: %%v
for /f "tokens=*" %%v in ('node -v 2^>nul') do echo   Node.js: %%v >> "%LOG_FILE%"

npm -v > nul 2>&1
if errorlevel 1 (
    echo.
    echo   FEHLER: npm ist nicht installiert!
    echo.
    echo FEHLER: npm nicht gefunden >> "%LOG_FILE%"
    goto :ende_fehler
)

for /f "tokens=*" %%v in ('npm -v 2^>nul') do echo   npm Version: %%v
for /f "tokens=*" %%v in ('npm -v 2^>nul') do echo   npm: %%v >> "%LOG_FILE%"

echo   OK - Node.js und npm gefunden
echo.

:: ============================================================================
:: SCHRITT 2: Alte Builds loeschen
:: ============================================================================
echo [2/5] Loesche alte Build-Artefakte...
echo. >> "%LOG_FILE%"
echo [STEP 2] Loesche alte Builds >> "%LOG_FILE%"

:: Versuche laufende Prozesse zu beenden
taskkill /F /IM electron.exe 2>nul >nul
taskkill /F /IM "PupCid's Little TikTok Helper.exe" 2>nul >nul

:: Warte kurz
timeout /t 2 /nobreak >nul 2>nul

:: dist loeschen wenn vorhanden
if exist "dist" (
    echo   Loesche dist-Ordner...
    rmdir /s /q "dist" 2>nul
    if exist "dist" (
        echo   WARNUNG: dist konnte nicht geloescht werden - wird beim Build ueberschrieben
        echo   WARNUNG: dist nicht geloescht >> "%LOG_FILE%"
    ) else (
        echo   dist-Ordner geloescht
    )
) else (
    echo   Kein alter dist-Ordner vorhanden
)
echo.

:: ============================================================================
:: SCHRITT 3: Dependencies installieren
:: ============================================================================
echo [3/5] Installiere Dependencies...
echo   (Das kann einige Minuten dauern)
echo.
echo. >> "%LOG_FILE%"
echo [STEP 3] npm install >> "%LOG_FILE%"

echo   Fuehre npm install aus...
call npm install >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
    echo.
    echo   WARNUNG: npm install hatte Probleme
    echo   Versuche trotzdem fortzufahren...
    echo.
    echo WARNUNG: npm install Probleme >> "%LOG_FILE%"
)
echo   Dependencies installiert
echo.

:: ============================================================================
:: SCHRITT 4: App Dependencies (falls vorhanden)
:: ============================================================================
if exist "app\package.json" (
    echo [4/5] Installiere App Dependencies...
    echo. >> "%LOG_FILE%"
    echo [STEP 4] npm install (app) >> "%LOG_FILE%"
    
    pushd app
    call npm install >> "%LOG_FILE%" 2>&1
    popd
    
    echo   App Dependencies installiert
    echo.
) else (
    echo [4/5] Keine separaten App Dependencies
    echo.
)

:: ============================================================================
:: SCHRITT 5: Windows Installer bauen
:: ============================================================================
echo [5/5] Baue Windows Installer...
echo.
echo   ========================================
echo   ELECTRON BUILDER AUSGABE:
echo   ========================================
echo.
echo. >> "%LOG_FILE%"
echo [STEP 5] electron-builder --win >> "%LOG_FILE%"
echo Startzeit: %TIME% >> "%LOG_FILE%"

:: WICHTIG: Build-Ausgabe direkt auf Bildschirm UND in Log
call npm run build:win 2>&1
set "BUILD_ERROR=%errorlevel%"

echo. >> "%LOG_FILE%"
echo Build beendet mit Code: %BUILD_ERROR% >> "%LOG_FILE%"
echo Endzeit: %TIME% >> "%LOG_FILE%"

echo.
echo   ========================================

if %BUILD_ERROR% neq 0 (
    echo.
    echo ============================================================================
    echo   BUILD FEHLGESCHLAGEN!
    echo ============================================================================
    echo.
    echo   Der Build ist mit Fehlercode %BUILD_ERROR% fehlgeschlagen.
    echo.
    echo   Moegliche Loesungen:
    echo   1. Starte den PC neu (falls Dateien gesperrt sind)
    echo   2. Fuehre als Administrator aus
    echo   3. Deaktiviere temporaer den Antivirus
    echo   4. Pruefe das Log: %LOG_FILE%
    echo.
    echo BUILD FEHLGESCHLAGEN >> "%LOG_FILE%"
    goto :ende_fehler
)

:: ============================================================================
:: ERFOLG
:: ============================================================================
echo.
echo ============================================================================
echo   BUILD ERFOLGREICH!
echo ============================================================================
echo.

:: Zeige erstellte Dateien
echo   Erstellte Dateien:
if exist "dist\*.exe" (
    for %%f in (dist\*.exe) do (
        echo     - %%f
        echo   OUTPUT: %%f >> "%LOG_FILE%"
    )
)

echo.
echo   Der dist-Ordner wird jetzt geoeffnet...
echo.

:: dist-Ordner im Explorer oeffnen
if exist "dist" (
    start "" explorer "%~dp0dist"
)

echo BUILD ERFOLGREICH >> "%LOG_FILE%"
goto :ende_ok

:: ============================================================================
:: ENDE MIT FEHLER
:: ============================================================================
:ende_fehler
echo.
echo ============================================================================
echo   FEHLER - Pruefe die Ausgabe oben!
echo ============================================================================
echo.
echo   Log-Datei: %LOG_FILE%
echo.
echo   Druecke eine beliebige Taste zum Schliessen...
echo.
pause
exit /b 1

:: ============================================================================
:: ENDE OK
:: ============================================================================
:ende_ok
echo.
echo ============================================================================
echo   Fertig! Druecke eine beliebige Taste zum Schliessen...
echo ============================================================================
echo.
pause
exit /b 0
