# StreamAlchemy Plugin

Transform TikTok gifts into virtual RPG items with AI-powered crafting mechanics.

## Overview

StreamAlchemy is a comprehensive plugin for "Pup Cid's Little TikTool Helper" that creates an immersive RPG-style item collection and crafting system. When viewers send TikTok gifts, those gifts are transformed into unique virtual items with AI-generated icons. When viewers send two gifts within 6 seconds, those items automatically combine into more powerful crafted items.

## Features

- **Gift-to-Item Transformation**: Every TikTok gift becomes a unique RPG item
- **AI-Generated Icons**: DALL-E 3 creates custom isometric item icons
- **Deterministic Generation**: Items are generated once and cached forever
- **Real-time Crafting**: Send 2 gifts within 6 seconds to trigger crafting
- **Rarity Tiers**: 4 tiers based on combined coin values
  - Bronze (Common): < 100 coins
  - Silver (Rare): 100-999 coins
  - Gold (Legendary): 1000-4999 coins
  - Purple (Mythic): 5000+ coins
- **Persistent Inventory**: Track every user's item collection
- **Real-time Overlay**: Beautiful HUD with animations
- **Race-condition Safe**: Serialized AI requests, atomic database writes

## Installation

1. The plugin is already installed in `plugins/streamalchemy/`
2. Set your OpenAI API key:
   - Add `OPENAI_API_KEY=your_key_here` to `.env` file in the app directory
   - Or configure via the plugin settings in the dashboard
3. Restart the server
4. Add the overlay to OBS:
   - Browser Source URL: `http://localhost:3000/streamalchemy/overlay`
   - Width: 1920, Height: 1080

## Configuration

### Via Environment Variables

```bash
OPENAI_API_KEY=sk-your-openai-api-key
```

### Via API

```javascript
// Get current config
GET /api/streamalchemy/config

// Update config
POST /api/streamalchemy/config
{
  "enabled": true,
  "autoGenerateItems": true,
  "autoCrafting": true,
  "openaiApiKey": "sk-..."
}
```

## API Endpoints

- `GET /streamalchemy/overlay` - Overlay HTML page
- `GET /streamalchemy/style.css` - Overlay CSS
- `GET /api/streamalchemy/config` - Get plugin configuration
- `POST /api/streamalchemy/config` - Update plugin configuration
- `GET /api/streamalchemy/inventory/:userId` - Get user's inventory
- `GET /api/streamalchemy/stats` - Get database and crafting statistics
- `GET /api/streamalchemy/items` - Get all items (global inventory)

## Socket.io Events

### Emitted by Plugin

- `streamalchemy:item_discovery` - New item discovered (first time)
- `streamalchemy:item_increment` - Item quantity increased (repeat)
- `streamalchemy:crafting_start` - Crafting animation begins
- `streamalchemy:crafting_complete` - Crafting finished, new item created

### Received by Plugin

- `streamalchemy:get_inventory` - Request user inventory

## How It Works

### Gift Processing Flow

1. User sends a TikTok gift
2. Plugin checks if this gift ID has an associated item
3. If not, generates a new base item with AI
4. Adds gift to user's 6-second buffer
5. Checks for crafting opportunity

### Crafting Flow

1. User has 2+ gifts in buffer within 6 seconds
2. Takes the two most recent gifts
3. Checks if this combination already exists in database
4. If not, generates a new crafted item with AI
5. Removes both base items from buffer
6. Adds crafted item to user's inventory
7. Triggers overlay animation

### Deterministic Generation

- **Base Items**: Keyed by `giftId` - same gift always produces same item
- **Crafted Items**: Keyed by sorted `[itemAId, itemBId]` - same combination always produces same result
- **Database Lookup**: Always checks before AI generation
- **No Duplicates**: Once generated, items are loaded from database

## Database Structure

### Global Inventory (`data/inventory_global.json`)

```javascript
{
  "items": [
    {
      "itemId": "uuid-v4",
      "giftId": 5655,                    // For base items
      "parentItems": ["uuid1", "uuid2"],  // For crafted items
      "name": "Essence of Rose",
      "rarity": "Common",
      "imageURL": "https://...",
      "isCrafted": false,
      "coinValue": 10,
      "createdAt": "2025-11-23T..."
    }
  ]
}
```

### User Inventory (`data/user_inventory.json`)

```javascript
{
  "userInventories": [
    {
      "userId": "username123",
      "items": [
        {
          "itemId": "uuid-v4",
          "quantity": 5,
          "firstObtained": "2025-11-23T...",
          "lastObtained": "2025-11-23T..."
        }
      ]
    }
  ]
}
```

## Overlay Animations

### Discovery Popup (New Item)
- Duration: 5 seconds
- Features: Glow effect, particles, rarity-based colors
- Trigger: First time receiving an item

### Crafting Animation
- Duration: 3 seconds
- Features: Item movement, fusion effect, explosion
- Trigger: Two items combined

### Corner Counter (Repeat)
- Duration: 3 seconds
- Features: Bounce-in, quantity display, rarity glow
- Trigger: Receiving an item you already have

## Rarity System

### Color Schemes

- **Bronze/Common**: Warm bronze glow (#CD7F32)
- **Silver/Rare**: Frost silver glow (#C0C0C0)
- **Gold/Legendary**: Heavy gold glow (#FFD700)
- **Purple/Mythic**: Arcane purple aura (#9370DB)

### Calculation

Rarity is determined by the sum of coin values of the two parent items:

```javascript
totalCoins = itemA.coinValue + itemB.coinValue

if (totalCoins >= 5000) -> Mythic
else if (totalCoins >= 1000) -> Legendary
else if (totalCoins >= 100) -> Rare
else -> Common
```

## Performance

- **AI Queue**: Only 1 concurrent request to avoid rate limits
- **Database**: Atomic writes with LowDB (no race conditions)
- **Overlay**: GPU-accelerated CSS animations (60 FPS)
- **Memory**: Gift buffers auto-cleanup every 30 seconds
- **Rate Limiting**: 30 gifts per user per minute

## Future Features (Prepared Structure)

### Chat Commands
- `/merge itemA itemB` - Manual crafting
- `/inventory` - Show your inventory
- `/alchemy help` - Display help

The command parser structure is ready in `index.js` but not yet implemented.

## Troubleshooting

### No AI Generation

1. Check OpenAI API key is set
2. Check API key has credits
3. Check console for error messages
4. Items will use placeholder images if AI fails

### Items Not Appearing in Overlay

1. Verify overlay URL is correct in OBS
2. Check browser console for errors
3. Ensure Socket.io connection is established
4. Check that plugin is enabled

### Crafting Not Triggering

1. Verify two gifts sent within 6 seconds
2. Check `autoCrafting` is enabled in config
3. Check rate limiting isn't blocking gifts
4. View stats endpoint for active buffers

## Development

### File Structure

```
streamalchemy/
├── plugin.json           # Plugin metadata
├── index.js              # Main plugin class
├── config.js             # Configuration constants
├── db.js                 # Database layer (LowDB)
├── craftingService.js    # AI generation and queue
├── overlay.html          # Overlay frontend
├── style.css             # Overlay styles
├── README.md             # This file
└── data/                 # Created at runtime
    ├── inventory_global.json
    └── user_inventory.json
```

### Dependencies

- `openai` - DALL-E 3 API client
- `lowdb` - JSON database
- `uuid` - Unique ID generation
- `express` - HTTP routes
- `socket.io` - Real-time events

## License

CC BY-NC 4.0

## Author

Pup Cid

## Version

1.0.0
