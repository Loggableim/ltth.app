# Plinko Gift Catalog Implementation - Manual Testing Guide

## Overview
This guide provides step-by-step instructions for manually testing the new plinko gift catalog and multi-board functionality.

## What Was Implemented

### 1. Database Changes
- **Multi-Board Support**: Migrated from single plinko configuration to support multiple boards
- **Automatic Migration**: Existing single board is automatically migrated to new schema
- **New Columns**: Added `name`, `chat_command`, `enabled`, `created_at` columns
- **Board Management Functions**: Create, read, update, delete operations for boards

### 2. Backend API Endpoints

#### New Endpoints:
- `GET /api/game-engine/plinko/boards` - Get all plinko boards
- `POST /api/game-engine/plinko/boards` - Create new board
- `DELETE /api/game-engine/plinko/boards/:boardId` - Delete board
- `PUT /api/game-engine/plinko/boards/:boardId/name` - Update board name
- `PUT /api/game-engine/plinko/boards/:boardId/chat-command` - Update chat command
- `PUT /api/game-engine/plinko/boards/:boardId/enabled` - Enable/disable board
- `POST /api/game-engine/plinko/gift-mappings` - Update gift mappings

#### Updated Endpoints:
- `GET /api/game-engine/plinko/config?boardId={id}` - Now supports boardId parameter
- `POST /api/game-engine/plinko/config` - Now supports boardId in request body

### 3. Frontend UI Changes

#### New UI Components:
1. **Board Selector Dropdown**: Select between multiple plinko boards
2. **Board Management Buttons**:
   - Create New Board
   - Delete Board
3. **Board Configuration Inputs**:
   - Board Name
   - Chat Command (optional)
   - Enabled Toggle
4. **Gift Catalog Button**: Opens gift catalog modal for plinko
5. **Gift Selection Mode**: Click gifts from catalog to add to plinko board

### 4. Game Logic Updates
- `PlinkoGame.getAllBoards()` - Get all boards
- `PlinkoGame.createBoard(name)` - Create new board
- `PlinkoGame.getConfig(boardId)` - Get board config by ID
- `PlinkoGame.updateConfig(boardId, ...)` - Update board config
- `PlinkoGame.deleteBoard(boardId)` - Delete board
- `PlinkoGame.findBoardByGiftTrigger(giftId)` - Find board by gift
- `PlinkoGame.findBoardByChatCommand(command)` - Find board by command

## Manual Testing Steps

### Prerequisites
1. Start the LTTH application
2. Navigate to Game Engine admin panel
3. Click on the "Plinko" tab

### Test 1: Verify Default Board Migration
**Expected Result**: You should see a board selector dropdown with "Standard Plinko" selected

**Steps:**
1. Open Plinko tab
2. Check that board selector shows "Standard Plinko"
3. Verify board name field shows "Standard Plinko"
4. Verify "Board aktiviert" checkbox is checked

**✓ Pass if**: Default board is visible and properly configured

### Test 2: Create New Plinko Board
**Expected Result**: New board is created and can be selected

**Steps:**
1. Click "➕ Neues Board erstellen" button
2. Enter name: "Test Plinko"
3. Click OK
4. Verify success message appears
5. Check board selector dropdown - should now show 2 boards
6. Select "Test Plinko" from dropdown

**✓ Pass if**: New board appears in selector and can be selected

### Test 3: Update Board Name
**Expected Result**: Board name is updated successfully

**Steps:**
1. Select a board from dropdown
2. Change name in "Board-Name" field to "Updated Name"
3. Click "💾 Name speichern"
4. Verify success message
5. Check board selector - name should be updated

**✓ Pass if**: Board name updates in both input and selector

### Test 4: Configure Board Chat Command
**Expected Result**: Chat command is saved and can trigger plinko

**Steps:**
1. Select a board
2. Enter "/testplinko" in "Chat-Befehl" field
3. Click "💾 Befehl speichern"
4. Verify success message

**✓ Pass if**: Command is saved without errors

### Test 5: Enable/Disable Board
**Expected Result**: Board can be enabled/disabled

**Steps:**
1. Select a board
2. Uncheck "Board aktiviert" checkbox
3. Verify success message
4. Board selector should show "(deaktiviert)" next to name
5. Re-check the checkbox
6. Verify "(deaktiviert)" disappears

**✓ Pass if**: Enable/disable status updates correctly

### Test 6: Open Gift Catalog
**Expected Result**: Gift catalog modal opens

**Steps:**
1. Scroll to "🎁 Geschenk-zu-Ball Mapping" section
2. Click "📦 Geschenk-Katalog öffnen" button
3. Verify modal opens with gift catalog
4. Verify header shows "🎁 Geschenk-Katalog"

**✓ Pass if**: Modal opens and displays gift catalog

### Test 7: Select Gift from Catalog
**Expected Result**: Gift is added to plinko board mappings

**Steps:**
1. Open gift catalog (see Test 6)
2. Click on any gift card in the catalog
3. Verify success message: "Geschenk ... zum Plinko-Board ... hinzugefügt"
4. Verify modal closes
5. Check gift mappings section - new gift should appear
6. Verify gift has:
   - Gift name/ID
   - Bet amount (default: 100 XP)
   - Ball type selector (Standard/Golden)
   - Delete button

**✓ Pass if**: Gift appears in mappings with correct default values

### Test 8: Configure Gift Mapping
**Expected Result**: Gift mapping can be customized

**Steps:**
1. Find a gift in mappings section
2. Change bet amount to 500
3. Change ball type to "Golden (2x)"
4. Click "🎰 Plinko-Einstellungen speichern"
5. Verify success message
6. Reload page and verify settings are saved

**✓ Pass if**: Gift mapping configuration persists

### Test 9: Remove Gift Mapping
**Expected Result**: Gift can be removed from board

**Steps:**
1. Click 🗑️ button next to a gift mapping
2. Confirm deletion in dialog
3. Verify gift is removed from list
4. Click "🎰 Plinko-Einstellungen speichern"
5. Verify success message

**✓ Pass if**: Gift is removed and change persists

### Test 10: Multiple Boards with Different Configs
**Expected Result**: Each board maintains independent configuration

**Steps:**
1. Create 3 different boards:
   - "High Stakes" (10 slots, 3.0 gravity)
   - "Low Stakes" (5 slots, 1.5 gravity)
   - "Experimental" (different physics)
2. Configure each with different:
   - Slot multipliers
   - Physics settings
   - Gift mappings
3. Switch between boards using selector
4. Verify each board shows its unique configuration

**✓ Pass if**: All configurations remain independent

### Test 11: Delete Board
**Expected Result**: Board can be deleted (except last one)

**Steps:**
1. Create 2 boards (so you have at least 2)
2. Select second board
3. Click "🗑️ Board löschen"
4. Confirm deletion
5. Verify board is removed from selector
6. Try to delete the last remaining board
7. Verify error message: "Cannot delete the last plinko board"

**✓ Pass if**: Deletion works for non-last boards, prevents deleting last

### Test 12: Slot Configuration per Board
**Expected Result**: Slots are independent per board

**Steps:**
1. Select Board A
2. Configure 5 slots with specific multipliers
3. Switch to Board B
4. Configure 9 slots with different multipliers
5. Switch back to Board A
6. Verify Board A still has 5 slots with original multipliers

**✓ Pass if**: Each board maintains independent slot configuration

### Test 13: Gift Catalog Refresh
**Expected Result**: Catalog can be refreshed to get new gifts

**Steps:**
1. Open gift catalog
2. Click "Katalog aktualisieren" button
3. Wait for update message
4. Verify catalog refreshes

**✓ Pass if**: Refresh works without errors

### Test 14: Switch Boards While Editing
**Expected Result**: Unsaved changes warning or auto-save

**Steps:**
1. Select Board A
2. Make changes to slots or physics
3. DON'T save
4. Switch to Board B using selector
5. Switch back to Board A
6. Check if unsaved changes are lost (expected behavior)

**✓ Pass if**: Switching boards loads new config (unsaved changes discarded)

### Test 15: Board Selector Persistence
**Expected Result**: Selected board persists on page reload

**Steps:**
1. Select a specific board
2. Reload the page
3. Check which board is selected

**Note**: First board is selected by default (this is expected behavior)

**✓ Pass if**: Page loads without errors

## Known Limitations

1. **Board Selection Not Persisted**: Selected board resets to first board on page reload
   - **Reason**: No localStorage implementation yet
   - **Impact**: Minor UX inconvenience

2. **No Overlay Board Switching**: Overlay always uses first/default board
   - **Reason**: Overlay update not yet implemented
   - **Impact**: Multi-board mainly useful for different chat commands

3. **Gift Selection Shows All Gifts**: No filtering by board
   - **Reason**: Gift catalog is global
   - **Impact**: Users see all available gifts regardless of board

## Integration Points

### TikTok Gift Events
When a gift is sent:
1. System checks all enabled plinko boards
2. Finds board with matching gift in `giftMappings`
3. Triggers plinko drop on that board
4. Uses board's specific configuration (slots, physics)

### Chat Commands
When chat command is sent:
1. System checks all enabled plinko boards
2. Finds board with matching `chatCommand`
3. Triggers plinko drop on that board
4. User can specify bet amount in command

## Troubleshooting

### Board Not Appearing
- Check browser console for errors
- Verify API endpoint `/api/game-engine/plinko/boards` returns data
- Check network tab for failed requests

### Gift Catalog Not Opening
- Verify button exists: `id="openPlinkoGiftCatalogBtn"`
- Check console for JavaScript errors
- Ensure modal element exists: `id="gift-catalog-modal"`

### Configuration Not Saving
- Open browser console
- Check for error messages
- Verify POST request to `/api/game-engine/plinko/config` succeeds
- Check request payload includes `boardId`

### Gifts Not Triggering Plinko
- Verify board is enabled
- Check gift ID matches exactly in gift mappings
- Ensure TikTok connection is active
- Check logs for gift event processing

## Success Criteria

✓ All 15 manual tests pass
✓ No JavaScript errors in console
✓ All API endpoints respond correctly
✓ Database migration completes without errors
✓ Multiple boards can coexist with different configurations
✓ Gift catalog integration works smoothly
✓ Board selection and management UI is intuitive

## Next Steps (Optional Enhancements)

1. **Overlay Board Switching**: Add board selection to overlay
2. **Board Selection Persistence**: Save selected board to localStorage
3. **Board Templates**: Pre-configured board templates
4. **Board Cloning**: Duplicate existing board as template
5. **Board Analytics**: Track stats per board
6. **Gift Filtering**: Filter catalog by board
7. **Board-Specific Chat Commands**: More granular command handling
8. **Board Import/Export**: Share board configurations

## Rollback Plan

If issues arise:
1. Database will auto-migrate on next startup
2. Old single-board setup is preserved as first board
3. No data loss - all existing configurations maintained
4. Disable new UI by removing board selector HTML elements
5. API endpoints are backward compatible (no boardId = first board)

## Support

For issues or questions:
- Check browser console for errors
- Review server logs for backend issues
- Verify database migration completed successfully
- Check network tab for API request/response details
