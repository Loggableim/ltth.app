# LTTH Standalone Launcher - Pre-flight Checks & Dependency Error Handling

## Problem Solved

The standalone launcher was hanging at ~80% progress on fresh Windows 11 installations without showing any error message. The root cause was that `installDependencies()` had:
- ❌ No timeout
- ❌ No heartbeat monitoring
- ❌ No user-visible error analysis

On bare Windows 11, Python 3 and Visual C++ Build Tools are missing, which are required by `better-sqlite3` for node-gyp compilation. The npm install would hang indefinitely during compilation.

## Solution Overview

### 1. Pre-flight System Checks (NEW)

Added `runPreflightChecks()` function that validates dependencies BEFORE npm install:

| Check | Platform | Required | Purpose |
|-------|----------|----------|---------|
| Node.js v20+ | All | Yes | Runtime environment |
| npm | All | Yes | Package manager |
| Python 3.x | All | Yes | node-gyp compilation |
| Visual C++ Build Tools | Windows | Yes | Native module compilation |
| Port 3000 | All | No | Detect conflicts |

**User Experience:**
- Results displayed at 72% progress
- ✅ Green checkmark = Found
- ❌ Red X = Missing (required)
- ⚠️ Yellow warning = Missing (optional)
- Each missing dependency shows installation hints

### 2. Enhanced npm install

**Heartbeat Monitoring:**
- Checks every 5 seconds if npm is producing output
- Warns user after 10 seconds of silence: "⏳ npm install läuft... (kein Output seit Xs, bitte warten)"

**Timeout Protection:**
- 10-minute absolute timeout
- Kills npm and sends detailed error message if exceeded
- Explains likely causes and solutions

**Intelligent Error Analysis:**
```go
analyzeNpmError(stderr string) []string {
    // Pattern matching for common errors:
    - node-gyp / gyp ERR → Missing build tools + Python
    - python not found → Install Python
    - msbuild / cl.exe → Missing Visual C++ compiler
    - EACCES / EPERM → Run as administrator
    - ETIMEDOUT / ECONNRESET → Network/firewall issues
    - Fallback → Manual installation steps
}
```

**Performance Optimizations:**
- Skips npm install if `better-sqlite3.node` already exists
- Added flags: `--no-optional --no-audit --no-fund` for faster installation

### 3. Frontend UI (splash.html)

**New SSE Event Handlers:**

#### `preflight-results` Event
```javascript
{
    "type": "preflight-results",
    "results": [
        {
            "name": "Python 3.x",
            "found": false,
            "version": "",
            "required": true,
            "install_hint": "Benötigt für node-gyp...\n  → winget install Python.Python.3.12",
            "auto_fixable": false
        }
    ],
    "allPassed": false
}
```

#### `dependency-error` Event
```javascript
{
    "type": "dependency-error",
    "title": "npm install fehlgeschlagen",
    "detail": "npm install ist mit einem Fehler beendet worden: exit status 1",
    "hints": [
        "node-gyp Fehler erkannt: Build-Tools fehlen",
        "Windows: Installiere Python 3 und Visual C++ Build Tools",
        "  → winget install Python.Python.3.12",
        "  → winget install Microsoft.VisualStudio.2022.BuildTools --override \"--add Microsoft.VisualStudio.Workload.VCTools\""
    ]
}
```

## Code Changes

### Files Modified

1. **standalonelauncher/standalone-launcher.go** (+270 lines)
   - Added `net` import for port checking
   - New struct: `PreflightCheckResult`
   - New functions:
     - `runPreflightChecks(nodePath string) ([]PreflightCheckResult, bool)`
     - `findNpmPath(nodePath string) string`
     - `analyzeNpmError(stderr string) []string`
     - `sendDependencyError(title, detail string, hints []string)`
   - Enhanced `installDependencies()` with heartbeat, timeout, error analysis

2. **standalonelauncher/assets/splash.html** (+97 lines)
   - Added `statusDetails` container div
   - New JavaScript functions:
     - `showPreflightResults(results, allPassed)`
     - `showDependencyError(title, detail, hints)`
     - `escapeHtml(text)` - Improved implementation
   - CSS styles for check results and errors

3. **standalonelauncher/standalone-launcher_test.go** (+170 lines)
   - Test `analyzeNpmError()` with 6 error scenarios
   - Test `sendDependencyError()` JSON marshaling
   - Test `PreflightCheckResult` serialization
   - Test `findNpmPath()` logic

### Integration Flow

```
run() → checkNodeJS() → runPreflightChecks() → installDependencies() → startApplication()
                              ↓                         ↓
                    SSE: preflight-results    SSE: dependency-error
                              ↓                         ↓
                     splash.html handlers      splash.html handlers
```

## Test Results

All 21 tests passing:
- ✅ Existing tests (17)
- ✅ New tests (4):
  - TestAnalyzeNpmError (6 sub-tests)
  - TestSendDependencyError
  - TestPreflightCheckResult
  - TestFindNpmPath

Build successful:
- launcher.exe (Windows GUI): 9.2 MB
- launcher-console.exe (Windows Debug): 9.2 MB
- launcher (Linux): 8.9 MB

## User Experience Impact

### Before
1. User starts launcher on fresh Windows 11
2. Progress reaches 80%
3. **LAUNCHER HANGS INDEFINITELY**
4. No error message
5. No indication of what's wrong
6. User frustrated, closes launcher

### After
1. User starts launcher on fresh Windows 11
2. Progress reaches 72% - Pre-flight checks run
3. **USER SEES EXACTLY WHAT'S MISSING:**
   - ❌ Python 3.x → "winget install Python.Python.3.12"
   - ❌ Visual C++ Build Tools → Installation command shown
4. User has 30 seconds to install dependencies
5. npm install proceeds with heartbeat monitoring
6. If it fails, user sees:
   - Error title
   - Detailed explanation
   - Specific fix commands
7. User can resolve issue and retry

## Security & Robustness

- ✅ Timeout prevents resource exhaustion
- ✅ Heartbeat prevents silent hanging
- ✅ HTML escaping prevents XSS in error messages
- ✅ Structured error handling with proper logging
- ✅ Graceful degradation (tries install even if checks fail)

## Future Enhancements

Potential improvements (not included in this PR):
- Auto-installation of missing dependencies (requires elevation)
- Configurable timeout duration via launcher settings
- "Continue" button to skip 30-second wait
- Download pre-compiled better-sqlite3 binaries as fallback

## Summary

This implementation provides **full transparency** for users:
- ✅ Always knows what's happening
- ✅ Always knows what's missing
- ✅ Always knows how to fix problems
- ✅ No more silent hanging
- ✅ No breaking changes
- ✅ Production ready
