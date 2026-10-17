@echo off
REM ============================================================================
REM LTTH Installer Build Script
REM ============================================================================
REM This script compiles the NSIS installer for LTTH
REM Usage: build-installer.bat <release|developer> <new absolute directory under OS TEMP>
REM
REM Requirements:
REM   - NSIS 3.11 or higher (Windows 10/11 compatible)
REM   - Download from: https://nsis.sourceforge.io/Download
REM
REM Explicit release mode requires SIGN_ENABLED=1 and trusted LAUNCHER_SIGNER_THUMBPRINT
REM with identical SIGN_CERT_SHA1. Developer mode forces signing off: NOT FOR DISTRIBUTION.
REM Example: build-installer.bat release <new absolute TEMP stage>
REM ============================================================================

echo.
echo ============================================
echo LTTH Installer Build Script
echo ============================================
echo.

REM A new explicit public stage is mandatory; never pass the raw app tree to NSIS.
setlocal
set "LTTH_INSTALLER_MODE=%~1"
set "PUBLIC_STAGE=%~2"
set "PUBLIC_REPO=%~dp0..\.."
if not "%LTTH_INSTALLER_MODE%"=="release" if not "%LTTH_INSTALLER_MODE%"=="developer" exit /b 1
if "%PUBLIC_STAGE%"=="" exit /b 1
if "%LTTH_INSTALLER_MODE%"=="developer" (
    if "%~3"=="" exit /b 1
    if not exist "%~3" exit /b 1
    set "SIGN_ENABLED=0"
)
if "%LTTH_INSTALLER_MODE%"=="release" (
    if "%~3"=="" exit /b 1
    if not exist "%~3\launcher.exe" exit /b 1
    if "%LAUNCHER_VERSION%"=="" exit /b 1
    if "%LAUNCHER_COMMIT_SHA%"=="" exit /b 1
    if "%LAUNCHER_TAG%"=="" exit /b 1
    if "%LAUNCHER_SOURCE_RUN_ID%"=="" exit /b 1
    if "%LAUNCHER_PUBLISHER_RUN_ID%"=="" exit /b 1
    if "%LAUNCHER_HANDOFF_COMMIT_SHA%"=="" exit /b 1
    if "%LAUNCHER_PUBLISHER_SUBJECT%"=="" exit /b 1
    if "%LAUNCHER_SIGNER_THUMBPRINT%"=="" exit /b 1
    if "%SIGNTOOL_PATH%"=="" exit /b 1
    if not exist "%SIGNTOOL_PATH%" exit /b 1
)
powershell -NoProfile -NonInteractive -File "%PUBLIC_REPO%\scripts\verify-nsis-release-signature.ps1" -Action preflight
if errorlevel 1 exit /b 1
python -B "%PUBLIC_REPO%\scripts\prepare_nsis_public_stage.py" --repo "%PUBLIC_REPO%" --stage "%PUBLIC_STAGE%"
if errorlevel 1 exit /b 1
python -B "%PUBLIC_REPO%\scripts\prepare_nsis_public_stage.py" --repo "%PUBLIC_REPO%" --stage "%PUBLIC_STAGE%" --verify
if errorlevel 1 exit /b 1
if "%LTTH_INSTALLER_MODE%"=="release" (
    python -B "%PUBLIC_REPO%\scripts\verify_nsis_launcher_payload.py" --action stage --payload "%~3" --stage "%PUBLIC_STAGE%" --version "%LAUNCHER_VERSION%" --commit-sha "%LAUNCHER_COMMIT_SHA%" --tag "%LAUNCHER_TAG%" --source-run-id "%LAUNCHER_SOURCE_RUN_ID%" --publisher-run-id "%LAUNCHER_PUBLISHER_RUN_ID%" --handoff-commit-sha "%LAUNCHER_HANDOFF_COMMIT_SHA%" --expected-publisher-subject "%LAUNCHER_PUBLISHER_SUBJECT%" --launcher-signer-thumbprint "%LAUNCHER_SIGNER_THUMBPRINT%" --signtool "%SIGNTOOL_PATH%"
    if errorlevel 1 exit /b 1
)

REM Check if NSIS is installed
set NSIS_PATH=C:\Program Files (x86)\NSIS\makensis.exe

if not exist "%NSIS_PATH%" (
    echo [ERROR] NSIS not found at: %NSIS_PATH%
    echo.
    echo Please install NSIS 3.11 or higher from:
    echo https://nsis.sourceforge.io/Download
    echo.
    echo NSIS 3.11 is fully compatible with Windows 10 and Windows 11
    echo.
    echo Alternative: Drag ltth-installer.nsi into MakeNSISW window
    echo.
    pause
    exit /b 1
)

echo [OK] NSIS found: %NSIS_PATH%
echo.

REM Check code signing configuration
if "%SIGN_ENABLED%"=="1" (
    echo ============================================
    echo Code Signing: ENABLED
    echo ============================================
    echo.
    echo The installer and uninstaller will be signed
    echo using Windows signtool with Certum certificates
    echo from the Windows Certificate Store.
    echo.
    
    REM Check if signtool is available
    if not "%SIGNTOOL_PATH%"=="" (
        echo [INFO] Using custom signtool: %SIGNTOOL_PATH%
    ) else (
        echo [INFO] Will auto-detect signtool from Windows SDK
    )
    
    if not "%TIMESTAMP_URL%"=="" (
        echo [INFO] Using custom timestamp: %TIMESTAMP_URL%
    ) else (
        echo [INFO] Using default timestamp: https://timestamp.digicert.com
    )
    echo.
) else (
    echo ============================================
    echo Code Signing: DISABLED
    echo ============================================
    echo.
    echo To enable code signing, set SIGN_ENABLED=1
    echo Example: set SIGN_ENABLED=1
    echo.
    echo The installer will be built without signing.
    echo You can sign it manually later using:
    echo   sign-file.bat LTTH-Setup-^<version^>.exe
    echo.
)

echo ============================================

REM Check for required files
echo Checking required files...
echo.

if not exist "..\launcher.exe" (
    echo [WARNING] launcher.exe not found in build-src\
    echo Please build the launcher first
)

if not exist "..\..\app\server.js" (
    echo [ERROR] app directory not found!
    echo Please ensure you're running this from build-src\installer\
    pause
    exit /b 1
)

if not exist "..\icon.ico" (
    echo [WARNING] icon.ico not found in build-src\
)

if not exist "..\assets\node\node.exe" (
    echo [INFO] Node.js portable not found (optional)
    echo The installer will be built without Node.js
    echo.
    echo Recommended: Download Node.js 18.x LTS
    echo   https://nodejs.org/dist/latest-v18.x/
    echo Or Node.js 20.x LTS:
    echo   https://nodejs.org/dist/latest-v20.x/
    echo Extract to: build-src\assets\node\
    echo.
    echo Note: LTTH is tested with Node.js 18.x and 20.x
    echo.
)

echo [OK] Core files found
echo.

REM Compile the installer
echo ============================================
echo Compiling NSIS installer...
echo ============================================
echo.

if "%LTTH_INSTALLER_MODE%"=="release" (
    python -B "%PUBLIC_REPO%\scripts\prepare_nsis_public_stage.py" --repo "%PUBLIC_REPO%" --stage "%PUBLIC_STAGE%" --verify --compiler "%NSIS_PATH%" --script "%~dp0ltth-installer.nsi" --launcher-payload "%~3" --launcher-version "%LAUNCHER_VERSION%" --launcher-commit-sha "%LAUNCHER_COMMIT_SHA%" --launcher-tag "%LAUNCHER_TAG%" --launcher-source-run-id "%LAUNCHER_SOURCE_RUN_ID%" --launcher-publisher-run-id "%LAUNCHER_PUBLISHER_RUN_ID%" --launcher-handoff-commit-sha "%LAUNCHER_HANDOFF_COMMIT_SHA%" --launcher-publisher-subject "%LAUNCHER_PUBLISHER_SUBJECT%" --launcher-signer-thumbprint "%LAUNCHER_SIGNER_THUMBPRINT%" --signtool "%SIGNTOOL_PATH%"
) else (
    python -B "%PUBLIC_REPO%\scripts\prepare_nsis_public_stage.py" --repo "%PUBLIC_REPO%" --stage "%PUBLIC_STAGE%" --verify --compiler "%NSIS_PATH%" --script "%~dp0ltth-installer.nsi" --developer-launcher "%~3"
)

if errorlevel 1 exit /b 1
if "%LTTH_INSTALLER_MODE%"=="release" (
    call "%~dp0sign-file.bat" "%~dp0LTTH-Setup-1.4.4.exe"
    if errorlevel 1 exit /b 1
)

if %ERRORLEVEL% == 0 (
    echo.
    echo ============================================
    echo SUCCESS!
    echo ============================================
    echo.
    echo Installer created successfully!
    echo.
    echo Output: LTTH-Setup-^<version^>.exe
    echo Location: %CD%
    echo.
    if "%LTTH_INSTALLER_MODE%"=="release" (echo Verified signed release Setup.) else (echo NOT FOR DISTRIBUTION - unsigned developer build.)
    echo.
    echo ============================================
) else (
    echo.
    echo ============================================
    echo BUILD FAILED
    echo ============================================
    echo.
    echo Please check the error messages above.
    echo.
    echo Common issues:
    echo - Missing files (launcher.exe, app directory, etc.)
    echo - Incorrect paths in ltth-installer.nsi
    echo - NSIS version too old (need 3.x+)
    echo.
    echo ============================================
)

echo.
pause
