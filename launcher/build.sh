#!/bin/bash
# Build-Script für LTTH Launcher (Cross-Compile von Linux nach Windows)
# Erstellt launcher.exe für Windows x64

set -e

echo "========================================"
echo "  LTTH Launcher Build Script (Linux)"
echo "========================================"
echo ""

# Farben
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Prüfe Go Installation
echo -e "${YELLOW}[1/5] Prüfe Go Installation...${NC}"
if command -v go &> /dev/null; then
    GO_VERSION=$(go version)
    echo -e "  ${GREEN}✓ $GO_VERSION${NC}"
else
    echo -e "  ${RED}✗ Go ist nicht installiert!${NC}"
    echo -e "  ${YELLOW}Bitte installiere Go von https://golang.org/dl/${NC}"
    exit 1
fi

# Prüfe MinGW (für CGO Cross-Compile)
echo -e "${YELLOW}[2/5] Prüfe Cross-Compiler...${NC}"
if command -v x86_64-w64-mingw32-gcc &> /dev/null; then
    echo -e "  ${GREEN}✓ MinGW-w64 gefunden${NC}"
else
    echo -e "  ${YELLOW}⚠ MinGW-w64 nicht gefunden${NC}"
    echo -e "  ${YELLOW}Installiere mit: sudo apt install gcc-mingw-w64-x86-64${NC}"
    echo -e "  ${YELLOW}Versuche Build ohne CGO...${NC}"
fi

# Dependencies herunterladen
echo -e "${YELLOW}[3/5] Lade Dependencies...${NC}"
go mod tidy
echo -e "  ${GREEN}✓ Dependencies geladen${NC}"

# Build
echo -e "${YELLOW}[4/5] Baue Launcher...${NC}"

export GOOS=windows
export GOARCH=amd64

# Versuche mit CGO (für WebView2)
if command -v x86_64-w64-mingw32-gcc &> /dev/null; then
    export CGO_ENABLED=1
    export CC=x86_64-w64-mingw32-gcc
    go build -ldflags="-H windowsgui -s -w" -o launcher.exe .
else
    # Fallback ohne CGO (WebView2 benötigt CGO)
    export CGO_ENABLED=0
    echo -e "  ${YELLOW}⚠ Baue ohne CGO - WebView2 wird nicht funktionieren${NC}"
    go build -ldflags="-s -w" -o launcher.exe . 2>/dev/null || {
        echo -e "  ${RED}✗ Build ohne CGO fehlgeschlagen${NC}"
        echo -e "  ${YELLOW}WebView2 benötigt CGO. Installiere MinGW:${NC}"
        echo -e "  ${YELLOW}sudo apt install gcc-mingw-w64-x86-64${NC}"
        exit 1
    }
fi

# Ergebnis prüfen
echo -e "${YELLOW}[5/5] Build abgeschlossen!${NC}"

if [ -f "launcher.exe" ]; then
    SIZE=$(du -h launcher.exe | cut -f1)
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  Build erfolgreich!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "  Datei: launcher.exe"
    echo -e "  Größe: $SIZE"
    echo ""
    echo -e "${CYAN}Nächste Schritte:${NC}"
    echo -e "  1. Kopiere launcher.exe nach Windows"
    echo -e "  2. Führe launcher.exe aus"
    echo ""
else
    echo -e "${RED}✗ Build fehlgeschlagen - launcher.exe nicht gefunden${NC}"
    exit 1
fi
