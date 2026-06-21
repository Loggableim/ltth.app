#!/bin/bash
# ClarityHUD Validation Script
# This script helps verify that all the repairs are working correctly

echo "======================================"
echo "ClarityHUD Plugin Validation Script"
echo "======================================"
echo ""

# Find the repository root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$REPO_ROOT"

echo "Repository root: $REPO_ROOT"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} Found: $1"
        return 0
    else
        echo -e "${RED}✗${NC} Missing: $1"
        return 1
    fi
}

check_content() {
    if grep -q "$2" "$1" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} $3"
        return 0
    else
        echo -e "${RED}✗${NC} $3"
        return 1
    fi
}

echo "1. Checking file existence..."
echo "------------------------------"
check_file "plugins/clarityhud/main.js"
check_file "plugins/clarityhud/backend/api.js"
check_file "plugins/clarityhud/overlays/chat.html"
check_file "plugins/clarityhud/overlays/chat.js"
check_file "plugins/clarityhud/overlays/full.html"
check_file "plugins/clarityhud/overlays/full.js"
check_file "plugins/clarityhud/ui/main.html"
check_file "plugins/clarityhud/ui/main.js"
check_file "plugins/clarityhud/lib/animations.js"
check_file "plugins/clarityhud/lib/accessibility.js"
check_file "plugins/clarityhud/lib/layout-engine.js"
echo ""

echo "2. Checking JavaScript routes..."
echo "--------------------------------"
check_content "plugins/clarityhud/main.js" "/plugins/clarityhud/overlays/chat.js" "Route for chat.js exists"
check_content "plugins/clarityhud/main.js" "/plugins/clarityhud/overlays/full.js" "Route for full.js exists"
check_content "plugins/clarityhud/main.js" "/plugins/clarityhud/ui/main.js" "Route for main.js exists"
echo ""

echo "3. Checking Chat HUD fixes..."
echo "-----------------------------"
check_content "plugins/clarityhud/overlays/chat.js" "DOMContentLoaded" "DOM initialization fix"
check_content "plugins/clarityhud/overlays/chat.js" "messagesContainer = document.getElementById" "Messages container initialization"
check_content "plugins/clarityhud/overlays/chat.html" "chat-opacity" "Opacity CSS variable"
check_content "plugins/clarityhud/overlays/chat.js" "opacity" "Opacity setting support"
check_content "plugins/clarityhud/overlays/chat.js" "keepOnTop" "Keep on top setting support"
echo ""

echo "4. Checking Full HUD line spacing fixes..."
echo "------------------------------------------"
check_content "plugins/clarityhud/overlays/full.html" "line-height.*1.2" "Line height set to 1.2"
check_content "plugins/clarityhud/overlays/full.html" "hud-opacity" "HUD opacity CSS variable"
check_content "plugins/clarityhud/overlays/full.html" "padding: 8px 12px" "Reduced singleStream padding"
check_content "plugins/clarityhud/overlays/full.html" "padding: 6px 10px" "Reduced structured padding"
check_content "plugins/clarityhud/overlays/full.html" "padding: 4px 8px" "Reduced adaptive padding"
check_content "plugins/clarityhud/overlays/full.html" "font-size: 1.3em" "Reduced icon size"
echo ""

echo "5. Checking backend settings..."
echo "-------------------------------"
check_content "plugins/clarityhud/backend/api.js" "opacity: 1" "Opacity in default settings"
check_content "plugins/clarityhud/backend/api.js" "keepOnTop: false" "Keep on top in default settings"
check_content "plugins/clarityhud/backend/api.js" "lineHeight: 1.2" "Line height in full HUD defaults"
echo ""

echo "6. Checking UI settings panel..."
echo "--------------------------------"
check_content "plugins/clarityhud/ui/main.js" "Window Settings" "Window settings section"
check_content "plugins/clarityhud/ui/main.js" "Transparency" "Transparency label"
check_content "plugins/clarityhud/ui/main.js" "opacity" "Opacity slider"
check_content "plugins/clarityhud/ui/main.js" "keepOnTop" "Keep on top checkbox"
echo ""

echo "7. Checking socket events..."
echo "----------------------------"
check_content "plugins/clarityhud/overlays/chat.js" "clarityhud.update.chat" "Chat update event listener"
check_content "plugins/clarityhud/overlays/chat.js" "clarityhud.settings.chat" "Chat settings event listener"
check_content "plugins/clarityhud/overlays/full.js" "clarityhud.update.chat" "Full chat event listener"
check_content "plugins/clarityhud/overlays/full.js" "clarityhud.settings.full" "Full settings event listener"
check_content "plugins/clarityhud/backend/api.js" "this.api.emit('clarityhud.update.chat'" "Backend chat emit"
echo ""

echo "======================================"
echo "Validation Complete!"
echo "======================================"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Start the server: npm start"
echo "2. Navigate to http://localhost:3000/clarityhud/ui"
echo "3. Test Chat HUD at http://localhost:3000/overlay/clarity/chat"
echo "4. Test Full HUD at http://localhost:3000/overlay/clarity/full"
echo "5. Use test buttons in the UI to send test events"
echo "6. Verify transparency slider works"
echo "7. Verify keep-on-top checkbox saves"
echo ""
