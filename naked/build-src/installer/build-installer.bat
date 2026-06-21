@echo off
REM ============================================================================
REM LTTH Installer Build Script
REM ============================================================================
REM This script compiles the NSIS installer for LTTH
REM Usage: Simply double-click this file or run from command line
REM
REM Requirements:
REM   - NSIS 3.11 or higher (Windows 10/11 compatible)
REM   - Download from: https://nsis.sourceforge.io/Download
REM
REM Code Signing (Optional):
REM To enable code signing with Certum cloud signing:
REM   1. Set environment variable: SIGN_ENABLED=1
REM   2. Install Certum certificate in Windows Certificate Store
REM   3. Run this script
REM
REM Example:
REM   set SIGN_ENABLED=1
REM   build-installer.bat
REM
REM The installer and uninstaller will be automatically signed during build.
REM ============================================================================

echo.
echo ============================================
echo LTTH Installer Build Script
echo ============================================
echo.

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

"%NSIS_PATH%" ltth-installer.nsi

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
    echo You can now distribute this installer.
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
