# Launcher Fixes - December 2024

## Problems Fixed

### 1. Launcher Syntax Error
- **Issue**: `build-src/launcher-gui.go` had a duplicate return statement outside function body (lines 77-82)
- **Fix**: Removed orphaned code block
- **Result**: Launcher now compiles without errors

### 2. Launcher Size Optimization
- **Issue**: `launcher.exe` was 12MB (too large)
- **Fix**: Rebuilt with optimization flags `-ldflags "-H windowsgui -s -w"`
- **Result**: Reduced to 8.7MB (28% reduction)

### 3. Improved Error Handling
- **Issue**: Launcher crashed without showing error messages (no console with `-H windowsgui`)
- **Fixes**:
  - Added process monitoring to detect if Node.js crashes immediately
  - Show errors in browser UI for 30 seconds before exit
  - Log everything to `app/logs/launcher_*.log` with timestamps
  - Better error messages guiding users to check logs
- **Result**: Users can now see why the launcher fails

### 4. Repository Size Reduction
- **Issue**: `app/node_modules/` was committed to git (17,559 files, ~218MB)
- **Fix**: Removed all node_modules from git tracking
- **Result**: Repository reduced from 322MB to 107MB (67% reduction)
  - Download size reduced from ~80MB to ~25MB
  - Only 554 files now tracked (vs. 18,113 before)

## What Was Changed

### Code Changes
- `build-src/launcher-gui.go`:
  - Fixed syntax error (removed duplicate NewLauncher return)
  - Changed `startTool()` to return `(*exec.Cmd, error)` instead of just `error`
  - Added process monitoring with `cmd.Wait()` in goroutine
  - Improved health check with select statement to detect early crashes
  - Extended error display time from 5-10s to 30s
  - Added helpful error messages pointing to log files

### Binary Changes
- `launcher.exe`: Rebuilt from fixed source, size reduced from 12MB to 8.7MB

### Git Changes
- Removed 17,559 files from `app/node_modules/` directory
- Repository size reduced significantly

## How to Use

### Building the Launcher
```bash
cd build-src
GOOS=windows GOARCH=amd64 go build -o launcher.exe -ldflags "-H windowsgui -s -w" launcher-gui.go
cp launcher.exe ../
```

### Troubleshooting
If the launcher fails:
1. Check the browser window - error messages now display for 30 seconds
2. Check `app/logs/launcher_*.log` for detailed error logs
3. Common issues mentioned in error messages:
   - Missing dependencies (run `npm install` in app/)
   - Syntax errors in server code
   - Port 3000 already in use

## Technical Details

### Launcher Flow
1. Start HTTP server on `127.0.0.1:58734` for splash screen
2. Open browser to show progress
3. Check Node.js installation
4. Check app directory exists
5. Install dependencies if needed (npm install)
6. Start Node.js server
7. Monitor process for crashes
8. Health check on `http://localhost:3000/dashboard.html`
9. Redirect to dashboard when ready

### Error Detection
- Process monitoring: Detects if Node.js exits prematurely
- Health check timeout: 30 seconds for server to respond
- All errors logged to file with timestamps
- Error messages shown in browser UI

## Dependencies
The launcher uses these Go packages:
- `github.com/pkg/browser` - Open browser windows
- Standard library only for everything else

Node.js dependencies are NOT in git anymore - they are installed automatically by the launcher or manually with `npm install`.
