# LTTH Release Flow Documentation

This document describes the complete release workflow for PupCid's Little TikTok Helper (LTTH), including how to prepare, execute, and verify releases using the automated release system.

## Overview

The LTTH release system automates the process of deploying new versions from the build repository (`pupcidslittletiktokhelper`) to the website repository (`ltth.app`), ensuring that:

- The Cloud-Installer always downloads the latest version from a fixed URL
- Old versions are properly archived
- Release metadata is automatically updated
- The download page shows current version information

## Architecture

### Directory Structure

```
ltth.app/
├── app/
│   ├── ltth_latest.zip           # Latest version (downloaded by Cloud-Installer)
│   ├── CURRENT_VERSION.txt       # Current version number (e.g., "1.2.3")
│   ├── CURRENT_RELEASE.json      # Release metadata (version, date, notes)
│   └── archive/
│       ├── .gitkeep
│       ├── ltth_1.1.0.zip       # Archived older versions
│       └── ltth_1.1.1.zip
├── new_patch/
│   └── ltth_1.2.3/              # New version prepared for release
│       ├── ltth_1.2.3.zip       # Build artifact from build repo
│       └── changelog.txt        # Release notes for this version
├── released_patches/
│   └── ltth_1.2.2/              # Successfully released patches (archived)
│       ├── ltth_1.2.2.zip
│       └── changelog.txt
├── downloads/
│   └── index.html               # Download page (reads CURRENT_RELEASE.json)
├── scripts/
│   └── release_from_new_patch.py # Automated release script
└── docs/
    └── RELEASE_FLOW.md          # This document
```

### Key Files

- **`app/ltth_latest.zip`**: Fixed URL for Cloud-Installer downloads. Always points to the latest stable build.
- **`app/CURRENT_VERSION.txt`**: Plain text file containing only the version number (e.g., `1.2.3`)
- **`app/CURRENT_RELEASE.json`**: JSON file with release metadata consumed by the download page
- **`new_patch/ltth_X.Y.Z/`**: Staging area for new releases before deployment
- **`released_patches/`**: Archive of successfully released patches

## Release Process

### Step 1: Prepare Build in pupcidslittletiktokhelper

In the separate build repository (`pupcidslittletiktokhelper`):

1. Complete development work for the new version
2. Run the build process to generate the application package
3. Create a ZIP file named `ltth_X.Y.Z.zip` (where X.Y.Z is SemVer, e.g., `ltth_1.2.3.zip`)
4. Create a `changelog.txt` file with release notes for this version

**Example changelog.txt:**
```
LTTH Version 1.2.3 Release Notes

NEW FEATURES:
- Added new TikTok gift integration
- Improved OBS overlay performance

BUG FIXES:
- Fixed TTS voice selection issue
- Corrected memory leak in event processor

IMPROVEMENTS:
- Enhanced UI responsiveness
- Optimized WebSocket connection handling
```

### Step 2: Transfer Files to ltth.app

In the `ltth.app` repository:

1. Create a new directory in `new_patch/` with the format `ltth_X.Y.Z/`
2. Copy the files from the build repository:

```bash
# Example for version 1.2.3
mkdir -p new_patch/ltth_1.2.3/
cp /path/to/build/ltth_1.2.3.zip new_patch/ltth_1.2.3/
cp /path/to/build/changelog.txt new_patch/ltth_1.2.3/
```

**Expected structure:**
```
new_patch/
└── ltth_1.2.3/
    ├── ltth_1.2.3.zip       # Build artifact (15-20 MB typically)
    └── changelog.txt        # Release notes
```

### Step 3: Run the Release Script

The release script (`scripts/release_from_new_patch.py`) automates the entire deployment process.

**Execute the script:**

```bash
# From repository root
python3 scripts/release_from_new_patch.py

# Or make it executable and run directly
chmod +x scripts/release_from_new_patch.py
./scripts/release_from_new_patch.py
```

**What the script does:**

1. **Find Highest Version**: Scans `new_patch/` for all `ltth_X.Y.Z/` directories and selects the highest version using proper SemVer comparison (not lexicographic sorting)

2. **Validate Patch**: Checks that the selected version directory contains:
   - `ltth_X.Y.Z.zip` (the build artifact)
   - `changelog.txt` (release notes)

3. **Get Current Version**: Reads `app/CURRENT_VERSION.txt` to determine what version is currently deployed (if any)

4. **Archive Current Version**: If a version is currently deployed:
   - Copies `app/ltth_latest.zip` to `app/archive/ltth_<CURRENT_VERSION>.zip`
   - Verifies file sizes if archive already exists (prevents inconsistent duplicates)

5. **Deploy New Version**: Copies `new_patch/ltth_X.Y.Z/ltth_X.Y.Z.zip` to `app/ltth_latest.zip`

6. **Update Metadata**:
   - Writes new version to `app/CURRENT_VERSION.txt` (plain text: `1.2.3`)
   - Creates/updates `app/CURRENT_RELEASE.json` with:
     ```json
     {
       "version": "1.2.3",
       "updated_at": "2025-12-07T21:30:00Z",
       "notes": "<content from changelog.txt>"
     }
     ```

7. **Cleanup**: Moves the processed patch from `new_patch/ltth_X.Y.Z/` to `released_patches/ltth_X.Y.Z/`

**Example output:**
```
======================================================================
LTTH Release Automation
======================================================================

📦 Step 1: Finding highest version in new_patch/
✅ Found new version: 1.2.3
   Path: /path/to/ltth.app/new_patch/ltth_1.2.3

🔍 Step 2: Validating patch files
✅ Patch validation passed
   ZIP: ltth_1.2.3.zip (18.5 MB)
   Changelog: changelog.txt

📋 Step 3: Checking current deployed version
   Current version: 1.2.2

📦 Step 4: Archiving current version
✅ Archived current version: ltth_1.2.2.zip

🚀 Step 5: Deploying new version
✅ Deployed new version: ltth_latest.zip (18.5 MB)

📝 Step 6: Updating metadata files
✅ Updated CURRENT_VERSION.txt: 1.2.3
✅ Updated CURRENT_RELEASE.json

🧹 Step 7: Moving patch to released_patches/
✅ Moved patch to released_patches/ltth_1.2.3

======================================================================
✅ SUCCESS: Released version 1.2.3
======================================================================

Next steps:
  1. Commit and push changes to repository
  2. Verify https://ltth.app/app/ltth_latest.zip
  3. Verify https://ltth.app/app/CURRENT_VERSION.txt
  4. Verify https://ltth.app/app/CURRENT_RELEASE.json
  5. Check https://ltth.app/downloads/ for updated info
```

### Step 4: Commit and Push Changes

After the script successfully completes:

```bash
# Check what changed
git status

# Add the changes
git add app/ltth_latest.zip
git add app/CURRENT_VERSION.txt
git add app/CURRENT_RELEASE.json
git add app/archive/
git add released_patches/
git add new_patch/  # Should be empty or only have .gitkeep

# Commit with a clear message
git commit -m "Release LTTH v1.2.3

- Deployed new version as ltth_latest.zip
- Archived previous version (1.2.2)
- Updated release metadata"

# Push to GitHub
git push origin main
```

GitHub Pages will automatically deploy the changes within 1-2 minutes.

### Step 5: Verify Deployment

After GitHub Pages deployment completes, verify:

1. **Latest ZIP**: https://ltth.app/app/ltth_latest.zip
   - Should download the new version
   - Check file size matches expected

2. **Version File**: https://ltth.app/app/CURRENT_VERSION.txt
   - Should display: `1.2.3`

3. **Release Metadata**: https://ltth.app/app/CURRENT_RELEASE.json
   - Should show new version, current timestamp, and release notes

4. **Download Page**: https://ltth.app/downloads/
   - Should display new version number
   - Should show update timestamp
   - Should display release notes from changelog

5. **Archive**: https://ltth.app/app/archive/
   - Old version should be available (e.g., `ltth_1.2.2.zip`)

## Version Management

### Semantic Versioning

LTTH uses Semantic Versioning (SemVer) with the format `MAJOR.MINOR.PATCH`:

- **MAJOR**: Breaking changes or major new features (e.g., `1.x.x` → `2.0.0`)
- **MINOR**: New features, backward compatible (e.g., `1.2.x` → `1.3.0`)
- **PATCH**: Bug fixes, minor improvements (e.g., `1.2.3` → `1.2.4`)

**Examples:**
- `1.2.3` → `1.2.4`: Bug fix release
- `1.2.3` → `1.3.0`: New features added
- `1.2.3` → `2.0.0`: Major overhaul or breaking changes

### Multiple Versions in new_patch/

If multiple version directories exist in `new_patch/`, the script will:
- Parse all versions correctly (not lexicographically)
- Select the highest version
- Process only that version
- Leave other versions untouched

**Example:**
```
new_patch/
├── ltth_1.2.3/    # Will be ignored
├── ltth_1.3.0/    # Will be ignored
└── ltth_2.0.0/    # This will be selected (highest)
```

To release multiple versions sequentially:
1. Run the script (processes highest version)
2. Commit and push
3. Run the script again (processes next highest)
4. Repeat until all versions are released

## Cloud-Installer Integration

The external Rust Cloud-Installer will interact with the release system as follows:

### Update Detection

The launcher can detect updates by checking the file size of `ltth_latest.zip`:

```rust
// Pseudo-code example
let remote_size = get_file_size("https://ltth.app/app/ltth_latest.zip");
let local_size = get_installed_version_size();

if remote_size != local_size {
    // New version available
    download_and_install();
}
```

### Version Information (Optional)

The launcher can optionally fetch version details:

```rust
// Fetch current version
let version = fetch_text("https://ltth.app/app/CURRENT_VERSION.txt");
// Returns: "1.2.3"

// Fetch release metadata
let release = fetch_json("https://ltth.app/app/CURRENT_RELEASE.json");
// Returns: { "version": "1.2.3", "updated_at": "...", "notes": "..." }
```

### Download and Install

The launcher always downloads from the fixed URL:

```rust
// Always use this URL
download("https://ltth.app/app/ltth_latest.zip");
extract_to_installation_directory();
launch("PupCidLTTH.exe");
```

## Download Page Integration

The download page (`downloads/index.html`) automatically fetches and displays release information.

### How It Works

1. Page loads
2. JavaScript fetches `/app/CURRENT_RELEASE.json`
3. Displays version, date, and release notes dynamically
4. Download button always points to `/app/ltth_latest.zip`

### Manual Updates (Not Required)

The download page updates automatically via JavaScript. Manual HTML edits are not needed unless you want to change the page structure or styling.

## Error Handling

### Common Errors and Solutions

**Error: No valid versions found in new_patch/**
- **Cause**: `new_patch/` is empty or has no `ltth_X.Y.Z/` directories
- **Solution**: Add a version directory with proper naming

**Error: Missing ZIP file: ltth_X.Y.Z.zip**
- **Cause**: Version directory exists but ZIP is missing or misnamed
- **Solution**: Ensure ZIP filename matches directory name

**Error: Missing changelog file: changelog.txt**
- **Cause**: No changelog.txt in version directory
- **Solution**: Create changelog.txt with release notes

**Error: Archive exists with different size**
- **Cause**: Trying to archive a version that's already archived but with different content
- **Solution**: This indicates a problem. Manually inspect `app/archive/` and resolve the conflict

### Script Validation

The script performs extensive validation:
- ✅ Directory naming (must match `ltth_X.Y.Z` pattern)
- ✅ SemVer parsing (must be valid semantic version)
- ✅ File existence (ZIP and changelog must exist)
- ✅ Archive consistency (prevents duplicate versions with different content)

## Advanced Usage

### Multiple Releases

To prepare multiple versions for sequential release:

```bash
# Prepare all versions
mkdir -p new_patch/ltth_1.2.3/
mkdir -p new_patch/ltth_1.2.4/
mkdir -p new_patch/ltth_1.3.0/

# Add files to each...

# Run script three times (highest to lowest)
python3 scripts/release_from_new_patch.py  # Releases 1.3.0
git add . && git commit -m "Release 1.3.0" && git push

python3 scripts/release_from_new_patch.py  # Releases 1.2.4
git add . && git commit -m "Release 1.2.4" && git push

python3 scripts/release_from_new_patch.py  # Releases 1.2.3
git add . && git commit -m "Release 1.2.3" && git push
```

### Manual Release (Not Recommended)

If you need to release manually without the script:

1. Copy new ZIP to `app/ltth_latest.zip`
2. Update `app/CURRENT_VERSION.txt` with version number
3. Update `app/CURRENT_RELEASE.json` with metadata
4. Archive old version to `app/archive/ltth_<OLD_VERSION>.zip`
5. Commit and push

**Warning**: Manual releases are error-prone. Use the script whenever possible.

### Rollback to Previous Version

To rollback to a previous version:

```bash
# Copy archived version to latest
cp app/archive/ltth_1.2.2.zip app/ltth_latest.zip

# Update version file
echo "1.2.2" > app/CURRENT_VERSION.txt

# Update release JSON (manually or with script)
# Edit app/CURRENT_RELEASE.json

# Commit and push
git add app/ltth_latest.zip app/CURRENT_VERSION.txt app/CURRENT_RELEASE.json
git commit -m "Rollback to version 1.2.2"
git push
```

## Troubleshooting

### Script Won't Run

**Problem**: Permission denied
```bash
chmod +x scripts/release_from_new_patch.py
```

**Problem**: Python not found
```bash
# Check Python installation
python3 --version

# Or use explicit path
/usr/bin/python3 scripts/release_from_new_patch.py
```

### Download Page Not Updating

**Problem**: Old version still showing
- **Check**: Browser cache (hard refresh with Ctrl+F5)
- **Check**: GitHub Pages deployment status
- **Check**: CURRENT_RELEASE.json content

### Archive Not Working

**Problem**: Old versions not in archive/
- **Check**: Script completed successfully
- **Check**: Files were committed and pushed
- **Check**: app/archive/ directory structure

## Best Practices

1. **Always use the script**: Don't manually update files unless absolutely necessary
2. **Test locally first**: Run the script locally before pushing to production
3. **One version at a time**: Release versions sequentially, not all at once
4. **Verify deployment**: Always check the live URLs after deployment
5. **Keep changelogs clear**: Write detailed, user-friendly release notes
6. **Use semantic versioning**: Follow SemVer strictly for version numbers
7. **Archive important versions**: Keep stable releases in the archive
8. **Monitor file sizes**: Ensure ZIPs are reasonable size for downloads

## Support

For issues with the release system:
- Check this documentation first
- Review script output for error messages
- Verify file structure matches expected format
- Contact repository maintainers if problems persist

## Changelog

- **2025-12-07**: Initial release flow documentation
- **Future**: Will be updated as the system evolves
