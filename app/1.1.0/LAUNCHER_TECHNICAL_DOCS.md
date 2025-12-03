# Launcher.exe Implementation - Technical Documentation

## Overview
The `launcher.exe` is a graphical Windows application that provides a visual interface for starting the TikTok Stream Tool with a progress bar and background image.

## Technical Specifications

### Language & Framework
- **Language**: Go 1.24.10
- **GUI Library**: github.com/lxn/walk (Windows Application Library)
- **Build Target**: Windows x86-64
- **Binary Size**: ~7.9MB
- **Type**: GUI Application (not console)

### Window Specifications
- **Window Title**: "TikTok Stream Tool - Launcher"
- **Window Size**: 1536 x 1024 pixels (matching background image)
- **Background Image**: app/launcherbg.png (1536x1024)
- **Image Mode**: Stretch to fit window

### UI Layout

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                  Background Image                       │
│                  (launcherbg.png)                       │
│                                                         │
│                                                         │
│                                                         │
│                                                         │
│  ┌──────────────────────┐                              │
│  │ Status Text          │ ← Lower left quarter         │
│  │ [Progress Bar 50%]   │   (Margins: L:50, B:150)     │
│  └──────────────────────┘                              │
└─────────────────────────────────────────────────────────┘
```

### Progress Tracking

The launcher tracks progress through 4 main phases:

| Phase | Progress % | Description |
|-------|-----------|-------------|
| 1 | 0-20% | Check Node.js installation and version |
| 2 | 20-30% | Verify app directory exists |
| 3 | 30-80% | Check and install node_modules if needed |
| 4 | 80-100% | Start the tool |

### Key Functions

#### `main()`
- Initializes the launcher
- Loads background image from `app/launcherbg.png`
- Creates the main window with declarative UI
- Starts the launcher process in a goroutine
- Runs the event loop

#### `runLauncher()`
- Executes the startup sequence
- Updates progress bar at each phase
- Handles errors with dialog boxes
- Closes window after successful tool start

#### `updateProgress(value, status)`
- Thread-safe UI update using `Synchronize()`
- Sets progress bar value (0-100)
- Updates status label text

#### `checkNodeJS()`
- Searches for Node.js in system PATH
- Returns error if not found

#### `installDependencies()`
- Runs `npm install` in app directory
- Hides console window during installation
- Uses `CREATE_NO_WINDOW` flag for clean UX

#### `startTool()`
- Starts `launch.js` with Node.js
- Runs as detached process
- Closes launcher window after start

## Build Instructions

### Prerequisites
- Go 1.24.10 or later
- MinGW-w64 cross-compiler (for cross-compilation from Linux)

### Build Command (Linux to Windows)
```bash
GOOS=windows GOARCH=amd64 CGO_ENABLED=1 CC=x86_64-w64-mingw32-gcc \
  go build -ldflags="-H windowsgui" -o launcher.exe launcher-gui.go
```

### Build Command (Windows)
```cmd
go build -ldflags="-H windowsgui" -o launcher.exe launcher-gui.go
```

## Differences from start.exe

| Feature | start.exe | launcher.exe |
|---------|-----------|--------------|
| UI Type | Console | GUI Window |
| Background | None | launcherbg.png |
| Progress Display | Text | Visual progress bar |
| Window Type | Console window | GUI window |
| Dependencies | None | app/launcherbg.png required |
| Size | ~2MB | ~8MB |
| User Experience | Technical | Visual/Modern |

## Error Handling

The launcher displays error dialogs for:
- Node.js not installed
- App directory not found
- npm install failure
- Tool start failure

All errors show a Windows message box with:
- Error title
- Descriptive message
- Actionable information (e.g., download link for Node.js)

## File Dependencies

```
launcher.exe
├── app/
│   ├── launcherbg.png  (required - background image)
│   ├── launch.js       (required - main app entry point)
│   └── node_modules/   (optional - installed if missing)
```

## Security Considerations

- ✅ No hardcoded credentials
- ✅ No external network calls (except npm install)
- ✅ Validates file paths before use
- ✅ Uses safe subprocess execution
- ✅ CodeQL scan: 0 vulnerabilities

## Performance

- Instant UI startup (no loading delay)
- Responsive progress updates
- No artificial delays
- Asynchronous process execution

## Future Enhancements (Optional)

- Add command-line arguments for custom app directory
- Support for configuration file
- Logging to file for debugging
- Multi-language support
- Custom theme/skin support
- Auto-update functionality

## Troubleshooting

### Launcher doesn't start
- Ensure app/launcherbg.png exists
- Check Windows version compatibility (Win 7+)
- Verify .exe is not blocked by antivirus

### Progress bar stuck
- Check Node.js installation
- Verify npm is in PATH
- Check app directory permissions

### Tool doesn't start after 100%
- Verify app/launch.js exists
- Check Node.js version (18+ required)
- Look for error dialogs

## License
Same as main project

## Author
Created as part of the TikTok Stream Tool project
