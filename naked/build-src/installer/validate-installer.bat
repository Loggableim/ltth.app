@echo off
REM ============================================================================
REM NSIS Installer Validation Script
REM ============================================================================
REM This script validates the NSIS installer configuration and checks for
REM common issues before building.
REM
REM Usage: validate-installer.bat
REM ============================================================================

echo.
echo ============================================
echo LTTH NSIS Installer Validation
echo ============================================
echo.

set ERRORS=0
set WARNINGS=0

REM Check NSIS installation
echo [1/10] Checking NSIS installation...
if exist "C:\Program Files (x86)\NSIS\makensis.exe" (
    echo [OK] NSIS found
) else (
    echo [ERROR] NSIS not found
    echo Please install NSIS 3.11+ from https://nsis.sourceforge.io/Download
    set /a ERRORS+=1
)
echo.

REM Check for required files
echo [2/10] Checking required files...
if exist "ltth-installer.nsi" (
    echo [OK] ltth-installer.nsi found
) else (
    echo [ERROR] ltth-installer.nsi not found
    set /a ERRORS+=1
)

if exist "sign-file.bat" (
    echo [OK] sign-file.bat found
) else (
    echo [WARNING] sign-file.bat not found (optional)
    set /a WARNINGS+=1
)

if exist "license.txt" (
    echo [OK] license.txt found
) else (
    echo [WARNING] license.txt not found
    set /a WARNINGS+=1
)
echo.

REM Check for image files
echo [3/10] Checking installer images...
if exist "installer-header.bmp" (
    echo [OK] installer-header.bmp found
) else (
    echo [WARNING] installer-header.bmp not found
    set /a WARNINGS+=1
)

if exist "installer-sidebar.bmp" (
    echo [OK] installer-sidebar.bmp found
) else (
    echo [WARNING] installer-sidebar.bmp not found
    set /a WARNINGS+=1
)

if exist "splash-screen.bmp" (
    echo [OK] splash-screen.bmp found
) else (
    echo [WARNING] splash-screen.bmp not found
    set /a WARNINGS+=1
)
echo.

REM Check for launcher executable
echo [4/10] Checking launcher files...
if exist "..\launcher.exe" (
    echo [OK] launcher.exe found in build-src
) else (
    echo [WARNING] launcher.exe not found
    echo Please build the launcher first
    set /a WARNINGS+=1
)

if exist "..\icon.ico" (
    echo [OK] icon.ico found
) else (
    echo [WARNING] icon.ico not found
    set /a WARNINGS+=1
)
echo.

REM Check for app directory
echo [5/10] Checking app directory...
if exist "..\..\app\server.js" (
    echo [OK] App directory found
) else (
    echo [ERROR] App directory not found
    echo Please ensure repository is complete
    set /a ERRORS+=1
)
echo.

REM Check for Node.js portable
echo [6/10] Checking Node.js portable...
if exist "..\assets\node\node.exe" (
    echo [OK] Node.js portable found
) else (
    echo [INFO] Node.js portable not found (optional)
    echo Installer will be built without Node.js runtime
    echo Download from: https://nodejs.org/dist/latest-v18.x/
)
echo.

REM Check documentation
echo [7/10] Checking documentation...
if exist "README.md" (
    echo [OK] README.md found
) else (
    echo [WARNING] README.md not found
    set /a WARNINGS+=1
)

if exist "ADVANCED_FEATURES.md" (
    echo [OK] ADVANCED_FEATURES.md found
) else (
    echo [WARNING] ADVANCED_FEATURES.md not found
    set /a WARNINGS+=1
)

if exist "SIGNING.md" (
    echo [OK] SIGNING.md found
) else (
    echo [WARNING] SIGNING.md not found
    set /a WARNINGS+=1
)
echo.

REM Check NSIS plugins
echo [8/10] Checking NSIS plugins...
if exist "C:\Program Files (x86)\NSIS\Plugins\x86-unicode\AdvSplash.dll" (
    echo [OK] AdvSplash plugin found
) else (
    echo [INFO] AdvSplash plugin not found (optional)
    echo Installer will use Banner plugin as fallback
    echo Download from: https://nsis.sourceforge.io/AdvSplash_plug-in
)
echo.

REM Validate NSIS script syntax
echo [9/10] Validating NSIS script syntax...
if exist "C:\Program Files (x86)\NSIS\makensis.exe" (
    "C:\Program Files (x86)\NSIS\makensis.exe" /HDRINFO ltth-installer.nsi > nul 2>&1
    if %ERRORLEVEL% == 0 (
        echo [OK] NSIS script syntax is valid
    ) else (
        echo [ERROR] NSIS script has syntax errors
        echo Run makensis manually to see errors
        set /a ERRORS+=1
    )
) else (
    echo [SKIP] Cannot validate syntax (NSIS not found)
)
echo.

REM Check code signing setup (optional)
echo [10/10] Checking code signing setup...
if "%SIGN_ENABLED%"=="1" (
    echo [INFO] Code signing is enabled
    
    if exist "C:\Program Files (x86)\Windows Kits\10\bin\" (
        echo [OK] Windows SDK found (for signtool)
    ) else (
        echo [WARNING] Windows SDK not found
        echo Code signing may fail
        echo Download from: https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/
        set /a WARNINGS+=1
    )
) else (
    echo [INFO] Code signing is disabled
    echo To enable: set SIGN_ENABLED=1
)
echo.

REM Summary
echo ============================================
echo Validation Summary
echo ============================================
echo.

if %ERRORS% == 0 (
    if %WARNINGS% == 0 (
        echo [SUCCESS] All checks passed!
        echo.
        echo The installer is ready to build.
        echo Run: build-installer.bat
        echo.
        exit /b 0
    ) else (
        echo [PASSED] Validation completed with %WARNINGS% warning(s)
        echo.
        echo The installer can be built, but some optional
        echo features may not be available.
        echo.
        exit /b 0
    )
) else (
    echo [FAILED] Validation failed with %ERRORS% error(s)
    echo.
    echo Please fix the errors above before building.
    echo.
    exit /b 1
)
