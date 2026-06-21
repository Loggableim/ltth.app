@echo off
REM ============================================================================
REM NSIS Code Signing Helper Script
REM ============================================================================
REM This script signs a file using Windows signtool with Certum cloud signing
REM Usage: sign-file.bat <file-to-sign>
REM
REM Environment Variables (optional):
REM   SIGNTOOL_PATH - Path to signtool.exe (auto-detected if not set)
REM   TIMESTAMP_URL - Timestamp server URL (default: DigiCert)
REM   SIGN_ENABLED  - Set to "1" to enable signing (default: disabled)
REM ============================================================================

REM Check if signing is enabled
if not "%SIGN_ENABLED%"=="1" (
    echo [INFO] Code signing is disabled (SIGN_ENABLED not set to 1)
    echo [INFO] To enable signing, set SIGN_ENABLED=1 before building
    exit /b 0
)

REM Check if file argument is provided
if "%~1"=="" (
    echo [ERROR] No file specified to sign
    exit /b 1
)

set FILE_TO_SIGN=%~1

REM Check if file exists
if not exist "%FILE_TO_SIGN%" (
    echo [ERROR] File not found: %FILE_TO_SIGN%
    exit /b 1
)

echo.
echo ============================================
echo Code Signing: %~nx1
echo ============================================
echo.

REM Find signtool.exe if not specified
if "%SIGNTOOL_PATH%"=="" (
    echo [INFO] Searching for signtool.exe...
    
    REM Try common Windows SDK locations (x64, x86, ARM64)
    REM Searches in reverse order to find the latest version first
    for /f "delims=" %%i in ('dir /s /b "C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe" 2^>nul ^| sort /r') do (
        set SIGNTOOL_PATH=%%i
        goto :found_signtool
    )
    
    REM Try x86 locations (for 32-bit systems or older SDKs)
    for /f "delims=" %%i in ('dir /s /b "C:\Program Files (x86)\Windows Kits\10\bin\*\x86\signtool.exe" 2^>nul ^| sort /r') do (
        set SIGNTOOL_PATH=%%i
        goto :found_signtool
    )
    
    REM Try ARM64 locations
    for /f "delims=" %%i in ('dir /s /b "C:\Program Files (x86)\Windows Kits\10\bin\*\arm64\signtool.exe" 2^>nul ^| sort /r') do (
        set SIGNTOOL_PATH=%%i
        goto :found_signtool
    )
    
    REM Try Program Files (for custom installations)
    for /f "delims=" %%i in ('dir /s /b "C:\Program Files\Windows Kits\10\bin\*\x64\signtool.exe" 2^>nul ^| sort /r') do (
        set SIGNTOOL_PATH=%%i
        goto :found_signtool
    )
    
    REM Try PATH
    where signtool.exe >nul 2>&1
    if %ERRORLEVEL% == 0 (
        for /f "delims=" %%i in ('where signtool.exe') do (
            set SIGNTOOL_PATH=%%i
            goto :found_signtool
        )
    )
    
    echo [ERROR] signtool.exe not found
    echo [ERROR] Please install Windows SDK or set SIGNTOOL_PATH environment variable
    echo [ERROR] Download from: https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/
    exit /b 1
)

:found_signtool
echo [OK] Found signtool: %SIGNTOOL_PATH%
echo.

REM Set default timestamp server if not specified
if "%TIMESTAMP_URL%"=="" (
    set TIMESTAMP_URL=https://timestamp.digicert.com
)

echo [INFO] Timestamp server: %TIMESTAMP_URL%
echo [INFO] Signing: %FILE_TO_SIGN%
echo.

REM Sign the file using certificate from Windows Certificate Store
REM /a = automatically select best certificate from Windows Certificate Store
REM      NOTE: If you have multiple code signing certificates, signtool will
REM      select the most suitable one based on validity and key usage.
REM      To use a specific certificate, replace /a with:
REM      /n "Certificate Subject Name" or /sha1 "Certificate Thumbprint"
REM /fd sha256 = file digest algorithm
REM /tr = RFC 3161 timestamp server
REM /td sha256 = timestamp digest algorithm
"%SIGNTOOL_PATH%" sign /a /fd sha256 /tr "%TIMESTAMP_URL%" /td sha256 "%FILE_TO_SIGN%"

if %ERRORLEVEL% == 0 (
    echo.
    echo [SUCCESS] File signed successfully
    echo.
    
    REM Verify the signature
    echo [INFO] Verifying signature...
    "%SIGNTOOL_PATH%" verify /pa "%FILE_TO_SIGN%"
    
    if %ERRORLEVEL% == 0 (
        echo [SUCCESS] Signature verified
    ) else (
        echo [WARNING] Signature verification failed
    )
    
    exit /b 0
) else (
    echo.
    echo [ERROR] Signing failed
    echo.
    echo Common issues:
    echo - No valid certificate in Windows Certificate Store
    echo - Certificate expired or not yet valid
    echo - Network issue accessing timestamp server
    echo - Certum SimplySign certificate not installed
    echo.
    echo For Certum SimplySign:
    echo - Ensure certificate is installed in Windows Certificate Store
    echo - Use Certum SimplySign Desktop to manage certificates
    echo - Check mobile app for 2FA approval if required
    echo.
    exit /b 1
)
