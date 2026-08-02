# Interactive Story Generator

Interactive Story creates a viewer-driven story for LTTH: it generates chapters, shows them in an OBS browser source, opens chat voting, and can optionally narrate the result through the LTTH TTS integration.

## What is enabled by default

- The default LLM route is **Ollama Cloud** at `https://api.ollama.com/v1`, with the default model `qwen3.5:cloud`.
- Chapter images are **off by default**. Enable **Auto-generate Images** only when an image provider and model are intentionally configured. With images off (or in text-only mode), story progression continues with `imagePath: null`.
- Automatic TTS is on by default. The Story Studio defaults to Fish.audio **S2.1 Pro** with automatic narration emotion selection.
- Classic mode is the default. The optional pen-and-paper mode uses `!join` and removes a participant after **two consecutive eligible missed rounds** by default.

No live provider request is made merely by saving configuration. A configured key and an available provider are still required to generate a cloud chapter, image, or audio.

## Setup

1. Enable **Interactive Story** in LTTH.
2. For Ollama Cloud, save the key once in LTTH's central settings. Interactive Story reads the first configured value from `ollama_cloud_api_key`, `ollama_api_key`, or `tts_ollama_api_key`; it does not persist a second cloud key in its plugin configuration.
3. Open **Plugins & Tools → Interactive Story** and select the provider, model, language, voting duration, and optional image/TTS settings.
4. Save the configuration. The configuration API masks configured credentials as `***configured***`.
5. Add the browser source below to OBS.

```text
http://localhost:3000/plugins/interactive-story/overlay.html
```

Use a normal local OBS URL for production. A public Quick Tunnel overlay is intentionally render-only.

## Story Studio

The Story Studio controls both classic and pen-and-paper sessions.

- **Classic:** viewers vote with `!a`, `!b`, `!c`, and further configured letters.
- **Pen-and-paper:** choose the mode before starting, then set the join keyword (default `!join`) and inactivity limit (default two rounds). A viewer joins once, receives one of the Warrior, Mage, Rogue, Healer, Ranger, or Bard roles, and is not penalized for the round in which they joined. Voting in an eligible round resets the missed-round count; two consecutive eligible misses eliminate the participant at the default limit.
- Session mode, join keyword, inactivity limit, and role catalog are stored with the session. Later global setting changes do not rewrite an active session.

The roster in the Studio and the status API expose only public participant fields: name, role, joined round, missed-round count, and active/eliminated status.

## Fish.audio narration cues

Interactive Story keeps reader-facing chapter text clean and prepares a separate TTS text for narration. The `NarrationDirector` accepts supported emotion/delivery metadata and falls back safely to neutral narration when metadata is missing or invalid.

- **S1:** cues use parentheses, for example `(happy) The gate opens.`
- **S2.1 Pro:** cues use brackets, for example `[happy] The gate opens.`
- The Studio exposes the Fish.audio model (`s1` or `s2.1-pro`) and narration-emotion selector (`auto`, `calm`, or `dramatic`).
- Supported emotions include `happy`, `sad`, `angry`, `excited`, `calm`, `scared`, and `determined`; supported delivery cues include `shouting`, `whispering`, `laughing`, `sobbing`, `break`, and `long-break`.

Cue markers are removed from the displayed and persisted chapter content. The prepared `ttsText` and validated narration segments are retained separately for playback and history.

## Overlay layout editor

Open the local overlay with `?edit=1` to enter layout-edit mode:

```text
http://localhost:3000/plugins/interactive-story/overlay.html?edit=1
```

Drag title, chapter content, voting, generating, results, and participant elements. The editor offers **Save**, **Reset**, and **Snap** controls. Positions are stored as normalized v2 coordinates, so they scale with the OBS viewport; old pixel layouts are migrated on read.

Edit mode only works on a same-origin local overlay. It is disabled on public Quick Tunnel hosts: there is no editor banner or drag listener, and save/reset POSTs are skipped by the local-only client guard.

## Main routes and events

```text
GET/POST /api/interactive-story/config
GET      /api/interactive-story/status
GET      /api/interactive-story/participants
POST     /api/interactive-story/start
POST     /api/interactive-story/next-chapter
POST     /api/interactive-story/end
GET/POST /api/interactive-story/overlay-positions
```

The overlay receives lifecycle and voting Socket.IO events such as `story:chapter-ready`, `story:voting-started`, `story:vote-update`, `story:voting-ended`, and `story:dnd-participants-updated`.

## Troubleshooting

- **Ollama Cloud reports a missing key:** configure one of the central Ollama key settings above; the plugin UI deliberately masks, rather than returns, the key.
- **No image appears:** this is expected while Auto-generate Images is off, in text-only mode, or when the optional provider fails. Story generation is non-blocking in all three cases.
- **A participant was eliminated:** check that the session is in pen-and-paper mode and that the viewer missed the configured number of eligible consecutive rounds. A vote resets the count.
- **Layout cannot be saved:** open the local `?edit=1` overlay, not a public Quick Tunnel URL.

## Development verification

The focused Jest suites cover provider/key masking, optional images, Fish emotion/model request overrides, narration persistence, participant rounds, local preview guards, and overlay layout validation. They do not prove that an external cloud provider is currently reachable or accepts a particular credential.
