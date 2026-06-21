# NSIS Installer Testing Checklist

**Version:** 1.2.0  
**Last Updated:** 2025-12-18  
**Purpose:** Comprehensive testing guide for LTTH NSIS installer

## 📋 Pre-Build Testing

### Build Environment
- [ ] NSIS 3.11 or higher installed
- [ ] AdvSplash plugin installed (optional)
- [ ] Windows SDK installed (for code signing)
- [ ] All required files present (run `validate-installer.bat`)
- [ ] launcher.exe built and present in build-src/
- [ ] app/ directory complete with all files
- [ ] Node.js portable downloaded (optional)
- [ ] All BMP images present

### Documentation
- [ ] README.md is up to date
- [ ] ADVANCED_FEATURES.md is complete
- [ ] SIGNING.md is accurate
- [ ] license.txt is current
- [ ] All inline comments in NSI script are clear

## 🔨 Build Testing

### Basic Build
- [ ] Run `build-installer.bat` successfully
- [ ] No errors during compilation
- [ ] Output file created: LTTH-Setup-1.2.0.exe
- [ ] File size is reasonable (~150-200 MB with Node.js)
- [ ] CRC check passes

### Code Signing (if enabled)
- [ ] SIGN_ENABLED=1 set
- [ ] Both installer and uninstaller are signed
- [ ] Signature verification passes
- [ ] Certificate details are correct
- [ ] Timestamp is present

### Silent Build
- [ ] Build completes without user interaction
- [ ] All default components are included
- [ ] Exit code is 0 on success

## 🧪 Installation Testing

### Fresh Installation (Windows 10)

#### Pre-Installation
- [ ] Run as Administrator
- [ ] Splash screen appears (if AdvSplash installed)
- [ ] Welcome page displays correctly
- [ ] License agreement shows CC-BY-NC-4.0
- [ ] Component selection page works

#### Installation Process
- [ ] Progress bars update correctly
- [ ] Banner messages are clear
- [ ] No errors during file copy
- [ ] Installation completes successfully
- [ ] Finish page appears

#### Post-Installation Verification
- [ ] All selected files are installed
- [ ] launcher.exe is present and functional
- [ ] icon.ico is present
- [ ] Node.js folder exists (if selected)
- [ ] Desktop shortcut created (if selected)
- [ ] Start Menu folder created
- [ ] Start Menu shortcuts work
- [ ] Quick Launch shortcut (if selected)
- [ ] Registry entries created correctly
- [ ] Add/Remove Programs entry exists
- [ ] install.log file created

### Fresh Installation (Windows 11)
- [ ] All Windows 10 tests pass
- [ ] Modern UI displays correctly
- [ ] No compatibility issues
- [ ] Manifest works properly

### Administrator Privilege Check
- [ ] Running without admin shows error
- [ ] Error code 740 is returned
- [ ] Clear message about admin requirement
- [ ] No partial installation occurs

### Windows Version Check
- [ ] Installing on Windows 8.1 or earlier is blocked
- [ ] Clear error message displayed
- [ ] No files are copied on unsupported OS

### Disk Space Check
- [ ] Insufficient space triggers error
- [ ] Error shows required vs. available space
- [ ] Installation is blocked
- [ ] No files are copied

### Process Detection
- [ ] Installing while LTTH is running shows prompt
- [ ] Retry option works after closing app
- [ ] Cancel aborts installation cleanly

## 🔄 Upgrade Testing

### Same Version Upgrade (Repair)
- [ ] Install version 1.2.0
- [ ] Run version 1.2.0 installer again
- [ ] Detects existing installation
- [ ] Offers repair option
- [ ] User data is preserved
- [ ] Repair completes successfully

### Upgrade from Older Version
- [ ] Install old version (e.g., 1.1.0)
- [ ] Create some user data
- [ ] Run version 1.2.0 installer
- [ ] Detects old version correctly
- [ ] Shows upgrade message
- [ ] User data is backed up automatically
- [ ] Backup folder created with timestamp
- [ ] Old version uninstalled silently
- [ ] New version installed successfully
- [ ] User data preserved
- [ ] Backup path saved to registry

### Downgrade Scenario
- [ ] Install newer version (e.g., 1.3.2)
- [ ] Run version 1.2.0 installer
- [ ] Warning about downgrade shown
- [ ] User can choose to continue or abort
- [ ] Downgrade proceeds if confirmed
- [ ] Data is backed up
- [ ] Application still works

## 🌍 Multi-Language Testing

### English (EN)
- [ ] Installer detects English Windows
- [ ] All UI elements in English
- [ ] Section descriptions in English
- [ ] Error messages in English

### German (DE)
- [ ] German translations display correctly
- [ ] No untranslated strings
- [ ] All section descriptions translated
- [ ] Error messages in German

### French (FR)
- [ ] French translations display correctly
- [ ] No untranslated strings
- [ ] All section descriptions translated
- [ ] Error messages in French

### Spanish (ES)
- [ ] Spanish translations display correctly
- [ ] No untranslated strings
- [ ] All section descriptions translated
- [ ] Error messages in Spanish

## 🔧 Optional Components Testing

### File Associations
- [ ] Select "File Associations" during install
- [ ] .ltth extension is registered
- [ ] LTTH.ConfigFile class created
- [ ] Icon appears on .ltth files
- [ ] Double-clicking .ltth file opens LTTH
- [ ] "Open with" shows LTTH

### Windows Firewall Exception
- [ ] Select "Windows Firewall Exception"
- [ ] Firewall rule created for launcher.exe
- [ ] Rule applies to Private and Domain profiles
- [ ] Network functionality works
- [ ] Rule visible in Windows Firewall settings

### Auto-Start with Windows
- [ ] Select "Run at Windows Startup"
- [ ] Registry entry created in HKCU\...\Run
- [ ] LTTH starts automatically after reboot
- [ ] Entry visible in Task Manager > Startup

### Quick Launch Shortcut
- [ ] Quick Launch shortcut created
- [ ] Shortcut works correctly
- [ ] Icon displays properly

## 🔇 Silent Installation Testing

### Silent Install - Default Options
- [ ] Run: `LTTH-Setup-1.2.0.exe /S`
- [ ] No UI displayed
- [ ] Installation completes automatically
- [ ] Core components installed
- [ ] Node.js installed (if available)
- [ ] Desktop shortcut created
- [ ] Start Menu shortcuts created
- [ ] Exit code is 0
- [ ] install.log created

### Silent Install - Custom Directory
- [ ] Run: `LTTH-Setup-1.2.0.exe /S /D=C:\CustomPath`
- [ ] Installation goes to custom path
- [ ] All files installed correctly
- [ ] Shortcuts point to custom path

### Silent Install - Without Admin
- [ ] Run without admin privileges
- [ ] Installation fails
- [ ] Exit code is 740
- [ ] No partial installation

## 🗑️ Uninstallation Testing

### Standard Uninstall
- [ ] Run Uninstall.exe
- [ ] Confirmation dialog appears
- [ ] "Keep user data?" prompt shown
- [ ] Select "Yes" to keep data
- [ ] All application files removed
- [ ] user_data folder remains
- [ ] user_configs folder remains
- [ ] Desktop shortcut removed
- [ ] Start Menu folder removed
- [ ] Quick Launch shortcut removed (if created)
- [ ] File associations removed
- [ ] Firewall rule removed (if created)
- [ ] Auto-start entry removed (if created)
- [ ] Registry entries cleaned up
- [ ] Add/Remove Programs entry removed
- [ ] Success message displayed

### Uninstall with Data Deletion
- [ ] Run Uninstall.exe
- [ ] Select "No" to delete data
- [ ] All files removed including user data
- [ ] Installation directory deleted
- [ ] No leftover files anywhere
- [ ] Complete cleanup verified

### Silent Uninstall
- [ ] Run: `Uninstall.exe /S`
- [ ] No UI displayed
- [ ] Uninstallation completes automatically
- [ ] Exit code is 0
- [ ] All files removed
- [ ] Registry cleaned up

## 🔐 Security Testing

### Code Signing (if enabled)
- [ ] Installer is signed
- [ ] Uninstaller is signed
- [ ] Signatures are valid
- [ ] Publisher information correct
- [ ] Timestamp is present
- [ ] Certificate chain is complete
- [ ] Windows trusts the signature
- [ ] No SmartScreen warning

### Integrity Check
- [ ] CRC check passes on valid installer
- [ ] Corrupted installer shows error
- [ ] No installation from corrupted file

### Permissions
- [ ] Admin required for installation
- [ ] No files written outside $INSTDIR
- [ ] Registry writes are proper
- [ ] No unnecessary permissions requested

## 💻 Architecture Testing

### 64-bit Windows
- [ ] Installation succeeds
- [ ] Detects 64-bit correctly
- [ ] No warnings shown
- [ ] All features work

### 32-bit Windows
- [ ] Warning shown about 32-bit
- [ ] User can choose to continue
- [ ] Installation succeeds if continued
- [ ] Application works (if compatible)

## 🔍 Edge Cases

### Special Characters in Path
- [ ] Install to path with spaces
- [ ] Install to path with unicode characters
- [ ] Shortcuts work correctly
- [ ] No path issues

### Long Paths
- [ ] Install to deep directory structure
- [ ] No MAX_PATH issues
- [ ] All files extracted correctly

### Antivirus Software
- [ ] Installation works with antivirus enabled
- [ ] No false positives
- [ ] Signed installer trusted

### Low Disk Space
- [ ] Installation blocked if < 500 MB
- [ ] Clear error message
- [ ] No partial installation

### Concurrent Installations
- [ ] Cannot install while installer is running
- [ ] Cannot install while app is running
- [ ] Proper error messages

## 📊 Performance Testing

### Installation Speed
- [ ] Full install < 2 minutes on HDD
- [ ] Full install < 1 minute on SSD
- [ ] Silent install completes quickly

### Installer Size
- [ ] Installer size is optimized
- [ ] With Node.js: ~150-200 MB
- [ ] Without Node.js: ~20-30 MB
- [ ] Compression ratio ~50-60%

### Uninstallation Speed
- [ ] Uninstall completes < 30 seconds
- [ ] No hanging or delays
- [ ] Clean removal

## 📝 Logging and Diagnostics

### Installation Log
- [ ] install.log created
- [ ] Contains product name
- [ ] Contains version
- [ ] Contains install date/time
- [ ] Contains install path
- [ ] Readable format

### NSIS Log (if enabled)
- [ ] Shows all file operations
- [ ] Shows registry operations
- [ ] Shows errors (if any)
- [ ] Useful for debugging

## 🌐 Compatibility Testing

### Windows Versions
- [ ] Windows 10 Home
- [ ] Windows 10 Pro
- [ ] Windows 10 Enterprise
- [ ] Windows 11 Home
- [ ] Windows 11 Pro
- [ ] Windows Server 2019
- [ ] Windows Server 2022

### User Scenarios
- [ ] Standard user (should fail gracefully)
- [ ] Administrator user (should work)
- [ ] Domain user with admin rights
- [ ] Local admin account

### Network Scenarios
- [ ] Installation from network share
- [ ] Installation to network drive (not recommended)
- [ ] Installation with firewall enabled
- [ ] Installation with VPN active

## 🎯 Regression Testing

After any changes to the installer:
- [ ] Re-run all Fresh Installation tests
- [ ] Re-run all Upgrade tests
- [ ] Re-run all Uninstallation tests
- [ ] Verify documentation matches functionality
- [ ] Check for new warnings or errors

## ✅ Pre-Release Checklist

Before distributing the installer:
- [ ] All tests above passed
- [ ] Code signing enabled and working
- [ ] Documentation is complete and accurate
- [ ] Version numbers are correct everywhere
- [ ] Changelog updated
- [ ] Known issues documented
- [ ] Support contact information current
- [ ] Legal compliance verified (license, etc.)
- [ ] Antivirus scanning completed
- [ ] VirusTotal scan completed (if applicable)
- [ ] SHA-256 checksum generated
- [ ] Release notes prepared

## 📈 Test Results Template

```
Test Date: YYYY-MM-DD
Tester: Name
Version: 1.2.0
Build: LTTH-Setup-1.2.0.exe

Environment:
- OS: Windows 10/11 Version
- Architecture: x64/x86
- Antivirus: Product Name
- VM/Physical: VM/Physical

Results:
- Pre-Build Tests: PASS/FAIL
- Build Tests: PASS/FAIL
- Installation Tests: PASS/FAIL
- Upgrade Tests: PASS/FAIL
- Uninstall Tests: PASS/FAIL
- Component Tests: PASS/FAIL
- Silent Install: PASS/FAIL
- Multi-Language: PASS/FAIL

Issues Found:
1. [Description]
2. [Description]

Notes:
[Additional observations]

Recommendation: APPROVED / NEEDS WORK
```

## 🐛 Bug Reporting Template

```
Title: [Brief description]

Environment:
- Windows Version: 
- LTTH Installer Version:
- Test Type: Fresh/Upgrade/Uninstall

Steps to Reproduce:
1. 
2. 
3. 

Expected Behavior:
[What should happen]

Actual Behavior:
[What actually happened]

Screenshots/Logs:
[Attach if applicable]

Severity: Critical/High/Medium/Low
```

---

## 📞 Support

For testing issues or questions:
- **GitHub Issues:** https://github.com/Loggableim/pupcidslittletiktoolhelper_desktop/issues
- **Email:** pupcid@ltth.app
- **Documentation:** See ADVANCED_FEATURES.md

---

**Maintained by:** PupCid & Loggableim  
**Version:** 1.2.0  
**Last Updated:** 2025-12-18
