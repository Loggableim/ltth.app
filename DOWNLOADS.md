# LTTH Download Structure Documentation

This document describes the download and versioning structure for PupCid's Little TikTool Helper (LTTH).

## Download URLs

### Latest Version (Always Current)

**Fixed URL:** `https://ltth.app/app/ltth_latest.zip`

- This URL always points to the latest stable LTTH build
- Automatically replaced by CI/CD with each new release
- Used by the launcher for automatic update detection
- Update detection works by comparing file size changes

### Archived Versions

Older stable versions are available in the archive directory:

**Pattern:** `https://ltth.app/app/archive/ltth_X.Y.Z.zip`

Examples:
- `https://ltth.app/app/archive/ltth_1.1.1.zip`
- `https://ltth.app/app/archive/ltth_1.2.0.zip`

## Directory Structure

```
app/
├── ltth_latest.zip          # Always points to latest stable version
├── ltth_1.1.0.zip          # Versioned archive (legacy)
├── ltth_1.1.1.zip          # Versioned archive (legacy)
├── archive/                 # Archive directory for older versions
│   ├── README.md           # Archive documentation
│   └── (future versions)   # ltth_X.Y.Z.zip files
└── ...
```

## Download Page

**Main Download Page:** `https://ltth.app/downloads/`

The download page provides:
- Direct download link to `ltth_latest.zip`
- Current version information (placeholder: 1.1.1)
- Information about automatic updates
- Links to archive and documentation

## Launcher Integration

The future Rust launcher will:

1. **Check for Updates**
   - Fetch the file size of `https://ltth.app/app/ltth_latest.zip`
   - Compare with locally installed version's original download size
   - Different size = new version available

2. **Download & Install**
   - Always download from `https://ltth.app/app/ltth_latest.zip`
   - Extract to installation directory
   - No version numbers needed in URL

3. **Update Detection**
   - File size-based detection (simple and reliable)
   - No need for additional version API endpoints
   - Works without authentication or complex logic

## CI/CD Integration

When a new version is released:

1. Build the application package
2. Create versioned ZIP: `ltth_X.Y.Z.zip`
3. Copy to archive if needed: `app/archive/ltth_X.Y.Z.zip`
4. Replace `app/ltth_latest.zip` with new version
5. Update version.json with new version info

## Benefits of This Structure

- **Simple URL:** Users always use the same download link
- **Launcher-Friendly:** Size-based update detection is fast and reliable
- **Archive Access:** Previous versions available for rollback/compatibility
- **CI/CD Ready:** Easy to automate with standard build tools
- **No API Required:** Static files only, works on GitHub Pages

## File Size Update Detection

Example workflow:
1. User installs LTTH v1.1.1 (ltth_latest.zip is 15.2 MB)
2. Launcher stores: `installed_size=15.2MB`
3. On startup: Launcher checks `ltth_latest.zip` size via HTTP HEAD request
4. If size is different (e.g., 16.1 MB): Update available
5. Download and replace installation

This is more reliable than version number checking because:
- No parsing of version strings needed
- No version API to maintain
- Handles pre-releases and patches naturally
- Size change = content change = update needed

## Maintenance Notes

- Keep `ltth_latest.zip` always up-to-date with stable releases
- Move older versions to `archive/` directory if needed
- Maintain `version.json` for website display
- Test download links after each update
- Monitor file sizes to ensure reasonable download times
