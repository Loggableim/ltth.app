#!/bin/bash
# Manual legacy release workflow example for LTTH (not the official public release path)
# This demonstration creates a staging directory and prints commands; it is not wired into CI.
# Public release steps are separate: release.yml builds; local signing is validated; the
# dispatched publish-launcher-handoff.yml publishes; pages.yml independently deploys the site.
# See scripts/README.md for trigger and artifact details.

set -e  # Exit on error

echo "========================================"
echo "LTTH Manual Legacy Release Workflow Example (not public release automation)"
echo "========================================"
echo ""

# Configuration
VERSION="1.2.5"
BUILD_SOURCE="/path/to/ltth.app/build"

echo "Step 1: Prepare new release directory"
echo "---------------------------------------"
mkdir -p "new_patch/ltth_${VERSION}"
echo "âœ“ Created new_patch/ltth_${VERSION}/"
echo ""

echo "Step 2: Copy build artifacts"
echo "---------------------------------------"
echo "# From your build repository, copy:"
echo "cp ${BUILD_SOURCE}/ltth_${VERSION}.zip new_patch/ltth_${VERSION}/"
echo "cp ${BUILD_SOURCE}/changelog.txt new_patch/ltth_${VERSION}/"
echo ""
echo "# Or create manually:"
echo "# - Build your application"
echo "# - Create ltth_${VERSION}.zip"
echo "# - Write changelog.txt with release notes"
echo ""

echo "Step 3: Run the manual legacy utility (only for an authorized internal case)"
echo "---------------------------------------"
echo "python3 scripts/release_from_new_patch.py"
echo ""
echo "The script will:"
echo "  âœ“ Find version ${VERSION} (highest in new_patch/)"
echo "  âœ“ Validate files exist"
echo "  âœ“ Archive current bundle if present"
echo "  âœ“ Copy the selected ZIP to local app/ltth_latest.zip"
echo "  âœ“ Update metadata files"
echo "  âœ“ Move staging if destination is absent; otherwise the current utility deletes staging"
echo ""

echo "Step 4: Review local file changes"
echo "---------------------------------------"
echo "# Check created files:"
echo "cat app/CURRENT_VERSION.txt"
echo "cat app/CURRENT_RELEASE.json"
echo "ls -lh app/ltth_latest.zip"
echo "ls -lh app/archive/"
echo ""

echo "Step 5: Review local changes (do not treat this as public release approval)"
echo "---------------------------------------"
echo "git status --short"
echo "git diff -- app/CURRENT_VERSION.txt app/CURRENT_RELEASE.json"
echo ""

echo "Step 6: Public release verification belongs to the official workflows"
echo "---------------------------------------"
echo "# Release build: release.yml; signed release publication: publish-launcher-handoff.yml; website deploy: pages.yml."
echo "# These are separate flows; inspect the relevant workflow run and verified artifact."
echo ""

echo "========================================"
echo "Legacy example complete; no public release or deployment was performed."
echo "========================================"

