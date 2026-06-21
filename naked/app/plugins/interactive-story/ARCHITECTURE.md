# Interactive Story Generator - Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         INTERACTIVE STORY PLUGIN                             │
│                          (Little TikTool Helper)                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER INTERFACES                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐         ┌──────────────────┐                          │
│  │   Admin Panel    │         │   OBS Overlay    │                          │
│  │    (ui.html)     │         │ (overlay.html)   │                          │
│  ├──────────────────┤         ├──────────────────┤                          │
│  │ • Configuration  │         │ • Chapter View   │                          │
│  │ • Theme Selector │         │ • Voting Display │                          │
│  │ • Story Control  │         │ • Vote Bars      │                          │
│  │ • Memory Viewer  │         │ • Results        │                          │
│  │ • Top Voters     │         │ • Transitions    │                          │
│  │ • Session Hist.  │         │ • Image Display  │                          │
│  └────────┬─────────┘         └─────────┬────────┘                          │
│           │                             │                                    │
│           └─────────────┬───────────────┘                                    │
│                         │                                                    │
└─────────────────────────┼────────────────────────────────────────────────────┘
                          │
                          │ Socket.io / HTTP
                          │
┌─────────────────────────┼────────────────────────────────────────────────────┐
│                         ▼                                                    │
│                   MAIN PLUGIN                                                │
│                   (main.js)                                                  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────┐             │
│  │                    Plugin Coordinator                       │             │
│  │  • Lifecycle Management (init/destroy)                     │             │
│  │  • Service Initialization                                  │             │
│  │  • Route Registration                                      │             │
│  │  • Event Handling                                          │             │
│  │  • Session Management                                      │             │
│  └───┬────────────────────────────────────────────────────┬───┘             │
│      │                                                    │                 │
│      │                                                    │                 │
└──────┼────────────────────────────────────────────────────┼─────────────────┘
       │                                                    │
       │                                                    │
┌──────┼────────────────────────────────────────────────────┼─────────────────┐
│      │                   CORE ENGINES                     │                 │
│      │                                                    │                 │
│  ┌───▼──────────────┐  ┌──────────────┐  ┌──────────────▼──┐               │
│  │  Story Engine    │  │  LLM Service │  │  Image Service  │               │
│  │                  │  │              │  │                 │               │
│  │ • Theme Mgmt     │  │ • DeepSeek   │  │ • FLUX.1        │               │
│  │ • Chapter Gen    │  │ • Qwen 2.5   │  │ • Z-Image       │               │
│  │ • Outline Gen    │  │ • Llama 3.1  │  │ • Caching       │               │
│  │ • Coherence Chk  │  │ • Chat API   │  │ • Style Gen     │               │
│  │ • Choice Gen     │  │              │  │                 │               │
│  └────────┬─────────┘  └──────┬───────┘  └─────────┬───────┘               │
│           │                   │                     │                       │
│           │                   │                     │                       │
│  ┌────────▼─────────┐  ┌──────▼────────┐           │                       │
│  │  Story Memory    │  │  TTS Service  │           │                       │
│  │                  │  │               │           │                       │
│  │ • Characters     │  │ • 6 Voices    │           │                       │
│  │ • Locations      │  │ • Pre-cache   │           │                       │
│  │ • Items          │  │ • Audio API   │           │                       │
│  │ • Events         │  │               │           │                       │
│  │ • Context Gen    │  └───────────────┘           │                       │
│  └──────────────────┘                              │                       │
│                                                     │                       │
└─────────────────────────────────────────────────────┼───────────────────────┘
                                                      │
                                                      │
┌─────────────────────────────────────────────────────┼───────────────────────┐
│                   UTILITIES & BACKEND               │                       │
│                                                     │                       │
│  ┌──────────────────┐          ┌──────────────────▼┐                       │
│  │  Voting System   │          │    Database       │                       │
│  │                  │          │                   │                       │
│  │ • Vote Processing│          │ • Sessions        │                       │
│  │ • Chat Commands  │          │ • Chapters        │                       │
│  │ • Timer Mgmt     │          │ • Votes           │                       │
│  │ • Winner Select  │          │ • Viewer Stats    │                       │
│  │ • Statistics     │          │ • Memory Snapshots│                       │
│  └─────────┬────────┘          └───────────────────┘                       │
│            │                                                                │
│            │                                                                │
└────────────┼────────────────────────────────────────────────────────────────┘
             │
             │
┌────────────┼────────────────────────────────────────────────────────────────┐
│            │                 EXTERNAL INTEGRATIONS                          │
│            │                                                                │
│  ┌─────────▼──────────┐  ┌──────────────────┐  ┌──────────────────┐       │
│  │  TikTok LIVE       │  │  SiliconFlow API │  │  File System     │       │
│  │  Connector         │  │                  │  │                  │       │
│  │                    │  │ • Chat Compl.    │  │ • Image Cache    │       │
│  │ • Chat Events      │  │ • Image Gen      │  │ • Audio Cache    │       │
│  │ • Viewer Data      │  │ • TTS            │  │ • Exports        │       │
│  │ • !a, !b, !c       │  │                  │  │ • user_data/     │       │
│  └────────────────────┘  └──────────────────┘  └──────────────────┘       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════════════

                              DATA FLOW DIAGRAM

┌───────────────┐
│   Streamer    │
│ Selects Theme │
└───────┬───────┘
        │
        ▼
┌───────────────────┐
│ Story Engine      │──► LLM Service ──► SiliconFlow API
│ Generate Chapter  │                    (DeepSeek/Qwen/Llama)
└───────┬───────────┘                    
        │                                 
        ▼                                 
┌───────────────────┐                    
│ Story Memory      │                    
│ Update Context    │                    
└───────┬───────────┘                    
        │                                 
        ▼                                 
┌───────────────────┐                    
│ Image Service     │──► SiliconFlow API
│ Generate Image    │    (FLUX/Z-Image)
└───────┬───────────┘                    
        │                                 
        ▼                                 
┌───────────────────┐                    
│ Database          │                    
│ Save Chapter      │                    
└───────┬───────────┘                    
        │                                 
        ▼                                 
┌───────────────────┐                    
│ Socket.io         │──► OBS Overlay
│ Emit chapter-ready│    Displays Chapter
└───────┬───────────┘    
        │                
        ▼                
┌───────────────────┐    
│ Voting System     │◄── TikTok LIVE Chat
│ Start Voting      │    (!a, !b, !c)
└───────┬───────────┘    
        │                
        │ (60s timer)    
        │                
        ▼                
┌───────────────────┐    
│ Voting System     │──► Socket.io ──► OBS Overlay
│ End & Get Winner  │    vote-update    (Vote Bars)
└───────┬───────────┘    
        │                
        ▼                
┌───────────────────┐    
│ Database          │    
│ Save Vote Results │    
└───────┬───────────┘    
        │                
        ▼                
┌───────────────────┐    
│ Story Engine      │──► Generate Next Chapter
│ Use Winner Choice │    (Loop back to top)
└───────────────────┘    

═══════════════════════════════════════════════════════════════════════════════

                           API ENDPOINTS MAP

┌─────────────────────────────────────────────────────────────────────────────┐
│                          HTTP REST API                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  GET  /api/interactive-story/status          → Current session status      │
│  GET  /api/interactive-story/config          → Get configuration           │
│  POST /api/interactive-story/config          → Save configuration          │
│  POST /api/interactive-story/start           → Start new story             │
│  POST /api/interactive-story/next-chapter    → Generate next chapter       │
│  POST /api/interactive-story/end             → End current story           │
│  GET  /api/interactive-story/themes          → Available themes            │
│  GET  /api/interactive-story/memory          → Story memory/lore           │
│  GET  /api/interactive-story/sessions        → Session history             │
│  GET  /api/interactive-story/session/:id     → Session details             │
│  GET  /api/interactive-story/top-voters      → Top voter stats             │
│  GET  /api/interactive-story/image/:filename → Serve cached image          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         SOCKET.IO EVENTS                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Client → Server:                                                           │
│    • story:force-vote-end          → Force end voting                      │
│    • story:regenerate-image        → Generate new image                    │
│                                                                              │
│  Server → Client:                                                           │
│    • story:chapter-ready           → New chapter available                 │
│    • story:voting-started          → Voting session started                │
│    • story:vote-update             → Vote counts updated                   │
│    • story:voting-ended            → Voting finished with results          │
│    • story:generation-started      → LLM generating content                │
│    • story:image-updated           → Image regenerated                     │
│    • story:ended                   → Story session ended                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════════════

                         DATABASE SCHEMA

┌─────────────────────────────────────────────────────────────────────────────┐
│  story_sessions                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  id (PK)  │ theme  │ outline  │ model  │ start_time  │ end_time  │ status  │
└─────────────────────────────────────────────────────────────────────────────┘
                │
                │ 1:N
                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  story_chapters                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  id  │ session_id (FK)  │ chapter_number  │ title  │ content  │ choices    │
│      │ memory_tags  │ image_path  │ audio_paths  │ created_at              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  story_votes                                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  id  │ session_id (FK)  │ chapter_number  │ choice_index  │ vote_count     │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  story_viewer_stats                                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  id  │ session_id (FK)  │ user_id  │ username  │ votes_cast  │ last_vote   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  story_memory                                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  id  │ session_id (FK)  │ memory_data (JSON)  │ updated_at                 │
└─────────────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════════════
```

## Key Architectural Principles

### 1. **Modularity**
- Each component is independent and replaceable
- Clear interfaces between layers
- Dependency injection via Plugin API

### 2. **Event-Driven**
- Socket.io for real-time updates
- Observer pattern for state changes
- Decoupled communication

### 3. **Scalability**
- Caching reduces API calls
- Database indexes for performance
- Async operations throughout

### 4. **Reliability**
- Error handling at every layer
- Graceful degradation
- Auto-recovery mechanisms

### 5. **Maintainability**
- Clear separation of concerns
- Comprehensive logging
- Well-documented code

### 6. **Security**
- API keys in database
- Input validation
- SQL injection prevention
- XSS protection
