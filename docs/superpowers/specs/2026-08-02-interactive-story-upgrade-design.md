# Interactive Story 2.0 Design

**Status:** Design approved in conversation; implementation not started.

**Goal:** Extend the Interactive Story plugin into a coherent Ollama-Cloud-first story studio with optional images, Fish.audio narration with scene-aware emotions, safe normalized overlay editing, and a random-role pen-and-paper mode.

## Scope and decisions

- The work is one coordinated feature, delivered in the following order: provider/configuration contracts, narration, overlay layout, pen-and-paper participation, then the simplified GUI and end-to-end verification.
- Existing Interactive Story routes, Socket.IO event names, database records, and test selectors remain compatible unless an additive field/event is explicitly specified below.
- Ollama Cloud is the default LLM provider. The plugin does not persist a second Ollama secret in its own config; it reads the central settings database on initialization, provider reconfiguration, status, and API-key validation.
- Image generation is optional and defaults to off. A missing image provider, an image timeout, or a failed image response never prevents chapter text, narration, voting, or story memory from completing.
- Fish.audio is the default engine for Interactive Story narration. The existing LTTH TTS plugin remains the single playback/queue owner.
- Pen-and-paper mode uses the existing chapter-choice vote as the player action. Players join by keyword, receive random roles, and are eliminated after two consecutive story rounds without an accepted vote.
- Overlay editing is explicit and local-only. Public Quick Tunnel render mode never receives a write-capable editor path.

## Architecture

`main.js` remains the plugin lifecycle/orchestration boundary. New responsibilities are isolated in focused modules:

1. `backend/participant-registry.js` manages join, random role assignment, vote-round attendance, elimination, and public participant snapshots.
2. `utils/narration-director.js` turns a chapter into clean display text plus Fish-compatible narration segments and emotion markers.
3. `utils/overlay-layout.js` validates, migrates, normalizes, and applies layout coordinates.
4. `backend/database.js` owns persistence for participants and round attendance through prepared statements.
5. `main.js` wires these modules into current start/chapter/vote/chat/socket flows and keeps existing API responses backward-compatible.

The UI remains a single plugin page for now, but its visible flow is reorganized into a compact Story Studio shell. Existing form IDs and advanced controls stay available behind an expanded “Advanced” section so current browser tests and saved configurations continue to work.

## Configuration contract

The merged Interactive Story config uses these defaults and migrations:

```js
{
  llmProvider: 'ollama',
  ollamaBaseUrl: 'https://api.ollama.com/v1',
  ollamaModel: 'qwen3.5:cloud',
  imageProvider: 'openai',
  autoGenerateImages: false,
  textOnlyMode: false,
  ttsProvider: 'system',
  ttsEngine: 'fishaudio',
  ttsVoiceId: '',
  fishaudioModel: 's2.1-pro',
  narrationEmotionMode: 'auto',
  storyMode: 'classic',
  dndJoinKeyword: '!join',
  dndInactivityLimitRounds: 2,
  overlayLayoutVersion: 2
}
```

Existing `autoGenerateImages` and `textOnlyMode` values are respected. A saved legacy provider remains valid; only a missing provider uses the new default. A saved legacy TTS engine remains valid; only a missing engine uses Fish.audio.

### Central Ollama key resolution

Add `_getOllamaApiKey()` in `main.js` with a documented priority list of central settings keys:

1. `ollama_cloud_api_key`
2. `ollama_api_key`
3. `tts_ollama_api_key` (existing dashboard key used by the current deployment)

The first non-empty trimmed value is used for cloud requests. Local Ollama URLs may proceed without a key. Plugin config may accept a legacy `ollamaApiKey` only for migration/status compatibility, but it must not override a non-empty central setting or be written back as a new secret. GET config/status/validation responses expose only a configured boolean or `***configured***`.

The provider initializer and the validation endpoint use the same resolver so “configured” and actual request behavior cannot diverge.

## Fish.audio narration and emotions

The LTTH TTS route accepts additive Interactive Story fields:

```js
{
  text,
  username: 'Story Narrator (interactive-story)',
  userId: 'interactive-story',
  source: 'interactive-story',
  engine: 'fishaudio',
  voiceId,
  model: 's2.1-pro',
  emotion,
  streaming: false
}
```

`tts/main.js` forwards `model` and `emotion` only to the Fish engine. Other engines keep their current behavior. The Fish engine chooses marker syntax from the effective model: `[emotion]`/natural-language bracket cues for `s2`, `s2.1`, or `s2.1-pro`; `(emotion)` legacy cues for `s1`. The model is configurable and the current engine default remains a safe fallback for non-Interactive-Story callers.

`NarrationDirector` produces:

```js
{
  displayText: 'clean chapter text without control markers',
  segments: [
    { text: 'The door opened.', emotion: 'mysterious', delivery: 'whispering' }
  ],
  ttsText: '[mysterious][whispering] The door opened.'
}
```

If the LLM supplies validated sentence-level narration metadata, it is used. Otherwise the director applies deterministic genre/action heuristics and a chapter-level fallback emotion, ensuring old chapter responses remain valid. It never exposes control markers in the overlay. It limits sentence-level cues to one primary emotion and at most three combined cues, matching Fish guidance; unsupported cues are dropped rather than sent blindly.

The story engine stores optional narration metadata with the chapter but preserves the existing `content` and `choices` fields. TTS receives `ttsText` while the overlay receives `displayText`/clean `content`.

## Optional image generation

All chapter-generation paths (first chapter, next chapter, final chapter, admin choice, manual advance) call one guarded helper:

```js
await maybeGenerateChapterImage(chapter, config)
```

The helper returns the chapter unchanged when `autoGenerateImages` is false or `textOnlyMode` is true, and catches provider failures while emitting the existing `story:image-generation-failed` diagnostic. No branch may reject a chapter solely because image generation is unavailable. The UI presents one prominent “Generate chapter images” toggle and keeps provider/model selection in Advanced.

## Pen-and-paper mode

### Session and participants

`story_sessions.metadata` records `storyMode`, join keyword, and the active role catalog. Add a `story_participants` table:

```sql
CREATE TABLE IF NOT EXISTS story_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  role_id TEXT NOT NULL,
  role_name TEXT NOT NULL,
  joined_round INTEGER NOT NULL DEFAULT 0,
  last_vote_round INTEGER,
  missed_rounds INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  eliminated_at TEXT,
  UNIQUE(session_id, user_id),
  FOREIGN KEY (session_id) REFERENCES story_sessions(id)
)
```

The built-in catalog contains stable IDs for Warrior, Mage, Rogue, Healer, Ranger, and Bard. Roles are selected randomly for every join; duplicate roles are allowed after the catalog has been used. A user can join only once per session, and an eliminated user cannot rejoin that session.

### Chat and round rules

- In pen-and-paper mode, an exact case-insensitive `dndJoinKeyword` message (default `!join`) enrolls the viewer before vote parsing.
- A successful join emits `story:dnd-participant-joined` and `story:dnd-participants-updated` with a public-safe roster.
- Accepted votes are recorded against the current voting round. Changing a vote still counts as participation for that round.
- At vote resolution, active participants with no accepted vote in that round get `missed_rounds + 1`; voters reset their count to `0` and receive `last_vote_round = round`.
- A participant becomes `eliminated` exactly when `missed_rounds >= dndInactivityLimitRounds` (default two consecutive missed rounds). Newly joined participants are not penalized for the round before their `joined_round`.
- Elimination emits `story:dnd-player-eliminated` and updates the roster. Eliminated roles are excluded from future story prompts but remain visible in session history.
- Non-enrolled viewers may still contribute ordinary story votes; only enrolled participants are subject to role assignment and inactivity elimination.

Add routes:

- `GET /api/interactive-story/participants`
- `POST /api/interactive-story/participants/join` (admin/offline test helper; live chat uses the same registry)
- `POST /api/interactive-story/participants/reset` (active session only, admin-only)

Status responses include `storyMode`, `joinKeyword`, `activeParticipants`, and `eliminatedParticipants` without exposing private IDs beyond the existing viewer identifier contract.

## Overlay drag-and-drop

`overlay.html` uses a versioned layout object:

```js
{
  version: 2,
  positions: {
    title: { x: 0.50, y: 0.50 },
    content: { x: 0.50, y: 0.55 },
    voting: { x: 0.50, y: 0.50 },
    generating: { x: 0.50, y: 0.50 },
    results: { x: 0.50, y: 0.50 },
    participants: { x: 0.82, y: 0.12 }
  }
}
```

Coordinates are normalized to `[0, 1]` and clamped server-side. Existing pixel layouts are migrated once using the current viewport dimensions. The editor uses Pointer Events, supports mouse/touch, grid snapping, keyboard reset, and a visible edit-mode banner. Dragging is enabled only when `?edit=1` or the embedded admin preview explicitly enables edit mode; OBS/public render mode is display-only. Save operations continue through the local-only guard.

The preview gets “Edit layout”, “Save”, and “Reset” controls. All six visual groups use the same layout helper, including generating/results and the D&D participant roster.

## GUI direction

The UI top-level flow becomes:

1. **Start** – story title/theme/outline, mode selector (Classic or Pen & Paper), start/stop.
2. **Live** – current chapter, generation/voting state, one image toggle, compact voting controls.
3. **Players** – join keyword, active role roster, missed-round indicator, eliminated history.
4. **Voice** – Fish.audio voice, model, emotion mode, TTS enable; provider API secrets are linked to central Settings.
5. **Advanced** – all existing provider, timing, layout, debug, and offline controls.

Cards are collapsible, responsive, keyboard accessible, and localized through the existing namespaced i18n keys. The real overlay preview remains lazy-loaded and becomes the visual editor when edit mode is enabled.

## Verification requirements

Tests are written before production changes for each unit:

- config defaults, legacy migration, central Ollama key priority, masking, and cloud/local authorization;
- image-disabled, text-only, provider failure, and success paths across all chapter-generation branches;
- Fish model-to-marker syntax, emotion validation, TTS request forwarding, and clean display text;
- participant joins, deterministic testable random-role injection, duplicate/rejoin policy, vote attendance, two-round elimination, persistence, and emitted events;
- layout validation, pixel-to-normalized migration, clamping, reset, pointer drag, public-mode write blocking, and all draggable element IDs;
- UI/i18n contract tests for the compact Story Studio controls and D&D roster;
- focused integration tests for start → narration → vote → round resolution → next chapter in classic and pen-and-paper modes.

After implementation, run the focused Interactive Story/TTS Jest suites with the bundled Node runtime, then `npm run lint`, `npm run build:css`, `git diff --check`, and a real browser workflow covering configuration load/save, preview edit/save/reset, story start in image-off mode, `!join`, voting, and elimination. External Ollama/Fish credentials are not assumed by local tests; live provider checks are reported separately.

## Non-goals

- No standalone RPG rules engine, dice simulation, combat math, inventory, or character-sheet system in this increment.
- No replacement of the global LTTH TTS queue or unrelated TTS engine defaults.
- No public Quick Tunnel write surface and no persistence of API keys in plugin directories.
- No PDF/video export implementation; existing roadmap items remain separate.

