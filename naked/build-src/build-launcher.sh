#!/bin/bash
# Build script for LTTH launcher binaries
# This script cross-compiles the launchers for Windows from any platform

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "================================================"
echo "  LTTH Launcher Build Script"
echo "================================================"
echo ""

# Check if Go is installed
if ! command -v go &> /dev/null; then
    echo -e "${RED}Error: Go is not installed${NC}"
    echo "Please install Go 1.18 or higher from https://golang.org/"
    exit 1
fi

echo -e "${GREEN}Go version:${NC} $(go version)"
echo ""

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$SCRIPT_DIR"

# Download dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
go mod download
go mod verify
echo ""

# Build for Windows
echo -e "${YELLOW}Building launcher.exe (Windows GUI)...${NC}"
GOOS=windows GOARCH=amd64 go build -o "$PROJECT_ROOT/launcher.exe" -ldflags "-H windowsgui -s -w" launcher-gui.go sysproc_windows.go
echo -e "${GREEN}✓ Built launcher.exe${NC}"

echo -e "${YELLOW}Building launcher-console.exe (Windows CLI)...${NC}"
GOOS=windows GOARCH=amd64 go build -o "$PROJECT_ROOT/launcher-console.exe" -ldflags "-s -w" launcher.go
echo -e "${GREEN}✓ Built launcher-console.exe${NC}"

echo -e "${YELLOW}Building dev_launcher.exe (Windows GUI with console)...${NC}"
GOOS=windows GOARCH=amd64 go build -o "$PROJECT_ROOT/dev_launcher.exe" -ldflags "-s -w" dev-launcher.go
echo -e "${GREEN}✓ Built dev_launcher.exe${NC}"

echo ""
echo "================================================"
echo "  Build Complete!"
echo "================================================"
echo ""

# Verify the binaries
echo -e "${YELLOW}Verifying binaries...${NC}"
if command -v file &> /dev/null; then
    cd "$PROJECT_ROOT"
    echo ""
    echo -e "${GREEN}launcher.exe:${NC}"
    file launcher.exe
    ls -lh launcher.exe
    echo ""
    echo -e "${GREEN}launcher-console.exe:${NC}"
    file launcher-console.exe
    ls -lh launcher-console.exe
    echo ""
    echo -e "${GREEN}dev_launcher.exe:${NC}"
    file dev_launcher.exe
    ls -lh dev_launcher.exe
else
    echo -e "${YELLOW}Note: 'file' command not found, skipping verification${NC}"
fi

echo ""
echo -e "${GREEN}All launchers built successfully!${NC}"
