#!/bin/bash
# Example Release Workflow for LTTH
# This script demonstrates the complete release process

set -e  # Exit on error

echo "========================================"
echo "LTTH Release Workflow Example"
echo "========================================"
echo ""

# Configuration
VERSION="1.2.5"
BUILD_SOURCE="/path/to/pupcidslittletiktokhelper/build"

echo "Step 1: Prepare new release directory"
echo "---------------------------------------"
mkdir -p "new_patch/ltth_${VERSION}"
echo "✓ Created new_patch/ltth_${VERSION}/"
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

echo "Step 3: Run release automation script"
echo "---------------------------------------"
echo "python3 scripts/release_from_new_patch.py"
echo ""
echo "The script will:"
echo "  ✓ Find version ${VERSION} (highest in new_patch/)"
echo "  ✓ Validate files exist"
echo "  ✓ Archive current version"
echo "  ✓ Deploy new version"
echo "  ✓ Update metadata files"
echo "  ✓ Move to released_patches/"
echo ""

echo "Step 4: Verify deployment"
echo "---------------------------------------"
echo "# Check created files:"
echo "cat app/CURRENT_VERSION.txt"
echo "cat app/CURRENT_RELEASE.json"
echo "ls -lh app/ltth_latest.zip"
echo "ls -lh app/archive/"
echo ""

echo "Step 5: Commit and push"
echo "---------------------------------------"
echo "git add app/ released_patches/"
echo "git commit -m 'Release LTTH v${VERSION}'"
echo "git push origin main"
echo ""

echo "Step 6: Verify live deployment"
echo "---------------------------------------"
echo "# After GitHub Pages deployment (1-2 minutes):"
echo "curl https://ltth.app/app/CURRENT_VERSION.txt"
echo "curl https://ltth.app/app/CURRENT_RELEASE.json"
echo "# Check: https://ltth.app/downloads/"
echo ""

echo "========================================"
echo "Release workflow complete!"
echo "========================================"
