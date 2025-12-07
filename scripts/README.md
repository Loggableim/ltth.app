# LTTH Release Scripts

This directory contains automation scripts for managing LTTH releases.

## Available Scripts

### release_from_new_patch.py

Automates the complete release process for PupCid's Little TikTok Helper.

**Purpose:**
- Finds the highest version in `new_patch/`
- Archives the current live version
- Deploys the new version
- Updates metadata files
- Moves processed patches to `released_patches/`

**Usage:**

```bash
# From repository root
python3 scripts/release_from_new_patch.py

# Or make it executable and run directly
chmod +x scripts/release_from_new_patch.py
./scripts/release_from_new_patch.py
```

**Prerequisites:**
- Python 3.6 or higher
- Properly formatted version directory in `new_patch/ltth_X.Y.Z/`
- Required files: `ltth_X.Y.Z.zip` and `changelog.txt`

**What it does:**
1. Scans `new_patch/` for version directories
2. Selects highest SemVer version
3. Validates patch files exist
4. Archives current `app/ltth_latest.zip` (if exists)
5. Deploys new version to `app/ltth_latest.zip`
6. Updates `app/CURRENT_VERSION.txt`
7. Updates `app/CURRENT_RELEASE.json`
8. Moves patch to `released_patches/`

**Output Files:**
- `app/ltth_latest.zip` - Latest version for Cloud-Installer
- `app/CURRENT_VERSION.txt` - Plain text version number
- `app/CURRENT_RELEASE.json` - Release metadata (version, date, notes)
- `app/archive/ltth_X.Y.Z.zip` - Archived previous version

**Example:**

```bash
# Prepare new release
mkdir -p new_patch/ltth_1.2.5
cp /path/to/build/ltth_1.2.5.zip new_patch/ltth_1.2.5/
cp /path/to/build/changelog.txt new_patch/ltth_1.2.5/

# Run release script
python3 scripts/release_from_new_patch.py

# Commit and push
git add app/ released_patches/
git commit -m "Release LTTH v1.2.5"
git push origin main
```

## Documentation

See [docs/RELEASE_FLOW.md](../docs/RELEASE_FLOW.md) for complete workflow documentation.

## Requirements

- Python 3.6+
- Standard library only (no external dependencies)

## Error Handling

The script includes comprehensive error checking:
- Version directory validation
- File existence checks
- Archive consistency verification
- Proper SemVer parsing and comparison

If any step fails, the script will:
- Display a clear error message
- Exit with non-zero status code
- Leave the repository in a consistent state

## Support

For issues or questions about the release process:
1. Check [docs/RELEASE_FLOW.md](../docs/RELEASE_FLOW.md)
2. Review script output for error messages
3. Contact repository maintainers
