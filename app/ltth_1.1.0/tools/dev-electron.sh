#!/bin/bash
# ============================================================================
# LTTH Electron Development Script
# 
# Starts the backend server and Electron app in development mode.
# Supports hot-reload and debugging.
#
# Usage:
#   ./tools/dev-electron.sh [options]
#
# Options:
#   --no-backend    Don't start the backend server
#   --debug         Enable Node.js debugging
#   --help          Show this help message
#
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
APP_DIR="$PROJECT_ROOT/app"
BACKEND_PORT=3210
BACKEND_PID=""
START_BACKEND=true
DEBUG_MODE=false

# ============================================================================
# Functions
# ============================================================================

print_banner() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║                                                           ║"
    echo "║     🐾 PupCid's Little TikTok Helper - Dev Mode 🐾       ║"
    echo "║                                                           ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_help() {
    echo "LTTH Electron Development Script"
    echo ""
    echo "Usage: ./tools/dev-electron.sh [options]"
    echo ""
    echo "Options:"
    echo "  --no-backend    Don't start the backend server"
    echo "  --debug         Enable Node.js debugging (port 9229)"
    echo "  --help          Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  PORT            Backend port (default: 3210)"
    echo "  NODE_ENV        Node environment (default: development)"
    echo ""
}

check_dependencies() {
    echo -e "${YELLOW}Checking dependencies...${NC}"
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${RED}Error: Node.js is not installed${NC}"
        exit 1
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        echo -e "${RED}Error: Node.js 18+ required (found: $(node -v))${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✓ Node.js $(node -v)${NC}"
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}Error: npm is not installed${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✓ npm $(npm -v)${NC}"
    
    # Check if node_modules exist
    if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
        echo -e "${YELLOW}Installing root dependencies...${NC}"
        cd "$PROJECT_ROOT" && npm install
    fi
    
    if [ ! -d "$APP_DIR/node_modules" ]; then
        echo -e "${YELLOW}Installing app dependencies...${NC}"
        cd "$APP_DIR" && npm install
    fi
    
    echo -e "${GREEN}✓ Dependencies installed${NC}"
}

check_port() {
    if lsof -Pi :$BACKEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${YELLOW}Warning: Port $BACKEND_PORT is already in use${NC}"
        echo -e "Would you like to kill the existing process? (y/n)"
        read -r response
        if [[ "$response" =~ ^[Yy]$ ]]; then
            kill $(lsof -Pi :$BACKEND_PORT -sTCP:LISTEN -t) 2>/dev/null || true
            sleep 1
        else
            echo -e "${RED}Cannot proceed with port $BACKEND_PORT in use${NC}"
            exit 1
        fi
    fi
}

start_backend() {
    if [ "$START_BACKEND" = false ]; then
        echo -e "${YELLOW}Skipping backend start (--no-backend)${NC}"
        return
    fi
    
    echo -e "${BLUE}Starting backend server on port $BACKEND_PORT...${NC}"
    
    cd "$APP_DIR"
    
    # Set environment variables
    export PORT=$BACKEND_PORT
    export NODE_ENV=development
    export OPEN_BROWSER=false
    export ELECTRON=true
    
    # Start backend in background
    if [ "$DEBUG_MODE" = true ]; then
        node --inspect=9230 server.js &
    else
        node server.js &
    fi
    
    BACKEND_PID=$!
    
    # Wait for backend to be ready
    echo -e "${YELLOW}Waiting for backend to be ready...${NC}"
    
    MAX_WAIT=30
    WAITED=0
    
    while [ $WAITED -lt $MAX_WAIT ]; do
        if curl -s "http://127.0.0.1:$BACKEND_PORT/api/init-state" > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Backend is ready${NC}"
            return
        fi
        sleep 1
        WAITED=$((WAITED + 1))
        echo -ne "  Waiting... ($WAITED/$MAX_WAIT)\r"
    done
    
    echo -e "${RED}Error: Backend failed to start within $MAX_WAIT seconds${NC}"
    cleanup
    exit 1
}

start_electron() {
    echo -e "${BLUE}Starting Electron app...${NC}"
    
    cd "$PROJECT_ROOT"
    
    # Set environment variables
    export NODE_ENV=development
    export ELECTRON_IS_DEV=1
    
    # Start Electron
    if [ "$DEBUG_MODE" = true ]; then
        npx electron --inspect=9229 .
    else
        npx electron .
    fi
}

cleanup() {
    echo -e "\n${YELLOW}Cleaning up...${NC}"
    
    # Kill backend if we started it
    if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo "Stopping backend (PID: $BACKEND_PID)"
        kill "$BACKEND_PID" 2>/dev/null || true
        wait "$BACKEND_PID" 2>/dev/null || true
    fi
    
    echo -e "${GREEN}Done${NC}"
}

# ============================================================================
# Main
# ============================================================================

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --no-backend)
            START_BACKEND=false
            shift
            ;;
        --debug)
            DEBUG_MODE=true
            shift
            ;;
        --help|-h)
            print_help
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            print_help
            exit 1
            ;;
    esac
done

# Set up cleanup trap
trap cleanup EXIT INT TERM

# Run
print_banner
check_dependencies
check_port
start_backend
start_electron
