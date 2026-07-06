# LTTH NSIS Installer - Build Instructions

This directory contains everything needed to build a professional Windows installer for PupCid's Little TikTool Helper (LTTH).

> Status: legacy fallback path. The maintained Windows launcher is `launcher.exe`; keep this NSIS path for support, offline scenarios, or explicit fallback packaging.

## 📋 Overview

The NSIS installer creates a complete setup package that installs:
- LTTH Backend (`app/` directory with all modules and plugins)
- Go Launcher (`launcher.exe`)
- Optional: Portable Node.js runtime
- Desktop and Start Menu shortcuts
- Professional uninstaller with complete cleanup

**Features:**
- ✅ Modern UI with custom branding and multi-language support (English, German, French, Spanish)
- ✅ **Splash screen with fade effects** (using AdvSplash plugin with Banner fallback)
- ✅ Custom Start Menu folder selection with "Don't create shortcuts" option (using StartMenu.dll)
- ✅ **Intelligent version comparison and upgrade handling**
- ✅ **Automatic user data backup during upgrades**
- ✅ **Windows version detection** (requires Windows 10 or later)
- ✅ **Administrator privileges verification**
- ✅ **Disk space validation** (checks for sufficient space before installation)
- ✅ **Process detection** (prevents installation while app is running)
- ✅ **File associations** (.ltth files)
- ✅ **Windows Firewall exception** (optional)
- ✅ **Auto-start with Windows** (optional)
- ✅ VPatch integration prepared for future updates
- ✅ **Code signing support with Certum cloud signing**
- ✅ **Silent/unattended installation support**
- ✅ **Installation logging**
- ✅ **Enhanced compression** (smaller installer size)
- ✅ **CRC integrity checking**
- ✅ Professional installer/uninstaller graphics
- ✅ Complete registry cleanup
- ✅ Admin rights handling
- ✅ Existing installation detection with version comparison

## 🎯 Quick Start

### Prerequisites

1. **Install NSIS (Nullsoft Scriptable Install System)**
   - Download from: https://nsis.sourceforge.io/Download
   - Version: 3.11 or higher (latest: 3.11, released March 2025)
   - Fully compatible with Windows 10 and Windows 11 (64-bit and 32-bit)
   - Use default installation settings

2. **Install NSIS Plugins** (required for full functionality)
   - **AdvSplash Plugin** (for professional splash screen with fade effects)
     - Download from: https://nsis.sourceforge.io/AdvSplash_plug-in
     - Extract `AdvSplash.dll` to `C:\Program Files (x86)\NSIS\Plugins\x86-unicode\`
     - **Features**: Smooth fade-in (600ms) and fade-out (400ms) effects on Windows 2000+
     - **Fallback**: If not installed, the installer automatically uses the built-in Banner plugin
   - **StartMenu.dll** (for custom start menu folder selection - included with NSIS)
     - This plugin is already included with NSIS installation
     - Provides advanced start menu folder selection with "Don't create shortcuts" option

3. **Download Node.js Portable** (optional but recommended)
   - Download specific version: https://nodejs.org/dist/v18.19.1/node-v18.19.1-win-x64.zip
   - Or latest LTS v18.x: https://nodejs.org/dist/latest-v18.x/
   - Or LTS v20.x: https://nodejs.org/dist/latest-v20.x/
   - Extract to: `build-src/assets/node/`
   - Verify: `build-src/assets/node/node.exe` should exist
   - **Note**: LTTH is tested with Node.js 18.x and 20.x LTS versions. Recommended: use latest v18.x or v20.x.

4. **Optional: Setup Code Signing** (for trusted installers)
   - Install Windows SDK for signtool.exe
   - Install Certum SimplySign certificate in Windows Certificate Store
   - See [SIGNING.md](SIGNING.md) for complete guide

## 📁 Directory Structure

```
build-src/
├── installer/
│   ├── ltth-installer.nsi          ← Main NSIS script (drag this into MakeNSISW)
│   ├── build-installer.bat         ← Automated build script with signing support
│   ├── sign-file.bat               ← Code signing helper (called by NSIS)
│   ├── SIGNING.md                  ← Code signing documentation
│   ├── license.txt                 ← License text (auto-generated from LICENSE)
│   ├── installer-header.bmp        ← Header image (150x57, auto-generated)
│   ├── installer-sidebar.bmp       ← Sidebar image (164x314, auto-generated)
│   ├── splash-screen.bmp           ← Splash screen (500x300, auto-generated)
│   ├── banner.bmp                  ← Banner image (500x100, auto-generated)
│   └── README.md                   ← This file
├── assets/
│   ├── node/                       ← Node.js portable runtime (DOWNLOAD REQUIRED)
│   │   ├── node.exe                ← Node.js executable
│   │   ├── npm                     ← NPM package manager
│   │   └── node_modules/           ← Node.js core modules
│   └── splash.html                 ← Existing splash (legacy reference)
├── launcher.exe                    ← Local launcher (existing)
└── icon.ico                        ← Application icon (existing)
```

## 🚀 Building the Installer

### Method 1: GUI (Recommended for First Build)

1. **Prepare Node.js** (if not already done):
   ```bash
   # Download Node.js 18.x or 20.x portable from https://nodejs.org/dist/v18.19.1/
   # Extract to build-src/assets/node/
   ```

2. **Verify all files are in place**:
   - ✅ `build-src/launcher.exe` exists
   - ✅ `build-src/icon.ico` exists
   - ✅ `app/` directory exists with all files
   - ✅ `build-src/installer/ltth-installer.nsi` exists
   - ✅ `build-src/assets/node/node.exe` exists (optional)

3. **Build the installer**:
   - Open **MakeNSISW** (NSIS compiler GUI)
   - Drag and drop `ltth-installer.nsi` into the MakeNSISW window
   - OR: Right-click `ltth-installer.nsi` → "Compile NSIS Script"
   - Wait for compilation (30-60 seconds)

4. **Result**:
   - Output: `build-src/installer/LTTH-Setup-1.2.0.exe`
   - Size: ~50-200 MB (depending on Node.js inclusion)

### Method 2: Command Line

```bash
# Navigate to installer directory
cd build-src/installer

# Compile using NSIS
"C:\Program Files (x86)\NSIS\makensis.exe" ltth-installer.nsi

# Output: LTTH-Setup-1.2.0.exe
```

### Method 3: Batch Script (Automated)

Create `build-installer.bat` in `build-src/installer/`:

```batch
@echo off
echo ============================================
echo Building LTTH Installer...
echo ============================================

REM Check if NSIS is installed
if not exist "C:\Program Files (x86)\NSIS\makensis.exe" (
    echo ERROR: NSIS not found!
    echo Please install NSIS from https://nsis.sourceforge.io/Download
    pause
    exit /b 1
)

REM Compile installer
"C:\Program Files (x86)\NSIS\makensis.exe" ltth-installer.nsi

if %ERRORLEVEL% == 0 (
    echo.
    echo ============================================
    echo SUCCESS! Installer created:
    echo LTTH-Setup-1.2.0.exe
    echo ============================================
) else (
    echo.
    echo ============================================
    echo ERROR! Build failed. Check error messages above.
    echo ============================================
)

pause
```

Then simply double-click `build-installer.bat` to build.

## 🔐 Code Signing (Optional)

The installer supports automatic code signing using Windows signtool with Certum cloud signing certificates.

### Quick Start

```batch
# Enable code signing
set SIGN_ENABLED=1

# Build installer (will sign automatically)
build-installer.bat
```

### Features

- ✅ Signs both installer and uninstaller executables
- ✅ Uses Windows Certificate Store (Certum SimplySign compatible)
- ✅ Automatic signtool detection from Windows SDK
- ✅ Timestamping for long-term validity
- ✅ Signature verification after signing
- ✅ Optional - disabled by default (no errors if not configured)

### Documentation

For complete code signing setup, configuration, and troubleshooting:

📖 **See [SIGNING.md](SIGNING.md)** - Complete code signing guide

**Quick reference:**
- Set `SIGN_ENABLED=1` to enable signing
- Set `SIGNTOOL_PATH` for custom signtool location (optional)
- Set `TIMESTAMP_URL` for custom timestamp server (optional)

**Example with custom settings:**

```batch
set SIGN_ENABLED=1
set SIGNTOOL_PATH=D:\Tools\signtool.exe
set TIMESTAMP_URL=https://timestamp.sectigo.com
build-installer.bat
```

## 📦 What Gets Installed

When a user runs the installer, they can choose to install:

### Required:
- **LTTH Core Application** (read-only, always installed)
  - All files from `app/` directory
  - `launcher.exe` (main launcher)
  - `icon.ico` (application icon)
  - Uninstaller

### Optional:
- **Node.js Portable Runtime** (recommended, selected by default)
  - Portable Node.js v18.x
  - No system-wide changes
  - Self-contained in installation directory

- **Desktop Shortcut** (selected by default)
  - Creates shortcut on desktop

- **Start Menu Shortcuts** (selected by default)
  - Creates program folder in Start Menu
  - Shortcuts to launcher and uninstaller
  - Optional README link

- **Quick Launch Shortcut** (not selected by default)
  - Creates taskbar quick launch shortcut

- **File Associations** (not selected by default)
  - Associates .ltth configuration files with ${PRODUCT_NAME}
  - Allows double-clicking .ltth files to open them in the app

- **Windows Firewall Exception** (not selected by default)
  - Adds firewall rule to allow network communication
  - Recommended for TikTok LIVE streaming functionality

- **Run at Windows Startup** (not selected by default)
  - Automatically starts ${PRODUCT_NAME} when Windows boots
  - Useful for streamers who use the app regularly

### Installation Process:

1. **Splash Screen**: Shows LTTH branding with fade effects (2 seconds with 600ms fade-in, 400ms fade-out)
2. **Welcome Page**: Introduction and product info
3. **License Agreement**: CC-BY-NC-4.0 license (must accept)
4. **Component Selection**: Choose optional components
5. **Directory Selection**: Choose installation path (default: `C:\Program Files\LTTH`)
6. **Start Menu Folder**: Choose Start Menu folder name (with option to skip shortcuts)
7. **Installation**: Progress with banner updates
8. **Finish**: Option to launch LTTH immediately

## 🎨 Customizing the Installer

### Change Version Number

Edit `ltth-installer.nsi` line 18:
```nsis
!define PRODUCT_VERSION "1.2.0"  ; Change this
```

### Customize Images

Replace the auto-generated BMP files with your own:

- **installer-header.bmp**: 150x57 pixels, 24-bit BMP
- **installer-sidebar.bmp**: 164x314 pixels, 24-bit BMP
- **splash-screen.bmp**: 500x300 pixels, 24-bit BMP (for AdvSplash)
- **banner.bmp**: 500x100 pixels, 24-bit BMP (for Banner plugin)

**Note:** Use BMP format (not PNG/JPG) for maximum compatibility with NSIS 3.11.

### Customize Splash Screen

The installer uses the **AdvSplash plugin** to display a professional splash screen with fade effects:

**Current Configuration:**
```nsis
advsplash::show 2000 600 400 -1 $PluginsDir\spltmp
```

**Parameters Explained:**
- **2000**: Display time in milliseconds (2 seconds)
- **600**: Fade-in duration in milliseconds (0.6 seconds)
- **400**: Fade-out duration in milliseconds (0.4 seconds)
- **-1**: Transparency color (-1 = no transparency, or use RGB hex like 0xFF00FF for magenta)
- **$PluginsDir\spltmp**: Filename (without .bmp extension)

**To customize:**

1. Replace `splash-screen.bmp` with your own 500x300, 24-bit BMP image
2. Adjust timing in `ltth-installer.nsi` line 176:
   ```nsis
   advsplash::show 2000 600 400 -1 $PluginsDir\spltmp
   ```
3. Optional: Add transparency by changing `-1` to a color value (e.g., `0xFF00FF` for magenta key)
4. Optional: Add a WAV file by placing `splash-screen.wav` in the installer directory

**Fallback Behavior:**
- If AdvSplash.dll is not installed, the installer automatically uses the built-in Banner plugin
- No errors are shown to the user - installation continues normally

### Change Branding Text

Edit these defines in `ltth-installer.nsi`:
```nsis
!define PRODUCT_NAME "PupCid's Little TikTool Helper"
!define PRODUCT_NAME_SHORT "LTTH"
!define PRODUCT_PUBLISHER "PupCid / Loggableim"
!define PRODUCT_WEB_SITE "https://ltth.app"
```

### Add/Remove Components

To add a new optional component, add a section like this:

```nsis
Section "My New Feature" SEC_MYFEATURE
  SetOutPath "$INSTDIR\myfeature"
  File /r "path\to\files\*.*"
SectionEnd
```

Then add description:
```nsis
!insertmacro MUI_DESCRIPTION_TEXT ${SEC_MYFEATURE} "Description of my feature"
```

## 🔄 VPatch Integration (Future Updates)

The installer is prepared for VPatch integration for automatic updates:

### Setup Steps:

1. **Install VPatch Plugin**:
   - Download from: https://nsis.sourceforge.io/VPatch_plug-in
   - Copy `VPatch.dll` to NSIS plugins folder
   - Copy `GenPat.exe` to your tools directory

2. **Generate Patches**:
   ```bash
   GenPat.exe old-version.exe new-version.exe patch.dat
   ```

3. **Create Update Server**:
   - Host patch files on web server
   - Create version.json with latest version info
   - Implement version checking in launcher.exe

4. **Apply Updates**:
   - Launcher checks for updates
   - Downloads patch file
   - Applies patch using VPatch
   - Restarts application

**Documentation**: See `NSIS\Docs\VPatch\Readme.html` for full details.

## 🧪 Testing the Installer

### Before Building:

1. ✅ Verify all source files exist
2. ✅ Test `launcher.exe` manually
3. ✅ Check `app/` contains all required files
4. ✅ Ensure Node.js portable is complete (if including)

### After Building:

1. **Test Installation**:
   - Run `LTTH-Setup-1.2.0.exe` as Administrator
   - Select all components
   - Complete installation
   - Verify shortcuts work
   - Launch application

2. **Test Uninstallation**:
   - Run uninstaller from Start Menu or Control Panel
   - Verify all files removed
   - Check registry cleaned up
   - Confirm no leftover files

3. **Test Upgrade**:
   - Install version 1.0
   - Run installer for version 1.2
   - Verify upgrade works correctly

## 📊 Installer Size

Approximate sizes:

- **Core Application**: ~10-20 MB (app directory + launchers)
- **Node.js Portable**: ~120-150 MB
- **Installer Overhead**: ~5-10 MB (compression, uninstaller)

**Total Installer Size**: ~150-200 MB (with Node.js)  
**Without Node.js**: ~20-30 MB

**Installation Time**: 30-60 seconds (depending on disk speed)

## 🐛 Troubleshooting

### Build Errors

**"Can't open script file"**
- Solution: Make sure you're in the `build-src/installer` directory
- Or provide full path to `ltth-installer.nsi`

**"File not found: ../launcher.exe"**
- Solution: Verify `launcher.exe` exists in `build-src/`
- Build launcher first: `cd build-src && go build -o launcher.exe launcher-gui.go`

**"File not found: ../../app"**
- Solution: Verify `app/` directory exists in repository root
- Ensure all app files are present

**"File not found: ../assets/node"**
- Solution: This is optional. Either:
  - Download and extract Node.js portable to `build-src/assets/node/`
  - Or comment out the Node.js section in the script

**NSIS Integrity Check Errors (Windows 10/11)**
- Re-download the NSIS installer if integrity checks fail
- Temporarily disable antivirus during installation
- Avoid special characters in file paths
- Run NSIS compiler as administrator on Windows 10/11

### Runtime Errors

**"Failed to extract files"**
- Cause: Insufficient disk space or permissions
- Solution: Run as Administrator, free up disk space

**"Installation directory not empty"**
- Cause: Previous installation not cleaned up
- Solution: Uninstall previous version or choose different directory

**"Application won't launch after install"**
- Cause: Missing Node.js or dependencies
- Solution: Install Node.js section or ensure Node.js is on system PATH

## 📝 Advanced Customization

### StartMenu.dll Custom Dialog

The installer uses StartMenu.dll to provide a flexible start menu folder selection with the following features:

- **Custom folder selection**: User can choose any Start Menu folder
- **Auto-add**: Automatically adds program name to selected folder
- **"Don't create shortcuts" option**: Checkbox to skip Start Menu shortcut creation
- **Remember last choice**: Saves the last selected folder to registry

The implementation is in the `StartMenuPage` function in `ltth-installer.nsi`:

```nsis
StartMenu::Select /autoadd \
  /text "Select the Start Menu folder where you would like to create program shortcuts:" \
  /lastused "$StartMenuFolder" \
  /checknoshortcuts "Don't create Start Menu shortcuts" \
  "${PRODUCT_NAME_SHORT}"
```

**Customization options:**
- `/noicon` - Don't show icon in dialog
- `/rtl` - Right-to-left text direction (for RTL languages)
- Custom text via `/text` parameter
- Different default folder name (last parameter)

### Enable AdvSplash (Advanced Splash Screen)

1. Install AdvSplash plugin
2. Uncomment these lines in `ltth-installer.nsi` (around line 123):
   ```nsis
   advsplash::show 2000 500 500 0x1a1a2e "splash-screen.bmp"
   Pop $0
   ```
3. Comment out the Banner::show lines

### Add Custom Registry Keys

Add to the installation section:
```nsis
WriteRegStr HKCU "Software\LTTH" "InstallPath" "$INSTDIR"
WriteRegStr HKCU "Software\LTTH" "Version" "${PRODUCT_VERSION}"
```

### Run Post-Install Commands

Add before `SectionEnd` in SEC_CORE:
```nsis
; Run npm install
nsExec::ExecToLog '"$INSTDIR\node\node.exe" "$INSTDIR\node\npm" install --prefix "$INSTDIR\app"'
Pop $0
```

## 🔐 Security Notes

- Installer requires **Administrator privileges** (RequestExecutionLevel admin)
- Digital signing recommended for distribution (use SignTool.exe)
- Registry keys stored in HKLM (system-wide)
- Uninstaller removes all traces

### Code Signing (Recommended):

```bash
signtool.exe sign /f certificate.pfx /p password /t http://timestamp.digicert.com LTTH-Setup-1.2.0.exe
```

## 📚 Additional Resources

### Documentation Files
- **[ADVANCED_FEATURES.md](ADVANCED_FEATURES.md)** - Complete feature documentation (16,000+ words)
- **[ENHANCEMENT_SUMMARY.md](ENHANCEMENT_SUMMARY.md)** - Overview of all enhancements
- **[SIGNING.md](SIGNING.md)** - Code signing setup guide
- **[COMPATIBILITY_UPDATE_2025.md](COMPATIBILITY_UPDATE_2025.md)** - Windows compatibility info

### External Resources
- **NSIS Documentation**: https://nsis.sourceforge.io/Docs/
- **NSIS Modern UI**: https://nsis.sourceforge.io/Docs/Modern%20UI/Readme.html
- **NSIS Plugins**: https://nsis.sourceforge.io/Category:Plugins
- **VPatch Documentation**: NSIS\Docs\VPatch\Readme.html
- **StartMenu.dll**: Included with NSIS Modern UI

## 🆕 What's New in Version 1.2.0

### Major Enhancements
✅ **Multi-Language Support** - English, German, French, Spanish  
✅ **Intelligent Version Management** - Smart upgrades with version comparison  
✅ **Automatic Data Backup** - User data backed up during upgrades  
✅ **Enhanced System Validation** - Windows 10+, admin rights, disk space checks  
✅ **Windows Integration** - File associations, firewall rules, auto-start  
✅ **Silent Installation** - Full unattended installation support  
✅ **Better Compression** - 50-60% smaller installer size  
✅ **Installation Logging** - Complete log file for troubleshooting  

### Quick Reference

**Silent Install:**
```batch
LTTH-Setup-1.2.0.exe /S
LTTH-Setup-1.2.0.exe /S /D=C:\CustomPath
```

**Optional Components:**
- File Associations (.ltth files)
- Windows Firewall Exception
- Auto-start with Windows
- Quick Launch Shortcut

**System Requirements:**
- Windows 10 or later (required)
- Administrator privileges (required)
- 500 MB free disk space (required)
- 64-bit Windows (recommended)

For complete details, see [ADVANCED_FEATURES.md](ADVANCED_FEATURES.md)

## 🎯 Final Checklist

Before distributing the installer:

- [ ] Test on clean Windows 10/11 system
- [ ] Test with and without admin rights
- [ ] Verify all components install correctly
- [ ] Test uninstallation completely removes everything
- [ ] Test upgrade from previous version
- [ ] Verify shortcuts work correctly
- [ ] Check file associations (if any)
- [ ] Test on different Windows versions
- [ ] Consider code signing for trusted publisher
- [ ] Create installation documentation for users
- [ ] Test with antivirus software enabled

## 📧 Support

For issues or questions:
- GitHub: https://github.com/Loggableim/ltth.app
- Email: pupcid@ltth.app
- Website: https://ltth.app

---

**License**: CC-BY-NC-4.0  
**Version**: 1.2.0  
**Last Updated**: 2025-12-18

## 🔄 Compatibility Notes

### NSIS Version
- **Recommended**: NSIS 3.11 (latest as of March 2025)
- **Minimum**: NSIS 3.09
- **Fully compatible** with Windows 10 and Windows 11 (64-bit and 32-bit)

### Node.js Versions
- **Recommended**: Node.js 18.x LTS (tested and verified with LTTH)
- **Alternative**: Node.js 20.x LTS (also compatible)
- **Note**: LTTH is designed for Node.js 18.x and 20.x. Newer versions may not be compatible.

### Windows Compatibility
- **Windows 11**: Fully supported with modern manifest support
- **Windows 10**: Fully supported (all editions)
- **Windows Server 2019/2022**: Supported
- **Older versions**: May work but not officially tested

### Build Requirements
- NSIS must be run as Administrator on Windows 10/11 for proper permissions
- Avoid special characters in file paths to prevent NSIS integrity errors
- Disable antivirus temporarily if experiencing false positives during build
