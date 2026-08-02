# Interactive Story – Architektur

```text
Studio (ui.html)                         OBS overlay (overlay.html)
  config, session controls                 public story/vote/roster rendering
  local preview/layout controls            local ?edit=1 layout editor only
          |                                              |
          +---------------- REST / Socket.IO ------------+
                                 |
                     InteractiveStoryPlugin (main.js)
          +----------------------+-----------------------+
          |                      |                       |
   StoryEngine / LLM       NarrationDirector       ParticipantRegistry
   provider configuration   clean display text      !join and round state
   chapter lifecycle        Fish cue TTS text       role/absence handling
          |                      |                       |
          +----------------------+-----------------------+
                                 |
                         StoryDatabase (SQLite)
                 sessions, chapters, votes, memory,
                 narration metadata, participants, round claims
```

## Provider and credential boundary

Interactive Story selects the configured LLM provider in `main.js`. The Ollama Cloud default uses the OpenAI-compatible endpoint `https://api.ollama.com/v1` and model `qwen3.5:cloud`.

Ollama Cloud credentials belong to LTTH central settings, not plugin data. `_getOllamaApiKey()` checks `ollama_cloud_api_key`, then `ollama_api_key`, then `tts_ollama_api_key`. Cloud endpoints require a central key; local Ollama endpoints use the local fallback. The config read route masks any configured key and exposes only a boolean/key placeholder, so browser clients never receive the secret.

Provider integration failures are handled as runtime failures. Source-level tests verify routing and masking; they do not establish live provider availability or credential validity.

## Chapter and image lifecycle

1. The Story Engine creates a chapter and choice set.
2. `NarrationDirector` derives clean display content, validated segment metadata, and optional cue-bearing `ttsText`.
3. The prepared chapter is persisted and emitted; display content contains no Fish cue markers.
4. `_maybeGenerateChapterImage()` runs only when `autoGenerateImages` is true and `textOnlyMode` is false. Both provider absence and generation errors resolve non-blockingly with `imagePath: null`.
5. Voting events select the next branch and repeat the lifecycle.

`autoGenerateImages` is false in the default configuration. Image generation is therefore opt-in and never a prerequisite for a chapter.

## Fish.audio narration contract

The Studio persists `fishaudioModel` and `narrationEmotionMode`; defaults are `s2.1-pro` and `auto`. `NarrationDirector` recognizes a fixed allow-list of emotion and delivery labels, strips arbitrary marker text from display content, and emits:

- `(cue)` for Fish S1;
- `[cue]` for Fish S2-family models.

The system TTS call receives the selected Fish model and first validated segment emotion. Narration segments and `ttsText` persist as chapter metadata, with additive database migration/hydration for existing installations.

## Pen-and-paper participation

For a pen-and-paper session, `main.js` snapshots `storyMode`, join keyword, inactivity limit, and role catalog into session metadata. `ParticipantRegistry` creates one participant per session/viewer and returns public snapshots only.

`resolveParticipantRound()` records one resolution claim per `(session, participant, round)` before changing attendance. This makes retries idempotent. A participant who joined the current round is ineligible for its missed-round penalty; a vote resets missed rounds. The default inactivity limit is two consecutive eligible misses, after which the participant becomes eliminated. Active session metadata takes precedence over later global configuration changes.

## Overlay boundary and layout v2

Layout positions are normalized fractions (`version: 2`) stored through `GET/POST /api/interactive-story/overlay-positions`. Legacy pixel positions migrate on read; malformed or out-of-range layout writes are rejected.

`overlay.html?edit=1` enables drag handlers and Save, Reset, and Snap controls only when the page is same-origin and local. The overlay maps title, content, voting, generating, results, and participants to normalized positions. It accepts same-origin layout messages only in edit mode.

Quick Tunnel/public hosts enter render-only mode. They do not register the editor interaction, do not show the editor state, and use `LTTHPublicOverlayRenderMode.postJsonLocalOnly()` so layout writes are skipped before a request is sent.

## Test seams

Focused suites cover the provider config/key masking, optional-image fallback, narration contracts and persistence, participant database/round idempotency, Studio wiring, local preview write guard, and overlay layout normalization. Browser interaction and live external-provider outcomes remain separate integration checks.
