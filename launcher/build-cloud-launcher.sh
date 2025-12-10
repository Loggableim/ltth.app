#!/bin/bash
# Cloud Launcher Build Script
# Builds a distributable launcher.exe that always fetches the latest version from the repository

set -e

echo "========================================"
echo "  LTTH Cloud Launcher Build"
echo "========================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Check Go
echo -e "${YELLOW}[1/4] Checking Go installation...${NC}"
if ! command -v go &> /dev/null; then
    echo "Error: Go not installed"
    exit 1
fi
echo -e "  ${GREEN}✓ $(go version)${NC}"

# Check MinGW
echo -e "${YELLOW}[2/4] Checking MinGW cross-compiler...${NC}"
if ! command -v x86_64-w64-mingw32-gcc &> /dev/null; then
    echo "Error: MinGW not installed"
    echo "Install with: sudo apt install gcc-mingw-w64-x86-64"
    exit 1
fi
echo -e "  ${GREEN}✓ MinGW-w64 found${NC}"

# Build
echo -e "${YELLOW}[3/4] Building cloud launcher...${NC}"
export GOOS=windows
export GOARCH=amd64
export CGO_ENABLED=1
export CC=x86_64-w64-mingw32-gcc

go build -ldflags="-H windowsgui -s -w" -o launcher.exe .

if [ ! -f "launcher.exe" ]; then
    echo "Error: Build failed"
    exit 1
fi

SIZE=$(du -h launcher.exe | cut -f1)
echo -e "  ${GREEN}✓ Built successfully (${SIZE})${NC}"

# Info
echo -e "${YELLOW}[4/4] Build complete!${NC}"
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Cloud Launcher Ready${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "File: ${CYAN}launcher.exe${NC} (${SIZE})"
echo ""
echo -e "This launcher will:"
echo -e "  • Automatically check version.json from GitHub"
echo -e "  • Download ltth_latest.zip from ltth.app/app/"
echo -e "  • Extract to versioned directories"
echo -e "  • Backup user configuration"
echo -e "  • Support rollback to previous versions"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "  1. Test launcher.exe on Windows"
echo -e "  2. Sign with code signing certificate"
echo -e "  3. Upload signed version to ltth.app/downloads/"
echo ""
