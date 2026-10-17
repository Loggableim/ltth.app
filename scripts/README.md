# LTTH Release Scripts

This directory contains release tooling, including a retained manual legacy utility.

### Official public release path

Normal public releases start with an exact numeric `vX.Y.Z` tag on the current `main` commit. `.github/workflows/release.yml` validates metadata and builds immutable app assets plus an unsigned launcher candidate; it does not publish a GitHub Release. After local signing and validation, the separately dispatched `.github/workflows/publish-launcher-handoff.yml` publishes the signed handoff and app assets as a GitHub Release. `.github/workflows/pages.yml` is a separate website deployment flow, triggered by eligible `main` pushes or successful release-build workflow runs; it verifies the exact run-bound runtime asset before deploying Pages. The `new_patch` script below is not called by these workflows or by installers.

## Available Scripts

### `release_from_new_patch.py` — manual legacy developer utility

Retained for controlled internal/manual maintenance cases. This script is not the official public release path. It directly replaces `app/ltth_latest.zip` and updates `app/CURRENT_VERSION.txt` and `app/CURRENT_RELEASE.json`. It moves the selected staging directory to `released_patches/` only when that destination does not already exist; if the destination exists, the current script deletes the selected staging directory instead. Review these side effects before running it; normal public releases use the verified workflows described above.

**Legacy utility purpose:**
- Finds the highest version in `new_patch/`
- Archives the current local app bundle, if present
- Copies the selected bundle to the local `app/ltth_latest.zip` path
- Updates metadata files
- Moves staging to `released_patches/` if absent; if the destination exists, deletes the selected staging directory

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
4. Archives the current local `app/ltth_latest.zip` (if it exists)
5. Copies the selected patch ZIP to local `app/ltth_latest.zip`
6. Updates `app/CURRENT_VERSION.txt`
7. Updates `app/CURRENT_RELEASE.json`
8. Moves the patch directory to `released_patches/` if absent; if it exists already, deletes the selected patch directory

**Output Files:**
- `app/ltth_latest.zip` - Locally staged app bundle path
- `app/CURRENT_VERSION.txt` - Plain text version number
- `app/CURRENT_RELEASE.json` - Release metadata (version, date, notes)
- `app/archive/ltth_X.Y.Z.zip` - Archived previous version

**Example — manual/internal use only:**

```bash
# Prepare new release
mkdir -p new_patch/ltth_1.2.5
cp /path/to/build/ltth_1.2.5.zip new_patch/ltth_1.2.5/
cp /path/to/build/changelog.txt new_patch/ltth_1.2.5/

# Run release script
python3 scripts/release_from_new_patch.py

# Inspect the legacy script changes before deciding what to do next
git status --short
git diff -- app/CURRENT_VERSION.txt app/CURRENT_RELEASE.json
```

## Documentation

See [docs/RELEASE_FLOW.md](../docs/RELEASE_FLOW.md) for legacy workflow details. For public releases, follow `.github/workflows/release.yml` and `.github/workflows/pages.yml`.

## Requirements

- Python 3.6+
- Standard library only (no external dependencies)

## Error Handling

The script includes comprehensive error checking:
- Version directory validation
- File existence checks
- Archive consistency verification
- Proper SemVer parsing and comparison

If a step fails, the script displays an error and exits non-zero. It does not roll back earlier successful file changes, so inspect the repository and recover the affected local files before retrying.

## Support

For issues or questions about the release process:
1. Check [docs/RELEASE_FLOW.md](../docs/RELEASE_FLOW.md)
2. Review script output for error messages
3. Contact repository maintainers
