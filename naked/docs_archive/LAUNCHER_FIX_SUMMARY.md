# Launcher.exe Fix Summary

## Problem
The `launcher.exe` was not working on Windows systems with the error:
**"Diese App kann auf dem PC nicht ausgeführt werden"** (This app cannot be run on the PC)

## Root Cause
In the last patch (commit d284074) that added the auto-update feature, the `launcher.exe` was built on a Linux system (likely GitHub Actions) without proper cross-compilation for Windows. The resulting binary was a Linux ELF executable instead of a Windows PE executable.

**Before Fix:**
```
launcher.exe: ELF 64-bit LSB executable, x86-64, version 1 (SYSV), dynamically linked
```

**After Fix:**
```
launcher.exe: PE32+ executable (GUI) x86-64, for MS Windows, 8 sections
```

## Solution
1. **Rebuilt launcher.exe for Windows**
   - Used Go cross-compilation: `GOOS=windows GOARCH=amd64`
   - Applied proper Windows flags: `-ldflags "-H windowsgui -s -w"`
   - Source: `build-src/launcher-gui.go`

2. **Added build scripts**
   - `build-src/build-launcher.sh` - For Linux/macOS (cross-compiles to Windows)
   - `build-src/build-launcher.bat` - For Windows
   - Both include verification steps and error checking

3. **Updated documentation**
   - Added cross-compilation instructions to `build-src/README.md`
   - Added "Quick Build" section with script usage
   - Documented verification commands

## Building the Launcher

### Quick Method (Recommended)
```bash
# On Windows:
cd build-src
build-launcher.bat

# On Linux/macOS:
cd build-src
./build-launcher.sh
```

### Manual Method
```bash
# From build-src directory
cd build-src

# Cross-compile for Windows
GOOS=windows GOARCH=amd64 go build -o ../launcher.exe -ldflags "-H windowsgui -s -w" launcher-gui.go

# Verify (Linux/macOS only)
file ../launcher.exe
# Should output: launcher.exe: PE32+ executable (GUI) x86-64, for MS Windows
```

## Verification
The fix was verified by:
1. ✅ Checking file type: Windows PE32+ executable
2. ✅ Verifying architecture: x86-64 (64-bit Windows)
3. ✅ Confirming GUI mode: Enabled (no console window)
4. ✅ Testing file size: 8.8 MB (appropriate for Go binary)
5. ✅ Running build scripts successfully

## Files Changed
- `launcher.exe` - Rebuilt as Windows PE executable
- `launcher-console.exe` - Built as Windows PE console executable
- `dev_launcher.exe` - Built as Windows PE console executable (with debug output)
- `build-src/build-launcher.sh` - New build script (Linux/macOS)
- `build-src/build-launcher.bat` - New build script (Windows)
- `build-src/README.md` - Updated with cross-compilation instructions

## Prevention
The new build scripts and documentation ensure that:
- Developers always use proper cross-compilation when building on non-Windows systems
- The binary format is automatically verified after build
- Clear instructions prevent future mistakes
- Build process is consistent across platforms

## Technical Details
- **Go Version:** 1.24+ required
- **Target OS:** Windows (GOOS=windows)
- **Target Arch:** x86-64 (GOARCH=amd64)
- **Build Flags:** 
  - `-H windowsgui` - Hide console window (GUI mode)
  - `-s` - Strip symbol table
  - `-w` - Strip DWARF debug info
- **Source File:** `build-src/launcher-gui.go`
- **Output Size:** ~8.8 MB (includes embedded resources)

## Related Files
- `build-src/launcher.go` - Console version launcher
- `build-src/launcher-gui.go` - GUI version launcher (main)
- `build-src/dev-launcher.go` - Debug launcher with visible console
- `build-src/launcher_test.go` - Launcher tests
- `build-src/go.mod` - Go module dependencies
