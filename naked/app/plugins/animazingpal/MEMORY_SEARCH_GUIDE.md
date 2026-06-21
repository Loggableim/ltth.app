# AnimazingPal Memory Search & Personality Integration

## Overview

This enhancement adds comprehensive memory search capabilities and personality system integration to the AnimazingPal plugin, enabling context-aware AI responses based on stored user memories and customizable personality settings.

## Features Added

### 1. Memory Search UI (Memories Tab)

A new "Erinnerungen" (Memories) tab in the AnimazingPal UI provides:

- **Search by Keyword**: Search memories by content using free-text search
- **Filter by Username**: View memories specific to a particular user
- **Filter by Importance**: Filter memories by importance threshold (e.g., ≥0.7 for very important)
- **Memory Statistics Dashboard**: View total memories, users, average importance, and archives
- **Archive Old Memories**: Compress and archive old memories to maintain database performance
- **Detailed Memory Cards**: Each memory displays:
  - Username (if associated with a user)
  - Timestamp and memory type
  - Content and context
  - Importance score (color-coded: green ≥0.7, yellow ≥0.5, gray <0.5)
  - Tags (if any)

#### How to Use Memory Search

1. Navigate to the "Erinnerungen" tab in AnimazingPal UI
2. Click "Alle laden" (Load All) to view all memories
3. Use the search input to find specific memories
4. Use dropdowns to filter by user or importance level
5. Click "Archivieren" to archive old memories

### 2. Personality System Integration (Personalities Tab)

A new "Persönlichkeiten" (Personalities) tab provides comprehensive personality and memory settings:

#### Personality Selection
- Choose from 5 pre-built personalities:
  - Freundlicher Streamer (Friendly Streamer)
  - Gaming Pro
  - Entertainer
  - Chill Vibes
  - Anime Fan
- Real-time personality switching
- Custom personalities can be created via Brain Engine API

#### Memory-Related Settings
- **Max. Kontext-Erinnerungen** (Max Context Memories): Number of memories included in chat responses (1-50, default: 10)
- **Wichtigkeitsschwelle** (Importance Threshold): Minimum importance for memories to be recalled (0.0-1.0, default: 0.3)
- **Archivierung nach (Tagen)** (Archive After Days): Days before old memories are archived (default: 7)
- **Bereinigung nach (Tagen)** (Prune After Days): Days before unimportant memories are deleted (default: 30)

#### Auto-Response Settings
- **Auf Chat-Nachrichten reagieren**: Enable/disable AI responses to chat messages
- **Geschenke bedanken**: Auto-thank users for gifts (enabled by default)
- **Neue Follower begrüßen**: Auto-welcome new followers (enabled by default)
- **Shares bedanken**: Auto-thank users for shares
- **Chat-Antwort Wahrscheinlichkeit**: Probability of responding to chat (0.0-1.0, default: 0.3 = 30%)
- **Max. Antworten pro Minute**: Rate limit for AI responses (default: 10)

### 3. Context-Aware Chat Integration

The AI brain now automatically includes relevant memories in chat responses:

#### Memory Context Sources
1. **Semantically Similar Memories**: Uses vector memory to find related memories
2. **User-Specific Memories**: Includes memories about the specific user chatting
3. **Important Memories**: Includes high-importance memories based on configured threshold

#### How It Works
When a user sends a chat message:
1. Brain Engine fetches relevant memories using `_getContextMemories()`
2. Memory importance threshold is applied (configurable via Personalities tab)
3. Up to `maxContextMemories` are included in GPT prompt
4. GPT generates a response with full context awareness
5. Response is stored as a new memory for future reference

## API Enhancements

### Enhanced Memory Search Route

**GET** `/api/animazingpal/brain/memories/search`

Query Parameters:
- `query` (string, optional): Search term for content-based search
- `username` (string, optional): Filter by specific username
- `minImportance` (float, optional): Filter by minimum importance (0.0-1.0)
- `limit` (integer, optional): Maximum number of results (default: 100)

Example:
```bash
# Search all memories
GET /api/animazingpal/brain/memories/search?query=&limit=100

# Search by username
GET /api/animazingpal/brain/memories/search?username=john_doe

# Filter by importance
GET /api/animazingpal/brain/memories/search?query=&minImportance=0.7

# Combined filters
GET /api/animazingpal/brain/memories/search?username=jane&minImportance=0.5
```

### Personality Configuration Route

**POST** `/api/animazingpal/brain/config`

Body parameters:
```json
{
  "activePersonality": "friendly_streamer",
  "maxContextMemories": 10,
  "memoryImportanceThreshold": 0.3,
  "archiveAfterDays": 7,
  "pruneAfterDays": 30,
  "chatResponseProbability": 0.3,
  "maxResponsesPerMinute": 10,
  "autoRespond": {
    "chat": false,
    "gifts": true,
    "follows": true,
    "shares": false
  }
}
```

## Technical Implementation

### Files Modified

1. **ui.html**: Added two new tabs (Personalities and Memories) with complete UI
2. **ui.js**: Added JavaScript handlers for:
   - Memory search and filtering
   - Personality settings management
   - Tab-specific data loading
   - Event listeners for all new controls

3. **main.js**: Enhanced memory search API route to support:
   - Optional query parameter
   - Username filtering
   - Importance threshold filtering
   - Flexible limit parameter

4. **brain-engine.js**: Updated `_getContextMemories()` to use configurable importance threshold

### Memory Flow

```
User Chat Message
    ↓
Brain Engine (processChat)
    ↓
_getContextMemories()
    ├─→ Vector Memory (semantic search)
    ├─→ User Memories (user-specific)
    └─→ Important Memories (filtered by threshold)
    ↓
GPT Brain Service (generateChatResponse)
    ├─→ System Prompt (personality)
    ├─→ Memory Context (up to maxContextMemories)
    └─→ Conversation History
    ↓
AI Response with Full Context
    ↓
Stored as New Memory
```

## Usage Examples

### Example 1: Finding Memories About a Specific User

1. Open AnimazingPal UI → Memories tab
2. Select user from "Alle Benutzer" dropdown
3. Click "Suchen" (Search)
4. View all memories associated with that user

### Example 2: Configuring Memory-Aware Personality

1. Open AnimazingPal UI → Personalities tab
2. Select "Gaming Pro" personality
3. Set "Max. Kontext-Erinnerungen" to 15 (include more memories)
4. Set "Wichtigkeitsschwelle" to 0.5 (only recall moderately important memories)
5. Enable "Auf Chat-Nachrichten reagieren"
6. Set "Chat-Antwort Wahrscheinlichkeit" to 0.4 (respond to 40% of chats)
7. Click "Einstellungen speichern"

Now the AI will:
- Use Gaming Pro personality
- Include up to 15 memories in responses
- Only recall memories with importance ≥0.5
- Respond to 40% of chat messages
- Reference relevant user memories in responses

### Example 3: Archiving Old Memories

1. Open AnimazingPal UI → Memories tab
2. Click "Alte archivieren" (Archive Old)
3. Confirm the action
4. Old memories are compressed into archives
5. Database performance is maintained

## Benefits

1. **Enhanced Context Awareness**: AI responses now reference past interactions and user history
2. **Personalized Interactions**: Each user gets responses based on their relationship history
3. **Configurable Memory Usage**: Fine-tune how many and which memories are used
4. **Database Management**: Archive old memories to prevent bloat
5. **Searchable Memory Bank**: Easily find and review past interactions
6. **Flexible Personality System**: Switch personalities and customize memory behavior

## Future Enhancements

Potential future additions:
- Memory importance editing
- Manual memory creation
- Memory tagging system
- Export/import memories
- Memory visualization timeline
- Advanced search filters (date range, event type)

## Troubleshooting

### Memories Not Loading
- Ensure Brain Engine is initialized
- Check that TikTok is connected (sets streamer_id)
- Verify OpenAI API key is configured

### No AI Responses
- Check "Auf Chat-Nachrichten reagieren" is enabled
- Verify "Chat-Antwort Wahrscheinlichkeit" > 0
- Ensure Brain Engine is enabled in config
- Check rate limit ("Max. Antworten pro Minute")

### Slow Search Performance
- Archive old memories regularly
- Reduce "Max. Kontext-Erinnerungen" if responses are slow
- Consider pruning very old, unimportant memories

## Testing

To test the implementation:
1. Start the application: `cd app && npm start`
2. Navigate to AnimazingPal plugin UI
3. Open "Persönlichkeiten" tab → Configure settings → Save
4. Open "Erinnerungen" tab → Click "Alle laden"
5. Connect to TikTok LIVE
6. Send chat messages and observe AI responses
7. Check that memories are created and searchable

## Credits

Implementation follows AnimazingPal architecture:
- Memory Database (MemoryDatabase.js) - Nervous System
- Vector Memory (VectorMemory.js) - Synaptic Connections
- GPT Brain (GPTBrainService.js) - Cerebral Cortex
- Brain Engine (BrainEngine.js) - Intelligence Coordinator
