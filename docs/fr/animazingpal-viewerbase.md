# AnimazingPal Viewerbase

AnimazingPal already keeps a per-streamer memory system for viewers, gifts, chat, follows, shares, and subscriptions. This document describes the viewerbase layer that sits on top of that memory system.

## Goals

- keep the internal viewerbase fast and local
- expose the viewerbase in the UI
- support an optional outbound sync to an external viewerbase or dashboard
- avoid making live reaction flow depend on the external target

## Internal Viewerbase

The internal viewerbase is the source of truth during a stream.

It uses the existing Brain Engine and Memory Database to provide:

- streamer-scoped user profiles
- stream counts
- gift counts and diamond totals
- interaction history
- top supporters
- frequent chatters
- recent memories and stream context

Relevant endpoints:

- `GET /api/animazingpal/brain/user/:username`
- `GET /api/animazingpal/brain/user/:username/history`
- `GET /api/animazingpal/brain/supporters`
- `GET /api/animazingpal/brain/chatters`
- `GET /api/animazingpal/viewerbase`

## External Viewerbase

The external viewerbase is an optional export layer.

Design rules:

- it must never block event handling
- it should sync aggregated snapshots, not raw hot-path logic
- it should support retries and manual sync
- it should remain disabled unless explicitly configured

The current implementation sends a snapshot payload with:

- streamer id
- generated timestamp
- memory statistics
- top supporters
- frequent chatters
- recent memories
- viewer counts

## Configuration

```javascript
viewerbase: {
  enabled: true,
  showInUI: true,
  recentLimit: 12,
  supporterLimit: 10,
  chatterLimit: 10,
  syncOnEvents: ['chat', 'gift', 'follow', 'share', 'like', 'subscribe', 'connected', 'disconnected'],
  externalSync: {
    enabled: false,
    endpointUrl: '',
    authToken: '',
    timeoutMs: 5000,
    retryLimit: 3,
    includeRecentMemories: true,
    includeTopSupporters: true,
    includeFrequentChatters: true
  }
}
```

## UI

The AnimazingPal UI now has a dedicated Viewerbase tab with:

- status counters
- top supporters
- frequent chatters
- recent viewer activity
- external sync configuration
- manual sync trigger

## Sync Payload

The outbound payload uses a versioned schema:

- `schema`: `animazingpal.viewerbase.snapshot.v1`
- `source`: `animazingpal`
- `streamerId`
- `reason`
- `snapshot`

This keeps the export contract stable if the internal viewerbase grows later.

## Next Step Options

- add a dedicated adapter for one external viewerbase product
- add per-viewer notes and tagging in the UI
- add export/import for viewerbase snapshots
- add a moderation view for VIPs and returning viewers
