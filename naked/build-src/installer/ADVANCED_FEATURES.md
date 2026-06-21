# NSIS Installer - Advanced Features Documentation

**Version:** 1.2.0  
**Last Updated:** 2025-12-18  
**NSIS Version:** 3.11+

This document describes all advanced features implemented in the LTTH NSIS installer to fully utilize NSIS capabilities.

## 📋 Table of Contents

1. [Overview](#overview)
2. [Advanced Installation Features](#advanced-installation-features)
3. [Multi-Language Support](#multi-language-support)
4. [Version Management](#version-management)
5. [System Requirements Validation](#system-requirements-validation)
6. [User Data Management](#user-data-management)
7. [File Associations](#file-associations)
8. [Windows Integration](#windows-integration)
9. [Compression Optimization](#compression-optimization)
10. [Silent Installation](#silent-installation)
11. [Error Handling](#error-handling)
12. [Uninstaller Enhancements](#uninstaller-enhancements)

---

## 🎯 Overview

The LTTH installer has been enhanced to leverage the full power of NSIS 3.11, providing:

- **Professional user experience** with intelligent defaults
- **Robust error handling** and validation
- **Seamless upgrades** with data preservation
- **Deep Windows integration** for optimal functionality
- **Multi-language support** for international users
- **Security features** including code signing and integrity checks

---

## 🚀 Advanced Installation Features

### 1. Administrator Privileges Detection

**Feature:** Automatically detects if the installer is running with administrator rights.

**Benefits:**
- Prevents installation failures due to insufficient permissions
- Provides clear error message if admin rights are missing
- Shows proper error code (740) for UAC elevation requirement

**Implementation:**
```nsis
UserInfo::GetAccountType
Pop $0
${If} $0 != "admin"
  MessageBox MB_ICONSTOP "Administrator privileges required..."
  SetErrorLevel 740
  Quit
${EndIf}
```

### 2. Windows Version Validation

**Feature:** Checks that the system is running Windows 10 or later.

**Benefits:**
- Prevents installation on unsupported Windows versions
- Ensures modern Windows APIs are available
- Provides clear compatibility message

**Supported Versions:**
- ✅ Windows 10 (all editions)
- ✅ Windows 11
- ✅ Windows Server 2019/2022
- ❌ Windows 8.1 and earlier (blocked)

### 3. Architecture Detection

**Feature:** Detects 32-bit vs 64-bit Windows.

**Benefits:**
- Warns users on 32-bit systems (app optimized for 64-bit)
- Allows installation to continue with user confirmation
- Provides architecture-specific installation paths

### 4. Process Detection

**Feature:** Checks if LTTH is currently running before installation.

**Implementation:**
- Searches for window with product name
- Uses `tasklist` to find launcher.exe process
- Provides retry option after closing the app

**Benefits:**
- Prevents file-in-use errors
- Ensures clean installation
- Allows user to close app and retry without restarting installer

### 5. Disk Space Validation

**Feature:** Verifies sufficient disk space before installation.

**Configuration:**
```nsis
!define MIN_DISK_SPACE_MB 500  ; Minimum required: 500 MB
```

**Benefits:**
- Prevents partial installations due to disk full errors
- Calculates space on target drive dynamically
- Provides clear error message with available/required space

---

## 🌍 Multi-Language Support

### Supported Languages

The installer now supports **4 languages** with full translations:

| Language | Code | Coverage |
|----------|------|----------|
| English | en-US | 100% (default) |
| German | de-DE | 100% |
| French | fr-FR | 100% |
| Spanish | es-ES | 100% |

### Language Selection

- **Automatic:** Installer detects Windows language and uses matching translation
- **Manual:** User can select language at installer startup (if MUI_LANGDLL_DISPLAY is enabled)

### Translated Components

All installer UI elements are translated:
- ✅ Section names and descriptions
- ✅ Dialog boxes and prompts
- ✅ Error messages
- ✅ Progress indicators
- ✅ License agreement
- ✅ Finish page messages

### Adding More Languages

To add a new language:

1. Add language to installer script:
   ```nsis
   !insertmacro MUI_LANGUAGE "Italian"
   ```

2. Add translated strings:
   ```nsis
   LangString DESC_SEC_CORE ${LANG_ITALIAN} "File dell'applicazione principale (richiesti)"
   ```

3. Rebuild the installer

---

## 📊 Version Management

### Intelligent Version Comparison

**Feature:** Compares installed version with installer version using semantic versioning.

**Scenarios:**

1. **Same Version (1.2.0 → 1.2.0)**
   - Message: "Already installed - repair installation?"
   - Action: Repair/reinstall

2. **Older Version (1.1.0 → 1.2.0)**
   - Message: "Upgrade to version 1.2.0?"
   - Action: Upgrade with data preservation

3. **Newer Version (1.3.2 → 1.2.0)**
   - Message: "Downgrade to version 1.2.0?"
   - Action: Downgrade with warning

### Upgrade Process

**Automatic Steps:**
1. Detect existing installation
2. Compare versions
3. Backup user data (see User Data Management)
4. Run uninstaller silently (`/S` flag)
5. Install new version
6. Preserve user data and settings

**Benefits:**
- No data loss during upgrades
- Smooth transition between versions
- Automatic cleanup of old files

---

## ✅ System Requirements Validation

### Pre-Installation Checks

The installer performs these checks before installation:

| Check | Requirement | Error Behavior |
|-------|-------------|----------------|
| Administrator | Must have admin rights | Block with error 740 |
| Windows Version | Windows 10 or later | Block with error message |
| Architecture | 64-bit recommended | Warn but allow |
| Disk Space | 500 MB minimum | Block with space info |
| Running Process | App must be closed | Retry option provided |

### Post-Check Actions

- **Pass:** Installation proceeds normally
- **Fail:** Clear error message with resolution steps
- **Warn:** User can choose to continue or abort

---

## 💾 User Data Management

### Automatic Backup During Upgrade

**Feature:** Automatically backs up user data when upgrading from a previous version.

**Backup Location:**
```
$INSTDIR\app\user_data_backup_YYYYMMDD_HHMMSS\
```

**Backed Up Data:**
- User configuration files (`user_configs/`)
- User data directory (`user_data/`)
- Custom settings and profiles

**Backup Naming:**
- Timestamp format: `user_data_backup_20251218_143025`
- Stored in same installation directory
- Path saved to registry for potential restore

**Implementation:**
```nsis
Function BackupUserData
  IfFileExists "$INSTDIR\app\user_data\*.*" 0 no_backup
  DetailPrint "Backing up user data..."
  Call GetTime
  ; ... create timestamped backup directory
  CopyFiles /SILENT "$INSTDIR\app\user_data\*.*" "$BackupPath"
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "LastBackupPath" "$BackupPath"
no_backup:
FunctionEnd
```

### Uninstall Data Preservation

**Feature:** During uninstallation, user can choose to keep or delete their data.

**Options:**
1. **Keep Data:** User data and configs remain on disk
2. **Delete All:** Complete removal including user data

**Benefits:**
- Prevents accidental data loss
- Allows clean reinstallation with settings preserved
- User has full control

---

## 📂 File Associations

### .ltth File Extension

**Feature:** Associates `.ltth` configuration files with LTTH application.

**Benefits:**
- Double-click .ltth files to open them in LTTH
- Custom icon for .ltth files in Windows Explorer
- Professional application integration

**Registry Entries:**
```
HKCR\.ltth = "LTTH.ConfigFile"
HKCR\LTTH.ConfigFile = "LTTH Configuration"
HKCR\LTTH.ConfigFile\DefaultIcon = "$INSTDIR\icon.ico"
HKCR\LTTH.ConfigFile\shell\open\command = "$INSTDIR\launcher.exe" "%1"
```

**Shell Integration:**
- Uses `SHChangeNotify` to update Windows Explorer immediately
- No system restart required

### Usage

**For Users:**
1. Select "File Associations" during installation
2. After installation, .ltth files show LTTH icon
3. Double-click any .ltth file to open in LTTH

**For Developers:**
- Save configuration as .ltth files
- Users can share configurations easily
- Professional file handling

---

## 🔧 Windows Integration

### Windows Firewall Exception

**Feature:** Adds firewall rule to allow LTTH network communication.

**Implementation:**
```nsis
nsExec::ExecToLog 'netsh advfirewall firewall add rule name="${PRODUCT_NAME}" 
  dir=in action=allow program="$INSTDIR\launcher.exe" enable=yes profile=private,domain'
```

**Benefits:**
- TikTok LIVE streaming works without manual firewall configuration
- Network features function immediately after installation
- Automatic removal during uninstallation

**Profiles:**
- ✅ Private network
- ✅ Domain network
- ❌ Public network (for security)

### Auto-Start with Windows

**Feature:** Option to start LTTH automatically when Windows boots.

**Registry Location:**
```
HKCU\Software\Microsoft\Windows\CurrentVersion\Run
```

**Benefits:**
- Streamers can have LTTH ready immediately after boot
- No manual startup required
- Easy to enable/disable from Windows settings

**User Control:**
- Optional during installation (unchecked by default)
- Can be disabled later via Windows Task Manager → Startup tab

---

## 📦 Compression Optimization

### Enhanced Compression Settings

**Configuration:**
```nsis
SetCompressor /SOLID lzma
SetCompressorDictSize 64
SetDatablockOptimize on
```

**Benefits:**

1. **LZMA Compression:**
   - Best compression ratio available in NSIS
   - Reduces installer size by 40-60%
   - Solid compression for better ratio

2. **64 MB Dictionary:**
   - Optimal balance of compression vs. speed
   - Recommended for files 50-200 MB

3. **Datablock Optimization:**
   - Optimizes data blocks for smaller size
   - Minimal performance impact

**Results:**
- Typical installer size: 150-200 MB (with Node.js)
- Without compression: ~350-400 MB
- Compression ratio: ~50-60%

---

## 🔇 Silent Installation

### Command-Line Options

**Silent Install:**
```batch
LTTH-Setup-1.2.0.exe /S
```

**Silent Install with Custom Directory:**
```batch
LTTH-Setup-1.2.0.exe /S /D=C:\CustomPath\LTTH
```

**Silent Uninstall:**
```batch
Uninstall.exe /S
```

### Supported Switches

| Switch | Description | Example |
|--------|-------------|---------|
| `/S` | Silent mode (no UI) | `Setup.exe /S` |
| `/D=path` | Custom install directory | `Setup.exe /D=C:\LTTH` |
| `/NCRC` | Skip CRC check (faster) | `Setup.exe /NCRC` |

### Silent Installation Features

**What's Installed (Silent):**
- ✅ Core application (always)
- ✅ Node.js portable (if available)
- ✅ Desktop shortcut
- ✅ Start Menu shortcuts
- ❌ Quick Launch (not in silent mode)
- ❌ File associations (not in silent mode)
- ❌ Firewall exception (not in silent mode)
- ❌ Auto-start (not in silent mode)

**Exit Codes:**
- `0` - Success
- `1` - Installation failed
- `2` - User cancelled (not in silent mode)
- `740` - Administrator privileges required

### Enterprise Deployment

**Example Deployment Script:**
```batch
@echo off
REM Deploy LTTH to all workstations

REM Check if running as admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Error: Administrator privileges required
    exit /b 1
)

REM Silent install to standard location
\\server\share\LTTH-Setup-1.2.0.exe /S /D=C:\Program Files\LTTH

REM Verify installation
if exist "C:\Program Files\LTTH\launcher.exe" (
    echo LTTH installed successfully
    exit /b 0
) else (
    echo LTTH installation failed
    exit /b 1
)
```

---

## ⚠️ Error Handling

### Pre-Installation Validation

**Errors Detected:**
1. Missing administrator privileges → Exit code 740
2. Unsupported Windows version → Abort with message
3. Insufficient disk space → Abort with space details
4. Application already running → Retry/Cancel dialog

### Installation Error Handling

**During Installation:**
```nsis
Function .onInstFailed
  MessageBox MB_ICONEXCLAMATION|MB_OK \
  "Installation failed. Please check the installation log for details.$\n$\n
  Common issues:$\n
  - Insufficient disk space$\n
  - Missing administrator privileges$\n
  - Antivirus interference$\n$\n
  Please try again or contact support."
FunctionEnd
```

### Installation Logging

**Log File:** `$INSTDIR\install.log`

**Contents:**
```
Installation completed successfully
Product: PupCid's Little TikTool Helper
Version: 1.2.0
Install Date: C:\Program Files\LTTH
```

**Benefits:**
- Troubleshooting installation issues
- Verification of successful installation
- Support requests with diagnostic info

### CRC Integrity Check

**Feature:** Verifies installer integrity before extraction.

```nsis
CRCCheck on
```

**Benefits:**
- Detects corrupted downloads
- Prevents installation of damaged files
- Can be disabled with `/NCRC` for faster testing

---

## 🗑️ Uninstaller Enhancements

### Smart Data Preservation

**Feature:** Asks user about data preservation during uninstallation.

**Dialog:**
```
Do you want to keep your user data and settings?

Choosing 'No' will permanently delete all your data
```

**Outcomes:**

1. **Keep Data (Yes):**
   - Removes application files
   - Keeps `user_data/` and `user_configs/`
   - Allows reinstallation with settings preserved

2. **Delete All (No):**
   - Complete removal including user data
   - Fresh start on next installation

### Complete Cleanup

**Uninstaller Removes:**
- ✅ Application files and directories
- ✅ Desktop shortcuts
- ✅ Start Menu shortcuts
- ✅ Quick Launch shortcuts
- ✅ File associations (.ltth)
- ✅ Windows Firewall rules
- ✅ Auto-start registry entry
- ✅ All registry keys
- ✅ Installation directory (if empty)

**Registry Cleanup:**
```nsis
DeleteRegKey HKCR ".ltth"
DeleteRegKey HKCR "LTTH.ConfigFile"
DeleteRegValue HKCU "...\Run" "LTTH"
DeleteRegKey HKLM "...\Uninstall\LTTH"
DeleteRegKey HKLM "...\App Paths\launcher.exe"
```

**Firewall Cleanup:**
```nsis
nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="${PRODUCT_NAME}"'
```

### User Feedback

**Success Message:**
```
LTTH has been successfully uninstalled.

Thank you for using PupCid's Little TikTool Helper!
```

---

## 📈 Performance Optimizations

### Installer Size

**Compression Settings:**
- LZMA solid compression
- 64 MB dictionary
- Datablock optimization

**Results:**
- Core app only: ~20-30 MB
- With Node.js: ~150-200 MB
- Compression ratio: 50-60%

### Installation Speed

**Optimizations:**
1. `/nonfatal` for optional files (no error dialogs)
2. Solid compression (faster extraction)
3. Minimal registry operations
4. Efficient file copying

**Typical Times:**
- Installation: 30-60 seconds
- Uninstallation: 10-20 seconds
- Upgrade: 40-70 seconds (includes backup)

---

## 🔐 Security Features

### Code Signing

**Full support** for Authenticode signing with:
- Installer executable
- Uninstaller executable
- Automatic timestamping
- Certificate verification

See [SIGNING.md](SIGNING.md) for details.

### Integrity Verification

**CRC Check:**
- Validates installer hasn't been tampered with
- Detects corrupted downloads
- Ensures authentic installation

**File Verification:**
- All files extracted with integrity check
- Error if extraction fails
- Rollback on critical errors

---

## 📚 Best Practices

### For Developers

1. **Always test upgrades:**
   - Install old version
   - Run new installer
   - Verify data preservation

2. **Test all optional components:**
   - File associations
   - Firewall rules
   - Auto-start
   - Silent installation

3. **Verify cleanup:**
   - Install → Uninstall
   - Check no leftover files/registry

### For Distributors

1. **Sign your installer** for trust
2. **Provide checksums** (SHA-256) for downloads
3. **Test on clean Windows** installations
4. **Document silent install** options for IT departments

### For Users

1. **Run as Administrator** for proper installation
2. **Close LTTH** before upgrading
3. **Keep user data** when prompted during uninstall
4. **Enable Firewall exception** for network features

---

## 🔄 Future Enhancements

### Planned Features

- [ ] Automatic update checking
- [ ] In-app upgrade notifications
- [ ] VPatch binary patching for smaller updates
- [ ] Custom installer themes
- [ ] Plugin system integration
- [ ] Configuration import/export during installation
- [ ] Multi-user installation support
- [ ] Portable mode option

---

## 📞 Support

### Getting Help

**Documentation:**
- [README.md](README.md) - Build instructions
- [SIGNING.md](SIGNING.md) - Code signing guide
- [COMPATIBILITY_UPDATE_2025.md](COMPATIBILITY_UPDATE_2025.md) - Compatibility info

**Contact:**
- GitHub: https://github.com/Loggableim/pupcidslittletiktoolhelper_desktop
- Email: pupcid@ltth.app
- Website: https://ltth.app

---

## 📄 License

This installer is part of LTTH and licensed under **CC-BY-NC-4.0**.

See [LICENSE](../../LICENSE) for details.

---

**Last Updated:** 2025-12-18  
**Installer Version:** 1.2.0  
**NSIS Version:** 3.11  
**Maintained by:** PupCid & Loggableim
