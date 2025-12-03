@echo off
REM ============================================================================
REM LTTH Electron Development Script (Windows)
REM 
REM Starts the backend server and Electron app in development mode.
REM
REM Usage:
REM   tools\dev-electron.bat [options]
REM
REM Options:
REM   --no-backend    Don't start the backend server
REM   --debug         Enable Node.js debugging
REM   --help          Show this help message
REM
REM ============================================================================

setlocal EnableDelayedExpansion

REM Configuration
set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%.."
set "APP_DIR=%PROJECT_ROOT%\app"
set "BACKEND_PORT=3210"
set "START_BACKEND=true"
set "DEBUG_MODE=false"
set "BACKEND_PID="

REM Parse arguments
:parse_args
if "%~1"=="" goto main
if /i "%~1"=="--no-backend" (
    set "START_BACKEND=false"
    shift
    goto parse_args
)
if /i "%~1"=="--debug" (
    set "DEBUG_MODE=true"
    shift
    goto parse_args
)
if /i "%~1"=="--help" goto show_help
if /i "%~1"=="-h" goto show_help
echo Unknown option: %~1
goto show_help

:show_help
echo LTTH Electron Development Script
echo.
echo Usage: tools\dev-electron.bat [options]
echo.
echo Options:
echo   --no-backend    Don't start the backend server
echo   --debug         Enable Node.js debugging
echo   --help          Show this help message
echo.
exit /b 0

:main
REM Print banner
echo.
echo ===============================================================
echo.
echo     LTTH Electron - Development Mode
echo.
echo ===============================================================
echo.

REM Check Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo Error: Node.js is not installed
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set "NODE_VER=%%i"
echo Node.js %NODE_VER%

REM Check npm
where npm >nul 2>&1
if errorlevel 1 (
    echo Error: npm is not installed
    exit /b 1
)

for /f "tokens=*" %%i in ('npm -v') do set "NPM_VER=%%i"
echo npm %NPM_VER%

REM Install dependencies if needed
if not exist "%PROJECT_ROOT%\node_modules" (
    echo Installing root dependencies...
    cd /d "%PROJECT_ROOT%"
    call npm install
)

if not exist "%APP_DIR%\node_modules" (
    echo Installing app dependencies...
    cd /d "%APP_DIR%"
    call npm install
)

echo Dependencies installed

REM Check if port is in use
netstat -ano | findstr ":%BACKEND_PORT% " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo Warning: Port %BACKEND_PORT% is already in use
    set /p "KILL_PROC=Would you like to try to free it? (y/n): "
    if /i "!KILL_PROC!"=="y" (
        for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%BACKEND_PORT% " ^| findstr "LISTENING"') do (
            taskkill /F /PID %%a >nul 2>&1
        )
        timeout /t 2 /nobreak >nul
    ) else (
        echo Cannot proceed with port %BACKEND_PORT% in use
        exit /b 1
    )
)

REM Start backend
if "%START_BACKEND%"=="true" (
    echo Starting backend server on port %BACKEND_PORT%...
    
    cd /d "%APP_DIR%"
    
    set "PORT=%BACKEND_PORT%"
    set "NODE_ENV=development"
    set "OPEN_BROWSER=false"
    set "ELECTRON=true"
    
    if "%DEBUG_MODE%"=="true" (
        start "LTTH Backend" /min cmd /c "node --inspect=9230 server.js"
    ) else (
        start "LTTH Backend" /min cmd /c "node server.js"
    )
    
    echo Waiting for backend to be ready...
    
    set "WAITED=0"
    :wait_loop
    if !WAITED! geq 30 (
        echo Error: Backend failed to start within 30 seconds
        exit /b 1
    )
    
    curl -s "http://127.0.0.1:%BACKEND_PORT%/api/init-state" >nul 2>&1
    if not errorlevel 1 (
        echo Backend is ready
        goto backend_ready
    )
    
    timeout /t 1 /nobreak >nul
    set /a "WAITED+=1"
    echo   Waiting... (!WAITED!/30)
    goto wait_loop
    
    :backend_ready
) else (
    echo Skipping backend start --no-backend
)

REM Start Electron
echo Starting Electron app...

cd /d "%PROJECT_ROOT%"

set "NODE_ENV=development"
set "ELECTRON_IS_DEV=1"

if "%DEBUG_MODE%"=="true" (
    call npx electron --inspect=9229 .
) else (
    call npx electron .
)

REM Cleanup
echo Cleaning up...

REM Kill backend window
taskkill /FI "WINDOWTITLE eq LTTH Backend" /F >nul 2>&1

echo Done

endlocal
exit /b 0
