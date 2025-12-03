# Troubleshooting Guide - Installation Problems

## Problem: npm install fails with better-sqlite3 errors

### Symptom
```
npm error gyp ERR! find VS
npm error gyp ERR! find VS You need to install the latest version of Visual Studio
npm error gyp ERR! find VS including the "Desktop development with C++" workload.
```

### Root Cause
The `better-sqlite3` package requires native compilation on Windows. This needs C++ build tools:
- **Node.js v24+** requires Visual Studio 2019 or newer
- **Node.js v18-v23** requires Visual Studio 2017 or newer

### Solutions

#### Solution 1: Use Compatible Node.js Version (RECOMMENDED)
This is the easiest solution:

1. **Uninstall current Node.js**
   - Go to Windows Settings → Apps → Apps & features
   - Find "Node.js" and click Uninstall

2. **Download Node.js v20 LTS**
   - Visit: https://nodejs.org/en/download/
   - Download the Windows Installer (.msi) for v20 LTS
   - Run installer with default settings

3. **Restart computer**
   - Important: Ensures environment variables are updated

4. **Verify installation**
   - Open Command Prompt
   - Run: `node --version`
   - Should show v20.x.x

5. **Run launcher again**
   - Use `launcher.exe` or `launcher-backup.exe`

#### Solution 2: Install Visual Studio Build Tools (Advanced)
If you need to keep Node.js v24+:

1. **Download Visual Studio Build Tools 2022**
   - Visit: https://visualstudio.microsoft.com/downloads/
   - Scroll to "Tools for Visual Studio"
   - Download "Build Tools for Visual Studio 2022"

2. **Install with C++ workload**
   - Run the installer
   - Select "Desktop development with C++"
   - Install (requires ~7 GB disk space)

3. **Restart computer**

4. **Run launcher again**

#### Solution 3: Use Precompiled Version (Contact Support)
Contact support at loggableim@gmail.com for a version with precompiled native modules.

## Using the Backup Launcher for Diagnostics

If `launcher.exe` closes immediately:

1. **Use launcher-backup.exe instead**
   - Located in the same folder as launcher.exe
   - Provides detailed logging

2. **Check the log file**
   - A file called `launcher-debug.log` is created
   - Contains detailed information about what went wrong
   - Send this file to support for help

3. **Read the terminal output**
   - Terminal window stays open
   - Shows colored output with errors in red
   - Shows warnings in yellow
   - Press Enter to close when done reading

## Common Error Messages

### "Node.js ist nicht installiert"
**Cause:** Node.js is not installed or not in PATH

**Solution:**
1. Install Node.js v20 LTS from https://nodejs.org
2. Restart computer
3. Run launcher again

### "app Verzeichnis nicht gefunden"
**Cause:** The launcher can't find the app folder

**Solution:**
1. Make sure launcher is in the root folder of the tool
2. Don't move launcher.exe to a different location
3. The folder structure should be:
   ```
   pupcidslittletiktokhelper/
   ├── launcher.exe
   ├── launcher-backup.exe
   ├── app/
   │   ├── launch.js
   │   └── package.json
   ```

### "Installation fehlgeschlagen: gyp ERR!"
**Cause:** Missing C++ build tools for native modules

**Solution:** See "Solution 1" or "Solution 2" above

## Node.js Version Compatibility

| Node.js Version | Status | Visual Studio Required |
|----------------|--------|------------------------|
| v18.x | ✅ Recommended | VS 2017 or newer |
| v20.x | ✅ Recommended (LTS) | VS 2017 or newer |
| v22.x | ✅ Supported | VS 2017 or newer |
| v24.x | ⚠️ Requires VS 2019+ | VS 2019 or newer |
| v25.x+ | ⚠️ Requires VS 2019+ | VS 2019 or newer |

## Still Having Problems?

1. **Collect diagnostic information:**
   - Run `launcher-backup.exe`
   - Copy the `launcher-debug.log` file
   - Take screenshot of any error messages

2. **Contact Support:**
   - Email: loggableim@gmail.com
   - Include:
     - The launcher-debug.log file
     - Screenshots of errors
     - Your Node.js version (`node --version`)
     - Your Windows version

3. **Include system information:**
   ```
   node --version
   npm --version
   ```

## Quick Reference

### Best Setup (Fewest Problems)
- Windows 10 or 11
- Node.js v20 LTS
- Visual Studio Build Tools 2019+ with C++ (optional but recommended)

### Minimal Requirements
- Windows 10 or higher
- Node.js v18, v20, or v22
- For Node.js v24+: Visual Studio 2019+ Build Tools required
