# Launcher Build Instructions

This directory contains the source for the maintained Windows launcher.

## Maintained Artifact

- `launcher.exe` is the only supported Windows launcher binary in this snapshot.
- Source: `launcher-gui.go` plus `sysproc_windows.go`
- The old cloud launcher source was removed; only `launcher.exe` is maintained.

## Build

From `build-src/`:

```bash
go build -o ../launcher.exe -ldflags "-H windowsgui -s -w" launcher-gui.go sysproc_windows.go
```

From the repository root:

```bash
npm run build:launcher:win
```

## Notes

- The Windows release workflows now build and publish `launcher.exe` only.
- The legacy NSIS installer under `build-src/installer/` remains for fallback/support use.
