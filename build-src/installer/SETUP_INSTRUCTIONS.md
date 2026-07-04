# LTTH NSIS Installer - Setup Instructions

## 🎯 Quick Start (For You)

Follow these steps to create a working LTTH installer:

### Step 1: Install NSIS

1. Download NSIS 3.x from: https://nsis.sourceforge.io/Download
2. Run the installer and use default settings
3. NSIS will be installed to: `C:\Program Files (x86)\NSIS\`

### Step 2: Download Node.js Portable (Optional but Recommended)

1. Go to: https://nodejs.org/dist/v18.19.1/node-v18.19.1-win-x64.zip
2. Download the ZIP file (~30 MB)
3. Extract the ZIP to get the `node-v18.19.1-win-x64` folder
4. Copy the contents to: `build-src/assets/node/`
   - Result: `build-src/assets/node/node.exe` should exist
   - Result: `build-src/assets/node/npm` should exist
   - Result: `build-src/assets/node/node_modules/` should exist

**Important:** If you skip this step, the installer will still work, but users will need to install Node.js themselves.

### Step 3: Verify Repository Files

Make sure these files exist:

```
ltth.app/
├── build-src/
│   ├── installer/
│   │   ├── ltth-installer.nsi          ← Main installer script (READY)
│   │   ├── license.txt                 ← License text (READY)
│   │   ├── installer-header.bmp        ← Header image (READY)
│   │   ├── installer-sidebar.bmp       ← Sidebar image (READY)
│   │   ├── splash-screen.bmp           ← Splash screen (READY)
│   │   ├── banner.bmp                  ← Banner image (READY)
│   │   ├── README.md                   ← Documentation (READY)
│   │   └── build-installer.bat         ← Build script (READY)
│   ├── assets/
│   │   └── node/                       ← Node.js portable (DOWNLOAD REQUIRED)
│   │       ├── node.exe
│   │       ├── npm
│   │       └── node_modules/
│   ├── launcher.exe                    ← Launcher (should exist)
│   ├── ltthgit.exe                     ← Cloud launcher (should exist)
│   └── icon.ico                        ← App icon (should exist)
└── app/                                ← Application files (should exist)
    └── server.js                       ← Main server file
```

### Step 4: Build the Installer

#### Option A: Drag and Drop (Easiest)

1. Open Windows Explorer
2. Navigate to: `build-src/installer/`
3. Locate: `ltth-installer.nsi`
4. Drag and drop `ltth-installer.nsi` into the **MakeNSISW** window
   - MakeNSISW should have been installed with NSIS
   - Find it in Start Menu: "NSIS" → "MakeNSISW"
5. Wait for compilation (30-60 seconds)
6. Done! The installer will be created: `LTTH-Setup-1.2.0.exe`

#### Option B: Right-Click (Quick)

1. Navigate to: `build-src/installer/`
2. Right-click on: `ltth-installer.nsi`
3. Select: "Compile NSIS Script"
4. Wait for compilation
5. Done! Check for: `LTTH-Setup-1.2.0.exe`

#### Option C: Batch Script (Automated)

1. Navigate to: `build-src/installer/`
2. Double-click: `build-installer.bat`
3. The script will check for NSIS and required files
4. It will compile the installer automatically
5. Done! Check for: `LTTH-Setup-1.2.0.exe`

#### Option D: Command Line (Advanced)

```bash
cd build-src/installer
"C:\Program Files (x86)\NSIS\makensis.exe" ltth-installer.nsi
```

### Step 5: Test the Installer

1. Locate the created installer: `build-src/installer/LTTH-Setup-1.2.0.exe`
2. **Important:** Test on a clean system or VM if possible
3. Run the installer:
   - Right-click → "Run as Administrator"
   - Or double-click (will request elevation)
4. Follow the installation wizard:
   - Accept license
   - Choose components (leave all checked)
   - Choose installation directory
   - Choose Start Menu folder
   - Wait for installation
5. Verify:
   - Desktop shortcut created
   - Start Menu shortcuts created
   - Application launches correctly
6. Test uninstaller:
   - Use Windows Settings → Apps → Uninstall
   - Or run from Start Menu: LTTH → Uninstall
   - Verify all files removed

### Step 6: Distribute

Once tested, you can distribute `LTTH-Setup-1.2.0.exe` to users!

**Recommended:**
- Upload to GitHub Releases
- Sign the executable with a code signing certificate (optional but recommended)
- Provide SHA256 checksum for verification

---

## 🔧 Troubleshooting

### "Can't find NSIS"

**Solution:**
- Verify NSIS is installed: `C:\Program Files (x86)\NSIS\makensis.exe`
- If not, download and install from: https://nsis.sourceforge.io/Download
- Restart your computer after installation

### "File not found: ../launcher.exe"

**Solution:**
- Verify `launcher.exe` exists in `build-src/`
- If missing, build it first:
  ```bash
  cd build-src
  go build -o launcher.exe launcher-gui.go
  ```

### "File not found: ../../app"

**Solution:**
- Verify you're in the correct directory
- The script expects to be in `build-src/installer/`
- Check that `app/` directory exists in repository root

### "Node.js not found" (during build)

**Solution:**
- This is a warning, not an error
- The installer will be built without Node.js
- To include Node.js:
  1. Download: https://nodejs.org/dist/v18.19.1/node-v18.19.1-win-x64.zip
  2. Extract to: `build-src/assets/node/`

### Installer is very large (>200 MB)

**Cause:** Node.js portable is included (~120-150 MB)

**Solutions:**
- This is normal if Node.js is included
- To reduce size: Build without Node.js (users install it separately)
- Or: Create two versions (with/without Node.js)

### Antivirus flags the installer

**Cause:** Unsigned executable

**Solution:**
- This is common for unsigned installers
- Get a code signing certificate (e.g., from Sectigo, DigiCert)
- Sign the installer:
  ```bash
  signtool.exe sign /f certificate.pfx /p password /t http://timestamp.digicert.com LTTH-Setup-1.2.0.exe
  ```

---

## 🎨 Customization (Optional)

### Change Version Number

Edit `build-src/installer/ltth-installer.nsi` line 18:
```nsis
!define PRODUCT_VERSION "1.3.2"  ; Change this
```

Then rebuild.

### Replace Images

Replace these files with your own (same dimensions):
- `installer-header.bmp` - 150x57 pixels
- `installer-sidebar.bmp` - 164x314 pixels
- `splash-screen.bmp` - 500x300 pixels
- `banner.bmp` - 500x100 pixels

**Format:** Must be 24-bit BMP files (not PNG/JPG)

### Change Branding

Edit these lines in `ltth-installer.nsi`:
```nsis
!define PRODUCT_NAME "Your Product Name"
!define PRODUCT_WEB_SITE "https://yoursite.com"
```

---

## 📦 What Users Get

When someone runs your installer, they get:

1. **Professional Installation Wizard**
   - Modern UI with LTTH branding
   - Splash screen with banner
   - License agreement page
   - Component selection
   - Custom Start Menu folder selection

2. **Installed Components**
   - LTTH application (all files from `app/`)
   - Launcher executable
   - Optional: Portable Node.js runtime
   - Desktop shortcut
   - Start Menu shortcuts
   - Uninstaller

3. **Clean Uninstallation**
   - Complete removal of all files
   - Registry cleanup
   - Shortcut removal
   - No leftovers

---

## 🚀 Advanced Features

### AdvSplash Plugin (Advanced Splash Screen)

**Current:** Uses built-in Banner plugin (works out of the box)

**Upgrade:**
1. Download AdvSplash: https://nsis.sourceforge.io/AdvSplash_plug-in
2. Copy `AdvSplash.dll` to: `C:\Program Files (x86)\NSIS\Plugins\x86-unicode\`
3. Edit `ltth-installer.nsi` (around line 123)
4. Uncomment the AdvSplash lines
5. Rebuild

**Benefit:** Fancier splash screen with fade effects

### VPatch Integration (Auto-Updates)

**Status:** Prepared but not implemented

**To Enable:**
1. Download VPatch: https://nsis.sourceforge.io/VPatch_plug-in
2. Install plugin and tools
3. Generate patch files using GenPat.exe
4. Implement update checking in launcher.exe
5. See `README.md` for full details

---

## 📋 Complete Checklist

Before releasing the installer:

- [ ] NSIS installed and working
- [ ] Node.js portable downloaded and extracted (optional)
- [ ] All repository files present
- [ ] Launcher builds successfully
- [ ] Images created (already done)
- [ ] NSIS script compiles without errors
- [ ] Installer created: `LTTH-Setup-1.2.0.exe`
- [ ] Tested installation on clean system
- [ ] Tested all shortcuts work
- [ ] Tested application launches
- [ ] Tested uninstallation removes everything
- [ ] Optional: Code signed installer
- [ ] Optional: SHA256 checksum generated
- [ ] Ready to distribute!

---

## 🎯 Summary

**You now have:**
- ✅ Complete NSIS installer script with modern UI
- ✅ Splash screen with banner (using Banner plugin)
- ✅ Custom Start Menu folder selection (using StartMenu.dll)
- ✅ VPatch integration prepared for future updates
- ✅ Professional branding images (auto-generated)
- ✅ License text from repository LICENSE
- ✅ Build automation script
- ✅ Comprehensive documentation

**To build:**
1. Install NSIS
2. Download Node.js portable (optional)
3. Drag `ltth-installer.nsi` into MakeNSISW
4. Get `LTTH-Setup-1.2.0.exe`
5. Distribute!

**Questions?**
- Read: `build-src/installer/README.md` (detailed docs)
- Check: Migration guide at `migration-guides/01_NSIS_INSTALLER_GUIDE.md`
- Issues: https://github.com/Loggableim/ltth.app/issues

---

**Last Updated:** 2025-12-07  
**Version:** 1.2.0  
**License:** CC-BY-NC-4.0
