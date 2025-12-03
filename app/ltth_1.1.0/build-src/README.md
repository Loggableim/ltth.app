# Launcher Build Instructions

This directory contains the source code for the Windows launcher (`launcher.exe`).

## Building the Launcher

The launcher is written in Go and includes an embedded icon resource.

### Prerequisites

- Go 1.18 or higher
- `go-winres` tool (for embedding the icon)

### Building on Windows

```bash
# Build the GUI launcher (with icon)
go build -o launcher.exe -ldflags "-H windowsgui" launcher-gui.go

# Build the console launcher (without GUI)
go build -o launcher-console.exe launcher.go

# Build the backup launcher with logging (troubleshooting)
go build -o launcher-backup.exe launcher-backup.go
```

The `.syso` resource files (`rsrc_windows_*.syso`) are automatically included during the build process and contain the application icon.

### Icon Management

The launcher icon is managed using `go-winres`:

1. Icon source: `icon.png` (copy of `../app/ltthappicon.png`)
2. Configuration: `winres/winres.json`
3. Generated resources: `rsrc_windows_*.syso`

To regenerate the icon resources after updating the icon:

```bash
# Install go-winres if not already installed
go install github.com/tc-hib/go-winres@latest

# Regenerate resource files
go-winres make
```

## Files

- `launcher.go` - Console launcher (shows terminal window)
- `launcher-gui.go` - GUI launcher (no terminal, shows graphical progress)
- `launcher-backup.go` - Backup launcher with detailed logging (troubleshooting)
- `icon.png` - Application icon (1355x1355 PNG)
- `icon.ico` - Icon in ICO format (multi-resolution)
- `winres/winres.json` - Icon and metadata configuration
- `rsrc_windows_*.syso` - Generated Windows resource files (auto-included in build)

## Launcher Types

### launcher-gui.go (launcher.exe)
- **Purpose:** Main launcher with graphical interface
- **Features:**
  - Opens in browser with background image
  - Shows progress bar and status updates
  - Auto-redirects to dashboard when ready
  - No terminal window (windowsgui mode)
- **Use when:** Normal operation

### launcher.go (launcher-console.exe)
- **Purpose:** Simple console launcher
- **Features:**
  - Shows terminal window with colored output
  - Step-by-step progress
  - Pauses before exit
- **Use when:** Quick debugging or preference for terminal

### launcher-backup.go (launcher-backup.exe)
- **Purpose:** Troubleshooting launcher with comprehensive logging
- **Features:**
  - **Detailed logging to launcher-debug.log file**
  - Shows all steps with timestamps
  - Logs system information (OS, architecture)
  - Logs every operation (Node.js check, npm install, etc.)
  - Terminal stays open with colored output
  - Pauses before exit to review errors
- **Use when:** 
  - launcher.exe opens terminal briefly then closes
  - Need to diagnose installation/startup issues
  - Support needs detailed error information
