# NSIS Installer Code Signing Guide

This guide explains how to enable code signing for the LTTH NSIS installer using Windows signtool and Certum cloud signing certificates.

## 📋 Overview

The NSIS installer now supports automatic code signing during the build process. When enabled, both the installer executable and the embedded uninstaller will be signed using:

- **Signing Tool:** Windows signtool.exe (from Windows SDK)
- **Certificate Source:** Windows Certificate Store
- **Signing Method:** Certum SimplySign™ cloud signing (or any certificate in the store)
- **Timestamp Server:** DigiCert (default) or custom server
- **Hash Algorithm:** SHA-256 for both file digest and timestamp

## ✨ Features

✅ **Automatic Signing** - Installer and uninstaller signed during NSIS build  
✅ **Auto-Detection** - Finds signtool.exe in Windows SDK automatically  
✅ **Certificate Store** - Uses certificates from Windows Certificate Store  
✅ **Timestamping** - Ensures signatures remain valid after certificate expiration  
✅ **Verification** - Automatically verifies signatures after signing  
✅ **Optional** - Signing can be disabled without errors (default: disabled)  
✅ **Flexible** - Supports custom signtool path and timestamp servers  

## 🎯 Prerequisites

### Required Software

1. **NSIS (Nullsoft Scriptable Install System)**
   - Download: https://nsis.sourceforge.io/Download
   - Version: 3.x or higher
   - Already required for building the installer

2. **Windows SDK (for signtool.exe)**
   - Download: https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/
   - Component: "Windows SDK Signing Tools for Desktop Apps"
   - Default location: `C:\Program Files (x86)\Windows Kits\10\bin\`

3. **Certum SimplySign™ Certificate** (or any code signing certificate)
   - **For Certum SimplySign:**
     - Download: https://www.certum.eu/en/cert_services_sign_code.html
     - Documentation: [Certum Code Signing Manual](https://files.certum.eu/documents/manual_en/CS-Code_Signing_in_the_Cloud_Signtool_jarsigner_signing.pdf)
     - **IMPORTANT:** Install certificate in Windows Certificate Store (not as file)
     - Use Certum SimplySign Desktop to manage the certificate
   - **For other certificates:**
     - Import certificate into Windows Certificate Store
     - Certificate must be in "Personal" or "My" store with private key

### System Requirements

- **Operating System:** Windows 10/11 (64-bit)
- **Network:** Internet connection (for timestamp server and Certum Cloud HSM)
- **Permissions:** Administrator rights (for installing certificate)

## 🚀 Quick Start

### Method 1: Enable Signing for Build Session

```batch
REM Navigate to installer directory
cd build-src\installer

REM Enable signing for this session
set SIGN_ENABLED=1

REM Build the installer (will sign automatically)
build-installer.bat
```

### Method 2: Enable Signing with Custom Settings

```batch
REM Enable signing
set SIGN_ENABLED=1

REM Optional: Use custom signtool path
set SIGNTOOL_PATH=C:\CustomPath\signtool.exe

REM Optional: Use custom timestamp server
set TIMESTAMP_URL=https://timestamp.sectigo.com

REM Build the installer
build-installer.bat
```

### Method 3: Sign Existing Installer (Manual)

If you already built an unsigned installer, you can sign it manually:

```batch
cd build-src\installer
set SIGN_ENABLED=1
sign-file.bat LTTH-Setup-<version>.exe
```

## 📁 Files Overview

| File | Purpose |
|------|---------|
| `ltth-installer.nsi` | NSIS script with `!finalize` and `!uninstfinalize` directives |
| `sign-file.bat` | Signing helper script called by NSIS |
| `build-installer.bat` | Build script with signing documentation |
| `SIGNING.md` | This documentation file |

## ⚙️ Configuration Options

### Environment Variables

All configuration is done through environment variables:

#### SIGN_ENABLED

- **Purpose:** Enable or disable code signing
- **Values:** `1` (enabled), anything else (disabled)
- **Default:** Disabled (not set)
- **Example:** `set SIGN_ENABLED=1`

#### SIGNTOOL_PATH (Optional)

- **Purpose:** Custom path to signtool.exe
- **Default:** Auto-detected from Windows SDK
- **Example:** `set SIGNTOOL_PATH=C:\MyTools\signtool.exe`

When not set, the script searches these locations in order:
1. `C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe`
2. System PATH

#### TIMESTAMP_URL (Optional)

- **Purpose:** RFC 3161 timestamp server URL
- **Default:** `https://timestamp.digicert.com`
- **Example:** `set TIMESTAMP_URL=https://timestamp.sectigo.com`

**Alternative timestamp servers:**
- `https://timestamp.digicert.com` (DigiCert - default)
- `https://timestamp.sectigo.com` (Sectigo/Comodo)
- `http://timestamp.globalsign.com/tsa/g6` (GlobalSign)

### Signing Command

The script uses this signtool command:

```batch
signtool sign /a /fd sha256 /tr <timestamp_url> /td sha256 <file>
```

**Parameters:**
- `/a` - Automatically select the best signing certificate from Windows Certificate Store
  - **Note:** If you have multiple code signing certificates installed, signtool will select the most suitable one based on validity period and key usage.
  - **Custom certificate selection:** To use a specific certificate, you can modify `sign-file.bat` and replace `/a` with:
    - `/n "Certificate Subject Name"` (e.g., `/n "My Company Name"`)
    - `/sha1 "Certificate Thumbprint"` (e.g., `/sha1 "abc123..."`)
- `/fd sha256` - Use SHA-256 for file digest algorithm
- `/tr <url>` - RFC 3161 timestamp server URL
- `/td sha256` - Use SHA-256 for timestamp digest algorithm

## 🔧 How It Works

### Build Process Flow

1. **User runs build-installer.bat**
   - Checks if `SIGN_ENABLED=1`
   - Shows signing status (enabled/disabled)

2. **NSIS compiles installer**
   - Builds the installer executable
   - Extracts uninstaller stub

3. **NSIS calls !uninstfinalize**
   - Executes: `sign-file.bat Uninstall.exe`
   - Signs the uninstaller stub
   - Re-embeds signed uninstaller in installer

4. **NSIS calls !finalize**
   - Executes: `sign-file.bat LTTH-Setup-<version>.exe`
   - Signs the final installer executable

5. **Verification**
   - Each signed file is automatically verified
   - Displays verification results

### sign-file.bat Behavior

When `SIGN_ENABLED=1`:
1. Checks if file exists
2. Auto-detects signtool.exe (or uses `SIGNTOOL_PATH`)
3. Sets default timestamp server (or uses `TIMESTAMP_URL`)
4. Signs the file using certificate from Windows Certificate Store
5. Verifies the signature
6. Exits with code 0 (success) or 1 (error)

When `SIGN_ENABLED` is not set to "1":
1. Displays info message
2. Exits with code 0 (success - no error)
3. NSIS build continues normally

## ✅ Verification

### Verify Signed Installer (Windows Explorer)

1. Right-click `LTTH-Setup-<version>.exe`
2. Select **Properties**
3. Go to **Digital Signatures** tab
4. Verify signature shows your certificate details
5. Check timestamp is present

### Verify Signed Installer (Command Line)

```batch
signtool verify /pa LTTH-Setup-<version>.exe
```

Expected output:
```
Successfully verified: LTTH-Setup-<version>.exe

Number of files successfully Verified: 1
Number of warnings: 0
Number of errors: 0
```

## ❌ Troubleshooting

### Error: "signtool.exe not found"

**Cause:** Windows SDK not installed or not in expected location

**Solution:**
1. Install Windows SDK: https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/
2. During installation, select "Windows SDK Signing Tools for Desktop Apps"
3. Or set custom path: `set SIGNTOOL_PATH=C:\Path\To\signtool.exe`

### Error: "No certificates were found"

**Cause:** No valid certificate in Windows Certificate Store

**Solution for Certum SimplySign:**
1. Install Certum SimplySign Desktop
2. Use it to install your certificate in Windows Certificate Store
3. Verify certificate appears in Windows Certificate Store (certmgr.msc)
4. Ensure certificate is in "Personal" > "Certificates" with a key icon

**Solution for other certificates:**
1. Import certificate into Windows Certificate Store
2. Use Certificate Manager (certmgr.msc) or MMC (mmc.exe)
3. Ensure certificate has associated private key

### Error: "Signing failed" with network error

**Cause:** Cannot access timestamp server or Certum Cloud HSM

**Solution:**
1. Check internet connection
2. Verify timestamp server is accessible
3. Try alternative timestamp server: `set TIMESTAMP_URL=https://timestamp.sectigo.com`
4. For Certum: Ensure Certum SimplySign Mobile App is ready for 2FA

### Warning: "Signature verification failed"

**Cause:** File may be signed but signature is invalid or untrusted

**Solution:**
1. Check certificate chain is complete
2. Verify certificate is trusted by Windows
3. Try signing again with correct certificate
4. Check certificate has not expired

### Build succeeds but files are not signed

**Cause:** `SIGN_ENABLED` is not set to "1"

**Solution:**
```batch
set SIGN_ENABLED=1
build-installer.bat
```

## 🔐 Security Best Practices

### Certificate Management

- ✅ **Protect private keys** - Store securely, never commit to version control
- ✅ **Use hardware tokens** - For maximum security (e.g., USB token)
- ✅ **Enable 2FA** - For cloud signing services like Certum SimplySign
- ✅ **Monitor expiration** - Set reminders to renew before expiry
- ✅ **Backup certificates** - Securely backup certificate and private key

### Signing Process

- ✅ **Always timestamp** - Signatures remain valid after certificate expiration
- ✅ **Verify after signing** - Check signature is valid before distribution
- ✅ **Use trusted timestamp servers** - From reputable Certificate Authorities
- ✅ **Keep unsigned backups** - For re-signing if needed
- ✅ **Document the process** - For team consistency

### Distribution

- ✅ **Only distribute signed installers** - Never distribute unsigned builds
- ✅ **Verify before distribution** - Ensure signing succeeded
- ✅ **Use HTTPS for downloads** - Prevent man-in-the-middle attacks
- ✅ **Provide checksums** - SHA-256 hashes for verification

## 📚 Additional Resources

### Certum SimplySign™

- [Certum Code Signing Services](https://www.certum.eu/en/cert_services_sign_code.html)
- [Certum SimplySign Manual](https://files.certum.eu/documents/manual_en/CS-Code_Signing_in_the_Cloud_Signtool_jarsigner_signing.pdf)
- [SimplySign Website](https://www.simplysign.eu/)

### Code Signing

- [Microsoft Code Signing](https://docs.microsoft.com/en-us/windows/win32/seccrypto/cryptography-tools)
- [Windows Authenticode](https://docs.microsoft.com/en-us/windows-hardware/drivers/install/authenticode)
- [Best Practices](https://docs.microsoft.com/en-us/windows-hardware/drivers/dashboard/code-signing-best-practices)

### NSIS Signing

- [NSIS !finalize Documentation](https://nsis.sourceforge.io/Docs/Chapter4.html#4.12.1)
- [NSIS !uninstfinalize Documentation](https://nsis.sourceforge.io/Docs/Chapter4.html#4.12.2)

## 🤝 Support

For issues with:

**LTTH Installer:**
- Email: loggableim@gmail.com
- GitHub: https://github.com/Loggableim/pupcidslittletiktoolhelper_desktop

**Certum SimplySign:**
- Support: https://www.certum.eu/en/contact/
- Documentation: https://files.certum.eu/documents/

**Windows SDK / signtool:**
- Microsoft Support: https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/

---

## 📝 Examples

### Example 1: Basic Signed Build

```batch
cd build-src\installer
set SIGN_ENABLED=1
build-installer.bat
```

Output:
```
============================================
Code Signing: ENABLED
============================================

The installer and uninstaller will be signed
using Windows signtool with Certum certificates
from the Windows Certificate Store.

[INFO] Will auto-detect signtool from Windows SDK
[INFO] Using default timestamp: https://timestamp.digicert.com

============================================
Compiling NSIS installer...
============================================

[INFO] Code signing is enabled
[OK] Found signtool: C:\Program Files (x86)\Windows Kits\10\bin\...\signtool.exe
[INFO] Signing: Uninstall.exe
[SUCCESS] File signed successfully
[SUCCESS] Signature verified

[INFO] Signing: LTTH-Setup-<version>.exe
[SUCCESS] File signed successfully
[SUCCESS] Signature verified

============================================
SUCCESS!
============================================
```

### Example 2: Custom Configuration

```batch
set SIGN_ENABLED=1
set SIGNTOOL_PATH=D:\Tools\signtool.exe
set TIMESTAMP_URL=https://timestamp.sectigo.com
build-installer.bat
```

### Example 3: Sign Existing File

```batch
set SIGN_ENABLED=1
sign-file.bat LTTH-Setup-<version>.exe
```

### Example 4: Build Without Signing (Default)

```batch
build-installer.bat
```

Output shows: "Code Signing: DISABLED"

---

**Last Updated:** December 2024  
**Version:** 1.0  
**License:** CC-BY-NC-4.0  
**Maintained by:** PupCid & Loggableim
